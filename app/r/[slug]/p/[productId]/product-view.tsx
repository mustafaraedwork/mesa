'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Clock, Minus, Plus } from 'lucide-react';
import { addToCart, getCart, setQuantity, subscribe, totalQuantity } from '@/lib/cart';
import { isRtl, parseLang, resolveName, t, type Lang } from '@/lib/i18n';
import { readableTextOn } from '@/lib/contrast';
import { track } from '@/lib/track';
import type { MenuPayload, MenuProduct } from '@/lib/menu';
import { FloatingCart, markMenuOpened } from '../../menu-view';
import { DiscountBadge, MenuImage, OfflineBanner, PriceTag, SuggestionCard, formatAmount, nameLangProps, useSyncHtmlLang } from '../../_ui';

const LANG_KEY = 'mesa-lang';

export function ProductView({
  slug,
  product,
  restaurant,
  suggestions,
}: {
  slug: string;
  product: MenuProduct;
  restaurant: MenuPayload['restaurant'];
  /** Owner-configured pairings for this item, resolved on the server. */
  suggestions: MenuProduct[];
}) {
  const [lang, setLang] = useState<Lang>('ar');
  const [cartCount, setCartCount] = useState(0);
  const [qty, setQty] = useState(1); // M4: choose quantity before adding
  const router = useRouter();

  useSyncHtmlLang(lang);

  // Always land on the menu itself. Stepping back through browser history was
  // unreliable — `history.length` counts entries we don't own, so a shared
  // product link or a refresh either left the site or went nowhere; and when it
  // did reach the menu on a runtime that never rendered it, the diner got the
  // welcome screen instead of the food. markMenuOpened() closes that second
  // hole: from a product page the diner is already past the entry screen.
  function goToMenu() {
    markMenuOpened();
    router.push(`/r/${slug}`);
  }

  // M4: add the chosen quantity (on top of whatever is already in the cart).
  function handleAdd() {
    const existing = getCart(slug).items.find((i) => i.product_id === product.id)?.quantity ?? 0;
    setQuantity(slug, product.id, existing + qty);
    track('product_add', { slug, productId: product.id });
  }

  /* eslint-disable react-hooks/set-state-in-effect --
     Mount-time reads from client-only stores (localStorage / cart). */
  useEffect(() => {
    setLang(parseLang(window.localStorage.getItem(LANG_KEY)));
  }, []);

  useEffect(() => {
    setCartCount(totalQuantity(getCart(slug)));
    return subscribe(slug, () => setCartCount(totalQuantity(getCart(slug))));
  }, [slug]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Analytics — record this product view once per product. The ref guard
  // stops React's dev StrictMode double-invoke from counting it twice, and
  // still re-fires if the view navigates to a different product.
  const trackedId = useRef<string | null>(null);
  useEffect(() => {
    if (trackedId.current === product.id) return;
    trackedId.current = product.id;
    track('product_open', { slug, productId: product.id });
  }, [slug, product.id]);

  const resolved = resolveName(product, lang);
  const name = resolved.text;
  const dir = isRtl(lang) ? 'rtl' : 'ltr';
  const unavailable = !product.is_available;
  const hasDiscount = product.discount_percent !== null && product.original_price !== null;

  const brand: CSSProperties = {
    ['--primary' as string]: restaurant.primary_color,
    ['--primary-foreground' as string]: readableTextOn(restaurant.primary_color),
    ['--ring' as string]: restaurant.primary_color,
    background: restaurant.background_color,
    color: restaurant.text_color,
  };

  return (
    <main dir={dir} className="min-h-screen pb-28" style={brand}>
      <a
        href="#product-content"
        className="bg-card sr-only rounded-lg focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:px-3 focus:py-2 focus:shadow-modal focus:outline-2 focus:outline-[--ring]"
      >
        {t('skip_to_content', lang)}
      </a>
      <OfflineBanner lang={lang} />
      {/* Three tracks — back / name / spacer — so the venue name sits centred
          between equal gutters. The side tracks keep their auto minimum, so a
          long name or a narrow screen nudges the centre instead of letting the
          two controls overlap. */}
      <header
        className="shadow-card sticky top-0 z-20 grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-gutter py-3"
        style={{ background: restaurant.primary_color, color: 'var(--primary-foreground)' }}
      >
        <button
          type="button"
          onClick={goToMenu}
          className="-ms-2 inline-flex min-h-11 items-center gap-1.5 justify-self-start rounded-full px-2 text-sm font-medium hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        >
          <ArrowLeft className="h-5 w-5 rtl:-scale-x-100" aria-hidden />
          {t('back_to_menu', lang)}
        </button>
        {/* M17: venue name is a back-nav label, not the page's primary heading —
            so it stays a link, never an <h1>. The max-w caps the auto-sized
            middle track so `truncate` has a width to bite on: without it a long
            venue name grows to max-content and collides with the back button. */}
        <Link
          href={`/r/${slug}`}
          prefetch={false}
          onClick={markMenuOpened}
          className="min-w-0 max-w-[50vw] justify-self-center truncate rounded-lg px-2 py-1 text-base font-semibold hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        >
          {/* L14: isolate the venue name so a Latin name never transposes the RTL chrome around it. */}
          <bdi>{restaurant.display_name}</bdi>
        </Link>
        <span aria-hidden />
      </header>

      <div id="product-content" className="mx-auto max-w-2xl px-gutter py-5">
        <div
          className="shadow-card overflow-hidden rounded-2xl"
          style={{ background: restaurant.card_color }}
        >
          <div className="relative aspect-square w-full">
            <MenuImage
              src={product.image_url}
              alt={name}
              sizes="(max-width: 768px) 100vw, 640px"
              priority
              className="h-full w-full"
            />
            {hasDiscount && (
              <DiscountBadge percent={product.discount_percent!} lang={lang} className="!start-3 !top-3" />
            )}
          </div>

          <div className="space-y-3 p-card">
            <h1 className="text-h2 font-bold" {...nameLangProps(resolved.lang)}>{name}</h1>

            <PriceTag
              price={formatAmount(product.price)}
              original={hasDiscount ? formatAmount(product.original_price!) : null}
              currency={restaurant.currency}
              lang={lang}
              layout="inline"
            />

            {/* No "closing offer ends at HH:MM" line on the diner side — the
                discounted price already speaks for itself; the end-time detail is
                owner-only (modes panel). The struck-through price + badge stay. */}

            <div className="text-muted-foreground flex items-center gap-1.5 text-body">
              <Clock className="h-4 w-4" aria-hidden />
              <span>
                {product.prep_time_minutes} {t('prep_unit', lang)}
              </span>
            </div>

            {unavailable && (
              <p className="text-destructive text-body font-medium" role="status">
                {t('unavailable', lang)}
              </p>
            )}

            {/* M4: quantity stepper before adding */}
            {!unavailable && (
              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-sm font-medium">{t('quantity', lang)}</span>
                <div className="border-border-strong flex items-center gap-0.5 rounded-full border">
                  <button
                    type="button"
                    onClick={() => setQty((n) => Math.max(1, n - 1))}
                    aria-label={t('qty_decrease', lang)}
                    className="flex h-11 w-11 items-center justify-center rounded-full transition-transform hover:bg-muted active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
                  >
                    <Minus className="h-4 w-4" aria-hidden />
                  </button>
                  <span className="w-8 text-center text-base font-semibold tabular-nums" aria-live="polite">{qty}</span>
                  <button
                    type="button"
                    onClick={() => setQty((n) => n + 1)}
                    aria-label={t('qty_increase', lang)}
                    className="flex h-11 w-11 items-center justify-center rounded-full transition-transform hover:bg-muted active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring]"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={unavailable}
              onClick={handleAdd}
              className="shadow-card flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring] disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: restaurant.primary_color, color: 'var(--primary-foreground)' }}
            >
              <Plus className="h-5 w-5" aria-hidden />
              {t('add', lang)}
              {!unavailable && qty > 1 && <span className="tabular-nums"> · {qty}</span>}
            </button>
          </div>
        </div>

        {/* The owner's pairings for this dish, shown before ordering rather than
            only at checkout — pick مشاوي and the مقبلات they linked show here. */}
        {suggestions.length > 0 && (
          <section className="mt-6 space-y-2">
            <h2 className="text-sm font-semibold" style={{ color: restaurant.primary_color }}>
              {t('suggestions', lang)}
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {suggestions.map((p) => (
                <SuggestionCard
                  key={p.id}
                  product={p}
                  lang={lang}
                  card={restaurant.card_color}
                  currency={restaurant.currency}
                  onAdd={() => addToCart(slug, p.id)}
                />
              ))}
            </div>
          </section>
        )}
      </div>

      <FloatingCart slug={slug} count={cartCount} primary={restaurant.primary_color} lang={lang} />
    </main>
  );
}
