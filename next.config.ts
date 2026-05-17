import type { NextConfig } from 'next';

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
    ];
  },
};

export default nextConfig;
