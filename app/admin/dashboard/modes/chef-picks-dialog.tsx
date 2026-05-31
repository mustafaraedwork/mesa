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
import { setChefPicks } from './actions';
import type { CategoryGroup } from './modes-view';

type Result = { ok: true } | { ok: false; error: string };

export function ChefPicksDialog({
  categoryGroups,
  initialSelection,
  onClose,
  onResult,
}: {
  categoryGroups: CategoryGroup[];
  initialSelection: string[];
  onClose: () => void;
  onResult: (r: Result) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelection));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const allProducts = useMemo(
    () => categoryGroups.flatMap((g) => g.products),
    [categoryGroups],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await setChefPicks(Array.from(selected));
      if (!r.ok) setError(r.error);
      onResult(r);
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>اختيارات الشيف</DialogTitle>
            <DialogDescription>
              اختر الأصناف التي تظهر في قسم &quot;اختيارات الشيف&quot; بأعلى المنيو في الوضع
              العادي. بدون خصم. اتركها فارغة لإخفاء القسم.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">المنتجات ({selected.size} مختارة)</p>
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
                {selected.size === allProducts.length && allProducts.length > 0
                  ? 'إلغاء الكل'
                  : 'اختيار الكل'}
              </button>
            </div>

            {allProducts.length === 0 ? (
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
                        {g.products.map((p) => (
                          <li key={p.id}>
                            <label className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded px-2 py-1">
                              <input
                                type="checkbox"
                                checked={selected.has(p.id)}
                                onChange={() => toggle(p.id)}
                              />
                              <span className={p.is_available ? '' : 'text-muted-foreground'}>
                                {p.name_ar}
                                {!p.is_available && (
                                  <span className="text-muted-foreground text-xs"> (غير متوفر)</span>
                                )}
                              </span>
                            </label>
                          </li>
                        ))}
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
            <Button type="submit" disabled={pending}>
              {pending ? '...جارٍ الحفظ' : 'حفظ'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
