-- 0007 — owner-customizable design colors (2026-05-26).
-- Three optional colors on top of the existing primary/background. NULL means
-- "use the default" — the app resolves: header → background_color, card →
-- #ffffff, text → #1a1a1a, so existing restaurants look identical until the
-- owner customizes them in the design tab.

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS header_color TEXT,
  ADD COLUMN IF NOT EXISTS card_color TEXT,
  ADD COLUMN IF NOT EXISTS text_color TEXT;
