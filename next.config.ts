import type { NextConfig } from 'next';

// M-1: baseline security headers applied to every response. The CSP allows only
// what the app actually needs: 'unsafe-inline' for Tailwind inline styles +
// Next's hydration scripts, https: for R2 product images (img-src) and Supabase
// Auth (connect-src). next/font self-hosts fonts (served from 'self').
// Tightening script/style via per-request nonces is a future hardening step.
const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Coolify/Docker deploy
  // (./.next/standalone/server.js with only the traced node_modules).
  output: 'standalone',

  // PWA service worker lives at /sw.js (public/sw.js) but must control only
  // /r/* (diner pages). Without Service-Worker-Allowed the browser caps the
  // SW's scope to the directory of the script (i.e. /), which would let it
  // intercept admin/owner navigations once any diner page registered it.
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Service-Worker-Allowed', value: '/r/' },
          // The SW itself must always be revalidated so updates ship fast.
          { key: 'Cache-Control', value: 'no-cache' },
        ],
      },
      { source: '/:path*', headers: SECURITY_HEADERS },
    ];
  },
};

export default nextConfig;
