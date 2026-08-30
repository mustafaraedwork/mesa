-- 0016 — subscription enforcement: denormalized expiry + plan constraint
-- (2026-08-30, owner decision 2026-08-25: annual subscription, not one-time).
--
-- ⚠️ THIS MIGRATION CAN SUSPEND RESTAURANTS. Read section "BLAST RADIUS" and
-- run the pre-flight before applying.
--
-- ── THE DECISION IT IMPLEMENTS ─────────────────────────────────────────────
-- BIZIII Menu is sold as an ANNUAL SUBSCRIPTION. `prd.md`'s "one-time
-- purchase" wording is void. Expiry behaviour:
--   • 3-day grace after period_end — everything keeps working, tenant sees an
--     escalating warning with a countdown;
--   • after the third day — FULL suspension: tenant dashboard AND the public
--     diner menu, until a new payment extends period_end;
--   • recording that payment restores everything instantly, no other step.
--
-- ── SOURCE OF TRUTH: WHY A COLUMN, NOT A JOIN ──────────────────────────────
-- Two options were on the table.
--
--   (A) Derive from payments at read time: MAX(period_end) per restaurant.
--       Correct by construction, zero new state. But the diner menu is the
--       hottest read in the product — `loadMenu()` runs on every page load AND
--       on a 30-second poll for every open device. Adding a second table to
--       that path means an extra round trip per diner per 30s, forever, on
--       serverless, to answer a question whose answer changes a few times a
--       YEAR. That is the wrong trade.
--
--   (B) Denormalize onto restaurants.subscription_ends_at. `loadMenu()`
--       already SELECTs from restaurants, so enforcement costs ZERO extra
--       queries — one more column on a row we were fetching anyway.
--
-- (B) is implemented. Its only real risk is drift, so the column is NOT
-- maintained by application code — a TRIGGER on `payments` recomputes it on
-- every INSERT / UPDATE / DELETE. The app cannot forget to update it, and a
-- payment recorded by hand in the SQL editor stays correct too. Denormalized
-- for speed, trigger-maintained for truth.
--
-- The owner panel keeps using lib/billing.ts's read-time derivation for its
-- richer reporting (totals, next amount, per-currency). This column exists for
-- the ENFORCEMENT path only. They read the same underlying data.
--
-- ── "NO PAYMENTS AT ALL" IS EXPLICITLY NOT SUSPENDED ───────────────────────
-- A restaurant with no payments row has subscription_ends_at = NULL. NULL
-- means "no subscription recorded", which the application treats as ACTIVE,
-- never as expired. This is deliberate: the owner provisions an account first
-- and records the founding payment afterwards, so suspending on NULL would
-- break every account during onboarding. The owner panel flags these as
-- «بلا تجديد» so they are visible, not silently ignored.
--
-- ── is_active STAYS INDEPENDENT ────────────────────────────────────────────
-- Manual owner suspension (`is_active = false`) and automatic expiry
-- suspension (derived from this column) are DIFFERENT reasons and are not
-- merged. The owner can tell them apart in their panel, and reactivating one
-- does not silently clear the other.
--
-- SAFE / ADDITIVE / RE-RUNNABLE. Adds one nullable column, one function, one
-- trigger; the plan CHECK is guarded and reports instead of failing.
-- NOTE: this project has no automated migration channel — apply manually via
-- the Supabase SQL editor or `supabase db push`.

-- ════════════════════════════════════════════════════════════════════════════
-- BLAST RADIUS — RUN THIS FIRST, BEFORE ANYTHING BELOW
-- ════════════════════════════════════════════════════════════════════════════
-- Tells you exactly who is affected the moment the code ships. Read-only.
--
--   SELECT r.slug,
--          r.plan,
--          max(p.period_end)                                   AS ends_at,
--          CASE
--            WHEN max(p.period_end) IS NULL           THEN 'no subscription -> stays ACTIVE'
--            WHEN max(p.period_end) > now()           THEN 'active'
--            WHEN max(p.period_end) > now() - interval '3 days'
--                                                     THEN '*** GRACE (warned, still working) ***'
--            ELSE                                          '*** WILL BE SUSPENDED ***'
--          END                                                 AS effect
--     FROM restaurants r
--     LEFT JOIN payments p ON p.restaurant_id = r.id
--    WHERE r.deleted_at IS NULL
--    GROUP BY r.id, r.slug, r.plan
--    ORDER BY 4, 1;
--
-- Anything marked SUSPENDED goes dark for its diners as soon as the
-- application code deploys. Record a payment that extends period_end first if
-- that is not what you want.

-- ════════════════════════════════════════════════════════════════════════════
-- 1. The enforcement column
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ;

COMMENT ON COLUMN restaurants.subscription_ends_at IS
  'Denormalized MAX(payments.period_end). Maintained ONLY by trg_payments_sync_subscription — never write it from application code. NULL = no subscription recorded = treated as active.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Trigger keeps it true
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION payments_sync_subscription_end()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- INSERT / UPDATE: refresh the row the payment now belongs to.
  IF TG_OP <> 'DELETE' THEN
    UPDATE restaurants
       SET subscription_ends_at = (
             SELECT max(period_end) FROM payments WHERE restaurant_id = NEW.restaurant_id
           )
     WHERE id = NEW.restaurant_id;
  END IF;

  -- DELETE, or an UPDATE that moved the payment to a different restaurant:
  -- the row it LEFT also has to be recomputed, or it keeps an expiry that no
  -- payment backs any more.
  IF TG_OP = 'DELETE'
     OR (TG_OP = 'UPDATE' AND OLD.restaurant_id IS DISTINCT FROM NEW.restaurant_id) THEN
    UPDATE restaurants
       SET subscription_ends_at = (
             SELECT max(period_end) FROM payments WHERE restaurant_id = OLD.restaurant_id
           )
     WHERE id = OLD.restaurant_id;
  END IF;

  RETURN NULL; -- AFTER trigger: return value is ignored
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_sync_subscription ON payments;
CREATE TRIGGER trg_payments_sync_subscription
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION payments_sync_subscription_end();

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Backfill from existing payments
-- ════════════════════════════════════════════════════════════════════════════
-- Idempotent: recomputes from scratch, so re-running this file is harmless.
UPDATE restaurants r
   SET subscription_ends_at = (
         SELECT max(period_end) FROM payments p WHERE p.restaurant_id = r.id
       );

-- Reading the column costs the diner nothing extra, but the owner panel scans
-- for upcoming renewals across all restaurants.
CREATE INDEX IF NOT EXISTS idx_restaurants_subscription_ends
  ON restaurants (subscription_ends_at)
  WHERE subscription_ends_at IS NOT NULL AND deleted_at IS NULL;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Constrain `plan` to the three real packages
-- ════════════════════════════════════════════════════════════════════════════
-- 0011:14 created `plan` as free text. The three packages (annual, IQD):
--   menu       199,000   — Menu only
--   growth     499,000   — Menu + Feedback   (the target package)
--   growth_pro 699,000
-- NULL stays legal: an account can exist before a package is chosen.
--
-- Normalize first, gently: trim, lowercase, spaces/dashes to underscores — but
-- ONLY when the result is one of the three known values. Anything else is left
-- untouched and REPORTED rather than mangled or dropped.
UPDATE restaurants SET plan = NULL
 WHERE plan IS NOT NULL AND btrim(plan) = '';

UPDATE restaurants
   SET plan = lower(btrim(translate(plan, ' -', '__')))
 WHERE plan IS NOT NULL
   AND lower(btrim(translate(plan, ' -', '__'))) IN ('menu', 'growth', 'growth_pro')
   AND plan <> lower(btrim(translate(plan, ' -', '__')));

-- Add the CHECK only if nothing violates it. A migration that aborts halfway
-- on unexpected data is worse than one that tells you what to fix.
DO $$
DECLARE
  v_bad TEXT;
BEGIN
  SELECT string_agg(DISTINCT plan, ', ')
    INTO v_bad
    FROM restaurants
   WHERE plan IS NOT NULL AND plan NOT IN ('menu', 'growth', 'growth_pro');

  IF v_bad IS NOT NULL THEN
    RAISE WARNING '0016: plan CHECK NOT added — unrecognised values present: %. Fix them, then re-run this file.', v_bad;
  ELSE
    ALTER TABLE restaurants DROP CONSTRAINT IF EXISTS restaurants_plan_check;
    ALTER TABLE restaurants
      ADD CONSTRAINT restaurants_plan_check
      CHECK (plan IS NULL OR plan IN ('menu', 'growth', 'growth_pro'));
    RAISE NOTICE '0016: plan CHECK added';
  END IF;
END $$;

-- ── Post-apply verification ────────────────────────────────────────────────
-- 1. Column + comment exist:
--      SELECT column_name, data_type, is_nullable
--        FROM information_schema.columns
--       WHERE table_schema='public' AND table_name='restaurants'
--         AND column_name='subscription_ends_at';
--
-- 2. Trigger is attached:
--      SELECT tgname FROM pg_trigger
--       WHERE tgrelid='public.payments'::regclass AND NOT tgisinternal;
--
-- 3. Backfill agrees with the ledger — must return ZERO rows (drift check;
--    also the query to re-run any time you suspect the column is stale):
--      SELECT r.slug, r.subscription_ends_at, max(p.period_end) AS from_ledger
--        FROM restaurants r LEFT JOIN payments p ON p.restaurant_id = r.id
--       GROUP BY r.id, r.slug, r.subscription_ends_at
--      HAVING r.subscription_ends_at IS DISTINCT FROM max(p.period_end);
--
-- 4. plan CHECK landed (watch for the RAISE WARNING above if it did not):
--      SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--       WHERE conrelid='public.restaurants'::regclass AND conname='restaurants_plan_check';
--
-- 5. Trigger actually fires. Safe round-trip on a real restaurant — it inserts
--    a payment and deletes it again, leaving the column exactly as it started:
--
--      -- pick any restaurant id, note its current value:
--      SELECT id, subscription_ends_at FROM restaurants LIMIT 1;   -- remember both
--      INSERT INTO payments (restaurant_id, kind, amount, currency, paid_at, period_end)
--        VALUES ('<that id>', 'adjustment', 1, 'IQD', now(), now() + interval '400 days');
--      SELECT subscription_ends_at FROM restaurants WHERE id='<that id>';  -- ~400 days out
--      DELETE FROM payments WHERE restaurant_id='<that id>' AND amount=1 AND kind='adjustment';
--      SELECT subscription_ends_at FROM restaurants WHERE id='<that id>';  -- back to original
