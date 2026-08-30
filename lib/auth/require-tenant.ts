import { redirect } from 'next/navigation';
import { getRestaurantIdFromCookie } from '@/lib/auth/session';
import { getServiceClient } from '@/lib/supabase/server';
import { deriveSubscription, type SubscriptionState } from '@/lib/subscription';

export type TenantContext = {
  restaurantId: string;
  displayName: string;
  isActive: boolean;
  currency: string;
  subscription: SubscriptionState;
};

// For Server Components / Server Actions inside `/admin/dashboard/*`. The
// proxy already gates on cookie presence; this resolves the cookie to a real
// restaurant row. Redirects to /admin if the cookie is missing or invalid.
//
// This is also the subscription choke point for the whole tenant panel: every
// dashboard page and every tenant server action goes through it, so a lapsed
// restaurant cannot reach any of them — including by calling a server action
// directly, which route-level gating alone would not stop.
export async function requireTenant(): Promise<TenantContext> {
  const restaurantId = await getRestaurantIdFromCookie();
  if (!restaurantId) redirect('/admin');

  const sb = getServiceClient();
  const { data, error } = await sb
    .from('restaurants')
    .select('id, display_name, is_active, currency, deleted_at, subscription_ends_at')
    .eq('id', restaurantId)
    .maybeSingle();

  // A soft-deleted restaurant locks its tenant out, even with a live session.
  if (error || !data || data.deleted_at) redirect('/admin');

  const subscription = deriveSubscription(data.subscription_ends_at, Date.now());

  // Past the grace window → an explaining page, not a generic error and not a
  // silent bounce to the login screen (which would read as "wrong password").
  // /admin/suspended sits outside /admin/dashboard so it does not re-enter
  // this function and loop.
  if (subscription.isBlocked) redirect('/admin/suspended');

  return {
    restaurantId: data.id,
    displayName: data.display_name,
    isActive: data.is_active ?? false,
    currency: data.currency ?? 'IQD',
    subscription,
  };
}
