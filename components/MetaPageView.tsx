'use client';

import { useEffect, useRef } from 'react';
import { trackMeta } from '@/lib/meta-track';

// Fires PageView once per page load through both the pixel and the
// Conversions API (same eventId). The pixel loader is a next/script with
// strategy="afterInteractive", which can land after this effect, so wait
// briefly for window.fbq before firing — and fire anyway after the deadline so
// the server-side copy is never lost.
const POLL_MS = 50;
const MAX_WAIT_MS = 3000;

export function MetaPageView() {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (window.fbq || Date.now() - started > MAX_WAIT_MS) {
        window.clearInterval(timer);
        if (fired.current) return;
        fired.current = true;
        trackMeta('PageView');
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, []);

  return null;
}
