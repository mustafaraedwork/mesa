import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { getServiceClient } from '@/lib/supabase/server';
import { SESSION_COOKIE } from '@/lib/auth/cookie';

export { SESSION_COOKIE };

// 64-char hex token (32 random bytes). PRD §4.5.
// This value is a live credential: it goes into the httpOnly cookie and is
// NEVER written to the database — only its digest is (migration 0014).
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

// The only thing tenant_sessions ever stores. SHA-256 (no salt, no KDF) is
// correct here: the input is 256 bits of CSPRNG output, so there is no
// guessing attack to slow down, and this runs on every dashboard request.
// Returns 64 lowercase hex chars — matching the CHECK added in 0014.
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export async function createSession(
  restaurantId: string,
  deviceInfo?: string,
): Promise<string> {
  const token = generateToken();
  const supabase = getServiceClient();
  const { error } = await supabase
    .from('tenant_sessions')
    .insert({ restaurant_id: restaurantId, token_hash: hashToken(token), device_info: deviceInfo ?? null });
  if (error) throw error;
  // The caller puts this in the cookie; the DB never sees it.
  return token;
}

export async function setSessionCookie(token: string): Promise<void> {
  const c = await cookies();
  c.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // M-2: 'lax' (not 'strict') is intentional — the installed PWA launches via
    // a top-level navigation, and 'strict' would drop the cookie there, logging
    // the tenant out on every launch. 'lax' is NOT sent on cross-site fetch/XHR,
    // so /api/admin/state can't be invoked cross-site; and its only GET-time
    // mutation (the expired-Closing lazy revert) is an idempotent self-heal with
    // no value to an attacker.
    sameSite: 'lax',
    path: '/',
    // Matches MAX_SESSION_AGE_MS below, so the cookie and the row it points at
    // expire together. Without maxAge this was a BROWSER-SESSION cookie: it
    // vanished when the tenant fully closed their browser, logging them out
    // every time — directly contradicting the "long-lived by design" intent in
    // PRD §4.3 and the year-long row in tenant_sessions.
    maxAge: MAX_SESSION_AGE_SECONDS,
    // NO `domain` — deliberately. A host-only cookie stays scoped to
    // menu.biziii.io. Setting `.biziii.io` here would collide with the
    // separate, unrelated session on feedback.biziii.io and sign the user out
    // of one of them. See docs/COMPANY-CONTEXT.md §4.
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
// Tokens are hashed at rest since 0014 — this cap is a second, independent
// bound on a session that was somehow captured from the wire or the device.
const MAX_SESSION_AGE_SECONDS = 365 * 24 * 60 * 60; // 365 days
const MAX_SESSION_AGE_MS = MAX_SESSION_AGE_SECONDS * 1000;

// Resolve the current request's restaurant_id from the session cookie.
// Returns null if no cookie, no matching session row, or the session is too old.
export async function getRestaurantIdFromCookie(): Promise<string | null> {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  // Look the session up by the DIGEST, never by the token. The raw cookie
  // value is not stored anywhere, so a leaked DB row cannot be replayed.
  const tokenHash = hashToken(token);
  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('tenant_sessions')
    .select('restaurant_id, created_at, token_hash')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error || !data || !data.restaurant_id) return null;

  // The index lookup above already decided the match; this re-checks the
  // returned digest in constant time so the comparison itself cannot become a
  // timing oracle if the query layer is ever changed to a looser filter.
  if (!constantTimeEquals(tokenHash, String(data.token_hash ?? ''))) return null;

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
  const { error } = await supabase
    .from('tenant_sessions')
    .delete()
    .eq('token_hash', hashToken(token));
  if (error) console.error('[session] deleteSession failed:', error.message);
}

// timingSafeEqual throws when the buffers differ in length. Both operands here
// are 64-char hex digests, but `data.token_hash` comes from the database, so
// the length guard keeps this total rather than throwing on malformed data.
function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
