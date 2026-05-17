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

// Resolve the current request's restaurant_id from the session cookie.
// Returns null if no cookie or no matching session row.
export async function getRestaurantIdFromCookie(): Promise<string | null> {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('tenant_sessions')
    .select('restaurant_id')
    .eq('token', token)
    .maybeSingle();
  if (error || !data) return null;
  return data.restaurant_id as string;
}

export async function deleteSession(token: string): Promise<void> {
  const supabase = getServiceClient();
  await supabase.from('tenant_sessions').delete().eq('token', token);
}
