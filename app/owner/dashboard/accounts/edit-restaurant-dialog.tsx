'use client';

import { useMemo, useState, useTransition } from 'react';
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
import { useToast } from '@/components/ui/toast';
import { SUPPORTED_CURRENCIES } from '@/lib/currencies';
import { updateRestaurant } from './actions';
import type { AccountRow } from './accounts-table';

export function EditRestaurantDialog({
  account,
  onClose,
}: {
  account: AccountRow;
  onClose: () => void;
}) {
  const [display, setDisplay] = useState(account.display_name);
  const [slug, setSlug] = useState(account.slug);
  const [username, setUsername] = useState(account.username);
  const [currency, setCurrency] = useState(account.currency);
  const [plan, setPlan] = useState(account.plan ?? '');
  const [branches, setBranches] = useState(String(account.branch_count));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const currencyItems = useMemo(
    () => Object.fromEntries(SUPPORTED_CURRENCIES.map((c) => [c.code, `${c.code} — ${c.label_ar}`])),
    [],
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const branch_count = Number.parseInt(branches, 10);
    startTransition(async () => {
      const r = await updateRestaurant(account.id, {
        display_name: display,
        slug,
        username,
        currency,
        plan,
        branch_count,
      });
      if (!r.ok) {
        setError(r.error);
      } else {
        toast.add({ type: 'success', title: `تم تحديث «${display.trim() || account.display_name}»` });
        onClose();
      }
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>تعديل بيانات المطعم</DialogTitle>
            <DialogDescription>كلمة السر تُغيّر من إجراء منفصل.</DialogDescription>
          </DialogHeader>

          <Field label="اسم المطعم" required>
            <Input value={display} onChange={(e) => setDisplay(e.target.value)} required autoFocus />
          </Field>
          <Field label="Slug (للرابط)" hint={`/r/${slug || '—'}`}>
            <Input dir="ltr" className="text-left" value={slug} onChange={(e) => setSlug(e.target.value)} required />
          </Field>
          <Field label="Username">
            <Input dir="ltr" className="text-left" value={username} onChange={(e) => setUsername(e.target.value)} required />
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
          <Field label="الخطة" hint="اسم اختياري (مثلاً basic / pro)">
            <Input value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="—" />
          </Field>

          {error && <p role="alert" className="text-destructive text-sm">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? '...جارٍ الحفظ' : 'حفظ'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
