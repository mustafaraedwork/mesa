'use client';

import { useState, useTransition } from 'react';
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
import { createCategory, updateCategory } from './actions';
import type { CategoryNode } from './menu-view';

type Props =
  | { mode: 'create'; parentId?: string; parentName?: string; onClose: () => void; category?: never }
  | { mode: 'edit'; category: CategoryNode; onClose: () => void; parentId?: never; parentName?: never };

export function CategoryDialog(props: Props) {
  const editing = props.mode === 'edit';
  const initial = editing ? props.category : null;
  const [name_ar, setNameAr] = useState(initial?.name_ar ?? '');
  const [name_en, setNameEn] = useState(initial?.name_en ?? '');
  const [name_ku, setNameKu] = useState(initial?.name_ku ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = editing
        ? await updateCategory({ id: props.category.id, name_ar, name_en, name_ku })
        : await createCategory({ name_ar, name_en, name_ku, parent_id: props.parentId ?? null });
      if (!r.ok) setError(r.error);
      else props.onClose();
    });
  }

  const title = editing
    ? 'تعديل سكشن'
    : props.parentId
      ? `سكشن فرعي تحت "${props.parentName}"`
      : 'سكشن رئيسي جديد';

  return (
    <Dialog open onOpenChange={(v) => !v && props.onClose()}>
      <DialogContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>الاسم بالعربي إجباري؛ EN/KU اختياري.</DialogDescription>
          </DialogHeader>

          <Field label="الاسم بالعربي *">
            <Input value={name_ar} onChange={(e) => setNameAr(e.target.value)} required autoFocus />
          </Field>
          <Field label="English (optional)">
            <Input dir="ltr" className="text-left" value={name_en} onChange={(e) => setNameEn(e.target.value)} />
          </Field>
          <Field label="کوردی (optional)">
            <Input value={name_ku} onChange={(e) => setNameKu(e.target.value)} />
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
