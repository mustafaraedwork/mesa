// Closing Mode pure utilities + constants. Source: .scratch/closing-mode/design-decisions.md.
//
// All discounted prices are derived at read time (Q1). The DB never stores
// `original_price` snapshots, only the canonical `products.price` and a
// boolean `is_in_closing_mode` flag. Reverting Closing is therefore O(1):
// clear three columns on `restaurants` + flip the flag on products.

import type { SupabaseClient } from '@supabase/supabase-js';

export type Mode = 'normal' | 'closing' | 'off';
export type Discount = 5 | 10 | 20;

export const MODES = ['normal', 'closing', 'off'] as const;
export const DISCOUNTS = [5, 10, 20] as const;

// Coerce a raw active_mode (which may still be a legacy 'rush'/'profit' from
// before migration 0004) to a live mode. Shared by the menu loader and the
// admin state route so the coercion lives in one place (Q-12).
export function coerceMode(raw: string): Mode {
  return raw === 'closing' || raw === 'off' ? raw : 'normal';
}

export const CLOSING_VIRTUAL_CATEGORY_ID = '__closing__';
// Diner-facing label — keeps the "current mode" generic so customers don't
// see the word "closing". Discount overlays on the cards still show the
// actual deal visually.
export const CLOSING_VIRTUAL_CATEGORY_NAMES = {
  name_ar: 'اختيارات الشيف',
  name_en: "Chef's Picks",
  name_ku: 'هەڵبژاردنی شێف',
} as const;

// IQD-only rounding step. Floor to nearest 250 ensures effective discount
// is never less than the advertised percentage (Q2 — example: 3,500 × 0.9 =
// 3,150 → display 3,000 IQD, effective 14.3% off, exceeds 10% promise).
const IQD_ROUNDING_STEP = 250;

export function roundDiscountedPriceIQD(price: number, discountPct: Discount): number {
  const raw = price * (1 - discountPct / 100);
  return Math.floor(raw / IQD_ROUNDING_STEP) * IQD_ROUNDING_STEP;
}

// Currency-aware discount application. Per Q2: only IQD has a rounding step
// for MVP. Add other currency steps to ROUNDING_STEPS only when a non-IQD
// tenant signs up — speculation is forbidden.
const ROUNDING_STEPS: Partial<Record<string, number>> = {
  IQD: IQD_ROUNDING_STEP,
};

export function applyDiscount(price: number, discountPct: Discount, currency: string): number {
  const step = ROUNDING_STEPS[currency];
  const raw = price * (1 - discountPct / 100);
  if (step) return Math.floor(raw / step) * step;
  return Math.floor(raw);
}

// Lazy revert of an expired Closing window. Prefers the atomic
// `revert_closing_mode()` RPC (migration 0008); if that isn't applied yet (or
// errors transiently), falls back to the two-statement revert so the app works
// either way (H-3 atomicity + Q-9 de-duplication). Both UPDATEs are idempotent,
// so a fallback after a partial RPC failure is harmless. Shared by `loadMenu`
// and GET /api/admin/state.
export async function applyLazyRevert(sb: SupabaseClient, restaurantId: string): Promise<void> {
  const { error } = await sb.rpc('revert_closing_mode', { p_restaurant_id: restaurantId });
  if (!error) return;

  await sb
    .from('restaurants')
    .update({ active_mode: 'normal', closing_mode_ends_at: null, closing_mode_discount: null })
    .eq('id', restaurantId)
    .eq('active_mode', 'closing');
  await sb
    .from('products')
    .update({ is_in_closing_mode: false })
    .eq('restaurant_id', restaurantId)
    .eq('is_in_closing_mode', true);
}
