'use client';

import { useRef, useState, useTransition } from 'react';
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
import { createProduct, updateProduct } from './actions';
import type { Product } from './menu-view';

type Props =
  | { mode: 'create'; categoryId: string; categoryName: string; onClose: () => void; product?: never }
  | { mode: 'edit'; product: Product; categoryId: string; categoryName: string; onClose: () => void };

export function ProductDialog(props: Props) {
  const editing = props.mode === 'edit';
  const initial = editing ? props.product : null;
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [removeImage, setRemoveImage] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

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

          <Field label="الاسم بالعربي *">
            <Input name="name_ar" defaultValue={initial?.name_ar ?? ''} required autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="English">
              <Input name="name_en" dir="ltr" className="text-left" defaultValue={initial?.name_en ?? ''} />
            </Field>
            <Field label="کوردی">
              <Input name="name_ku" defaultValue={initial?.name_ku ?? ''} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="السعر *">
              <Input
                name="price"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                dir="ltr"
                className="text-left"
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
                className="text-left"
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
                className="text-left"
                defaultValue={initial?.prep_time_minutes ?? 5}
              />
            </Field>
          </div>

          <Field label="الصورة">
            <div className="space-y-2">
              {editing && initial?.image_url && !removeImage && (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={initial.image_url} alt="" className="h-16 w-16 rounded object-cover" />
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
                <p className="text-muted-foreground text-xs">
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
              <Input name="image" type="file" accept="image/*" />
              <p className="text-muted-foreground text-xs">
                ستُضغط الصورة تلقائياً إلى 800×800 WebP.
              </p>
            </div>
          </Field>

          {error && <p role="alert" className="text-destructive text-sm">{error}</p>}

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
