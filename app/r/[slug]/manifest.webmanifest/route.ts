import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';

// Per-restaurant manifest so the installed PWA opens straight into THIS
// diner menu and uses the restaurant's brand colour. The icon is a generic
// placeholder for now (PRD §4.7 — design comes later).

export const dynamic = 'force-dynamic';

const HEX = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_THEME = '#16a34a';
const DEFAULT_BG = '#ffffff';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const sb = getServiceClient();
  const { data } = await sb
    .from('restaurants')
    .select('slug, display_name, primary_color, background_color, is_active')
    .eq('slug', slug)
    .maybeSingle<{
      slug: string;
      display_name: string;
      primary_color: string | null;
      background_color: string | null;
      is_active: boolean;
    }>();

  const themeColor = data && HEX.test(data.primary_color ?? '') ? data.primary_color! : DEFAULT_THEME;
  const bgColor = data && HEX.test(data.background_color ?? '') ? data.background_color! : DEFAULT_BG;
  const name = data?.display_name?.slice(0, 80) ?? 'Mesa OS Lite';

  const manifest = {
    name: `${name} — Mesa OS Lite`,
    short_name: 'Mesa OS',
    description: 'منيو رقمي للمطعم — Mesa OS Lite',
    start_url: `/r/${slug}`,
    scope: `/r/${slug}`,
    display: 'standalone',
    orientation: 'portrait',
    theme_color: themeColor,
    background_color: bgColor,
    lang: 'ar',
    dir: 'rtl',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}
