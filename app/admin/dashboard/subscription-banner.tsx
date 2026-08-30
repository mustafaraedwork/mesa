// Renewal warning inside the tenant panel.
//
// The owner collects payment offline and by hand, so nothing reminds the
// restaurant automatically — this banner is the reminder. It escalates instead
// of shouting from day one, otherwise it becomes wallpaper and stops working
// exactly when it matters:
//
//   > 30 days   nothing at all
//   30 → 8      quiet neutral note
//   7 → 1       amber, "renew soon"
//   day 0       amber, "expires today"
//   grace 1-3   red, day countdown + what happens when it runs out
//
// A red banner every day for a month would be ignored by week two; this one
// only turns red when the deadline has actually passed.

import { AlertTriangle, CalendarClock, Info } from 'lucide-react';
import { bagDate } from '@/lib/billing';
import { WARN_AHEAD_DAYS, type SubscriptionState } from '@/lib/subscription';

const URGENT_DAYS = 7;

export function SubscriptionBanner({ subscription }: { subscription: SubscriptionState }) {
  const { status, daysLeft, graceDaysLeft, endsAt } = subscription;

  // 'none' (no subscription recorded yet) and 'suspended' (already redirected
  // away by requireTenant) both render nothing here.
  if (status !== 'expiring' && status !== 'grace') return null;
  if (status === 'expiring' && (daysLeft === null || daysLeft > WARN_AHEAD_DAYS)) return null;

  if (status === 'grace') {
    const left = graceDaysLeft ?? 0;
    return (
      <Banner
        tone="danger"
        icon={<AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />}
        title={
          left <= 1
            ? 'انتهى اشتراكك — اليوم الأخير من المهلة'
            : `انتهى اشتراكك — تبقّى ${left} أيام من المهلة`
        }
        body="بعد انتهاء المهلة سيتوقّف منيو الزبائن ولوحة التحكّم حتى التجديد. تواصل مع BIZIII."
        endsAt={endsAt}
      />
    );
  }

  const days = daysLeft ?? 0;
  const urgent = days <= URGENT_DAYS;
  return (
    <Banner
      tone={urgent ? 'warning' : 'neutral'}
      icon={
        urgent ? (
          <CalendarClock className="h-4 w-4 shrink-0" aria-hidden />
        ) : (
          <Info className="h-4 w-4 shrink-0" aria-hidden />
        )
      }
      title={
        days === 0
          ? 'اشتراكك ينتهي اليوم'
          : days === 1
            ? 'اشتراكك ينتهي غداً'
            : `اشتراكك ينتهي بعد ${days} يوماً`
      }
      body={urgent ? 'تواصل مع BIZIII للتجديد قبل انتهاء المدّة.' : 'يمكنك التجديد عبر BIZIII في أي وقت.'}
      endsAt={endsAt}
    />
  );
}

const TONES = {
  neutral: 'border-border bg-muted/50 text-foreground',
  warning: 'border-warning/40 bg-warning/10 text-foreground',
  danger: 'border-destructive/40 bg-destructive/10 text-foreground',
} as const;

function Banner({
  tone,
  icon,
  title,
  body,
  endsAt,
}: {
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  title: string;
  body: string;
  endsAt: string | null;
}) {
  return (
    <div
      // Announced to screen readers, but politely — this is not an alert that
      // should interrupt what the owner is typing.
      role="status"
      className={`mb-4 flex items-start gap-3 rounded-xl border p-3 ${TONES[tone]}`}
    >
      {icon}
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground text-caption">{body}</p>
        {endsAt && (
          <p className="text-muted-foreground text-caption">
            تاريخ الانتهاء:{' '}
            <span dir="ltr" className="font-medium">
              {bagDate(endsAt)}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
