-- Fix the "Owner full access" RLS policies to read from app_metadata.role
-- instead of the top-level JWT `role` claim.
--
-- Why: Supabase's top-level `role` is used for Postgres role mapping
-- (`authenticated`/`anon`) and cannot be set to 'owner' without conflicting
-- with the role-resolution machinery. The PRD §4.4 wording was incorrect.
-- App-level roles belong in `auth.users.raw_app_meta_data`, which Supabase
-- merges into the JWT under `app_metadata`. The check becomes:
--   auth.jwt() -> 'app_metadata' ->> 'role' = 'owner'
--
-- See: https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac

-- Drop the old policies
DROP POLICY IF EXISTS "Owner full access" ON restaurants;
DROP POLICY IF EXISTS "Owner full access" ON categories;
DROP POLICY IF EXISTS "Owner full access" ON products;
DROP POLICY IF EXISTS "Owner full access" ON complementary_categories;
DROP POLICY IF EXISTS "Owner full access" ON tenant_sessions;

-- Recreate them with the corrected JWT path
CREATE POLICY "Owner full access" ON restaurants
  FOR ALL USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'owner');

CREATE POLICY "Owner full access" ON categories
  FOR ALL USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'owner');

CREATE POLICY "Owner full access" ON products
  FOR ALL USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'owner');

CREATE POLICY "Owner full access" ON complementary_categories
  FOR ALL USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'owner');

CREATE POLICY "Owner full access" ON tenant_sessions
  FOR ALL USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'owner');

-- After running this migration AND creating the owner user in
-- Supabase Dashboard → Authentication → Users, run the following separately
-- (replace the email with the one you registered):
--
--   UPDATE auth.users
--   SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || '{"role":"owner"}'::jsonb
--   WHERE email = 'mustafa@example.com';
--
-- The user must sign out and back in for the new claim to appear in their JWT.
