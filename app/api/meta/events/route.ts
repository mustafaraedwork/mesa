import { NextResponse, type NextRequest } from 'next/server';
import { sendMetaEvent } from '@/lib/meta-capi';

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
  customData?: unknown;
};

const str = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;

// Server half of the Meta pixel: the browser fires fbq() with an eventID and
// posts the same id here so Conversions API can send a deduplicated copy with
// the IP, user agent and _fbp/_fbc cookies Meta needs for matching.
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

  try {
    await sendMetaEvent({
      eventName,
      eventId,
      eventSourceUrl: str(body.sourceUrl, 2048),
      userAgent: req.headers.get('user-agent'),
      clientIp,
      fbp: req.cookies.get('_fbp')?.value ?? null,
      fbc: req.cookies.get('_fbc')?.value ?? null,
      email: str(body.email, 320) ?? null,
      phone: str(body.phone, 32) ?? null,
      externalId: str(body.externalId, 128) ?? null,
      customData:
        body.customData && typeof body.customData === 'object' && !Array.isArray(body.customData)
          ? (body.customData as Record<string, unknown>)
          : undefined,
      testEventCode: process.env.META_TEST_EVENT_CODE || undefined,
    });
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (err) {
    console.error('[meta-capi] route failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false }, { status: 500, headers: NO_STORE });
  }
}
