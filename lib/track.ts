// Fire-and-forget analytics ping. Uses sendBeacon so it never blocks the
// page (survives navigation/unload); falls back to a keepalive fetch.

export type TrackKind = 'menu_open' | 'product_open' | 'product_add';

export function track(
  kind: TrackKind,
  opts: { slug: string; productId?: string },
): void {
  if (typeof window === 'undefined') return;

  const payload = JSON.stringify({
    slug: opts.slug,
    kind,
    product_id: opts.productId ?? null,
  });

  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track', new Blob([payload], { type: 'application/json' }));
      return;
    }
  } catch {
    // sendBeacon unavailable or threw — fall through to fetch.
  }

  fetch('/api/track', {
    method: 'POST',
    body: payload,
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
  }).catch(() => {});
}
