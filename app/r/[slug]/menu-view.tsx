'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Plus, ShoppingBag } from 'lucide-react';
import { addToCart, getCart, subscribe, type Cart } from '@/lib/cart';
import { LANGS, isRtl, pickName, t, type Lang } from '@/lib/i18n';
import { CLOSING_VIRTUAL_CATEGORY_ID } from '@/lib/closing';
import { track } from '@/lib/track';
import { WelcomeScreen } from './welcome-screen';
import type { MenuCategory, MenuPayload, MenuProduct } from '@/lib/menu';

const LANG_KEY = 'mesa-lang';
const POLL_MS = 30_000;
const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

type CategoryNode = MenuCategory & { children: MenuCategory[] };
type BrandColors = {
  primary: string;
  bg: string;
};

export function MenuView({
  slug,
  initialData,
}: {
  slug: string;
  initialData: MenuPayload;
}) {
  const [data, setData] = useState<MenuPayload>(initialData);
  const [lang, setLang] = useState<Lang>('ar');
  const [cart, setCart] = useState<Cart>({ items: [], updatedAt: 0 });
  const [started, setStarted] = useState(false);

  // Editorial date eyebrow — read the clock once on mount.
  const [dateEyebrow] = useState(() => {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${DAY_NAMES[d.getDay()]} · ${hh}:${mm}`;
  });

  /* eslint-disable react-hooks/set-state-in-effect --
     Both effects sync from client-only stores on mount (localStorage / cart). */
  useEffect(() => {
    const saved = (window.localStorage.getItem(LANG_KEY) ?? 'ar') as Lang;
    if (saved === 'ar' || saved === 'en' || saved === 'ku') setLang(saved);
  }, []);

  useEffect(() => {
    setCart(getCart(slug));
    return subscribe(slug, () => setCart(getCart(slug)));
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

  const tree = useMemo(() => buildTree(data.categories), [data.categories]);

  // Default selection = first parent that has products (direct or via children).
  // If the first qualifying parent has no direct products but has children with
  // products, auto-select the first such child so the diner isn't greeted with
  // an empty grid.
  const [parentId, setParentId] = useState<string | null>(() => initialParent(tree));
  const [subId, setSubId] = useState<string | null>(() => initialSub(tree, initialParent(tree)));

  const selectedParent = tree.find((c) => c.id === parentId) ?? null;
  const hasSubs = selectedParent ? selectedParent.children.length > 0 : false;

  const filteredProducts = useMemo<MenuProduct[]>(() => {
    if (!selectedParent) return [];
    if (subId) {
      const sub = selectedParent.children.find((c) => c.id === subId);
      return sub?.products ?? [];
    }
    return selectedParent.products;
  }, [selectedParent, subId]);

  // Chef's Picks = the virtual category surfaced by the active mode (currently
  // only Closing — Normal mode's `is_chef_pick` selection is a deferred bit).
  const chefPicks = useMemo<MenuProduct[]>(() => {
    const vc = data.categories.find((c) => c.is_virtual);
    return vc?.products ?? [];
  }, [data.categories]);
  const chefPicksCategory = data.categories.find((c) => c.is_virtual);

  // Cart-bar count + total.
  const productIndex = useMemo(() => {
    const idx = new Map<string, MenuProduct>();
    for (const cat of data.categories) {
      if (cat.id === CLOSING_VIRTUAL_CATEGORY_ID) continue;
      for (const p of cat.products) idx.set(p.id, p);
    }
    return idx;
  }, [data.categories]);
  const cartCount = cart.items.reduce((s, it) => s + it.quantity, 0);
  const cartTotal = useMemo(() => {
    let total = 0;
    for (const it of cart.items) {
      const p = productIndex.get(it.product_id);
      if (p) total += p.price * it.quantity;
    }
    return total;
  }, [cart, productIndex]);

  const r = data.restaurant;
  const dir = isRtl(lang) ? 'rtl' : 'ltr';
  const colors: BrandColors = { primary: r.primary_color, bg: r.background_color };

  function pickLang(next: Lang) {
    setLang(next);
    window.localStorage.setItem(LANG_KEY, next);
  }
  function cycleLang() {
    const order: Lang[] = ['ar', 'en', 'ku'];
    const i = order.indexOf(lang);
    pickLang(order[(i + 1) % order.length]);
  }
  function pickParent(id: string) {
    setParentId(id);
    const p = tree.find((c) => c.id === id);
    setSubId(p ? defaultSubFor(p) : null);
  }
  function pickSub(id: string) {
    setSubId(id);
  }
  function onAdd(productId: string) {
    addToCart(slug, productId);
    track('product_add', { slug, productId });
  }
  function handleStart() {
    setStarted(true);
    const key = `mesa-opened-${slug}`;
    if (!window.sessionStorage.getItem(key)) {
      window.sessionStorage.setItem(key, '1');
      track('menu_open', { slug });
    }
  }

  if (!started) {
    return (
      <WelcomeScreen
        restaurant={{
          display_name: r.display_name,
          logo_url: r.logo_url,
          primary_color: r.primary_color,
          background_color: r.background_color,
        }}
        lang={lang}
        onPickLang={pickLang}
        onStart={handleStart}
      />
    );
  }

  return (
    <main dir={dir} className="min-h-screen pb-28" style={{ background: colors.bg }}>
      {/* Header — cart + language on one side, brand on the other */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-5 py-3"
        style={{ background: colors.bg }}
      >
        <div className="flex items-center gap-2">
          <Link
            href={`/r/${slug}/cart`}
            aria-label={t('cart_button', lang)}
            className="bg-card border-border relative flex h-10 w-10 items-center justify-center rounded-full border"
          >
            <ShoppingBag className="h-5 w-5" />
            {cartCount > 0 && (
              <span
                className="text-primary-foreground absolute -top-1 -end-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-bold tabular-nums"
                style={{ background: colors.primary }}
              >
                {cartCount}
              </span>
            )}
          </Link>
          <button
            type="button"
            onClick={cycleLang}
            className="bg-card border-border text-ink-2 flex h-10 items-center rounded-full border px-4 text-xs font-medium"
          >
            {LANGS.find((l) => l.code === lang)?.label}
          </button>
        </div>
        <BrandMark logoUrl={r.logo_url} displayName={r.display_name} primary={colors.primary} />
      </header>

      {/* Editorial intro */}
      <div className="px-5 pt-5 pb-2 text-start">
        <p className="text-muted-foreground font-latin mb-1.5 text-[10px] tracking-[0.2em]">
          {dateEyebrow}
        </p>
        <h1 className="text-3xl font-bold tracking-tight">{t('greeting_evening', lang)}،</h1>
        <h2 className="text-ink-2 mt-1 text-xl font-medium">{t('chef_tonight', lang)}</h2>
      </div>

      {/* Parent category chips */}
      {tree.length > 0 && (
        <ChipBar>
          {tree.map((cat) => (
            <Chip
              key={cat.id}
              active={parentId === cat.id}
              onClick={() => pickParent(cat.id)}
            >
              {pickName(cat, lang)}
            </Chip>
          ))}
        </ChipBar>
      )}

      {/* Sub-category chips — only when the selected parent has children */}
      {hasSubs && selectedParent && (
        <ChipBar dense>
          {selectedParent.children.map((sub) => (
            <Chip
              key={sub.id}
              active={subId === sub.id}
              onClick={() => pickSub(sub.id)}
              variant="sub"
            >
              {pickName(sub, lang)}
            </Chip>
          ))}
        </ChipBar>
      )}

      {/* Chef's Picks — surfaces the active mode's selection (Closing now) */}
      {chefPicks.length > 0 && chefPicksCategory && (
        <section className="pt-6">
          <div className="mb-3 px-5 text-start">
            <h3 className="text-2xl font-bold">{pickName(chefPicksCategory, lang)}</h3>
            <p className="text-muted-foreground font-latin mt-0.5 text-[10px] tracking-widest">
              CHEF&apos;S SELECTION · TONIGHT
            </p>
          </div>
          <div className="no-scrollbar overflow-x-auto px-5 pb-1">
            <div className="flex w-max gap-3">
              {chefPicks.map((p) => (
                <div key={`pick-${p.id}`} className="w-44 shrink-0">
                  <ProductCard
                    slug={slug}
                    product={p}
                    lang={lang}
                    primary={colors.primary}
                    currency={r.currency}
                    onAdd={onAdd}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Filtered items — no heading, just the grid */}
      <section className="px-5 pt-6 pb-32">
        {filteredProducts.length === 0 ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            {t('no_menu', lang)}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredProducts.map((p) => (
              <ProductCard
                key={p.id}
                slug={slug}
                product={p}
                lang={lang}
                primary={colors.primary}
                currency={r.currency}
                onAdd={onAdd}
              />
            ))}
          </div>
        )}
      </section>

      <CartBar
        slug={slug}
        count={cartCount}
        total={cartTotal}
        currency={r.currency}
        lang={lang}
      />
    </main>
  );
}

// ── helpers ────────────────────────────────────────────────────────────

function buildTree(categories: MenuCategory[]): CategoryNode[] {
  const top: MenuCategory[] = [];
  const byParent = new Map<string, MenuCategory[]>();
  for (const c of categories) {
    if (c.id === CLOSING_VIRTUAL_CATEGORY_ID) continue; // chef-picks section handles it
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

function initialParent(tree: CategoryNode[]): string | null {
  for (const cat of tree) {
    if (cat.products.length > 0) return cat.id;
    if (cat.children.some((c) => c.products.length > 0)) return cat.id;
  }
  return tree[0]?.id ?? null;
}

function initialSub(tree: CategoryNode[], parentId: string | null): string | null {
  if (!parentId) return null;
  const p = tree.find((c) => c.id === parentId);
  return p ? defaultSubFor(p) : null;
}

function defaultSubFor(parent: CategoryNode): string | null {
  // Only auto-pick a sub when the parent itself has no direct products.
  if (parent.products.length > 0) return null;
  return parent.children.find((c) => c.products.length > 0)?.id ?? null;
}

// ── presentational ────────────────────────────────────────────────────

function BrandMark({
  logoUrl,
  displayName,
  primary,
}: {
  logoUrl: string | null;
  displayName: string;
  primary: string;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt="" className="h-10 w-10 rounded-full bg-white object-contain" />
    );
  }
  return (
    <div
      className="flex h-10 w-10 items-center justify-center rounded-full text-base font-bold text-white"
      style={{ background: primary }}
    >
      {displayName.slice(0, 1) || '·'}
    </div>
  );
}

function ChipBar({ children, dense = false }: { children: ReactNode; dense?: boolean }) {
  return (
    <div className={'no-scrollbar overflow-x-auto px-5 ' + (dense ? 'pb-3' : 'pt-4 pb-3')}>
      <div className="flex w-max gap-2">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  variant = 'parent',
  children,
}: {
  active: boolean;
  onClick: () => void;
  variant?: 'parent' | 'sub';
  children: ReactNode;
}) {
  const base = 'shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors';
  if (active) {
    return (
      <button type="button" onClick={onClick} className={base + ' bg-foreground text-background'}>
        {children}
      </button>
    );
  }
  const inactive =
    variant === 'sub'
      ? 'bg-card border-border-lite text-muted-foreground border'
      : 'bg-card border-border text-ink-2 border';
  return (
    <button type="button" onClick={onClick} className={base + ' ' + inactive}>
      {children}
    </button>
  );
}

function ProductCard({
  slug,
  product,
  lang,
  primary,
  currency,
  onAdd,
}: {
  slug: string;
  product: MenuProduct;
  lang: Lang;
  primary: string;
  currency: string;
  onAdd: (productId: string) => void;
}) {
  const name = pickName(product, lang);
  const unavailable = !product.is_available;
  const hasDiscount = product.discount_percent !== null && product.original_price !== null;
  const firstLetter = name.trim().charAt(0) || '·';

  return (
    <div
      className={
        'bg-card border-border-lite shadow-card flex flex-col overflow-hidden rounded-xl border ' +
        (unavailable ? 'opacity-60 grayscale' : '')
      }
    >
      <Link href={`/r/${slug}/p/${product.id}`} className="relative block">
        <div className="bg-cream-deep flex aspect-square w-full items-center justify-center">
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
            <span className="text-muted-foreground text-3xl font-bold">{firstLetter}</span>
          )}
        </div>
        {hasDiscount && (
          <span className="bg-amber absolute start-2 top-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
            -{product.discount_percent}%
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <h4 className="truncate text-sm font-medium" title={name}>
          {name}
        </h4>
        <div className="mt-auto flex items-end justify-between gap-2">
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold tabular-nums" style={{ color: primary }}>
              {formatPrice(product.price, currency)}
            </span>
            {hasDiscount && (
              <span className="text-muted-foreground text-[10px] line-through tabular-nums">
                {formatPrice(product.original_price!, currency)}
              </span>
            )}
          </div>
          <button
            type="button"
            disabled={unavailable}
            onClick={() => onAdd(product.id)}
            className="bg-foreground text-background flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={t('add', lang)}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function CartBar({
  slug,
  count,
  total,
  currency,
  lang,
}: {
  slug: string;
  count: number;
  total: number;
  currency: string;
  lang: Lang;
}) {
  if (count === 0) return null;
  return (
    <Link
      href={`/r/${slug}/cart`}
      className="bg-foreground shadow-lifted fixed inset-x-4 bottom-4 z-30 flex h-14 items-center justify-between rounded-2xl px-5"
    >
      <span className="text-background text-sm font-medium">
        {t('view_cart', lang)} · <span className="tabular-nums">{count}</span>
      </span>
      <span className="text-gold font-bold tabular-nums">{formatPrice(total, currency)}</span>
    </Link>
  );
}

// Legacy floating cart — kept for the product page (reuses this presentation).
export function FloatingCart({
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
