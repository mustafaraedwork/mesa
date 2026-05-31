// Shared menu loader — used by both `/api/menu/[slug]` and the diner server page.
// Single source of truth for the menu shape returned to diners.

import { getServiceClient } from '@/lib/supabase/server';
import {
  applyDiscount,
  applyLazyRevert,
  CLOSING_VIRTUAL_CATEGORY_ID,
  CLOSING_VIRTUAL_CATEGORY_NAMES,
  coerceMode,
  DISCOUNTS,
  type Discount,
} from '@/lib/closing';

type Restaurant = {
  id: string;
  slug: string;
  display_name: string;
  is_active: boolean;
  primary_color: string;
  background_color: string;
  header_color: string | null;
  card_color: string | null;
  text_color: string | null;
  logo_url: string | null;
  currency: string;
  show_unavailable_items: boolean;
  active_mode: 'normal' | 'closing' | 'off';
  closing_mode_ends_at: string | null;
  closing_mode_discount: number | null;
};

type ProductRow = {
  id: string;
  category_id: string;
  name_ar: string;
  name_en: string | null;
  name_ku: string | null;
  price: string | number;
  prep_time_minutes: number;
  image_url: string | null;
  is_available: boolean | null;
  is_in_closing_mode: boolean | null;
  is_chef_pick: boolean | null;
  display_order: number;
  suggestions_type: string | null;
  custom_suggestion_ids: string[] | null;
};

type CategoryRow = {
  id: string;
  parent_id: string | null;
  name_ar: string;
  name_en: string | null;
  name_ku: string | null;
  display_order: number;
};

export type MenuProduct = {
  id: string;
  category_id: string;
  name_ar: string;
  name_en: string | null;
  name_ku: string | null;
  price: number;
  original_price: number | null;
  discount_percent: number | null;
  prep_time_minutes: number;
  image_url: string | null;
  is_available: boolean;
  is_in_closing_mode: boolean;
  is_chef_pick: boolean;
  display_order: number;
  suggestions_type: 'default' | 'custom';
  custom_suggestion_ids: string[] | null;
};

export type MenuCategory = {
  id: string;
  parent_id: string | null;
  name_ar: string;
  name_en: string | null;
  name_ku: string | null;
  display_order: number;
  is_virtual?: boolean;
  complement_ids: string[];
  products: MenuProduct[];
};

export type MenuPayload = {
  server_now: string;
  restaurant: {
    id: string;
    slug: string;
    display_name: string;
    primary_color: string;
    background_color: string;
    header_color: string;
    card_color: string;
    text_color: string;
    logo_url: string | null;
    currency: string;
    show_unavailable_items: boolean;
    active_mode: Restaurant['active_mode'];
    closing_mode_ends_at: string | null;
    closing_mode_discount: number | null;
  };
  categories: MenuCategory[];
};

// Returns null when the restaurant doesn't exist or is inactive — caller
// decides how to render "غير متوفر".
export async function loadMenu(slug: string): Promise<MenuPayload | null> {
  const sb = getServiceClient();

  const { data: rest } = await sb
    .from('restaurants')
    .select(
      'id, slug, display_name, is_active, primary_color, background_color, header_color, card_color, text_color, logo_url, currency, show_unavailable_items, active_mode, closing_mode_ends_at, closing_mode_discount',
    )
    .eq('slug', slug)
    .maybeSingle<Restaurant>();

  if (!rest || !rest.is_active) return null;

  // Lazy auto-revert (Q3) — race-safe via the `active_mode='closing'` WHERE.
  // Q-12: coerce any legacy rush/profit row to a live mode on read.
  let active_mode = coerceMode(rest.active_mode);
  let closing_mode_ends_at = rest.closing_mode_ends_at;
  let closing_mode_discount = rest.closing_mode_discount;

  // Q-2: treat a malformed `closing_mode_ends_at` (NaN) as expired so a corrupt
  // timestamp self-heals to Normal instead of sticking in Closing forever.
  const closingExpiry = closing_mode_ends_at ? new Date(closing_mode_ends_at).getTime() : null;
  if (
    active_mode === 'closing' &&
    closingExpiry !== null &&
    (Number.isNaN(closingExpiry) || closingExpiry < Date.now())
  ) {
    await applyLazyRevert(sb, rest.id);
    active_mode = 'normal';
    closing_mode_ends_at = null;
    closing_mode_discount = null;
  }

  const [
    { data: cats, error: catsErr },
    { data: prods, error: prodsErr },
    { data: complinks, error: complinksErr },
  ] = await Promise.all([
    sb
      .from('categories')
      .select('id, parent_id, name_ar, name_en, name_ku, display_order')
      .eq('restaurant_id', rest.id)
      .order('display_order', { ascending: true }),
    sb
      .from('products')
      .select(
        'id, category_id, name_ar, name_en, name_ku, price, prep_time_minutes, image_url, is_available, is_in_closing_mode, is_chef_pick, display_order, suggestions_type, custom_suggestion_ids',
      )
      .eq('restaurant_id', rest.id)
      .order('display_order', { ascending: true }),
    sb
      .from('complementary_categories')
      .select('category_id, complement_id')
      .eq('restaurant_id', rest.id),
  ]);

  // Q-3: surface a transient read failure instead of silently rendering an
  // empty menu (the `?? []` fallbacks below would otherwise mask it).
  if (catsErr || prodsErr || complinksErr) return null;

  const productsByCategory = new Map<string, MenuProduct[]>();
  const closingProducts: MenuProduct[] = [];
  const chefPickProducts: MenuProduct[] = [];
  const isClosing = active_mode === 'closing';
  // Q-13: only honour a discount value that is actually one of the allowed
  // tiers — a stray DB value (e.g. 15 from a manual UPDATE) must not surface as
  // a discount the tenant never configured.
  const discount: Discount | null =
    closing_mode_discount !== null &&
    (DISCOUNTS as readonly number[]).includes(closing_mode_discount)
      ? (closing_mode_discount as Discount)
      : null;

  // Both surviving modes (normal + closing) present products in the tenant's
  // manual order. Legacy rows still flagged rush/profit fall through here too.
  const sortedRows = (prods ?? [])
    .slice()
    .sort((a, b) => a.display_order - b.display_order);

  for (const r of sortedRows as ProductRow[]) {
    const available = r.is_available ?? true;
    if (!rest.show_unavailable_items && !available) continue;

    const originalPrice = Number(r.price);
    // Q-1: drop rows with a corrupt price rather than letting NaN flow through
    // the discount math and surface as "NaN IQD" in the cart total.
    if (!Number.isFinite(originalPrice) || originalPrice < 0) continue;
    let price = originalPrice;
    let original_price: number | null = null;
    let discount_percent: number | null = null;

    const inClosing = (r.is_in_closing_mode ?? false) === true;
    if (isClosing && inClosing && discount !== null) {
      const discounted = applyDiscount(originalPrice, discount, rest.currency);
      if (discounted < originalPrice) {
        price = discounted;
        original_price = originalPrice;
        discount_percent = discount;
      }
    }

    const product: MenuProduct = {
      id: r.id,
      category_id: r.category_id,
      name_ar: r.name_ar,
      name_en: r.name_en,
      name_ku: r.name_ku,
      price,
      original_price,
      discount_percent,
      prep_time_minutes: r.prep_time_minutes,
      image_url: r.image_url,
      is_available: available,
      is_in_closing_mode: inClosing,
      is_chef_pick: (r.is_chef_pick ?? false) === true,
      display_order: r.display_order,
      suggestions_type: r.suggestions_type === 'custom' ? 'custom' : 'default',
      custom_suggestion_ids: r.custom_suggestion_ids,
    };

    const arr = productsByCategory.get(r.category_id) ?? [];
    arr.push(product);
    productsByCategory.set(r.category_id, arr);

    if (isClosing && inClosing) closingProducts.push(product);
    if (!isClosing && product.is_chef_pick) chefPickProducts.push(product);
  }

  const complementsByCategory = new Map<string, string[]>();
  for (const link of (complinks ?? []) as { category_id: string; complement_id: string }[]) {
    const arr = complementsByCategory.get(link.category_id) ?? [];
    arr.push(link.complement_id);
    complementsByCategory.set(link.category_id, arr);
  }

  const categories: MenuCategory[] = (cats ?? []).map((c: CategoryRow) => ({
    id: c.id,
    parent_id: c.parent_id,
    name_ar: c.name_ar,
    name_en: c.name_en,
    name_ku: c.name_ku,
    display_order: c.display_order,
    complement_ids: complementsByCategory.get(c.id) ?? [],
    products: productsByCategory.get(c.id) ?? [],
  }));

  // One virtual "اختيارات الشيف" slot at the top. In Closing mode it holds the
  // discounted items; in Normal mode it holds the owner's curated chef picks.
  // In Off mode nothing special surfaces — a plain menu.
  const virtualProducts =
    active_mode === 'off' ? [] : isClosing ? closingProducts : chefPickProducts;
  if (virtualProducts.length > 0) {
    categories.unshift({
      id: CLOSING_VIRTUAL_CATEGORY_ID,
      parent_id: null,
      ...CLOSING_VIRTUAL_CATEGORY_NAMES,
      display_order: -1,
      is_virtual: true,
      complement_ids: [],
      products: virtualProducts,
    });
  }

  return {
    server_now: new Date().toISOString(),
    restaurant: {
      id: rest.id,
      slug: rest.slug,
      display_name: rest.display_name,
      primary_color: rest.primary_color,
      background_color: rest.background_color,
      // NULL → sensible default that matches the pre-customization look.
      header_color: rest.header_color ?? rest.background_color,
      card_color: rest.card_color ?? '#ffffff',
      text_color: rest.text_color ?? '#1a1a1a',
      logo_url: rest.logo_url,
      currency: rest.currency,
      show_unavailable_items: rest.show_unavailable_items,
      active_mode,
      closing_mode_ends_at,
      closing_mode_discount,
    },
    categories,
  };
}
