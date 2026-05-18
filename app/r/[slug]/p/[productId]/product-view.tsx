'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { addToCart, getCart, subscribe, totalQuantity } from '@/lib/cart';
import { isRtl, pickName, t, type Lang } from '@/lib/i18n';
import { track } from '@/lib/track';
import type { MenuPayload, MenuProduct } from '@/lib/menu';
import { formatPrice, FloatingCart } from '../../menu-view';

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

  /* eslint-disable react-hooks/set-state-in-effect --
     Mount-time reads from client-only stores (localStorage / cart). */
  useEffect(() => {
    const saved = (window.localStorage.getItem(LANG_KEY) ?? 'ar') as Lang;
    if (saved === 'ar' || saved === 'en' || saved === 'ku') setLang(saved);
  }, []);

  useEffect(() => {
    setCartCount(totalQuantity(getCart(slug)));
    return subscribe(slug, () => setCartCount(totalQuantity(getCart(slug))));
  }, [slug]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Analytics — record this product view.
  useEffect(() => {
    track('product_open', { slug, productId: product.id });
  }, [slug, product.id]);

  const name = pickName(product, lang);
  const dir = isRtl(lang) ? 'rtl' : 'ltr';
  const unavailable = !product.is_available;
  const hasDiscount = product.discount_percent !== null && product.original_price !== null;

  return (
    <main
      dir={dir}
      className="min-h-screen pb-28"
      style={{ background: restaurant.background_color }}
    >
      <header
        className="shadow-card sticky top-0 z-20 flex items-center gap-3 px-4 py-3"
        style={{ background: restaurant.primary_color, color: '#fff' }}
      >
        <Link href={`/r/${slug}`} className="text-sm hover:underline">
          ← {t('back_to_menu', lang)}
        </Link>
        <h1 className="flex-1 truncate text-base font-semibold">{restaurant.display_name}</h1>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-5">
        <div className="bg-card shadow-card overflow-hidden rounded-xl">
          <div className="bg-cream-deep relative aspect-square w-full">
            {product.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.image_url} alt="" className="h-full w-full object-cover" />
            )}
            {hasDiscount && (
              <span className="bg-amber absolute start-3 top-3 rounded-full px-2 py-1 text-xs font-bold text-white shadow">
                -{product.discount_percent}%
              </span>
            )}
          </div>

          <div className="space-y-3 p-4">
            <h2 className="text-xl font-bold">{name}</h2>

            <div className="flex items-baseline gap-2">
              {hasDiscount && (
                <span className="text-muted-foreground text-sm line-through">
                  {formatPrice(product.original_price!, restaurant.currency)}
                </span>
              )}
              <span
                className="text-lg font-bold"
                style={{ color: restaurant.primary_color }}
              >
                {formatPrice(product.price, restaurant.currency)}
              </span>
            </div>

            <div className="text-muted-foreground text-sm">
              ⏱ {product.prep_time_minutes} {t('prep_unit', lang)}
            </div>

            {unavailable && (
              <p className="text-destructive text-sm font-medium">{t('unavailable', lang)}</p>
            )}

            <button
              type="button"
              disabled={unavailable}
              onClick={() => {
                addToCart(slug, product.id);
                track('product_add', { slug, productId: product.id });
              }}
              className="shadow-lifted w-full rounded-lg py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: restaurant.primary_color }}
            >
              + {t('add', lang)}
            </button>
          </div>
        </div>
      </div>

      <FloatingCart slug={slug} count={cartCount} primary={restaurant.primary_color} lang={lang} />
    </main>
  );
}
