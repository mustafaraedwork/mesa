'use server';

import { revalidatePath } from 'next/cache';
import { getServiceClient } from '@/lib/supabase/server';
import { hashPassword } from '@/lib/auth/password';
import { deleteRestaurantImages } from '@/lib/r2/upload';

const ACCOUNTS_PATH = '/owner/dashboard/accounts';
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,32}$/;

type ActionResult = { ok: true } | { ok: false; error: string };

export async function createAccount(input: {
  display_name: string;
  slug: string;
  username: string;
  password: string;
}): Promise<ActionResult> {
  const display_name = input.display_name.trim();
  const slug = input.slug.trim().toLowerCase();
  const username = input.username.trim();
  const password = input.password;

  if (!display_name) return { ok: false, error: 'اسم المطعم مطلوب' };
  if (!SLUG_RE.test(slug)) return { ok: false, error: 'الـslug يحتوي حروف صغيرة وأرقام وشرطات فقط' };
  if (!USERNAME_RE.test(username)) return { ok: false, error: 'اسم المستخدم: 3-32 حرف من a-z A-Z 0-9 . _ -' };
  if (password.length < 8) return { ok: false, error: 'كلمة السر ٨ أحرف على الأقل' };

  const password_hash = await hashPassword(password);

  const sb = getServiceClient();
  const { error } = await sb.from('restaurants').insert({
    display_name,
    slug,
    username,
    password_hash,
    is_active: true,
  });

  if (error) {
    if (error.code === '23505') {
      const dup = error.message.includes('slug') ? 'الـslug' : 'اسم المستخدم';
      return { ok: false, error: `${dup} مستخدم بالفعل` };
    }
    return { ok: false, error: 'فشل إنشاء الحساب' };
  }

  revalidatePath(ACCOUNTS_PATH);
  revalidatePath('/owner/dashboard');
  return { ok: true };
}

export async function setAccountActive(id: string, is_active: boolean): Promise<ActionResult> {
  const sb = getServiceClient();
  const { error } = await sb.from('restaurants').update({ is_active }).eq('id', id);
  if (error) return { ok: false, error: 'فشل تحديث الحالة' };
  revalidatePath(ACCOUNTS_PATH);
  revalidatePath('/owner/dashboard');
  return { ok: true };
}

export async function changeAccountPassword(id: string, newPassword: string): Promise<ActionResult> {
  if (newPassword.length < 8) return { ok: false, error: 'كلمة السر ٨ أحرف على الأقل' };
  const password_hash = await hashPassword(newPassword);
  const sb = getServiceClient();

  // Update password and revoke every existing tenant session to force re-login.
  const { error: updErr } = await sb.from('restaurants').update({ password_hash }).eq('id', id);
  if (updErr) return { ok: false, error: 'فشل تغيير كلمة السر' };
  await sb.from('tenant_sessions').delete().eq('restaurant_id', id);

  revalidatePath(ACCOUNTS_PATH);
  return { ok: true };
}

export async function deleteAccount(id: string): Promise<ActionResult> {
  const sb = getServiceClient();

  // 1. Purge R2 images (DB cascade can't reach external storage).
  try {
    await deleteRestaurantImages(id);
  } catch {
    return { ok: false, error: 'تعذّر حذف الصور من R2 — تم إلغاء العملية' };
  }

  // 2. Delete the restaurant row — cascades to categories, products,
  //    complementary_categories, tenant_sessions via FKs.
  const { error } = await sb.from('restaurants').delete().eq('id', id);
  if (error) return { ok: false, error: 'فشل حذف الحساب من قاعدة البيانات' };

  revalidatePath(ACCOUNTS_PATH);
  revalidatePath('/owner/dashboard');
  return { ok: true };
}
