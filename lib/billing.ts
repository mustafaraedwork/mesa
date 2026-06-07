// Owner billing — pure helpers (no DB, no React). Shared by the restaurant
// list, the billing tab, and owner analytics. Model C (hybrid): a single
// `payments` ledger; renewal/overdue are DERIVED here at read time from each
// restaurant's payments — there is no cron and no subscriptions table.

export type PaymentKind = 'initial' | 'renewal' | 'adjustment';

// A normalized payment row. NUMERIC(12,2) comes back from PostgREST as a
// string, so the DB loader must coerce `amount` to a number before building
// this — every helper below assumes `amount: number`.
export type PaymentRow = {
  id: string;
  restaurant_id: string;
  kind: PaymentKind;
  amount: number;
  currency: string;
  paid_at: string; // ISO
  period_start: string | null;
  period_end: string | null;
  note: string | null;
  created_at: string;
};

export const PAYMENT_KINDS: readonly PaymentKind[] = ['initial', 'renewal', 'adjustment'];

export const PAYMENT_KIND_LABEL: Record<PaymentKind, string> = {
  initial: 'تأسيس',
  renewal: 'تجديد',
  adjustment: 'تسوية',
};

// The single typed funnel from the untyped service client to PaymentRow:
// coerces NUMERIC(12,2) (PostgREST returns it as a STRING) to a number and
// narrows kind — in ONE place, so a loader can't silently forget the Number()
// coercion and leak a string into the money arithmetic.
export function paymentRowFromDb(p: {
  id: string;
  restaurant_id: string;
  kind: string;
  amount: string | number;
  currency: string;
  paid_at: string;
  period_start: string | null;
  period_end: string | null;
  note: string | null;
  created_at: string;
}): PaymentRow {
  return {
    id: p.id,
    restaurant_id: p.restaurant_id,
    kind: p.kind as PaymentKind,
    amount: Number(p.amount),
    currency: p.currency,
    paid_at: p.paid_at,
    period_start: p.period_start,
    period_end: p.period_end,
    note: p.note,
    created_at: p.created_at,
  };
}

// A renewal within this many days reads as "due soon" rather than "active".
export const RENEWAL_SOON_DAYS = 30;
const DAY_MS = 86_400_000;

// Baghdad is UTC+3 with no DST (matches the diner analytics convention). Month
// buckets are Baghdad-local so a payment near midnight lands in the right month.
export const BAGHDAD_OFFSET_MS = 3 * 60 * 60 * 1000;

// 'YYYY-MM' Baghdad-local month key for an ISO timestamp.
export function monthKey(iso: string, offsetMs: number = BAGHDAD_OFFSET_MS): string {
  return new Date(new Date(iso).getTime() + offsetMs).toISOString().slice(0, 7);
}

// 'YYYY-MM-DD' Baghdad-local date. The single date formatter for the owner panel
// so display + renewal math share one timezone convention (period_end is a
// TIMESTAMPTZ stored at UTC-midnight; rendering its raw UTC date would be off by
// one near local midnight).
export function bagDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(new Date(iso).getTime() + BAGHDAD_OFFSET_MS).toISOString().slice(0, 10);
}

// Whole Baghdad-calendar days from `fromMs` to `toMs` (date-granular). So a
// renewal flips to overdue at Baghdad midnight, not at 03:00 local.
function bagDayDiff(fromMs: number, toMs: number): number {
  const day = (ms: number) => Date.parse(new Date(ms + BAGHDAD_OFFSET_MS).toISOString().slice(0, 10) + 'T00:00:00Z');
  return Math.round((day(toMs) - day(fromMs)) / DAY_MS);
}

export type BillingStatus = 'none' | 'active' | 'due-soon' | 'overdue';

export const BILLING_STATUS_META: Record<
  BillingStatus,
  { label: string; variant: 'neutral' | 'success' | 'warning' | 'destructive' }
> = {
  none: { label: 'بلا تجديد', variant: 'neutral' },
  active: { label: 'سارٍ', variant: 'success' },
  'due-soon': { label: 'تجديد قريب', variant: 'warning' },
  overdue: { label: 'متأخّر', variant: 'destructive' },
};

export type RestaurantBilling = {
  status: BillingStatus;
  lastPaidAt: string | null; // max(paid_at)
  currentPeriodEnd: string | null; // max(period_end) — how far the licence runs
  daysToRenewal: number | null; // >0 future, ≤0 overdue, null when no period
  nextRenewalAmount: number | null; // amount of the payment that set currentPeriodEnd
  nextRenewalCurrency: string | null;
  totalsByCurrency: { currency: string; total: number }[];
  paymentCount: number;
};

// Derive a restaurant's billing state from its payments. `nowMs` is injected so
// callers (server components) control the clock and stay deterministic.
export function deriveBilling(payments: PaymentRow[], nowMs: number): RestaurantBilling {
  let lastPaidAt: string | null = null;
  let currentPeriodEnd: string | null = null;
  let nextRenewalAmount: number | null = null;
  let nextRenewalCurrency: string | null = null;
  const totals = new Map<string, number>();

  for (const p of payments) {
    if (!lastPaidAt || p.paid_at > lastPaidAt) lastPaidAt = p.paid_at;
    if (p.period_end && (!currentPeriodEnd || p.period_end > currentPeriodEnd)) {
      currentPeriodEnd = p.period_end;
      nextRenewalAmount = p.amount;
      nextRenewalCurrency = p.currency;
    }
    totals.set(p.currency, (totals.get(p.currency) ?? 0) + p.amount);
  }

  let status: BillingStatus = 'none';
  let daysToRenewal: number | null = null;
  if (currentPeriodEnd) {
    daysToRenewal = bagDayDiff(nowMs, new Date(currentPeriodEnd).getTime());
    if (daysToRenewal < 0) status = 'overdue';
    else if (daysToRenewal <= RENEWAL_SOON_DAYS) status = 'due-soon';
    else status = 'active';
  }

  return {
    status,
    lastPaidAt,
    currentPeriodEnd,
    daysToRenewal,
    nextRenewalAmount,
    nextRenewalCurrency,
    totalsByCurrency: [...totals.entries()]
      .map(([currency, total]) => ({ currency, total }))
      .sort((a, b) => b.total - a.total),
    paymentCount: payments.length,
  };
}

// Group a flat payment list by restaurant_id → that restaurant's billing.
export function billingByRestaurant(
  payments: PaymentRow[],
  nowMs: number,
): Map<string, RestaurantBilling> {
  const byRest = new Map<string, PaymentRow[]>();
  for (const p of payments) {
    const list = byRest.get(p.restaurant_id);
    if (list) list.push(p);
    else byRest.set(p.restaurant_id, [p]);
  }
  const out = new Map<string, RestaurantBilling>();
  for (const [id, list] of byRest) out.set(id, deriveBilling(list, nowMs));
  return out;
}

// ── formatting ──────────────────────────────────────────────────────────
// Thousands-separated amount, up to 2 decimals, trailing .00 dropped. Latin
// digits + LTR are intentional for money even inside the RTL panel.
export function formatAmount(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return rounded.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// Amount + currency code, e.g. "800,000 IQD". The code (not the Arabic label)
// keeps it compact and unambiguous across all 18 currencies.
export function formatMoney(amount: number, currency: string): string {
  return `${formatAmount(amount)} ${currency}`;
}

// ── aggregations (billing tab + analytics) ────────────────────────────────
export type CurrencyTotal = { currency: string; total: number; count: number };

// Sum a payment list per currency. No FX — each currency stands alone (the
// owner-chosen reporting model). IQD first, then by total desc.
export function aggregateByCurrency(payments: PaymentRow[]): CurrencyTotal[] {
  const m = new Map<string, { total: number; count: number }>();
  for (const p of payments) {
    const cur = m.get(p.currency) ?? { total: 0, count: 0 };
    cur.total += p.amount;
    cur.count += 1;
    m.set(p.currency, cur);
  }
  return [...m.entries()]
    .map(([currency, v]) => ({ currency, ...v }))
    .sort((a, b) => (a.currency === 'IQD' ? -1 : b.currency === 'IQD' ? 1 : b.total - a.total));
}
