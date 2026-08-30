-- 0014 — store SHA-256 of the session token, never the token itself
-- (2026-08-25, BIZIII-READINESS pre-launch hardening).
--
-- ⚠️⚠️ DESTRUCTIVE: APPLYING THIS LOGS OUT EVERY TENANT ⚠️⚠️
-- Every existing row in `tenant_sessions` becomes unusable and is deleted by
-- this migration. Any restaurant owner currently signed in must log in again.
-- Applied 2026-08-25 while the table held ZERO rows (product not yet
-- deployed), so the real-world cost was nil. This is precisely why it was done
-- now rather than after the first customer.
--
-- ── WHY ────────────────────────────────────────────────────────────────────
-- 0001:102 stored the raw 64-char session token. Anything that could read the
-- column — a database backup, a support export, a leaked service-role key, a
-- future analytics dump — handed over credentials that are immediately usable
-- as a live login for the tenant panel, with no password needed and no expiry
-- (sessions are permanent by design, PRD §4.3).
--
-- Deferred once already, with the reasoning recorded in lib/auth/session.ts
-- ("Deferred by decision: hashing the token at rest ... hashing would
-- invalidate every currently-active session"). That objection is void while
-- the session count is zero.
--
-- ── AFTER THIS MIGRATION ───────────────────────────────────────────────────
-- The raw token lives in exactly one place: the httpOnly `mesa-tenant-token`
-- cookie on the tenant's own device. The database stores only
-- sha256(token) as lowercase hex. A stolen database row cannot be replayed:
-- SHA-256 is one-way, and the token is 32 bytes of CSPRNG output, so there is
-- nothing to brute-force or rainbow-table.
--
-- No salt and no bcrypt here, deliberately. Salting/stretching defend
-- low-entropy human passwords against offline guessing. A 256-bit random token
-- has no guessable structure, and session lookup happens on every dashboard
-- request — a deliberately slow KDF would be a latency tax buying nothing.
-- This is the same reasoning every mainstream session store uses.
--
-- ── COLUMN LENGTH LOOKS UNCHANGED — DON'T BE FOOLED ────────────────────────
-- The old raw token was 32 random bytes rendered as 64 hex chars.
-- sha256 hex is ALSO 64 chars. You cannot tell hashed from unhashed by
-- eyeballing the length. The column NAME is the only signal — which is exactly
-- why it is renamed rather than reused.
--
-- ── RELATION TO 0013 ───────────────────────────────────────────────────────
-- 0013 granted anon/authenticated an explicit column list on tenant_sessions:
-- (id, restaurant_id, device_info, created_at). `token` was withheld and stays
-- withheld under its new name — renaming a column does not grant it. Verified
-- in the post-apply checks below.
--
-- NOTE: this project has no automated migration channel — apply manually via
-- the Supabase SQL editor or `supabase db push`.

-- ── Pre-flight ─────────────────────────────────────────────────────────────
-- How many tenants this will sign out. Expected 0 on 2026-08-25:
--
--   SELECT count(*) AS sessions_to_be_destroyed FROM tenant_sessions;
--
-- If that number is > 0, know that each one is a tenant who will be bounced to
-- the login screen on their next request. They can simply log in again; no
-- data is lost. Decide deliberately, then proceed.

-- RE-RUNNABLE. Every step below is guarded, so a partial or repeated run is
-- safe. (The first version of this file was not: a second run died with
--   ERROR 42703: column "token" does not exist
-- because RENAME COLUMN is not idempotent. Fixed 2026-08-25.)

-- Rename rather than reuse: the name is the only thing distinguishing a hash
-- from a raw token at a glance (both are 64 hex chars).
--
-- The DELETE lives inside this guard on purpose. It must run exactly once —
-- together with the rename — while the column still holds RAW tokens. Once the
-- column is `token_hash`, its contents are digests written by the application,
-- and wiping them on a re-run would log out live tenants for no reason.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'tenant_sessions'
       AND column_name = 'token'
  ) THEN
    -- Every stored value is a RAW token. It can never match sha256(cookie), so
    -- each row is already dead weight the moment the application code ships.
    -- Removing them keeps the table honest instead of leaving unusable secrets
    -- sitting in backups.
    DELETE FROM tenant_sessions;
    ALTER TABLE tenant_sessions RENAME COLUMN token TO token_hash;
    RAISE NOTICE '0014: token -> token_hash renamed, stale sessions purged';
  ELSE
    RAISE NOTICE '0014: token_hash already present, rename skipped';
  END IF;
END $$;

-- Keep the index and unique constraint names truthful. Both were created in
-- 0001 against the old column name; RENAME COLUMN carries them over but leaves
-- their names stale.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'idx_sessions_token'
  ) THEN
    ALTER INDEX idx_sessions_token RENAME TO idx_sessions_token_hash;
    RAISE NOTICE '0014: index renamed';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.tenant_sessions'::regclass
       AND conname = 'tenant_sessions_token_key'
  ) THEN
    ALTER TABLE tenant_sessions
      RENAME CONSTRAINT tenant_sessions_token_key TO tenant_sessions_token_hash_key;
    RAISE NOTICE '0014: unique constraint renamed';
  END IF;
END $$;

-- Structural guard: only a 64-char lowercase hex SHA-256 digest may be stored.
-- If a future code path ever regresses to writing a raw token, this rejects
-- most such writes outright — a raw token is hex too, so this is a guard
-- against malformed values, not a proof of hashing. The real guarantee is that
-- lib/auth/session.ts has exactly one insert path and it hashes.
ALTER TABLE tenant_sessions
  DROP CONSTRAINT IF EXISTS tenant_sessions_token_hash_format_check;
ALTER TABLE tenant_sessions
  ADD CONSTRAINT tenant_sessions_token_hash_format_check
  CHECK (token_hash ~ '^[0-9a-f]{64}$');

-- ── Post-apply verification ────────────────────────────────────────────────
-- 1. Shape — must return exactly one row: token_hash / text / NO.
--    A row named `token` means the rename did not run.
--
--      SELECT column_name, data_type, is_nullable
--        FROM information_schema.columns
--       WHERE table_schema='public' AND table_name='tenant_sessions'
--         AND column_name IN ('token','token_hash');
--
-- 2. Names carried over — expect idx_sessions_token_hash and
--    tenant_sessions_token_hash_key, and NEITHER old name:
--
--      SELECT indexname FROM pg_indexes
--       WHERE schemaname='public' AND tablename='tenant_sessions';
--      SELECT conname FROM pg_constraint
--       WHERE conrelid='public.tenant_sessions'::regclass;
--
-- 3. 0013's grants still withhold the secret — both must be false:
--
--      SELECT has_column_privilege('anon','tenant_sessions','token_hash','SELECT')
--          AS anon_can_read,
--             has_column_privilege('authenticated','tenant_sessions','token_hash','SELECT')
--          AS auth_can_read;
--
-- 4. The table is empty (this migration deleted every row):
--
--      SELECT count(*) FROM tenant_sessions;   -- expect 0
--
-- 5. End-to-end, against a running server: log in at /admin with a real
--    tenant, then confirm the DB never saw the cookie value —
--
--      SELECT token_hash, length(token_hash) FROM tenant_sessions;
--
--    must show a 64-char hex string that does NOT equal the
--    `mesa-tenant-token` cookie value in your browser's devtools.
--    Then: reload /admin/dashboard (session still valid), and sign out
--    (row disappears).
