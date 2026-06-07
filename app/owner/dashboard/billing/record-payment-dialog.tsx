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
import { PAYMENT_KINDS, PAYMENT_KIND_LABEL, type PaymentKind } from '@/lib/billing';
import { recordPayment } from './actions';

export type BillingRestaurant = { id: string; display_name: string; currency: string };

const todayISO = () => new Date().toISOString().slice(0, 10);

export function RecordPaymentDialog({
  restaurants,
  fixedRestaurantId,
  open,
  onClose,
  onRecorded,
}: {
  restaurants: BillingRestaurant[];
  fixedRestaurantId?: string;
  open: boolean;
  onClose: () => void;
  onRecorded?: () => void;
}) {
  const initialId = fixedRestaurantId ?? restaurants[0]?.id ?? '';
  const initialCurrency = restaurants.find((r) => r.id === initialId)?.currency ?? 'IQD';

  const [restaurantId, setRestaurantId] = useState(initialId);
  const [kind, setKind] = useState<PaymentKind>('renewal');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(initialCurrency);
  const [paidAt, setPaidAt] = useState(todayISO());
  const [periodEnd, setPeriodEnd] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const restaurantItems = useMemo(
    () => Object.fromEntries(restaurants.map((r) => [r.id, r.display_name])),
    [restaurants],
  );
  const currencyItems = useMemo(
    () => Object.fromEntries(SUPPORTED_CURRENCIES.map((c) => [c.code, `${c.code} — ${c.label_ar}`])),
    [],
  );
  const kindItems = useMemo(
    () => Object.fromEntries(PAYMENT_KINDS.map((k) => [k, PAYMENT_KIND_LABEL[k]])),
    [],
  );

  const fixedName = fixedRestaurantId ? restaurants.find((r) => r.id === fixedRestaurantId)?.display_name : null;

  function onPickRestaurant(v: string) {
    setRestaurantId(v);
    const cur = restaurants.find((r) => r.id === v)?.currency;
    if (cur) setCurrency(cur);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!restaurantId) {
      setError('اختر المطعم');
      return;
    }
    startTransition(async () => {
      const r = await recordPayment({
        restaurant_id: restaurantId,
        kind,
        amount: amount.trim() ? Number(amount) : NaN,
        currency,
        paid_at: paidAt,
        period_end: periodEnd.trim() || null,
        note: note.trim() || null,
      });
      if (!r.ok) {
        setError(r.error);
      } else {
        toast.add({ type: 'success', title: 'تم تسجيل الدفعة' });
        onRecorded?.();
        onClose();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>تسجيل دفعة</DialogTitle>
            <DialogDescription>
              {fixedName ? `للمطعم: ${fixedName}` : 'دفتر يدوي — تُسجّل ما استُلم فعلاً (offline).'}
            </DialogDescription>
          </DialogHeader>

          {!fixedRestaurantId && (
            <Field label="المطعم" required>
              <Select value={restaurantId} onValueChange={(v) => v && onPickRestaurant(v)} items={restaurantItems}>
                <SelectTrigger placeholder="اختر المطعم" />
                <SelectContent>
                  {restaurants.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="النوع">
              <Select value={kind} onValueChange={(v) => v && setKind(v as PaymentKind)} items={kindItems}>
                <SelectTrigger />
                <SelectContent>
                  {PAYMENT_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {PAYMENT_KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label={`المبلغ (${currency})`} required>
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                dir="ltr"
                className="text-left"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                autoFocus
              />
            </Field>
            <Field label="تاريخ الدفع" required>
              <Input type="date" dir="ltr" className="text-left" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} required />
            </Field>
          </div>

          <Field label="نهاية الفترة" hint="اختياري — للتجديد السنوي (يحدّد «التجديد القادم»)">
            <Input type="date" dir="ltr" className="text-left" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </Field>
          <Field label="ملاحظة" hint="اختياري — مرجع التحويل/الإيصال">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="—" />
          </Field>

          {error && <p role="alert" className="text-destructive text-sm">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? '...جارٍ التسجيل' : 'تسجيل'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
