'use client';

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Check, ChevronDown, Plus, ShoppingBag } from 'lucide-react';
import { addToCart, getCart, subscribe, type Cart } from '@/lib/cart';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LANGS, isRtl, parseLang, pickName, resolveName, t, type Lang } from '@/lib/i18n';
import { readableTextOn } from '@/lib/contrast';
import { CLOSING_VIRTUAL_CATEGORY_ID } from '@/lib/closing';
import { track } from '@/lib/track';
import { WelcomeScreen } from './welcome-screen';
import {
  DiscountBadge,
  MenuImage,
  PriceTag,
  formatAmount,
  nameLangProps,
  useSyncHtmlLang,
} from './_ui';
import type { MenuCategory, MenuPayload, MenuProduct } from '@/lib/menu';

const LANG_KEY = 'mesa-lang';
const POLL_MS = 30_000;

/** Per-restaurant brand colors injected as CSS variables on the diner root, so
 *  Tailwind brand utilities (bg-primary, text-primary, ring, shadow-cta) follow
 *  the tenant. Semantic state tokens (destructive/success/…) stay fixed. */
function brandVars(colors: BrandColors): CSSProperties {
  return {
    ['--primary' as string]: colors.primary,
    ['--primary-foreground' as string]: readableTextOn(colors.primary),
    ['--ring' as string]: colors.primary,
    ['--background' as string]: colors.bg,
    ['--card' as string]: colors.card,
    ['--foreground' as string]: colors.text,
    background: colors.bg,
    color: colors.text,
  };
}

// Survives client navigations within a page load (server never writes it, so
// it stays false in SSR — no hydration mismatch). Once the diner opens the
// menu, returning here via the back button skips the welcome screen instead of
// landing them back on it. A fresh page load / QR scan resets it.
let menuOpenedThisLoad = false;

type CategoryNode = MenuCategory & { children: MenuCategory[] };
type BrandColors = {
  primary: string;
  bg: string;
  header: string;
  card: string;
  text: string;
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
  const [started, setStarted] = useState(() => menuOpenedThisLoad);

  // Mirror the document to the chosen language (WCAG 3.1.2 / 1.3.2).
  useSyncHtmlLang(lang);

  /* eslint-disable react-hooks/set-state-in-effect --
     Both effects sync from client-only stores on mount (localStorage / cart). */
  useEffect(() => {
    setLang(parseLang(window.localStorage.getItem(LANG_KEY)));
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
        // Q-15: guard against an unexpected/legacy payload shape before
        // committing it to state (the poll response is otherwise untyped).
        if (!cancelled && typeof json?.restaurant?.id === 'string') setData(json);
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

  // Chef's Picks rides along with the first (default) section only — it hides
  // once the diner navigates to any other section. Q-18: derive it from the
  // immutable initialData prop, not the reactive `tree`, so a poll that reorders
  // categories can't silently move which section it rides along with.
  const firstParentId = useMemo(
    () => initialParent(buildTree(initialData.categories)),
    [initialData],
  );

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
  const colors: BrandColors = {
    primary: r.primary_color,
    bg: r.background_color,
    header: r.header_color,
    card: r.card_color,
    text: r.text_color,
  };
  // Off mode: a plain menu — drop the editorial greeting + chef-picks heading.
  const isOff = r.active_mode === 'off';

  function pickLang(next: Lang) {
    setLang(next);
    window.localStorage.setItem(LANG_KEY, next);
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
    menuOpenedThisLoad = true;
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
    <main dir={dir} className="min-h-screen pb-28" style={brandVars(colors)}>
      {/* Header — logical direction: brand at the start, actions at the end */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-gutter py-3"
        style={{ background: colors.header }}
      >
        <BrandMark logoUrl={r.logo_url} displayName={r.display_name} primary={colors.primary} />

        <div className="flex items-center gap-2">
          <LanguageDropdown lang={lang} onPickLang={pickLang} />
          <Link
            href={`/r/${slug}/cart`}
            aria-label={t('cart_button', lang)}
            className={
              'bg-card border-border-lite shadow-card flex h-11 items-center rounded-full border transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring] ' +
              (cartCount > 0 ? 'gap-1.5 px-3.5' : 'w-11 justify-center')
            }
          >
            <ShoppingBag className="h-5 w-5" />
            {cartCount > 0 && (
              <span
                className="text-sm font-bold tabular-nums leading-none text-primary"
              >
                {cartCount}
              </span>
            )}
          </Link>
        </div>
      </header>

      {/* Editorial intro — hidden in Off mode for a plain menu */}
      {!isOff && (
        <div className="px-gutter pt-5 pb-1 text-start">
          <h1 className="text-h2 font-bold">{t('greeting_evening', lang)}</h1>
          <p className="mt-1 text-body opacity-70">{t('chef_tonight', lang)}</p>
        </div>
      )}

      {/* Parent category chips */}
      {tree.length > 0 && (
        <ChipBar>
          {tree.map((cat) => (
            <Chip
              key={cat.id}
              active={parentId === cat.id}
              primary={colors.primary}
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
              primary={colors.primary}
              onClick={() => pickSub(sub.id)}
              variant="sub"
            >
              {pickName(sub, lang)}
            </Chip>
          ))}
        </ChipBar>
      )}

      {/* Chef's Picks — only alongside the first/default section, not every one */}
      {chefPicks.length > 0 && chefPicksCategory && parentId === firstParentId && (
        <section className="pt-6">
          <div className="mb-3 flex items-center gap-2 px-gutter text-start">
            <span className="h-5 w-1 rounded-full bg-primary" aria-hidden />
            <h2 className="text-h3 font-bold" {...nameLangProps(resolveName(chefPicksCategory, lang).lang)}>
              {resolveName(chefPicksCategory, lang).text}
            </h2>
          </div>
          <div className="no-scrollbar overflow-x-auto px-gutter pb-1">
            <div className="flex w-max gap-3">
              {chefPicks.map((p) => (
                <div key={`pick-${p.id}`} className="w-44 shrink-0">
                  <ProductCard
                    slug={slug}
                    product={p}
                    lang={lang}
                    primary={colors.primary}
                    card={colors.card}
                    currency={r.currency}
                    onAdd={onAdd}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Filtered items */}
      <section
        className="px-gutter pt-6 pb-32"
        aria-label={selectedParent ? pickName(selectedParent, lang) : t('cart_button', lang)}
      >
        {filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <ShoppingBag className="h-8 w-8 opacity-25" aria-hidden />
            <p className="text-muted-foreground text-body">{t('no_menu', lang)}</p>
          </div>
        ) : (
          <div
            key={`${parentId}-${subId}`}
            className="grid animate-in grid-cols-2 gap-3 fade-in-0 duration-200"
          >
            {filteredProducts.map((p) => (
              <ProductCard
                key={p.id}
                slug={slug}
                product={p}
                lang={lang}
                primary={colors.primary}
                card={colors.card}
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

// Language picker on the shared DropdownMenu (base-ui Menu) — correct keyboard
// nav, focus management, and aria handling out of the box (fixes the hand-rolled
// listbox that gave every option tabindex=0 with no roving focus — W7).
function LanguageDropdown({
  lang,
  onPickLang,
}: {
  lang: Lang;
  onPickLang: (lang: Lang) => void;
}) {
  const current = LANGS.find((l) => l.code === lang)?.label ?? 'عربي';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={t('choose_lang', lang)}
            className="bg-card border-border-lite shadow-card flex h-11 items-center gap-1 rounded-full border px-3.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
          />
        }
      >
        <span>{current}</span>
        <ChevronDown className="text-muted-foreground h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent aria-label={t('choose_lang', lang)} className="min-w-36">
        {LANGS.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => onPickLang(l.code)}
            className={
              'justify-between ' + (l.code === lang ? 'font-semibold [&_svg]:text-primary' : '')
            }
          >
            <span lang={l.code === 'ku' ? 'ckb' : l.code} dir={isRtl(l.code) ? 'rtl' : 'ltr'}>
              {l.label}
            </span>
            {l.code === lang && <Check className="size-4" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
      <span
        className="bg-card relative block h-11 w-11 overflow-hidden rounded-full border p-1"
        style={{ borderColor: `${primary}66` }}
      >
        <Image
          src={logoUrl}
          alt={displayName}
          fill
          sizes="44px"
          className="object-contain p-1"
        />
      </span>
    );
  }
  return (
    <div
      className="bg-card flex h-11 w-11 items-center justify-center rounded-full border text-lg font-bold"
      style={{ borderColor: `${primary}66`, color: primary }}
      aria-label={displayName}
    >
      {displayName.slice(0, 1) || '·'}
    </div>
  );
}

function ChipBar({ children, dense = false }: { children: ReactNode; dense?: boolean }) {
  return (
    <div className={'no-scrollbar overflow-x-auto px-gutter ' + (dense ? 'pb-3' : 'pt-4 pb-3')}>
      <div className="flex w-max gap-2">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  primary,
  variant = 'parent',
  children,
}: {
  active: boolean;
  onClick: () => void;
  primary: string;
  variant?: 'parent' | 'sub';
  children: ReactNode;
}) {
  // ≥40px touch height; active state carries border + ring (not color alone — WCAG 1.4.1).
  const base =
    'inline-flex min-h-10 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]';
  if (active) {
    return (
      <button
        type="button"
        aria-pressed={true}
        onClick={onClick}
        className={base + ' border-transparent shadow-card'}
        style={{ background: primary, borderColor: primary, color: 'var(--primary-foreground)' }}
      >
        {children}
      </button>
    );
  }
  const inactive =
    variant === 'sub'
      ? 'bg-card border-border-strong text-muted-foreground'
      : 'bg-card border-border-strong text-foreground';
  return (
    <button
      type="button"
      aria-pressed={false}
      onClick={onClick}
      className={base + ' ' + inactive}
    >
      {children}
    </button>
  );
}

function ProductCard({
  slug,
  product,
  lang,
  primary,
  card,
  currency,
  onAdd,
}: {
  slug: string;
  product: MenuProduct;
  lang: Lang;
  primary: string;
  card: string;
  currency: string;
  onAdd: (productId: string) => void;
}) {
  const resolved = resolveName(product, lang);
  const name = resolved.text;
  const unavailable = !product.is_available;
  const hasDiscount = product.discount_percent !== null && product.original_price !== null;

  return (
    <div
      className={
        'border-border-lite shadow-card flex flex-col overflow-hidden rounded-2xl border transition-shadow hover:shadow-lifted ' +
        (unavailable ? 'opacity-60 grayscale' : '')
      }
      style={{ background: card }}
    >
      <Link
        href={`/r/${slug}/p/${product.id}`}
        className="relative block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
      >
        <MenuImage
          src={product.image_url}
          alt={name}
          sizes="(max-width: 768px) 50vw, 200px"
          className="aspect-square w-full"
        />
        {hasDiscount && <DiscountBadge percent={product.discount_percent!} />}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-card">
        <h3 className="line-clamp-2 text-body font-medium leading-snug" title={name} {...nameLangProps(resolved.lang)}>
          {name}
        </h3>
        <div className="mt-auto flex items-end justify-between gap-2">
          <PriceTag
            price={formatAmount(product.price)}
            original={hasDiscount ? formatAmount(product.original_price!) : null}
            currency={currency}
          />
          <button
            type="button"
            disabled={unavailable}
            onClick={() => onAdd(product.id)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-card transition-transform active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring] disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: primary, color: 'var(--primary-foreground)' }}
            aria-label={`${t('add', lang)} — ${name}`}
          >
            <Plus className="h-5 w-5" />
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
      className="bg-foreground shadow-lifted fixed inset-x-4 bottom-4 z-30 flex h-14 animate-in items-center justify-between rounded-2xl px-5 duration-300 fade-in-0 slide-in-from-bottom-4 [animation-timing-function:var(--ease-out-expo)]"
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
      className="shadow-lifted fixed bottom-4 left-1/2 z-30 flex h-12 -translate-x-1/2 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-transform active:scale-95"
      style={{ background: primary, color: 'var(--primary-foreground)' }}
    >
      <ShoppingBag className="h-5 w-5" />
      <span>{t('cart_button', lang)}</span>
      <span className="bg-current/20 rounded-full px-2 py-0.5 text-xs tabular-nums">{count}</span>
    </Link>
  );
}

export function formatPrice(value: number, currency: string): string {
  return `${value.toLocaleString('en-US')} ${currency}`;
}
