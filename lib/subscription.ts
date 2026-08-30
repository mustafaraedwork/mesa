// Subscription access control — pure logic, no DB, no React.
//
// The single place that answers "may this restaurant be used right now?".
// Shared by three surfaces that must never disagree:
//   • the diner menu   (lib/menu.ts)
//   • the tenant panel (lib/auth/require-tenant.ts)
//   • the owner panel  (accounts list + detail)
//
// Input is `restaurants.subscription_ends_at` — the denormalized MAX of
// payments.period_end, kept true by a trigger (migration 0016). Never derive
// this from a payments join on the diner path; see that migration's header.
//
// lib/billing.ts stays the owner-panel reporting layer (money, totals, next
// renewal amount). This module is only about ACCESS.

import { bagDayDiff } from '@/lib/billing';

// Days after period_end during which everything still works, loudly warned.
// Owner decision 2026-08-25.
export const GRACE_DAYS = 3;

// How far ahead the tenant starts being warned.
export const WARN_AHEAD_DAYS = 30;

export type SubscriptionStatus =
  // No period_end ever recorded. Treated as ACTIVE — an account is provisioned
  // before its founding payment is entered, and suspending during onboarding
  // would break every new restaurant. Surfaced to the owner as «بلا تجديد».
  | 'none'
  // More than WARN_AHEAD_DAYS remaining.
  | 'active'
  // Within WARN_AHEAD_DAYS of expiry. Still fully working.
  | 'expiring'
  // Past period_end but within GRACE_DAYS. Still fully working, urgent warning.
  | 'grace'
  // Past the grace window. Tenant panel AND diner menu are blocked.
  | 'suspended';

export type SubscriptionState = {
  status: SubscriptionStatus;
  endsAt: string | null;
  // Whole Baghdad-calendar days until expiry. Positive before, 0 on the day,
  // negative after. null when there is no subscription.
  daysLeft: number | null;
  // Days still left in the grace window; only meaningful while status==='grace'.
  graceDaysLeft: number | null;
  // The one flag the enforcement points check.
  isBlocked: boolean;
};

// `nowMs` is injected so server components control the clock and stay
// deterministic — same convention as deriveBilling().
export function deriveSubscription(
  subscriptionEndsAt: string | null,
  nowMs: number,
): SubscriptionState {
  if (!subscriptionEndsAt) {
    return { status: 'none', endsAt: null, daysLeft: null, graceDaysLeft: null, isBlocked: false };
  }

  const endMs = new Date(subscriptionEndsAt).getTime();
  if (Number.isNaN(endMs)) {
    // A corrupt timestamp must never lock a paying restaurant out of its own
    // menu. Fail OPEN here — unlike the rate limiter, the risk of a false
    // block (a dark menu with diners at the table) far outweighs the risk of a
    // few extra days of service.
    return { status: 'none', endsAt: null, daysLeft: null, graceDaysLeft: null, isBlocked: false };
  }

  const daysLeft = bagDayDiff(nowMs, endMs);

  if (daysLeft >= 0) {
    return {
      status: daysLeft <= WARN_AHEAD_DAYS ? 'expiring' : 'active',
      endsAt: subscriptionEndsAt,
      daysLeft,
      graceDaysLeft: null,
      isBlocked: false,
    };
  }

  // Expired. daysLeft is negative; -1 means "yesterday".
  const daysOverdue = -daysLeft;
  if (daysOverdue <= GRACE_DAYS) {
    return {
      status: 'grace',
      endsAt: subscriptionEndsAt,
      daysLeft,
      graceDaysLeft: GRACE_DAYS - daysOverdue + 1,
      isBlocked: false,
    };
  }

  return {
    status: 'suspended',
    endsAt: subscriptionEndsAt,
    daysLeft,
    graceDaysLeft: 0,
    isBlocked: true,
  };
}

// ── owner-panel presentation ──────────────────────────────────────────────
// Distinct from BILLING_STATUS_META in lib/billing.ts on purpose: that one
// describes the MONEY ("متأخّر"), this one describes ACCESS ("موقوف تلقائياً").
// A restaurant can be overdue on money and still inside its grace window.
export const SUBSCRIPTION_STATUS_META: Record<
  SubscriptionStatus,
  { label: string; variant: 'neutral' | 'success' | 'warning' | 'destructive' }
> = {
  none: { label: 'بلا اشتراك', variant: 'neutral' },
  active: { label: 'سارٍ', variant: 'success' },
  expiring: { label: 'ينتهي قريباً', variant: 'warning' },
  grace: { label: 'مهلة', variant: 'warning' },
  suspended: { label: 'موقوف تلقائياً', variant: 'destructive' },
};

// ── plan packages ─────────────────────────────────────────────────────────
// Constrained in the DB by restaurants_plan_check (0016). Annual, IQD.
export const PLANS = ['menu', 'growth', 'growth_pro'] as const;
export type Plan = (typeof PLANS)[number];

export const PLAN_LABEL: Record<Plan, string> = {
  menu: 'Menu — ١٩٩٬٠٠٠',
  growth: 'Growth — ٤٩٩٬٠٠٠',
  growth_pro: 'Growth Pro — ٦٩٩٬٠٠٠',
};

export function isPlan(v: string): v is Plan {
  return (PLANS as readonly string[]).includes(v);
}
