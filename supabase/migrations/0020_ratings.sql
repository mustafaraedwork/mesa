-- 0020 — diner ratings (2026-09-18).
--
-- The diner menu gets a «تقييم» button in the header; it opens a bottom sheet
-- with three 1–5 star scores (staff, service, cleanliness), a 1–5 face for the
-- overall experience, and optional name / phone / comment. One row per
-- submission. Writes flow through the public, rate-limited `/api/rate` route
-- (service role); reads through the tenant «التقييمات» tab (service role).
--
-- Same access shape as events (0003) and login_attempts (0015): RLS on, the
-- only policy is the owner's, and anon/authenticated hold no grant at all.
--
-- Safe / additive. Re-runnable.

CREATE TABLE IF NOT EXISTS ratings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  staff_score     SMALLINT NOT NULL CHECK (staff_score BETWEEN 1 AND 5),
  service_score   SMALLINT NOT NULL CHECK (service_score BETWEEN 1 AND 5),
  clean_score     SMALLINT NOT NULL CHECK (clean_score BETWEEN 1 AND 5),
  overall_score   SMALLINT NOT NULL CHECK (overall_score BETWEEN 1 AND 5),
  name            TEXT CHECK (name IS NULL OR char_length(name) <= 80),
  phone           TEXT CHECK (phone IS NULL OR char_length(phone) <= 32),
  comment         TEXT CHECK (comment IS NULL OR char_length(comment) <= 1000),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The tenant tab lists a restaurant's ratings newest first.
CREATE INDEX IF NOT EXISTS idx_ratings_restaurant_created
  ON ratings (restaurant_id, created_at DESC);

ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner full access" ON ratings;
CREATE POLICY "Owner full access" ON ratings
  FOR ALL USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'owner');

-- Defence in depth on top of RLS (see 0015): a diner's phone number and
-- comment are nobody's business but the restaurant's.
REVOKE ALL ON ratings FROM anon, authenticated;
