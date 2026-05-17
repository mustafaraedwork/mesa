// Cookies-aware Supabase Auth client for Server Components, Server Actions,
// and Route Handlers. Uses the anon key — RLS still applies, but the JWT
// from the cookie identifies the user (and their app_metadata.role).

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function getAuthServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — only Server Actions and Route
            // Handlers can mutate cookies, so silently ignore here.
          }
        },
      },
    },
  );
}
