import { requireTenant } from '@/lib/auth/require-tenant';
import { getServiceClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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

  const rows = ((products ?? []) as ProductRow[])
    .map((p) => ({
      ...p,
      ...(stat.get(p.id) ?? { opens7: 0, opensToday: 0, adds7: 0, addsToday: 0 }),
    }))
    .sort((a, b) => b.opens7 - a.opens7);

  const menuTotal7 = days.reduce((s, d) => s + menuByDay[d], 0);
  const hasData = menuTotal7 > 0 || rows.some((r) => r.opens7 > 0 || r.adds7 > 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">التحليلات</h2>
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
              <CardTitle className="text-base">فتحات المنيو — يوماً بيوم</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-1.5">
                {days.map((d, i) => (
                  <div
                    key={d}
                    className={
                      'rounded-lg border p-2 text-center ' +
                      (i === 6 ? 'border-primary/40 bg-primary/5' : 'border-border-lite')
                    }
                  >
                    <div className="text-muted-foreground text-[10px]">
                      {i === 6 ? 'اليوم' : dayLabel(d)}
                    </div>
                    <div className="text-base font-bold tabular-nums">{menuByDay[d]}</div>
                  </div>
                ))}
              </div>
              <p className="text-muted-foreground mt-3 text-xs">
                إجمالي آخر ٧ أيام:{' '}
                <span className="text-foreground font-semibold tabular-nums">{menuTotal7}</span>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">المنتجات</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المنتج</TableHead>
                    <TableHead className="text-center">صورة</TableHead>
                    <TableHead className="text-center">الفتحات</TableHead>
                    <TableHead className="text-center">الإضافات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.name_ar}</div>
                        <div className="text-muted-foreground text-xs">
                          {catName.get(r.category_id) ?? '—'}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {r.image_url ? (
                          <span className="text-olive">✓</span>
                        ) : (
                          <span className="text-muted-lite">✗</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="font-bold tabular-nums">{r.opens7}</div>
                        <div className="text-muted-foreground text-[10px]">
                          اليوم {r.opensToday}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="font-bold tabular-nums">{r.adds7}</div>
                        <div className="text-muted-foreground text-[10px]">
                          اليوم {r.addsToday}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
