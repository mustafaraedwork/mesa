import Link from 'next/link';
import { ArrowLeft, AlertTriangle, CircleSlash, Store, Trash2, Wallet } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getServiceClient } from '@/lib/supabase/server';
import { requireOwner } from '@/lib/auth/require-owner';
import { aggregateByCurrency, billingByRestaurant, formatMoney, type PaymentRow } from '@/lib/billing';
import { countRestaurants, renewalOutlook, type RestaurantMeta } from '@/lib/owner-analytics';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type RecentRow = { id: string; display_name: string; slug: string; is_active: boolean | null };

async function loadOverview() {
  await requireOwner();
  const sb = getServiceClient();
  // eslint-disable-next-line react-hooks/purity -- server component: one clock read per request
  const now = Date.now();

  const [restRes, payRes] = await Promise.all([
    sb
      .from('restaurants')
      .select('id, display_name, slug, is_active, deleted_at, created_at, plan, branch_count, currency')
      .order('created_at', { ascending: false }),
    sb.from('payments').select('id, restaurant_id, kind, amount, currency, paid_at, period_start, period_end, note, created_at'),
  ]);

  const rows = restRes.data ?? [];
  const restaurants: RestaurantMeta[] = rows.map((r) => ({
    id: r.id,
    created_at: r.created_at,
    is_active: r.is_active,
    deleted_at: r.deleted_at,
    plan: r.plan,
    branch_count: r.branch_count ?? 1,
    currency: r.currency ?? 'IQD',
  }));
  const counts = countRestaurants(restaurants);

  const payments: PaymentRow[] = (payRes.data ?? []).map((p) => ({
    id: p.id,
    restaurant_id: p.restaurant_id,
    kind: p.kind,
    amount: Number(p.amount),
    currency: p.currency,
    paid_at: p.paid_at,
    period_start: p.period_start,
    period_end: p.period_end,
    note: p.note,
    created_at: p.created_at,
  }));
  const totals = aggregateByCurrency(payments);
  const outlook = renewalOutlook([...billingByRestaurant(payments, now).values()]);

  const recent: RecentRow[] = rows
    .filter((r) => !r.deleted_at)
    .slice(0, 5)
    .map((r) => ({ id: r.id, display_name: r.display_name, slug: r.slug, is_active: r.is_active }));

  return { counts, totals, outlook, recent };
}

export default async function OwnerDashboardPage() {
  const o = await loadOverview();
  const attention = o.outlook.overdue.count + o.outlook.d30.count;

  return (
    <div className="space-y-section">
      <h1 className="text-h2 font-semibold">نظرة عامة</h1>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="نشطة" value={o.counts.active} Icon={Store} tone="success" />
        <Stat label="معطّلة" value={o.counts.suspended} Icon={CircleSlash} tone="warning" />
        <Stat label="محذوفة" value={o.counts.deleted} Icon={Trash2} tone="neutral" />
        <Stat label="الإجمالي" value={o.counts.total} Icon={Store} tone="primary" />
      </section>

      {/* Billing snapshot */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-2">
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Wallet className="size-4" aria-hidden />
              إجمالي الإيراد
            </div>
            {o.totals.length === 0 ? (
              <p className="text-muted-foreground text-caption">لا دفعات مسجّلة بعد.</p>
            ) : (
              <ul className="space-y-1">
                {o.totals.map((t) => (
                  <li key={t.currency} className="flex items-baseline justify-between gap-2">
                    <span className="text-h3 font-semibold tabular-nums" dir="ltr">{formatMoney(t.total, t.currency)}</span>
                    <span className="text-muted-foreground text-caption">{t.count} دفعة</span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/owner/dashboard/billing" className="text-primary inline-flex items-center gap-1 text-sm hover:underline">
              الفوترة
              <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
            </Link>
          </CardContent>
        </Card>

        <Card className={attention > 0 ? 'border-warning/40' : undefined}>
          <CardContent className="space-y-2">
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <AlertTriangle className="size-4" aria-hidden />
              تجديدات تحتاج انتباهاً
            </div>
            {attention === 0 ? (
              <p className="text-muted-foreground text-caption">لا متأخرات ولا تجديدات قريبة. 👍</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {o.outlook.overdue.count > 0 && (
                  <Badge variant="destructive">متأخّرة: {o.outlook.overdue.count}</Badge>
                )}
                {o.outlook.d30.count > 0 && <Badge variant="warning">خلال ٣٠ يوم: {o.outlook.d30.count}</Badge>}
              </div>
            )}
            <Link href="/owner/dashboard/billing" className="text-primary inline-flex items-center gap-1 text-sm hover:underline">
              عرض التجديدات
              <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
            </Link>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-h3 font-semibold">أحدث المطاعم</h2>
          <Link
            href="/owner/dashboard/accounts"
            className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
          >
            كل المطاعم
            <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
          </Link>
        </div>
        {o.recent.length === 0 ? (
          <p className="text-muted-foreground bg-card border-border-lite rounded-xl border p-6 text-center text-sm">
            لا توجد مطاعم بعد.
          </p>
        ) : (
          <ul className="bg-card border-border-lite divide-border-lite divide-y rounded-xl border">
            {o.recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <Link
                    href={`/owner/dashboard/accounts/${r.id}`}
                    className="hover:text-primary truncate font-medium hover:underline"
                  >
                    {r.display_name}
                  </Link>
                  <p className="text-muted-foreground text-caption" dir="ltr">/r/{r.slug}</p>
                </div>
                <Badge variant={r.is_active ? 'success' : 'neutral'}>{r.is_active ? 'نشط' : 'معطّل'}</Badge>
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

function Stat({ label, value, Icon, tone }: { label: string; value: number; Icon: typeof Store; tone: keyof typeof TONES }) {
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
