'use client';

import { useState, type ReactNode } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
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
  children,
}: {
  items: T[];
  onReorder: (orderedIds: string[]) => void;
  className?: string;
  children: (item: T, handle: ReactNode) => ReactNode;
}) {
  const [order, setOrder] = useState(() => items.map((i) => i.id));
  const byId = new Map(items.map((i) => [i.id, i]));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

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
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
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
    opacity: isDragging ? 0.6 : 1,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  };

  const handle = (
    <button
      type="button"
      className="text-muted-foreground hover:text-foreground shrink-0 cursor-grab touch-none"
      aria-label="إعادة الترتيب بالسحب"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );

  return (
    <div ref={setNodeRef} style={style}>
      {children(handle)}
    </div>
  );
}
