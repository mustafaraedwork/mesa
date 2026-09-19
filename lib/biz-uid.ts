// First-party visitor id shared by the browser pixel, the Conversions API and
// the landing leads table (Meta external_id). One cookie, `biz_uid`, one year,
// readable by JavaScript on purpose (the pixel init reads it), scoped to the
// parent domain so biziii.io and menu.biziii.io see the same visitor. This is
// NOT a session cookie — the host-only rule in docs/COMPANY-CONTEXT.md §4 is
// about `mesa-tenant-token`, which stays untouched.

export const BIZ_UID_COOKIE = 'biz_uid';
export const BIZ_UID_MAX_AGE = 365 * 24 * 60 * 60;
export const BIZ_UID_DOMAIN = '.biziii.io';

export function cookieDomainFor(host: string | null | undefined): string | undefined {
  const h = (host ?? '').split(':')[0].toLowerCase();
  return h === 'biziii.io' || h.endsWith('.biziii.io') ? BIZ_UID_DOMAIN : undefined;
}

export function isBizUid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
