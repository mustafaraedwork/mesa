// Edge-safe constants — no Node-only imports. Imported by both `proxy.ts`
// (Edge runtime) and `lib/auth/session.ts` (Node runtime).

export const SESSION_COOKIE = 'mesa-tenant-token';
