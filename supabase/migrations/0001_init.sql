-- Mesa OS Lite — initial schema
-- Source: prd.md §4.3 + §4.4
-- Convention: every column declared verbatim from the PRD; only additions are
-- the discount CHECK on closing_mode_discount and an explicit pgcrypto guard
-- (gen_random_uuid is in pgcrypto on older Postgres; Supabase Postgres 15+ has
-- it builtin via pgcrypto extension already enabled, but we declare anyway).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────── restaurants ───────────────────────────
CREATE TABLE restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,

  -- Design
  logo_url TEXT,
  primary_color TEXT DEFAULT '#000000',
  background_color TEXT DEFAULT '#FFFFFF',
  currency TEXT DEFAULT 'IQD',

  -- Settings
  show_unavailable_items BOOLEAN DEFAULT TRUE,

  -- Mode state
  active_mode TEXT DEFAULT 'normal' CHECK (active_mode IN ('normal','rush','profit','closing')),
  closing_mode_ends_at TIMESTAMPTZ,
  closing_mode_discount INTEGER CHECK (closing_mode_discount IS NULL OR closing_mode_discount IN (5, 10, 20)),

  -- Meta
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE INDEX idx_restaurants_slug ON restaurants(slug);
CREATE INDEX idx_restaurants_username ON restaurants(username);

-- ─────────────────────────── categories ────────────────────────────
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES categories(id) ON DELETE CASCADE,

  name_ar TEXT NOT NULL,
  name_en TEXT,
  name_ku TEXT,
  display_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_categories_restaurant ON categories(restaurant_id);
CREATE INDEX idx_categories_parent ON categories(parent_id);

-- 2-level hierarchy is enforced in the API layer (PRD §4.3) — no DB trigger.

-- ─────────────────────────── products ──────────────────────────────
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,

  name_ar TEXT NOT NULL,
  name_en TEXT,
  name_ku TEXT,

  price NUMERIC(10,2) NOT NULL,
  profit_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  prep_time_minutes INTEGER NOT NULL DEFAULT 5,

  image_url TEXT,
  is_available BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,

  is_in_closing_mode BOOLEAN DEFAULT FALSE,

  suggestions_type TEXT DEFAULT 'default' CHECK (suggestions_type IN ('default','custom')),
  custom_suggestion_ids UUID[],

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_restaurant ON products(restaurant_id);
CREATE INDEX idx_products_category ON products(category_id);

-- ───────────────────── complementary_categories ────────────────────
CREATE TABLE complementary_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  complement_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  UNIQUE(category_id, complement_id)
);

-- ─────────────────────────── tenant_sessions ───────────────────────
CREATE TABLE tenant_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  device_info TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
  -- No expires_at — sessions are permanent by design (PRD §4.3, multi-device).
);

CREATE INDEX idx_sessions_token ON tenant_sessions(token);

-- ───────────────────────── Row Level Security ──────────────────────
-- Owner uses Supabase Auth (JWT role = 'owner').
-- Public reads are gated on restaurants.is_active = TRUE.
-- Tenant writes flow through API routes that validate the session token —
-- they do NOT rely on RLS for tenant identity.

ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE complementary_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full access" ON restaurants
  FOR ALL USING (auth.jwt() ->> 'role' = 'owner');

CREATE POLICY "Public read active" ON restaurants
  FOR SELECT USING (is_active = TRUE);

CREATE POLICY "Public read" ON categories
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE id = categories.restaurant_id AND is_active = TRUE
    )
  );

CREATE POLICY "Public read" ON products
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE id = products.restaurant_id AND is_active = TRUE
    )
  );

CREATE POLICY "Public read" ON complementary_categories
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE id = complementary_categories.restaurant_id AND is_active = TRUE
    )
  );

CREATE POLICY "Owner full access" ON categories
  FOR ALL USING (auth.jwt() ->> 'role' = 'owner');

CREATE POLICY "Owner full access" ON products
  FOR ALL USING (auth.jwt() ->> 'role' = 'owner');

CREATE POLICY "Owner full access" ON complementary_categories
  FOR ALL USING (auth.jwt() ->> 'role' = 'owner');

CREATE POLICY "Owner full access" ON tenant_sessions
  FOR ALL USING (auth.jwt() ->> 'role' = 'owner');

-- tenant_sessions has no public-read or tenant-self policy: the API routes
-- validate the token via the service-role client and bypass RLS deliberately.
