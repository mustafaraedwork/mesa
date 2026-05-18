import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type RecentRow = {
  id: string;
  display_name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
};

async function loadOverview() {
  const sb = getServiceClient();
  const [
    { count: total },
    { count: active },
    { count: products },
    { count: categories },
    { data: recent },
  ] = await Promise.all([
    sb.from('restaurants').select('*', { count: 'exact', head: true }),
    sb.from('restaurants').select('*', { count: 'exact', head: true }).eq('is_active', true),
    sb.from('products').select('*', { count: 'exact', head: true }),
    sb.from('categories').select('*', { count: 'exact', head: true }),
    sb
      .from('restaurants')
      .select('id, display_name, slug, is_active, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);
  return {
    total: total ?? 0,
    active: active ?? 0,
    disabled: (total ?? 0) - (active ?? 0),
    products: products ?? 0,
    categories: categories ?? 0,
    recent: (recent ?? []) as RecentRow[],
  };
}

export default async function OwnerDashboardPage() {
  const o = await loadOverview();

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="إجمالي الحسابات" value={o.total} />
        <Stat label="نشطة" value={o.active} />
        <Stat label="معطّلة" value={o.disabled} />
        <Stat label="المنتجات" value={o.products} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">أحدث ٥ حسابات</h2>
          <Link
            href="/owner/dashboard/accounts"
            className="text-primary text-sm hover:underline"
          >
            كل الحسابات ←
          </Link>
        </div>
        {o.recent.length === 0 ? (
          <p className="text-muted-foreground text-sm">لا توجد حسابات بعد.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {o.recent.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div>
                  <p className="font-medium">{r.display_name}</p>
                  <p className="text-muted-foreground text-xs" dir="ltr">
                    /r/{r.slug}
                  </p>
                </div>
                <span
                  className={
                    'rounded px-2 py-0.5 text-xs ' +
                    (r.is_active
                      ? 'bg-olive/15 text-olive'
                      : 'bg-muted text-muted-foreground')
                  }
                >
                  {r.is_active ? 'نشط' : 'معطّل'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-normal">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
