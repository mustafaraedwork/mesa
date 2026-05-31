-- 0004 — Retire the Rush and Profit smart modes (owner decision 2026-05-26).
-- Only Normal + Closing survive. `profit_percentage` / `prep_time_minutes`
-- remain as product fields (owner-facing); only the re-ranking MODES are gone.
--
-- Migrations are append-only: 0001 keeps the original 4-value CHECK as history.

-- Normalize any restaurant still parked in a retired mode.
UPDATE restaurants
SET active_mode = 'normal'
WHERE active_mode IN ('rush', 'profit');

-- Tighten the allowed set to the two surviving modes.
ALTER TABLE restaurants DROP CONSTRAINT IF EXISTS restaurants_active_mode_check;
ALTER TABLE restaurants
  ADD CONSTRAINT restaurants_active_mode_check
  CHECK (active_mode IN ('normal', 'closing'));

