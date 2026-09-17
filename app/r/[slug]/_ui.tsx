'use client';

// Shared diner-surface UI primitives (Phase 1 redesign).
// Keep these presentational + dependency-light: menu/product/cart all import them.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { Star, UtensilsCrossed, WifiOff } from 'lucide-react';
import { bcp47, currencyLabel, isRtl, resolveName, t, type Lang } from '@/lib/i18n';
import type { MenuProduct } from '@/lib/menu';

/**
 * Return focus to whatever was focused before a dialog/popup opened, once it
 * closes (WCAG 2.4.3). Call from the component that owns the open/closed state
 * (so it stays mounted across the transition) — captures `document.activeElement`
 * on open and restores it on close.
 */
export function useReturnFocus(isOpen: boolean) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      triggerRef.current = (document.activeElement as HTMLElement | null) ?? null;
    } else if (!isOpen && wasOpen.current) {
      triggerRef.current?.focus?.();
      triggerRef.current = null;
    }
    wasOpen.current = isOpen;
  }, [isOpen]);
}

/**
 * Keep the document's lang/dir in sync with the diner's chosen language so
 * assistive tech announces English/Kurdish content with the right rules and
 * the whole page mirrors correctly (WCAG 3.1.2 / 1.3.2). The root layout ships
 * lang="ar" dir="rtl"; this updates it on the client once a language is known.
 */
export function useSyncHtmlLang(lang: Lang) {
  useEffect(() => {
    const el = document.documentElement;
    const prevLang = el.lang;
    const prevDir = el.dir;
    el.lang = bcp47(lang);
    el.dir = isRtl(lang) ? 'rtl' : 'ltr';
    return () => {
      el.lang = prevLang;
      el.dir = prevDir;
    };
  }, [lang]);
}

/** Group a numeric amount with Western digits (e.g. 12000 → "12,000"). */
export function formatAmount(value: number): string {
  return value.toLocaleString('en-US');
}

/** Closing-offer end time in Baghdad time (UTC+3), e.g. "10:45 م" / "10:45 PM" (H7). */
export function formatTimeBaghdad(iso: string, lang: Lang): string {
  try {
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'ar', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Baghdad',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

/** Span props that declare a localized string's language for screen readers.
 *  Uses the BCP-47 tag (Kurdish `ku` → `ckb`) so AT/shaping is correct (M16). */
export function nameLangProps(lang: Lang) {
  return { lang: bcp47(lang), dir: isRtl(lang) ? ('rtl' as const) : ('ltr' as const) };
}

/** Reactive online/offline flag (M9) — concurrent-safe via useSyncExternalStore. */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb);
      window.addEventListener('offline', cb);
      return () => {
        window.removeEventListener('online', cb);
        window.removeEventListener('offline', cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

/** Thin banner shown while offline, telling the diner the menu may be stale (M9). */
export function OfflineBanner({ lang }: { lang: Lang }) {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      role="status"
      className="bg-warning/15 text-warning-text flex items-center justify-center gap-2 px-gutter py-1.5 text-center text-caption font-medium"
    >
      <WifiOff className="size-3.5 shrink-0" aria-hidden />
      {t('offline_banner', lang)}
    </div>
  );
}

/**
 * Product image via next/image (responsive srcset + lazy + no CLS), with a
 * designed fallback for the common "no photo" case. The container owns the
 * aspect ratio / rounding via `className`.
 */
export function MenuImage({
  src,
  alt,
  sizes,
  className = '',
  priority = false,
  rounded = '',
}: {
  src: string | null;
  alt: string;
  sizes: string;
  className?: string;
  priority?: boolean;
  rounded?: string;
}) {
  // M11: fade the photo in on decode instead of a hard grey-box → image pop.
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`relative overflow-hidden bg-black/[0.04] ${rounded} ${className}`}>
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          loading={priority ? undefined : 'lazy'}
          onLoad={() => setLoaded(true)}
          className={
            // 200ms, not 500: the fade runs *after* the bytes land, so a long
            // one reads as the page still loading. Short enough to hide the
            // grey-box pop, quick enough to feel immediate.
            'object-cover transition-opacity duration-200 [transition-timing-function:var(--ease-out-expo)] ' +
            (loaded ? 'opacity-100' : 'opacity-0')
          }
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <UtensilsCrossed className="h-1/4 w-1/4 max-h-10 max-w-10 text-foreground/15" aria-hidden />
        </div>
      )}
    </div>
  );
}

/** Limited-time discount marker. Semantic (fixed red) — never re-skinned per brand.
 *  L6: a deterministic aria-label so the −% glyph is announced as "خصم N%". */
export function DiscountBadge({
  percent,
  lang = 'ar',
  className = '',
}: {
  percent: number;
  lang?: Lang;
  className?: string;
}) {
  return (
    <span
      aria-label={`${t('discount_off', lang)} ${percent}%`}
      className={
        'bg-destructive text-destructive-foreground shadow-subtle absolute start-2 top-2 rounded-full px-2 py-0.5 font-mono text-caption font-semibold tabular-nums ' +
        className
      }
    >
      <span aria-hidden>−{percent}%</span>
    </span>
  );
}

/**
 * Unified price display: current price (brand-colored) with optional
 * struck-through original. `dir="ltr"` on each numeral keeps the currency
 * suffix and the strike from transposing under RTL.
 */
export function PriceTag({
  price,
  original,
  currency,
  lang,
  layout = 'stack',
}: {
  price: string;
  original?: string | null;
  currency: string;
  lang: Lang;
  layout?: 'stack' | 'inline';
}) {
  // Localized currency token (د.ع in ar/ku, ISO in en) — H4. The whole money
  // run stays in a dir=ltr span so digits + token never transpose under RTL.
  const cur = currencyLabel(currency, lang);
  const now = (
    <span dir="ltr" className="font-mono font-semibold tabular-nums text-primary whitespace-nowrap">
      {price} <span className="text-[0.85em] font-medium opacity-80">{cur}</span>
    </span>
  );
  const was = original ? (
    <span dir="ltr" className="font-mono text-caption text-muted-foreground line-through tabular-nums whitespace-nowrap">
      {original} {cur}
    </span>
  ) : null;

  if (layout === 'inline') {
    return (
      <span className="flex items-baseline gap-2">
        {now}
        {was}
      </span>
    );
  }
  return (
    <span className="flex flex-col leading-tight">
      {now}
      {was}
    </span>
  );
}

/**
 * One suggested item — a tap adds it straight to the cart. Shared by the cart
 * page (seeded from the basket) and the product page (seeded from the item on
 * screen), so a pairing looks identical wherever the diner meets it.
 */
export function SuggestionCard({
  product,
  lang,
  card,
  currency,
  onAdd,
}: {
  product: MenuProduct;
  lang: Lang;
  card: string;
  currency: string;
  onAdd: () => void;
}) {
  const resolved = resolveName(product, lang);
  const name = resolved.text;
  // M5: surface the discount on offer items + a chef marker, so a suggestion
  // carries a reason to tap rather than just a name + price.
  const hasDiscount = product.discount_percent !== null && product.original_price !== null;
  return (
    <button
      type="button"
      onClick={onAdd}
      className="border-border-lite shadow-card hover:shadow-lifted flex flex-col items-stretch overflow-hidden rounded-2xl border text-start transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
      style={{ background: card }}
    >
      <div className="relative">
        <MenuImage
          src={product.image_url}
          alt={name}
          sizes="(max-width: 640px) 50vw, 160px"
          className="aspect-square w-full"
        />
        {hasDiscount && <DiscountBadge percent={product.discount_percent!} lang={lang} />}
        {!hasDiscount && product.is_chef_pick && (
          <span className="bg-accent/90 text-accent-foreground shadow-subtle absolute start-2 top-2 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold">
            <Star className="size-2.5" aria-hidden />
            {t('chef_pick', lang)}
          </span>
        )}
      </div>
      <div className="space-y-1 p-2">
        <div className="line-clamp-2 text-caption font-medium" {...nameLangProps(resolved.lang)}>{name}</div>
        <PriceTag
          price={formatAmount(product.price)}
          original={hasDiscount ? formatAmount(product.original_price!) : null}
          currency={currency}
          lang={lang}
        />
      </div>
    </button>
  );
}
