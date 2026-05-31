import { redirect } from 'next/navigation';
import { getAuthServerClient } from '@/lib/supabase/auth-server';

// Authorization guard for ALL owner-only Server Actions and data loaders.
//
// The proxy (`proxy.ts`) gates /owner/dashboard *navigation*, but Next.js
// Server Actions are dispatchable from ANY route via the `Next-Action` header
// and do NOT pass through the proxy matcher — so the proxy is not a sufficient
// authorization boundary on its own (SECURITY-FINDINGS C-1). Every owner
// action and data loader MUST call this itself as its first statement.
//
// Mirrors `requireTenant()`: redirects to /owner when the caller is not an
// authenticated platform owner. The redirect (a NEXT_REDIRECT throw) is the
// correct outcome for the attack case — an unauthenticated caller never
// reaches the mutation — and is a no-op for a legitimate owner.
export async function requireOwner(): Promise<string> {
  const supabase = await getAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'owner') {
    redirect('/owner');
  }
  return user.id;
}
