-- 0018 — per-product Closing discount (2026-09-14).
--
-- Closing mode could only ever carry ONE discount for the whole selection
-- (`restaurants.closing_mode_discount`). The owner can now choose:
--
--   • general  — one percentage for every selected product (the old behaviour,
--                and still the default)
--   • specific — a percentage chosen per product
--
-- Design: `restaurants.closing_mode_discount` KEEPS its meaning as the general
-- / fallback percentage and stays NOT NULL while closing is active, so the
-- existing `restaurants_closing_complete_check` constraint and the
-- `revert_closing_mode()` RPC from 0008 need no change. A product only
-- overrides it when `closing_discount_percent` is set.
--
-- Read path: effective = COALESCE(products.closing_discount_percent,
--                                 restaurants.closing_mode_discount)
--
-- Safe / additive: adds one nullable column + one nullable column, no data
-- rewrite. Existing rows read as NULL → identical behaviour to before.
-- Re-runnable.

-- Per-product override. NULL = "use the restaurant-level general discount".
-- Mirrors the tier CHECK on restaurants.closing_mode_discount so a stray value
-- can't reach the diner (the read path defends again — see lib/menu.ts Q-13).
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS closing_discount_percent INTEGER;

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_closing_discount_percent_check;
ALTER TABLE products
  ADD CONSTRAINT products_closing_discount_percent_check
  CHECK (closing_discount_percent IS NULL OR closing_discount_percent IN (5, 10, 20));

-- Which mode the owner picked for the CURRENT closing window. Persisted so
-- reopening the dialog restores the choice instead of silently reverting to
-- "general". Not part of the read path — the COALESCE above is what decides a
-- price — so a stale value can never mis-price an item.
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS closing_discount_mode TEXT NOT NULL DEFAULT 'general';

ALTER TABLE restaurants
  DROP CONSTRAINT IF EXISTS restaurants_closing_discount_mode_check;
ALTER TABLE restaurants
  ADD CONSTRAINT restaurants_closing_discount_mode_check
  CHECK (closing_discount_mode IN ('general', 'specific'));

-- The second half of "add a column to `restaurants`" — the step 0016 missed and
-- 0017 had to repair. 0013 replaced the table-level SELECT grant with an
-- explicit column list (the only way to actually withhold username /
-- password_hash), so a new column lands OUTSIDE that list and is unreadable by
-- anon. Every application read goes through the service-role client, which
-- bypasses column privileges — so this failure is silent everywhere except a
-- production anon read. Granting it here keeps the list complete.
--
-- `products` needs no equivalent: 0013 left that table's grant at table level,
-- so `closing_discount_percent` is already readable.
GRANT SELECT (closing_discount_mode) ON restaurants TO anon, authenticated;

-- Clearing the per-product override belongs with clearing the flag, so an
-- expired window can't leave a stale percentage behind. `is_in_closing_mode`
-- already gates the read path, so this is hygiene rather than a correctness
-- fix — but it keeps the table honest for anyone querying it directly.
CREATE OR REPLACE FUNCTION revert_closing_mode(p_restaurant_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE restaurants
  SET active_mode = 'normal',
      closing_mode_ends_at = NULL,
      closing_mode_discount = NULL
  WHERE id = p_restaurant_id
    AND active_mode = 'closing';

  UPDATE products
  SET is_in_closing_mode = false,
      closing_discount_percent = NULL
  WHERE restaurant_id = p_restaurant_id
    AND is_in_closing_mode = true;
END;
$$;
