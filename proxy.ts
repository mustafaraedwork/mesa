import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { SESSION_COOKIE } from '@/lib/auth/cookie';

// Combined proxy:
// - /admin/dashboard/*  → tenant area, gated by the `mesa-tenant-token` cookie.
//   Token is NOT validated here (Edge cost trade-off); each API route calls
//   getRestaurantIdFromCookie() and rejects on null.
// - /owner/dashboard/*  → owner area, gated by Supabase Auth + app_metadata.role.
//   We do call getUser() here because the owner panel is low-traffic and we
//   want revoked-session enforcement.
//
// Renamed from `middleware.ts` per Next.js 16
// (https://nextjs.org/docs/messages/middleware-to-proxy).

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/admin/dashboard')) {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return redirectTo(req, '/admin', pathname);
    return NextResponse.next();
  }

  if (pathname.startsWith('/owner/dashboard')) {
    const res = NextResponse.next();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => req.cookies.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) =>
              res.cookies.set({ name, value, ...options }),
            );
          },
        },
      },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.app_metadata?.role !== 'owner') {
      return redirectTo(req, '/owner', pathname);
    }
    return res;
  }

  return NextResponse.next();
}

function redirectTo(req: NextRequest, path: string, next: string) {
  const url = req.nextUrl.clone();
  url.pathname = path;
  url.searchParams.set('next', next);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/admin/dashboard/:path*', '/owner/dashboard/:path*'],
};
