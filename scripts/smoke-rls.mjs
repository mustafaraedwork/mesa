// Phase 8 — R1: RLS smoke test.
//
// Verifies that the anon key (what an attacker on the diner page has) cannot:
//   1. Read an inactive restaurant
//   2. Read categories/products belonging to an inactive restaurant
//   3. Read tenant_sessions (no public policy)
//   4. Insert/update/delete on any table
//   5. Read `username` / `password_hash` of an ACTIVE restaurant (0012 → 0013)
//   6. Read `tenant_sessions.token_hash` (0014 renamed the column; digests only)
//
// #5 is the one that matters most. RLS is ROW-level: the "Public read active"
// policy hides inactive restaurants but grants anon every COLUMN of the active
// ones. Testing only the inactive case (which is all this file did before
// 2026-08-25) passes happily while the credential columns of every live tenant
// are wide open. The credential assertions below therefore run against an
// ACTIVE restaurant on purpose — do not "simplify" them back to inactive.
//
// Run:  node --env-file=.env.local scripts/smoke-rls.mjs

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

// Sessions are stored hashed since migration 0014 — the raw token goes in the
// cookie, sha256(token) goes in the DB. Seeding a row means inserting the digest.
function sha256(v) {
  return createHash('sha256').update(v, 'utf8').digest('hex');
}


const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error('Missing env: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

const SLUG = `smoke-rls-${Date.now()}`;
let restaurantId = null;
let categoryId = null;
let productId = null;
let failed = 0;

function ok(msg) { console.log(`  ✓ ${msg}`); }
function fail(msg) { console.error(`  ✗ ${msg}`); failed++; }
function expectEmpty(data, msg) { (Array.isArray(data) ? data.length === 0 : data == null) ? ok(msg) : fail(`${msg} — got ${JSON.stringify(data)}`); }
function expectBlocked(error, data, msg) {
  // RLS denial: either an explicit error, or silently filtered to empty rows.
  if (error || data == null || (Array.isArray(data) && data.length === 0)) ok(msg);
  else fail(`${msg} — leaked ${JSON.stringify(data).slice(0, 120)}`);
}

async function cleanup() {
  if (restaurantId) await admin.from('restaurants').delete().eq('id', restaurantId);
}

try {
  console.log(`— seeding inactive tenant: ${SLUG} —`);
  const { data: r } = await admin
    .from('restaurants')
    .insert({
      slug: SLUG,
      display_name: 'RLS Test',
      username: SLUG,
      password_hash: '$2b$10$smoke.rls.dummy.hash.placeholder.value',
      is_active: false, // <-- KEY: inactive, so public read must be blocked
    })
    .select('id')
    .single();
  restaurantId = r.id;

  const { data: c } = await admin
    .from('categories')
    .insert({ restaurant_id: restaurantId, name_ar: 'سرّي', display_order: 0 })
    .select('id')
    .single();
  categoryId = c.id;

  const { data: p } = await admin
    .from('products')
    .insert({
      restaurant_id: restaurantId,
      category_id: categoryId,
      name_ar: 'سرّ تجاري',
      price: 9999,
    })
    .select('id')
    .single();
  productId = p.id;

  await admin
    .from('tenant_sessions')
    .insert({ restaurant_id: restaurantId, token_hash: sha256(`secret-token-${SLUG}`) });

  console.log('— anon read attempts on inactive tenant —');

  {
    const { data, error } = await anon.from('restaurants').select('*').eq('id', restaurantId);
    expectBlocked(error, data, 'cannot read inactive restaurant row');
  }
  {
    const { data, error } = await anon.from('restaurants').select('*').eq('slug', SLUG);
    expectBlocked(error, data, 'cannot read inactive restaurant by slug');
  }
  {
    const { data, error } = await anon.from('categories').select('*').eq('restaurant_id', restaurantId);
    expectBlocked(error, data, 'cannot read categories of inactive restaurant');
  }
  {
    const { data, error } = await anon.from('products').select('*').eq('restaurant_id', restaurantId);
    expectBlocked(error, data, 'cannot read products of inactive restaurant');
  }
  {
    const { data, error } = await anon.from('products').select('*').eq('id', productId);
    expectBlocked(error, data, 'cannot read specific product by id');
  }

  console.log('— anon read on tenant_sessions (no public policy at all) —');
  {
    const { data, error } = await anon.from('tenant_sessions').select('*');
    expectBlocked(error, data, 'tenant_sessions returns nothing to anon');
  }
  {
    const { data, error } = await anon
      .from('tenant_sessions')
      .select('*')
      .eq('restaurant_id', restaurantId);
    expectBlocked(error, data, 'tenant_sessions filtered by restaurant_id blocked');
  }

  // Postgres RLS: update/delete on rows the policy hides becomes a silent
  // no-op (0 rows affected) rather than an error. The real proof is that the
  // row's state is unchanged from the admin's perspective.
  console.log('— anon write attempts (state must be unchanged) —');
  {
    await anon.from('restaurants').update({ is_active: true }).eq('id', restaurantId);
    const { data: check } = await admin.from('restaurants').select('is_active').eq('id', restaurantId).single();
    check.is_active === false ? ok('anon update restaurants: row still inactive') : fail('row was flipped to active by anon!');
  }
  {
    await anon.from('products').delete().eq('id', productId);
    const { data: check } = await admin.from('products').select('id').eq('id', productId).maybeSingle();
    check ? ok('anon delete products: row still exists') : fail('product was deleted by anon!');
  }
  {
    // INSERT is enforced via WITH CHECK; without one declared, no policy
    // grants INSERT to anon, so the API must reject it explicitly.
    const { error } = await anon.from('categories').insert({
      restaurant_id: restaurantId,
      name_ar: 'حقن',
      display_order: 0,
    });
    error ? ok('anon insert categories blocked (explicit error)') : fail('anon insert categories ALLOWED');
    const { data: count } = await admin
      .from('categories')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .eq('name_ar', 'حقن');
    count.length === 0 ? ok('no injected category row exists') : fail('injected category row leaked through!');
  }
  {
    // Use a WELL-FORMED digest (0014 adds a 64-hex CHECK, and the column is
    // `token_hash` now). A malformed value or a stale column name would make
    // this insert fail for a schema reason and the assertion would pass
    // without ever exercising RLS — a false green.
    const forged = sha256('forged-token');
    const { error } = await anon.from('tenant_sessions').insert({
      restaurant_id: restaurantId,
      token_hash: forged,
    });
    error ? ok('anon insert tenant_sessions blocked (explicit error)') : fail('anon insert tenant_sessions ALLOWED');
    const { data: count } = await admin
      .from('tenant_sessions')
      .select('id')
      .eq('token_hash', forged);
    count.length === 0 ? ok('no forged session row exists') : fail('forged tenant_session leaked through!');
  }

  console.log('— flip to active, verify public read works (positive control) —');
  await admin.from('restaurants').update({ is_active: true }).eq('id', restaurantId);
  {
    const { data } = await anon.from('restaurants').select('id, slug').eq('id', restaurantId).maybeSingle();
    data && data.slug === SLUG ? ok('active restaurant readable by anon (positive control)') : fail('active restaurant NOT readable — RLS may be over-tight');
  }
  {
    const { data } = await anon.from('products').select('id').eq('restaurant_id', restaurantId);
    data && data.length === 1 ? ok('products of active restaurant readable') : fail('products of active restaurant NOT readable');
  }
  {
    const { data } = await anon.from('tenant_sessions').select('*').eq('restaurant_id', restaurantId);
    expectEmpty(data, 'tenant_sessions still hidden even when restaurant active');
  }

  // ── 0012: credential columns must be denied even on an ACTIVE restaurant ──
  // The restaurant is active at this point (flipped above), so the row-level
  // policy PERMITS the row. Only the column-level REVOKE from 0012 can block
  // these. A silent empty result is NOT a pass here — Postgres raises
  // "permission denied for column" when the grant is missing, so we require a
  // real error and additionally assert the secret never appears in the payload.
  console.log('— anon read of credential columns on an ACTIVE restaurant (0012) —');
  function expectColumnDenied(error, data, column, msg) {
    if (error) { ok(`${msg} (${error.code ?? 'error'})`); return; }
    const leaked = JSON.stringify(data ?? null);
    fail(`${msg} — NOT denied, column '${column}' returned ${leaked.slice(0, 120)}`);
  }
  {
    const { data, error } = await anon.from('restaurants').select('username').eq('id', restaurantId);
    expectColumnDenied(error, data, 'username', 'anon cannot select username');
  }
  {
    const { data, error } = await anon.from('restaurants').select('password_hash').eq('id', restaurantId);
    expectColumnDenied(error, data, 'password_hash', 'anon cannot select password_hash');
  }
  {
    const { data, error } = await anon
      .from('restaurants')
      .select('id, slug, username, password_hash')
      .eq('id', restaurantId);
    expectColumnDenied(error, data, 'username,password_hash', 'anon cannot mix credential columns into a legit select');
  }
  {
    // `select('*')` is the realistic attack: it must not smuggle the columns
    // through. If PostgREST expands '*' to only the granted columns this
    // returns rows — that is fine, as long as neither secret is present.
    const { data, error } = await anon.from('restaurants').select('*').eq('id', restaurantId);
    if (error) {
      ok('anon select * on active restaurant denied outright');
    } else {
      const row = Array.isArray(data) ? data[0] : data;
      const keys = row ? Object.keys(row) : [];
      if (!keys.includes('username') && !keys.includes('password_hash')) {
        ok(`anon select * carries no credential columns (got: ${keys.length} cols)`);
      } else {
        fail(`anon select * LEAKED credentials — keys: ${keys.join(', ')}`);
      }
    }
  }
  {
    // Filtering on a revoked column is another read channel: a working
    // `.eq('username', …)` would let an attacker confirm a username by probing.
    const { data, error } = await anon.from('restaurants').select('id').eq('username', SLUG);
    expectColumnDenied(error, data, 'username', 'anon cannot filter by username');
  }
} finally {
  console.log('— cleanup —');
  await cleanup();
}

if (failed > 0) {
  console.error(`\n${failed} RLS assertion(s) failed.`);
  process.exit(1);
}
console.log('\n✅ all RLS checks pass');
