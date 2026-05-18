// Analytics smoke — verifies the /api/track ingest writes `events` rows and
// the product page renders. Covers Analytics phases A + B.
//
// Run:  node --env-file=.env.local scripts/smoke-analytics.mjs
// Requires: dev server on http://localhost:3000 + the 0003_events migration.

import { createClient } from '@supabase/supabase-js';

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const SLUG = `smoke-analytics-${Date.now()}`;

function assert(cond, msg) {
  if (!cond) {
    console.error(`  ✗ ${msg}`);
    process.exit(1);
  }
  console.log(`  ✓ ${msg}`);
}

async function track(body) {
  return fetch(`${APP}/api/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

console.log(`— seeding tenant ${SLUG} —`);
const { data: rest } = await sb
  .from('restaurants')
  .insert({
    slug: SLUG,
    display_name: 'Analytics Smoke',
    username: SLUG,
    password_hash: '$2b$10$smoketest.dummy.hash.value.placeholder.fortest',
    is_active: true,
    currency: 'IQD',
  })
  .select('id')
  .single();
const restaurantId = rest.id;

const { data: cat } = await sb
  .from('categories')
  .insert({ restaurant_id: restaurantId, name_ar: 'مشروبات', display_order: 0 })
  .select('id')
  .single();

const { data: prod } = await sb
  .from('products')
  .insert({
    restaurant_id: restaurantId,
    category_id: cat.id,
    name_ar: 'شاي نعناع',
    price: 1500,
    prep_time_minutes: 3,
    profit_percentage: 50,
    display_order: 0,
    is_available: true,
  })
  .select('id')
  .single();

try {
  console.log('\n— [1] POST /api/track — three event kinds —');
  const r1 = await track({ slug: SLUG, kind: 'menu_open' });
  assert(r1.status === 204, 'menu_open → 204');
  const r2 = await track({ slug: SLUG, kind: 'product_open', product_id: prod.id });
  assert(r2.status === 204, 'product_open → 204');
  const r3 = await track({ slug: SLUG, kind: 'product_add', product_id: prod.id });
  assert(r3.status === 204, 'product_add → 204');

  // Give the inserts a beat to land.
  await new Promise((res) => setTimeout(res, 400));

  const { data: events } = await sb
    .from('events')
    .select('kind, product_id')
    .eq('restaurant_id', restaurantId);
  assert(events.length === 3, `3 event rows recorded (got ${events.length})`);
  assert(
    events.some((e) => e.kind === 'menu_open' && e.product_id === null),
    'menu_open row has no product_id',
  );
  assert(
    events.some((e) => e.kind === 'product_open' && e.product_id === prod.id),
    'product_open row carries product_id',
  );
  assert(
    events.some((e) => e.kind === 'product_add' && e.product_id === prod.id),
    'product_add row carries product_id',
  );

  console.log('\n— [2] bad input is swallowed, not recorded —');
  const rBad = await track({ slug: SLUG, kind: 'not_a_kind' });
  assert(rBad.status === 204, 'invalid kind → 204 (swallowed)');
  const rForeign = await track({
    slug: SLUG,
    kind: 'product_open',
    product_id: '00000000-0000-0000-0000-000000000000',
  });
  assert(rForeign.status === 204, 'non-owned product_id → 204');
  await new Promise((res) => setTimeout(res, 400));
  const { count: afterBad } = await sb
    .from('events')
    .select('*', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId);
  assert(afterBad === 4, `invalid kind added nothing; foreign id logged sans product (got ${afterBad})`);

  console.log('\n— [3] product page renders —');
  const res = await fetch(`${APP}/r/${SLUG}/p/${prod.id}`);
  assert(res.status === 200, `GET /r/${SLUG}/p/${prod.id} → 200`);
  const html = await res.text();
  assert(html.includes('شاي نعناع'), 'product page HTML contains the product name');

  console.log('\nOK — analytics ingest + product page green.');
} finally {
  console.log('\n— cleanup —');
  await sb.from('restaurants').delete().eq('id', restaurantId);
  console.log('  deleted test tenant (events cascade)');
}
