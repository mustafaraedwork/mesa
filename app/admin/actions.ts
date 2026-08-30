'use server';

import { redirect } from 'next/navigation';
import { headers, cookies } from 'next/headers';
import { getServiceClient } from '@/lib/supabase/server';
import { verifyPassword } from '@/lib/auth/password';
import { createSession, setSessionCookie, clearSessionCookie, deleteSession } from '@/lib/auth/session';
import { SESSION_COOKIE } from '@/lib/auth/cookie';
import {
  checkRate,
  clearRate,
  clientIp,
  LIMIT_LOGIN_PER_IP,
  LIMIT_LOGIN_PER_USERNAME,
} from '@/lib/auth/rate-limit';

type SignInResult = { ok: true } | { ok: false; error: string };

export async function signInTenant(formData: FormData): Promise<SignInResult> {
  const username = String(formData.get('username') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!username || !password) {
    return { ok: false, error: 'اسم المستخدم وكلمة السر مطلوبان' };
  }

  // H-4: per-IP limit across all usernames (credential-stuffing guard), on top
  // of the per-username window below. Both windows live in Postgres (0015).
  const reqHeaders = await headers();
  const ip = clientIp(reqHeaders);
  const ipLimit = await checkRate(`login-ip:${ip}`, LIMIT_LOGIN_PER_IP.max, LIMIT_LOGIN_PER_IP.windowSeconds);
  if (!ipLimit.allowed) {
    return { ok: false, error: 'محاولات كثيرة من هذا الجهاز — جرّب لاحقاً' };
  }

  // Rate limit on the username — PRD §4.5: 5 attempts / 15 min.
  const limit = await checkRate(
    `login:${username.toLowerCase()}`,
    LIMIT_LOGIN_PER_USERNAME.max,
    LIMIT_LOGIN_PER_USERNAME.windowSeconds,
  );
  if (!limit.allowed) {
    const min = Math.ceil(limit.retryAfterSeconds / 60);
    return { ok: false, error: `محاولات كثيرة — جرّب بعد ${min} دقيقة` };
  }

  const sb = getServiceClient();
  const { data: tenant } = await sb
    .from('restaurants')
    .select('id, password_hash, is_active, deleted_at')
    .eq('username', username)
    .maybeSingle();

  // Always run bcrypt even on no-match so timing doesn't leak account existence.
  const ok = tenant
    ? await verifyPassword(password, tenant.password_hash)
    : await verifyPassword(password, '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');

  if (!tenant || !ok) {
    return { ok: false, error: 'بيانات الدخول غير صحيحة' };
  }
  // A soft-deleted account behaves like a non-existent one — no login.
  if (tenant.deleted_at) {
    return { ok: false, error: 'بيانات الدخول غير صحيحة' };
  }
  if (!tenant.is_active) {
    return { ok: false, error: 'هذا الحساب معطّل — راجع المالك' };
  }

  // Success — bind session.
  const ua = reqHeaders.get('user-agent') ?? undefined;
  const token = await createSession(tenant.id, ua);
  await setSessionCookie(token);
  await sb.from('restaurants').update({ last_login_at: new Date().toISOString() }).eq('id', tenant.id);
  await clearRate(`login:${username.toLowerCase()}`);

  redirect('/admin/dashboard');
}

export async function signOutTenant(): Promise<void> {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  await clearSessionCookie();
  redirect('/admin');
}
