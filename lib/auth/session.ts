import { randomBytes } from 'crypto';
import { cookies } from 'next/headers';
import { getServiceClient } from '@/lib/supabase/server';
import { SESSION_COOKIE } from '@/lib/auth/cookie';

export { SESSION_COOKIE };

// 64-char hex token (32 random bytes). PRD §4.5.
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export async function createSession(
  restaurantId: string,
  deviceInfo?: string,
): Promise<string> {
  const token = generateToken();
  const supabase = getServiceClient();
  const { error } = await supabase
    .from('tenant_sessions')
    .insert({ restaurant_id: restaurantId, token, device_info: deviceInfo ?? null });
  if (error) throw error;
  return token;
}

export async function setSessionCookie(token: string): Promise<void> {
  const c = await cookies();
  c.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    // No `expires` — sessions are permanent (PRD §4.3).
  });
}

export async function clearSessionCookie(): Promise<void> {
  const c = await cookies();
  c.delete(SESSION_COOKIE);
}

// H-5: cap session lifetime so a leaked (otherwise permanent) token can't be
// used indefinitely. Generous bound that preserves the PRD's long-lived,
// multi-device intent while still self-expiring. Owner-side revocation also
// exists: changeAccountPassword deletes all of a tenant's sessions.
// Deferred by decision: hashing the token at rest + timingSafeEqual — the
// timing channel is negligible behind HTTPS and hashing would invalidate every
// currently-active session.
const MAX_SESSION_AGE_MS = 365 * 24 * 60 * 60 * 1000; // 365 days

// Resolve the current request's restaurant_id from the session cookie.
// Returns null if no cookie, no matching session row, or the session is too old.
export async function getRestaurantIdFromCookie(): Promise<string | null> {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('tenant_sessions')
    .select('restaurant_id, created_at')
    .eq('token', token)
    .maybeSingle();
  if (error || !data || !data.restaurant_id) return null;

  // H-5: reject and prune sessions older than the max age.
  const createdAt = data.created_at ? new Date(data.created_at).getTime() : null;
  if (
    createdAt === null ||
    Number.isNaN(createdAt) ||
    Date.now() - createdAt > MAX_SESSION_AGE_MS
  ) {
    await deleteSession(token);
    return null;
  }

  return data.restaurant_id as string;
}

export async function deleteSession(token: string): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase.from('tenant_sessions').delete().eq('token', token);
  if (error) console.error('[session] deleteSession failed:', error.message);
}
