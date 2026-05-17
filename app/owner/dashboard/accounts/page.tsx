import { getServiceClient } from '@/lib/supabase/server';
import { AccountsTable, type AccountRow } from './accounts-table';

export const dynamic = 'force-dynamic';

async function loadAccounts(): Promise<AccountRow[]> {
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
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">إدارة الحسابات</h2>
      </header>
      <AccountsTable accounts={accounts} />
    </div>
  );
}
