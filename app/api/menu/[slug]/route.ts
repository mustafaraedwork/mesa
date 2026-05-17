import { NextResponse } from 'next/server';
import { loadMenu } from '@/lib/menu';

export const dynamic = 'force-dynamic';

// `force-dynamic` defeats Next.js's data cache but does NOT set response
// cache headers. Without `Cache-Control: no-store` a browser, Service Worker
// (Phase 7), or reverse proxy can keep serving a stale payload across mode
// changes — which silently breaks the 30s polling contract (Q9) since the
// server is reached but the client receives a cached body.
const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
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
  return NextResponse.json(data, { headers: NO_STORE_HEADERS });
}
