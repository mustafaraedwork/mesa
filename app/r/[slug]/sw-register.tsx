'use client';

import { useEffect } from 'react';

// Registers the diner-only service worker. Mounted exclusively from the
// /r/[slug] layout — admin and owner surfaces never see this component, so
// they never become controlled by the SW (PRD §4.7).
//
// In development the SW is deliberately NOT registered: its CacheFirst rule
// on /_next/static/* serves stale JS/CSS after every edit. The dev branch
// also tears down any SW + caches left over from a previous run (or from
// before this change) and reloads once, so a dev browser self-heals.
export function SwRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations().then(async (regs) => {
        let changed = regs.length > 0;
        await Promise.all(regs.map((r) => r.unregister()));
        if ('caches' in window) {
          const keys = await caches.keys();
          if (keys.length > 0) changed = true;
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        // One reload to drop the stale-asset page the old SW just served.
        if (changed && !sessionStorage.getItem('mesa-sw-cleaned')) {
          sessionStorage.setItem('mesa-sw-cleaned', '1');
          window.location.reload();
        }
      });
      return;
    }

    let cancelled = false;
    navigator.serviceWorker
      .register('/sw.js', { scope: '/r/' })
      .then(async () => {
        // Wait for the SW to be active, then ask it to cache the current
        // page — covers updates where `activate` ran with no /r/* clients.
        await navigator.serviceWorker.ready;
        if (cancelled) return;
        const ctrl = navigator.serviceWorker.controller;
        if (ctrl) {
          ctrl.postMessage({ type: 'CACHE_PAGE', url: window.location.href });
        }
      })
      .catch((err) => {
        // Registration is best-effort; PWA features just won't activate.
        console.warn('[mesa] service worker registration failed', err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
