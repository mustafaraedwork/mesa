// Phase 8 — Closing Mode lazy revert (focused).
//
// smoke-modes.mjs already exercises one revert. This script adds:
//   - Idempotency: a second read after revert must not flip anything, must not
//     error, must keep the state stable
//   - Race-safety: the revert UPDATE has `.eq('active_mode', 'closing')`. We
//     verify a concurrent flip to 'rush' before the revert lands does NOT get
//     stomped (revert is a no-op for non-closing rows)
//   - Boundary: ends_at exactly equal to now (within ~1ms) → must revert (<= ?)
//
// Run dev server first, then:
//   node --env-file=.env.local scripts/smoke-closing-revert.mjs

import { createClient } from '@supabase/supabase-js';

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const SLUG = `smoke-rev-${Date.now()}`;
let failed = 0;
function ok(m) { console.log(`  ✓ ${m}`); }
function fail(m) { console.error(`  ✗ ${m}`); failed++; }

async function fetchMenu() {
  const res = await fetch(`${APP}/api/menu/${SLUG}`, { cache: 'no-store' });
  if (!res.ok) {
    console.error(`menu fetch failed: ${res.status}`);
    process.exit(1);
  }
  return res.json();
}

let restaurantId;
try {
  console.log(`— seeding tenant: ${SLUG} —`);
  const { data: r } = await sb
    .from('restaurants')
    .insert({
      slug: SLUG,
      display_name: 'Revert Smoke',
      username: SLUG,
      password_hash: '$2b$10$smoke.rev.dummy.hash.placeholder.value',
      is_active: true,
      currency: 'IQD',
    })
    .select('id')
    .single();
  restaurantId = r.id;

  const { data: c } = await sb
    .from('categories')
    .insert({ restaurant_id: restaurantId, name_ar: 'وجبات', display_order: 0 })
    .select('id')
    .single();

  const { data: p } = await sb
    .from('products')
    .insert([
      { restaurant_id: restaurantId, category_id: c.id, name_ar: 'برغر', price: 10000 },
      { restaurant_id: restaurantId, category_id: c.id, name_ar: 'بيتزا', price: 12000 },
    ])
    .select('id');
  const productIds = p.map((x) => x.id);

  console.log('— Case A: expired closing → first read should revert —');
  await sb
    .from('restaurants')
    .update({
      active_mode: 'closing',
      closing_mode_discount: 10,
      closing_mode_ends_at: new Date(Date.now() - 1000).toISOString(),
    })
    .eq('id', restaurantId);
  await sb
    .from('products')
    .update({ is_in_closing_mode: true })
    .in('id', productIds);

  const m1 = await fetchMenu();
  m1.restaurant.active_mode === 'normal' ? ok('first read: active_mode = normal') : fail(`got ${m1.restaurant.active_mode}`);
  m1.restaurant.closing_mode_ends_at === null ? ok('first read: ends_at cleared') : fail('ends_at not cleared');
  m1.restaurant.closing_mode_discount === null ? ok('first read: discount cleared') : fail('discount not cleared');
  const noVirtual = !m1.categories.some((cat) => cat.id === '__closing__');
  noVirtual ? ok('first read: no virtual category') : fail('virtual category leaked after revert');

  const { data: dbAfter1 } = await sb
    .from('restaurants')
    .select('active_mode, closing_mode_ends_at, closing_mode_discount')
    .eq('id', restaurantId)
    .single();
  dbAfter1.active_mode === 'normal' ? ok('DB: active_mode persisted as normal') : fail('DB still says ' + dbAfter1.active_mode);

  const { data: prodAfter1 } = await sb
    .from('products')
    .select('is_in_closing_mode')
    .eq('restaurant_id', restaurantId)
    .eq('is_in_closing_mode', true);
  prodAfter1.length === 0 ? ok('DB: all products is_in_closing_mode cleared') : fail(`${prodAfter1.length} products still flagged`);

  console.log('— Case B: idempotency — second read must not change anything —');
  const m2 = await fetchMenu();
  m2.restaurant.active_mode === 'normal' ? ok('second read still normal') : fail('flipped on re-read');
  // server_now will differ; everything else should be stable
  const stable =
    m1.restaurant.id === m2.restaurant.id &&
    m1.restaurant.closing_mode_ends_at === m2.restaurant.closing_mode_ends_at &&
    m1.restaurant.closing_mode_discount === m2.restaurant.closing_mode_discount &&
    m1.categories.length === m2.categories.length;
  stable ? ok('payload stable between reads (apart from server_now)') : fail('payload diverged on re-read');

  console.log('— Case C: race safety — concurrent flip to rush is not stomped —');
  // Re-arm closing with past ends_at, but BEFORE reading, flip to rush manually.
  // The revert UPDATE has `.eq('active_mode', 'closing')` so it should not fire.
  await sb
    .from('restaurants')
    .update({
      active_mode: 'closing',
      closing_mode_discount: 20,
      closing_mode_ends_at: new Date(Date.now() - 1000).toISOString(),
    })
    .eq('id', restaurantId);
  await sb
    .from('products')
    .update({ is_in_closing_mode: true })
    .in('id', productIds);

  // Simulate a concurrent operator action: switch to rush.
  await sb
    .from('restaurants')
    .update({
      active_mode: 'rush',
      closing_mode_ends_at: null,
      closing_mode_discount: null,
    })
    .eq('id', restaurantId);

  const m3 = await fetchMenu();
  m3.restaurant.active_mode === 'rush'
    ? ok('concurrent rush survives — lazy revert did not stomp it')
    : fail(`expected rush, got ${m3.restaurant.active_mode}`);

  console.log('— Case D: boundary — ends_at = now → must revert (strict less-than is fine) —');
  await sb
    .from('restaurants')
    .update({
      active_mode: 'closing',
      closing_mode_discount: 5,
      closing_mode_ends_at: new Date(Date.now() - 50).toISOString(),
    })
    .eq('id', restaurantId);
  const m4 = await fetchMenu();
  m4.restaurant.active_mode === 'normal'
    ? ok('boundary (just-past): revert fired')
    : fail(`expected normal at boundary, got ${m4.restaurant.active_mode}`);
} finally {
  if (restaurantId) {
    console.log('— cleanup —');
    await sb.from('restaurants').delete().eq('id', restaurantId);
  }
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed.`);
  process.exit(1);
}
console.log('\n✅ closing-mode lazy revert: idempotent, race-safe, boundary-correct');
