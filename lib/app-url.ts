// Single source of truth for the canonical public URL.
//
// `NEXT_PUBLIC_APP_URL` is a NEXT_PUBLIC_* variable, so Next inlines it at
// BUILD time. Setting it after a deploy has no effect on the bundle already
// built — it must be present in Vercel's environment BEFORE the first build.
//
// Both call sites here feed QR codes. Until 2026-08-25 they each did:
//
//   const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000')…
//
// which meant a forgotten build-time variable produced QR codes pointing at
// `localhost:3000`, silently, with no warning anywhere in the UI — printed,
// laminated, and glued to tables. Printed QR codes cannot be recalled.
//
// So: the localhost fallback survives in development, where it is convenient
// and harmless, and is REFUSED in production, where it is catastrophic.

const DEV_FALLBACK = 'http://localhost:3000';

// Returns the canonical origin with no trailing slash, or null when it is
// unset in production. A null return is a configuration fault, not a user
// error — callers must surface it, never paper over it.
export function getAppUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (raw) return raw.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production') return null;
  return DEV_FALLBACK;
}

// The public menu URL a QR code encodes. null propagates the same fault.
export function getMenuUrl(slug: string): string | null {
  const base = getAppUrl();
  return base ? `${base}/r/${slug}` : null;
}

// Shown to the restaurant owner, who cannot fix this themselves — it is a
// platform deployment setting. The wording points them at the one person who
// can.
export const APP_URL_MISSING_MESSAGE =
  'إعداد الدومين ناقص — راجع المالك';
