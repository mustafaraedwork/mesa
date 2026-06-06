import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, CalendarClock, LogIn, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getServiceClient } from '@/lib/supabase/server';
import { requireOwner } from '@/lib/auth/require-owner';
import {
  deriveBilling,
  formatMoney,
  BILLING_STATUS_META,
  PAYMENT_KIND_LABEL,
  type PaymentRow,
  type PaymentKind,
} from '@/lib/billing';
import { currencyLabel } from '@/lib/currencies';
import { RestaurantDetailActions } from '../restaurant-detail-actions';
import type { AccountRow } from '../accounts-table';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : '—');

type CategoryRow = { id: string; name_ar: string; parent_id: string | null; display_order: number };
type ProductRow = { id: string; category_id: string; is_available: boolean | null };
type SessionRow = { id: string; device_info: string | null; created_at: string };

export default async function RestaurantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const sb = getServiceClient();
  // eslint-disable-next-line react-hooks/purity -- server component: one clock read per request
  const now = Date.now();

  const { data: r } = await sb
    .from('restaurants')
    .select(
      'id, display_name, slug, username, is_active, deleted_at, created_at, last_login_at, plan, branch_count, currency',
    )
    .eq('id', id)
    .maybeSingle();
  if (!r) notFound();

  const [{ data: categories }, { data: products }, { data: sessions }, { data: payRows }, lastEventRes] =
    await Promise.all([
      sb.from('categories').select('id, name_ar, parent_id, display_order').eq('restaurant_id', id),
      sb.from('products').select('id, category_id, is_available').eq('restaurant_id', id),
      sb.from('tenant_sessions').select('id, device_info, created_at').eq('restaurant_id', id).order('created_at', { ascending: false }),
      sb
        .from('payments')
        .select('id, restaurant_id, kind, amount, currency, paid_at, period_start, period_end, note, created_at')
        .eq('restaurant_id', id)
        .order('paid_at', { ascending: false }),
      sb.from('events').select('created_at').eq('restaurant_id', id).order('created_at', { ascending: false }).limit(1),
    ]);

  const cats = (categories ?? []) as CategoryRow[];
  const prods = (products ?? []) as ProductRow[];
  const sess = (sessions ?? []) as SessionRow[];
  const lastEventAt = lastEventRes.data?.[0]?.created_at ?? null;

  const payments: PaymentRow[] = (payRows ?? []).map((p) => ({
    id: p.id,
    restaurant_id: p.restaurant_id,
    kind: p.kind as PaymentKind,
    amount: Number(p.amount),
    currency: p.currency,
    paid_at: p.paid_at,
    period_start: p.period_start,
    period_end: p.period_end,
    note: p.note,
    created_at: p.created_at,
  }));
  const billing = deriveBilling(payments, now);

  const productsByCat = new Map<string, number>();
  let available = 0;
  for (const p of prods) {
    productsByCat.set(p.category_id, (productsByCat.get(p.category_id) ?? 0) + 1);
    if (p.is_available) available++;
  }
  const topCats = cats.filter((c) => !c.parent_id).sort((a, b) => a.display_order - b.display_order);
  const childrenOf = (pid: string) =>
    cats.filter((c) => c.parent_id === pid).sort((a, b) => a.display_order - b.display_order);
  const catProductTotal = (c: CategoryRow) =>
    (productsByCat.get(c.id) ?? 0) + childrenOf(c.id).reduce((s, ch) => s + (productsByCat.get(ch.id) ?? 0), 0);

  const account: AccountRow = {
    id: r.id,
    display_name: r.display_name,
    slug: r.slug,
    username: r.username,
    is_active: r.is_active,
    deleted_at: r.deleted_at,
    created_at: r.created_at,
    last_login_at: r.last_login_at,
    last_event_at: lastEventAt,
    plan: r.plan,
    branch_count: r.branch_count ?? 1,
    currency: r.currency ?? 'IQD',
    product_count: prods.length,
    category_count: cats.length,
    billing,
  };

  const deleted = !!r.deleted_at;
  const billingMeta = BILLING_STATUS_META[billing.status];

  return (
    <div className="space-y-5">
      <Link
        href="/owner/dashboard/accounts"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden />
        كل المطاعم
      </Link>

      {/* Header */}
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-h2 font-semibold">{r.display_name}</h1>
                {deleted ? (
                  <Badge variant="destructive">محذوف</Badge>
                ) : r.is_active ? (
                  <Badge variant="success">نشط</Badge>
                ) : (
                  <Badge variant="neutral">معطّل</Badge>
                )}
              </div>
              <p className="text-muted-foreground text-sm" dir="ltr">
                /r/{r.slug} · <span className="font-mono">{r.username}</span>
              </p>
            </div>
            <RestaurantDetailActions account={account} />
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
            <Meta label="الخطة" value={r.plan ?? '—'} />
            <Meta label="الفروع" value={`${account.branch_count}`} />
            <Meta label="العملة" value={`${account.currency} — ${currencyLabel(account.currency)}`} />
            <Meta label="تاريخ الانضمام" value={fmtDate(r.created_at)} ltr />
            <Meta label="آخر دخول للوحة" value={fmtDate(r.last_login_at)} ltr icon={<LogIn className="size-3.5" />} />
            <Meta label="آخر نشاط زبائن" value={fmtDate(lastEventAt)} ltr icon={<Users className="size-3.5" />} />
          </dl>
        </CardContent>
      </Card>

      {/* Billing */}
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">الفوترة</CardTitle>
          <Badge variant={billingMeta.variant}>{billingMeta.label}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            <Meta
              label="التجديد القادم"
              value={billing.currentPeriodEnd ? fmtDate(billing.currentPeriodEnd) : '—'}
              ltr
              icon={<CalendarClock className="size-3.5" />}
            />
            <Meta label="آخر دفعة" value={fmtDate(billing.lastPaidAt)} ltr />
            <Meta
              label="إجمالي المدفوع"
              value={
                billing.totalsByCurrency.length
                  ? billing.totalsByCurrency.map((t) => formatMoney(t.total, t.currency)).join(' · ')
                  : '—'
              }
              ltr
            />
          </dl>

          {payments.length === 0 ? (
            <p className="text-muted-foreground text-caption">لا توجد دفعات مسجّلة بعد.</p>
          ) : (
            <ul className="divide-border-lite divide-y text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="neutral">{PAYMENT_KIND_LABEL[p.kind]}</Badge>
                    <span dir="ltr" className="font-mono font-medium">{formatMoney(p.amount, p.currency)}</span>
                  </div>
                  <div className="text-muted-foreground text-caption" dir="ltr">
                    {fmtDate(p.paid_at)}
                    {p.period_end ? ` → ${fmtDate(p.period_end)}` : ''}
                    {p.note ? ` · ${p.note}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Content */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">المحتوى</CardTitle>
          <p className="text-muted-foreground text-caption">
            {cats.length} سكشن · {prods.length} منتج · {available} متاح
          </p>
        </CardHeader>
        <CardContent>
          {topCats.length === 0 ? (
            <p className="text-muted-foreground text-caption">لا توجد أصناف بعد.</p>
          ) : (
            <ul className="divide-border-lite divide-y text-sm">
              {topCats.map((c) => {
                const kids = childrenOf(c.id);
                return (
                  <li key={c.id} className="py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{c.name_ar}</span>
                      <span className="text-muted-foreground text-caption tabular-nums">{catProductTotal(c)} منتج</span>
                    </div>
                    {kids.length > 0 && (
                      <div className="text-muted-foreground text-caption mt-1 flex flex-wrap gap-x-3 gap-y-0.5 ps-3">
                        {kids.map((k) => (
                          <span key={k.id}>
                            {k.name_ar} ({productsByCat.get(k.id) ?? 0})
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Sessions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">الجلسات النشطة ({sess.length})</CardTitle>
          <p className="text-muted-foreground text-caption">أجهزة صاحب المطعم المسجّلة دخولها الآن.</p>
        </CardHeader>
        <CardContent>
          {sess.length === 0 ? (
            <p className="text-muted-foreground text-caption">لا توجد جلسات نشطة.</p>
          ) : (
            <ul className="divide-border-lite divide-y text-sm">
              {sess.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="truncate">{s.device_info || 'جهاز غير معروف'}</span>
                  <span className="text-muted-foreground text-caption shrink-0" dir="ltr">{fmtDate(s.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Meta({
  label,
  value,
  ltr = false,
  icon,
}: {
  label: string;
  value: string;
  ltr?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-muted-foreground text-caption flex items-center gap-1">
        {icon}
        {label}
      </dt>
      <dd className="font-medium" dir={ltr ? 'ltr' : undefined}>
        {value}
      </dd>
    </div>
  );
}
