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
import { applyDiscount, DISCOUNTS, type Discount } from '@/lib/closing';
import { setMode } from './actions';
import type { CategoryGroup } from './modes-view';

type Result = { ok: true; warnings?: string[] } | { ok: false; error: string; offending_ids?: string[] };

export function ClosingDialog({
  categoryGroups,
  currency,
  initialSelection,
  initialDiscount,
  onClose,
  onResult,
}: {
  categoryGroups: CategoryGroup[];
  currency: string;
  initialSelection: string[];
  initialDiscount: Discount;
  onClose: () => void;
  onResult: (r: Result) => void;
}) {
  const [discount, setDiscount] = useState<Discount>(initialDiscount);
  const [duration, setDuration] = useState(2);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelection));
  const [error, setError] = useState<string | null>(null);
  const [offendingIds, setOffendingIds] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setOffendingIds(new Set());
  }

  const totalSelected = selected.size;

  const allProducts = useMemo(
    () => categoryGroups.flatMap((g) => g.products.map((p) => ({ ...p, category: g.name_ar }))),
    [categoryGroups],
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOffendingIds(new Set());

    if (selected.size === 0) {
      setError('اختر منتجاً واحداً على الأقل');
      return;
    }

    startTransition(async () => {
      const r = await setMode({
        mode: 'closing',
        closing: {
          product_ids: Array.from(selected),
          discount,
          duration_hours: duration,
        },
      });
      if (!r.ok) {
        setError(r.error);
        if (r.offending_ids) setOffendingIds(new Set(r.offending_ids));
      }
      onResult(r);
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>تفعيل وضع الإغلاق</DialogTitle>
            <DialogDescription>
              اختر المنتجات والخصم والمدة. سيظهر القسم &quot;عروض اليوم&quot; بأعلى المنيو
              تلقائياً، وستُحدَّث الأسعار في كل مكان فور التفعيل.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <Field label="الخصم">
              <div className="flex gap-1">
                {DISCOUNTS.map((d) => (
                  <Button
                    key={d}
                    type="button"
                    size="sm"
                    variant={discount === d ? 'default' : 'outline'}
                    onClick={() => setDiscount(d)}
                  >
                    {d}٪
                  </Button>
                ))}
              </div>
            </Field>
            <Field label="المدة (ساعة)">
              <input
                type="range"
                min={1}
                max={24}
                step={1}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full"
              />
              <p className="text-muted-foreground text-xs" dir="ltr">
                {duration} h
              </p>
            </Field>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">المنتجات ({totalSelected} مختارة)</p>
              <button
                type="button"
                className="text-primary text-xs underline"
                onClick={() =>
                  setSelected((prev) =>
                    prev.size === allProducts.length
                      ? new Set()
                      : new Set(allProducts.map((p) => p.id)),
                  )
                }
              >
                {totalSelected === allProducts.length ? 'إلغاء الكل' : 'اختيار الكل'}
              </button>
            </div>

            {categoryGroups.length === 0 || allProducts.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                لا توجد منتجات بعد. أضف منتجات من تبويب &quot;المنيو&quot;.
              </p>
            ) : (
              <ul className="max-h-72 space-y-3 overflow-y-auto rounded border p-2">
                {categoryGroups
                  .filter((g) => g.products.length > 0)
                  .map((g) => (
                    <li key={g.id}>
                      <p className="text-muted-foreground mb-1 text-xs font-medium">{g.name_ar}</p>
                      <ul className="space-y-1">
                        {g.products.map((p) => {
                          const checked = selected.has(p.id);
                          const offending = offendingIds.has(p.id);
                          const newPrice = applyDiscount(p.price, discount, currency);
                          return (
                            <li key={p.id}>
                              <label
                                className={
                                  'flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1 ' +
                                  (offending ? 'bg-destructive/10' : 'hover:bg-muted')
                                }
                              >
                                <span className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggle(p.id)}
                                  />
                                  <span className={p.is_available ? '' : 'text-muted-foreground'}>
                                    {p.name_ar}
                                    {!p.is_available && (
                                      <span className="text-muted-foreground text-xs"> (غير متوفر)</span>
                                    )}
                                  </span>
                                </span>
                                <span className="text-muted-foreground text-xs tabular-nums" dir="ltr">
                                  {p.price.toLocaleString('en-US')} → {newPrice.toLocaleString('en-US')}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          {error && <p role="alert" className="text-destructive text-sm">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
            <Button type="submit" disabled={pending || selected.size === 0}>
              {pending ? '...جارٍ التفعيل' : 'تفعيل العرض'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
