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
import { createAccount } from './actions';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

type Phase = 'form' | 'created';

export function CreateAccountDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('form');
  const [display, setDisplay] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  // Reset on open.
  useEffect(() => {
    if (open) {
      setPhase('form');
      setDisplay('');
      setSlug('');
      setSlugTouched(false);
      setUsername('');
      setPassword(generateRandomPassword());
      setError(null);
      setCopied(false);
    }
  }, [open]);

  // Auto-suggest slug from display name unless user edited it.
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(display));
  }, [display, slugTouched]);

  function onRegen() {
    setPassword(generateRandomPassword());
    setCopied(false);
  }

  async function copyCredentials() {
    const text = `Username: ${username}\nPassword: ${password}\nLink: /r/${slug}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createAccount({ display_name: display, slug, username, password });
      if (!result.ok) setError(result.error);
      else setPhase('created');
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        {phase === 'form' ? (
          <form onSubmit={onSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>إنشاء حساب جديد</DialogTitle>
              <DialogDescription>سيُولّد كلمة سر عشوائية تلقائياً.</DialogDescription>
            </DialogHeader>

            <Field label="اسم المطعم">
              <Input value={display} onChange={(e) => setDisplay(e.target.value)} required autoFocus />
            </Field>
            <Field label="Slug (للرابط)" hint={`/r/${slug || '—'}`}>
              <Input
                dir="ltr"
                className="text-left"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugTouched(true);
                }}
                required
              />
            </Field>
            <Field label="Username">
              <Input
                dir="ltr"
                className="text-left"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </Field>
            <Field label="كلمة السر">
              <div className="flex gap-2">
                <Input
                  dir="ltr"
                  className="text-left font-mono"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Button type="button" variant="outline" onClick={onRegen}>
                  توليد جديد
                </Button>
              </div>
            </Field>

            {error && <p role="alert" className="text-destructive text-sm">{error}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                إلغاء
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? '...جارٍ الإنشاء' : 'إنشاء'}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>تم إنشاء الحساب</DialogTitle>
              <DialogDescription>
                انسخ بيانات الدخول الآن — لن تظهر كلمة السر مرة أخرى.
              </DialogDescription>
            </DialogHeader>
            <pre
              dir="ltr"
              className="bg-muted rounded p-3 text-left text-xs font-mono whitespace-pre"
            >{`Username: ${username}\nPassword: ${password}\nLink: /r/${slug}`}</pre>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                إغلاق
              </Button>
              <Button onClick={copyCredentials}>
                {copied ? 'تم النسخ ✓' : 'نسخ بيانات الدخول'}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium">{label}</label>
      {children}
      {hint && <p className="text-muted-foreground text-xs" dir="ltr">{hint}</p>}
    </div>
  );
}
