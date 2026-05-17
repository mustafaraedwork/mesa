import { NextResponse } from 'next/server';
import { getRestaurantIdFromCookie } from '@/lib/auth/session';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// See note in `app/api/menu/[slug]/route.ts` — `force-dynamic` doesn't set
// HTTP cache headers; without these the 10s polling contract (Q10) can be
// silently violated by a browser cache.
const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  Pragma: 'no-cache',
} as const;

// Tenant dashboard polls this every 10s (Q10) for cross-device drift handling.
// Small payload + lazy revert (Q3) so an expired Closing self-cleans whenever
// either a diner or the tenant looks.
//
// Returns 401 (not a redirect) when unauthenticated — clients are AJAX, not
// browsers; HTML redirects break their JSON parsing.
export async function GET() {
  const restaurantId = await getRestaurantIdFromCookie();
  if (!restaurantId) {
    return NextResponse.json(
      { error: 'unauthenticated' },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const sb = getServiceClient();
  const { data: rest } = await sb
    .from('restaurants')
    .select('active_mode, closing_mode_ends_at, closing_mode_discount')
    .eq('id', restaurantId)
    .maybeSingle();

  if (!rest) {
    return NextResponse.json(
      { error: 'restaurant not found' },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  let { active_mode, closing_mode_ends_at, closing_mode_discount } = rest;

  if (
    active_mode === 'closing' &&
    closing_mode_ends_at &&
    new Date(closing_mode_ends_at).getTime() < Date.now()
  ) {
    await sb
      .from('restaurants')
      .update({ active_mode: 'normal', closing_mode_ends_at: null, closing_mode_discount: null })
      .eq('id', restaurantId)
      .eq('active_mode', 'closing');
    await sb
      .from('products')
      .update({ is_in_closing_mode: false })
      .eq('restaurant_id', restaurantId)
      .eq('is_in_closing_mode', true);
    active_mode = 'normal';
    closing_mode_ends_at = null;
    closing_mode_discount = null;
  }

  return NextResponse.json(
    {
      server_now: new Date().toISOString(),
      active_mode,
      closing_mode_ends_at,
      closing_mode_discount,
    },
    { headers: NO_STORE_HEADERS },
  );
}
