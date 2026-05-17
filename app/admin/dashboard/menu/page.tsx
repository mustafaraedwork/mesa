import { requireTenant } from '@/lib/auth/require-tenant';
import { getServiceClient } from '@/lib/supabase/server';
import { MenuView, type CategoryNode, type Product } from './menu-view';
import { ComplementarySection } from './complementary-section';

export const dynamic = 'force-dynamic';

type FlatCategory = { id: string; name_ar: string; parent_id: string | null };
type ComplementLink = { id: string; category_id: string; complement_id: string };

async function loadMenuData(restaurantId: string): Promise<{
  tree: CategoryNode[];
  categories: FlatCategory[];
  complements: ComplementLink[];
}> {
  const sb = getServiceClient();

  const [{ data: cats }, { data: prods }, { data: complements }] = await Promise.all([
    sb
      .from('categories')
      .select('id, parent_id, name_ar, name_en, name_ku, display_order')
      .eq('restaurant_id', restaurantId)
      .order('display_order', { ascending: true }),
    sb
      .from('products')
      .select('id, category_id, name_ar, name_en, name_ku, price, profit_percentage, prep_time_minutes, image_url, is_available, display_order, suggestions_type, custom_suggestion_ids')
      .eq('restaurant_id', restaurantId)
      .order('display_order', { ascending: true }),
    sb
      .from('complementary_categories')
      .select('id, category_id, complement_id')
      .eq('restaurant_id', restaurantId),
  ]);

  const productsByCategory = new Map<string, Product[]>();
  for (const p of (prods ?? []) as Product[]) {
    const arr = productsByCategory.get(p.category_id) ?? [];
    arr.push(p);
    productsByCategory.set(p.category_id, arr);
  }

  const childrenByParent = new Map<string, CategoryNode[]>();
  const roots: CategoryNode[] = [];

  for (const c of cats ?? []) {
    const node: CategoryNode = {
      id: c.id,
      parent_id: c.parent_id,
      name_ar: c.name_ar,
      name_en: c.name_en,
      name_ku: c.name_ku,
      display_order: c.display_order,
      products: productsByCategory.get(c.id) ?? [],
      children: [],
    };
    if (c.parent_id) {
      const arr = childrenByParent.get(c.parent_id) ?? [];
      arr.push(node);
      childrenByParent.set(c.parent_id, arr);
    } else {
      roots.push(node);
    }
  }
  for (const r of roots) {
    r.children = childrenByParent.get(r.id) ?? [];
  }

  const categories: FlatCategory[] = (cats ?? []).map((c) => ({
    id: c.id,
    name_ar: c.name_ar,
    parent_id: c.parent_id,
  }));

  return { tree: roots, categories, complements: complements ?? [] };
}

export default async function MenuPage() {
  const tenant = await requireTenant();
  const { tree, categories, complements } = await loadMenuData(tenant.restaurantId);
  return (
    <div className="space-y-8">
      <MenuView tree={tree} />
      <ComplementarySection categories={categories} links={complements} />
    </div>
  );
}
