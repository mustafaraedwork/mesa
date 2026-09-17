import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { checkRate, clientIp, LIMIT_TRACK_PER_SLUG, LIMIT_TRACK_PER_SLUG_IP } from '@/lib/auth/rate-limit';

export const dynamic = 'force-dynamic';

const KINDS = ['menu_open', 'product_open', 'product_add'] as const;
type Kind = (typeof KINDS)[number];

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

// Public, fire-and-forget analytics ingest. The diner is unauthenticated, so
// there is no session here — we resolve the slug to a restaurant ourselves
// and insert one `events` row. Invalid input is swallowed (204) rather than
// erroring, since a beacon has no one to read an error response.
export async function POST(req: Request) {
  let body: { slug?: unknown; kind?: unknown; product_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 204, headers: NO_STORE });
  }

  const slug = typeof body.slug === 'string' ? body.slug : '';
  const kind = typeof body.kind === 'string' ? body.kind : '';
  const productId = typeof body.product_id === 'string' ? body.product_id : null;

  // Cheap shape checks BEFORE any rate-limit write, and a bounded slug so a
  // garbage slug cannot mint unlimited bucket keys.
  if (!slug || slug.length > 64 || !KINDS.includes(kind as Kind)) {
    return new NextResponse(null, { status: 204, headers: NO_STORE });
  }

  // H-4 / P0 fix 6: flood guards on this public, unauthenticated ingest
  // endpoint, Postgres-backed since 0015. Two buckets:
  //   1. slug + IP — one restaurant's diners behind one router (or one CGNAT
  //      egress) get their own generous window instead of sharing a global
  //      per-IP one with every other restaurant on the same carrier;
  //   2. slug alone — a hard ceiling per restaurant against a distributed
  //      flood. Login limits (lib/auth/rate-limit.ts) are untouched.
  const ip = clientIp(req.headers);
  const perSlugIp = await checkRate(
    `track:${slug}:${ip}`,
    LIMIT_TRACK_PER_SLUG_IP.max,
    LIMIT_TRACK_PER_SLUG_IP.windowSeconds,
  );
  if (!perSlugIp.allowed) {
    return new NextResponse(null, { status: 204, headers: NO_STORE });
  }
  const perSlug = await checkRate(
    `track-slug:${slug}`,
    LIMIT_TRACK_PER_SLUG.max,
    LIMIT_TRACK_PER_SLUG.windowSeconds,
  );
  if (!perSlug.allowed) {
    return new NextResponse(null, { status: 204, headers: NO_STORE });
  }

  const sb = getServiceClient();

  // Service role bypasses RLS, so the soft-delete guard is explicit here too —
  // a soft-deleted restaurant (deleted_at set, is_active left intact for restore)
  // must not keep ingesting diner events. Mirrors loadMenu's guard.
  const { data: rest } = await sb
    .from('restaurants')
    .select('id')
    .eq('slug', slug)
    .eq('is_active', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (!rest) return new NextResponse(null, { status: 204, headers: NO_STORE });

  // For product events, only keep product_id if it belongs to this restaurant.
  let product_id: string | null = null;
  if (kind !== 'menu_open' && productId) {
    const { data: prod } = await sb
      .from('products')
      .select('id')
      .eq('id', productId)
      .eq('restaurant_id', rest.id)
      .maybeSingle();
    if (prod) product_id = prod.id;
  }

  await sb.from('events').insert({ restaurant_id: rest.id, kind, product_id });

  return new NextResponse(null, { status: 204, headers: NO_STORE });
}
