// Closing Mode pure utilities + constants. Source: .scratch/closing-mode/design-decisions.md.
//
// All discounted prices are derived at read time (Q1). The DB never stores
// `original_price` snapshots, only the canonical `products.price` and a
// boolean `is_in_closing_mode` flag. Reverting Closing is therefore O(1):
// clear three columns on `restaurants` + flip the flag on products.

export type Mode = 'normal' | 'rush' | 'profit' | 'closing';
export type Discount = 5 | 10 | 20;

export const MODES = ['normal', 'rush', 'profit', 'closing'] as const;
export const DISCOUNTS = [5, 10, 20] as const;

export const CLOSING_VIRTUAL_CATEGORY_ID = '__closing__';
// Diner-facing label — keeps the "current mode" generic so customers don't
// see the word "closing". Discount overlays on the cards still show the
// actual deal visually.
export const CLOSING_VIRTUAL_CATEGORY_NAMES = {
  name_ar: 'اختيارات الشيف',
  name_en: "Chef's Picks",
  name_ku: 'هەڵبژاردنی شێف',
} as const;

// IQD-only rounding step. Floor to nearest 250 ensures effective discount
// is never less than the advertised percentage (Q2 — example: 3,500 × 0.9 =
// 3,150 → display 3,000 IQD, effective 14.3% off, exceeds 10% promise).
const IQD_ROUNDING_STEP = 250;

export function roundDiscountedPriceIQD(price: number, discountPct: Discount): number {
  const raw = price * (1 - discountPct / 100);
  return Math.floor(raw / IQD_ROUNDING_STEP) * IQD_ROUNDING_STEP;
}

// Currency-aware discount application. Per Q2: only IQD has a rounding step
// for MVP. Add other currency steps to ROUNDING_STEPS only when a non-IQD
// tenant signs up — speculation is forbidden.
const ROUNDING_STEPS: Partial<Record<string, number>> = {
  IQD: IQD_ROUNDING_STEP,
};

export function applyDiscount(price: number, discountPct: Discount, currency: string): number {
  const step = ROUNDING_STEPS[currency];
  const raw = price * (1 - discountPct / 100);
  if (step) return Math.floor(raw / step) * step;
  return Math.floor(raw);
}
