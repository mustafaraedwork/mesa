'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
        <h2 className="text-lg font-semibold">الأصناف المكمّلة</h2>
        <p className="text-muted-foreground text-sm">
          عند وجود صنف من سكشن في سلة الزبون، تُقترح عليه أصناف من السكاشن المكمّلة له.
        </p>
      </div>

      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}

      {categories.length === 0 ? (
        <p className="text-muted-foreground bg-card rounded-lg border p-6 text-center text-sm">
          أنشئ سكاشن أولاً من قسم المنيو.
        </p>
      ) : (
        <ul className="space-y-2">
          {categories.map((cat) => {
            const own = links.filter((l) => l.category_id === cat.id);
            const usedIds = new Set(own.map((l) => l.complement_id));
            const options = categories.filter((c) => c.id !== cat.id && !usedIds.has(c.id));
            return (
              <li key={cat.id} className="bg-card rounded-lg border p-3">
                <p className="mb-2 font-medium">{cat.name_ar}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {own.length === 0 && (
                    <span className="text-muted-foreground text-xs">لا سكاشن مكمّلة</span>
                  )}
                  {own.map((l) => (
                    <span
                      key={l.id}
                      className="bg-muted flex items-center gap-1 rounded px-2 py-0.5 text-sm"
                    >
                      {nameOf.get(l.complement_id) ?? '—'}
                      <button
                        type="button"
                        disabled={pending}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => run(() => removeComplement(l.id))}
                        aria-label="حذف الربط"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <select
                    value=""
                    disabled={pending || options.length === 0}
                    className="rounded-md border px-2 py-1 text-sm"
                    onChange={(e) => {
                      const complement_id = e.target.value;
                      if (complement_id) {
                        run(() => addComplement({ category_id: cat.id, complement_id }));
                      }
                    }}
                  >
                    <option value="">+ أضف صنفاً مكمّلاً</option>
                    {options.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name_ar}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
