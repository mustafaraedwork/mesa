import { Star } from 'lucide-react';
import { requireTenant } from '@/lib/auth/require-tenant';
import { getServiceClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const dynamic = 'force-dynamic';

// Newest first, bounded — a busy restaurant rates by the hundreds a month and
// the tenant only ever reads the recent ones on a phone.
const LIMIT = 200;

type RatingRow = {
  id: string;
  staff_score: number;
  service_score: number;
  clean_score: number;
  overall_score: number;
  name: string | null;
  phone: string | null;
  comment: string | null;
  created_at: string;
};

const OVERALL_FACE = ['', '😠', '🙁', '😐', '🙂', '😄'] as const;

// Digits-only (dd/MM HH:mm, Baghdad) so the LTR cell never bidi-scrambles.
const dateFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Baghdad',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function avg(rows: RatingRow[], key: keyof RatingRow): string {
  if (rows.length === 0) return '–';
  const sum = rows.reduce((s, r) => s + Number(r[key]), 0);
  return (sum / rows.length).toFixed(1);
}

export default async function RatingsPage() {
  const { restaurantId } = await requireTenant();
  const sb = getServiceClient();
  const { data, error } = await sb
    .from('ratings')
    .select('id, staff_score, service_score, clean_score, overall_score, name, phone, comment, created_at')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(LIMIT);
  if (error) console.error('[ratings] read failed:', error.message);
  const rows = (data ?? []) as RatingRow[];

  const summary: { label: string; key: keyof RatingRow }[] = [
    { label: 'الموظفون', key: 'staff_score' },
    { label: 'الخدمة', key: 'service_score' },
    { label: 'النظافة', key: 'clean_score' },
    { label: 'التجربة العامة', key: 'overall_score' },
  ];

  return (
    <div className="space-y-section">
      <div>
        <h2 className="text-h2 font-semibold">التقييمات</h2>
        <p className="text-muted-foreground text-sm">
          ما يرسله الزبائن من زر «تقييم» في المنيو — الأحدث أولاً.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground bg-card border-border-lite shadow-card rounded-xl border p-6 text-center text-sm">
          لا توجد تقييمات بعد — ستظهر هنا فور إرسال أول زبون تقييمه.
        </p>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                المتوسط — آخر {rows.length} تقييم{rows.length === 1 ? '' : 'اً'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {summary.map((s) => (
                  <div key={s.key} className="bg-muted/40 rounded-xl px-3 py-3 text-center">
                    <p className="text-muted-foreground text-caption">{s.label}</p>
                    <p className="flex items-center justify-center gap-1 font-mono text-h3 font-bold tabular-nums">
                      {avg(rows, s.key)}
                      <Star className="text-gold h-4 w-4" fill="currentColor" aria-hidden />
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>التاريخ</TableHead>
                    <TableHead className="text-center">العامة</TableHead>
                    <TableHead className="text-center">الموظفون</TableHead>
                    <TableHead className="text-center">الخدمة</TableHead>
                    <TableHead className="text-center">النظافة</TableHead>
                    <TableHead>الاسم</TableHead>
                    <TableHead>الهاتف</TableHead>
                    <TableHead className="min-w-56">التعليق</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap font-mono text-caption tabular-nums" dir="ltr">
                        {dateFmt.format(new Date(r.created_at)).replace(',', '')}
                      </TableCell>
                      <TableCell className="text-center">
                        <span aria-label={String(r.overall_score)}>{OVERALL_FACE[r.overall_score]}</span>
                      </TableCell>
                      <TableCell className="text-center font-mono tabular-nums">{r.staff_score}</TableCell>
                      <TableCell className="text-center font-mono tabular-nums">{r.service_score}</TableCell>
                      <TableCell className="text-center font-mono tabular-nums">{r.clean_score}</TableCell>
                      <TableCell className="max-w-40 truncate">{r.name ?? '–'}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono tabular-nums" dir="ltr">
                        {r.phone ?? '–'}
                      </TableCell>
                      <TableCell className="min-w-56 max-w-80 whitespace-normal text-sm">{r.comment ?? '–'}</TableCell>
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
