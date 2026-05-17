'use client';

import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { CategoryDialog } from './category-dialog';
import { ProductDialog } from './product-dialog';
import { ConfirmDialog } from './confirm-dialog';
import { SortableList } from './sortable-list';
import {
  deleteCategory,
  deleteProduct,
  reorderCategories,
  reorderProducts,
  setProductAvailable,
} from './actions';

type Result = { ok: true } | { ok: false; error: string };

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
  const router = useRouter();
  const [, startReorder] = useTransition();
  const [reorderError, setReorderError] = useState<string | null>(null);

  // Persist a drag-reorder, then refresh so the server order is the truth.
  function reorder(action: () => Promise<Result>) {
    setReorderError(null);
    startReorder(async () => {
      const r = await action();
      if (!r.ok) setReorderError(r.error);
      router.refresh();
    });
  }

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

      {reorderError && (
        <p role="alert" className="text-destructive text-sm">{reorderError}</p>
      )}

      {tree.length === 0 ? (
        <p className="text-muted-foreground bg-card rounded-lg border p-6 text-center text-sm">
          ما في سكاشن بعد. ابدأ بإنشاء &quot;سكشن رئيسي&quot;.
        </p>
      ) : (
        <SortableList
          key={tree.map((c) => c.id).join()}
          items={tree}
          onReorder={(ids) => reorder(() => reorderCategories(ids))}
          className="space-y-4"
        >
          {(cat, handle) => (
            <div className="bg-card rounded-lg border">
              <CategoryHeader
                category={cat}
                handle={handle}
                onEdit={() => setDialog({ kind: 'editCat', category: cat })}
                onAddSub={() => setDialog({ kind: 'newSub', parent: cat })}
                onAddProduct={() => setDialog({ kind: 'newProduct', category: cat })}
                onDelete={() => setDialog({ kind: 'deleteCat', category: cat })}
              />

              {cat.products.length > 0 && (
                <SortableList
                  key={cat.products.map((p) => p.id).join()}
                  items={cat.products}
                  onReorder={(ids) => reorder(() => reorderProducts(cat.id, ids))}
                  className="divide-y border-t"
                >
                  {(p, pHandle) => (
                    <ProductRow
                      product={p}
                      handle={pHandle}
                      onEdit={() => setDialog({ kind: 'editProduct', product: p, category: cat })}
                      onDelete={() => setDialog({ kind: 'deleteProduct', product: p })}
                    />
                  )}
                </SortableList>
              )}

              {cat.children.length > 0 && (
                <div className="bg-muted/30 border-t p-3">
                  <SortableList
                    key={cat.children.map((s) => s.id).join()}
                    items={cat.children}
                    onReorder={(ids) => reorder(() => reorderCategories(ids))}
                    className="space-y-2"
                  >
                    {(sub, subHandle) => (
                      <div className="bg-card rounded border">
                        <CategoryHeader
                          category={sub}
                          compact
                          handle={subHandle}
                          onEdit={() => setDialog({ kind: 'editCat', category: sub })}
                          onAddSub={null}
                          onAddProduct={() => setDialog({ kind: 'newProduct', category: sub })}
                          onDelete={() => setDialog({ kind: 'deleteCat', category: sub })}
                        />
                        {sub.products.length > 0 && (
                          <SortableList
                            key={sub.products.map((p) => p.id).join()}
                            items={sub.products}
                            onReorder={(ids) => reorder(() => reorderProducts(sub.id, ids))}
                            className="divide-y border-t"
                          >
                            {(p, pHandle) => (
                              <ProductRow
                                product={p}
                                handle={pHandle}
                                onEdit={() => setDialog({ kind: 'editProduct', product: p, category: sub })}
                                onDelete={() => setDialog({ kind: 'deleteProduct', product: p })}
                              />
                            )}
                          </SortableList>
                        )}
                      </div>
                    )}
                  </SortableList>
                </div>
              )}
            </div>
          )}
        </SortableList>
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
  handle,
  onEdit,
  onAddSub,
  onAddProduct,
  onDelete,
}: {
  category: CategoryNode;
  compact?: boolean;
  handle: ReactNode;
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
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {handle}
        <div className="min-w-0 flex-1">
          <h3 className={compact ? 'text-sm font-medium' : 'text-base font-semibold'}>
            {category.name_ar}
          </h3>
          {(category.name_en || category.name_ku) && (
            <p className="text-muted-foreground text-xs" dir="ltr">
              {[category.name_en, category.name_ku].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
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
  handle,
  onEdit,
  onDelete,
}: {
  product: Product;
  handle: ReactNode;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const available = product.is_available ?? true;
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {handle}
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
    </div>
  );
}
