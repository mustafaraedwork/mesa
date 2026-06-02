'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Megaphone, Minus, Plus, Trash2, X } from 'lucide-react';
import {
  clearCart,
  getCart,
  setQuantity,
  subscribe,
  type Cart,
} from '@/lib/cart';
import { isRtl, parseLang, pickName, t, type Lang } from '@/lib/i18n';
import { CLOSING_VIRTUAL_CATEGORY_ID } from '@/lib/closing';
import type { MenuPayload, MenuProduct } from '@/lib/menu';
import { formatPrice } from '../menu-view';
import { MenuImage, PriceTag, formatAmount, nameLangProps, useReturnFocus, useSyncHtmlLang } from '../_ui';

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
  const router = useRouter();

  useSyncHtmlLang(lang);
  useReturnFocus(readModal); // return focus to the "read to waiter" button on close (2.4.3)

  // Step back one entry instead of forcing a fresh menu load, preserving the
  // diner's place. Deep-linked entries with no history fall back to the menu.
  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push(`/r/${slug}`);
  }

  /* eslint-disable react-hooks/set-state-in-effect --
     Both effects sync from client-only stores on mount (localStorage / cart):
     these reads can't run during SSR, so an effect is the correct home. */
  useEffect(() => {
    setLang(parseLang(window.localStorage.getItem(LANG_KEY)));
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
        // Q-15: guard against an unexpected/legacy payload shape before
        // committing it to state (the poll response is otherwise untyped).
        if (!cancelled && typeof json?.restaurant?.id === 'string') setData(json);
      } catch {
        // Silent retry on next tick.
      }
    };
    void tick(); // Q-7: fetch immediately on mount so the cart reflects fresh prices.
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
  // custom-typed cart items, (2) items from complementary categories,
  // (3) random fill from categories not represented in the cart.
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

    // Step 2 — items from categories complementary to the cart's categories.
    const complementIds = new Set<string>();
    for (const cat of data.categories) {
      if (cartCategoryIds.has(cat.id)) {
        for (const cid of cat.complement_ids) complementIds.add(cid);
      }
    }
    for (const cat of data.categories) {
      if (cat.id === CLOSING_VIRTUAL_CATEGORY_ID) continue;
      if (!complementIds.has(cat.id)) continue;
      for (const p of cat.products) tryAdd(p);
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

  const brand: CSSProperties = {
    ['--primary' as string]: r.primary_color,
    ['--ring' as string]: r.primary_color,
    background: r.background_color,
    color: r.text_color,
  };

  return (
    <main dir={dir} className="min-h-screen pb-32" style={brand}>
      <header
        className="shadow-card sticky top-0 z-20 flex items-center gap-2 px-gutter py-3"
        style={{ background: r.primary_color, color: '#fff' }}
      >
        <button
          type="button"
          onClick={goBack}
          className="-ms-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-medium hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <ArrowLeft className="h-5 w-5 rtl:-scale-x-100" aria-hidden />
          {t('back_to_menu', lang)}
        </button>
        <h1 className="flex-1 truncate text-base font-semibold">{t('cart_button', lang)}</h1>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-gutter py-4">
        {resolved.length === 0 ? (
          <div
            className="text-muted-foreground shadow-card flex flex-col items-center gap-3 rounded-2xl p-10 text-center"
            style={{ background: r.card_color }}
          >
            <Megaphone className="h-8 w-8 opacity-25" aria-hidden />
            <p className="text-body">{t('cart_empty', lang)}</p>
            <button
              type="button"
              onClick={goBack}
              className="text-primary text-body font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
            >
              {t('back_to_menu', lang)}
            </button>
          </div>
        ) : (
          <>
            <ul className="divide-y rounded-xl shadow-card" style={{ background: r.card_color }}>
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

            <div className="rounded-xl p-4 shadow-card" style={{ background: r.card_color }}>
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
                  card={r.card_color}
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
          className="shadow-lifted fixed bottom-4 left-1/2 z-30 flex min-h-12 -translate-x-1/2 items-center gap-2 rounded-full px-6 text-sm font-semibold text-white transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
          style={{ background: r.primary_color }}
        >
          <Megaphone className="h-5 w-5" aria-hidden />
          {t('read_to_waiter', lang)}
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
      <MenuImage
        src={product.image_url}
        alt={name}
        sizes="56px"
        className="h-14 w-14 shrink-0"
        rounded="rounded-lg"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium" {...nameLangProps(lang)}>{name}</div>
        <PriceTag
          price={formatAmount(product.price)}
          original={hasDiscount ? formatAmount(product.original_price!) : null}
          currency={currency}
          layout="inline"
        />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <div className="border-border-strong flex items-center gap-0.5 rounded-full border">
          <button
            type="button"
            onClick={onDecrease}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
            aria-label={t('qty_decrease', lang)}
          >
            <Minus className="h-4 w-4" aria-hidden />
          </button>
          <span className="w-7 text-center text-sm font-semibold tabular-nums">{quantity}</span>
          <button
            type="button"
            onClick={onIncrease}
            className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
            aria-label={t('qty_increase', lang)}
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold tabular-nums" style={{ color: primary }}>
            {formatPrice(lineTotal, currency)}
          </span>
          <button
            type="button"
            onClick={onRemove}
            className="text-muted-foreground hover:text-destructive flex h-8 items-center gap-1 text-caption focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive"
            aria-label={`${t('remove', lang)} — ${name}`}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
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
  card,
  currency,
  onAdd,
}: {
  product: MenuProduct;
  lang: Lang;
  primary: string;
  card: string;
  currency: string;
  onAdd: () => void;
}) {
  const name = pickName(product, lang);
  return (
    <button
      type="button"
      onClick={onAdd}
      className="border-border-lite shadow-card hover:shadow-lifted flex flex-col items-stretch overflow-hidden rounded-2xl border text-start transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
      style={{ background: card }}
    >
      <MenuImage
        src={product.image_url}
        alt={name}
        sizes="(max-width: 640px) 50vw, 160px"
        className="aspect-square w-full"
      />
      <div className="space-y-1 p-2">
        <div className="line-clamp-2 text-caption font-medium" {...nameLangProps(lang)}>{name}</div>
        <div className="font-mono text-caption font-bold tabular-nums" style={{ color: primary }}>
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
  const ref = useRef<HTMLDivElement>(null);

  // Dismiss on Escape + move focus in and trap Tab inside (WCAG 2.1.1 / 4.1.2).
  useEffect(() => {
    const node = ref.current;
    const focusables = node?.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])');
    focusables?.[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab' && focusables && focusables.length > 0) {
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-stretch justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="read-waiter-title"
        className="bg-background flex max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden sm:max-h-[90vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between gap-3 px-5 py-4"
          style={{ background: primary, color: '#fff' }}
        >
          <h2 id="read-waiter-title" className="flex items-center gap-2 text-lg font-bold">
            <Megaphone className="h-5 w-5" aria-hidden />
            {t('read_to_waiter', lang)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('back_to_menu', lang)}
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <X className="h-5 w-5" aria-hidden />
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
        <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
          <button
            type="button"
            onClick={onClear}
            className="text-destructive flex min-h-11 items-center gap-1.5 text-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            {t('remove', lang)}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="shadow-card flex min-h-11 items-center rounded-lg px-5 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
            style={{ background: primary }}
          >
            {t('back_to_menu', lang)}
          </button>
        </div>
      </div>
    </div>
  );
}
