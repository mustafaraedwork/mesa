'use client';

import { useState, useTransition } from 'react';
import { KeyRound, MoreVertical, Plus, Search, Store, Trash2 } from 'lucide-react';
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
import { CreateAccountDialog } from './create-account-dialog';
import { ChangePasswordDialog } from './change-password-dialog';
import { DeleteAccountDialog } from './delete-account-dialog';
import { setAccountActive } from './actions';

export type AccountRow = {
  id: string;
  display_name: string;
  slug: string;
  username: string;
  is_active: boolean | null;
  created_at: string;
  last_login_at: string | null;
  product_count: number;
  category_count: number;
};

type DialogState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'changePassword'; account: AccountRow }
  | { kind: 'delete'; account: AccountRow };

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : '—');

export function AccountsTable({ accounts }: { accounts: AccountRow[] }) {
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [query, setQuery] = useState('');
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

  const q = query.trim().toLowerCase();
  const filtered = q
    ? accounts.filter(
        (a) =>
          a.display_name.toLowerCase().includes(q) ||
          a.slug.toLowerCase().includes(q) ||
          a.username.toLowerCase().includes(q),
      )
    : accounts;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-48 flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث بالاسم أو الـslug أو المستخدم…"
            className="ps-9"
            aria-label="ابحث في الحسابات"
          />
        </div>
        <Badge variant="neutral" className="text-sm">{filtered.length} حساب</Badge>
        <Button onClick={() => setDialog({ kind: 'create' })}>
          <Plus />
          حساب جديد
        </Button>
      </div>

      {accounts.length === 0 ? (
        <div className="bg-card border-border-lite flex flex-col items-center gap-3 rounded-xl border px-6 py-12 text-center">
          <div className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-2xl">
            <Store className="size-7" aria-hidden />
          </div>
          <p className="text-muted-foreground text-sm">
            لا توجد حسابات بعد — اضغط «حساب جديد» للبدء.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground bg-card border-border-lite rounded-xl border p-6 text-center text-sm">
          لا نتائج لـ «{query}».
        </p>
      ) : (
        <>
          {/* Desktop: data table with a sticky header. */}
          <div className="border-border-lite bg-card hidden overflow-hidden rounded-xl border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المطعم</TableHead>
                  <TableHead>المستخدم</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>المحتوى</TableHead>
                  <TableHead>آخر دخول</TableHead>
                  <TableHead className="text-end">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium">{a.display_name}</div>
                      <div className="text-muted-foreground text-caption" dir="ltr">/r/{a.slug}</div>
                    </TableCell>
                    <TableCell dir="ltr" className="font-mono text-sm">{a.username}</TableCell>
                    <TableCell>
                      <ActiveSwitch a={a} on={isActive(a)} busy={pending && pendingId === a.id} onToggle={() => toggleActive(a)} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-caption whitespace-nowrap">
                      <span className="text-foreground font-medium tabular-nums">{a.product_count}</span> منتج ·{' '}
                      <span className="text-foreground font-medium tabular-nums">{a.category_count}</span> سكشن
                    </TableCell>
                    <TableCell dir="ltr" className="text-muted-foreground text-caption">{fmtDate(a.last_login_at)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <RowMenu
                          a={a}
                          onChangePassword={() => setDialog({ kind: 'changePassword', account: a })}
                          onDelete={() => setDialog({ kind: 'delete', account: a })}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: a card per account instead of an 8-column horizontal scroll (M3). */}
          <ul className="space-y-3 md:hidden">
            {filtered.map((a) => (
              <li key={a.id} className="bg-card border-border-lite shadow-subtle rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{a.display_name}</p>
                    <p className="text-muted-foreground text-caption" dir="ltr">/r/{a.slug}</p>
                  </div>
                  <RowMenu
                    a={a}
                    onChangePassword={() => setDialog({ kind: 'changePassword', account: a })}
                    onDelete={() => setDialog({ kind: 'delete', account: a })}
                  />
                </div>
                <dl className="text-caption mt-3 grid grid-cols-2 gap-y-1.5">
                  <dt className="text-muted-foreground">المستخدم</dt>
                  <dd dir="ltr" className="text-end font-mono">{a.username}</dd>
                  <dt className="text-muted-foreground">المحتوى</dt>
                  <dd className="text-end tabular-nums">{a.product_count} منتج · {a.category_count} سكشن</dd>
                  <dt className="text-muted-foreground">آخر دخول</dt>
                  <dd dir="ltr" className="text-end">{fmtDate(a.last_login_at)}</dd>
                </dl>
                <div className="border-border-lite mt-3 flex items-center justify-between border-t pt-3">
                  <span className="text-muted-foreground text-caption">الحالة</span>
                  <ActiveSwitch a={a} on={isActive(a)} busy={pending && pendingId === a.id} onToggle={() => toggleActive(a)} withLabel />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <CreateAccountDialog open={dialog.kind === 'create'} onClose={() => setDialog({ kind: 'none' })} />
      {dialog.kind === 'changePassword' && (
        <ChangePasswordDialog
          key={dialog.account.id}
          account={dialog.account}
          onClose={() => setDialog({ kind: 'none' })}
        />
      )}
      {dialog.kind === 'delete' && (
        <DeleteAccountDialog account={dialog.account} onClose={() => setDialog({ kind: 'none' })} />
      )}
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
      {withLabel && (
        <Badge variant={on ? 'success' : 'neutral'}>{on ? 'نشط' : 'معطّل'}</Badge>
      )}
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
  onChangePassword,
  onDelete,
}: {
  a: AccountRow;
  onChangePassword: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`إجراءات «${a.display_name}»`} />}
      >
        <MoreVertical />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={onChangePassword}>
          <KeyRound />
          تغيير كلمة السر
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 />
          حذف الحساب
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
