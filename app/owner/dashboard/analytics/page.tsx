import { CircleSlash, Store, TrendingUp, Trash2, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getServiceClient } from '@/lib/supabase/server';
import { requireOwner } from '@/lib/auth/require-owner';
import { aggregateByCurrency, billingByRestaurant, formatMoney, formatAmount, paymentRowFromDb, type PaymentRow } from '@/lib/billing';
import {
  countRestaurants,
  recentMonths,
  newRestaurantsByMonth,
  revenueByMonthForCurrency,
  topRevenueMonths,
  avgRevenuePerRestaurant,
  renewalOutlook,
  revenueByPlan,
  byBranchCount,
  type RestaurantMeta,
  type RenewalBucket,
} from '@/lib/owner-analytics';

export const dynamic = 'force-dynamic';

const monthLabel = (m: string) => {
  const [y, mo] = m.split('-');
  return `${Number(mo)}/${y.slice(2)}`;
};

async function load() {
  await requireOwner();
  const sb = getServiceClient();
  // eslint-disable-next-line react-hooks/purity -- server component: one clock read per request
  const now = Date.now();

  const [restRes, payRes] = await Promise.all([
    sb.from('restaurants').select('id, created_at, is_active, deleted_at, plan, branch_count, currency'),
    sb
      .from('payments')
      .select('id, restaurant_id, kind, amount, currency, paid_at, period_start, period_end, note, created_at'),
  ]);

  const restaurants: RestaurantMeta[] = (restRes.data ?? []).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    is_active: r.is_active,
    deleted_at: r.deleted_at,
    plan: r.plan,
    branch_count: r.branch_count ?? 1,
    currency: r.currency ?? 'IQD',
  }));
  const payments: PaymentRow[] = (payRes.data ?? []).map(paymentRowFromDb);

  const counts = countRestaurants(restaurants);
  const liveCount = counts.active + counts.suspended;
  const months = recentMonths(now, 12);
  const newByMonth = newRestaurantsByMonth(restaurants, months);
  const totals = aggregateByCurrency(payments);
  const avg = avgRevenuePerRestaurant(totals, liveCount);
  const primary = totals[0]?.currency ?? 'IQD';
  const revMonths = revenueByMonthForCurrency(payments, primary, months);
  const topMonths = topRevenueMonths(payments, primary, 3);
  const outlook = renewalOutlook([...billingByRestaurant(payments, now).values()]);
  const plans = revenueByPlan(restaurants, payments);
  const branches = byBranchCount(restaurants);

  return { counts, liveCount, months, newByMonth, totals, avg, primary, revMonths, topMonths, outlook, plans, branches };
}

export default async function OwnerAnalyticsPage() {
  const d = await load();
  const maxNew = Math.max(1, ...d.newByMonth.map((m) => m.count));
  const maxRev = Math.max(1, ...d.revMonths.map((m) => m.total));
  const topMonthSet = new Set(d.topMonths.map((t) => t.month));
  const hasRevenue = d.totals.length > 0;

  return (
    <div className="space-y-section">
      <div>
        <h1 className="text-h2 font-semibold">تحليلاتي</h1>
        <p className="text-muted-foreground text-sm">أداء المنصّة وإيرادها — تجميع لكل عملة على حدة.</p>
      </div>

      {/* Restaurant counts */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="نشطة" value={d.counts.active} Icon={Store} tone="success" />
        <Stat label="معطّلة" value={d.counts.suspended} Icon={CircleSlash} tone="warning" />
        <Stat label="محذوفة" value={d.counts.deleted} Icon={Trash2} tone="neutral" />
        <Stat label="الإجمالي" value={d.counts.total} Icon={Store} tone="primary" />
      </section>

      {/* Monthly growth */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="size-4" />
            مطاعم جديدة — آخر ١٢ شهراً
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Bars
            data={d.newByMonth.map((m) => ({ label: monthLabel(m.month), value: m.count, highlight: false }))}
            max={maxNew}
          />
          <p className="text-muted-foreground text-caption mt-3">
            إجمالي الفترة:{' '}
            <span className="text-foreground font-semibold tabular-nums">
              {d.newByMonth.reduce((s, m) => s + m.count, 0)}
            </span>{' '}
            مطعم
          </p>
        </CardContent>
      </Card>

      {/* Revenue totals per currency */}
      <section className="space-y-3">
        <h2 className="text-h3 font-semibold">الإيراد</h2>
        {!hasRevenue ? (
          <Card>
            <CardContent className="text-muted-foreground py-6 text-center text-sm">
              لا توجد دفعات مسجّلة بعد — سجّل دفعات من تبويب الفوترة لتظهر التحليلات.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {d.avg.map((a) => (
              <Card key={a.currency}>
                <CardContent className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="bg-success/12 text-success-text flex size-9 items-center justify-center rounded-lg">
                      <Wallet className="size-4" aria-hidden />
                    </span>
                    <span className="text-h3 font-semibold tabular-nums" dir="ltr">{formatMoney(a.total, a.currency)}</span>
                  </div>
                  <p className="text-muted-foreground text-caption">
                    متوسّط لكل مطعم: <span dir="ltr" className="font-mono">{formatMoney(a.avg, a.currency)}</span>
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Monthly revenue (primary currency) */}
      {hasRevenue && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">الإيراد الشهري — {d.primary}</CardTitle>
            <p className="text-muted-foreground text-caption">
              تأسيس (غامق) مقابل تجديد (فاتح). العملات الأخرى في بطاقات الإيراد أعلاه.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex h-40 items-end justify-between gap-1.5">
              {d.revMonths.map((m) => {
                const top = topMonthSet.has(m.month);
                const initPct = Math.round((m.initial / maxRev) * 100);
                const renPct = Math.round((m.renewal / maxRev) * 100);
                return (
                  <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1">
                    <span className="text-caption font-mono tabular-nums" dir="ltr">
                      {m.total > 0 ? formatAmount(m.total) : ''}
                    </span>
                    <div className="flex w-full flex-1 flex-col-reverse items-stretch">
                      <div className="bg-primary rounded-b-md" style={{ height: `${m.initial === 0 ? 0 : Math.max(initPct, 3)}%` }} />
                      <div className="bg-primary/35 rounded-t-md" style={{ height: `${m.renewal === 0 ? 0 : Math.max(renPct, 3)}%` }} />
                    </div>
                    <span className={'text-caption ' + (top ? 'text-primary font-medium' : 'text-muted-foreground')} dir="ltr">
                      {monthLabel(m.month)}
                    </span>
                  </div>
                );
              })}
            </div>
            {d.topMonths.length > 0 && (
              <p className="text-muted-foreground text-caption">
                أعلى الأشهر:{' '}
                {d.topMonths.map((t, i) => (
                  <span key={t.month}>
                    {i > 0 && '، '}
                    <span dir="ltr">{monthLabel(t.month)}</span> (
                    <span dir="ltr" className="font-mono">{formatMoney(t.total, d.primary)}</span>)
                  </span>
                ))}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Renewal outlook */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">التجديدات القادمة والمتأخرات</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <OutlookCell title="متأخّرة" bucket={d.outlook.overdue} tone="destructive" />
          <OutlookCell title="خلال ٣٠ يوم" bucket={d.outlook.d30} tone="warning" />
          <OutlookCell title="خلال ٦٠ يوم" bucket={d.outlook.d60} tone="warning" />
          <OutlookCell title="خلال ٩٠ يوم" bucket={d.outlook.d90} tone="neutral" />
        </CardContent>
      </Card>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">حسب الخطة</CardTitle>
          </CardHeader>
          <CardContent>
            {d.plans.length === 0 ? (
              <p className="text-muted-foreground text-caption">لا بيانات.</p>
            ) : (
              <ul className="divide-border-lite divide-y text-sm">
                {d.plans.map((p) => (
                  <li key={p.plan} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="font-medium">
                      {p.plan} <span className="text-muted-foreground text-caption">({p.count} مطعم)</span>
                    </span>
                    <span className="text-muted-foreground text-caption" dir="ltr">
                      {p.byCurrency.length ? p.byCurrency.map((c) => formatMoney(c.total, c.currency)).join(' · ') : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">حسب الفروع</CardTitle>
          </CardHeader>
          <CardContent>
            {d.branches.length === 0 ? (
              <p className="text-muted-foreground text-caption">لا بيانات.</p>
            ) : (
              <ul className="divide-border-lite divide-y text-sm">
                {d.branches.map((b) => (
                  <li key={b.branches} className="flex items-center justify-between gap-2 py-2">
                    <span className="font-medium">{b.branches} فرع</span>
                    <span className="text-muted-foreground tabular-nums">{b.count} مطعم</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
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
        <span className={'flex size-11 shrink-0 items-center justify-center rounded-xl ' + TONES[tone]}>
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

function Bars({ data, max }: { data: { label: string; value: number; highlight: boolean }[]; max: number }) {
  return (
    <div className="flex h-32 items-end justify-between gap-1.5">
      {data.map((d, i) => {
        const pct = Math.round((d.value / max) * 100);
        return (
          <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1">
            <span className="text-caption font-mono tabular-nums">{d.value}</span>
            <div className="flex w-full flex-1 items-end">
              <div className="bg-primary/45 w-full rounded-t-md" style={{ height: `${d.value === 0 ? 2 : Math.max(pct, 6)}%` }} />
            </div>
            <span className="text-caption text-muted-foreground" dir="ltr">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function OutlookCell({
  title,
  bucket,
  tone,
}: {
  title: string;
  bucket: RenewalBucket;
  tone: 'destructive' | 'warning' | 'neutral';
}) {
  return (
    <div className="border-border-lite space-y-1.5 rounded-xl border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption text-muted-foreground">{title}</span>
        <Badge variant={tone}>{bucket.count}</Badge>
      </div>
      {bucket.byCurrency.length === 0 ? (
        <p className="text-muted-foreground text-caption">—</p>
      ) : (
        <ul className="space-y-0.5">
          {bucket.byCurrency.map((c) => (
            <li key={c.currency} className="text-caption font-mono tabular-nums" dir="ltr">
              {formatMoney(c.amount, c.currency)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
