// In-memory sliding-window rate limiter. PRD §4.5 calls for 5 attempts per
// 15 minutes on tenant login. The window resets on process restart, which
// is a feature for an MVP single-process VPS deploy: it's generous to honest
// users and harmless against attackers since they'd need to maintain a
// connection across the restart.
//
// If we ever scale to multiple instances, replace this with a Postgres-backed
// implementation (key → array<timestamp>) keyed on the same window.

type Window = { hits: number[] };
const buckets = new Map<string, Window>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_HITS = 5;

export function checkLoginAttempt(key: string):
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number } {
  const now = Date.now();
  const win = buckets.get(key) ?? { hits: [] };

  // Drop hits older than the window.
  win.hits = win.hits.filter((t) => now - t < WINDOW_MS);

  if (win.hits.length >= MAX_HITS) {
    const oldest = win.hits[0];
    const retryAfterSeconds = Math.ceil((WINDOW_MS - (now - oldest)) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  win.hits.push(now);
  buckets.set(key, win);
  return { allowed: true };
}

// On a successful login, reset the bucket for the key — honest users who
// finally typed the right password shouldn't be punished for prior typos.
export function clearLoginAttempts(key: string): void {
  buckets.delete(key);
}

// Derive the client IP from proxy headers, Cloudflare-first. Behind Cloudflare
// the socket peer is ALWAYS a Cloudflare edge address, so the genuine client IP
// lives in CF-Connecting-IP; the X-Forwarded-For first hop and X-Real-IP are
// fallbacks for other proxies / bare local dev. We never read the socket
// address here — behind the proxy it would bucket every diner under one CF IP.
// Accepts both a WHATWG Headers (route handlers) and Next's ReadonlyHeaders
// (server actions) — both expose `.get()`.
export function clientIp(h: { get(name: string): string | null }): string {
  return (
    h.get('cf-connecting-ip') ??
    h.get('x-forwarded-for')?.split(',')[0] ??
    h.get('x-real-ip') ??
    'unknown'
  ).trim();
}

// Generic IP-based limiter for unauthenticated endpoints (H-4: a per-IP login
// guard across all usernames, and a /api/track flood guard). Same in-memory,
// restart-resetting trade-off as the per-username login bucket above. Returns
// true when the request is allowed.
const ipBuckets = new Map<string, number[]>();

export function checkIpRate(key: string, maxHits: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (ipBuckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= maxHits) {
    ipBuckets.set(key, hits);
    return false;
  }
  hits.push(now);
  ipBuckets.set(key, hits);
  return true;
}
