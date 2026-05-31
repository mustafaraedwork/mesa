-- 0006 — "off" display state (owner decision 2026-05-26).
-- A third active_mode that shows the diner a plain menu: no Closing offers and
-- no Chef's Picks section/heading. Used to switch off all mode decorations
-- without deactivating the whole restaurant (that's `is_active`).

ALTER TABLE restaurants DROP CONSTRAINT IF EXISTS restaurants_active_mode_check;
ALTER TABLE restaurants
  ADD CONSTRAINT restaurants_active_mode_check
  CHECK (active_mode IN ('normal', 'closing', 'off'));
