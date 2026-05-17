'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
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

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  return new Date(iso).toISOString().slice(0, 10);
};

export function AccountsTable({ accounts }: { accounts: AccountRow[] }) {
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const [pendingId, startTransition] = useTransition();
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);

  function toggleActive(account: AccountRow) {
    setPendingTarget(account.id);
    startTransition(async () => {
      await setAccountActive(account.id, !account.is_active);
      setPendingTarget(null);
    });
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setDialog({ kind: 'create' })}>
          إنشاء حساب جديد
        </Button>
      </div>

      {accounts.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border bg-card p-6 text-center text-sm">
          لا توجد حسابات بعد — اضغط &quot;إنشاء حساب جديد&quot; للبدء.
        </p>
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>اسم المطعم</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead className="text-center">المنتجات</TableHead>
                <TableHead className="text-center">السكاشن</TableHead>
                <TableHead>تاريخ الإنشاء</TableHead>
                <TableHead>آخر دخول</TableHead>
                <TableHead className="text-end">الإجراءات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => {
                const busy = pendingId && pendingTarget === a.id;
                return (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium">{a.display_name}</div>
                      <div className="text-muted-foreground text-xs" dir="ltr">/r/{a.slug}</div>
                    </TableCell>
                    <TableCell dir="ltr" className="font-mono text-sm">{a.username}</TableCell>
                    <TableCell>
                      <span
                        className={
                          'rounded px-2 py-0.5 text-xs ' +
                          (a.is_active
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-muted text-muted-foreground')
                        }
                      >
                        {a.is_active ? 'نشط' : 'معطّل'}
                      </span>
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{a.product_count}</TableCell>
                    <TableCell className="text-center tabular-nums">{a.category_count}</TableCell>
                    <TableCell dir="ltr" className="text-muted-foreground text-xs">{fmtDate(a.created_at)}</TableCell>
                    <TableCell dir="ltr" className="text-muted-foreground text-xs">{fmtDate(a.last_login_at)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => toggleActive(a)}
                          disabled={Boolean(busy)}
                        >
                          {a.is_active ? 'تعطيل' : 'تفعيل'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDialog({ kind: 'changePassword', account: a })}
                        >
                          تغيير الباسوورد
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setDialog({ kind: 'delete', account: a })}
                        >
                          حذف
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateAccountDialog
        open={dialog.kind === 'create'}
        onClose={() => setDialog({ kind: 'none' })}
      />
      {dialog.kind === 'changePassword' && (
        <ChangePasswordDialog
          key={dialog.account.id}
          account={dialog.account}
          onClose={() => setDialog({ kind: 'none' })}
        />
      )}
      {dialog.kind === 'delete' && (
        <DeleteAccountDialog
          account={dialog.account}
          onClose={() => setDialog({ kind: 'none' })}
        />
      )}
    </>
  );
}
