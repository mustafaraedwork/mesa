import { ChefHat, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Mode, Discount } from '@/lib/closing';

// Decorative miniature of the diner menu for each mode (F2). Purely visual —
// aria-hidden, with a real caption supplied by the caller. Shows the
// "اختيارات الشيف" shelf for Normal/Closing (with discount badges for Closing)
// and a plain list for Off, so the owner sees the consequence of each switch.
export function ModePreview({ mode, discount }: { mode: Mode; discount?: Discount }) {
  const showShelf = mode === 'normal' || mode === 'closing';
  const isClosing = mode === 'closing';
  const pct = discount ?? 10;

  return (
    <div
      aria-hidden
      className="bg-background border-border-lite overflow-hidden rounded-lg border select-none"
    >
      {showShelf ? (
        <div
          className={cn(
            'flex items-center gap-1 px-2 py-1 text-[0.55rem] font-semibold',
            isClosing ? 'bg-primary/10 text-primary' : 'bg-accent/20 text-accent-text',
          )}
        >
          {isClosing ? <Tag className="size-2.5" /> : <ChefHat className="size-2.5" />}
          <span>اختيارات الشيف</span>
        </div>
      ) : (
        <div className="text-muted-foreground bg-muted/40 px-2 py-1 text-[0.55rem] font-semibold">
          القائمة
        </div>
      )}

      <div className="flex gap-1 p-1.5">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="bg-card border-border-lite relative flex-1 rounded border p-1"
          >
            <div className="bg-foreground/[0.06] mb-1 h-6 rounded" />
            {isClosing && (
              <span className="bg-destructive text-destructive-foreground absolute end-0.5 top-0.5 rounded-full px-1 text-[0.5rem] font-bold tabular-nums">
                −{pct}%
              </span>
            )}
            <div className="bg-foreground/15 h-1 w-2/3 rounded" />
          </div>
        ))}
      </div>

      <div className="space-y-1 px-1.5 pb-1.5">
        {[0, 1].map((i) => (
          <div key={i} className="bg-card border-border-lite flex items-center gap-1 rounded border p-1">
            <div className="bg-foreground/[0.06] size-4 shrink-0 rounded" />
            <div className="flex-1 space-y-0.5">
              <div className="bg-foreground/15 h-1 w-1/2 rounded" />
              <div className="bg-foreground/[0.08] h-1 w-1/4 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
