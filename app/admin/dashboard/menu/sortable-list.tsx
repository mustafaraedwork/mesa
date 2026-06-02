'use client';

import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

// Generic vertical drag-to-reorder list.
//
// `order` holds only ids (optimistic), while item content is always looked up
// fresh from the `items` prop — so a nested change (e.g. reordering products
// inside a category) is reflected without this outer list going stale. The
// caller passes `key={items.map(i => i.id).join()}` so an add/remove or a
// server-confirmed reorder remounts this with a fresh order.
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  className,
  getLabel,
  children,
}: {
  items: T[];
  onReorder: (orderedIds: string[]) => void;
  className?: string;
  /** Human label for screen-reader position announcements (W5). */
  getLabel?: (item: T) => string;
  children: (item: T, handle: ReactNode) => ReactNode;
}) {
  const [order, setOrder] = useState(() => items.map((i) => i.id));
  // Q-27: memoize the lookup map so it isn't rebuilt on every drag-driven render.
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  // Stable id for the DndContext so dnd-kit's `aria-describedby`/live-region ids
  // are deterministic across SSR and hydration. Without it, dnd-kit's global
  // counter diverges between server and client (the menu nests several
  // DndContexts), producing a hydration mismatch.
  const dndId = useId();

  // Keep a ref of the live order so the announcement callbacks (created once)
  // can report 1-based positions without going stale (W5).
  const orderRef = useRef(order);
  orderRef.current = order;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const labelOf = (id: string) => {
    const item = byId.get(id);
    return item && getLabel ? getLabel(item) : 'العنصر';
  };
  const posOf = (id: string) => orderRef.current.indexOf(id) + 1;
  const count = () => orderRef.current.length;

  // Arabic live-region messages announcing the dragged item's position. dnd-kit
  // injects these into a visually-hidden aria-live region (replaces the default
  // English copy) so keyboard reordering is fully narrated.
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `تم التقاط ${labelOf(String(active.id))}، الموضع ${posOf(String(active.id))} من ${count()}. استخدم سهمي الأعلى والأسفل للتحريك، ومسافة للإفلات.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${labelOf(String(active.id))} الآن في الموضع ${posOf(String(over.id))} من ${count()}.`
        : '',
    onDragEnd: ({ active, over }) =>
      over
        ? `أُفلت ${labelOf(String(active.id))} في الموضع ${posOf(String(over.id))} من ${count()}.`
        : `أُلغيت إعادة ترتيب ${labelOf(String(active.id))}.`,
    onDragCancel: ({ active }) =>
      `أُلغيت إعادة الترتيب، عاد ${labelOf(String(active.id))} إلى موضعه.`,
  };

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(String(active.id));
    const newIndex = order.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(order, oldIndex, newIndex);
    setOrder(next);
    onReorder(next);
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      accessibility={{ announcements }}
    >
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <div className={className}>
          {order.map((id) => {
            const item = byId.get(id);
            if (!item) return null;
            return (
              <SortableRow key={id} id={id}>
                {(handle) => children(item, handle)}
              </SortableRow>
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  children,
}: {
  id: string;
  children: (handle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: 'relative',
    zIndex: isDragging ? 20 : undefined,
  };

  // Lift treatment while dragging: a shadow + ring (token --shadow-lifted) so
  // the active row clearly floats above the rest (A2), instead of a flat 0.6
  // opacity fade.
  const handle = (
    <button
      type="button"
      className="text-muted-foreground hover:text-foreground hover:bg-muted -ms-1 flex h-9 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
      aria-label="إعادة الترتيب بالسحب"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-5" aria-hidden />
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? 'shadow-lifted ring-primary/30 rounded-xl ring-2' : undefined}
    >
      {children(handle)}
    </div>
  );
}
