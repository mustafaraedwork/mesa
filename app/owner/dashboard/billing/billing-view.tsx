'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CalendarClock, Plus, Receipt, Trash2, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/components/ui/toast';
import {
  BILLING_STATUS_META,
  PAYMENT_KIND_LABEL,
  PAYMENT_KINDS,
  formatMoney,
  type BillingStatus,
  type CurrencyTotal,
  type PaymentKind,
} from '@/lib/billing';
import { RecordPaymentDialog, type BillingRestaurant } from './record-payment-dialog';
import { deletePayment } from './actions';

export type LedgerRow = {
  id: string;
  restaurant_id: string;
  restaurant_name: string;
  kind: PaymentKind;
  amount: number;
  currency: string;
  paid_at: string;
  period_end: string | null;
  note: string | null;
};

export type RenewalRow = {
  restaurant_id: string;
  restaurant_name: string;
  status: Extract<BillingStatus, 'overdue' | 'due-soon'>;
  currentPeriodEnd: string | null;
  daysToRenewal: number | null;
  amount: number | null;
  currency: string | null;
};

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : '—');
const KIND_FILTER = ['all', ...PAYMENT_KINDS] as const;

export function BillingView({
  ledger,
  totals,
  renewals,
  restaurants,
}: {
  ledger: LedgerRow[];
  totals: CurrencyTotal[];
  renewals: RenewalRow[];
  restaurants: BillingRestaurant[];
}) {
  const [recording, setRecording] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<LedgerRow | null>(null);
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<(typeof KIND_FILTER)[number]>('all');
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      ledger.filter(
        (p) =>
          (kindFilter === 'all' || p.kind === kindFilter) &&
          (!q || p.restaurant_name.toLowerCase().includes(q) || (p.note ?? '').toLowerCase().includes(q)),
      ),
    [ledger, q, kindFilter],
  );

  const kindFilterItems = useMemo(
    () => ({ all: 'كل الأنواع', ...Object.fromEntries(PAYMENT_KINDS.map((k) => [k, PAYMENT_KIND_LABEL[k]])) }),
    [],
  );

  function onDelete(row: LedgerRow) {
    startTransition(async () => {
      const r = await deletePayment(row.id);
      if (r.ok) {
        toast.add({ type: 'success', title: 'حُذفت الدفعة' });
        setConfirmDelete(null);
        router.refresh();
      } else {
        toast.add({ type: 'error', title: 'تعذّر الحذف', description: r.error });
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">دفتر الدفعات اليدوي — إيراد المنصّة، تجميع لكل عملة.</p>
        <Button onClick={() => setRecording(true)} disabled={restaurants.length === 0}>
          <Plus />
          تسجيل دفعة
        </Button>
      </div>

      {/* Revenue totals per currency */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {totals.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="text-muted-foreground py-6 text-center text-sm">
              لا توجد دفعات مسجّلة بعد.
            </CardContent>
          </Card>
        ) : (
          totals.map((t) => (
            <Card key={t.currency}>
              <CardContent className="flex items-center gap-3">
                <span className="bg-success/12 text-success-text flex size-11 shrink-0 items-center justify-center rounded-xl">
                  <Wallet className="size-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-h3 font-semibold tabular-nums leading-none" dir="ltr">
                    {formatMoney(t.total, t.currency)}
                  </p>
                  <p className="text-muted-foreground text-caption mt-1">{t.count} دفعة</p>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>

      {/* Renewals board */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="size-4" />
            التجديدات (متأخّرة + قريبة ≤٣٠ يوم)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {renewals.length === 0 ? (
            <p className="text-muted-foreground text-caption">لا تجديدات مستحقّة أو قريبة. 👍</p>
          ) : (
            <ul className="divide-border-lite divide-y text-sm">
              {renewals.map((r) => {
                const meta = BILLING_STATUS_META[r.status];
                const days = r.daysToRenewal;
                const when =
                  days == null
                    ? ''
                    : days < 0
                      ? `متأخّر ${Math.abs(days)} يوم`
                      : days === 0
                        ? 'اليوم'
                        : `خلال ${days} يوم`;
                return (
                  <li key={r.restaurant_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div className="flex items-center gap-2">
                      {r.status === 'overdue' && <AlertTriangle className="text-destructive-text size-4" aria-hidden />}
                      <Link
                        href={`/owner/dashboard/accounts/${r.restaurant_id}`}
                        className="hover:text-primary font-medium hover:underline"
                      >
                        {r.restaurant_name}
                      </Link>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                    </div>
                    <div className="text-muted-foreground text-caption flex items-center gap-2" dir="ltr">
                      <span>{fmtDate(r.currentPeriodEnd)}</span>
                      <span>·</span>
                      <span className="text-foreground">{when}</span>
                      {r.amount != null && r.currency && (
                        <>
                          <span>·</span>
                          <span className="font-mono">{formatMoney(r.amount, r.currency)}</span>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Ledger */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="size-4" />
            سجلّ الدفعات ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث بالمطعم أو الملاحظة…"
              className="min-w-48 flex-1"
              aria-label="ابحث في الدفعات"
            />
            <div className="w-40">
              <Select value={kindFilter} onValueChange={(v) => v && setKindFilter(v as typeof kindFilter)} items={kindFilterItems}>
                <SelectTrigger />
                <SelectContent>
                  {KIND_FILTER.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k === 'all' ? 'كل الأنواع' : PAYMENT_KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="text-muted-foreground text-caption py-4 text-center">لا دفعات مطابقة.</p>
          ) : (
            <div className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>المطعم</TableHead>
                    <TableHead>النوع</TableHead>
                    <TableHead>المبلغ</TableHead>
                    <TableHead>الدفع</TableHead>
                    <TableHead>الفترة حتى</TableHead>
                    <TableHead>ملاحظة</TableHead>
                    <TableHead className="text-end">—</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link
                          href={`/owner/dashboard/accounts/${p.restaurant_id}`}
                          className="hover:text-primary font-medium hover:underline"
                        >
                          {p.restaurant_name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="neutral">{PAYMENT_KIND_LABEL[p.kind]}</Badge>
                      </TableCell>
                      <TableCell dir="ltr" className="font-mono font-medium">{formatMoney(p.amount, p.currency)}</TableCell>
                      <TableCell dir="ltr" className="text-muted-foreground text-caption">{fmtDate(p.paid_at)}</TableCell>
                      <TableCell dir="ltr" className="text-muted-foreground text-caption">{fmtDate(p.period_end)}</TableCell>
                      <TableCell className="text-muted-foreground text-caption max-w-40 truncate">{p.note ?? '—'}</TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-destructive-text"
                            aria-label={`حذف دفعة «${p.restaurant_name}»`}
                            onClick={() => setConfirmDelete(p)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <RecordPaymentDialog
        restaurants={restaurants}
        open={recording}
        onClose={() => setRecording(false)}
        onRecorded={() => router.refresh()}
      />

      {confirmDelete && (
        <AlertDialog open onOpenChange={(v) => !v && setConfirmDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>حذف هذه الدفعة؟</AlertDialogTitle>
              <AlertDialogDescription>
                {formatMoney(confirmDelete.amount, confirmDelete.currency)} — «{confirmDelete.restaurant_name}» بتاريخ{' '}
                {fmtDate(confirmDelete.paid_at)}. تصحيح للدفتر لا يمكن التراجع عنه.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction variant="destructive" disabled={pending} onClick={() => onDelete(confirmDelete)}>
                {pending ? '...جارٍ' : 'حذف'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
