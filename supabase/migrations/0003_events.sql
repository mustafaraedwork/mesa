-- Mesa OS Lite — analytics events
-- Source: .scratch/analytics/plan.md
--
-- One row per tracked diner action. Engagement analytics only (menu opens,
-- product opens, add-to-cart) — not sales reporting. Writes flow through the
-- service-role `/api/track` route; reads through the tenant analytics page
-- (also service role). No public RLS policy — same pattern as tenant_sessions.

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('menu_open', 'product_open', 'product_add')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Analytics queries always filter by restaurant + a recent time window.
CREATE INDEX idx_events_restaurant_created ON events(restaurant_id, created_at);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full access" ON events
  FOR ALL USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'owner');
