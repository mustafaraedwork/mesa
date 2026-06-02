'use client';

import { useState, useTransition } from 'react';
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

// Destructive confirmation, unified on AlertDialog (K3): proper `role=alertdialog`,
// no stray close-X, focus pinned to the dialog. Replaces the old custom Dialog
// variant so every "are you sure?" in the app shares one treatment.
export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  destructive,
  run,
  onClose,
}: {
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  run: () => Promise<{ ok: true } | { ok: false; error: string }>;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const r = await run();
      if (!r.ok) setError(r.error);
      else onClose();
    });
  }

  return (
    <AlertDialog open onOpenChange={(v) => !v && !pending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending} onClick={onClose}>
            إلغاء
          </AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? 'destructive' : 'default'}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? '...' : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
