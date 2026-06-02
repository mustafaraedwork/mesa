'use client';

import { useRef, useState, useTransition } from 'react';
import { ImagePlus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { createProduct, updateProduct } from './actions';
import type { Product } from './menu-view';

type ProductRef = { id: string; name_ar: string };

type Props =
  | { mode: 'create'; categoryId: string; categoryName: string; allProducts: ProductRef[]; onClose: () => void; product?: never }
  | { mode: 'edit'; product: Product; categoryId: string; categoryName: string; allProducts: ProductRef[]; onClose: () => void };

const SUGGESTION_ITEMS: Record<string, string> = {
  default: 'تلقائي (حسب السكاشن)',
  custom: 'اقتراحات مخصّصة',
};

export function ProductDialog(props: Props) {
  const editing = props.mode === 'edit';
  const initial = editing ? props.product : null;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [removeImage, setRemoveImage] = useState(false);
  const [suggestionsType, setSuggestionsType] = useState<'default' | 'custom'>(
    initial?.suggestions_type ?? 'default',
  );
  // Custom-suggestion ids held in state; emitted as hidden inputs so the server
  // action keeps reading `formData.getAll('custom_suggestion_ids')` unchanged
  // while the UI uses the branded Checkbox instead of an OS-blue native box.
  const [customIds, setCustomIds] = useState<Set<string>>(
    new Set(initial?.custom_suggestion_ids ?? []),
  );
  const formRef = useRef<HTMLFormElement>(null);

  // Every other product — candidates for manual suggestions (not itself).
  const otherProducts = props.allProducts.filter((p) => p.id !== initial?.id);

  function toggleCustom(id: string, checked: boolean) {
    setCustomIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(formRef.current!);
    if (editing) {
      fd.set('id', props.product.id);
      if (removeImage) fd.set('remove_image', 'true');
    } else {
      fd.set('category_id', props.categoryId);
    }
    startTransition(async () => {
      const r = editing ? await updateProduct(fd) : await createProduct(fd);
      if (!r.ok) setError(r.error);
      else props.onClose();
    });
  }

  const title = editing ? `تعديل: ${initial!.name_ar}` : `منتج جديد في "${props.categoryName}"`;

  return (
    <Dialog open onOpenChange={(v) => !v && props.onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>الاسم بالعربي والسعر إجباريان.</DialogDescription>
          </DialogHeader>

          <Field label="الاسم بالعربي" required>
            <Input name="name_ar" defaultValue={initial?.name_ar ?? ''} required autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="English">
              <Input name="name_en" lang="en" dir="ltr" className="text-left" defaultValue={initial?.name_en ?? ''} />
            </Field>
            <Field label="کوردی">
              <Input name="name_ku" lang="ckb" defaultValue={initial?.name_ku ?? ''} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="السعر" required>
              <Input
                name="price"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                dir="ltr"
                className="text-left font-mono"
                defaultValue={initial?.price ?? ''}
                required
              />
            </Field>
            <Field label="هامش الربح %">
              <Input
                name="profit_percentage"
                type="number"
                step="0.01"
                min="0"
                max="100"
                dir="ltr"
                className="text-left font-mono"
                defaultValue={initial?.profit_percentage ?? 0}
              />
            </Field>
            <Field label="وقت التحضير (د)">
              <Input
                name="prep_time_minutes"
                type="number"
                step="1"
                min="1"
                max="240"
                dir="ltr"
                className="text-left font-mono"
                defaultValue={initial?.prep_time_minutes ?? 5}
              />
            </Field>
          </div>

          <Field label="الصورة">
            <div className="space-y-2">
              {editing && initial?.image_url && !removeImage && (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={initial.image_url} alt="" className="size-16 rounded-lg object-cover" />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRemoveImage(true)}
                  >
                    إزالة الصورة الحالية
                  </Button>
                </div>
              )}
              {editing && removeImage && (
                <p className="text-muted-foreground text-caption">
                  ستُزال الصورة الحالية عند الحفظ.{' '}
                  <button
                    type="button"
                    className="text-primary underline"
                    onClick={() => setRemoveImage(false)}
                  >
                    تراجع
                  </button>
                </p>
              )}
              <label className="border-border-strong text-muted-foreground hover:bg-muted flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-sm transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/60">
                <ImagePlus className="size-4 shrink-0" aria-hidden />
                <span>اختر صورة…</span>
                <input name="image" type="file" accept="image/*" className="sr-only" />
              </label>
              <p className="text-muted-foreground text-caption">
                ستُضغط الصورة تلقائياً إلى 800×800 WebP.
              </p>
            </div>
          </Field>

          <Field label="الاقتراحات في صفحة السلة">
            <Select
              name="suggestions_type"
              value={suggestionsType}
              onValueChange={(v) => v && setSuggestionsType(v as 'default' | 'custom')}
              items={SUGGESTION_ITEMS}
            >
              <SelectTrigger />
              <SelectContent>
                <SelectItem value="default">تلقائي (حسب السكاشن)</SelectItem>
                <SelectItem value="custom">اقتراحات مخصّصة</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {suggestionsType === 'custom' && (
            <Field label="المنتجات المقترَحة عند طلب هذا المنتج" group>
              {otherProducts.length === 0 ? (
                <p className="text-muted-foreground text-caption">أضف منتجات أخرى أولاً.</p>
              ) : (
                <>
                  <ul className="border-border-lite max-h-48 space-y-0.5 overflow-y-auto rounded-lg border p-1.5">
                    {otherProducts.map((p) => (
                      <li key={p.id}>
                        <label className="hover:bg-muted flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5">
                          <Checkbox
                            checked={customIds.has(p.id)}
                            onCheckedChange={(c) => toggleCustom(p.id, c)}
                          />
                          <span className="text-sm">{p.name_ar}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  {[...customIds].map((id) => (
                    <input key={id} type="hidden" name="custom_suggestion_ids" value={id} />
                  ))}
                </>
              )}
            </Field>
          )}

          {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onClose}>إلغاء</Button>
            <Button type="submit" disabled={pending}>
              {pending ? '...' : editing ? 'حفظ' : 'إنشاء'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
