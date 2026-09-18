// Meta Conversions API — server only (reads META_CAPI_ACCESS_TOKEN). Never
// import from a client component. The browser pixel (lib/meta-track.ts) sends
// the same event with the same eventId so Meta deduplicates the pair.

import { createHash } from 'crypto';

export type MetaEventInput = {
  eventName: string;
  eventId: string;
  eventSourceUrl?: string;
  userAgent?: string | null;
  clientIp?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  email?: string | null;
  phone?: string | null;
  externalId?: string | null;
  customData?: Record<string, unknown>;
  testEventCode?: string;
};

const DEFAULT_GRAPH_VERSION = 'v23.0';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizeEmail(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return v ? v : null;
}

// Iraqi numbers: digits only; "00964…" → "964…"; a local "07…" → "9647…".
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = '964' + digits.slice(1);
  return digits ? digits : null;
}

export async function sendMetaEvent(input: MetaEventInput): Promise<void> {
  const pixelId = process.env.META_PIXEL_ID?.trim();
  const token = process.env.META_CAPI_ACCESS_TOKEN?.trim();
  if (!pixelId || !token) {
    console.warn('[meta-capi] META_PIXEL_ID / META_CAPI_ACCESS_TOKEN not set — event dropped');
    return;
  }
  const version = process.env.META_GRAPH_VERSION?.trim() || DEFAULT_GRAPH_VERSION;

  const userData: Record<string, unknown> = {};
  if (input.userAgent) userData.client_user_agent = input.userAgent;
  if (input.clientIp) userData.client_ip_address = input.clientIp;
  if (input.fbp) userData.fbp = input.fbp;
  if (input.fbc) userData.fbc = input.fbc;
  const email = input.email ? normalizeEmail(input.email) : null;
  if (email) userData.em = [sha256(email)];
  const phone = input.phone ? normalizePhone(input.phone) : null;
  if (phone) userData.ph = [sha256(phone)];
  const externalId = input.externalId?.trim().toLowerCase();
  if (externalId) userData.external_id = [sha256(externalId)];

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: input.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: input.eventId,
        event_source_url: input.eventSourceUrl,
        action_source: 'website',
        user_data: userData,
        custom_data: input.customData ?? {},
      },
    ],
  };
  if (input.testEventCode) body.test_event_code = input.testEventCode;

  const url = `https://graph.facebook.com/${version}/${pixelId}/events?access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error('[meta-capi] events request failed:', res.status, await res.text());
  }
}
