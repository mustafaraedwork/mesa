'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Clock, Plus, Tag } from 'lucide-react';
import { addToCart, getCart, subscribe, totalQuantity } from '@/lib/cart';
import { isRtl, parseLang, resolveName, t, type Lang } from '@/lib/i18n';
import { readableTextOn } from '@/lib/contrast';
import { track } from '@/lib/track';
import type { MenuPayload, MenuProduct } from '@/lib/menu';
import { FloatingCart } from '../../menu-view';
import { DiscountBadge, MenuImage, PriceTag, formatAmount, formatTimeBaghdad, nameLangProps, useSyncHtmlLang } from '../../_ui';

const LANG_KEY = 'mesa-lang';

export function ProductView({
  slug,
  product,
  restaurant,
}: {
  slug: string;
  product: MenuProduct;
  restaurant: MenuPayload['restaurant'];
}) {
  const [lang, setLang] = useState<Lang>('ar');
  const [cartCount, setCartCount] = useState(0);
  const router = useRouter();

  useSyncHtmlLang(lang);

  // Step back through history so the diner returns to wherever they came from
  // (menu scroll position, chosen category) instead of a fresh menu load.
  // Fall back to the menu for deep-linked entries with no in-app history.
  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push(`/r/${slug}`);
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
      <header
        className="shadow-card sticky top-0 z-20 flex items-center gap-2 px-gutter py-3"
        style={{ background: restaurant.primary_color, color: 'var(--primary-foreground)' }}
      >
        <button
          type="button"
          onClick={goBack}
          className="-ms-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 text-sm font-medium hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
        >
          <ArrowLeft className="h-5 w-5 rtl:-scale-x-100" aria-hidden />
          {t('back_to_menu', lang)}
        </button>
        <h1 className="flex-1 truncate text-base font-semibold">{restaurant.display_name}</h1>
      </header>

      <div className="mx-auto max-w-2xl px-gutter py-5">
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
            {hasDiscount && <DiscountBadge percent={product.discount_percent!} className="!start-3 !top-3" />}
          </div>

          <div className="space-y-3 p-card">
            <h2 className="text-h2 font-bold" {...nameLangProps(resolved.lang)}>{name}</h2>

            <PriceTag
              price={formatAmount(product.price)}
              original={hasDiscount ? formatAmount(product.original_price!) : null}
              currency={restaurant.currency}
              lang={lang}
              layout="inline"
            />

            {hasDiscount &&
              restaurant.active_mode === 'closing' &&
              restaurant.closing_mode_ends_at && (
                <p className="text-destructive-text flex items-center gap-1.5 text-caption font-medium">
                  <Tag className="size-3.5 shrink-0" aria-hidden />
                  {t('offer_ends_at', lang)}{' '}
                  <span dir="ltr" className="font-mono tabular-nums">
                    {formatTimeBaghdad(restaurant.closing_mode_ends_at, lang)}
                  </span>
                </p>
              )}

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

            <button
              type="button"
              disabled={unavailable}
              onClick={() => {
                addToCart(slug, product.id);
                track('product_add', { slug, productId: product.id });
              }}
              className="shadow-card flex min-h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--ring] disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: restaurant.primary_color, color: 'var(--primary-foreground)' }}
            >
              <Plus className="h-5 w-5" aria-hidden />
              {t('add', lang)}
            </button>
          </div>
        </div>
      </div>

      <FloatingCart slug={slug} count={cartCount} primary={restaurant.primary_color} lang={lang} />
    </main>
  );
}
