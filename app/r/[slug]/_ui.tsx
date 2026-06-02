'use client';

// Shared diner-surface UI primitives (Phase 1 redesign).
// Keep these presentational + dependency-light: menu/product/cart all import them.

import { useEffect } from 'react';
import Image from 'next/image';
import { UtensilsCrossed } from 'lucide-react';
import { isRtl, type Lang } from '@/lib/i18n';

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
    el.lang = lang;
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

/** Span props that declare a localized string's language for screen readers. */
export function nameLangProps(lang: Lang) {
  return { lang, dir: isRtl(lang) ? ('rtl' as const) : ('ltr' as const) };
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
          className="object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <UtensilsCrossed className="h-1/4 w-1/4 max-h-10 max-w-10 text-foreground/15" aria-hidden />
        </div>
      )}
    </div>
  );
}

/** Limited-time discount marker. Semantic (fixed red) — never re-skinned per brand. */
export function DiscountBadge({ percent, className = '' }: { percent: number; className?: string }) {
  return (
    <span
      className={
        'bg-destructive text-destructive-foreground shadow-subtle absolute start-2 top-2 rounded-full px-2 py-0.5 font-mono text-caption font-semibold tabular-nums ' +
        className
      }
    >
      −{percent}%
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
  layout = 'stack',
}: {
  price: string;
  original?: string | null;
  currency: string;
  layout?: 'stack' | 'inline';
}) {
  const now = (
    <span dir="ltr" className="font-mono font-semibold tabular-nums text-primary">
      {price} <span className="text-[0.85em] font-medium opacity-80">{currency}</span>
    </span>
  );
  const was = original ? (
    <span dir="ltr" className="font-mono text-caption text-muted-foreground line-through tabular-nums">
      {original} {currency}
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
