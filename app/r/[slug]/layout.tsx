import { cache } from 'react';
import type { Metadata, Viewport } from 'next';
import { getServiceClient } from '@/lib/supabase/server';
import { SwRegister } from './sw-register';

// Diner-only layout (Phase 7). Wires the per-restaurant PWA manifest, the
// theme-color meta from the restaurant's primary brand colour, and the
// service-worker registration. Lives under /r/[slug] so admin/owner pages
// inherit none of it.

export const dynamic = 'force-dynamic';

const HEX = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_THEME = '#16a34a';

const loadThemeColor = cache(async (slug: string): Promise<string> => {
  const sb = getServiceClient();
  const { data } = await sb
    .from('restaurants')
    .select('primary_color')
    .eq('slug', slug)
    .maybeSingle<{ primary_color: string | null }>();
  const color = data?.primary_color;
  return color && HEX.test(color) ? color : DEFAULT_THEME;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return {
    manifest: `/r/${slug}/manifest.webmanifest`,
    icons: {
      icon: [
        { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
      apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: 'Mesa OS',
    },
  };
}

export async function generateViewport({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Viewport> {
  const { slug } = await params;
  const themeColor = await loadThemeColor(slug);
  return { themeColor };
}

export default function DinerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SwRegister />
    </>
  );
}
