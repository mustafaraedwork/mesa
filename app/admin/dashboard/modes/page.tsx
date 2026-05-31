import { requireTenant } from '@/lib/auth/require-tenant';
import { getServiceClient } from '@/lib/supabase/server';
import { ModesView, type CategoryGroup } from './modes-view';
import type { Mode, Discount } from '@/lib/closing';

export const dynamic = 'force-dynamic';

type Restaurant = {
  id: string;
  active_mode: Mode;
  closing_mode_ends_at: string | null;
  closing_mode_discount: Discount | null;
  currency: string;
};

export default async function ModesPage() {
  const tenant = await requireTenant();
  const sb = getServiceClient();

  const [{ data: rest }, { data: cats }, { data: prods }] = await Promise.all([
    sb
      .from('restaurants')
      .select('id, active_mode, closing_mode_ends_at, closing_mode_discount, currency')
      .eq('id', tenant.restaurantId)
      .single<Restaurant>(),
    sb
      .from('categories')
      .select('id, parent_id, name_ar, display_order')
      .eq('restaurant_id', tenant.restaurantId)
      .order('display_order', { ascending: true }),
    sb
      .from('products')
      .select('id, category_id, name_ar, price, is_available, is_in_closing_mode, is_chef_pick, display_order')
      .eq('restaurant_id', tenant.restaurantId)
      .order('display_order', { ascending: true }),
  ]);

  // Group products under their categories for the multi-select UI.
  const productsByCategory = new Map<string, NonNullable<typeof prods>[number][]>();
  for (const p of prods ?? []) {
    const arr = productsByCategory.get(p.category_id) ?? [];
    arr.push(p);
    productsByCategory.set(p.category_id, arr);
  }

  const groups: CategoryGroup[] = (cats ?? []).map((c) => ({
    id: c.id,
    name_ar: c.name_ar,
    products: (productsByCategory.get(c.id) ?? []).map((p) => ({
      id: p.id,
      name_ar: p.name_ar,
      price: Number(p.price),
      is_available: p.is_available ?? true,
      is_in_closing_mode: p.is_in_closing_mode ?? false,
      is_chef_pick: p.is_chef_pick ?? false,
    })),
  }));

  return (
    <ModesView
      initialState={{
        // Coerce any legacy rush/profit row to normal (migration 0004); pass
        // through the live modes normal/closing/off.
        active_mode:
          rest!.active_mode === 'closing' || rest!.active_mode === 'off'
            ? rest!.active_mode
            : 'normal',
        closing_mode_ends_at: rest!.closing_mode_ends_at,
        closing_mode_discount: rest!.closing_mode_discount,
        server_now: new Date().toISOString(),
      }}
      currency={rest!.currency}
      categoryGroups={groups}
    />
  );
}
