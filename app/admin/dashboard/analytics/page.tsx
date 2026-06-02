import { ImageIcon, ImageOff } from 'lucide-react';
import { requireTenant } from '@/lib/auth/require-tenant';
import { getServiceClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

const TZ_OFFSET = 3 * 60 * 60 * 1000; // Baghdad, UTC+3 (no DST in Iraq)
const DAY = 86_400_000;

// Baghdad-local YYYY-MM-DD for a given epoch-ms timestamp.
function bagDay(ms: number): string {
  return new Date(ms + TZ_OFFSET).toISOString().slice(0, 10);
}

// YYYY-MM-DD → DD/MM
function dayLabel(d: string): string {
  const [, m, day] = d.split('-');
  return `${day}/${m}`;
}

type EventRow = { kind: string; product_id: string | null; created_at: string };
type ProductRow = { id: string; name_ar: string; category_id: string; image_url: string | null };
type CategoryRow = { id: string; name_ar: string };
type Tally = { opens7: number; opensToday: number; adds7: number; addsToday: number };
type StatRow = ProductRow & Tally;

export default async function AnalyticsPage() {
  const { restaurantId } = await requireTenant();
  const sb = getServiceClient();

  // eslint-disable-next-line react-hooks/purity -- server component: runs once per request
  const now = Date.now();
  // Last 7 Baghdad days, oldest → newest.
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) days.push(bagDay(now - i * DAY));
  const today = days[days.length - 1];
  const since = new Date(now - 8 * DAY).toISOString();

  const [{ data: events }, { data: products }, { data: categories }] = await Promise.all([
    sb
      .from('events')
      .select('kind, product_id, created_at')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', since),
    sb
      .from('products')
      .select('id, name_ar, category_id, image_url')
      .eq('restaurant_id', restaurantId)
      .order('display_order', { ascending: true }),
    sb.from('categories').select('id, name_ar').eq('restaurant_id', restaurantId),
  ]);

  const daySet = new Set(days);
  const catName = new Map((categories ?? []).map((c: CategoryRow) => [c.id, c.name_ar]));

  const menuByDay: Record<string, number> = {};
  for (const d of days) menuByDay[d] = 0;

  const stat = new Map<string, Tally>();
  const tally = (id: string): Tally => {
    let s = stat.get(id);
    if (!s) {
      s = { opens7: 0, opensToday: 0, adds7: 0, addsToday: 0 };
      stat.set(id, s);
    }
    return s;
  };

  for (const e of (events ?? []) as EventRow[]) {
    const d = bagDay(new Date(e.created_at).getTime());
    if (!daySet.has(d)) continue;
    if (e.kind === 'menu_open') {
      menuByDay[d]++;
    } else if (e.product_id) {
      const s = tally(e.product_id);
      const isToday = d === today;
      if (e.kind === 'product_open') {
        s.opens7++;
        if (isToday) s.opensToday++;
      } else if (e.kind === 'product_add') {
        s.adds7++;
        if (isToday) s.addsToday++;
      }
    }
  }

  const rows: StatRow[] = ((products ?? []) as ProductRow[])
    .map((p) => ({
      ...p,
      ...(stat.get(p.id) ?? { opens7: 0, opensToday: 0, adds7: 0, addsToday: 0 }),
    }))
    .sort((a, b) => b.opens7 - a.opens7);

  const menuTotal7 = days.reduce((s, d) => s + menuByDay[d], 0);
  const hasData = menuTotal7 > 0 || rows.some((r) => r.opens7 > 0 || r.adds7 > 0);

  const maxMenuDay = Math.max(1, ...days.map((d) => menuByDay[d]));
  const maxOpens = Math.max(1, ...rows.map((r) => r.opens7));
  const withImage = rows.filter((r) => r.image_url);
  const withoutImage = rows.filter((r) => !r.image_url);
  const avgOpens = (list: StatRow[]) =>
    list.length ? Math.round((list.reduce((s, r) => s + r.opens7, 0) / list.length) * 10) / 10 : 0;

  return (
    <div className="space-y-section">
      <div>
        <h2 className="text-h2 font-semibold">التحليلات</h2>
        <p className="text-muted-foreground text-sm">
          آخر ٧ أيام — كم فُتح المنيو وكم فُتح/أُضيف كل منتج، لمقارنة أثر الصور والترتيب.
        </p>
      </div>

      {!hasData ? (
        <p className="text-muted-foreground bg-card border-border-lite shadow-card rounded-xl border p-6 text-center text-sm">
          لا توجد بيانات بعد — شارك رابط المنيو مع زبائنك وستظهر الأرقام هنا.
        </p>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">فتحات المنيو — آخر ٧ أيام</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex h-36 items-end justify-between gap-1.5">
                {days.map((d, i) => {
                  const v = menuByDay[d];
                  const isToday = i === 6;
                  const pct = Math.round((v / maxMenuDay) * 100);
                  return (
                    <div key={d} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1">
                      <span className="text-caption font-mono tabular-nums">{v}</span>
                      <div className="flex w-full flex-1 items-end">
                        <div
                          className={
                            'w-full rounded-t-md transition-all ' +
                            (isToday ? 'bg-primary' : 'bg-primary/35')
                          }
                          style={{ height: `${v === 0 ? 2 : Math.max(pct, 6)}%` }}
                        />
                      </div>
                      <span className={'text-caption ' + (isToday ? 'text-primary font-medium' : 'text-muted-foreground')}>
                        {isToday ? 'اليوم' : dayLabel(d)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-muted-foreground text-caption">
                إجمالي آخر ٧ أيام:{' '}
                <span className="text-foreground font-semibold tabular-nums">{menuTotal7}</span>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">المنتجات حسب الفتحات</CardTitle>
              <p className="text-muted-foreground text-caption">
                مجمّعة بحسب وجود صورة — قارن المتوسّط لترى أثر إضافة الصور.
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              <ProductGroup
                title="بصورة"
                icon={<ImageIcon className="size-3.5" />}
                tone="success"
                rows={withImage}
                avg={avgOpens(withImage)}
                maxOpens={maxOpens}
                catName={catName}
              />
              <ProductGroup
                title="بدون صورة"
                icon={<ImageOff className="size-3.5" />}
                tone="neutral"
                rows={withoutImage}
                avg={avgOpens(withoutImage)}
                maxOpens={maxOpens}
                catName={catName}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function ProductGroup({
  title,
  icon,
  tone,
  rows,
  avg,
  maxOpens,
  catName,
}: {
  title: string;
  icon: React.ReactNode;
  tone: 'success' | 'neutral';
  rows: StatRow[];
  avg: number;
  maxOpens: number;
  catName: Map<string, string>;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={tone}>
          {icon}
          {title}
        </Badge>
        <span className="text-muted-foreground text-caption">{rows.length} منتج</span>
        <span className="text-muted-foreground text-caption">·</span>
        <span className="text-caption">
          متوسّط الفتحات:{' '}
          <span className="font-mono font-semibold tabular-nums">{avg}</span>
        </span>
      </div>
      <ul className="divide-border-lite divide-y">
        {rows.map((r) => {
          const pct = Math.round((r.opens7 / maxOpens) * 100);
          return (
            <li key={r.id} className="space-y-1.5 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium">{r.name_ar}</span>
                <span className="text-muted-foreground text-caption shrink-0">
                  {catName.get(r.category_id) ?? '—'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full"
                    style={{ width: `${r.opens7 === 0 ? 0 : Math.max(pct, 4)}%` }}
                  />
                </div>
                <span dir="ltr" className="text-caption w-24 shrink-0 text-end font-mono tabular-nums">
                  <span className="font-semibold">{r.opens7}</span>{' '}
                  <span className="text-muted-foreground">فتحة</span>
                </span>
              </div>
              <p className="text-muted-foreground text-caption">
                أُضيف للسلة <span className="font-mono tabular-nums">{r.adds7}</span> مرّة
                {r.addsToday > 0 && <> · اليوم <span className="font-mono tabular-nums">{r.addsToday}</span></>}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
