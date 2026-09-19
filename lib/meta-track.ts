// Client-side Meta tracking: one eventId shared by the browser pixel and the
// Conversions API call so Meta deduplicates them (lib/meta-capi.ts). Every
// event also carries the first-party visitor id (biz_uid cookie → external_id)
// and the fbclid captured from the landing URL.

import { BIZ_UID_COOKIE, BIZ_UID_MAX_AGE, cookieDomainFor, isBizUid } from './biz-uid';

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export const META_PIXEL_ID = '3806419522830990';
const FBCLID_KEY = 'biz_fbclid';

export type MetaTrackOptions = {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  externalId?: string;
  customData?: Record<string, unknown>;
};

export type AdvancedMatching = {
  ph?: string;
  em?: string;
  fn?: string;
  ln?: string;
  external_id?: string;
};

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function readCookie(name: string): string | undefined {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : undefined;
}

// Same cookie the server sets in /api/meta/events — whichever side runs first
// mints it, the other reads it.
export function getOrCreateBizUid(): string {
  const existing = readCookie(BIZ_UID_COOKIE);
  if (isBizUid(existing)) return existing;
  const id = uuid();
  const domain = cookieDomainFor(window.location.hostname);
  document.cookie =
    `${BIZ_UID_COOKIE}=${id}; Max-Age=${BIZ_UID_MAX_AGE}; Path=/; SameSite=Lax` +
    (domain ? `; Domain=${domain}` : '') +
    (window.location.protocol === 'https:' ? '; Secure' : '');
  return id;
}

// fbclid from the URL, remembered for the session so later events (after an
// in-page navigation or a stripped URL) can still rebuild fbc.
export function getFbclid(): string | undefined {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('fbclid');
    if (fromUrl) {
      sessionStorage.setItem(FBCLID_KEY, fromUrl);
      return fromUrl;
    }
    return sessionStorage.getItem(FBCLID_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

// Re-init the pixel with advanced-matching values; the pixel hashes them
// itself. Called after a lead is captured.
export function setMetaAdvancedMatching(data: AdvancedMatching): void {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) if (typeof v === 'string' && v.trim()) clean[k] = v.trim();
  try {
    window.fbq?.('init', META_PIXEL_ID, clean);
  } catch {
    // best-effort
  }
}

export function trackMeta(eventName: string, options: MetaTrackOptions = {}): string {
  const eventId = uuid();
  const { email, phone, firstName, lastName, customData } = options;
  const externalId = options.externalId ?? getOrCreateBizUid();
  const fbclid = getFbclid();

  try {
    window.fbq?.('track', eventName, customData ?? {}, { eventID: eventId });
  } catch {
    // the pixel is best-effort
  }

  try {
    void fetch('/api/meta/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        eventName,
        eventId,
        sourceUrl: window.location.href,
        email,
        phone,
        firstName,
        lastName,
        externalId,
        fbclid,
        customData,
      }),
    }).catch(() => {});
  } catch {
    // never let analytics break the page
  }

  return eventId;
}
