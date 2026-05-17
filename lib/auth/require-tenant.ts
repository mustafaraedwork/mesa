import { redirect } from 'next/navigation';
import { getRestaurantIdFromCookie } from '@/lib/auth/session';
import { getServiceClient } from '@/lib/supabase/server';

export type TenantContext = {
  restaurantId: string;
  displayName: string;
  isActive: boolean;
};

// For Server Components / Server Actions inside `/admin/dashboard/*`. The
// proxy already gates on cookie presence; this resolves the cookie to a real
// restaurant row. Redirects to /admin if the cookie is missing or invalid.
export async function requireTenant(): Promise<TenantContext> {
  const restaurantId = await getRestaurantIdFromCookie();
  if (!restaurantId) redirect('/admin');

  const sb = getServiceClient();
  const { data, error } = await sb
    .from('restaurants')
    .select('id, display_name, is_active')
    .eq('id', restaurantId)
    .maybeSingle();

  if (error || !data) redirect('/admin');

  return {
    restaurantId: data.id,
    displayName: data.display_name,
    isActive: data.is_active ?? false,
  };
}
