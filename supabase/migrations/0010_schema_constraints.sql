-- 0010 — schema constraints (2026-06-01, SECURITY-FINDINGS M-6).
-- ⚠️ NEEDS MANUAL APPLICATION + DATA VERIFICATION. Unlike 0009 these can FAIL on
-- pre-existing data. Run the pre-flight checks first; both must return 0 rows:
--
--   -- duplicate complement links (should be none — category UUIDs are global):
--   SELECT restaurant_id, category_id, complement_id, count(*)
--     FROM complementary_categories
--     GROUP BY 1, 2, 3 HAVING count(*) > 1;
--
--   -- closing windows missing discount/end time:
--   SELECT id FROM restaurants
--     WHERE active_mode = 'closing'
--       AND (closing_mode_discount IS NULL OR closing_mode_ends_at IS NULL);
--
-- Also: the existing UNIQUE constraint was created inline in 0001 and its
-- auto-generated name may differ from the DROP below — verify with
-- `\d complementary_categories` and adjust the constraint name if the DROP is a
-- no-op (otherwise both the old and new constraints will coexist harmlessly).

-- M-6a: scope the complementary-link uniqueness by restaurant.
ALTER TABLE complementary_categories
  DROP CONSTRAINT IF EXISTS complementary_categories_category_id_complement_id_key;
ALTER TABLE complementary_categories
  DROP CONSTRAINT IF EXISTS complementary_categories_uniq;
ALTER TABLE complementary_categories
  ADD CONSTRAINT complementary_categories_uniq
  UNIQUE (restaurant_id, category_id, complement_id);

-- M-6b: a closing window must always carry its discount + end time.
ALTER TABLE restaurants
  DROP CONSTRAINT IF EXISTS restaurants_closing_complete_check;
ALTER TABLE restaurants
  ADD CONSTRAINT restaurants_closing_complete_check
  CHECK (
    active_mode <> 'closing'
    OR (closing_mode_discount IS NOT NULL AND closing_mode_ends_at IS NOT NULL)
  );
