-- 0005 — Chef's Picks (is_chef_pick) for Normal mode.
-- A curated, no-discount selection the owner edits from the modes tab. It
-- surfaces in the "اختيارات الشيف" virtual category at the top of the diner
-- menu while in Normal mode. (Closing mode keeps its own virtual category
-- driven by is_in_closing_mode + discount — the two never coexist.)

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_chef_pick BOOLEAN NOT NULL DEFAULT FALSE;
