import type { NextConfig } from 'next';

// M-1: baseline security headers applied to every response. The CSP allows only
// what the app actually needs: 'unsafe-inline' for Tailwind inline styles +
// Next's hydration scripts, https: for R2 product images (img-src) and Supabase
// Auth (connect-src). next/font self-hosts fonts (served from 'self').
// Tightening script/style via per-request nonces is a future hardening step.
// Next.js dev mode (React refresh / source maps) requires eval(); production
// builds do not. Allow 'unsafe-eval' ONLY in development so the dev server works
// while the production CSP stays strict and unchanged. This is a dev-tooling
// concession, not a production security change.
const IS_DEV = process.env.NODE_ENV !== 'production';
const SCRIPT_SRC = IS_DEV
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      SCRIPT_SRC,
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

// Allow next/image to optimize product images served from the Cloudflare R2
// public bucket (and any custom CDN domain set via R2_PUBLIC_URL). The optimizer
// re-serves from same-origin /_next/image, so the existing CSP img-src is fine.
function r2RemotePatterns() {
  const patterns: NonNullable<NextConfig['images']>['remotePatterns'] = [
    { protocol: 'https', hostname: '**.r2.dev' },
    { protocol: 'https', hostname: '**.r2.cloudflarestorage.com' },
  ];
  const pub = process.env.R2_PUBLIC_URL;
  if (pub) {
    try {
      const host = new URL(pub).hostname;
      if (!patterns.some((p) => p.hostname === host)) {
        patterns.push({ protocol: 'https', hostname: host });
      }
    } catch {
      /* ignore malformed R2_PUBLIC_URL */
    }
  }
  return patterns;
}

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Coolify/Docker deploy
  // (./.next/standalone/server.js with only the traced node_modules).
  output: 'standalone',

  images: {
    remotePatterns: r2RemotePatterns(),
    // Diner thumbnails are small; cap device sizes so the optimizer doesn't
    // generate needless 3840px variants for 56–200px slots.
    imageSizes: [48, 64, 96, 128, 200, 256, 384],
  },

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
