import { getServiceClient } from '@/lib/supabase/server';
import { requireOwner } from '@/lib/auth/require-owner';
import {
  aggregateByCurrency,
  billingByRestaurant,
  paymentRowFromDb,
  type PaymentRow,
  type BillingStatus,
} from '@/lib/billing';
import { BillingView, type LedgerRow, type RenewalRow } from './billing-view';
import type { BillingRestaurant } from './record-payment-dialog';

export const dynamic = 'force-dynamic';

async function loadBilling() {
  await requireOwner();
  const sb = getServiceClient();
  // eslint-disable-next-line react-hooks/purity -- server component: one clock read per request
  const now = Date.now();

  const [paymentsRes, restRes] = await Promise.all([
    sb
      .from('payments')
      .select('id, restaurant_id, kind, amount, currency, paid_at, period_start, period_end, note, created_at')
      .order('paid_at', { ascending: false }),
    sb
      .from('restaurants')
      .select('id, display_name, currency, deleted_at')
      .order('display_name', { ascending: true }),
  ]);

  const restaurants = restRes.data ?? [];
  const nameMap = new Map<string, string>(restaurants.map((r) => [r.id, r.display_name]));

  const payments: PaymentRow[] = (paymentsRes.data ?? []).map(paymentRowFromDb);

  const ledger: LedgerRow[] = payments.map((p) => ({
    id: p.id,
    restaurant_id: p.restaurant_id,
    restaurant_name: nameMap.get(p.restaurant_id) ?? '—',
    kind: p.kind,
    amount: p.amount,
    currency: p.currency,
    paid_at: p.paid_at,
    period_end: p.period_end,
    note: p.note,
  }));

  const totals = aggregateByCurrency(payments);

  // Renewals board: per-restaurant derived status, only the actionable ones.
  const billingMap = billingByRestaurant(payments, now);
  const renewals: RenewalRow[] = [];
  for (const r of restaurants) {
    if (r.deleted_at) continue;
    const b = billingMap.get(r.id);
    if (!b || (b.status !== 'overdue' && b.status !== 'due-soon')) continue;
    renewals.push({
      restaurant_id: r.id,
      restaurant_name: r.display_name,
      status: b.status as Extract<BillingStatus, 'overdue' | 'due-soon'>,
      currentPeriodEnd: b.currentPeriodEnd,
      daysToRenewal: b.daysToRenewal,
      amount: b.nextRenewalAmount,
      currency: b.nextRenewalCurrency,
    });
  }
  renewals.sort((a, b) => (a.daysToRenewal ?? 0) - (b.daysToRenewal ?? 0));

  const dialogRestaurants: BillingRestaurant[] = restaurants
    .filter((r) => !r.deleted_at)
    .map((r) => ({ id: r.id, display_name: r.display_name, currency: r.currency ?? 'IQD' }));

  return { ledger, totals, renewals, restaurants: dialogRestaurants };
}

export default async function BillingPage() {
  const data = await loadBilling();
  return (
    <div className="space-y-5">
      <h1 className="text-h2 font-semibold">الفوترة</h1>
      <BillingView
        ledger={data.ledger}
        totals={data.totals}
        renewals={data.renewals}
        restaurants={data.restaurants}
      />
    </div>
  );
}
