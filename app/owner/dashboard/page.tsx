import Link from 'next/link';
import { ArrowLeft, CircleSlash, Store, UtensilsCrossed } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getServiceClient } from '@/lib/supabase/server';
import { requireOwner } from '@/lib/auth/require-owner';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type RecentRow = {
  id: string;
  display_name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
};

async function loadOverview() {
  await requireOwner();
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
    <div className="space-y-section">
      <h1 className="text-h2 font-semibold">نظرة عامة</h1>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="إجمالي الحسابات" value={o.total} Icon={Store} tone="primary" />
        <Stat label="نشطة" value={o.active} Icon={Store} tone="success" />
        <Stat label="معطّلة" value={o.disabled} Icon={CircleSlash} tone="warning" />
        <Stat label="المنتجات" value={o.products} Icon={UtensilsCrossed} tone="neutral" />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-h3 font-semibold">أحدث الحسابات</h2>
          <Link
            href="/owner/dashboard/accounts"
            className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
          >
            كل الحسابات
            <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
          </Link>
        </div>
        {o.recent.length === 0 ? (
          <p className="text-muted-foreground bg-card border-border-lite rounded-xl border p-6 text-center text-sm">
            لا توجد حسابات بعد.
          </p>
        ) : (
          <ul className="bg-card border-border-lite divide-border-lite divide-y rounded-xl border">
            {o.recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.display_name}</p>
                  <p className="text-muted-foreground text-caption" dir="ltr">/r/{r.slug}</p>
                </div>
                <Badge variant={r.is_active ? 'success' : 'neutral'}>
                  {r.is_active ? 'نشط' : 'معطّل'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const TONES: Record<string, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/12 text-success-text',
  warning: 'bg-warning/15 text-warning-text',
  neutral: 'bg-muted text-muted-foreground',
};

function Stat({
  label,
  value,
  Icon,
  tone,
}: {
  label: string;
  value: number;
  Icon: typeof Store;
  tone: keyof typeof TONES;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', TONES[tone])}>
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-h2 font-semibold tabular-nums leading-none">{value}</p>
          <p className="text-muted-foreground text-caption mt-1">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
