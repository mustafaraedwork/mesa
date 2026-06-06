'use server';

import { revalidatePath } from 'next/cache';
import { getServiceClient } from '@/lib/supabase/server';
import { hashPassword } from '@/lib/auth/password';
import { deleteRestaurantImages } from '@/lib/r2/upload';
import { requireOwner } from '@/lib/auth/require-owner';
import { isSupportedCurrency } from '@/lib/currencies';

const ACCOUNTS_PATH = '/owner/dashboard/accounts';
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,32}$/;
// M-8: validate the restaurant id at the function boundary before it hits the DB.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PLAN_MAX = 40;
const BRANCH_MAX = 999;
const AMOUNT_MAX = 9_999_999_999.99; // NUMERIC(12,2) ceiling

type ActionResult = { ok: true } | { ok: false; error: string };

// Optional initial ("تأسيس") payment captured at provisioning time.
type InitialPayment = {
  amount: number;
  currency: string;
  paid_at: string; // ISO (date)
  period_end?: string | null; // optional licence-window end
};

// Validate an amount as a positive money value within NUMERIC(12,2).
function badAmount(amount: number): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return 'المبلغ يجب أن يكون أكبر من صفر';
  if (amount > AMOUNT_MAX) return 'المبلغ كبير جداً';
  return null;
}

function badDate(iso: string): boolean {
  return Number.isNaN(new Date(iso).getTime());
}

export async function createAccount(input: {
  display_name: string;
  slug: string;
  username: string;
  password: string;
  currency?: string;
  plan?: string | null;
  branch_count?: number;
  initialPayment?: InitialPayment | null;
}): Promise<ActionResult> {
  const ownerId = await requireOwner();
  const display_name = input.display_name.trim();
  const slug = input.slug.trim().toLowerCase();
  const username = input.username.trim();
  const password = input.password;
  const currency = (input.currency ?? 'IQD').trim();
  const plan = input.plan?.trim() || null;
  const branch_count = input.branch_count ?? 1;

  if (!display_name) return { ok: false, error: 'اسم المطعم مطلوب' };
  if (!SLUG_RE.test(slug)) return { ok: false, error: 'الـslug يحتوي حروف صغيرة وأرقام وشرطات فقط' };
  if (!USERNAME_RE.test(username)) return { ok: false, error: 'اسم المستخدم: 3-32 حرف من a-z A-Z 0-9 . _ -' };
  if (password.length < 8) return { ok: false, error: 'كلمة السر ٨ أحرف على الأقل' };
  if (!isSupportedCurrency(currency)) return { ok: false, error: 'عملة غير مدعومة' };
  if (!Number.isInteger(branch_count) || branch_count < 1 || branch_count > BRANCH_MAX) {
    return { ok: false, error: 'عدد الفروع يجب أن يكون رقماً صحيحاً ≥ ١' };
  }
  if (plan && plan.length > PLAN_MAX) return { ok: false, error: 'اسم الخطة طويل جداً' };

  // Validate the optional initial payment up front so we never create a
  // restaurant only to reject it on the payment.
  const ip = input.initialPayment ?? null;
  if (ip) {
    const amtErr = badAmount(ip.amount);
    if (amtErr) return { ok: false, error: amtErr };
    if (!isSupportedCurrency(ip.currency)) return { ok: false, error: 'عملة الدفعة غير مدعومة' };
    if (!ip.paid_at || badDate(ip.paid_at)) return { ok: false, error: 'تاريخ الدفعة غير صالح' };
    if (ip.period_end && badDate(ip.period_end)) return { ok: false, error: 'تاريخ نهاية الفترة غير صالح' };
    if (ip.period_end && new Date(ip.period_end).getTime() <= new Date(ip.paid_at).getTime()) {
      return { ok: false, error: 'نهاية الفترة يجب أن تكون بعد تاريخ الدفع' };
    }
  }

  const password_hash = await hashPassword(password);
  const sb = getServiceClient();

  const { data: created, error } = await sb
    .from('restaurants')
    .insert({ display_name, slug, username, password_hash, currency, plan, branch_count, is_active: true })
    .select('id')
    .single();

  if (error || !created) {
    if (error?.code === '23505') {
      const dup = error.message.includes('slug') ? 'الـslug' : 'اسم المستخدم';
      return { ok: false, error: `${dup} مستخدم بالفعل` };
    }
    return { ok: false, error: 'فشل إنشاء الحساب' };
  }

  // Record the initial payment atomically: if it fails, compensate by deleting
  // the just-created restaurant so we never leave an unpaid orphan (no DB
  // transaction across two PostgREST calls, so this is the safe substitute).
  if (ip) {
    const { error: payErr } = await sb.from('payments').insert({
      restaurant_id: created.id,
      kind: 'initial',
      amount: ip.amount,
      currency: ip.currency,
      paid_at: ip.paid_at,
      period_end: ip.period_end ?? null,
      recorded_by: ownerId,
    });
    if (payErr) {
      await sb.from('restaurants').delete().eq('id', created.id);
      return { ok: false, error: 'تعذّر تسجيل دفعة التأسيس — أُلغي إنشاء الحساب' };
    }
  }

  revalidatePath(ACCOUNTS_PATH);
  revalidatePath('/owner/dashboard');
  return { ok: true };
}

// Edit any subset of a restaurant's owner-editable fields.
export async function updateRestaurant(
  id: string,
  fields: {
    display_name?: string;
    slug?: string;
    username?: string;
    currency?: string;
    plan?: string | null;
    branch_count?: number;
  },
): Promise<ActionResult> {
  await requireOwner();
  if (!UUID_RE.test(id)) return { ok: false, error: 'معرّف غير صالح' };

  const patch: Record<string, unknown> = {};

  if (fields.display_name !== undefined) {
    const v = fields.display_name.trim();
    if (!v) return { ok: false, error: 'اسم المطعم مطلوب' };
    patch.display_name = v;
  }
  if (fields.slug !== undefined) {
    const v = fields.slug.trim().toLowerCase();
    if (!SLUG_RE.test(v)) return { ok: false, error: 'الـslug يحتوي حروف صغيرة وأرقام وشرطات فقط' };
    patch.slug = v;
  }
  if (fields.username !== undefined) {
    const v = fields.username.trim();
    if (!USERNAME_RE.test(v)) return { ok: false, error: 'اسم المستخدم: 3-32 حرف من a-z A-Z 0-9 . _ -' };
    patch.username = v;
  }
  if (fields.currency !== undefined) {
    if (!isSupportedCurrency(fields.currency)) return { ok: false, error: 'عملة غير مدعومة' };
    patch.currency = fields.currency;
  }
  if (fields.plan !== undefined) {
    const v = fields.plan?.trim() || null;
    if (v && v.length > PLAN_MAX) return { ok: false, error: 'اسم الخطة طويل جداً' };
    patch.plan = v;
  }
  if (fields.branch_count !== undefined) {
    const v = fields.branch_count;
    if (!Number.isInteger(v) || v < 1 || v > BRANCH_MAX) {
      return { ok: false, error: 'عدد الفروع يجب أن يكون رقماً صحيحاً ≥ ١' };
    }
    patch.branch_count = v;
  }

  if (Object.keys(patch).length === 0) return { ok: true };

  const sb = getServiceClient();
  const { error } = await sb.from('restaurants').update(patch).eq('id', id);
  if (error) {
    if (error.code === '23505') {
      const dup = error.message.includes('slug') ? 'الـslug' : 'اسم المستخدم';
      return { ok: false, error: `${dup} مستخدم بالفعل` };
    }
    return { ok: false, error: 'فشل تحديث البيانات' };
  }

  revalidatePath(ACCOUNTS_PATH);
  revalidatePath(`${ACCOUNTS_PATH}/${id}`);
  revalidatePath('/owner/dashboard');
  return { ok: true };
}

export async function setAccountActive(id: string, is_active: boolean): Promise<ActionResult> {
  await requireOwner();
  if (!UUID_RE.test(id)) return { ok: false, error: 'معرّف غير صالح' };
  const sb = getServiceClient();
  const { error } = await sb.from('restaurants').update({ is_active }).eq('id', id);
  if (error) return { ok: false, error: 'فشل تحديث الحالة' };
  revalidatePath(ACCOUNTS_PATH);
  revalidatePath('/owner/dashboard');
  return { ok: true };
}

// Soft-delete: hide everywhere (diner, tenant login, public reads) but keep the
// row + images so it can be restored. The default "delete" in the owner UI.
export async function softDeleteAccount(id: string): Promise<ActionResult> {
  await requireOwner();
  if (!UUID_RE.test(id)) return { ok: false, error: 'معرّف غير صالح' };
  const sb = getServiceClient();
  const { error } = await sb
    .from('restaurants')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false, error: 'فشل الحذف' };
  // Revoke active tenant sessions so a logged-in tenant is locked out at once.
  await sb.from('tenant_sessions').delete().eq('restaurant_id', id);
  revalidatePath(ACCOUNTS_PATH);
  revalidatePath('/owner/dashboard');
  return { ok: true };
}

export async function restoreAccount(id: string): Promise<ActionResult> {
  await requireOwner();
  if (!UUID_RE.test(id)) return { ok: false, error: 'معرّف غير صالح' };
  const sb = getServiceClient();
  const { error } = await sb.from('restaurants').update({ deleted_at: null }).eq('id', id);
  if (error) return { ok: false, error: 'فشل الاستعادة' };
  revalidatePath(ACCOUNTS_PATH);
  revalidatePath('/owner/dashboard');
  return { ok: true };
}

export async function changeAccountPassword(id: string, newPassword: string): Promise<ActionResult> {
  await requireOwner();
  if (!UUID_RE.test(id)) return { ok: false, error: 'معرّف غير صالح' };
  if (newPassword.length < 8) return { ok: false, error: 'كلمة السر ٨ أحرف على الأقل' };
  const password_hash = await hashPassword(newPassword);
  const sb = getServiceClient();

  // Update password and revoke every existing tenant session to force re-login.
  const { error: updErr } = await sb.from('restaurants').update({ password_hash }).eq('id', id);
  if (updErr) return { ok: false, error: 'فشل تغيير كلمة السر' };
  const { error: revokeErr } = await sb.from('tenant_sessions').delete().eq('restaurant_id', id);
  if (revokeErr) {
    console.error('[accounts] session revoke after password change failed:', revokeErr.message);
    return {
      ok: false,
      error: 'تم تغيير كلمة السر، لكن تعذّر إنهاء الجلسات القديمة. أعد المحاولة لإنهائها.',
    };
  }

  revalidatePath(ACCOUNTS_PATH);
  return { ok: true };
}

// Hard delete — permanent. Purges R2 images, then deletes the row (cascades to
// categories, products, complementary_categories, tenant_sessions, payments).
// A separate, explicit action from soft-delete (OWNER-PANEL-PLAN.md §أ).
export async function deleteAccount(id: string): Promise<ActionResult> {
  await requireOwner();
  if (!UUID_RE.test(id)) return { ok: false, error: 'معرّف غير صالح' };
  const sb = getServiceClient();

  // 1. Purge R2 images (DB cascade can't reach external storage).
  try {
    await deleteRestaurantImages(id);
  } catch {
    return { ok: false, error: 'تعذّر حذف الصور من R2 — تم إلغاء العملية' };
  }

  // 2. Delete the restaurant row — cascades via FKs.
  const { error } = await sb.from('restaurants').delete().eq('id', id);
  if (error) return { ok: false, error: 'فشل حذف الحساب من قاعدة البيانات' };

  revalidatePath(ACCOUNTS_PATH);
  revalidatePath('/owner/dashboard');
  return { ok: true };
}
