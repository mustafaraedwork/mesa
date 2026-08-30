// Slugs a restaurant may not claim.
//
// ⚠️ SCOPE — READ THIS BEFORE ASSUMING A BUG:
// Diner menus live at `/r/{slug}`, NOT at the root. Every route in this repo
// that could collide (`/admin`, `/owner`, `/api`, `/`) is a SIBLING of `/r`,
// not of `{slug}`, so a restaurant named "admin" resolves to `/r/admin` and
// shadows nothing. Verified against the app tree on 2026-08-25: the only child
// of `app/r/` is the `[slug]` dynamic segment — there is not one static route
// underneath it.
//
// So this list is DEFENSIVE, not corrective. It exists because:
//   1. `restaurants.slug` is globally unique and permanent-ish once a QR code
//      is printed. Discovering a conflict later is unfixable in the field.
//   2. If a static route is ever added under `/r/` (say `/r/demo`), the
//      dynamic segment loses to it silently and that restaurant's menu simply
//      stops resolving — with printed codes already on tables.
//   3. A URL like menu.biziii.io/r/admin invites confusion and phishing even
//      though it is technically harmless.
//
// The list is derived from what actually exists in the repo, not guessed:
//   • top-level route segments in `app/`      → admin, api, owner, r
//   • child routes under `app/r/[slug]/`      → cart, p, manifest.webmanifest
//   • files served from `public/` at the root → sw, icon, logo, favicon…
// plus infrastructure words that commonly become subdomains or routes later.

const RESERVED_SLUGS = new Set<string>([
  // ── route segments that exist today (app/) ──
  'admin',
  'api',
  'owner',
  'r',

  // ── child segments under /r/[slug]/ — reserved so a menu can never be
  //    named after one of its own sub-pages ──
  'cart',
  'p',
  'manifest',
  'manifest.webmanifest',

  // ── served from public/ at the origin root ──
  'sw',
  'favicon',
  'icon',
  'logo',
  'apple-touch-icon',
  'next',
  'vercel',
  'globe',
  'window',
  'file',

  // ── Next.js / platform internals ──
  '_next',
  '_vercel',
  'static',
  'assets',
  'public',

  // ── company + product namespace (docs/COMPANY-CONTEXT.md §3) ──
  'biziii',
  'menu',
  'feedback',
  'app',
  'www',

  // ── words likely to become real routes ──
  'health',
  'login',
  'logout',
  'signin',
  'signup',
  'register',
  'account',
  'accounts',
  'dashboard',
  'settings',
  'billing',
  'analytics',
  'support',
  'help',
  'about',
  'contact',
  'pricing',
  'terms',
  'privacy',
  'robots',
  'sitemap',
  'null',
  'undefined',
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.trim().toLowerCase());
}

export const RESERVED_SLUG_MESSAGE =
  'هذا الـslug محجوز للنظام — اختر اسماً آخر';
