import { loadMenuResult } from '@/lib/menu';
import { MenuView } from './menu-view';
import { ClosedScreen } from './closed-screen';
import { PausedScreen } from './paused-screen';

export const dynamic = 'force-dynamic';

export default async function DinerMenuPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const res = await loadMenuResult(slug);
  // Three outcomes, two screens: a lapsed subscription must not tell the diner
  // the restaurant is closed. See paused-screen.tsx.
  if (!res.ok) return res.reason === 'suspended' ? <PausedScreen /> : <ClosedScreen />;
  return <MenuView slug={slug} initialData={res.data} />;
}
