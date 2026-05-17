'use server';

import { redirect } from 'next/navigation';
import { headers, cookies } from 'next/headers';
import { getServiceClient } from '@/lib/supabase/server';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, setSessionCookie, clearSessionCookie, deleteSession } from '@/lib/auth/session';
import { SESSION_COOKIE } from '@/lib/auth/cookie';
import { checkLoginAttempt, clearLoginAttempts } from '@/lib/auth/rate-limit';

type SignInResult = { ok: true } | { ok: false; error: string };

export async function signInTenant(formData: FormData): Promise<SignInResult> {
  const username = String(formData.get('username') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!username || !password) {
    return { ok: false, error: 'اسم المستخدم وكلمة السر مطلوبان' };
  }

  // Rate limit on the username — PRD §4.5: 5 attempts / 15 min.
  const limit = checkLoginAttempt(`login:${username.toLowerCase()}`);
  if (!limit.allowed) {
    const min = Math.ceil(limit.retryAfterSeconds / 60);
    return { ok: false, error: `محاولات كثيرة — جرّب بعد ${min} دقيقة` };
  }

  const sb = getServiceClient();
  const { data: tenant } = await sb
    .from('restaurants')
    .select('id, password_hash, is_active')
    .eq('username', username)
    .maybeSingle();

  // Always run bcrypt even on no-match so timing doesn't leak account existence.
  const ok = tenant
    ? await verifyPassword(password, tenant.password_hash)
    : await verifyPassword(password, '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');

  if (!tenant || !ok) {
    return { ok: false, error: 'بيانات الدخول غير صحيحة' };
  }
  if (!tenant.is_active) {
    return { ok: false, error: 'هذا الحساب معطّل — راجع المالك' };
  }

  // Success — bind session.
  const h = await headers();
  const ua = h.get('user-agent') ?? undefined;
  const token = await createSession(tenant.id, ua);
  await setSessionCookie(token);
  await sb.from('restaurants').update({ last_login_at: new Date().toISOString() }).eq('id', tenant.id);
  clearLoginAttempts(`login:${username.toLowerCase()}`);

  redirect('/admin/dashboard');
}

export async function signOutTenant(): Promise<void> {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  await clearSessionCookie();
  redirect('/admin');
}
