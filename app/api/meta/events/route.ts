import { randomUUID } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { sendMetaEvent } from '@/lib/meta-capi';
import { BIZ_UID_COOKIE, BIZ_UID_MAX_AGE, cookieDomainFor, isBizUid } from '@/lib/biz-uid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

type Body = {
  eventName?: unknown;
  eventId?: unknown;
  sourceUrl?: unknown;
  email?: unknown;
  phone?: unknown;
  externalId?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  fbclid?: unknown;
  customData?: unknown;
};

const str = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;

// Server half of the Meta pixel: the browser fires fbq() with an eventID and
// posts the same id here so Conversions API can send a deduplicated copy with
// the IP, user agent, geo and _fbp/_fbc cookies Meta needs for matching.
export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400, headers: NO_STORE });
  }

  const eventName = str(body.eventName, 64);
  const eventId = str(body.eventId, 128);
  if (!eventName || !eventId) {
    return NextResponse.json(
      { ok: false, error: 'eventName and eventId are required' },
      { status: 400, headers: NO_STORE },
    );
  }

  const forwarded = req.headers.get('x-forwarded-for');
  const clientIp = forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;

  // fbc: the cookie when the pixel set it; otherwise rebuilt from the fbclid
  // the browser captured from the landing URL (Meta's documented format).
  const fbclid = str(body.fbclid, 512);
  const fbc = req.cookies.get('_fbc')?.value ?? (fbclid ? `fb.1.${Date.now()}.${fbclid}` : null);

  // biz_uid: first-party external_id. Prefer the cookie, then the value the
  // browser sent, else mint one and set it for the next request.
  const cookieUid = req.cookies.get(BIZ_UID_COOKIE)?.value;
  const bodyUid = str(body.externalId, 64);
  const uid = isBizUid(cookieUid) ? cookieUid : isBizUid(bodyUid) ? bodyUid : randomUUID();

  const res = NextResponse.json({ ok: true }, { headers: NO_STORE });
  if (cookieUid !== uid) {
    res.cookies.set(BIZ_UID_COOKIE, uid, {
      httpOnly: false,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: BIZ_UID_MAX_AGE,
      domain: cookieDomainFor(req.headers.get('host')),
    });
  }

  try {
    await sendMetaEvent({
      eventName,
      eventId,
      eventSourceUrl: str(body.sourceUrl, 2048),
      userAgent: req.headers.get('user-agent'),
      clientIp,
      fbp: req.cookies.get('_fbp')?.value ?? null,
      fbc,
      email: str(body.email, 320) ?? null,
      phone: str(body.phone, 32) ?? null,
      externalId: uid,
      firstName: str(body.firstName, 120) ?? null,
      lastName: str(body.lastName, 120) ?? null,
      country: req.headers.get('x-vercel-ip-country'),
      city: req.headers.get('x-vercel-ip-city'),
      customData:
        body.customData && typeof body.customData === 'object' && !Array.isArray(body.customData)
          ? (body.customData as Record<string, unknown>)
          : undefined,
      testEventCode: process.env.META_TEST_EVENT_CODE || undefined,
    });
    return res;
  } catch (err) {
    console.error('[meta-capi] route failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false }, { status: 500, headers: NO_STORE });
  }
}
