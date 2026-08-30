-- 0013 — actually close the credential leak that 0012 failed to close
-- (2026-08-25, BIZIII-READINESS blocker #1, second attempt).
--
-- ── WHY 0012 DID NOTHING ───────────────────────────────────────────────────
-- 0012 ran `REVOKE SELECT (password_hash, username) ON restaurants FROM anon,
-- authenticated;` and it was a NO-OP. So was the identical technique used on
-- `tenant_sessions.token` in 0009:46 — dead since 2026-06-01.
--
-- PostgreSQL, REVOKE reference:
--   "When revoking privileges on a table, the corresponding column privileges
--    (if any) are automatically revoked on each column of the table, as well.
--    On the other hand, if a role has been granted privileges on a table, then
--    revoking the same privileges from individual columns will have no effect."
--
-- Supabase grants table-level SELECT on every public table to `anon` and
-- `authenticated` by default. That table-level grant outranks any column-level
-- REVOKE, so both migrations changed nothing. Verified live on the fresh
-- database 2026-08-25 — has_column_privilege() returned true for all six
-- (role × column) pairs, and pg_class.relacl showed SELECT granted directly to
-- anon and authenticated by postgres (no PUBLIC grant involved).
--
-- ── THE FIX ────────────────────────────────────────────────────────────────
-- Drop the table-level grant, then grant back an explicit column list. The
-- REVOKE also clears any leftover column grants, so the GRANT that follows
-- defines the whole readable surface. Order matters: REVOKE first.
--
-- `service_role` and `postgres` are NOT touched — the application reads every
-- one of these columns through the service-role client, which is unaffected.
--
-- ⚠️⚠️ MAINTENANCE HAZARD — READ BEFORE ADDING ANY COLUMN ⚠️⚠️
-- From this migration onward, `anon`/`authenticated` hold an EXPLICIT column
-- list on these two tables, not a blanket table grant. A column added by a
-- future migration is therefore NOT readable by anon until it is granted here
-- too. If a new diner-visible column ever appears on `restaurants`, that
-- migration MUST include:
--     GRANT SELECT (new_column) ON restaurants TO anon, authenticated;
-- Symptom if forgotten: PostgREST returns "permission denied for column ..."
-- to the diner, or `select=*` starts failing. (Today no application code reads
-- these tables with the anon key at all — the diner menu goes through
-- service-role `loadMenu()` — so the practical blast radius is the smoke
-- tests. That may change; the rule stands.)
--
-- SAFE / ADDITIVE / RE-RUNNABLE. Grants only; alters no row, drops no object.
-- NOTE: this project has no automated migration channel — apply manually via
-- the Supabase SQL editor or `supabase db push`.

-- ─────────────────────────── restaurants ───────────────────────────
-- 22 columns total; 20 granted. `username` and `password_hash` are withheld.
REVOKE SELECT ON restaurants FROM anon, authenticated;

GRANT SELECT (
  id,
  slug,
  display_name,
  is_active,
  logo_url,
  primary_color,
  background_color,
  currency,
  show_unavailable_items,
  active_mode,
  closing_mode_ends_at,
  closing_mode_discount,
  created_at,
  last_login_at,
  header_color,
  card_color,
  text_color,
  plan,
  branch_count,
  deleted_at
) ON restaurants TO anon, authenticated;

-- ───────────────────────── tenant_sessions ─────────────────────────
-- Restores the intent of 0009:46: everything except the raw session `token`.
-- RLS already denies anon every row here (there is no public policy at all),
-- so this is defence-in-depth — the layer 0009 believed it had.
-- 5 columns total; 4 granted.
REVOKE SELECT ON tenant_sessions FROM anon, authenticated;

GRANT SELECT (
  id,
  restaurant_id,
  device_info,
  created_at
) ON tenant_sessions TO anon, authenticated;

-- ── Post-apply verification ────────────────────────────────────────────────
-- 1. THE decisive check — all six rows must read 'OK' (they all read 'EXPOSED'
--    before this migration):
--
--      SELECT t.role_name, t.tbl || '.' || t.col AS target,
--             has_column_privilege(t.role_name, t.tbl, t.col, 'SELECT') AS can_read,
--             CASE WHEN has_column_privilege(t.role_name, t.tbl, t.col, 'SELECT')
--                  THEN 'EXPOSED' ELSE 'OK' END AS verdict
--        FROM (VALUES
--          ('anon','restaurants','password_hash'),
--          ('anon','restaurants','username'),
--          ('authenticated','restaurants','password_hash'),
--          ('authenticated','restaurants','username'),
--          ('anon','tenant_sessions','token'),
--          ('authenticated','tenant_sessions','token')
--        ) AS t(role_name, tbl, col)
--       ORDER BY t.tbl, t.col, t.role_name;
--
-- 2. The diner-visible columns must STILL be readable — must return true:
--
--      SELECT has_column_privilege('anon','restaurants','slug','SELECT')
--         AND has_column_privilege('anon','restaurants','display_name','SELECT')
--         AND has_column_privilege('anon','restaurants','active_mode','SELECT')
--             AS diner_columns_ok;
--
-- 3. Live behaviour (read-only, self-reverting):
--
--      BEGIN;
--      SET LOCAL ROLE anon;
--        SELECT id, slug FROM public.restaurants LIMIT 1;   -- must succeed
--      ROLLBACK; RESET ROLE;
--
--      BEGIN;
--      SET LOCAL ROLE anon;
--        SELECT password_hash FROM public.restaurants LIMIT 1;  -- must ERROR
--      ROLLBACK; RESET ROLE;
--
-- 4. Full end-to-end proof, against a live server:
--      node --env-file=.env.local scripts/smoke-rls.mjs
--    The five credential assertions added on 2026-08-25 must pass.
--
-- 5. Tenant login from /admin must still work (service-role path untouched).
