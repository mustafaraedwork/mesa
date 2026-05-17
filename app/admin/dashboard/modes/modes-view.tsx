'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  }[];
};

type LiveState = {
  active_mode: Mode;
  closing_mode_ends_at: string | null;
  closing_mode_discount: Discount | null;
  server_now: string;
};

const MODE_META: Record<Mode, { label: string; description: string; color: string }> = {
  normal: { label: 'العادي', description: 'الترتيب اليدوي.', color: 'bg-slate-50 text-slate-700' },
  rush: { label: 'الزحام', description: 'الأسرع تحضيراً أولاً داخل كل سكشن.', color: 'bg-amber-50 text-amber-700' },
  profit: { label: 'الربح', description: 'الأعلى ربحاً أولاً داخل كل سكشن.', color: 'bg-emerald-50 text-emerald-700' },
  closing: { label: 'الإغلاق', description: 'خصم محدود الوقت — يظهر بقسم "عروض اليوم".', color: 'bg-rose-50 text-rose-700' },
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
  const [state, setState] = useState<LiveState>(initialState);
  const [pending, startTransition] = useTransition();
  const [closingOpen, setClosingOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [t2Open, setT2Open] = useState(false);
  const [t2PendingMode, setT2PendingMode] = useState<'normal' | 'rush' | 'profit' | null>(null);
  const [t3Open, setT3Open] = useState(false);
  const [t3RemainingMs, setT3RemainingMs] = useState(0);

  /* eslint-disable react-hooks/purity -- the countdown gating reads the wall
     clock on purpose; this view re-renders on the 10s state poll. */
  // Q12 server-now offset for the countdown.
  const offset =
    new Date(state.server_now).getTime() - Date.now();

  // Q10 — 10s polling against /api/admin/state.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
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
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const isClosing = state.active_mode === 'closing';
  const expired =
    isClosing &&
    state.closing_mode_ends_at !== null &&
    new Date(state.closing_mode_ends_at).getTime() + offset < Date.now();
  /* eslint-enable react-hooks/purity */

  function performSwitch(mode: 'normal' | 'rush' | 'profit') {
    setError(null);
    setWarnings(null);
    startTransition(async () => {
      const r = await setMode({ mode });
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  }

  function switchMode(mode: 'normal' | 'rush' | 'profit') {
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
    setWarnings(null);
    setClosingOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">الأوضاع</h2>
        <p className="text-muted-foreground text-xs">
          الحالي:{' '}
          <span className="text-foreground font-medium">{MODE_META[state.active_mode].label}</span>
        </p>
      </div>

      {isClosing && state.closing_mode_ends_at && state.closing_mode_discount && (
        <Card className="border-rose-300 bg-rose-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-rose-800 text-base">عرض الإغلاق فعّال</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-rose-900 text-sm">
                خصم {state.closing_mode_discount}٪ على المنتجات المختارة
              </p>
              <Countdown
                endsAt={state.closing_mode_ends_at}
                offsetMs={offset}
              />
            </div>
            <Button
              variant="outline"
              onClick={() => switchMode('normal')}
              disabled={pending}
            >
              إنهاء الآن
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {(['normal', 'rush', 'profit', 'closing'] as Mode[]).map((m) => {
          const meta = MODE_META[m];
          const active = state.active_mode === m;
          return (
            <Card key={m} data-mode={m} className={active ? 'ring-primary ring-2' : ''}>
              <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-base">{meta.label}</CardTitle>
                {active && (
                  <span className={`rounded px-2 py-0.5 text-xs ${meta.color}`}>نشط</span>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-muted-foreground text-sm">{meta.description}</p>
                {m === 'closing' ? (
                  <Button
                    onClick={openClosing}
                    disabled={pending}
                    variant={active ? 'outline' : 'default'}
                    className="w-full"
                  >
                    {active ? 'تعديل العرض' : 'اختر منتجات'}
                  </Button>
                ) : (
                  <Button
                    onClick={() => switchMode(m as 'normal' | 'rush' | 'profit')}
                    disabled={active || pending}
                    variant={active ? 'outline' : 'default'}
                    className="w-full"
                  >
                    {active ? 'مفعّل' : 'تفعيل'}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
      {warnings && warnings.length > 0 && (
        <p className="text-amber-700 text-sm">
          تم اختيار منتجات غير متوفرة. ستظهر في عروض اليوم بـoverlay عند توفّرها.
        </p>
      )}

      <AlertDialog open={t2Open} onOpenChange={setT2Open}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تنبيه</AlertDialogTitle>
            <AlertDialogDescription>
              {t2PendingMode
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
                setWarnings(null);
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
              setWarnings(r.warnings ?? null);
              router.refresh();
            } else {
              setError(r.error);
            }
          }}
        />
      )}
    </div>
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
