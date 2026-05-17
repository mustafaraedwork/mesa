// End-to-end smoke test for Phase 4: Modes + Closing Mode.
//
// Exercises the data layer the way the server actions and the menu API will:
//   1. Create a fresh test restaurant + 2 categories + 3 products
//   2. Hit GET /api/menu/:slug → expect Normal sort + no virtual category
//   3. Activate Closing on 2 products with 10% discount, 1h
//   4. Hit menu API → expect __closing__ at top + derived prices + Q11 defensive
//   5. Switch to Rush → expect virtual gone + clearing of is_in_closing_mode
//   6. Activate Closing again, simulate expiry → expect lazy revert on next read
//
// Run:  node --env-file=.env.local scripts/smoke-modes.mjs

import { createClient } from '@supabase/supabase-js';

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const TEST_SLUG = `smoke-modes-${Date.now()}`;

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
  return res.json();
}

console.log(`— seeding test tenant: ${TEST_SLUG} —`);
const { data: rest } = await sb
  .from('restaurants')
  .insert({
    slug: TEST_SLUG,
    display_name: 'Smoke Test',
    username: TEST_SLUG,
    password_hash: '$2b$10$smoketest.dummy.hash.value.placeholder.fortest',
    is_active: true,
    currency: 'IQD',
    show_unavailable_items: true,
  })
  .select('id')
  .single();
const restaurantId = rest.id;

const { data: cat1 } = await sb.from('categories').insert({
  restaurant_id: restaurantId, name_ar: 'مقبّلات', display_order: 0,
}).select('id').single();
const { data: cat2 } = await sb.from('categories').insert({
  restaurant_id: restaurantId, name_ar: 'أطباق رئيسية', display_order: 1,
}).select('id').single();

const products = [
  { name_ar: 'حمّص',  price: 3500, prep: 5,  profit: 60, cat: cat1.id, order: 0 },
  { name_ar: 'سلطة',  price: 4000, prep: 3,  profit: 40, cat: cat1.id, order: 1 },
  { name_ar: 'كباب',  price: 12000, prep: 15, profit: 30, cat: cat2.id, order: 0 },
];
const productRows = [];
for (const p of products) {
  const { data } = await sb.from('products').insert({
    restaurant_id: restaurantId,
    category_id: p.cat,
    name_ar: p.name_ar,
    price: p.price,
    prep_time_minutes: p.prep,
    profit_percentage: p.profit,
    display_order: p.order,
    is_available: true,
  }).select('id, name_ar, price').single();
  productRows.push(data);
}
console.log(`  seeded restaurant=${restaurantId.slice(0,8)} 2 categories, 3 products`);

try {
  console.log('\n— [1] Normal mode (default) —');
  let menu = await fetchMenu();
  assert(menu.restaurant.active_mode === 'normal', 'active_mode is normal');
  assert(menu.categories.length === 2, '2 real categories returned');
  assert(menu.categories[0].id !== '__closing__', 'no virtual category');
  const allHaveOriginal = menu.categories.flatMap((c) => c.products).every((p) => p.original_price === null && p.discount_percent === null);
  assert(allHaveOriginal, 'all products carry their original price');
  assert(typeof menu.server_now === 'string', 'server_now is present');

  console.log('\n— [2] Activate Closing 10% on 2 products, 1h —');
  await sb
    .from('restaurants')
    .update({
      active_mode: 'closing',
      closing_mode_ends_at: new Date(Date.now() + 3_600_000).toISOString(),
      closing_mode_discount: 10,
    })
    .eq('id', restaurantId);
  await sb.from('products').update({ is_in_closing_mode: true })
    .in('id', [productRows[0].id, productRows[2].id]);

  menu = await fetchMenu();
  assert(menu.restaurant.active_mode === 'closing', 'active_mode is closing');
  assert(menu.categories[0].id === '__closing__', 'virtual category at top');
  assert(menu.categories[0].is_virtual === true, 'is_virtual flag set');
  assert(menu.categories[0].products.length === 2, '2 products in virtual category');
  // Q1 derivation + Q2 IQD rounding: 3500 × 0.9 = 3150 → floor(3150/250)*250 = 3000.
  const hummus = menu.categories[0].products.find((p) => p.name_ar === 'حمّص');
  assert(hummus !== undefined, 'حمّص present in virtual category');
  assert(hummus.original_price === 3500, 'original_price = 3500');
  assert(hummus.price === 3000, 'derived price = 3000 (effective 14.3% off ≥ 10% promised)');
  assert(hummus.discount_percent === 10, 'discount_percent = 10');
  // Same product also appears in its original category with same derived price (Q4).
  const hummusInCat = menu.categories[1].products.find((p) => p.id === hummus.id);
  assert(hummusInCat !== undefined && hummusInCat.price === 3000, 'حمّص also in original category at discounted price');
  // Non-closing product unchanged.
  const realAppetizers = menu.categories.find((c) => c.name_ar === 'مقبّلات');
  const saladInCat = realAppetizers.products.find((p) => p.name_ar === 'سلطة');
  assert(saladInCat.original_price === null, 'سلطة has no original_price (not in closing)');

  console.log('\n— [3] Switch to Rush — clean-and-apply should clear closing state —');
  // Simulate the setMode action's clean-and-apply manually.
  await sb.from('restaurants').update({ active_mode: 'rush', closing_mode_ends_at: null, closing_mode_discount: null }).eq('id', restaurantId);
  await sb.from('products').update({ is_in_closing_mode: false }).eq('restaurant_id', restaurantId).eq('is_in_closing_mode', true);

  menu = await fetchMenu();
  assert(menu.restaurant.active_mode === 'rush', 'active_mode is rush');
  assert(menu.categories.every((c) => c.id !== '__closing__'), 'virtual category gone');
  // Rush sort: within مقبّلات, prep_time ASC → سلطة (3) before حمّص (5).
  const appetizers = menu.categories.find((c) => c.name_ar === 'مقبّلات');
  assert(appetizers.products[0].name_ar === 'سلطة', 'Rush sort: سلطة first (prep 3 < 5)');
  assert(appetizers.products[1].name_ar === 'حمّص', 'Rush sort: حمّص second');

  console.log('\n— [4] Activate Closing then simulate expiry → lazy revert —');
  await sb
    .from('restaurants')
    .update({
      active_mode: 'closing',
      closing_mode_ends_at: new Date(Date.now() - 60_000).toISOString(), // 1 min ago
      closing_mode_discount: 20,
    })
    .eq('id', restaurantId);
  await sb.from('products').update({ is_in_closing_mode: true }).eq('id', productRows[0].id);

  menu = await fetchMenu();
  assert(menu.restaurant.active_mode === 'normal', 'lazy revert flipped to normal');
  assert(menu.restaurant.closing_mode_ends_at === null, 'closing_mode_ends_at cleared');
  assert(menu.restaurant.closing_mode_discount === null, 'closing_mode_discount cleared');
  // Verify is_in_closing_mode also cleared.
  const { data: postRevert } = await sb
    .from('products')
    .select('is_in_closing_mode')
    .eq('restaurant_id', restaurantId)
    .eq('is_in_closing_mode', true);
  assert(postRevert.length === 0, 'all products is_in_closing_mode = false after lazy revert');

  console.log('\nOK — Phase 4 modes + closing tracer green.');
} finally {
  console.log('\n— cleanup —');
  await sb.from('restaurants').delete().eq('id', restaurantId);
  console.log('  deleted test tenant');
}
