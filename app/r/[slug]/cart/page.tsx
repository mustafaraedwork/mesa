import { loadMenuResult } from '@/lib/menu';
import { CartView } from './cart-view';
import { ClosedScreen } from '../closed-screen';
import { PausedScreen } from '../paused-screen';

export const dynamic = 'force-dynamic';

export default async function CartPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const res = await loadMenuResult(slug);
  if (!res.ok) return res.reason === 'suspended' ? <PausedScreen /> : <ClosedScreen />;
  const data = res.data;
  return <CartView slug={slug} initialData={data} />;
}
