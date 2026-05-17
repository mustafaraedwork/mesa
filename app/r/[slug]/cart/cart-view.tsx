'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  clearCart,
  getCart,
  setQuantity,
  subscribe,
  type Cart,
} from '@/lib/cart';
import { isRtl, pickName, t, type Lang } from '@/lib/i18n';
import { CLOSING_VIRTUAL_CATEGORY_ID } from '@/lib/closing';
import type { MenuPayload, MenuProduct } from '@/lib/menu';
import { formatPrice } from '../menu-view';

const LANG_KEY = 'mesa-lang';
const SUGGESTION_COUNT = 4;

type Resolved = { product: MenuProduct; quantity: number; lineTotal: number };

export function CartView({
  slug,
  initialData,
}: {
  slug: string;
  initialData: MenuPayload;
}) {
  const [data, setData] = useState<MenuPayload>(initialData);
  const [cart, setCart] = useState<Cart>({ items: [], updatedAt: 0 });
  const [lang, setLang] = useState<Lang>('ar');
  const [readModal, setReadModal] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect --
     Both effects sync from client-only stores on mount (localStorage / cart):
     these reads can't run during SSR, so an effect is the correct home. */
  useEffect(() => {
    const saved = (window.localStorage.getItem(LANG_KEY) ?? 'ar') as Lang;
    if (saved === 'ar' || saved === 'en' || saved === 'ku') setLang(saved);
  }, []);

  useEffect(() => {
    setCart(getCart(slug));
    return subscribe(slug, () => setCart(getCart(slug)));
  }, [slug]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Closing Mode Q5: cart always quotes the *current* menu price, matching
  // what the captain will charge. Poll on the same 30s cycle as the menu.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/menu/${slug}`, { cache: 'no-store' });
        if (!res.ok) return;
        const json = (await res.json()) as MenuPayload;
        if (!cancelled) setData(json);
      } catch {
        // Silent retry on next tick.
      }
    };
    const id = setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [slug]);

  // Build a flat product index from the menu, deduping the virtual closing
  // category (its products also appear in their original category).
  const productIndex = useMemo(() => {
    const idx = new Map<string, MenuProduct>();
    for (const cat of data.categories) {
      if (cat.id === CLOSING_VIRTUAL_CATEGORY_ID) continue;
      for (const p of cat.products) idx.set(p.id, p);
    }
    return idx;
  }, [data.categories]);

  // Resolve cart items against the live menu — drop entries whose product is
  // gone (deleted by tenant), preserve order of insertion.
  const resolved: Resolved[] = useMemo(() => {
    const out: Resolved[] = [];
    for (const it of cart.items) {
      const product = productIndex.get(it.product_id);
      if (!product) continue;
      out.push({
        product,
        quantity: it.quantity,
        lineTotal: product.price * it.quantity,
      });
    }
    return out;
  }, [cart, productIndex]);

  const total = resolved.reduce((s, r) => s + r.lineTotal, 0);
  const dir = isRtl(lang) ? 'rtl' : 'ltr';
  const r = data.restaurant;

  // Suggestions algorithm — PRD §3.2. Precedence: (1) manual suggestions for
  // custom-typed cart items, then (3) random fill from categories not in the
  // cart. Step 2 (complementary categories) lands in Phase 3.
  const suggestions = useMemo(() => {
    const cartIds = new Set(resolved.map((x) => x.product.id));
    const cartCategoryIds = new Set(resolved.map((x) => x.product.category_id));

    const picked: MenuProduct[] = [];
    const pickedIds = new Set<string>();
    const tryAdd = (p: MenuProduct | undefined) => {
      if (picked.length >= SUGGESTION_COUNT) return;
      if (!p || pickedIds.has(p.id) || cartIds.has(p.id) || !p.is_available) return;
      picked.push(p);
      pickedIds.add(p.id);
    };

    // Step 1 — manual suggestions for custom-typed items in the cart.
    for (const { product } of resolved) {
      if (product.suggestions_type !== 'custom') continue;
      for (const id of product.custom_suggestion_ids ?? []) tryAdd(productIndex.get(id));
    }

    // Step 3 — random fill from categories not represented in the cart.
    // The menu is already sorted per active mode (Q4) — preserve that order.
    for (const cat of data.categories) {
      if (cat.id === CLOSING_VIRTUAL_CATEGORY_ID) continue;
      if (cartCategoryIds.has(cat.id)) continue;
      for (const p of cat.products) tryAdd(p);
    }

    return picked.slice(0, SUGGESTION_COUNT);
  }, [data.categories, resolved, productIndex]);

  return (
    <main
      dir={dir}
      className="min-h-screen pb-32"
      style={{ background: r.background_color }}
    >
      <header
        className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 shadow"
        style={{ background: r.primary_color, color: '#fff' }}
      >
        <Link href={`/r/${slug}`} className="text-sm hover:underline">
          ← {t('back_to_menu', lang)}
        </Link>
        <h1 className="flex-1 truncate text-base font-semibold">{t('cart_button', lang)}</h1>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-4 py-4">
        {resolved.length === 0 ? (
          <p className="rounded-lg bg-white/70 p-6 text-center text-sm">{t('cart_empty', lang)}</p>
        ) : (
          <>
            <ul className="divide-y rounded-lg bg-white shadow-sm">
              {resolved.map((row) => (
                <CartRow
                  key={row.product.id}
                  row={row}
                  lang={lang}
                  primary={r.primary_color}
                  currency={r.currency}
                  onIncrease={() => setQuantity(slug, row.product.id, row.quantity + 1)}
                  onDecrease={() => setQuantity(slug, row.product.id, row.quantity - 1)}
                  onRemove={() => setQuantity(slug, row.product.id, 0)}
                />
              ))}
            </ul>

            <div className="rounded-lg bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-base font-semibold">
                <span>{t('cart_total', lang)}</span>
                <span style={{ color: r.primary_color }}>{formatPrice(total, r.currency)}</span>
              </div>
            </div>
          </>
        )}

        {resolved.length > 0 && suggestions.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-sm font-semibold" style={{ color: r.primary_color }}>
              {t('suggestions', lang)}
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {suggestions.map((p) => (
                <SuggestionCard
                  key={p.id}
                  product={p}
                  lang={lang}
                  primary={r.primary_color}
                  currency={r.currency}
                  onAdd={() => setQuantity(slug, p.id, 1)}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      {resolved.length > 0 && (
        <button
          type="button"
          onClick={() => setReadModal(true)}
          className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-full px-6 py-3 text-sm font-semibold text-white shadow-lg"
          style={{ background: r.primary_color }}
        >
          📣 {t('read_to_waiter', lang)}
        </button>
      )}

      {readModal && (
        <ReadToWaiterModal
          rows={resolved}
          total={total}
          lang={lang}
          currency={r.currency}
          primary={r.primary_color}
          onClose={() => setReadModal(false)}
          onClear={() => {
            clearCart(slug);
            setReadModal(false);
          }}
        />
      )}
    </main>
  );
}

function CartRow({
  row,
  lang,
  primary,
  currency,
  onIncrease,
  onDecrease,
  onRemove,
}: {
  row: Resolved;
  lang: Lang;
  primary: string;
  currency: string;
  onIncrease: () => void;
  onDecrease: () => void;
  onRemove: () => void;
}) {
  const { product, quantity, lineTotal } = row;
  const name = pickName(product, lang);
  const hasDiscount = product.discount_percent !== null && product.original_price !== null;
  return (
    <li className="flex items-center gap-3 p-3">
      {product.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.image_url}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-14 w-14 shrink-0 rounded object-cover"
        />
      ) : (
        <div
          className="h-14 w-14 shrink-0 rounded"
          style={{ background: primary, opacity: 0.15 }}
          aria-hidden
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{name}</div>
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          {hasDiscount && (
            <span className="line-through">
              {formatPrice(product.original_price!, currency)}
            </span>
          )}
          <span>{formatPrice(product.price, currency)}</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onDecrease}
            className="bg-muted/60 h-7 w-7 rounded text-base"
            aria-label={t('qty_decrease', lang)}
          >
            {t('qty_decrease', lang)}
          </button>
          <span className="w-6 text-center text-sm font-medium">{quantity}</span>
          <button
            type="button"
            onClick={onIncrease}
            className="bg-muted/60 h-7 w-7 rounded text-base"
            aria-label={t('qty_increase', lang)}
          >
            {t('qty_increase', lang)}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold" style={{ color: primary }}>
            {formatPrice(lineTotal, currency)}
          </span>
          <button
            type="button"
            onClick={onRemove}
            className="text-muted-foreground text-xs hover:text-rose-700"
          >
            {t('remove', lang)}
          </button>
        </div>
      </div>
    </li>
  );
}

function SuggestionCard({
  product,
  lang,
  primary,
  currency,
  onAdd,
}: {
  product: MenuProduct;
  lang: Lang;
  primary: string;
  currency: string;
  onAdd: () => void;
}) {
  const name = pickName(product, lang);
  return (
    <button
      type="button"
      onClick={onAdd}
      className="bg-card flex flex-col items-stretch overflow-hidden rounded-lg border text-start shadow-sm hover:shadow"
    >
      <div className="relative aspect-square">
        {product.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="h-full w-full"
            style={{ background: primary, opacity: 0.15 }}
            aria-hidden
          />
        )}
      </div>
      <div className="space-y-1 p-2">
        <div className="line-clamp-2 text-xs font-medium">{name}</div>
        <div className="text-xs font-bold" style={{ color: primary }}>
          {formatPrice(product.price, currency)}
        </div>
      </div>
    </button>
  );
}

function ReadToWaiterModal({
  rows,
  total,
  lang,
  currency,
  primary,
  onClose,
  onClear,
}: {
  rows: Resolved[];
  total: number;
  lang: Lang;
  currency: string;
  primary: string;
  onClose: () => void;
  onClear: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-40 flex items-stretch justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-background flex max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden sm:max-h-[90vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between gap-3 px-5 py-4"
          style={{ background: primary, color: '#fff' }}
        >
          <h2 className="text-lg font-bold">📣 {t('read_to_waiter', lang)}</h2>
          <button type="button" onClick={onClose} className="text-2xl leading-none">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <p className="text-muted-foreground mb-4 text-sm">{t('read_to_waiter_help', lang)}</p>
          <ul className="space-y-3">
            {rows.map((row) => (
              <li
                key={row.product.id}
                className="flex items-baseline justify-between gap-4 border-b pb-2"
              >
                <div className="text-2xl font-bold leading-snug">
                  <span style={{ color: primary }}>×{row.quantity}</span>{' '}
                  {pickName(row.product, lang)}
                </div>
                <div className="shrink-0 text-base text-muted-foreground">
                  {formatPrice(row.lineTotal, currency)}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex items-center justify-between border-t pt-4 text-xl font-bold">
            <span>{t('cart_total', lang)}</span>
            <span style={{ color: primary }}>{formatPrice(total, currency)}</span>
          </div>
        </div>
        <div className="flex justify-between gap-3 border-t px-5 py-3">
          <button
            type="button"
            onClick={onClear}
            className="text-sm text-rose-700 hover:underline"
          >
            🗑 {t('remove', lang)}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-white shadow"
            style={{ background: primary }}
          >
            {t('back_to_menu', lang)}
          </button>
        </div>
      </div>
    </div>
  );
}
