'use server';

import { redirect } from 'next/navigation';
import { getAuthServerClient } from '@/lib/supabase/auth-server';

export async function signInOwner(formData: FormData): Promise<{ error: string } | undefined> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) {
    return { error: 'البريد وكلمة السر مطلوبان' };
  }

  const supabase = await getAuthServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: 'فشل الدخول — تحقّق من البريد وكلمة السر' };
  }

  // Reject non-owner accounts even if they have valid credentials.
  if (data.user.app_metadata?.role !== 'owner') {
    await supabase.auth.signOut();
    return { error: 'هذا الحساب ليس لديه صلاحية المالك' };
  }

  redirect('/owner/dashboard');
}

export async function signOutOwner() {
  const supabase = await getAuthServerClient();
  await supabase.auth.signOut();
  redirect('/owner');
}
