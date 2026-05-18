import { redirect } from 'next/navigation';
import { loadMenu } from '@/lib/menu';
import { ClosedScreen } from '../../closed-screen';
import { ProductView } from './product-view';

export const dynamic = 'force-dynamic';

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string; productId: string }>;
}) {
  const { slug, productId } = await params;
  const data = await loadMenu(slug);
  if (!data) return <ClosedScreen />;

  // Find the product in its real category (skip the virtual closing dup).
  let product = null;
  for (const cat of data.categories) {
    if (cat.is_virtual) continue;
    const found = cat.products.find((p) => p.id === productId);
    if (found) {
      product = found;
      break;
    }
  }
  if (!product) redirect(`/r/${slug}`);

  return <ProductView slug={slug} product={product} restaurant={data.restaurant} />;
}
