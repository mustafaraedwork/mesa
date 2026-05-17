// Phase 8 — R1: RLS smoke test.
//
// Verifies that the anon key (what an attacker on the diner page has) cannot:
//   1. Read an inactive restaurant
//   2. Read categories/products belonging to an inactive restaurant
//   3. Read tenant_sessions (no public policy)
//   4. Insert/update/delete on any table
//
// Run:  node --env-file=.env.local scripts/smoke-rls.mjs

import { createClient } from '@supabase/supabase-js';

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
    .insert({ restaurant_id: restaurantId, token: `secret-token-${SLUG}` });

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
    const { error } = await anon.from('tenant_sessions').insert({
      restaurant_id: restaurantId,
      token: 'forged-token',
    });
    error ? ok('anon insert tenant_sessions blocked (explicit error)') : fail('anon insert tenant_sessions ALLOWED');
    const { data: count } = await admin
      .from('tenant_sessions')
      .select('id')
      .eq('token', 'forged-token');
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
} finally {
  console.log('— cleanup —');
  await cleanup();
}

if (failed > 0) {
  console.error(`\n${failed} RLS assertion(s) failed.`);
  process.exit(1);
}
console.log('\n✅ all RLS checks pass');
