'use client';

import { useEffect, useState, useTransition } from 'react';
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
import { generateRandomPassword } from '@/lib/util/random-password';
import { changeAccountPassword } from './actions';
import type { AccountRow } from './accounts-table';

export function ChangePasswordDialog({
  account,
  onClose,
}: {
  account: AccountRow;
  onClose: () => void;
}) {
  const [password, setPassword] = useState(() => generateRandomPassword());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setPassword(generateRandomPassword());
    setError(null);
    setCopied(false);
    setDone(false);
  }, [account.id]);

  async function copy() {
    const text = `Username: ${account.username}\nPassword: ${password}\nLink: /r/${account.slug}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await changeAccountPassword(account.id, password);
      if (!r.ok) setError(r.error);
      else setDone(true);
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تغيير كلمة السر — {account.display_name}</DialogTitle>
          <DialogDescription>
            ستُلغى جميع جلسات هذا الحساب فور الحفظ.
          </DialogDescription>
        </DialogHeader>

        {!done ? (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="flex gap-2">
              <Input
                dir="ltr"
                className="text-left font-mono"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Button type="button" variant="outline" onClick={() => setPassword(generateRandomPassword())}>
                توليد جديد
              </Button>
            </div>
            {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                إلغاء
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? '...جارٍ الحفظ' : 'حفظ كلمة السر الجديدة'}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4">
            <pre
              dir="ltr"
              className="bg-muted rounded p-3 text-left text-xs font-mono whitespace-pre"
            >{`Username: ${account.username}\nPassword: ${password}\nLink: /r/${account.slug}`}</pre>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>إغلاق</Button>
              <Button onClick={copy}>
                {copied ? 'تم النسخ ✓' : 'نسخ بيانات الدخول'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
