'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Megaphone, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import {
  addToCart,
  clearCart,
  getCart,
  setQuantity,
  subscribe,
  type Cart,
} from '@/lib/cart';
import { isRtl, parseLang, resolveName, t, type Lang } from '@/lib/i18n';
import { readableTextOn } from '@/lib/contrast';
import { CLOSING_VIRTUAL_CATEGORY_ID } from '@/lib/closing';
import type { MenuPayload, MenuProduct } from '@/lib/menu';
import { pickSuggestions } from '@/lib/suggestions';
import { formatPrice } from '../menu-view';
import { MenuImage, OfflineBanner, PriceTag, SuggestionCard, formatAmount, nameLangProps, useReturnFocus, useSyncHtmlLang } from '../_ui';

const LANG_KEY = 'mesa-lang';

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
  const [clearConfirm, setClearConfirm] = useState(false); // L2: two-step page-level clear
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

  // Suggestions — PRD §3.2, seeded with everything currently in the basket.
  // Shared with the product page (which seeds it with the one item on screen)
  // so both surfaces show the same pairings from the same rules.
  const suggestions = useMemo(
    () => pickSuggestions(data.categories, resolved.map((x) => x.product)),
    [data.categories, resolved],
  );

  const brand: CSSProperties = {
    ['--primary' as string]: r.primary_color,
    ['--primary-foreground' as string]: readableTextOn(r.primary_color),
    ['--ring' as string]: r.primary_color,
    background: r.background_color,
    color: r.text_color,
  };

  return (
    <main dir={dir} className="min-h-screen pb-40" style={brand}>
      <a
        href="#cart-content"
        className="bg-card sr-only rounded-lg focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:px-3 focus:py-2 focus:shadow-modal focus:outline-2 focus:outline-[--ring]"
      >
        {t('skip_to_content', lang)}
      </a>
      <OfflineBanner lang={lang} />
      <header
        className="shadow-card sticky top-0 z-20 flex items-center gap-2 px-gutter py-3"
        style={{ background: r.primary_color, color: 'var(--primary-foreground)' }}
      >
        <button
          type="button"
          onClick={goBack}
          className="-ms-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-medium hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        >
          <ArrowLeft className="h-5 w-5 rtl:-scale-x-100" aria-hidden />
          {t('back_to_menu', lang)}
        </button>
        <h1 className="flex-1 truncate text-base font-semibold">{t('cart_button', lang)}</h1>
      </header>

      <div id="cart-content" className="mx-auto max-w-3xl space-y-6 px-gutter py-4">
        {resolved.length === 0 ? (
          <div
            className="text-muted-foreground shadow-card flex flex-col items-center gap-3 rounded-2xl p-10 text-center"
            style={{ background: r.card_color }}
          >
            <ShoppingBag className="h-8 w-8 opacity-25" aria-hidden />
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
                <span dir="ltr" style={{ color: r.primary_color }}>{formatPrice(total, r.currency, lang)}</span>
              </div>
            </div>

            {/* L2: quick clear straight from the cart page — two-step so a stray tap
                never wipes the order. Reverts to the calm label on any re-render away. */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => (clearConfirm ? (clearCart(slug), setClearConfirm(false)) : setClearConfirm(true))}
                onBlur={() => setClearConfirm(false)}
                className={
                  'inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring] ' +
                  (clearConfirm
                    ? 'bg-destructive/10 text-destructive-text'
                    : 'text-muted-foreground hover:text-destructive-text')
                }
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                {clearConfirm ? t('clear_cart_confirm', lang) : t('clear_cart', lang)}
              </button>
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
                  card={r.card_color}
                  currency={r.currency}
                  onAdd={() => addToCart(slug, p.id)}
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
  const resolved = resolveName(product, lang);
  const name = resolved.text;
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
        <div className="truncate font-medium" {...nameLangProps(resolved.lang)}>{name}</div>
        <PriceTag
          price={formatAmount(product.price)}
          original={hasDiscount ? formatAmount(product.original_price!) : null}
          currency={currency}
          lang={lang}
          layout="inline"
        />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <div className="border-border-strong flex items-center gap-0.5 rounded-full border">
          <button
            type="button"
            onClick={onDecrease}
            className="flex h-10 w-10 items-center justify-center rounded-full transition-transform hover:bg-muted active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
            aria-label={t('qty_decrease', lang)}
          >
            <Minus className="h-4 w-4" aria-hidden />
          </button>
          <span className="w-7 text-center text-sm font-semibold tabular-nums">{quantity}</span>
          <button
            type="button"
            onClick={onIncrease}
            className="flex h-10 w-10 items-center justify-center rounded-full transition-transform hover:bg-muted active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
            aria-label={t('qty_increase', lang)}
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span dir="ltr" className="text-sm font-bold tabular-nums" style={{ color: primary }}>
            {formatPrice(lineTotal, currency, lang)}
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
  // Two-step confirm so a stray tap can't wipe the whole order with no undo (H8).
  const [confirmClear, setConfirmClear] = useState(false);
  // M15: a unit count the captain can cross-check at a glance.
  const units = rows.reduce((s, row) => s + row.quantity, 0);

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
          style={{ background: primary, color: 'var(--primary-foreground)' }}
        >
          <h2 id="read-waiter-title" className="flex items-center gap-2 text-lg font-bold">
            <Megaphone className="h-5 w-5" aria-hidden />
            {t('read_to_waiter', lang)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close', lang)}
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <p className="text-muted-foreground mb-4 text-sm">{t('read_to_waiter_help', lang)}</p>
          <ul className="space-y-3">
            {rows.map((row) => {
              const rn = resolveName(row.product, lang);
              return (
                <li
                  key={row.product.id}
                  className="flex items-baseline justify-between gap-4 border-b pb-2"
                >
                  <div className="text-2xl font-bold leading-snug">
                    <span style={{ color: primary }}>×{row.quantity}</span>{' '}
                    <span {...nameLangProps(rn.lang)}>{rn.text}</span>
                  </div>
                  <div dir="ltr" className="text-foreground shrink-0 text-lg font-bold">
                    {formatPrice(row.lineTotal, currency, lang)}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-6 flex items-center justify-between border-t pt-4 text-xl font-bold">
            <span>
              {t('cart_total', lang)}{' '}
              <span className="text-muted-foreground text-sm font-normal">
                · <span dir="ltr" className="tabular-nums">{units}</span> {t('pieces', lang)}
              </span>
            </span>
            <span dir="ltr" style={{ color: primary }}>{formatPrice(total, currency, lang)}</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
          <button
            type="button"
            onClick={() => (confirmClear ? onClear() : setConfirmClear(true))}
            aria-label={confirmClear ? t('clear_cart_confirm', lang) : t('clear_cart', lang)}
            className={
              'flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive ' +
              (confirmClear
                ? 'bg-destructive/10 text-destructive-text font-semibold'
                : 'text-destructive-text hover:bg-destructive/10')
            }
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            {confirmClear ? t('clear_cart_confirm', lang) : t('clear_cart', lang)}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="shadow-card flex min-h-11 items-center rounded-lg px-5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
            style={{ background: primary, color: 'var(--primary-foreground)' }}
          >
            {t('done', lang)}
          </button>
        </div>
      </div>
    </div>
  );
}
