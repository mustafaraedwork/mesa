'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { addToCart, getCart, subscribe, totalQuantity } from '@/lib/cart';
import { LANGS, isRtl, pickName, t, type Lang } from '@/lib/i18n';
import { CLOSING_VIRTUAL_CATEGORY_ID } from '@/lib/closing';
import type { MenuCategory, MenuPayload, MenuProduct } from '@/lib/menu';

const LANG_KEY = 'mesa-lang';
const POLL_MS = 30_000;

type CategoryNode = MenuCategory & { children: MenuCategory[] };

export function MenuView({
  slug,
  initialData,
}: {
  slug: string;
  initialData: MenuPayload;
}) {
  const [data, setData] = useState<MenuPayload>(initialData);
  const [lang, setLang] = useState<Lang>('ar');
  const [cartCount, setCartCount] = useState(0);

  /* eslint-disable react-hooks/set-state-in-effect --
     Both effects sync from client-only stores on mount (localStorage / cart):
     these reads can't run during SSR, so an effect is the correct home. */
  // Restore language preference on mount (avoids hydration mismatch — initial
  // render is always 'ar', then we sync to localStorage in the effect).
  useEffect(() => {
    const saved = (window.localStorage.getItem(LANG_KEY) ?? 'ar') as Lang;
    if (saved === 'ar' || saved === 'en' || saved === 'ku') setLang(saved);
  }, []);

  // Cart count + storage subscription.
  useEffect(() => {
    setCartCount(totalQuantity(getCart(slug)));
    return subscribe(slug, () => setCartCount(totalQuantity(getCart(slug))));
  }, [slug]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 30s polling (PRD §3.2). Pause when tab is hidden.
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
        // Network blip — try again next interval.
      }
    };
    const id = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [slug]);

  const onAdd = useCallback(
    (productId: string) => {
      setCartCount(totalQuantity(addToCart(slug, productId)));
    },
    [slug],
  );

  const tree = useMemo(() => buildTree(data.categories), [data.categories]);
  const r = data.restaurant;
  const dir = isRtl(lang) ? 'rtl' : 'ltr';

  return (
    <main
      dir={dir}
      className="min-h-screen pb-28"
      style={{ background: r.background_color }}
    >
      <Header
        displayName={r.display_name}
        logoUrl={r.logo_url}
        primary={r.primary_color}
        lang={lang}
        onLangChange={(next) => {
          setLang(next);
          window.localStorage.setItem(LANG_KEY, next);
        }}
      />

      <div className="mx-auto max-w-3xl px-4 py-4">
        {tree.length === 0 ? (
          <p className="text-muted-foreground bg-card shadow-card rounded-xl p-6 text-center text-sm">
            {t('no_menu', lang)}
          </p>
        ) : (
          <div className="space-y-6">
            {tree.map((cat) => (
              <CategoryBlock
                key={cat.id}
                category={cat}
                lang={lang}
                primary={r.primary_color}
                currency={r.currency}
                showUnavailable={r.show_unavailable_items}
                onAdd={onAdd}
              />
            ))}
          </div>
        )}
      </div>

      <FloatingCart slug={slug} count={cartCount} primary={r.primary_color} lang={lang} />
    </main>
  );
}

function buildTree(categories: MenuCategory[]): CategoryNode[] {
  const top: MenuCategory[] = [];
  const byParent = new Map<string, MenuCategory[]>();
  for (const c of categories) {
    if (c.parent_id) {
      const arr = byParent.get(c.parent_id) ?? [];
      arr.push(c);
      byParent.set(c.parent_id, arr);
    } else {
      top.push(c);
    }
  }
  return top.map((c) => ({
    ...c,
    children: (byParent.get(c.id) ?? []).slice().sort((a, b) => a.display_order - b.display_order),
  }));
}

function Header({
  displayName,
  logoUrl,
  primary,
  lang,
  onLangChange,
}: {
  displayName: string;
  logoUrl: string | null;
  primary: string;
  lang: Lang;
  onLangChange: (l: Lang) => void;
}) {
  return (
    <header
      className="shadow-card sticky top-0 z-20 flex items-center gap-3 px-4 py-3"
      style={{ background: primary, color: '#fff' }}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoUrl}
          alt=""
          className="h-10 w-10 shrink-0 rounded bg-white object-contain p-0.5"
        />
      ) : (
        <div className="bg-white/15 flex h-10 w-10 shrink-0 items-center justify-center rounded text-base font-bold">
          {displayName.slice(0, 1) || '·'}
        </div>
      )}
      <h1 className="flex-1 truncate text-base font-semibold">{displayName}</h1>
      <div className="flex shrink-0 overflow-hidden rounded-full bg-white/15 text-xs">
        {LANGS.map((l) => (
          <button
            key={l.code}
            type="button"
            onClick={() => onLangChange(l.code)}
            className={
              'px-2.5 py-1 transition ' +
              (lang === l.code ? 'bg-white text-black' : 'text-white/90 hover:bg-white/10')
            }
            aria-pressed={lang === l.code}
          >
            {l.label}
          </button>
        ))}
      </div>
    </header>
  );
}

function CategoryBlock({
  category,
  lang,
  primary,
  currency,
  showUnavailable,
  onAdd,
  compact = false,
}: {
  category: MenuCategory & { children?: MenuCategory[] };
  lang: Lang;
  primary: string;
  currency: string;
  showUnavailable: boolean;
  onAdd: (productId: string) => void;
  compact?: boolean;
}) {
  const isVirtual = category.id === CLOSING_VIRTUAL_CATEGORY_ID;
  const name = pickName(category, lang);
  const visible = showUnavailable
    ? category.products
    : category.products.filter((p) => p.is_available);

  return (
    <section className="space-y-3">
      <h2
        className={
          (compact ? 'text-base' : 'text-lg') +
          ' font-semibold ' +
          (isVirtual ? 'text-rose-700' : '')
        }
        style={!isVirtual && !compact ? { color: primary } : undefined}
      >
        {isVirtual ? `🔥 ${name}` : name}
      </h2>

      {visible.length > 0 && (
        <div className="grid gap-2">
          {visible.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              lang={lang}
              primary={primary}
              currency={currency}
              onAdd={onAdd}
            />
          ))}
        </div>
      )}

      {category.children && category.children.length > 0 && (
        <div className="space-y-4 ps-3">
          {category.children.map((sub) => (
            <CategoryBlock
              key={sub.id}
              category={sub}
              lang={lang}
              primary={primary}
              currency={currency}
              showUnavailable={showUnavailable}
              onAdd={onAdd}
              compact
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ProductCard({
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
  onAdd: (productId: string) => void;
}) {
  const name = pickName(product, lang);
  const unavailable = !product.is_available;
  const hasDiscount = product.discount_percent !== null && product.original_price !== null;

  return (
    <div
      className={
        'flex items-center gap-3 rounded-xl bg-card p-3 shadow-card ' +
        (unavailable ? 'opacity-60 grayscale' : '')
      }
    >
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md">
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
          <div className="bg-cream-deep h-full w-full" aria-hidden />
        )}
        {hasDiscount && (
          <span className="bg-amber absolute -top-1 -start-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
            -{product.discount_percent}%
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{name}</div>
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <span>⏱ {product.prep_time_minutes} {t('prep_unit', lang)}</span>
          {unavailable && <span className="font-medium text-rose-700">{t('unavailable', lang)}</span>}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <div className="flex items-baseline gap-1.5 leading-none">
          {hasDiscount && (
            <span className="text-muted-foreground text-xs line-through">
              {formatPrice(product.original_price!, currency)}
            </span>
          )}
          <span className="text-sm font-bold" style={{ color: primary }}>
            {formatPrice(product.price, currency)}
          </span>
        </div>
        <button
          type="button"
          disabled={unavailable}
          onClick={() => onAdd(product.id)}
          className="rounded-full px-3 py-1 text-xs font-medium text-white shadow disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: primary }}
        >
          + {t('add', lang)}
        </button>
      </div>
    </div>
  );
}

function FloatingCart({
  slug,
  count,
  primary,
  lang,
}: {
  slug: string;
  count: number;
  primary: string;
  lang: Lang;
}) {
  if (count === 0) return null;
  return (
    <Link
      href={`/r/${slug}/cart`}
      className="shadow-lifted fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white"
      style={{ background: primary }}
    >
      <span>🛒</span>
      <span>{t('cart_button', lang)}</span>
      <span className="bg-white/20 rounded-full px-2 py-0.5 text-xs">{count}</span>
    </Link>
  );
}

export function formatPrice(value: number, currency: string): string {
  return `${value.toLocaleString('en-US')} ${currency}`;
}
