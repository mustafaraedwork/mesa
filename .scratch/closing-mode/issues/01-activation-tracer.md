# Closing Mode — activation tracer

Status: ready-for-agent
Date: 2026-05-08
Source: `.scratch/closing-mode/design-decisions.md` (Q1, Q2, Q4, Q5, Q6, Q8, Q11)

## What to build

End-to-end Closing Mode activation: a tenant selects ≥1 product at 5/10/20% off for 1–24 hours, hits a single endpoint, and a diner viewing `/r/:slug` immediately (within one polling cycle) sees a "عروض اليوم" section at the top of the menu plus struck-through prices with a `-20%` badge in each product's original category. Includes the unified mode-transition contract for *all* modes (the trivial branches for `normal | rush | profit` plus the closing branch), client-side confirmation dialogs for risky transitions, and full request validation.

The discounted price is **derived at read time**, never stored:

```ts
function roundDiscountedPriceIQD(price: number, discountPct: 5 | 10 | 20): number {
  const raw = price * (1 - discountPct / 100);
  return Math.floor(raw / 250) * 250;
}
```

For non-IQD currencies (none yet onboarded), `Math.floor(price * (1 - discountPct/100))` with no rounding step. The `products.price` column is canonical and untouched.

The unified endpoint:

```
POST /api/admin/modes
Body: {
  mode: 'normal' | 'rush' | 'profit' | 'closing',
  closing?: { product_ids: string[], discount: 5|10|20, duration_hours: 1..24 }
}
```

Server logic runs inside one transaction: (1) clear `closing_mode_ends_at`, `closing_mode_discount`, and `is_in_closing_mode=FALSE` for all this restaurant's products; (2) set `active_mode`; (3) if closing, apply new closing parameters. `ends_at = NOW() + INTERVAL '$x hours'` (server-computed).

The virtual category in the `GET /api/menu/:slug` response — never persisted to the DB:

```json
{
  "id": "__closing__",
  "name_ar": "عروض اليوم",
  "name_en": "Today's Deals",
  "name_ku": "ئەمڕۆ تەنزیلات",
  "is_virtual": true,
  "display_order": -1,
  "products": [ /* full denormalized product objects with derived prices */ ]
}
```

Same products also appear in their original category with the discounted price. Cart stores only `{ product_id, quantity }` and pulls live prices from the cached menu JSON — no `price_at_add` snapshot.

**Defensive read rule (Q11)**: if `products.is_in_closing_mode = TRUE` but `restaurants.active_mode !== 'closing'`, the API ignores the flag and returns the original price.

**Client-side warnings before POST**:
- T2 — switching away from active Closing: "تفعيل Rush سيُلغي عرض الإغلاق الجاري. متابعة؟"
- T3 — re-activating Closing while one is running: "يوجد عرض إغلاق فعّال ينتهي خلال HH:MM:SS. تفعيل عرض جديد سيستبدله. متابعة؟"

**Server-side validation (Q8)** rejects with `400` on: empty `product_ids` ("اختر منتجاً واحداً على الأقل"); any product whose discounted price rounds to 0 IQD ("هذه المنتجات سعرها صغير جداً للخصم المختار: [name list]" + body `{ offending_ids: [...] }`); `discount ∉ {5,10,20}`; `duration_hours ∉ [1,24]`. Rejects with `403` if any `product_id` does not belong to the authenticated tenant. Unavailable products are **accepted** with a non-blocking response warning `{ ok: true, warnings: ["selected_unavailable_count: N"] }`; the modal surfaces "تم اختيار منتجات غير متوفرة. ستظهر في عروض اليوم بـoverlay عند توفّرها".

## Acceptance criteria

- [ ] `lib/closing.ts` exports `roundDiscountedPriceIQD` plus virtual-category constants; unit tests cover 5/10/20% with edge cases (price 250, 500, 3500 IQD; non-multiple-of-250 results)
- [ ] `POST /api/admin/modes` accepts all four mode values; closing payload runs inside a single transaction
- [ ] All Q8 rejection paths return the documented Arabic messages and HTTP codes; cross-tenant `product_id` returns 403
- [ ] Selecting unavailable products returns `200` with `warnings: ["selected_unavailable_count: N"]`
- [ ] `GET /api/menu/:slug` returns the `__closing__` virtual category at `display_order: -1` when `active_mode='closing'`; products appear once in the virtual section and once in their original category, both with derived prices
- [ ] Defensive Q11 rule: setting `is_in_closing_mode=TRUE` directly in the DB while `active_mode='normal'` does not leak a discount through the menu API
- [ ] Tenant modal: multi-select products + 5/10/20% radio + 1–24h slider + Activate button; confirms T2 when current mode is Closing and the user picks a non-Closing mode; confirms T3 when re-activating Closing during an active Closing
- [ ] Diner UI renders `~~12,000~~ 9,500 IQD` plus a `-20%` badge in `#DC2626` for each Closing product, in both the virtual section and its original category
- [ ] Diner cart stores `{ product_id, quantity }` only; activating Closing while a cart is non-empty updates totals on the next polling cycle without manual refresh

## Blocked by

None — can start immediately. (External dependency: the diner menu route `/r/:slug` and `GET /api/menu/:slug` foundation are assumed shipped as part of Phase 3.)

## Comments

(empty)
