'use server';

import { revalidatePath } from 'next/cache';
import { getServiceClient } from '@/lib/supabase/server';
import { requireOwner } from '@/lib/auth/require-owner';
import { isSupportedCurrency } from '@/lib/currencies';
import { PAYMENT_KINDS, type PaymentKind } from '@/lib/billing';

const BILLING_PATH = '/owner/dashboard/billing';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AMOUNT_MAX = 9_999_999_999.99; // NUMERIC(12,2) ceiling
const NOTE_MAX = 200;

type ActionResult = { ok: true } | { ok: false; error: string };

const badDate = (iso: string) => Number.isNaN(new Date(iso).getTime());

export async function recordPayment(input: {
  restaurant_id: string;
  kind: PaymentKind;
  amount: number;
  currency: string;
  paid_at: string;
  period_start?: string | null;
  period_end?: string | null;
  note?: string | null;
}): Promise<ActionResult> {
  const ownerId = await requireOwner();

  if (!UUID_RE.test(input.restaurant_id)) return { ok: false, error: 'معرّف مطعم غير صالح' };
  if (!PAYMENT_KINDS.includes(input.kind)) return { ok: false, error: 'نوع الدفعة غير صالح' };
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { ok: false, error: 'المبلغ يجب أن يكون أكبر من صفر' };
  if (input.amount > AMOUNT_MAX) return { ok: false, error: 'المبلغ كبير جداً' };
  if (!isSupportedCurrency(input.currency)) return { ok: false, error: 'عملة غير مدعومة' };
  if (!input.paid_at || badDate(input.paid_at)) return { ok: false, error: 'تاريخ الدفع غير صالح' };

  const period_start = input.period_start?.trim() || null;
  const period_end = input.period_end?.trim() || null;
  if (period_start && badDate(period_start)) return { ok: false, error: 'تاريخ بداية الفترة غير صالح' };
  if (period_end && badDate(period_end)) return { ok: false, error: 'تاريخ نهاية الفترة غير صالح' };
  const startRef = period_start ?? input.paid_at;
  if (period_end && new Date(period_end).getTime() <= new Date(startRef).getTime()) {
    return { ok: false, error: 'نهاية الفترة يجب أن تكون بعد بدايتها' };
  }

  const note = input.note?.trim() || null;
  if (note && note.length > NOTE_MAX) return { ok: false, error: 'الملاحظة طويلة جداً' };

  const sb = getServiceClient();
  const { error } = await sb.from('payments').insert({
    restaurant_id: input.restaurant_id,
    kind: input.kind,
    amount: input.amount,
    currency: input.currency,
    paid_at: input.paid_at,
    period_start,
    period_end,
    note,
    recorded_by: ownerId,
  });

  if (error) {
    if (error.code === '23503') return { ok: false, error: 'المطعم غير موجود' };
    return { ok: false, error: 'فشل تسجيل الدفعة' };
  }

  revalidatePath(BILLING_PATH);
  revalidatePath('/owner/dashboard');
  revalidatePath(`/owner/dashboard/accounts/${input.restaurant_id}`);
  return { ok: true };
}

// Remove a mistaken payment row. Owner-only, hard delete (a ledger correction).
export async function deletePayment(id: string): Promise<ActionResult> {
  await requireOwner();
  if (!UUID_RE.test(id)) return { ok: false, error: 'معرّف غير صالح' };
  const sb = getServiceClient();
  const { error } = await sb.from('payments').delete().eq('id', id);
  if (error) return { ok: false, error: 'فشل حذف الدفعة' };
  revalidatePath(BILLING_PATH);
  revalidatePath('/owner/dashboard');
  return { ok: true };
}
