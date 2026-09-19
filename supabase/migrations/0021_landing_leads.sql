-- 0021 — landing-page leads (2026-09-19).
--
-- The WhatsApp buttons on biziii.io open a small modal first (name + phone);
-- what the visitor types lands here through the server-only `/api/leads`
-- route, together with the Meta attribution bits (fbclid, biz_uid visitor id)
-- so a later paying restaurant can be tied back to the ad that brought it.
--
-- Access shape as events / ratings: RLS on, owner-only policy, no grant for
-- anon/authenticated — inserts and reads go through the service-role client.
--
-- Safe / additive. Re-runnable.

CREATE TABLE IF NOT EXISTS landing_leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  phone           TEXT NOT NULL CHECK (char_length(phone) BETWEEN 5 AND 32),
  source_url      TEXT CHECK (source_url IS NULL OR char_length(source_url) <= 2048),
  fbclid          TEXT CHECK (fbclid IS NULL OR char_length(fbclid) <= 512),
  biz_uid         UUID,
  user_agent      TEXT CHECK (user_agent IS NULL OR char_length(user_agent) <= 512),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The 24-hour duplicate check looks a phone up by recency.
CREATE INDEX IF NOT EXISTS idx_landing_leads_phone_created
  ON landing_leads (phone, created_at DESC);

ALTER TABLE landing_leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner full access" ON landing_leads;
CREATE POLICY "Owner full access" ON landing_leads
  FOR ALL USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'owner');

REVOKE ALL ON landing_leads FROM anon, authenticated;
