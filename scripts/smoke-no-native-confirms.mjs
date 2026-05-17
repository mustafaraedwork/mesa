// Smoke — asserts T2 and T3 dialogs render as DOM-based shadcn AlertDialogs
// (no window.confirm). Validates the alertdialog role is queryable, the
// action button changes mode, and no native page.on('dialog') ever fires.
//
// Run:  node --env-file=.env.local scripts/smoke-no-native-confirms.mjs
// Requires: dev server already on http://localhost:3000

import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const SLUG = `smoke-no-native-${Date.now()}`;
const SESSION_COOKIE = 'mesa-tenant-token';

function pass(msg) { console.log(`  ✓ ${msg}`); }
function fail(msg) { console.error(`  ✗ ${msg}`); process.exit(1); }

console.log(`— seeding tenant ${SLUG} (active Closing 10%, 1h, 1 product) —`);
const { data: rest } = await sb.from('restaurants').insert({
  slug: SLUG,
  display_name: 'No-Native Smoke',
  username: SLUG,
  password_hash: '$2b$10$smoketest.dummy.hash.value.placeholder.fortest',
  is_active: true,
  currency: 'IQD',
  show_unavailable_items: true,
  active_mode: 'closing',
  closing_mode_ends_at: new Date(Date.now() + 3_600_000).toISOString(),
  closing_mode_discount: 10,
}).select('id').single();

const { data: cat } = await sb.from('categories').insert({
  restaurant_id: rest.id,
  name_ar: 'مشروبات',
  display_order: 0,
}).select('id').single();

await sb.from('products').insert({
  restaurant_id: rest.id,
  category_id: cat.id,
  name_ar: 'شاي',
  price: 5000,
  prep_time_minutes: 5,
  profit_percentage: 50,
  display_order: 0,
  is_available: true,
  is_in_closing_mode: true,
});

const token = randomBytes(32).toString('hex');
await sb.from('tenant_sessions').insert({
  restaurant_id: rest.id,
  token,
  device_info: 'playwright',
});

const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext();
  await ctx.addCookies([{
    name: SESSION_COOKIE,
    value: token,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
  }]);
  const page = await ctx.newPage();

  // If a native dialog EVER fires, that's a regression — the whole point
  // of this smoke is that we don't use window.confirm anymore.
  const nativeDialogs = [];
  page.on('dialog', async (dialog) => {
    nativeDialogs.push({ type: dialog.type(), message: dialog.message() });
    await dialog.dismiss();
  });

  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`console.error: ${m.text()}`); });

  console.log('— [1] open /admin/dashboard/modes —');
  await page.goto(`${APP}/admin/dashboard/modes`, { waitUntil: 'networkidle' });
  if (!page.url().includes('/admin/dashboard/modes')) fail(`auth failed — landed on ${page.url()}`);
  pass(`landed on ${page.url()}`);
  await page.waitForSelector('text=نشط', { timeout: 5000 });

  console.log('— [2] click "تفعيل" on Rush card → expect DOM alertdialog —');
  const rushCard = page.locator('[data-mode="rush"]');
  await rushCard.locator('button:has-text("تفعيل")').click();

  const t2 = page.locator('[role="alertdialog"]');
  await t2.waitFor({ state: 'visible', timeout: 3000 });
  pass('T2 [role="alertdialog"] is visible in DOM');

  const t2Text = await t2.innerText();
  if (!t2Text.includes('سيُلغي عرض الإغلاق')) {
    fail(`T2 text mismatch — got: "${t2Text}"`);
  }
  pass('T2 contains the expected Arabic confirmation text');

  console.log('— [3] click متابعة → mode flips to rush, dialog dismisses —');
  await t2.locator('button:has-text("متابعة")').click();
  // Poll the DB for up to 5s — dev-mode server actions can compile on first hit.
  let postT2;
  for (let i = 0; i < 25; i++) {
    const r = await sb.from('restaurants').select('active_mode').eq('id', rest.id).single();
    postT2 = r.data;
    if (postT2?.active_mode === 'rush') break;
    await page.waitForTimeout(200);
  }
  if (postT2.active_mode !== 'rush') fail(`expected active_mode=rush, got ${postT2.active_mode}`);
  pass('Action button switched mode to rush in DB');

  if (await t2.isVisible().catch(() => false)) {
    fail('T2 dialog still visible after action click');
  }
  pass('T2 dialog dismissed after action');

  console.log('— [4] re-seed Closing then test T3 + Cancel —');
  await sb.from('restaurants').update({
    active_mode: 'closing',
    closing_mode_ends_at: new Date(Date.now() + 3_600_000).toISOString(),
    closing_mode_discount: 10,
  }).eq('id', rest.id);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('text=تعديل العرض', { timeout: 5000 });

  await page.locator('button:has-text("تعديل العرض")').first().click();
  const t3 = page.locator('[role="alertdialog"]');
  await t3.waitFor({ state: 'visible', timeout: 3000 });
  const t3Text = await t3.innerText();
  if (!t3Text.includes('ينتهي خلال') || !t3Text.includes('سيستبدله')) {
    fail(`T3 text mismatch — got: "${t3Text}"`);
  }
  if (!/(\d+س\s*\d{2}د|\d+د)/.test(t3Text)) {
    fail(`T3 missing remaining-time format — got: "${t3Text}"`);
  }
  pass('T3 [role="alertdialog"] visible with remaining-time + correct text');

  await t3.locator('button:has-text("إلغاء")').click();
  await page.waitForTimeout(400);
  if (await t3.isVisible().catch(() => false)) {
    fail('T3 dialog still visible after Cancel click');
  }
  pass('Cancel dismisses T3 dialog');

  const { data: postT3 } = await sb.from('restaurants').select('active_mode').eq('id', rest.id).single();
  if (postT3.active_mode !== 'closing') fail(`Cancel mutated mode — DB shows ${postT3.active_mode}`);
  pass('Cancel preserved Closing in DB');

  if (nativeDialogs.length > 0) {
    fail(`native window.confirm/alert fired ${nativeDialogs.length}× — regression: ${JSON.stringify(nativeDialogs)}`);
  }
  pass('zero native dialogs fired across the whole flow');

  if (consoleErrors.length > 0) {
    console.error('  console errors:');
    for (const e of consoleErrors) console.error(`    - ${e}`);
    fail('console errors during page lifetime');
  }
  pass('no console errors');

  console.log('\nOK — T2 + T3 are DOM AlertDialogs; no native confirms remain.');
} finally {
  await browser.close();
  console.log('\n— cleanup —');
  await sb.from('restaurants').delete().eq('id', rest.id);
  console.log('  deleted test tenant');
}
