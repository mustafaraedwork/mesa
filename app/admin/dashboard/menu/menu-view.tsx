'use client';

import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  FolderPlus,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/toast';
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
    <div className="space-y-section">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-h2 font-semibold">المنيو</h2>
        <p className="text-muted-foreground text-caption">
          اسحب <span aria-hidden>⠿</span> لإعادة الترتيب
        </p>
      </div>

      {reorderError && (
        <p role="alert" className="text-destructive-text text-sm">{reorderError}</p>
      )}

      {tree.length === 0 ? (
        <EmptyMenu onCreate={() => setDialog({ kind: 'newRoot' })} />
      ) : (
        <SortableList
          key={tree.map((c) => c.id).join()}
          items={tree}
          onReorder={(ids) => reorder(() => reorderCategories(ids))}
          getLabel={(c) => c.name_ar}
          className="space-y-stack"
        >
          {(cat, handle) => (
            <section className="bg-card border-border-lite shadow-card overflow-hidden rounded-xl border">
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
                  getLabel={(p) => p.name_ar}
                  className="divide-border-lite divide-y border-t"
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
                <div className="bg-muted/30 space-y-stack border-t p-3">
                  <SortableList
                    key={cat.children.map((s) => s.id).join()}
                    items={cat.children}
                    onReorder={(ids) => reorder(() => reorderCategories(ids))}
                    getLabel={(s) => s.name_ar}
                    className="space-y-2"
                  >
                    {(sub, subHandle) => (
                      <div className="bg-card border-border-lite overflow-hidden rounded-lg border">
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
                            getLabel={(p) => p.name_ar}
                            className="divide-border-lite divide-y border-t"
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
            </section>
          )}
        </SortableList>
      )}

      {/* FAB — primary "add section" sits in the thumb zone (M4). */}
      <Button
        size="lg"
        onClick={() => setDialog({ kind: 'newRoot' })}
        className="shadow-lifted fixed end-4 bottom-[calc(var(--spacing-safe-b)+5.5rem)] z-30 rounded-full"
      >
        <Plus />
        سكشن رئيسي
      </Button>

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

function EmptyMenu({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="bg-card border-border-lite shadow-card flex flex-col items-center gap-3 rounded-xl border px-6 py-12 text-center">
      <div className="bg-primary/10 text-primary flex size-14 items-center justify-center rounded-2xl">
        <UtensilsCrossed className="size-7" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="font-medium">ما في سكاشن بعد</p>
        <p className="text-muted-foreground text-sm">ابدأ بإنشاء سكشن رئيسي — مثل «المقبّلات» أو «المشروبات».</p>
      </div>
      <Button onClick={onCreate}>
        <Plus />
        سكشن رئيسي
      </Button>
    </div>
  );
}

/** Secondary-language line with per-span lang/dir so SR reads each correctly (W2). */
function AltNames({ en, ku }: { en: string | null; ku: string | null }) {
  if (!en && !ku) return null;
  return (
    <p className="text-muted-foreground text-caption truncate">
      {en && (
        <span lang="en" dir="ltr">
          {en}
        </span>
      )}
      {en && ku && <span aria-hidden> · </span>}
      {ku && <span lang="ckb">{ku}</span>}
    </p>
  );
}

function CategoryActions({
  name,
  compact,
  onEdit,
  onAddSub,
  onDelete,
}: {
  name: string;
  compact?: boolean;
  onEdit: () => void;
  onAddSub: (() => void) | null;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size={compact ? 'icon-sm' : 'icon'}
            aria-label={`خيارات «${name}»`}
          />
        }
      >
        <MoreVertical />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {onAddSub && (
          <DropdownMenuItem onClick={onAddSub}>
            <FolderPlus />
            سكشن فرعي
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onEdit}>
          <Pencil />
          تعديل
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 />
          حذف
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
    <div className={'flex items-center gap-2 px-3 ' + (compact ? 'py-2' : 'py-2.5')}>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {handle}
        <div className="min-w-0 flex-1">
          {compact ? (
            <h4 className="truncate text-sm font-medium">{category.name_ar}</h4>
          ) : (
            <h3 className="text-lead truncate font-semibold">{category.name_ar}</h3>
          )}
          <AltNames en={category.name_en} ku={category.name_ku} />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" variant="outline" onClick={onAddProduct}>
          <Plus />
          منتج
        </Button>
        <CategoryActions
          name={category.name_ar}
          compact={compact}
          onEdit={onEdit}
          onAddSub={onAddSub}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}

function ProductThumb({ src }: { src: string | null }) {
  if (!src) {
    return (
      <div
        className="bg-foreground/[0.04] flex size-12 shrink-0 items-center justify-center rounded-md"
        aria-hidden
      >
        <UtensilsCrossed className="text-foreground/20 size-5" />
      </div>
    );
  }
  return (
    <div className="bg-foreground/[0.04] relative size-12 shrink-0 overflow-hidden rounded-md">
      <Image src={src} alt="" fill sizes="48px" className="object-cover" />
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
  const toast = useToast();
  // Availability is reflected optimistically — `setProductAvailable` only
  // revalidates server-side, so local state is the display truth here. On
  // failure we revert and surface a toast (was a silent swallow — F1).
  const [available, setAvailable] = useState(product.is_available ?? true);

  function toggle(next: boolean) {
    setAvailable(next);
    startTransition(async () => {
      const r = await setProductAvailable(product.id, next);
      if (r.ok) {
        toast.add({
          type: 'success',
          timeout: 2500,
          title: next ? `«${product.name_ar}» ظاهر للزبائن` : `«${product.name_ar}» مخفي عن الزبائن`,
        });
      } else {
        setAvailable(!next);
        toast.add({ type: 'error', title: 'تعذّر تحديث الحالة', description: r.error });
      }
    });
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      {handle}
      <ProductThumb src={product.image_url} />
      <div className="min-w-0 flex-1">
        <p className={'truncate font-medium ' + (available ? '' : 'text-muted-foreground line-through')}>
          {product.name_ar}
        </p>
        <p className="text-muted-foreground text-caption" dir="ltr">
          <span className="font-mono tabular-nums">{product.price.toLocaleString('en-US')}</span> ·{' '}
          {product.prep_time_minutes}د · ربح {product.profit_percentage}٪
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Switch
          checked={available}
          disabled={pending}
          onCheckedChange={toggle}
          aria-label={`إتاحة «${product.name_ar}» للزبائن`}
        />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label={`خيارات «${product.name_ar}»`} />}
          >
            <MoreVertical />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={onEdit}>
              <Pencil />
              تعديل
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 />
              حذف
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
