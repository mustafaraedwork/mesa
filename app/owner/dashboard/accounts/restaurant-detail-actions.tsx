'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, KeyRound, Pencil, RotateCcw, Trash, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
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
import { EditRestaurantDialog } from './edit-restaurant-dialog';
import { ChangePasswordDialog } from './change-password-dialog';
import { DeleteAccountDialog } from './delete-account-dialog';
import { softDeleteAccount, restoreAccount } from './actions';
import type { AccountRow } from './accounts-table';

type Open = 'none' | 'edit' | 'password' | 'softDelete' | 'restore' | 'delete';

export function RestaurantDetailActions({ account }: { account: AccountRow }) {
  const [open, setOpen] = useState<Open>('none');
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const deleted = !!account.deleted_at;

  function runReversible(
    action: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>,
    okTitle: string,
  ) {
    startTransition(async () => {
      const r = await action(account.id);
      if (r.ok) {
        toast.add({ type: 'success', title: okTitle });
        setOpen('none');
        router.refresh();
      } else {
        toast.add({ type: 'error', title: 'فشل الإجراء', description: r.error });
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" render={<a href={`/r/${account.slug}`} target="_blank" rel="noopener noreferrer" />}>
        <ExternalLink className="rtl:-scale-x-100" />
        عرض المنيو
      </Button>

      {!deleted && (
        <>
          <Button variant="outline" size="sm" onClick={() => setOpen('edit')}>
            <Pencil />
            تعديل
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOpen('password')}>
            <KeyRound />
            كلمة السر
          </Button>
          <Button variant="outline" size="sm" onClick={() => setOpen('softDelete')}>
            <Trash />
            حذف
          </Button>
        </>
      )}
      {deleted && (
        <Button variant="outline" size="sm" onClick={() => setOpen('restore')}>
          <RotateCcw />
          استعادة
        </Button>
      )}
      <Button variant="ghost" size="sm" className="text-destructive-text" onClick={() => setOpen('delete')}>
        <Trash2 />
        حذف نهائي
      </Button>

      {open === 'edit' && <EditRestaurantDialog account={account} onClose={() => setOpen('none')} />}
      {open === 'password' && <ChangePasswordDialog account={account} onClose={() => setOpen('none')} />}
      {open === 'delete' && (
        <DeleteAccountDialog
          account={account}
          onClose={() => setOpen('none')}
          onDeleted={() => router.push('/owner/dashboard/accounts')}
        />
      )}

      {open === 'softDelete' && (
        <AlertDialog open onOpenChange={(v) => !v && setOpen('none')}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>حذف «{account.display_name}»؟</AlertDialogTitle>
              <AlertDialogDescription>
                سيُخفى عن الزبائن ويُمنع دخول صاحبه، وتبقى بياناته للاستعادة لاحقاً.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={pending}
                onClick={() => runReversible(softDeleteAccount, `تم حذف «${account.display_name}»`)}
              >
                {pending ? '...جارٍ' : 'حذف'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {open === 'restore' && (
        <AlertDialog open onOpenChange={(v) => !v && setOpen('none')}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>استعادة «{account.display_name}»؟</AlertDialogTitle>
              <AlertDialogDescription>سيعود للظهور بالحالة التي كان عليها — راجعها بعد الاستعادة.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction
                disabled={pending}
                onClick={() => runReversible(restoreAccount, `تمت استعادة «${account.display_name}»`)}
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
