import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';

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
  const kind = body.kind as Kind;
  const productId = typeof body.product_id === 'string' ? body.product_id : null;

  if (!slug || !KINDS.includes(kind)) {
    return new NextResponse(null, { status: 204, headers: NO_STORE });
  }

  const sb = getServiceClient();

  const { data: rest } = await sb
    .from('restaurants')
    .select('id')
    .eq('slug', slug)
    .eq('is_active', true)
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
