import { NextResponse } from 'next/server';
import { loadMenu } from '@/lib/menu';

export const dynamic = 'force-dynamic';

// Two audiences, two headers (P0 fix 2 — CAPACITY_REPORT §7.2):
//
// - The BROWSER and the Service Worker must never cache this body:
//   `Cache-Control: no-store`. Without it a stale payload survives mode
//   changes on the device and silently breaks the polling contract (Q9).
//
// - Vercel's CDN MAY hold it for a few seconds so the 30 s polls of every
//   diner in a restaurant collapse into one origin render per region instead
//   of one function invocation + 4 SQL statements each. `Vercel-CDN-Cache-
//   Control` is consumed only by Vercel's cache, has top priority over
//   `Cache-Control`, and is stripped before the response reaches the client
//   (https://vercel.com/docs/caching/cache-control-headers — "Behavior").
//
// Freshness contract: POLL_MS = 30 s on the client, CDN fresh 10 s, then
// stale-while-revalidate 15 s (a stale hit triggers a background origin
// render). 10 + 15 = 25 s < 30 s, so a poll that got a pre-change body can
// never be followed 30 s later by another pre-change body: worst-case
// staleness for a connected diner is 30 s + 10 s = 40 s, enforced by
// scripts/smoke-polling-contract.mjs. Off Vercel (local `next start`) the
// header is inert and behaviour is unchanged.
const CDN_MAX_AGE_S = 10;
const CDN_SWR_S = 15;

const OK_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
  'Vercel-CDN-Cache-Control': `public, s-maxage=${CDN_MAX_AGE_S}, stale-while-revalidate=${CDN_SWR_S}`,
} as const;

// Errors (unknown slug, deactivated, suspended) are never cached anywhere —
// a restaurant reactivated by the owner must come back on the next poll.
const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
  'Vercel-CDN-Cache-Control': 'no-store',
} as const;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const data = await loadMenu(slug);
  if (!data) {
    return NextResponse.json(
      { error: 'هذا المنيو غير متوفر حالياً' },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }
  return NextResponse.json(data, { headers: OK_HEADERS });
}
