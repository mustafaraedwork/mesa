// Bug #3 regression guard: after a Closing activation, GET /api/menu/:slug
// must reflect the new state IMMEDIATELY (no HTTP cache, no stale read).
//
// Runs the same DB write the setMode action performs, then issues three
// back-to-back menu fetches: the first must reflect active_mode='closing'
// immediately, and the *fastest* of the three must land within a tight
// latency budget. min-of-3 absorbs transient WAN spikes to Supabase/Frankfurt
// while still catching a genuine route-handler slowdown (all three would slow).
//
// Run:  node --env-file=.env.local scripts/smoke-desync.mjs

import { createClient } from '@supabase/supabase-js';

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const TEST_SLUG = `smoke-desync-${Date.now()}`;
const MAX_LATENCY_MS = 1000;

function assert(cond, msg) {
  if (!cond) {
    console.error(`  ✗ ${msg}`);
    process.exit(1);
  }
  console.log(`  ✓ ${msg}`);
}

async function fetchMenu() {
  const res = await fetch(`${APP}/api/menu/${TEST_SLUG}`, { cache: 'no-store' });
  if (!res.ok) {
    console.error(`  fetch ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  return { json: await res.json(), headers: res.headers };
}

console.log(`— seeding tenant ${TEST_SLUG} —`);
const { data: rest } = await sb
  .from('restaurants')
  .insert({
    slug: TEST_SLUG,
    display_name: 'Desync Smoke',
    username: TEST_SLUG,
    password_hash: '$2b$10$smoketest.dummy.hash.value.placeholder.fortest',
    is_active: true,
    currency: 'IQD',
    show_unavailable_items: true,
    active_mode: 'normal',
  })
  .select('id')
  .single();
const restaurantId = rest.id;

const { data: cat } = await sb
  .from('categories')
  .insert({ restaurant_id: restaurantId, name_ar: 'مشروبات', display_order: 0 })
  .select('id')
  .single();

const { data: p1 } = await sb
  .from('products')
  .insert({
    restaurant_id: restaurantId,
    category_id: cat.id,
    name_ar: 'شاي',
    price: 2000,
    prep_time_minutes: 5,
    profit_percentage: 50,
    display_order: 0,
    is_available: true,
  })
  .select('id')
  .single();

try {
  console.log('\n— [1] baseline read: normal, no virtual category —');
  let { json: menu } = await fetchMenu();
  assert(menu.restaurant.active_mode === 'normal', 'baseline active_mode is normal');
  assert(menu.categories.every((c) => c.id !== '__closing__'), 'no virtual category');

  console.log('\n— [2] Cache-Control: no-store on the response —');
  const { headers } = await fetchMenu();
  const cc = headers.get('cache-control') ?? '';
  assert(/no-store/.test(cc), `Cache-Control includes no-store (got: "${cc}")`);

  console.log('\n— [3] activate Closing and fetch immediately —');
  const tWrite = Date.now();
  await sb
    .from('restaurants')
    .update({
      active_mode: 'closing',
      closing_mode_ends_at: new Date(Date.now() + 3_600_000).toISOString(),
      closing_mode_discount: 10,
    })
    .eq('id', restaurantId);
  await sb
    .from('products')
    .update({ is_in_closing_mode: true })
    .eq('id', p1.id);

  // The first read must reflect the new state immediately (no stale cache). We
  // then sample latency across 3 back-to-back reads and judge the *minimum*: a
  // single no-store round-trip to Supabase/Frankfurt spikes transiently on a WAN,
  // but a real route-handler regression makes every read slow. min-of-3 ignores
  // the transient spike while still holding the latency floor (budget unchanged).
  const samples = [];
  const tFirst = Date.now();
  ({ json: menu } = await fetchMenu());
  samples.push(Date.now() - tFirst);
  for (let i = 0; i < 2; i++) {
    const t = Date.now();
    await fetchMenu();
    samples.push(Date.now() - t);
  }
  const minLatency = Math.min(...samples);

  assert(
    menu.restaurant.active_mode === 'closing',
    `API reflects closing immediately (DB write→read = ${Date.now() - tWrite}ms, fetches = [${samples.join(', ')}]ms, min = ${minLatency}ms)`,
  );
  assert(
    typeof menu.restaurant.closing_mode_ends_at === 'string',
    'closing_mode_ends_at is set',
  );
  assert(
    menu.categories[0].id === '__closing__',
    'virtual __closing__ category at top',
  );
  assert(minLatency < MAX_LATENCY_MS, `fastest of 3 fetches under ${MAX_LATENCY_MS}ms`);

  console.log('\n— [4] back-to-back fetches stay fresh (no cache hit on 2nd) —');
  const { json: a } = await fetchMenu();
  const { json: b } = await fetchMenu();
  assert(a.server_now !== b.server_now, 'two fetches return distinct server_now (not cached)');

  console.log('\n— [5] deactivate → API reflects within one read —');
  await sb
    .from('restaurants')
    .update({ active_mode: 'normal', closing_mode_ends_at: null, closing_mode_discount: null })
    .eq('id', restaurantId);
  await sb
    .from('products')
    .update({ is_in_closing_mode: false })
    .eq('restaurant_id', restaurantId)
    .eq('is_in_closing_mode', true);

  ({ json: menu } = await fetchMenu());
  assert(menu.restaurant.active_mode === 'normal', 'deactivation reflected immediately');
  assert(
    menu.categories.every((c) => c.id !== '__closing__'),
    'virtual category gone',
  );

  console.log('\nOK — desync regression green.');
} finally {
  console.log('\n— cleanup —');
  await sb.from('restaurants').delete().eq('id', restaurantId);
  console.log('  deleted test tenant');
}
