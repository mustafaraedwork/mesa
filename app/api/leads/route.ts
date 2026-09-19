import { NextResponse, type NextRequest } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { checkRate, clientIp, LIMIT_LEAD_PER_IP } from '@/lib/auth/rate-limit';
import { normalizePhone } from '@/lib/meta-capi';
import { BIZ_UID_COOKIE, isBizUid } from '@/lib/biz-uid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

const str = (v: unknown, max: number): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

// Landing-page lead capture (migration 0021). Called from the pre-WhatsApp
// modal; the caller opens WhatsApp whatever we answer, so this only needs to be
// honest, not fast.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400, headers: NO_STORE });
  }

  const name = str(body.name, 120);
  const rawPhone = str(body.phone, 32);
  const phone = rawPhone ? normalizePhone(rawPhone) : null;
  if (!name || !phone || phone.length < 5) {
    return NextResponse.json({ ok: false, error: 'name and phone are required' }, { status: 400, headers: NO_STORE });
  }

  const rate = await checkRate(`lead:${clientIp(req.headers)}`, LIMIT_LEAD_PER_IP.max, LIMIT_LEAD_PER_IP.windowSeconds);
  if (!rate.allowed) {
    return NextResponse.json({ ok: false, error: 'rate limited' }, { status: 429, headers: NO_STORE });
  }

  const sb = getServiceClient();
  const since = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
  const { data: recent, error: readErr } = await sb
    .from('landing_leads')
    .select('id')
    .eq('phone', phone)
    .gte('created_at', since)
    .limit(1);
  if (readErr) {
    console.error('[leads] read failed:', readErr.message);
    return NextResponse.json({ ok: false }, { status: 500, headers: NO_STORE });
  }
  if (recent && recent.length > 0) {
    return NextResponse.json({ ok: true, duplicate: true }, { headers: NO_STORE });
  }

  const cookieUid = req.cookies.get(BIZ_UID_COOKIE)?.value;
  const bodyUid = str(body.bizUid, 64);
  const bizUid = isBizUid(cookieUid) ? cookieUid : isBizUid(bodyUid) ? bodyUid : null;

  const { error } = await sb.from('landing_leads').insert({
    name,
    phone,
    source_url: str(body.sourceUrl, 2048),
    fbclid: str(body.fbclid, 512),
    biz_uid: bizUid,
    user_agent: req.headers.get('user-agent')?.slice(0, 512) ?? null,
  });
  if (error) {
    console.error('[leads] insert failed:', error.message);
    return NextResponse.json({ ok: false }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true }, { status: 201, headers: NO_STORE });
}
