-- 0009 — DB hardening (2026-06-01, SECURITY-FINDINGS M-3 / M-4 / M-5).
-- Every statement here is safe / additive (indexes, a trigger, a column-level
-- privilege revoke) and re-runnable. NOTE: this project has no automated
-- migration channel — apply manually via the Supabase SQL editor or
-- `supabase db push`.

-- M-5: index complementary_categories by restaurant_id (every diner load filters
-- on it), plus partial indexes for the mode-transition bulk UPDATEs.
CREATE INDEX IF NOT EXISTS idx_complementary_restaurant
  ON complementary_categories (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_products_in_closing
  ON products (restaurant_id) WHERE is_in_closing_mode = true;
CREATE INDEX IF NOT EXISTS idx_products_chef_pick
  ON products (restaurant_id) WHERE is_chef_pick = true;

-- M-4: enforce the 2-level category invariant in the database. App code already
-- checks it; this trigger makes it structural. Rejects a row whose parent is
-- itself a child. Only affects future INSERT/UPDATE, so it cannot fail on
-- existing data.
CREATE OR REPLACE FUNCTION categories_enforce_two_levels()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM categories
      WHERE id = NEW.parent_id AND parent_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'categories are 2-level only: parent % is already a child', NEW.parent_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_categories_two_levels ON categories;
CREATE TRIGGER trg_categories_two_levels
  BEFORE INSERT OR UPDATE OF parent_id ON categories
  FOR EACH ROW EXECUTE FUNCTION categories_enforce_two_levels();

-- M-3: the platform owner (the `authenticated` role, gated by the "Owner full
-- access" RLS policy) has no functional need to read the raw session token.
-- Revoke column-level SELECT on it from anon/authenticated. The app's
-- service-role client bypasses this and still reads it for session validation.
REVOKE SELECT (token) ON tenant_sessions FROM anon, authenticated;
