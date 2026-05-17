// Bug #1 + #1b RUNTIME smoke — drives a real browser, listens for native
// confirm() dialogs, and verifies T2 (switch away from active Closing) and
// T3 (re-activate while running) actually appear on click.
//
// Run:  node --env-file=.env.local scripts/smoke-runtime-confirms.mjs
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

const SLUG = `smoke-confirm-${Date.now()}`;
const SESSION_COOKIE = 'mesa-tenant-token';

function pass(msg) { console.log(`  ✓ ${msg}`); }
function fail(msg) { console.error(`  ✗ ${msg}`); process.exit(1); }

console.log(`— seeding tenant ${SLUG} (active Closing 10%, 1h, 1 product) —`);
const { data: rest } = await sb.from('restaurants').insert({
  slug: SLUG,
  display_name: 'Confirm Smoke',
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

const { data: prod } = await sb.from('products').insert({
  restaurant_id: rest.id,
  category_id: cat.id,
  name_ar: 'شاي',
  price: 5000,
  prep_time_minutes: 5,
  profit_percentage: 50,
  display_order: 0,
  is_available: true,
  is_in_closing_mode: true,
}).select('id').single();

// Mint a tenant session token + insert directly so Playwright can set it
// without going through the login form.
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

  const dialogs = [];
  // Auto-dismiss every dialog and record its message so we can assert it
  // appeared with the right text.
  page.on('dialog', async (dialog) => {
    dialogs.push({ type: dialog.type(), message: dialog.message() });
    await dialog.dismiss();
  });

  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`console.error: ${m.text()}`); });

  console.log('— [1] open /admin/dashboard/modes —');
  await page.goto(`${APP}/admin/dashboard/modes`, { waitUntil: 'networkidle' });
  // Verify we landed on modes (not redirected to /admin login).
  const url = page.url();
  if (!url.includes('/admin/dashboard/modes')) fail(`auth failed — landed on ${url}`);
  pass(`landed on ${url}`);

  // Wait for hydration: the "نشط" badge appears only client-side reads `state`.
  await page.waitForSelector('text=نشط', { timeout: 5000 });
  pass('Closing card shows "نشط" badge — client component hydrated');

  console.log('— [2] click "تفعيل" on Rush card → expect T2 confirm —');
  // Find the Rush card by its title text, then click the "تفعيل" button inside it.
  const rushCard = page.locator('div').filter({ has: page.locator('text=الزحام') }).first();
  await rushCard.locator('button:has-text("تفعيل")').first().click();
  // Give the dialog handler a moment.
  await page.waitForTimeout(500);

  if (dialogs.length === 0) {
    fail('T2 confirm did NOT appear — Bug #1 reproduced');
  }
  const t2 = dialogs[0];
  console.log(`  dialog message: "${t2.message}"`);
  if (!t2.message.includes('سيُلغي عرض الإغلاق')) {
    fail(`T2 dialog text mismatch: "${t2.message}"`);
  }
  pass('T2 confirm appeared with the correct text');
  // We dismissed → DB should still be in Closing.
  const { data: postT2 } = await sb.from('restaurants').select('active_mode').eq('id', rest.id).single();
  if (postT2.active_mode !== 'closing') fail(`Cancel did not preserve closing — DB shows ${postT2.active_mode}`);
  pass('Cancel preserved Closing in DB');

  console.log('— [3] click "تعديل العرض" on Closing card → expect T3 confirm —');
  // The Closing card is the only one labelled "تعديل العرض" while active.
  await page.locator('button:has-text("تعديل العرض")').first().click();
  await page.waitForTimeout(500);

  if (dialogs.length < 2) {
    fail(`T3 confirm did NOT appear — Bug #1b reproduced. Dialogs so far: ${JSON.stringify(dialogs)}`);
  }
  const t3 = dialogs[1];
  console.log(`  dialog message: "${t3.message}"`);
  if (!t3.message.includes('ينتهي خلال') || !t3.message.includes('سيستبدله')) {
    fail(`T3 dialog text mismatch: "${t3.message}"`);
  }
  // Verify the dialog includes a remaining-time string of the form Hس MMد or just MMد.
  if (!/(\d+س\s*\d{2}د|\d+د)/.test(t3.message)) {
    fail(`T3 dialog missing remaining-time format: "${t3.message}"`);
  }
  pass('T3 confirm appeared with remaining-time and the correct text');

  if (consoleErrors.length > 0) {
    console.error('  console errors:');
    for (const e of consoleErrors) console.error(`    - ${e}`);
    fail('console errors during page lifetime');
  }
  pass('no console errors');

  console.log('\nOK — T2 + T3 confirms verified at runtime.');
} finally {
  await browser.close();
  console.log('\n— cleanup —');
  await sb.from('restaurants').delete().eq('id', rest.id);
  console.log('  deleted test tenant');
}
