import { getServiceClient } from '@/lib/supabase/server';
import { AccountsTable, type AccountRow } from './accounts-table';
import { requireOwner } from '@/lib/auth/require-owner';

export const dynamic = 'force-dynamic';

async function loadAccounts(): Promise<AccountRow[]> {
  await requireOwner();
  const sb = getServiceClient();

  const [restaurants, productRows, categoryRows] = await Promise.all([
    sb
      .from('restaurants')
      .select('id, display_name, slug, username, is_active, created_at, last_login_at')
      .order('created_at', { ascending: false }),
    sb.from('products').select('restaurant_id'),
    sb.from('categories').select('restaurant_id'),
  ]);

  const productCounts = new Map<string, number>();
  for (const r of productRows.data ?? []) {
    productCounts.set(r.restaurant_id, (productCounts.get(r.restaurant_id) ?? 0) + 1);
  }
  const categoryCounts = new Map<string, number>();
  for (const r of categoryRows.data ?? []) {
    categoryCounts.set(r.restaurant_id, (categoryCounts.get(r.restaurant_id) ?? 0) + 1);
  }

  return (restaurants.data ?? []).map((r) => ({
    ...r,
    product_count: productCounts.get(r.id) ?? 0,
    category_count: categoryCounts.get(r.id) ?? 0,
  }));
}

export default async function AccountsPage() {
  const accounts = await loadAccounts();
  return (
    <div className="space-y-5">
      <h1 className="text-h2 font-semibold">إدارة الحسابات</h1>
      <AccountsTable accounts={accounts} />
    </div>
  );
}
