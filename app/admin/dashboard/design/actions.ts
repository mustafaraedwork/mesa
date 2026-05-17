'use server';

import { revalidatePath } from 'next/cache';
import { requireTenant } from '@/lib/auth/require-tenant';
import { getServiceClient } from '@/lib/supabase/server';
import { uploadProductImage, deleteImage } from '@/lib/r2/upload';
import { isSupportedCurrency } from '@/lib/currencies';

const DESIGN_PATH = '/admin/dashboard/design';

type Result = { ok: true } | { ok: false; error: string };

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export async function saveDesign(formData: FormData): Promise<Result> {
  const { restaurantId } = await requireTenant();
  const sb = getServiceClient();

  const display_name = String(formData.get('display_name') ?? '').trim();
  const primary_color = String(formData.get('primary_color') ?? '').trim();
  const background_color = String(formData.get('background_color') ?? '').trim();
  const currency = String(formData.get('currency') ?? '').trim();
  const logo = formData.get('logo');
  const removeLogo = formData.get('remove_logo') === 'true';
  const show_unavailable_items = formData.get('show_unavailable_items') === 'true';

  if (!display_name) return { ok: false, error: 'اسم المطعم مطلوب' };
  if (display_name.length > 100) return { ok: false, error: 'اسم المطعم طويل جداً' };
  if (!HEX_RE.test(primary_color)) return { ok: false, error: 'لون أساسي غير صالح' };
  if (!HEX_RE.test(background_color)) return { ok: false, error: 'لون خلفية غير صالح' };
  if (!isSupportedCurrency(currency)) return { ok: false, error: 'العملة غير مدعومة' };

  const { data: existing } = await sb
    .from('restaurants')
    .select('logo_url')
    .eq('id', restaurantId)
    .maybeSingle();
  if (!existing) return { ok: false, error: 'الحساب غير موجود' };

  const update: Record<string, unknown> = {
    display_name,
    primary_color: primary_color.toLowerCase(),
    background_color: background_color.toLowerCase(),
    currency,
    show_unavailable_items,
  };

  let oldLogoToDelete: string | null = null;

  if (logo instanceof File && logo.size > 0) {
    const buf = Buffer.from(await logo.arrayBuffer());
    try {
      const up = await uploadProductImage(buf, `restaurants/${restaurantId}/logo`);
      update.logo_url = up.url;
      oldLogoToDelete = existing.logo_url ?? null;
    } catch {
      return { ok: false, error: 'فشل رفع اللوغو — جرّب صورة أخرى' };
    }
  } else if (removeLogo && existing.logo_url) {
    update.logo_url = null;
    oldLogoToDelete = existing.logo_url;
  }

  const { error } = await sb.from('restaurants').update(update).eq('id', restaurantId);
  if (error) {
    if (typeof update.logo_url === 'string') {
      try { await deleteImage(extractR2Key(update.logo_url)); } catch {}
    }
    return { ok: false, error: 'فشل حفظ التصميم' };
  }

  if (oldLogoToDelete) {
    try { await deleteImage(extractR2Key(oldLogoToDelete)); } catch {}
  }

  revalidatePath(DESIGN_PATH);
  return { ok: true };
}

function extractR2Key(publicUrl: string): string {
  const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, '') ?? '';
  if (publicUrl.startsWith(base + '/')) return publicUrl.slice(base.length + 1);
  try {
    return new URL(publicUrl).pathname.replace(/^\//, '');
  } catch {
    return publicUrl;
  }
}
