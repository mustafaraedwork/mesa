'use client';

import { useEffect } from 'react';

// Registers the diner-only service worker. Mounted exclusively from the
// /r/[slug] layout — admin and owner surfaces never see this component, so
// they never become controlled by the SW (PRD §4.7).
export function SwRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // Browsers refuse to register service workers on insecure origins
    // except localhost — skip silently in dev over plain http.
    const isSecure =
      window.location.protocol === 'https:' || window.location.hostname === 'localhost';
    if (!isSecure) return;

    let cancelled = false;
    navigator.serviceWorker
      .register('/sw.js', { scope: '/r/' })
      .then(async () => {
        // Wait for the SW to be active (fully activated, including the
        // activate handler's waitUntil chain). Then ask it to cache the
        // current page — redundant on first install (activate primes it
        // already) but covers later updates where activate runs without
        // any /r/* clients open.
        await navigator.serviceWorker.ready;
        if (cancelled) return;
        const ctrl = navigator.serviceWorker.controller;
        if (ctrl) {
          ctrl.postMessage({ type: 'CACHE_PAGE', url: window.location.href });
        }
      })
      .catch((err) => {
        // Registration is best-effort; PWA features just won't activate.
        // Log so failures show up in DevTools without breaking the page.
        console.warn('[mesa] service worker registration failed', err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
