'use server';

import { revalidatePath } from 'next/cache';
import { requireTenant } from '@/lib/auth/require-tenant';
import { getServiceClient } from '@/lib/supabase/server';
import { uploadProductImage, deleteImage } from '@/lib/r2/upload';

const MENU_PATH = '/admin/dashboard/menu';

type Result = { ok: true } | { ok: false; error: string };
type CreateProductResult = { ok: true; productId: string } | { ok: false; error: string };

// ─────────────── Categories ──────────────────────────────────────

export async function createCategory(input: {
  name_ar: string;
  name_en?: string;
  name_ku?: string;
  parent_id?: string | null;
}): Promise<Result> {
  const { restaurantId } = await requireTenant();
  const name_ar = input.name_ar.trim();
  if (!name_ar) return { ok: false, error: 'الاسم بالعربي مطلوب' };

  const sb = getServiceClient();

  // Enforce 2-level hierarchy in app code (PRD §4.3 — DB does not enforce).
  if (input.parent_id) {
    const { data: parent } = await sb
      .from('categories')
      .select('id, restaurant_id, parent_id')
      .eq('id', input.parent_id)
      .maybeSingle();
    if (!parent || parent.restaurant_id !== restaurantId) {
      return { ok: false, error: 'السكشن الرئيسي غير صالح' };
    }
    if (parent.parent_id !== null) {
      return { ok: false, error: 'لا يمكن إنشاء سكشن فرعي تحت سكشن فرعي' };
    }
  }

  // New row gets display_order = max+1 within the same parent scope.
  let orderQuery = sb
    .from('categories')
    .select('display_order')
    .eq('restaurant_id', restaurantId)
    .order('display_order', { ascending: false })
    .limit(1);
  orderQuery = input.parent_id
    ? orderQuery.eq('parent_id', input.parent_id)
    : orderQuery.is('parent_id', null);
  const { data: ordered } = await orderQuery.maybeSingle();
  const next_order = (ordered?.display_order ?? -1) + 1;

  const { error } = await sb.from('categories').insert({
    restaurant_id: restaurantId,
    parent_id: input.parent_id ?? null,
    name_ar,
    name_en: input.name_en?.trim() || null,
    name_ku: input.name_ku?.trim() || null,
    display_order: next_order,
  });
  if (error) return { ok: false, error: 'فشل إنشاء السكشن' };

  revalidatePath(MENU_PATH);
  return { ok: true };
}

export async function updateCategory(input: {
  id: string;
  name_ar: string;
  name_en?: string;
  name_ku?: string;
}): Promise<Result> {
  const { restaurantId } = await requireTenant();
  const name_ar = input.name_ar.trim();
  if (!name_ar) return { ok: false, error: 'الاسم بالعربي مطلوب' };

  const sb = getServiceClient();
  const { error } = await sb
    .from('categories')
    .update({
      name_ar,
      name_en: input.name_en?.trim() || null,
      name_ku: input.name_ku?.trim() || null,
    })
    .eq('id', input.id)
    .eq('restaurant_id', restaurantId);
  if (error) return { ok: false, error: 'فشل تعديل السكشن' };

  revalidatePath(MENU_PATH);
  return { ok: true };
}

export async function deleteCategory(id: string): Promise<Result> {
  const { restaurantId } = await requireTenant();
  const sb = getServiceClient();

  // Collect image keys for products under this category (and its sub-categories)
  // so we can purge them from R2 before the DB cascade removes the rows.
  const { data: subs } = await sb
    .from('categories')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .eq('parent_id', id);
  const categoryIds = [id, ...(subs ?? []).map((s) => s.id)];

  const { data: products } = await sb
    .from('products')
    .select('image_url')
    .in('category_id', categoryIds);

  for (const p of products ?? []) {
    if (p.image_url) {
      try {
        await deleteImage(extractR2Key(p.image_url));
      } catch {
        // Continue — orphan images are tolerable; failing the whole delete isn't.
      }
    }
  }

  const { error } = await sb
    .from('categories')
    .delete()
    .eq('id', id)
    .eq('restaurant_id', restaurantId);
  if (error) return { ok: false, error: 'فشل حذف السكشن' };

  revalidatePath(MENU_PATH);
  return { ok: true };
}

// ─────────────── Products ────────────────────────────────────────

export async function createProduct(formData: FormData): Promise<CreateProductResult> {
  const { restaurantId } = await requireTenant();
  const sb = getServiceClient();

  const category_id = String(formData.get('category_id') ?? '');
  const name_ar = String(formData.get('name_ar') ?? '').trim();
  const name_en = String(formData.get('name_en') ?? '').trim() || null;
  const name_ku = String(formData.get('name_ku') ?? '').trim() || null;
  const price = Number(formData.get('price'));
  const profit_percentage = Number(formData.get('profit_percentage') ?? 0);
  const prep_time_minutes = Number(formData.get('prep_time_minutes') ?? 5);
  const image = formData.get('image');

  if (!name_ar) return { ok: false, error: 'الاسم بالعربي مطلوب' };
  if (!Number.isFinite(price) || price < 0) return { ok: false, error: 'السعر غير صالح' };
  if (!Number.isFinite(profit_percentage) || profit_percentage < 0 || profit_percentage > 100) {
    return { ok: false, error: 'هامش الربح يجب أن يكون بين 0 و 100' };
  }
  if (!Number.isFinite(prep_time_minutes) || prep_time_minutes < 1 || prep_time_minutes > 240) {
    return { ok: false, error: 'وقت التحضير يجب أن يكون بين ١ و ٢٤٠ دقيقة' };
  }

  // Verify category belongs to this restaurant (defense in depth — RLS isn't
  // load-bearing for tenant writes; we use the service role).
  const { data: cat } = await sb
    .from('categories')
    .select('id')
    .eq('id', category_id)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();
  if (!cat) return { ok: false, error: 'السكشن غير موجود' };

  let image_url: string | null = null;
  if (image instanceof File && image.size > 0) {
    const buf = Buffer.from(await image.arrayBuffer());
    try {
      const up = await uploadProductImage(buf, `restaurants/${restaurantId}/products`);
      image_url = up.url;
    } catch {
      return { ok: false, error: 'فشل رفع الصورة — جرّب صورة أخرى' };
    }
  }

  const { data: maxOrder } = await sb
    .from('products')
    .select('display_order')
    .eq('category_id', category_id)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const next_order = (maxOrder?.display_order ?? -1) + 1;

  const { data: inserted, error } = await sb
    .from('products')
    .insert({
      restaurant_id: restaurantId,
      category_id,
      name_ar,
      name_en,
      name_ku,
      price,
      profit_percentage,
      prep_time_minutes,
      image_url,
      display_order: next_order,
    })
    .select('id')
    .single();
  if (error || !inserted) {
    if (image_url) {
      try { await deleteImage(extractR2Key(image_url)); } catch {}
    }
    return { ok: false, error: 'فشل إنشاء المنتج' };
  }

  revalidatePath(MENU_PATH);
  return { ok: true, productId: inserted.id };
}

export async function updateProduct(formData: FormData): Promise<Result> {
  const { restaurantId } = await requireTenant();
  const sb = getServiceClient();

  const id = String(formData.get('id') ?? '');
  const name_ar = String(formData.get('name_ar') ?? '').trim();
  const name_en = String(formData.get('name_en') ?? '').trim() || null;
  const name_ku = String(formData.get('name_ku') ?? '').trim() || null;
  const price = Number(formData.get('price'));
  const profit_percentage = Number(formData.get('profit_percentage') ?? 0);
  const prep_time_minutes = Number(formData.get('prep_time_minutes') ?? 5);
  const image = formData.get('image');
  const removeImage = formData.get('remove_image') === 'true';

  if (!name_ar) return { ok: false, error: 'الاسم بالعربي مطلوب' };
  if (!Number.isFinite(price) || price < 0) return { ok: false, error: 'السعر غير صالح' };

  const { data: existing } = await sb
    .from('products')
    .select('id, image_url')
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();
  if (!existing) return { ok: false, error: 'المنتج غير موجود' };

  const update: Record<string, unknown> = {
    name_ar, name_en, name_ku, price, profit_percentage, prep_time_minutes,
  };

  if (image instanceof File && image.size > 0) {
    const buf = Buffer.from(await image.arrayBuffer());
    try {
      const up = await uploadProductImage(buf, `restaurants/${restaurantId}/products`);
      update.image_url = up.url;
      if (existing.image_url) {
        try { await deleteImage(extractR2Key(existing.image_url)); } catch {}
      }
    } catch {
      return { ok: false, error: 'فشل رفع الصورة — جرّب صورة أخرى' };
    }
  } else if (removeImage && existing.image_url) {
    try { await deleteImage(extractR2Key(existing.image_url)); } catch {}
    update.image_url = null;
  }

  const { error } = await sb
    .from('products')
    .update(update)
    .eq('id', id)
    .eq('restaurant_id', restaurantId);
  if (error) return { ok: false, error: 'فشل تعديل المنتج' };

  revalidatePath(MENU_PATH);
  return { ok: true };
}

export async function setProductAvailable(id: string, is_available: boolean): Promise<Result> {
  const { restaurantId } = await requireTenant();
  const sb = getServiceClient();
  const { error } = await sb
    .from('products')
    .update({ is_available })
    .eq('id', id)
    .eq('restaurant_id', restaurantId);
  if (error) return { ok: false, error: 'فشل تحديث الحالة' };
  revalidatePath(MENU_PATH);
  return { ok: true };
}

export async function deleteProduct(id: string): Promise<Result> {
  const { restaurantId } = await requireTenant();
  const sb = getServiceClient();

  const { data: existing } = await sb
    .from('products')
    .select('image_url')
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .maybeSingle();
  if (!existing) return { ok: false, error: 'المنتج غير موجود' };

  if (existing.image_url) {
    try { await deleteImage(extractR2Key(existing.image_url)); } catch {}
  }

  const { error } = await sb
    .from('products')
    .delete()
    .eq('id', id)
    .eq('restaurant_id', restaurantId);
  if (error) return { ok: false, error: 'فشل حذف المنتج' };

  revalidatePath(MENU_PATH);
  return { ok: true };
}

// ─────────────── helpers ─────────────────────────────────────────

// Convert the public R2 URL stored in `image_url` back to the bucket key.
// The URL format is `${R2_PUBLIC_URL}/${key}`.
function extractR2Key(publicUrl: string): string {
  const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, '') ?? '';
  if (publicUrl.startsWith(base + '/')) return publicUrl.slice(base.length + 1);
  // Fallback: strip protocol+host.
  try {
    return new URL(publicUrl).pathname.replace(/^\//, '');
  } catch {
    return publicUrl;
  }
}
