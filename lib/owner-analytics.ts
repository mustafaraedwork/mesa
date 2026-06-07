// Owner (platform) business analytics — pure aggregations over restaurants +
// payments. No DB, no React. Per-currency throughout (no FX); the page decides
// presentation. Months are Baghdad-local (see monthKey).

import {
  monthKey,
  BAGHDAD_OFFSET_MS,
  type PaymentRow,
  type CurrencyTotal,
  type RestaurantBilling,
} from './billing';

export type RestaurantMeta = {
  id: string;
  created_at: string;
  is_active: boolean | null;
  deleted_at: string | null;
  plan: string | null;
  branch_count: number;
  currency: string;
};

// ── restaurant counts ─────────────────────────────────────────────────────
export type RestaurantCounts = { total: number; active: number; suspended: number; deleted: number };

export function countRestaurants(rs: RestaurantMeta[]): RestaurantCounts {
  let active = 0;
  let suspended = 0;
  let deleted = 0;
  for (const r of rs) {
    if (r.deleted_at) deleted++;
    else if (r.is_active) active++;
    else suspended++;
  }
  return { total: rs.length, active, suspended, deleted };
}

// ── month helpers ─────────────────────────────────────────────────────────
// Last N months as 'YYYY-MM', chronological (oldest → current), Baghdad-local.
export function recentMonths(nowMs: number, n: number): string[] {
  const d = new Date(nowMs + BAGHDAD_OFFSET_MS);
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth(); // 0-based
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(`${y}-${String(m + 1).padStart(2, '0')}`);
    m--;
    if (m < 0) {
      m = 11;
      y--;
    }
  }
  return out.reverse();
}

export type MonthCount = { month: string; count: number };

// New restaurants per month within the given window (older rows ignored).
export function newRestaurantsByMonth(rs: RestaurantMeta[], months: string[]): MonthCount[] {
  const counts = new Map<string, number>(months.map((m) => [m, 0]));
  for (const r of rs) {
    const k = monthKey(r.created_at);
    if (counts.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return months.map((m) => ({ month: m, count: counts.get(m) ?? 0 }));
}

export type MonthRevenue = { month: string; initial: number; renewal: number; adjustment: number; total: number };

// Revenue series for ONE currency across the given months (founding vs renewal).
export function revenueByMonthForCurrency(
  payments: PaymentRow[],
  currency: string,
  months: string[],
): MonthRevenue[] {
  const map = new Map<string, MonthRevenue>(
    months.map((m) => [m, { month: m, initial: 0, renewal: 0, adjustment: 0, total: 0 }]),
  );
  for (const p of payments) {
    if (p.currency !== currency) continue;
    const row = map.get(monthKey(p.paid_at));
    if (!row) continue;
    row[p.kind] += p.amount;
    row.total += p.amount;
  }
  return months.map((m) => map.get(m)!);
}

export type MonthTotal = { month: string; total: number };

// Highest-grossing months for a currency (across all history).
export function topRevenueMonths(payments: PaymentRow[], currency: string, n: number): MonthTotal[] {
  const map = new Map<string, number>();
  for (const p of payments) {
    if (p.currency !== currency) continue;
    map.set(monthKey(p.paid_at), (map.get(monthKey(p.paid_at)) ?? 0) + p.amount);
  }
  return [...map.entries()]
    .map(([month, total]) => ({ month, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, n);
}

// ── averages ──────────────────────────────────────────────────────────────
export type CurrencyAvg = { currency: string; total: number; avg: number };

// Average revenue per restaurant, per currency (total ÷ restaurant count).
export function avgRevenuePerRestaurant(totals: CurrencyTotal[], restaurantCount: number): CurrencyAvg[] {
  return totals.map((t) => ({
    currency: t.currency,
    total: t.total,
    avg: restaurantCount > 0 ? t.total / restaurantCount : 0,
  }));
}

// ── renewal outlook (cumulative 30/60/90 + overdue) ───────────────────────
export type CurrencyAmount = { currency: string; amount: number; count: number };
export type RenewalBucket = { count: number; byCurrency: CurrencyAmount[] };
export type RenewalOutlook = { overdue: RenewalBucket; d30: RenewalBucket; d60: RenewalBucket; d90: RenewalBucket };

export function renewalOutlook(billings: RestaurantBilling[]): RenewalOutlook {
  const mk = () => new Map<string, { amount: number; count: number }>();
  const overdue = mk();
  const d30 = mk();
  const d60 = mk();
  const d90 = mk();
  const counts = { overdue: 0, d30: 0, d60: 0, d90: 0 };
  const add = (m: Map<string, { amount: number; count: number }>, cur: string, amt: number) => {
    const e = m.get(cur) ?? { amount: 0, count: 0 };
    e.amount += amt;
    e.count += 1;
    m.set(cur, e);
  };

  for (const b of billings) {
    if (b.currentPeriodEnd == null || b.daysToRenewal == null) continue;
    const cur = b.nextRenewalCurrency ?? 'IQD';
    const amt = b.nextRenewalAmount ?? 0;
    if (b.daysToRenewal < 0) {
      add(overdue, cur, amt);
      counts.overdue++;
    } else {
      if (b.daysToRenewal <= 90) {
        add(d90, cur, amt);
        counts.d90++;
      }
      if (b.daysToRenewal <= 60) {
        add(d60, cur, amt);
        counts.d60++;
      }
      if (b.daysToRenewal <= 30) {
        add(d30, cur, amt);
        counts.d30++;
      }
    }
  }

  const toArr = (m: Map<string, { amount: number; count: number }>): CurrencyAmount[] =>
    [...m.entries()].map(([currency, v]) => ({ currency, amount: v.amount, count: v.count }));

  return {
    overdue: { count: counts.overdue, byCurrency: toArr(overdue) },
    d30: { count: counts.d30, byCurrency: toArr(d30) },
    d60: { count: counts.d60, byCurrency: toArr(d60) },
    d90: { count: counts.d90, byCurrency: toArr(d90) },
  };
}

// ── breakdowns ────────────────────────────────────────────────────────────
export type PlanBreakdown = { plan: string; count: number; byCurrency: CurrencyTotal[] };

// Revenue + restaurant count grouped by plan (deleted restaurants excluded from
// counts; their historical payments still count toward revenue).
export function revenueByPlan(rs: RestaurantMeta[], payments: PaymentRow[]): PlanBreakdown[] {
  const planOf = new Map(rs.map((r) => [r.id, r.plan?.trim() || 'بلا خطة']));
  const counts = new Map<string, number>();
  for (const r of rs) {
    if (r.deleted_at) continue;
    const p = r.plan?.trim() || 'بلا خطة';
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  const rev = new Map<string, Map<string, { total: number; count: number }>>();
  for (const p of payments) {
    const plan = planOf.get(p.restaurant_id) ?? 'بلا خطة';
    const byCur = rev.get(plan) ?? new Map();
    const e = byCur.get(p.currency) ?? { total: 0, count: 0 };
    e.total += p.amount;
    e.count += 1;
    byCur.set(p.currency, e);
    rev.set(plan, byCur);
  }
  const plans = new Set<string>([...counts.keys(), ...rev.keys()]);
  return [...plans]
    .map((plan) => ({
      plan,
      count: counts.get(plan) ?? 0,
      byCurrency: [...(rev.get(plan)?.entries() ?? [])]
        .map(([currency, v]) => ({ currency, total: v.total, count: v.count }))
        .sort((a, b) => b.total - a.total),
    }))
    .sort((a, b) => b.count - a.count);
}

export type BranchBreakdown = { branches: number; count: number };

// Restaurant count grouped by branch_count (non-deleted), ascending.
export function byBranchCount(rs: RestaurantMeta[]): BranchBreakdown[] {
  const m = new Map<number, number>();
  for (const r of rs) {
    if (r.deleted_at) continue;
    const b = r.branch_count ?? 1;
    m.set(b, (m.get(b) ?? 0) + 1);
  }
  return [...m.entries()].map(([branches, count]) => ({ branches, count })).sort((a, b) => a.branches - b.branches);
}
