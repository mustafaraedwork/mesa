import { getServiceClient } from '@/lib/supabase/server';
import { AccountsTable, type AccountRow } from './accounts-table';
import { requireOwner } from '@/lib/auth/require-owner';
import { billingByRestaurant, paymentRowFromDb, type PaymentRow } from '@/lib/billing';

export const dynamic = 'force-dynamic';

// Bound the last-activity scan. Events are newest-first, so the most recent
// event per restaurant is captured well within this cap at the current scale
// (no group-by RPC needed — see OWNER-PANEL-PLAN.md).
const EVENTS_SCAN_LIMIT = 50_000;

async function loadAccounts(): Promise<AccountRow[]> {
  await requireOwner();
  const sb = getServiceClient();
  // eslint-disable-next-line react-hooks/purity -- server component: one clock read per request
  const now = Date.now();

  const [restaurants, productRows, categoryRows, eventRows, paymentRows] = await Promise.all([
    sb
      .from('restaurants')
      .select(
        'id, display_name, slug, username, is_active, deleted_at, created_at, last_login_at, plan, branch_count, currency',
      )
      .order('created_at', { ascending: false }),
    sb.from('products').select('restaurant_id'),
    sb.from('categories').select('restaurant_id'),
    sb
      .from('events')
      .select('restaurant_id, created_at')
      .order('created_at', { ascending: false })
      .limit(EVENTS_SCAN_LIMIT),
    sb
      .from('payments')
      .select('id, restaurant_id, kind, amount, currency, paid_at, period_start, period_end, note, created_at'),
  ]);

  const productCounts = new Map<string, number>();
  for (const r of productRows.data ?? []) {
    productCounts.set(r.restaurant_id, (productCounts.get(r.restaurant_id) ?? 0) + 1);
  }
  const categoryCounts = new Map<string, number>();
  for (const r of categoryRows.data ?? []) {
    categoryCounts.set(r.restaurant_id, (categoryCounts.get(r.restaurant_id) ?? 0) + 1);
  }

  // Newest-first scan → first sighting of a restaurant is its latest event.
  const lastEvent = new Map<string, string>();
  for (const e of eventRows.data ?? []) {
    if (!lastEvent.has(e.restaurant_id)) lastEvent.set(e.restaurant_id, e.created_at);
  }

  const payments: PaymentRow[] = (paymentRows.data ?? []).map(paymentRowFromDb);
  const billing = billingByRestaurant(payments, now);

  return (restaurants.data ?? []).map((r) => ({
    id: r.id,
    display_name: r.display_name,
    slug: r.slug,
    username: r.username,
    is_active: r.is_active,
    deleted_at: r.deleted_at,
    created_at: r.created_at,
    last_login_at: r.last_login_at,
    last_event_at: lastEvent.get(r.id) ?? null,
    plan: r.plan,
    branch_count: r.branch_count ?? 1,
    currency: r.currency ?? 'IQD',
    product_count: productCounts.get(r.id) ?? 0,
    category_count: categoryCounts.get(r.id) ?? 0,
    billing: billing.get(r.id) ?? null,
  }));
}

export default async function AccountsPage() {
  const accounts = await loadAccounts();
  return (
    <div className="space-y-5">
      <h1 className="text-h2 font-semibold">إدارة المطاعم</h1>
      <AccountsTable accounts={accounts} />
    </div>
  );
}
