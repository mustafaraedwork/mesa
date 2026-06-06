'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  ArrowUpDown,
  KeyRound,
  MoreVertical,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Store,
  Trash,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/toast';
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
import { BILLING_STATUS_META, formatMoney, type RestaurantBilling } from '@/lib/billing';
import { CreateAccountDialog } from './create-account-dialog';
import { EditRestaurantDialog } from './edit-restaurant-dialog';
import { ChangePasswordDialog } from './change-password-dialog';
import { DeleteAccountDialog } from './delete-account-dialog';
import { setAccountActive, softDeleteAccount, restoreAccount } from './actions';

export type AccountRow = {
  id: string;
  display_name: string;
  slug: string;
  username: string;
  is_active: boolean | null;
  deleted_at: string | null;
  created_at: string;
  last_login_at: string | null;
  last_event_at: string | null;
  plan: string | null;
  branch_count: number;
  currency: string;
  product_count: number;
  category_count: number;
  billing: RestaurantBilling | null;
};

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; account: AccountRow }
  | { kind: 'changePassword'; account: AccountRow }
  | { kind: 'softDelete'; account: AccountRow }
  | { kind: 'restore'; account: AccountRow }
  | { kind: 'delete'; account: AccountRow };

type SortKey = 'created' | 'name' | 'plan' | 'active' | 'billing' | 'activity';
type SortState = { key: SortKey; dir: 'asc' | 'desc' };

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : '—');

// Most recent of admin login and diner activity, in ms (0 when never).
const lastActivityMs = (a: AccountRow) =>
  Math.max(
    a.last_login_at ? new Date(a.last_login_at).getTime() : 0,
    a.last_event_at ? new Date(a.last_event_at).getTime() : 0,
  );

// Most-urgent first: overdue → due-soon → active → none → (no billing).
const BILLING_RANK: Record<string, number> = { overdue: 0, 'due-soon': 1, active: 2, none: 3 };
const billingRank = (a: AccountRow) => (a.billing ? BILLING_RANK[a.billing.status] : 4);

export function AccountsTable({ accounts }: { accounts: AccountRow[] }) {
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [query, setQuery] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: 'created', dir: 'desc' });
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  // Optimistic active state — `setAccountActive` only revalidates server-side.
  const [override, setOverride] = useState<Record<string, boolean>>({});
  const toast = useToast();

  const isActive = (a: AccountRow) => override[a.id] ?? (a.is_active ?? false);

  function toggleActive(a: AccountRow) {
    const next = !isActive(a);
    setOverride((o) => ({ ...o, [a.id]: next }));
    setPendingId(a.id);
    startTransition(async () => {
      const r = await setAccountActive(a.id, next);
      setPendingId(null);
      if (r.ok) {
        toast.add({
          type: next ? 'success' : 'info',
          timeout: 2500,
          title: next ? `«${a.display_name}» مُفعّل` : `«${a.display_name}» معطّل`,
        });
      } else {
        setOverride((o) => ({ ...o, [a.id]: !next }));
        toast.add({ type: 'error', title: 'تعذّر تحديث الحالة', description: r.error });
      }
    });
  }

  function runReversible(
    a: AccountRow,
    action: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>,
    okTitle: string,
  ) {
    setPendingId(a.id);
    startTransition(async () => {
      const r = await action(a.id);
      setPendingId(null);
      if (r.ok) {
        toast.add({ type: 'success', title: okTitle });
        setDialog({ kind: 'none' });
      } else {
        toast.add({ type: 'error', title: 'فشل الإجراء', description: r.error });
      }
    });
  }

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'name' || key === 'plan' ? 'asc' : 'desc' },
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    let rows = accounts;
    if (!showDeleted) rows = rows.filter((a) => !a.deleted_at);
    if (q) {
      rows = rows.filter(
        (a) =>
          a.display_name.toLowerCase().includes(q) ||
          a.slug.toLowerCase().includes(q) ||
          a.username.toLowerCase().includes(q) ||
          (a.plan ?? '').toLowerCase().includes(q),
      );
    }
    const dir = sort.dir === 'asc' ? 1 : -1;
    const cmp = (a: AccountRow, b: AccountRow): number => {
      switch (sort.key) {
        case 'name':
          return a.display_name.localeCompare(b.display_name, 'ar') * dir;
        case 'plan':
          return ((a.plan ?? '').localeCompare(b.plan ?? '', 'ar') || a.branch_count - b.branch_count) * dir;
        case 'active':
          return (Number(isActive(a)) - Number(isActive(b))) * dir;
        case 'billing':
          return (billingRank(a) - billingRank(b)) * dir;
        case 'activity':
          return (lastActivityMs(a) - lastActivityMs(b)) * dir;
        case 'created':
        default:
          return a.created_at.localeCompare(b.created_at) * dir;
      }
    };
    return [...rows].sort(cmp);
    // isActive depends on `override`; include it so optimistic toggles re-sort.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, showDeleted, q, sort, override]);

  const deletedCount = accounts.filter((a) => a.deleted_at).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-48 flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث بالاسم أو الـslug أو المستخدم أو الخطة…"
            className="ps-9"
            aria-label="ابحث في المطاعم"
          />
        </div>
        <Badge variant="neutral" className="text-sm">{filtered.length} مطعم</Badge>
        {deletedCount > 0 && (
          <label className="text-muted-foreground flex items-center gap-2 text-sm">
            <Switch checked={showDeleted} onCheckedChange={setShowDeleted} aria-label="إظهار المحذوفة" />
            إظهار المحذوفة ({deletedCount})
          </label>
        )}
        <Button onClick={() => setDialog({ kind: 'create' })}>
          <Plus />
          مطعم جديد
        </Button>
      </div>

      {accounts.length === 0 ? (
        <div className="bg-card border-border-lite flex flex-col items-center gap-3 rounded-xl border px-6 py-12 text-center">
          <div className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-2xl">
            <Store className="size-7" aria-hidden />
          </div>
          <p className="text-muted-foreground text-sm">
            لا توجد مطاعم بعد — اضغط «مطعم جديد» للبدء.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground bg-card border-border-lite rounded-xl border p-6 text-center text-sm">
          لا نتائج.
        </p>
      ) : (
        <>
          {/* Desktop: data table with a sticky header. */}
          <div className="border-border-lite bg-card hidden overflow-hidden rounded-xl border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead label="المطعم" k="name" sort={sort} onSort={toggleSort} />
                  <SortHead label="الخطة" k="plan" sort={sort} onSort={toggleSort} />
                  <SortHead label="الحالة" k="active" sort={sort} onSort={toggleSort} />
                  <SortHead label="الفوترة" k="billing" sort={sort} onSort={toggleSort} />
                  <SortHead label="آخر نشاط" k="activity" sort={sort} onSort={toggleSort} />
                  <TableHead className="text-end">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => {
                  const deleted = !!a.deleted_at;
                  return (
                    <TableRow key={a.id} className={deleted ? 'opacity-55' : undefined}>
                      <TableCell>
                        <Link
                          href={`/owner/dashboard/accounts/${a.id}`}
                          className="hover:text-primary font-medium hover:underline"
                        >
                          {a.display_name}
                        </Link>
                        <div className="text-muted-foreground text-caption" dir="ltr">/r/{a.slug}</div>
                        <div className="text-muted-foreground text-caption">انضمّ {fmtDate(a.created_at)}</div>
                      </TableCell>
                      <TableCell className="text-caption">
                        {a.plan ? <span className="font-medium">{a.plan}</span> : <span className="text-muted-foreground">—</span>}
                        <div className="text-muted-foreground">
                          {a.branch_count} فرع · {a.currency}
                        </div>
                      </TableCell>
                      <TableCell>
                        {deleted ? (
                          <Badge variant="destructive">محذوف</Badge>
                        ) : (
                          <ActiveSwitch a={a} on={isActive(a)} busy={pending && pendingId === a.id} onToggle={() => toggleActive(a)} />
                        )}
                      </TableCell>
                      <TableCell>
                        <BillingCell billing={a.billing} />
                      </TableCell>
                      <TableCell className="text-caption">
                        <ActivityCell a={a} />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <RowMenu a={a} deleted={deleted} onAction={setDialog} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: a card per restaurant. */}
          <ul className="space-y-3 md:hidden">
            {filtered.map((a) => {
              const deleted = !!a.deleted_at;
              return (
                <li
                  key={a.id}
                  className={
                    'bg-card border-border-lite shadow-subtle rounded-xl border p-4 ' + (deleted ? 'opacity-60' : '')
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/owner/dashboard/accounts/${a.id}`}
                        className="hover:text-primary block truncate font-medium hover:underline"
                      >
                        {a.display_name}
                      </Link>
                      <p className="text-muted-foreground text-caption" dir="ltr">/r/{a.slug}</p>
                    </div>
                    <RowMenu a={a} deleted={deleted} onAction={setDialog} />
                  </div>
                  <dl className="text-caption mt-3 grid grid-cols-2 gap-y-1.5">
                    <dt className="text-muted-foreground">الخطة</dt>
                    <dd className="text-end">{a.plan ?? '—'} · {a.branch_count} فرع · {a.currency}</dd>
                    <dt className="text-muted-foreground">الفوترة</dt>
                    <dd className="flex justify-end"><BillingCell billing={a.billing} /></dd>
                    <dt className="text-muted-foreground">انضمّ</dt>
                    <dd dir="ltr" className="text-end">{fmtDate(a.created_at)}</dd>
                    <dt className="text-muted-foreground">آخر نشاط</dt>
                    <dd className="text-end"><ActivityCell a={a} /></dd>
                  </dl>
                  <div className="border-border-lite mt-3 flex items-center justify-between border-t pt-3">
                    <span className="text-muted-foreground text-caption">الحالة</span>
                    {deleted ? (
                      <Badge variant="destructive">محذوف</Badge>
                    ) : (
                      <ActiveSwitch a={a} on={isActive(a)} busy={pending && pendingId === a.id} onToggle={() => toggleActive(a)} withLabel />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <CreateAccountDialog open={dialog.kind === 'create'} onClose={() => setDialog({ kind: 'none' })} />
      {dialog.kind === 'edit' && (
        <EditRestaurantDialog key={dialog.account.id} account={dialog.account} onClose={() => setDialog({ kind: 'none' })} />
      )}
      {dialog.kind === 'changePassword' && (
        <ChangePasswordDialog key={dialog.account.id} account={dialog.account} onClose={() => setDialog({ kind: 'none' })} />
      )}
      {dialog.kind === 'delete' && (
        <DeleteAccountDialog account={dialog.account} onClose={() => setDialog({ kind: 'none' })} />
      )}

      {dialog.kind === 'softDelete' && (
        <AlertDialog open onOpenChange={(v) => !v && setDialog({ kind: 'none' })}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>حذف «{dialog.account.display_name}»؟</AlertDialogTitle>
              <AlertDialogDescription>
                سيُخفى المطعم عن الزبائن ويُمنع دخول صاحبه، لكن تبقى بياناته وصوره ويمكن استعادته لاحقاً.
                للحذف النهائي مع الصور استخدم «حذف نهائي».
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={pending}
                onClick={() => runReversible(dialog.account, softDeleteAccount, `تم حذف «${dialog.account.display_name}»`)}
              >
                {pending ? '...جارٍ' : 'حذف'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {dialog.kind === 'restore' && (
        <AlertDialog open onOpenChange={(v) => !v && setDialog({ kind: 'none' })}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>استعادة «{dialog.account.display_name}»؟</AlertDialogTitle>
              <AlertDialogDescription>
                سيعود المطعم للظهور. تنبيه: يبقى بالحالة التي كان عليها (مفعّل/معطّل) — راجعها بعد الاستعادة.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                disabled={pending}
                onClick={() => runReversible(dialog.account, restoreAccount, `تمت استعادة «${dialog.account.display_name}»`)}
              >
                {pending ? '...جارٍ' : 'استعادة'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

function SortHead({
  label,
  k,
  sort,
  onSort,
}: {
  label: string;
  k: SortKey;
  sort: SortState;
  onSort: (k: SortKey) => void;
}) {
  const active = sort.key === k;
  return (
    <TableHead>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={'inline-flex items-center gap-1 ' + (active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
        aria-label={`فرز حسب ${label}`}
      >
        {label}
        <ArrowUpDown className={'size-3.5 ' + (active ? 'opacity-100' : 'opacity-40')} aria-hidden />
      </button>
    </TableHead>
  );
}

function BillingCell({ billing }: { billing: RestaurantBilling | null }) {
  if (!billing || billing.paymentCount === 0) {
    return <span className="text-muted-foreground text-caption">بلا دفعات</span>;
  }
  const meta = BILLING_STATUS_META[billing.status];
  return (
    <div className="space-y-0.5">
      <Badge variant={meta.variant}>{meta.label}</Badge>
      {billing.currentPeriodEnd && (
        <div className="text-muted-foreground text-caption" dir="ltr">
          {new Date(billing.currentPeriodEnd).toISOString().slice(0, 10)}
          {billing.nextRenewalAmount != null && billing.nextRenewalCurrency
            ? ` · ${formatMoney(billing.nextRenewalAmount, billing.nextRenewalCurrency)}`
            : ''}
        </div>
      )}
    </div>
  );
}

function ActivityCell({ a }: { a: AccountRow }) {
  return (
    <div className="text-muted-foreground space-y-0.5">
      <div>
        دخول: <span dir="ltr" className="text-foreground">{fmtDate(a.last_login_at)}</span>
      </div>
      <div>
        زبائن: <span dir="ltr" className="text-foreground">{fmtDate(a.last_event_at)}</span>
      </div>
    </div>
  );
}

function ActiveSwitch({
  a,
  on,
  busy,
  onToggle,
  withLabel = false,
}: {
  a: AccountRow;
  on: boolean;
  busy: boolean;
  onToggle: () => void;
  withLabel?: boolean;
}) {
  return (
    <span className="flex items-center gap-2">
      {withLabel && <Badge variant={on ? 'success' : 'neutral'}>{on ? 'نشط' : 'معطّل'}</Badge>}
      <Switch
        checked={on}
        disabled={busy}
        onCheckedChange={onToggle}
        aria-label={`${on ? 'تعطيل' : 'تفعيل'} «${a.display_name}»`}
      />
    </span>
  );
}

function RowMenu({
  a,
  deleted,
  onAction,
}: {
  a: AccountRow;
  deleted: boolean;
  onAction: (d: DialogState) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`إجراءات «${a.display_name}»`} />}
      >
        <MoreVertical />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {!deleted && (
          <>
            <DropdownMenuItem onClick={() => onAction({ kind: 'edit', account: a })}>
              <Pencil />
              تعديل البيانات
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAction({ kind: 'changePassword', account: a })}>
              <KeyRound />
              تغيير كلمة السر
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onAction({ kind: 'softDelete', account: a })}>
              <Trash />
              حذف (قابل للاستعادة)
            </DropdownMenuItem>
          </>
        )}
        {deleted && (
          <DropdownMenuItem onClick={() => onAction({ kind: 'restore', account: a })}>
            <RotateCcw />
            استعادة
          </DropdownMenuItem>
        )}
        <DropdownMenuItem variant="destructive" onClick={() => onAction({ kind: 'delete', account: a })}>
          <Trash2 />
          حذف نهائي
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
