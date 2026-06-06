-- 0011 — owner billing + soft-delete (2026-06-06, OWNER-PANEL-PLAN.md).
-- Model C (hybrid): one flexible `payments` ledger, no separate subscriptions
-- table. `branch_count` is a PRICING counter only — no multi-branch features.
-- NO audit_log table — RULES.md §2 ("لا audit logs") stays in force.
--
-- ⚠️ NO automated migration channel in this project. Apply MANUALLY via the
-- Supabase SQL editor (or `supabase db push` once linked). Every statement here
-- is additive + idempotent and safe to re-run; none can fail on existing data
-- (all new columns are nullable or have a default that matches current rows).
-- Verification queries are at the bottom of OWNER-PANEL-PLAN.md / the handoff.

-- ─────────────────── restaurants: billing + soft-delete ───────────────────
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS plan         TEXT,
  ADD COLUMN IF NOT EXISTS branch_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ;

-- branch_count is a pricing tier, always ≥ 1.
ALTER TABLE restaurants
  DROP CONSTRAINT IF EXISTS restaurants_branch_count_check;
ALTER TABLE restaurants
  ADD CONSTRAINT restaurants_branch_count_check CHECK (branch_count >= 1);

-- Owner list / public reads filter on deleted_at constantly; index the live rows.
CREATE INDEX IF NOT EXISTS idx_restaurants_live
  ON restaurants (created_at) WHERE deleted_at IS NULL;

-- ─────────────────────────── payments (ledger) ───────────────────────────
-- One row per payment the owner records manually (offline). `period_end` (when
-- present) drives the derived "next renewal / overdue" — computed at READ time
-- in the owner panel, NOT by any cron (mirrors the closing-mode lazy-revert).
CREATE TABLE IF NOT EXISTS payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('initial','renewal','adjustment')),
  amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency      TEXT NOT NULL,            -- validated app-side (isSupportedCurrency)
  paid_at       TIMESTAMPTZ NOT NULL,     -- when the money was actually received
  period_start  TIMESTAMPTZ,              -- optional licence window start
  period_end    TIMESTAMPTZ,              -- optional → feeds "next renewal"
  note          TEXT,                     -- manual reference (transfer/receipt id)
  recorded_by   UUID,                     -- owner auth.users id
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payments_period_order_check
    CHECK (period_start IS NULL OR period_end IS NULL OR period_end > period_start)
);

CREATE INDEX IF NOT EXISTS idx_payments_restaurant_paid
  ON payments (restaurant_id, paid_at DESC);
-- Renewal/overdue scans look at the latest period_end per restaurant.
CREATE INDEX IF NOT EXISTS idx_payments_period_end
  ON payments (period_end) WHERE period_end IS NOT NULL;

-- RLS: owner-only, same shape as `events` (0003). No anon/authenticated/tenant
-- policy at all → financial data never leaks. The app reads/writes via the
-- service-role client (bypasses RLS); this policy is defence-in-depth.
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner full access" ON payments;
CREATE POLICY "Owner full access" ON payments
  FOR ALL USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'owner');

-- ───────────── public read policies must respect deleted_at ─────────────
-- Soft-deleted restaurants disappear from every public (anon) read, exactly
-- like inactive ones. All existing rows have deleted_at = NULL, so behaviour is
-- identical for current data — this only ever hides a future soft-delete.

DROP POLICY IF EXISTS "Public read active" ON restaurants;
CREATE POLICY "Public read active" ON restaurants
  FOR SELECT USING (is_active = TRUE AND deleted_at IS NULL);

DROP POLICY IF EXISTS "Public read" ON categories;
CREATE POLICY "Public read" ON categories
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE id = categories.restaurant_id
        AND is_active = TRUE AND deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Public read" ON products;
CREATE POLICY "Public read" ON products
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE id = products.restaurant_id
        AND is_active = TRUE AND deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Public read" ON complementary_categories;
CREATE POLICY "Public read" ON complementary_categories
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE id = complementary_categories.restaurant_id
        AND is_active = TRUE AND deleted_at IS NULL
    )
  );
