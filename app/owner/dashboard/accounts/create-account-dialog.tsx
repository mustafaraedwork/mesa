'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
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
import { Field } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { SUPPORTED_CURRENCIES } from '@/lib/currencies';
import { generateRandomPassword } from '@/lib/util/random-password';
import { createAccount } from './actions';
import { PLANS, PLAN_LABEL } from '@/lib/subscription';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

const todayISO = () => new Date().toISOString().slice(0, 10);

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
  const [currency, setCurrency] = useState('IQD');
  const [plan, setPlan] = useState('');
  const [branches, setBranches] = useState('1');
  // Optional initial ("تأسيس") payment.
  const [amount, setAmount] = useState('');
  const [paidAt, setPaidAt] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  const currencyItems = useMemo(
    () => Object.fromEntries(SUPPORTED_CURRENCIES.map((c) => [c.code, `${c.code} — ${c.label_ar}`])),
    [],
  );

  // Free text here would guarantee a runtime DB error: 0016 constrains `plan`
  // to exactly these three. '' is the "not chosen yet" option, sent as null.
  const planItems = useMemo(
    () => ({ '': '— بلا خطة —', ...Object.fromEntries(PLANS.map((p) => [p, PLAN_LABEL[p]])) }),
    [],
  );

  /* eslint-disable react-hooks/set-state-in-effect --
     Both effects deliberately set state: the first resets the dialog when it
     (re)opens — it stays mounted across opens, so a remount isn't an option;
     the second derives the slug from the display name until the user edits it. */
  // Reset on open.
  useEffect(() => {
    if (open) {
      setPhase('form');
      setDisplay('');
      setSlug('');
      setSlugTouched(false);
      setUsername('');
      setPassword(generateRandomPassword());
      setCurrency('IQD');
      setPlan('');
      setBranches('1');
      setAmount('');
      setPaidAt(todayISO());
      setPeriodEnd('');
      setError(null);
      setCopied(false);
    }
  }, [open]);

  // Auto-suggest slug from display name unless user edited it.
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(display));
  }, [display, slugTouched]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
    const branch_count = Number.parseInt(branches, 10);
    const amt = amount.trim() ? Number(amount) : 0;
    const initialPayment =
      amt > 0
        ? { amount: amt, currency, paid_at: paidAt, period_end: periodEnd.trim() || null }
        : null;
    startTransition(async () => {
      const result = await createAccount({
        display_name: display,
        slug,
        username,
        password,
        currency,
        plan,
        branch_count,
        initialPayment,
      });
      if (!result.ok) setError(result.error);
      else setPhase('created');
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {phase === 'form' ? (
          <form onSubmit={onSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>إنشاء مطعم جديد</DialogTitle>
              <DialogDescription>سيُولّد كلمة سر عشوائية تلقائياً.</DialogDescription>
            </DialogHeader>

            <Field label="اسم المطعم" required>
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
            <Field label="كلمة السر" group>
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

            <div className="grid grid-cols-2 gap-3">
              <Field label="العملة">
                <Select value={currency} onValueChange={(v) => v && setCurrency(v)} items={currencyItems}>
                  <SelectTrigger />
                  <SelectContent>
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.code} — {c.label_ar}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="عدد الفروع" hint="للتسعير فقط">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  dir="ltr"
                  className="text-left"
                  value={branches}
                  onChange={(e) => setBranches(e.target.value)}
                />
              </Field>
            </div>
            <Field label="الخطة" hint="الباقات السنوية بالدينار العراقي">
              <Select value={plan} onValueChange={(v) => setPlan(v ?? '')} items={planItems}>
                <SelectTrigger />
                <SelectContent>
                  <SelectItem value="">— بلا خطة —</SelectItem>
                  {PLANS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {PLAN_LABEL[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <fieldset className="border-border-lite space-y-3 rounded-lg border p-3">
              <legend className="text-caption text-muted-foreground px-1">
                دفعة التأسيس (اختياري — يمكن تسجيلها لاحقاً)
              </legend>
              <div className="grid grid-cols-2 gap-3">
                <Field label={`المبلغ (${currency})`}>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    dir="ltr"
                    className="text-left"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                  />
                </Field>
                <Field label="تاريخ الدفع">
                  <Input
                    type="date"
                    dir="ltr"
                    className="text-left"
                    value={paidAt}
                    onChange={(e) => setPaidAt(e.target.value)}
                  />
                </Field>
              </div>
              <Field label="نهاية الفترة" hint="اختياري — للتجديد السنوي">
                <Input
                  type="date"
                  dir="ltr"
                  className="text-left"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                />
              </Field>
            </fieldset>

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
