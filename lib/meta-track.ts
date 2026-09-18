// Client-side Meta tracking: one eventId shared by the browser pixel and the
// Conversions API call so Meta deduplicates them (lib/meta-capi.ts).

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export type MetaTrackOptions = {
  email?: string;
  phone?: string;
  externalId?: string;
  customData?: Record<string, unknown>;
};

function newEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function trackMeta(eventName: string, options: MetaTrackOptions = {}): string {
  const eventId = newEventId();
  const { email, phone, externalId, customData } = options;

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
        externalId,
        customData,
      }),
    }).catch(() => {});
  } catch {
    // never let analytics break the page
  }

  return eventId;
}
