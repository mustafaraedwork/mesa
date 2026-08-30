// Postgres-backed sliding-window rate limiter (migration 0015).
//
// This used to be a module-level Map. That worked on a single always-on VPS
// process and is worthless on Vercel: every cold start begins with an empty
// window, so an attacker spreading attempts across instances is never
// throttled. The window now lives in the `login_attempts` table, shared by
// every instance.
//
// check-and-record happens inside one plpgsql function so concurrent requests
// cannot race past the limit between a read and a write. Expired rows are
// pruned lazily inside that same call — this project has no cron.

import { getServiceClient } from '@/lib/supabase/server';

export type RateResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

// Limits are unchanged from the in-memory implementation (PRD §4.5 + H-4).
export const LIMIT_LOGIN_PER_USERNAME = { max: 5, windowSeconds: 15 * 60 } as const;
export const LIMIT_LOGIN_PER_IP = { max: 20, windowSeconds: 15 * 60 } as const;
export const LIMIT_TRACK_PER_IP = { max: 60, windowSeconds: 60 } as const;

// Fails CLOSED. A rate limiter that opens up whenever the database hiccups is
// not a rate limiter. Both call sites tolerate this well: login cannot proceed
// without the database anyway, and /api/track already drops beacons silently.
export async function checkRate(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<RateResult> {
  const sb = getServiceClient();
  const { data, error } = await sb.rpc('check_rate_limit', {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.error('[rate-limit] check_rate_limit failed:', error.message);
    return { allowed: false, retryAfterSeconds: 60 };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.allowed !== true) {
    const retry = Number(row?.retry_after_seconds);
    return {
      allowed: false,
      retryAfterSeconds: Number.isFinite(retry) && retry > 0 ? retry : 60,
    };
  }
  return { allowed: true };
}

// On a successful login, reset the bucket — honest users who finally typed the
// right password shouldn't be punished for prior typos.
export async function clearRate(key: string): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb.rpc('clear_rate_limit', { p_key: key });
  if (error) console.error('[rate-limit] clear_rate_limit failed:', error.message);
}

// Derive the client IP from proxy headers.
//
// ORDER MATTERS FOR SECURITY. Only headers the hosting platform sets itself
// are trustworthy; anything a client can send and the platform forwards
// verbatim is an unlimited rate-limit bypass (send a fresh fake IP per
// request, get a fresh bucket every time).
//
// On Vercel — the deployment target for menu.biziii.io — `x-vercel-forwarded-for`
// is written by Vercel's edge, so it is checked first. `x-real-ip` and the
// first hop of `x-forwarded-for` follow as fallbacks for other hosts and for
// bare local dev.
//
// `cf-connecting-ip` was checked FIRST here while the plan was Coolify behind
// Cloudflare. It is now last: on Vercel without Cloudflare in the path nothing
// strips a client-supplied CF-Connecting-IP, which turned the primary source
// of truth into the easiest header to forge.
//
// ⚠️ If Cloudflare is ever put in front of Vercel for this domain, revisit
// this: every request would then carry Cloudflare's edge IP in the Vercel
// headers, collapsing all diners into a handful of buckets and making the
// /api/track limit fire against legitimate traffic. In that setup
// `cf-connecting-ip` must move back to the front.
//
// Accepts both a WHATWG Headers (route handlers) and Next's ReadonlyHeaders
// (server actions) — both expose `.get()`.
export function clientIp(h: { get(name: string): string | null }): string {
  const raw =
    h.get('x-vercel-forwarded-for')?.split(',')[0] ??
    h.get('x-real-ip') ??
    h.get('x-forwarded-for')?.split(',')[0] ??
    h.get('cf-connecting-ip') ??
    'unknown';
  return raw.trim();
}
