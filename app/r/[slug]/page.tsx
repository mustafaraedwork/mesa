import { loadMenu } from '@/lib/menu';
import { MenuView } from './menu-view';
import { ClosedScreen } from './closed-screen';

export const dynamic = 'force-dynamic';

export default async function DinerMenuPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await loadMenu(slug);
  if (!data) return <ClosedScreen />;
  return <MenuView slug={slug} initialData={data} />;
}
