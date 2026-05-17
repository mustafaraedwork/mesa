# Closing Mode — Design Decisions

Status: ready-for-human
Date: 2026-05-08
Source: grill-me session against PRD §3.1, §4.3, §4.7, §4.8

This document captures the 12 design decisions resolved before implementation begins. Each decision is final — re-open only if a new constraint contradicts it.

---

## Q1 — Source of truth for discounted price: derived

Discounted prices are computed at read time:

```ts
displayed = roundDiscountedPriceIQD(product.price, restaurant.closing_mode_discount)
```

Never store the discounted price. Never store an `original_price` snapshot. The `products.price` column is always the canonical original price; the discount is recomputed every read.

**Reverting Closing is O(1)** — clear three fields on `restaurants` and flip `is_in_closing_mode=FALSE` on products. No price column to restore.

**Tenant edits price mid-Closing** — the new price flows through the same derivation. No drift.

## Q2 — Rounding: IQD only for MVP

```ts
function roundDiscountedPriceIQD(price: number, discountPct: 5 | 10 | 20): number {
  const raw = price * (1 - discountPct / 100);
  return Math.floor(raw / 250) * 250;
}
```

For non-IQD currencies (USD, AED, SAR, …), use `Math.floor(price * (1 - discountPct / 100))` with no rounding step. Add a per-currency `ROUNDING_STEP` table only when a non-IQD tenant signs up. Don't speculate on conventions for currencies we don't yet serve.

**Why round down**: guarantees the displayed discount is **never less than the advertised percentage**. Example: 3,500 IQD × 0.9 = 3,150 → display 3,000 IQD (effective 14.3% off, exceeds 10% promise).

## Q3 — Auto-revert: lazy on menu read

No cron, no pg_cron, no Coolify scheduler, no webhook. The revert happens inline when `GET /api/menu/:slug` runs:

```sql
-- Pseudocode
IF restaurant.active_mode = 'closing' AND restaurant.closing_mode_ends_at < NOW() THEN
  UPDATE restaurants SET active_mode='normal', closing_mode_ends_at=NULL, closing_mode_discount=NULL WHERE id = $1;
  UPDATE products SET is_in_closing_mode=FALSE WHERE restaurant_id = $1;
END IF;
-- then read the menu as usual
```

The `UPDATE` is idempotent — concurrent reads can't double-revert because the WHERE clause excludes already-reverted rows.

**If no diner reads the menu for an hour after expiry**, the DB stays in `active_mode='closing'`. This is fine: no consumer is being misled. Owner Dashboard handles this with a "expired (pending revert)" indicator.

## Q4 — "عروض اليوم" virtual category

Materialised in the API response, not in the DB. No `categories` row.

**Shape:**

```json
{
  "id": "__closing__",
  "name_ar": "عروض اليوم",
  "name_en": "Today's Deals",
  "name_ku": "ئەمڕۆ تەنزیلات",
  "is_virtual": true,
  "display_order": -1,
  "products": [
    /* every product with is_in_closing_mode=true, full object,
       price computed via Q1 derivation */
  ]
}
```

**Denormalized**: products in the virtual section are sent again as full objects (not just IDs). They also appear in their original category. Frontend stays dumb — for each category, render its `products`.

## Q5 — Diner cart: live prices

`localStorage[mesa-cart-{slug}]` stores only:

```ts
type CartItem = { product_id: string; quantity: number };
```

No `price_at_add`, no snapshot. Every render of the cart pulls the current price from the cached menu JSON. Closing activates → cart total updates on next polling cycle. The "اطلب من الكابتن" screen always quotes the current menu price, matching what the captain will charge.

## Q6 — Mode transitions: unified clean-and-apply rule

A single API endpoint:

```
POST /api/admin/modes
Body: {
  mode: 'normal' | 'rush' | 'profit' | 'closing',
  closing?: { product_ids: string[], discount: 5|10|20, duration_hours: 1..24 }
}
```

Server logic — always inside one transaction:

1. Clear: `closing_mode_ends_at = NULL`, `closing_mode_discount = NULL`, `is_in_closing_mode = FALSE` for all products of this restaurant.
2. Set `active_mode` to the requested value.
3. If `mode === 'closing'`, apply the new closing parameters (also inside the same transaction).

**Client-side warnings** before sending the request:

- **T2 (switching away from active Closing)**: "تفعيل Rush سيُلغي عرض الإغلاق الجاري. متابعة؟"
- **T3 (re-activating Closing while already in Closing)**: "يوجد عرض إغلاق فعّال ينتهي خلال HH:MM:SS. تفعيل عرض جديد سيستبدله. متابعة؟"

**No partial-extend API**, no `PATCH /closing/products`, no `cancel-closing`. The unified endpoint covers all transitions.

## Q7 — Mid-Closing edits

Implicitly handled by Q1's derivation:

| Tenant action | Result |
|---|---|
| Edit price of a Closing product | New discounted price = `floor(newPrice × (1-d) / 250) × 250`. No special handling. |
| Delete a Closing product | `ON DELETE CASCADE` — vanishes from everywhere. |
| Move product to another category | Appears with discount in the new category + in عروض اليوم. |
| Add new product | Defaults `is_in_closing_mode=FALSE`. Doesn't enter عروض اليوم unless tenant re-activates with it included. |

**Unavailable items in عروض اليوم**: respect `restaurants.show_unavailable_items` like the rest of the menu. No special filter.

**No in-place editing of the Closing product list**: changing which products are in Closing requires a full re-activate (Q6 unified rule). The modal pre-fills with current selection so re-activation is one extra click.

## Q8 — Server-side validation on POST /api/admin/modes (Closing)

Reject with 400 if any of:

| Condition | Message |
|---|---|
| `product_ids.length === 0` | "اختر منتجاً واحداً على الأقل" |
| Any product would round to 0 IQD after discount | "هذه المنتجات سعرها صغير جداً للخصم المختار: [name list]" — return `{ offending_ids: [...] }` |
| `discount ∉ {5, 10, 20}` | basic validation |
| `duration_hours ∉ [1, 24]` | basic validation |

Reject with 403 if any product_id doesn't belong to this restaurant.

**Unavailable products are accepted** with a non-blocking warning in the response: `{ ok: true, warnings: ["selected_unavailable_count: N"] }`. The client surfaces "تم اختيار منتجات غير متوفرة. ستظهر في عروض اليوم بـoverlay عند توفّرها".

## Q9 — Diner-side freshness: 30s polling, fix CLAUDE.md

Diner page polls `GET /api/menu/:slug` every **30s**. Mode changes (including Closing activate/expire) propagate within one polling window.

`CLAUDE.md` originally claimed "≤3s" — that was incorrect. Fixed in this session: contract is now "within one polling cycle, ≤30s typical".

**Do not** reach for Supabase Realtime. The PRD's `RULES.md` simplicity-first principle wins. Revisit only if observed UX shows polling is too slow during pilot tenants.

**Optional** small optimization: when tenant changes mode, hit a `/api/cache/bust/:slug` to update the menu's `Last-Modified` timestamp so Service Workers don't serve stale JSON. Not load-bearing.

## Q10 — Tenant dashboard during Closing

**Countdown source of truth**: `restaurants.closing_mode_ends_at` (TIMESTAMPTZ). Fetched once on page load, then `setInterval(1000)` ticks client-side. No per-second polling.

**Expired but not yet reverted** (Q3 lazy): the client detects `now > ends_at` and displays "انتهى — في انتظار التحديث". The DB self-cleans on the next diner read (or when the tenant navigates the dashboard, which also reads restaurant state and triggers lazy revert). No `revert-if-expired` endpoint.

**Multi-device drift**: tenant dashboard polls `GET /api/admin/state` every **10s**. Returns only `active_mode + closing_mode_*` (small payload). Last-write-wins on conflicts; no optimistic locking.

## Q11 — Diner-side display

**Section name**: comes from the API (Q4) as `name_ar / name_en / name_ku`. Translations are server-controlled constants, editable without redeploying the client. The client treats `__closing__` like any other category.

**Position**: always first (`display_order: -1`). Even if a tenant has reordered their categories, عروض اليوم is on top.

**Price display**: in both عروض اليوم AND the original category, render `~~12,000~~ 9,500 IQD` plus a `-20%` badge in `#DC2626` (Closing badge color from PRD §10.ب). PRD §3.1 requires "بنفس السعر المخفض ... لتسهيل الإيجاد" in original categories, so visual treatment must be identical.

**Defensive**: if `is_in_closing_mode=TRUE` but `active_mode !== 'closing'` (impossible by design but defensive), the API ignores the flag and returns the original price. Prevents inconsistent state from leaking discounts.

## Q12 — Time correctness

**`ends_at` computation**: server computes from `duration_hours` (`NOW() + INTERVAL '$x hours'`). Retry on network failure could extend the timer by a few seconds — accepted as rare MVP edge case. If observed often in production, switch to client-computed `ends_at` (idempotent retry) without breaking the API.

**Client clock for countdown**: `GET /api/menu/:slug` and `GET /api/admin/state` both return `server_now: ISO8601`. Client computes `offset = server_now - client_now` once on page load, then renders countdown as `ends_at - (Date.now() + offset)`. Corrects for tenant devices with wrong system time.

---

## Implementation surface

**API endpoints (3):**

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/admin/modes` | All mode transitions (Q6) — clean-and-apply transaction |
| `GET` | `/api/menu/:slug` | Public menu read — applies lazy revert (Q3), returns virtual category (Q4) |
| `GET` | `/api/admin/state` | Tenant 10s polling endpoint (Q10) — small payload |

**SQL migrations**: none beyond the schema in PRD §4.3.

**Client modules:**

```
lib/closing.ts                          # roundDiscountedPriceIQD, ROUNDING_STEP, virtual constants
app/admin/modes/closing-modal.tsx       # multi-select + discount + duration + warnings (Q6)
app/admin/modes/countdown.tsx           # with server-now offset (Q12)
app/r/[slug]/menu/closing-section.tsx   # virtual section render
app/r/[slug]/menu/price-display.tsx     # strikethrough + -20% badge in both locations (Q11)
```

**i18n constants** (server-side, in API route):

```ts
export const CLOSING_VIRTUAL_CATEGORY_NAMES = {
  name_ar: 'عروض اليوم',
  name_en: "Today's Deals",
  name_ku: 'ئەمڕۆ تەنزیلات',
} as const;
```

---

## Out of scope (don't build)

- Per-currency rounding table (deferred until a non-IQD tenant signs up — Q2)
- `PATCH /closing/products` for in-place edits (Q7-ب-1)
- `POST /api/admin/modes/cancel-closing` (Q6 — unified endpoint covers it)
- `POST /api/admin/modes/revert-if-expired` (Q3 — lazy revert is sufficient)
- Supabase Realtime subscription (Q9 — polling first, Realtime only if needed)
- Optimistic locking on multi-device writes (Q10 — last-write-wins is fine)
- Idempotency-Key header (Q12 — retry-extension is acceptable MVP risk)
- Audit log of activations / expirations (out of scope per PRD §8 — no sales reports)

---

## Comments

(empty — append future review notes here)
