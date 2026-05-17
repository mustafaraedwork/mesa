import { loadMenu } from '@/lib/menu';
import { CartView } from './cart-view';
import { ClosedScreen } from '../closed-screen';

export const dynamic = 'force-dynamic';

export default async function CartPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await loadMenu(slug);
  if (!data) return <ClosedScreen />;
  return <CartView slug={slug} initialData={data} />;
}
