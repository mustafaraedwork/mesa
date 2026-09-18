import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { checkRate, clientIp, LIMIT_RATE_PER_SLUG_IP } from '@/lib/auth/rate-limit';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

// Public, unauthenticated diner rating ingest (migration 0020). Unlike
// /api/track this is a real form submission with a person waiting, so invalid
// input gets a 400 the sheet can show, not a silent 204.
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400, headers: NO_STORE });
  }

  const slug = typeof body.slug === 'string' ? body.slug : '';
  const scores = {
    staff_score: score(body.staff),
    service_score: score(body.service),
    clean_score: score(body.clean),
    overall_score: score(body.overall),
  };
  if (!slug || slug.length > 64 || Object.values(scores).some((s) => s === null)) {
    return NextResponse.json({ ok: false }, { status: 400, headers: NO_STORE });
  }

  // One person rates once; a table of ten rates ten times. Anything past that
  // from one address in ten minutes is not a diner.
  const ip = clientIp(req.headers);
  const rate = await checkRate(
    `rate:${slug}:${ip}`,
    LIMIT_RATE_PER_SLUG_IP.max,
    LIMIT_RATE_PER_SLUG_IP.windowSeconds,
  );
  if (!rate.allowed) {
    return NextResponse.json({ ok: false }, { status: 429, headers: NO_STORE });
  }

  const sb = getServiceClient();
  // Service role bypasses RLS: the soft-delete / inactive guard is explicit,
  // mirroring loadMenu and /api/track.
  const { data: rest } = await sb
    .from('restaurants')
    .select('id')
    .eq('slug', slug)
    .eq('is_active', true)
    .is('deleted_at', null)
    .maybeSingle();
  if (!rest) return NextResponse.json({ ok: false }, { status: 404, headers: NO_STORE });

  const { error } = await sb.from('ratings').insert({
    restaurant_id: rest.id,
    ...scores,
    name: text(body.name, 80),
    phone: text(body.phone, 32),
    comment: text(body.comment, 1000),
  });
  if (error) {
    console.error('[rate] insert failed:', error.message);
    return NextResponse.json({ ok: false }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true }, { status: 201, headers: NO_STORE });
}

function score(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5 ? v : null;
}

function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}
