'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getAuthServerClient } from '@/lib/supabase/auth-server';
import {
  checkRate,
  clearRate,
  clientIp,
  LIMIT_LOGIN_PER_IP,
  LIMIT_LOGIN_PER_USERNAME,
} from '@/lib/auth/rate-limit';

export async function signInOwner(formData: FormData): Promise<{ error: string } | undefined> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) {
    return { error: 'البريد وكلمة السر مطلوبان' };
  }

  // Until 2026-08-25 this action had NO application-level rate limit at all —
  // the single most privileged login on the platform relied entirely on
  // Supabase Auth's built-in throttling. Same windows and same Postgres
  // backend as the tenant login (0015).
  const reqHeaders = await headers();
  const ip = clientIp(reqHeaders);
  const emailKey = `owner-login:${email.toLowerCase()}`;

  const ipLimit = await checkRate(`owner-login-ip:${ip}`, LIMIT_LOGIN_PER_IP.max, LIMIT_LOGIN_PER_IP.windowSeconds);
  if (!ipLimit.allowed) {
    return { error: 'محاولات كثيرة من هذا الجهاز — جرّب لاحقاً' };
  }

  const emailLimit = await checkRate(
    emailKey,
    LIMIT_LOGIN_PER_USERNAME.max,
    LIMIT_LOGIN_PER_USERNAME.windowSeconds,
  );
  if (!emailLimit.allowed) {
    const min = Math.ceil(emailLimit.retryAfterSeconds / 60);
    return { error: `محاولات كثيرة — جرّب بعد ${min} دقيقة` };
  }

  const supabase = await getAuthServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: 'فشل الدخول — تحقّق من البريد وكلمة السر' };
  }

  // Reject non-owner accounts even if they have valid credentials. The bucket
  // is deliberately NOT cleared here: valid credentials on a non-owner account
  // are an attack signal, not a successful login.
  if (data.user.app_metadata?.role !== 'owner') {
    await supabase.auth.signOut();
    return { error: 'هذا الحساب ليس لديه صلاحية المالك' };
  }

  await clearRate(emailKey);
  redirect('/owner/dashboard');
}

export async function signOutOwner() {
  const supabase = await getAuthServerClient();
  await supabase.auth.signOut();
  redirect('/owner');
}
