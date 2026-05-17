'use client';

import { useMemo, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { CategoryDialog } from './category-dialog';
import { ProductDialog } from './product-dialog';
import { ConfirmDialog } from './confirm-dialog';
import {
  deleteCategory,
  deleteProduct,
  setProductAvailable,
} from './actions';

export type Product = {
  id: string;
  category_id: string;
  name_ar: string;
  name_en: string | null;
  name_ku: string | null;
  price: number;
  profit_percentage: number;
  prep_time_minutes: number;
  image_url: string | null;
  is_available: boolean | null;
  display_order: number;
  suggestions_type: 'default' | 'custom';
  custom_suggestion_ids: string[] | null;
};

export type CategoryNode = {
  id: string;
  parent_id: string | null;
  name_ar: string;
  name_en: string | null;
  name_ku: string | null;
  display_order: number;
  products: Product[];
  children: CategoryNode[];
};

type Dialog =
  | { kind: 'none' }
  | { kind: 'newRoot' }
  | { kind: 'newSub'; parent: CategoryNode }
  | { kind: 'editCat'; category: CategoryNode }
  | { kind: 'newProduct'; category: CategoryNode }
  | { kind: 'editProduct'; product: Product; category: CategoryNode }
  | { kind: 'deleteCat'; category: CategoryNode }
  | { kind: 'deleteProduct'; product: Product };

export function MenuView({ tree }: { tree: CategoryNode[] }) {
  const [dialog, setDialog] = useState<Dialog>({ kind: 'none' });

  // Flat list of every product — feeds the custom-suggestions multi-select.
  const allProducts = useMemo(() => {
    const out: { id: string; name_ar: string }[] = [];
    for (const cat of tree) {
      for (const p of cat.products) out.push({ id: p.id, name_ar: p.name_ar });
      for (const sub of cat.children) {
        for (const p of sub.products) out.push({ id: p.id, name_ar: p.name_ar });
      }
    }
    return out;
  }, [tree]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">المنيو</h2>
        <Button onClick={() => setDialog({ kind: 'newRoot' })}>
          + سكشن رئيسي
        </Button>
      </div>

      {tree.length === 0 ? (
        <p className="text-muted-foreground bg-card rounded-lg border p-6 text-center text-sm">
          ما في سكاشن بعد. ابدأ بإنشاء &quot;سكشن رئيسي&quot;.
        </p>
      ) : (
        <ul className="space-y-4">
          {tree.map((cat) => (
            <li key={cat.id} className="bg-card rounded-lg border">
              <CategoryHeader
                category={cat}
                onEdit={() => setDialog({ kind: 'editCat', category: cat })}
                onAddSub={() => setDialog({ kind: 'newSub', parent: cat })}
                onAddProduct={() => setDialog({ kind: 'newProduct', category: cat })}
                onDelete={() => setDialog({ kind: 'deleteCat', category: cat })}
              />

              {cat.products.length > 0 && (
                <ul className="divide-y border-t">
                  {cat.products.map((p) => (
                    <ProductRow
                      key={p.id}
                      product={p}
                      onEdit={() => setDialog({ kind: 'editProduct', product: p, category: cat })}
                      onDelete={() => setDialog({ kind: 'deleteProduct', product: p })}
                    />
                  ))}
                </ul>
              )}

              {cat.children.length > 0 && (
                <ul className="space-y-2 border-t bg-muted/30 p-3">
                  {cat.children.map((sub) => (
                    <li key={sub.id} className="bg-card rounded border">
                      <CategoryHeader
                        category={sub}
                        compact
                        onEdit={() => setDialog({ kind: 'editCat', category: sub })}
                        onAddSub={null}
                        onAddProduct={() => setDialog({ kind: 'newProduct', category: sub })}
                        onDelete={() => setDialog({ kind: 'deleteCat', category: sub })}
                      />
                      {sub.products.length > 0 && (
                        <ul className="divide-y border-t">
                          {sub.products.map((p) => (
                            <ProductRow
                              key={p.id}
                              product={p}
                              onEdit={() => setDialog({ kind: 'editProduct', product: p, category: sub })}
                              onDelete={() => setDialog({ kind: 'deleteProduct', product: p })}
                            />
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Dialogs */}
      {dialog.kind === 'newRoot' && (
        <CategoryDialog mode="create" onClose={() => setDialog({ kind: 'none' })} />
      )}
      {dialog.kind === 'newSub' && (
        <CategoryDialog
          mode="create"
          parentId={dialog.parent.id}
          parentName={dialog.parent.name_ar}
          onClose={() => setDialog({ kind: 'none' })}
        />
      )}
      {dialog.kind === 'editCat' && (
        <CategoryDialog
          mode="edit"
          category={dialog.category}
          onClose={() => setDialog({ kind: 'none' })}
        />
      )}
      {dialog.kind === 'newProduct' && (
        <ProductDialog
          mode="create"
          categoryId={dialog.category.id}
          categoryName={dialog.category.name_ar}
          allProducts={allProducts}
          onClose={() => setDialog({ kind: 'none' })}
        />
      )}
      {dialog.kind === 'editProduct' && (
        <ProductDialog
          mode="edit"
          product={dialog.product}
          categoryId={dialog.category.id}
          categoryName={dialog.category.name_ar}
          allProducts={allProducts}
          onClose={() => setDialog({ kind: 'none' })}
        />
      )}
      {dialog.kind === 'deleteCat' && (
        <ConfirmDialog
          title="حذف السكشن"
          description={
            <>
              سيُحذف <b>{dialog.category.name_ar}</b> وكل المنتجات والسكاشن الفرعية تحته،
              مع صورها. لا يمكن التراجع.
            </>
          }
          confirmLabel="حذف"
          destructive
          run={() => deleteCategory(dialog.category.id)}
          onClose={() => setDialog({ kind: 'none' })}
        />
      )}
      {dialog.kind === 'deleteProduct' && (
        <ConfirmDialog
          title="حذف المنتج"
          description={<>سيُحذف <b>{dialog.product.name_ar}</b> مع صورته. لا يمكن التراجع.</>}
          confirmLabel="حذف"
          destructive
          run={() => deleteProduct(dialog.product.id)}
          onClose={() => setDialog({ kind: 'none' })}
        />
      )}
    </div>
  );
}

function CategoryHeader({
  category,
  compact,
  onEdit,
  onAddSub,
  onAddProduct,
  onDelete,
}: {
  category: CategoryNode;
  compact?: boolean;
  onEdit: () => void;
  onAddSub: (() => void) | null;
  onAddProduct: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={
        'flex items-center justify-between gap-2 px-4 ' +
        (compact ? 'py-2' : 'py-3')
      }
    >
      <div className="flex-1">
        <h3 className={compact ? 'text-sm font-medium' : 'text-base font-semibold'}>
          {category.name_ar}
        </h3>
        {(category.name_en || category.name_ku) && (
          <p className="text-muted-foreground text-xs" dir="ltr">
            {[category.name_en, category.name_ku].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="outline" onClick={onAddProduct}>+ منتج</Button>
        {onAddSub && <Button size="sm" variant="outline" onClick={onAddSub}>+ فرعي</Button>}
        <Button size="sm" variant="ghost" onClick={onEdit}>تعديل</Button>
        <Button size="sm" variant="ghost" onClick={onDelete}>حذف</Button>
      </div>
    </div>
  );
}

function ProductRow({
  product,
  onEdit,
  onDelete,
}: {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const available = product.is_available ?? true;
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      {product.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={product.image_url}
          alt=""
          className="h-12 w-12 shrink-0 rounded object-cover"
        />
      ) : (
        <div className="bg-muted h-12 w-12 shrink-0 rounded" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className={'truncate font-medium ' + (available ? '' : 'text-muted-foreground line-through')}>
          {product.name_ar}
        </p>
        <p className="text-muted-foreground text-xs">
          {product.price.toLocaleString('en-US')} · {product.prep_time_minutes}د · ربح {product.profit_percentage}٪
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setProductAvailable(product.id, !available);
            })
          }
        >
          {available ? 'إخفاء' : 'إظهار'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onEdit}>تعديل</Button>
        <Button size="sm" variant="ghost" onClick={onDelete}>حذف</Button>
      </div>
    </li>
  );
}
