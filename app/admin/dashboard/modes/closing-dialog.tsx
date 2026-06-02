'use client';

import { useMemo, useState, useTransition } from 'react';
import { Search } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { applyDiscount, DISCOUNTS, type Discount } from '@/lib/closing';
import { setMode } from './actions';
import type { CategoryGroup } from './modes-view';

type Result = { ok: true; warnings?: string[] } | { ok: false; error: string; offending_ids?: string[] };

// Duration presets, in hours — chips that match the discount chips in weight
// instead of a raw OS range slider (F6). Bounded 1–24h by the action.
const DURATIONS: { hours: number; label: string }[] = [
  { hours: 1, label: 'ساعة' },
  { hours: 2, label: 'ساعتان' },
  { hours: 4, label: '٤ ساعات' },
  { hours: 6, label: '٦ ساعات' },
  { hours: 12, label: '١٢ ساعة' },
  { hours: 24, label: '٢٤ ساعة' },
];

function durationLabel(hours: number): string {
  return DURATIONS.find((d) => d.hours === hours)?.label ?? `${hours} ساعة`;
}

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
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [offendingIds, setOffendingIds] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
    setOffendingIds(new Set());
  }

  const totalSelected = selected.size;

  const allProducts = useMemo(
    () => categoryGroups.flatMap((g) => g.products),
    [categoryGroups],
  );

  // Filter by name for the list view; selection is by id so it survives search.
  const q = query.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!q) return categoryGroups.filter((g) => g.products.length > 0);
    return categoryGroups
      .map((g) => ({ ...g, products: g.products.filter((p) => p.name_ar.toLowerCase().includes(q)) }))
      .filter((g) => g.products.length > 0);
  }, [categoryGroups, q]);

  const allSelected = allProducts.length > 0 && totalSelected === allProducts.length;

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
      <DialogContent className="flex max-h-[90vh] flex-col gap-4 overflow-hidden sm:max-w-md">
        <DialogHeader>
          <DialogTitle>تفعيل وضع الإغلاق</DialogTitle>
          <DialogDescription>
            اختر الخصم والمدة والمنتجات. سيظهر قسم «اختيارات الشيف» أعلى المنيو، وتُحدَّث
            الأسعار فور التفعيل.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col gap-4">
          <Field label="نسبة الخصم" group>
            <div className="flex flex-wrap gap-2">
              {DISCOUNTS.map((d) => (
                <Button
                  key={d}
                  type="button"
                  size="sm"
                  aria-pressed={discount === d}
                  variant={discount === d ? 'default' : 'outline'}
                  onClick={() => setDiscount(d)}
                  className="min-w-14"
                >
                  {d}٪
                </Button>
              ))}
            </div>
          </Field>

          <Field label="المدة" group>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((d) => (
                <Button
                  key={d.hours}
                  type="button"
                  size="sm"
                  aria-pressed={duration === d.hours}
                  variant={duration === d.hours ? 'default' : 'outline'}
                  onClick={() => setDuration(d.hours)}
                >
                  {d.label}
                </Button>
              ))}
            </div>
            <output className="text-muted-foreground text-caption block">
              ينتهي العرض تلقائياً بعد {durationLabel(duration)}.
            </output>
          </Field>

          <div
            role="group"
            aria-labelledby="closing-products-heading"
            className="flex min-h-0 flex-1 flex-col gap-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span id="closing-products-heading" className="text-sm font-medium">
                المنتجات{' '}
                <Badge variant={totalSelected > 0 ? 'primary' : 'neutral'}>{totalSelected} مختارة</Badge>
              </span>
              <button
                type="button"
                className="text-primary text-caption underline-offset-2 hover:underline"
                onClick={() =>
                  setSelected(allSelected ? new Set() : new Set(allProducts.map((p) => p.id)))
                }
              >
                {allSelected ? 'إلغاء الكل' : 'اختيار الكل'}
              </button>
            </div>

            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2" aria-hidden />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث عن منتج…"
                className="ps-9"
                aria-label="ابحث عن منتج"
              />
            </div>

            {allProducts.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                لا توجد منتجات بعد. أضف منتجات من تبويب «المنيو».
              </p>
            ) : filteredGroups.length === 0 ? (
              <p className="text-muted-foreground text-sm">لا نتائج لـ «{query}».</p>
            ) : (
              <ul className="border-border-lite min-h-0 flex-1 space-y-3 overflow-y-auto rounded-lg border p-2">
                {filteredGroups.map((g) => {
                  const inCat = g.products.filter((p) => selected.has(p.id)).length;
                  return (
                    <li key={g.id}>
                      <p className="text-muted-foreground mb-1 flex items-center gap-1.5 text-caption font-medium">
                        {g.name_ar}
                        {inCat > 0 && <Badge variant="primary">{inCat}</Badge>}
                      </p>
                      <ul className="space-y-0.5">
                        {g.products.map((p) => {
                          const checked = selected.has(p.id);
                          const offending = offendingIds.has(p.id);
                          const newPrice = applyDiscount(p.price, discount, currency);
                          return (
                            <li key={p.id}>
                              <label
                                className={
                                  'flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 ' +
                                  (offending ? 'bg-destructive/10' : 'hover:bg-muted')
                                }
                              >
                                <span className="flex min-w-0 items-center gap-2.5">
                                  <Checkbox checked={checked} onCheckedChange={(c) => toggle(p.id, c)} />
                                  <span className={'truncate text-sm ' + (p.is_available ? '' : 'text-muted-foreground')}>
                                    {p.name_ar}
                                    {!p.is_available && (
                                      <span className="text-muted-foreground text-caption"> (غير متوفر)</span>
                                    )}
                                  </span>
                                </span>
                                <span dir="ltr" className="shrink-0 font-mono text-caption tabular-nums">
                                  {checked ? (
                                    <span className="text-primary font-semibold">
                                      {newPrice.toLocaleString('en-US')}{' '}
                                      <span className="text-muted-foreground font-normal line-through">
                                        {p.price.toLocaleString('en-US')}
                                      </span>
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">{p.price.toLocaleString('en-US')}</span>
                                  )}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}

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
