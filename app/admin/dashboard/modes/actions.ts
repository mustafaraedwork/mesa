'use server';

import { revalidatePath } from 'next/cache';
import { requireTenant } from '@/lib/auth/require-tenant';
import { getServiceClient } from '@/lib/supabase/server';
import { applyDiscount, DISCOUNTS, MODES, type Discount } from '@/lib/closing';

const MODES_PATH = '/admin/dashboard/modes';
const MS_PER_HOUR = 3_600_000;

type SetModeInput =
  | { mode: 'normal' | 'off' }
  | {
      mode: 'closing';
      closing: { product_ids: string[]; discount: Discount; duration_hours: number };
    };

type SetModeResult =
  | { ok: true; warnings?: string[] }
  | { ok: false; error: string; offending_ids?: string[] };

// Unified mode-transition endpoint per Q6 — clean-and-apply in one transaction.
// Covers normal/off (trivial branches) and closing (validated + activated). No
// partial-extend; re-activating Closing fully replaces.
export async function setMode(input: SetModeInput): Promise<SetModeResult> {
  if (!MODES.includes(input.mode)) {
    return { ok: false, error: 'وضع غير معروف' };
  }

  const { restaurantId, currency } = await requireTenant();
  const sb = getServiceClient();

  // ── Closing branch validation (Q8) — done BEFORE any DB writes ─────────
  let warnings: string[] | undefined;
  let endsAt: string | null = null;
  let discount: Discount | null = null;
  let closingProductIds: string[] = [];

  if (input.mode === 'closing') {
    const { product_ids, discount: d, duration_hours } = input.closing;

    if (!Array.isArray(product_ids) || product_ids.length === 0) {
      return { ok: false, error: 'اختر منتجاً واحداً على الأقل' };
    }
    if (!DISCOUNTS.includes(d as Discount)) {
      return { ok: false, error: 'الخصم يجب أن يكون 5 أو 10 أو 20' };
    }
    if (!Number.isInteger(duration_hours) || duration_hours < 1 || duration_hours > 24) {
      return { ok: false, error: 'المدة يجب أن تكون بين ١ و ٢٤ ساعة' };
    }

    // Fetch the products in one go and verify ownership.
    const { data: prods } = await sb
      .from('products')
      .select('id, name_ar, price, is_available, restaurant_id')
      .in('id', product_ids);

    if (!prods || prods.length !== product_ids.length) {
      return { ok: false, error: 'منتج واحد أو أكثر غير موجود' };
    }
    for (const p of prods) {
      if (p.restaurant_id !== restaurantId) {
        return { ok: false, error: 'منتج لا يخصّ هذا الحساب' };
      }
    }

    // Reject products whose discounted price would round to 0. (currency comes
    // from requireTenant() — Q-22, no extra round-trip.)
    const offending = prods.filter((p) => applyDiscount(Number(p.price), d as Discount, currency) <= 0);
    if (offending.length > 0) {
      const names = offending.map((p) => p.name_ar).join('، ');
      return {
        ok: false,
        error: `هذه المنتجات سعرها صغير جداً للخصم المختار: ${names}`,
        offending_ids: offending.map((p) => p.id),
      };
    }

    // Unavailable products are accepted with a non-blocking warning.
    const unavailableCount = prods.filter((p) => p.is_available === false).length;
    if (unavailableCount > 0) {
      warnings = [`selected_unavailable_count: ${unavailableCount}`];
    }

    discount = d as Discount;
    closingProductIds = product_ids;
    // Server-computes `ends_at` per Q12 (`NOW() + INTERVAL`). Retry on
    // transient failure could extend by a few seconds — accepted MVP risk.
    endsAt = new Date(Date.now() + duration_hours * MS_PER_HOUR).toISOString();
  }

  // ── Clean-and-apply (Q6) ───────────────────────────────────────────────
  // Step 1: clear closing state on the restaurant + the flag on every product.
  const { error: clearRestErr } = await sb
    .from('restaurants')
    .update({
      active_mode: input.mode,
      closing_mode_ends_at: endsAt,
      closing_mode_discount: discount,
    })
    .eq('id', restaurantId);
  if (clearRestErr) return { ok: false, error: 'فشل تحديث وضع الحساب' };

  // Step 2: clear all is_in_closing_mode flags. Even if the new mode is also
  // closing, we wipe first then set the new selection — matches Q6 contract.
  const { error: clearProdErr } = await sb
    .from('products')
    .update({ is_in_closing_mode: false })
    .eq('restaurant_id', restaurantId)
    .eq('is_in_closing_mode', true);
  if (clearProdErr) return { ok: false, error: 'فشل تحديث المنتجات' };

  // Step 3: if closing, apply the new selection.
  if (input.mode === 'closing') {
    const { error: setProdErr } = await sb
      .from('products')
      .update({ is_in_closing_mode: true })
      .in('id', closingProductIds)
      .eq('restaurant_id', restaurantId);
    if (setProdErr) return { ok: false, error: 'فشل تطبيق وضع الإغلاق على المنتجات' };
  }

  revalidatePath(MODES_PATH);
  revalidatePath('/admin/dashboard/menu');
  return warnings ? { ok: true, warnings } : { ok: true };
}

// Curated Chef's Picks for Normal mode (clean-and-apply). Independent of the
// active mode — the diner only surfaces these while in Normal mode. An empty
// selection is valid and simply hides the section.
export async function setChefPicks(
  productIds: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { restaurantId } = await requireTenant();
  const sb = getServiceClient();

  if (productIds.length > 0) {
    const { data: prods } = await sb
      .from('products')
      .select('id, restaurant_id')
      .in('id', productIds);
    if (!prods || prods.length !== productIds.length) {
      return { ok: false, error: 'منتج واحد أو أكثر غير موجود' };
    }
    if (prods.some((p) => p.restaurant_id !== restaurantId)) {
      return { ok: false, error: 'منتج لا يخصّ هذا الحساب' };
    }
  }

  const { error: clearErr } = await sb
    .from('products')
    .update({ is_chef_pick: false })
    .eq('restaurant_id', restaurantId)
    .eq('is_chef_pick', true);
  if (clearErr) return { ok: false, error: 'فشل تحديث اختيارات الشيف' };

  if (productIds.length > 0) {
    const { error: setErr } = await sb
      .from('products')
      .update({ is_chef_pick: true })
      .in('id', productIds)
      .eq('restaurant_id', restaurantId);
    if (setErr) return { ok: false, error: 'فشل حفظ اختيارات الشيف' };
  }

  revalidatePath(MODES_PATH);
  revalidatePath('/admin/dashboard/menu');
  return { ok: true };
}
