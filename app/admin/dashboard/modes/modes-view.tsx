'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChefHat, PowerOff, Tag, UtensilsCrossed } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Countdown } from './countdown';
import { ClosingDialog } from './closing-dialog';
import { ChefPicksDialog } from './chef-picks-dialog';
import { ModePreview } from './mode-preview';
import { setMode } from './actions';
import type { Mode, Discount } from '@/lib/closing';

export type CategoryGroup = {
  id: string;
  name_ar: string;
  products: {
    id: string;
    name_ar: string;
    price: number;
    is_available: boolean;
    is_in_closing_mode: boolean;
    is_chef_pick: boolean;
  }[];
};

type LiveState = {
  active_mode: Mode;
  closing_mode_ends_at: string | null;
  closing_mode_discount: Discount | null;
  server_now: string;
};

type ModeMeta = {
  label: string;
  description: string;
  Icon: typeof UtensilsCrossed;
  chip: string;
  ring: string;
  badge: 'success' | 'primary' | 'warning';
};

const MODE_META: Record<Mode, ModeMeta> = {
  normal: {
    label: 'العادي',
    description: 'الترتيب اليدوي، مع قسم «اختيارات الشيف» الاختياري بلا خصم.',
    Icon: UtensilsCrossed,
    chip: 'bg-success/12 text-success-text',
    ring: 'ring-success',
    badge: 'success',
  },
  closing: {
    label: 'الإغلاق',
    description: 'خصم محدود الوقت يظهر بقسم «اختيارات الشيف» أعلى المنيو.',
    Icon: Tag,
    chip: 'bg-primary/10 text-primary',
    ring: 'ring-primary',
    badge: 'primary',
  },
  off: {
    label: 'متوقّف',
    description: 'منيو عادي بلا أي عروض ولا قسم «اختيارات الشيف».',
    Icon: PowerOff,
    chip: 'bg-warning/15 text-warning-text',
    ring: 'ring-warning',
    badge: 'warning',
  },
};

export function ModesView({
  initialState,
  currency,
  categoryGroups,
}: {
  initialState: LiveState;
  currency: string;
  categoryGroups: CategoryGroup[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<LiveState>(initialState);
  const [pending, startTransition] = useTransition();
  const [closingOpen, setClosingOpen] = useState(false);
  const [chefPicksOpen, setChefPicksOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [t2Open, setT2Open] = useState(false);
  const [t2PendingMode, setT2PendingMode] = useState<'normal' | 'off' | null>(null);
  const [t3Open, setT3Open] = useState(false);
  const [t3RemainingMs, setT3RemainingMs] = useState(0);

  /* eslint-disable react-hooks/purity -- the countdown gating reads the wall
     clock on purpose; this view re-renders on the 10s state poll. */
  // Q12 server-now offset for the countdown. Q-20: memoized on server_now so it
  // isn't recomputed (with a fresh Date.now()) on unrelated re-renders.
  const offset = useMemo(
    () => new Date(state.server_now).getTime() - Date.now(),
    [state.server_now],
  );

  // Q10 — 10s polling against /api/admin/state.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (document.hidden) return; // Q-19: don't poll while the tab is backgrounded.
      try {
        const res = await fetch('/api/admin/state', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as LiveState;
        if (!cancelled) setState(data);
      } catch {
        // Best-effort poll — ignore network blips.
      }
    };
    const id = setInterval(tick, 10_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  const isClosing = state.active_mode === 'closing';
  const expired =
    isClosing &&
    state.closing_mode_ends_at !== null &&
    new Date(state.closing_mode_ends_at).getTime() + offset < Date.now();
  /* eslint-enable react-hooks/purity */

  const chefPickIds = useMemo(
    () => categoryGroups.flatMap((g) => g.products).filter((p) => p.is_chef_pick).map((p) => p.id),
    [categoryGroups],
  );

  function notifyApplied(label: string) {
    toast.add({
      type: 'success',
      title: `تم تفعيل وضع «${label}»`,
      description: 'يظهر للزبائن خلال ~٣٠ ثانية (دورة التحديث).',
    });
  }

  function performSwitch(mode: 'normal' | 'off') {
    setError(null);
    startTransition(async () => {
      const r = await setMode({ mode });
      if (!r.ok) {
        setError(r.error);
        toast.add({ type: 'error', title: 'تعذّر تغيير الوضع', description: r.error });
        return;
      }
      // Reflect the switch instantly; router.refresh + the 10s poll re-sync.
      setState((s) => ({ ...s, active_mode: mode, closing_mode_ends_at: null, closing_mode_discount: null }));
      notifyApplied(MODE_META[mode].label);
      router.refresh();
    });
  }

  function switchMode(mode: 'normal' | 'off') {
    // T2 confirm — switching AWAY from active Closing
    if (isClosing && !expired) {
      setT2PendingMode(mode);
      setT2Open(true);
      return;
    }
    performSwitch(mode);
  }

  function openClosing() {
    // T3 confirm — re-activating Closing while one is running
    if (isClosing && !expired && state.closing_mode_ends_at) {
      const remaining = new Date(state.closing_mode_ends_at).getTime() + offset - Date.now();
      setT3RemainingMs(remaining);
      setT3Open(true);
      return;
    }
    setError(null);
    setClosingOpen(true);
  }

  return (
    <div className="space-y-section">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-h2 font-semibold">الأوضاع</h2>
        <Badge variant={MODE_META[state.active_mode].badge}>
          {MODE_META[state.active_mode].label}
        </Badge>
      </div>

      {isClosing && state.closing_mode_ends_at && state.closing_mode_discount && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="flex-row items-center gap-2 pb-2">
            <Tag className="text-primary size-4" aria-hidden />
            <CardTitle className="text-primary text-base">عرض الإغلاق فعّال</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="text-ink-2 text-sm">
                خصم {state.closing_mode_discount}٪ على المنتجات المختارة
              </p>
              <Countdown endsAt={state.closing_mode_ends_at} offsetMs={offset} />
            </div>
            <Button variant="outline" onClick={() => switchMode('normal')} disabled={pending}>
              إنهاء الآن
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <ModeCard
          mode="normal"
          active={state.active_mode === 'normal'}
          pending={pending}
          primaryAction={
            <Button
              onClick={() => switchMode('normal')}
              disabled={state.active_mode === 'normal' || pending}
              className="w-full"
            >
              {state.active_mode === 'normal' ? 'مفعّل' : 'تفعيل'}
            </Button>
          }
          secondaryAction={
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setError(null);
                setChefPicksOpen(true);
              }}
              className="w-full"
            >
              <ChefHat />
              اختيارات الشيف ({chefPickIds.length})
            </Button>
          }
        />

        <ModeCard
          mode="closing"
          active={isClosing}
          pending={pending}
          discount={isClosing ? state.closing_mode_discount ?? undefined : undefined}
          primaryAction={
            <Button
              onClick={openClosing}
              disabled={pending}
              variant={isClosing ? 'outline' : 'default'}
              className="w-full"
            >
              {isClosing ? 'تعديل العرض' : 'اختر منتجات وفعّل'}
            </Button>
          }
        />

        <ModeCard
          mode="off"
          active={state.active_mode === 'off'}
          pending={pending}
          primaryAction={
            <Button
              onClick={() => switchMode('off')}
              disabled={state.active_mode === 'off' || pending}
              variant={state.active_mode === 'off' ? 'default' : 'outline'}
              className="w-full"
            >
              {state.active_mode === 'off' ? 'مفعّل' : 'إيقاف كل الأوضاع'}
            </Button>
          }
        />
      </div>

      {error && <p role="alert" className="text-destructive-text text-sm">{error}</p>}

      <AlertDialog open={t2Open} onOpenChange={setT2Open}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تنبيه</AlertDialogTitle>
            <AlertDialogDescription>
              {t2PendingMode === 'off'
                ? 'إيقاف كل الأوضاع سيُلغي عرض الإغلاق الجاري. متابعة؟'
                : t2PendingMode
                  ? `تفعيل ${MODE_META[t2PendingMode].label} سيُلغي عرض الإغلاق الجاري. متابعة؟`
                  : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const mode = t2PendingMode;
                setT2Open(false);
                setT2PendingMode(null);
                if (mode) performSwitch(mode);
              }}
            >
              متابعة
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={t3Open} onOpenChange={setT3Open}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>استبدال العرض</AlertDialogTitle>
            <AlertDialogDescription>
              يوجد عرض إغلاق فعّال ينتهي خلال {formatDurationShort(t3RemainingMs)}.
              تفعيل عرض جديد سيستبدله. متابعة؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setT3Open(false);
                setError(null);
                setClosingOpen(true);
              }}
            >
              متابعة
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {closingOpen && (
        <ClosingDialog
          categoryGroups={categoryGroups}
          currency={currency}
          initialSelection={
            isClosing
              ? categoryGroups
                  .flatMap((g) => g.products)
                  .filter((p) => p.is_in_closing_mode)
                  .map((p) => p.id)
              : []
          }
          initialDiscount={state.closing_mode_discount ?? 10}
          onClose={() => setClosingOpen(false)}
          onResult={(r) => {
            setClosingOpen(false);
            if (r.ok) {
              if (r.warnings && r.warnings.length > 0) {
                toast.add({
                  type: 'warning',
                  title: 'تم التفعيل مع تنبيه',
                  description: 'بعض المنتجات غير متوفرة الآن وستظهر عند توفّرها.',
                });
              } else {
                notifyApplied('الإغلاق');
              }
              router.refresh();
            } else {
              setError(r.error);
              toast.add({ type: 'error', title: 'تعذّر تفعيل العرض', description: r.error });
            }
          }}
        />
      )}

      {chefPicksOpen && (
        <ChefPicksDialog
          categoryGroups={categoryGroups}
          initialSelection={chefPickIds}
          onClose={() => setChefPicksOpen(false)}
          onResult={(r) => {
            setChefPicksOpen(false);
            if (r.ok) {
              toast.add({ type: 'success', title: 'تم حفظ اختيارات الشيف' });
              router.refresh();
            } else {
              setError(r.error);
              toast.add({ type: 'error', title: 'تعذّر الحفظ', description: r.error });
            }
          }}
        />
      )}
    </div>
  );
}

function ModeCard({
  mode,
  active,
  pending,
  discount,
  primaryAction,
  secondaryAction,
}: {
  mode: Mode;
  active: boolean;
  pending: boolean;
  discount?: Discount;
  primaryAction: React.ReactNode;
  secondaryAction?: React.ReactNode;
}) {
  const meta = MODE_META[mode];
  const { Icon } = meta;
  return (
    <Card
      data-mode={mode}
      data-active={active}
      aria-current={active ? 'true' : undefined}
      className={cn('transition-shadow', active && `ring-2 ${meta.ring} shadow-lifted`)}
    >
      <CardContent className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', meta.chip)}>
              <Icon className="size-5" aria-hidden />
            </span>
            <div className="flex items-center gap-2">
              <CardTitle className="text-lead">{meta.label}</CardTitle>
              {active && (
                <Badge variant={meta.badge} aria-label="الوضع النشط">
                  نشط
                </Badge>
              )}
            </div>
          </div>
          <p className="text-muted-foreground text-sm">{meta.description}</p>
          <div className="space-y-2 pt-1">
            {primaryAction}
            {secondaryAction}
          </div>
        </div>

        <div className="space-y-1 sm:w-32">
          <ModePreview mode={mode} discount={discount} />
          <p className="text-muted-foreground text-center text-caption">ما يراه الزبون</p>
        </div>
      </CardContent>
      {/* Live region pre-exists in the DOM so SR announces the change (4.1.3). */}
      <span role="status" aria-live="polite" className="sr-only">
        {pending ? 'جارٍ التحديث…' : ''}
      </span>
    </Card>
  );
}

function formatDurationShort(ms: number): string {
  if (ms <= 0) return '٠';
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}س ${m.toString().padStart(2, '0')}د`;
  return `${m}د`;
}
