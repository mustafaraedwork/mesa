// Shared menu loader — used by both `/api/menu/[slug]` and the diner server page.
// Single source of truth for the menu shape returned to diners.

import { getServiceClient } from '@/lib/supabase/server';
import {
  applyDiscount,
  CLOSING_VIRTUAL_CATEGORY_ID,
  CLOSING_VIRTUAL_CATEGORY_NAMES,
  type Discount,
} from '@/lib/closing';

type Restaurant = {
  id: string;
  slug: string;
  display_name: string;
  is_active: boolean;
  primary_color: string;
  background_color: string;
  logo_url: string | null;
  currency: string;
  show_unavailable_items: boolean;
  active_mode: 'normal' | 'rush' | 'profit' | 'closing';
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
  profit_percentage: string | number;
  prep_time_minutes: number;
  image_url: string | null;
  is_available: boolean | null;
  is_in_closing_mode: boolean | null;
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
  profit_percentage: number;
  prep_time_minutes: number;
  image_url: string | null;
  is_available: boolean;
  is_in_closing_mode: boolean;
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
      'id, slug, display_name, is_active, primary_color, background_color, logo_url, currency, show_unavailable_items, active_mode, closing_mode_ends_at, closing_mode_discount',
    )
    .eq('slug', slug)
    .maybeSingle<Restaurant>();

  if (!rest || !rest.is_active) return null;

  // Lazy auto-revert (Q3) — race-safe via the `active_mode='closing'` WHERE.
  let active_mode = rest.active_mode;
  let closing_mode_ends_at = rest.closing_mode_ends_at;
  let closing_mode_discount = rest.closing_mode_discount;

  if (
    active_mode === 'closing' &&
    closing_mode_ends_at &&
    new Date(closing_mode_ends_at).getTime() < Date.now()
  ) {
    await sb
      .from('restaurants')
      .update({ active_mode: 'normal', closing_mode_ends_at: null, closing_mode_discount: null })
      .eq('id', rest.id)
      .eq('active_mode', 'closing');
    await sb
      .from('products')
      .update({ is_in_closing_mode: false })
      .eq('restaurant_id', rest.id)
      .eq('is_in_closing_mode', true);
    active_mode = 'normal';
    closing_mode_ends_at = null;
    closing_mode_discount = null;
  }

  const [{ data: cats }, { data: prods }, { data: complinks }] = await Promise.all([
    sb
      .from('categories')
      .select('id, parent_id, name_ar, name_en, name_ku, display_order')
      .eq('restaurant_id', rest.id)
      .order('display_order', { ascending: true }),
    sb
      .from('products')
      .select(
        'id, category_id, name_ar, name_en, name_ku, price, profit_percentage, prep_time_minutes, image_url, is_available, is_in_closing_mode, display_order, suggestions_type, custom_suggestion_ids',
      )
      .eq('restaurant_id', rest.id),
    sb
      .from('complementary_categories')
      .select('category_id, complement_id')
      .eq('restaurant_id', rest.id),
  ]);

  const sortComparator = (() => {
    switch (active_mode) {
      case 'rush':
        return (a: ProductRow, b: ProductRow) => a.prep_time_minutes - b.prep_time_minutes;
      case 'profit':
        return (a: ProductRow, b: ProductRow) =>
          Number(b.profit_percentage) - Number(a.profit_percentage);
      default:
        return (a: ProductRow, b: ProductRow) => a.display_order - b.display_order;
    }
  })();

  const productsByCategory = new Map<string, MenuProduct[]>();
  const closingProducts: MenuProduct[] = [];
  const isClosing = active_mode === 'closing';
  const discount = (closing_mode_discount ?? null) as Discount | null;

  const sortedRows = (prods ?? []).slice().sort(sortComparator);

  for (const r of sortedRows as ProductRow[]) {
    const available = r.is_available ?? true;
    if (!rest.show_unavailable_items && !available) continue;

    const originalPrice = Number(r.price);
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
      profit_percentage: Number(r.profit_percentage),
      prep_time_minutes: r.prep_time_minutes,
      image_url: r.image_url,
      is_available: available,
      is_in_closing_mode: inClosing,
      display_order: r.display_order,
      suggestions_type: r.suggestions_type === 'custom' ? 'custom' : 'default',
      custom_suggestion_ids: r.custom_suggestion_ids,
    };

    const arr = productsByCategory.get(r.category_id) ?? [];
    arr.push(product);
    productsByCategory.set(r.category_id, arr);

    if (isClosing && inClosing) closingProducts.push(product);
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

  if (isClosing && closingProducts.length > 0) {
    categories.unshift({
      id: CLOSING_VIRTUAL_CATEGORY_ID,
      parent_id: null,
      ...CLOSING_VIRTUAL_CATEGORY_NAMES,
      display_order: -1,
      is_virtual: true,
      complement_ids: [],
      products: closingProducts,
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
