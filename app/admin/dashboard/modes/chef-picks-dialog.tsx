'use client';

import { useMemo, useState, useTransition } from 'react';
import { ChefHat, Search } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
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
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const allProducts = useMemo(
    () => categoryGroups.flatMap((g) => g.products),
    [categoryGroups],
  );

  const q = query.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!q) return categoryGroups.filter((g) => g.products.length > 0);
    return categoryGroups
      .map((g) => ({ ...g, products: g.products.filter((p) => p.name_ar.toLowerCase().includes(q)) }))
      .filter((g) => g.products.length > 0);
  }, [categoryGroups, q]);

  const allSelected = allProducts.length > 0 && selected.size === allProducts.length;

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
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
      <DialogContent className="flex max-h-[90vh] flex-col gap-4 overflow-hidden sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="bg-accent/20 text-accent-text flex size-9 items-center justify-center rounded-xl">
              <ChefHat className="size-4.5" aria-hidden />
            </span>
            <DialogTitle>اختيارات الشيف</DialogTitle>
          </div>
          <DialogDescription>
            الأصناف التي تظهر في قسم «اختيارات الشيف» أعلى المنيو في الوضع العادي — بدون خصم.
            اتركها فارغة لإخفاء القسم.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={onSubmit}
          role="group"
          aria-labelledby="chef-products-heading"
          className="flex min-h-0 flex-1 flex-col gap-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span id="chef-products-heading" className="text-sm font-medium">
              المنتجات <Badge variant={selected.size > 0 ? 'primary' : 'neutral'}>{selected.size} مختارة</Badge>
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
              {filteredGroups.map((g) => (
                <li key={g.id}>
                  <p className="text-muted-foreground mb-1 text-caption font-medium">{g.name_ar}</p>
                  <ul className="space-y-0.5">
                    {g.products.map((p) => (
                      <li key={p.id}>
                        <label className="hover:bg-muted flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5">
                          <Checkbox checked={selected.has(p.id)} onCheckedChange={(c) => toggle(p.id, c)} />
                          <span className={'text-sm ' + (p.is_available ? '' : 'text-muted-foreground')}>
                            {p.name_ar}
                            {!p.is_available && (
                              <span className="text-muted-foreground text-caption"> (غير متوفر)</span>
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

          {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}

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
