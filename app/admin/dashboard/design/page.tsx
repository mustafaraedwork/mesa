import { requireTenant } from '@/lib/auth/require-tenant';
import { getServiceClient } from '@/lib/supabase/server';
import { DesignView } from './design-view';

export const dynamic = 'force-dynamic';

type Restaurant = {
  id: string;
  slug: string;
  display_name: string;
  logo_url: string | null;
  primary_color: string;
  background_color: string;
  currency: string;
};

export default async function DesignPage() {
  const tenant = await requireTenant();
  const sb = getServiceClient();

  const { data: rest } = await sb
    .from('restaurants')
    .select('id, slug, display_name, logo_url, primary_color, background_color, currency')
    .eq('id', tenant.restaurantId)
    .single<Restaurant>();

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const menuUrl = `${appUrl}/r/${rest!.slug}`;

  return (
    <DesignView
      initial={{
        display_name: rest!.display_name,
        logo_url: rest!.logo_url,
        primary_color: rest!.primary_color,
        background_color: rest!.background_color,
        currency: rest!.currency,
      }}
      slug={rest!.slug}
      menuUrl={menuUrl}
    />
  );
}
