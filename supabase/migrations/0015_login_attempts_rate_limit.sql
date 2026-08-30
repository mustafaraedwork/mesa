-- 0015 — move rate limiting from process memory into Postgres
-- (2026-08-25, BIZIII-READINESS blocker #2).
--
-- ── WHY ────────────────────────────────────────────────────────────────────
-- lib/auth/rate-limit.ts kept its sliding windows in a module-level `Map`. Its
-- own header admitted the trade-off: "a feature for an MVP single-process VPS
-- deploy". On Vercel that assumption inverts. Serverless runs an unbounded,
-- constantly-recycled set of short-lived instances, and every cold start begins
-- with an empty Map. The effective limit approaches infinity: an attacker
-- spreading attempts across instances is never throttled.
--
-- That guard is the only thing standing between an attacker and unlimited
-- password guesses against tenant accounts whose passwords the owner types by
-- hand with an 8-character minimum (accounts/actions.ts:63).
--
-- ── DESIGN ─────────────────────────────────────────────────────────────────
-- One append-only table of timestamped attempts keyed by an opaque string, and
-- one function that does check-and-record ATOMICALLY. Doing it in a single
-- plpgsql call matters: a read-then-write from the application would race
-- across concurrent requests and let bursts slip past the limit.
--
-- `bucket_key` is opaque on purpose — the application composes it
-- ("login:<username>", "login-ip:<ip>", "owner-login:<email>", "track:<ip>").
-- Adding a limiter later needs no schema change.
--
-- ── NO CRON, LAZY CLEANUP ──────────────────────────────────────────────────
-- This project has no scheduled jobs (same constraint that produced the
-- closing-mode lazy revert). Cleanup is therefore folded into the read path:
--   • every call prunes expired rows FOR ITS OWN KEY — this is the common case
--     and keeps each bucket bounded by `p_max`;
--   • ~1% of calls also sweep rows older than a day across ALL keys, which
--     collects buckets that were hit once and never revisited. Without it, a
--     spray of one-shot keys would accumulate forever.
--
-- ── WHY NOT A PARTIAL INDEX ────────────────────────────────────────────────
-- A partial index over "recent" rows is impossible here: `now()` is STABLE,
-- not IMMUTABLE, so `WHERE created_at > now() - interval '15 min'` is rejected
-- in an index predicate. A plain composite index on (bucket_key, created_at)
-- serves every query this table has — the per-key window scan and both
-- deletes — and the table stays small by construction.
--
-- SAFE / ADDITIVE / RE-RUNNABLE. Creates one table and two functions; touches
-- no existing object. NOTE: this project has no automated migration channel —
-- apply manually via the Supabase SQL editor or `supabase db push`.

-- ────────────────────────────── table ──────────────────────────────
-- BIGSERIAL, not UUID: this is a high-churn counter table, never joined and
-- never referenced by a foreign key. A bigint is half the width and keeps
-- inserts append-ordered in the index.
CREATE TABLE IF NOT EXISTS login_attempts (
  id         BIGSERIAL PRIMARY KEY,
  bucket_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_key_time
  ON login_attempts (bucket_key, created_at DESC);
-- Supports the 1% global sweep only.
CREATE INDEX IF NOT EXISTS idx_login_attempts_created
  ON login_attempts (created_at);

-- RLS with NO policy at all — the same shape as `events` (0003) and `payments`
-- (0011). anon and authenticated can never read or write it; the application
-- reaches it exclusively through the service-role client.
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner full access" ON login_attempts;
CREATE POLICY "Owner full access" ON login_attempts
  FOR ALL USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'owner');

-- 0013 replaced the blanket table grant on the other tables with explicit
-- column lists. This table is brand new, so anon/authenticated may still hold
-- the default table-level grant Supabase hands out. RLS already denies every
-- row, but revoke anyway: rate-limit history is nobody's business but the
-- server's, and defence-in-depth here costs nothing.
REVOKE ALL ON login_attempts FROM anon, authenticated;
REVOKE ALL ON SEQUENCE login_attempts_id_seq FROM anon, authenticated;

-- ──────────────────────────── functions ────────────────────────────
-- Atomic check-and-record. Returns whether the caller may proceed, and if not,
-- how many seconds until the oldest attempt in the window expires.
--
-- SECURITY DEFINER is deliberately NOT used: only the service-role client
-- calls this, and it already bypasses RLS. Keeping the function INVOKER means
-- a future accidental grant to anon still hits the RLS wall.
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key            TEXT,
  p_max            INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE (allowed BOOLEAN, retry_after_seconds INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
  v_cutoff TIMESTAMPTZ := now() - make_interval(secs => p_window_seconds);
  v_count  INTEGER;
  v_oldest TIMESTAMPTZ;
BEGIN
  -- Lazy GC for this key: everything outside the window is irrelevant.
  DELETE FROM login_attempts
   WHERE bucket_key = p_key AND created_at < v_cutoff;

  -- Occasional global sweep for keys nobody ever checks again.
  IF random() < 0.01 THEN
    DELETE FROM login_attempts WHERE created_at < now() - interval '1 day';
  END IF;

  SELECT count(*), min(created_at)
    INTO v_count, v_oldest
    FROM login_attempts
   WHERE bucket_key = p_key;

  IF v_count >= p_max THEN
    RETURN QUERY SELECT
      false,
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM
        (v_oldest + make_interval(secs => p_window_seconds)) - now()
      ))::INTEGER);
    RETURN;
  END IF;

  INSERT INTO login_attempts (bucket_key) VALUES (p_key);
  RETURN QUERY SELECT true, 0;
END;
$$;

-- Called after a SUCCESSFUL login: an honest user who finally typed the right
-- password should not stay penalised for earlier typos. Mirrors the old
-- clearLoginAttempts().
CREATE OR REPLACE FUNCTION clear_rate_limit(p_key TEXT)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM login_attempts WHERE bucket_key = p_key;
END;
$$;

-- ⚠️ Functions are granted EXECUTE to PUBLIC by default in PostgreSQL, and a
-- REVOKE aimed only at anon/authenticated leaves that PUBLIC grant standing —
-- the exact failure mode that made 0012's column REVOKE a no-op. Revoke from
-- PUBLIC first, then hand EXECUTE back to the one role that actually calls
-- these (the app's service-role client).
REVOKE EXECUTE ON FUNCTION check_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION clear_rate_limit(TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION check_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION clear_rate_limit(TEXT) TO service_role;

-- ── Post-apply verification ────────────────────────────────────────────────
-- 1. Shape:
--      SELECT column_name, data_type FROM information_schema.columns
--       WHERE table_schema='public' AND table_name='login_attempts'
--       ORDER BY ordinal_position;      -- id bigint, bucket_key text, created_at timestamptz
--
-- 2. Functional round-trip. Safe to run: it writes only to this table under a
--    throwaway key and cleans up after itself.
--
--      SELECT * FROM check_rate_limit('verify-0015', 3, 900);  -- t, 0
--      SELECT * FROM check_rate_limit('verify-0015', 3, 900);  -- t, 0
--      SELECT * FROM check_rate_limit('verify-0015', 3, 900);  -- t, 0
--      SELECT * FROM check_rate_limit('verify-0015', 3, 900);  -- f, ~900
--      SELECT clear_rate_limit('verify-0015');
--      SELECT count(*) FROM login_attempts WHERE bucket_key='verify-0015';  -- 0
--
-- 3. Locked down — the first four must be false, the last true:
--      SELECT has_table_privilege('anon','login_attempts','SELECT'),
--             has_table_privilege('anon','login_attempts','INSERT'),
--             has_function_privilege('anon','check_rate_limit(text,integer,integer)','EXECUTE'),
--             has_function_privilege('authenticated','clear_rate_limit(text)','EXECUTE'),
--             has_function_privilege('service_role','check_rate_limit(text,integer,integer)','EXECUTE');
--
-- 4. End-to-end, against a running server: enter a wrong password at /admin
--    six times. Attempts 1-5 must say "بيانات الدخول غير صحيحة"; the 6th must
--    say "محاولات كثيرة". Then:
--      SELECT bucket_key, count(*) FROM login_attempts GROUP BY 1;
