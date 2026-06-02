'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { addComplement, removeComplement } from './actions';

type Cat = { id: string; name_ar: string; parent_id: string | null };
type Link = { id: string; category_id: string; complement_id: string };

export function ComplementarySection({
  categories,
  links,
}: {
  categories: Cat[];
  links: Link[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const nameOf = new Map(categories.map((c) => [c.id, c.name_ar]));

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const r = await action();
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-h3 font-semibold">الأصناف المكمّلة</h2>
        <p className="text-muted-foreground text-sm">
          عند وجود صنف من سكشن في سلة الزبون، تُقترح عليه أصناف من السكاشن المكمّلة له.
        </p>
      </div>

      {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}

      {categories.length === 0 ? (
        <p className="text-muted-foreground bg-card border-border-lite rounded-xl border p-6 text-center text-sm">
          أنشئ سكاشن أولاً من قسم المنيو.
        </p>
      ) : (
        <ul className="space-y-2">
          {categories.map((cat) => {
            const own = links.filter((l) => l.category_id === cat.id);
            const usedIds = new Set(own.map((l) => l.complement_id));
            const options = categories.filter((c) => c.id !== cat.id && !usedIds.has(c.id));
            return (
              <li key={cat.id} className="bg-card border-border-lite shadow-subtle rounded-xl border p-3">
                <p className="mb-2 font-medium">{cat.name_ar}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {own.length === 0 && (
                    <span className="text-muted-foreground text-caption">لا سكاشن مكمّلة</span>
                  )}
                  {own.map((l) => (
                    <span
                      key={l.id}
                      className="bg-muted text-foreground inline-flex items-center gap-1 rounded-full py-0.5 ps-3 pe-1 text-sm"
                    >
                      {nameOf.get(l.complement_id) ?? '—'}
                      <button
                        type="button"
                        disabled={pending}
                        className="text-muted-foreground hover:text-destructive-text hover:bg-destructive/10 flex size-6 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                        onClick={() => run(() => removeComplement(l.id))}
                        aria-label={`حذف ربط ${nameOf.get(l.complement_id) ?? ''}`}
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </span>
                  ))}
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={pending || options.length === 0}
                        />
                      }
                    >
                      <Plus />
                      صنف مكمّل
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {options.map((c) => (
                        <DropdownMenuItem
                          key={c.id}
                          onClick={() =>
                            run(() => addComplement({ category_id: cat.id, complement_id: c.id }))
                          }
                        >
                          {c.name_ar}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
