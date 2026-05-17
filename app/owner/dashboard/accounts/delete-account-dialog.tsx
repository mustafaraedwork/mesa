'use client';

import { useState, useTransition } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { deleteAccount } from './actions';
import type { AccountRow } from './accounts-table';

export function DeleteAccountDialog({
  account,
  onClose,
}: {
  account: AccountRow;
  onClose: () => void;
}) {
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const expected = account.slug;
  const armed = confirm === expected;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!armed) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteAccount(account.id);
      if (!r.ok) setError(r.error);
      else onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>حذف الحساب نهائياً</DialogTitle>
            <DialogDescription>
              سيُحذف {account.display_name}، {account.product_count} منتجاً، {account.category_count} سكشناً،
              كل صور المنتجات من R2، وجميع الجلسات. لا يمكن التراجع.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label className="block text-sm">
              للتأكيد، اكتب الـslug: <code dir="ltr">{expected}</code>
            </label>
            <Input
              dir="ltr"
              className="text-left font-mono"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoFocus
            />
          </div>

          {error && <p role="alert" className="text-destructive text-sm">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="submit" variant="destructive" disabled={!armed || pending}>
              {pending ? '...جارٍ الحذف' : 'حذف نهائياً'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
