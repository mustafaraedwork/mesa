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
  header_color: string | null;
  card_color: string | null;
  text_color: string | null;
  currency: string;
  show_unavailable_items: boolean;
};

export default async function DesignPage() {
  const tenant = await requireTenant();
  const sb = getServiceClient();

  const { data: rest } = await sb
    .from('restaurants')
    .select('id, slug, display_name, logo_url, primary_color, background_color, header_color, card_color, text_color, currency, show_unavailable_items')
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
        // NULL → defaults matching the pre-customization look.
        header_color: rest!.header_color ?? rest!.background_color,
        card_color: rest!.card_color ?? '#ffffff',
        text_color: rest!.text_color ?? '#1a1a1a',
        currency: rest!.currency,
        show_unavailable_items: rest!.show_unavailable_items ?? true,
      }}
      slug={rest!.slug}
      menuUrl={menuUrl}
    />
  );
}
