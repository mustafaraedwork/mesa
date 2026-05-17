// Bug #2 RUNTIME smoke — drives a real browser via Playwright, observes
// network traffic, and asserts /api/menu/<slug> is requested at least twice
// within 35s of opening /r/<slug>. Catches the "code is in source but never
// runs" failure mode that grep-based contract tests miss.
//
// Run:  node --env-file=.env.local scripts/smoke-runtime-polling.mjs
// Requires: dev server already on http://localhost:3000

import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const SLUG = `smoke-runtime-${Date.now()}`;
const WAIT_MS = 35_000;

function pass(msg) { console.log(`  ✓ ${msg}`); }
function fail(msg) { console.error(`  ✗ ${msg}`); process.exit(1); }

console.log(`— seeding tenant ${SLUG} —`);
const { data: rest } = await sb.from('restaurants').insert({
  slug: SLUG,
  display_name: 'Runtime Polling Smoke',
  username: SLUG,
  password_hash: '$2b$10$smoketest.dummy.hash.value.placeholder.fortest',
  is_active: true,
  currency: 'IQD',
  show_unavailable_items: true,
  active_mode: 'normal',
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
  price: 2000,
  prep_time_minutes: 5,
  profit_percentage: 50,
  display_order: 0,
  is_available: true,
});

const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // Capture every network request to /api/menu/<slug>.
  const menuHits = [];
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes(`/api/menu/${SLUG}`)) {
      menuHits.push({ at: Date.now(), url });
    }
  });

  // Capture console errors — a hydration error would show here and explain
  // why the useEffect never runs.
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
  });

  console.log(`— [1] navigate to /r/${SLUG} —`);
  const tStart = Date.now();
  await page.goto(`${APP}/r/${SLUG}`, { waitUntil: 'networkidle' });
  const heading = await page.textContent('h1');
  pass(`page loaded, h1 = "${heading?.trim()}"`);

  // The initial server-render uses `loadMenu` directly, so the FIRST API hit
  // we see should be the client-side polling/refetch — not the server render.
  // Record initial count and wait.
  const initialCount = menuHits.length;
  console.log(`  initial /api/menu/${SLUG} request count: ${initialCount}`);

  console.log(`— [2] wait ${WAIT_MS / 1000}s — at least one poll must fire —`);
  await page.waitForTimeout(WAIT_MS);

  const finalCount = menuHits.length;
  const polledCount = finalCount - initialCount;
  console.log(`  final count: ${finalCount} (${polledCount} during the ${WAIT_MS / 1000}s wait)`);

  if (consoleErrors.length > 0) {
    console.error('  ✗ console errors (likely the real cause):');
    for (const e of consoleErrors) console.error(`    - ${e}`);
    fail('console errors during page lifetime');
  }
  pass('no console errors');

  if (polledCount < 1) {
    fail(`polling did NOT fire — expected ≥1 /api/menu/${SLUG} hit during 35s, got ${polledCount}. Hits: ${JSON.stringify(menuHits, null, 2)}`);
  }
  pass(`polling fired ${polledCount} time(s) during the wait window`);

  // Also verify the visibility-based pause: hide the tab, wait, then show it,
  // and confirm a poll fires within ~2s of becoming visible.
  console.log('— [3] visibility-change resumes polling —');
  const beforeHide = menuHits.length;
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(2000);
  const afterShow = menuHits.length;
  if (afterShow <= beforeHide) {
    fail(`visibilitychange did not trigger an immediate poll (before=${beforeHide}, after=${afterShow})`);
  }
  pass(`visibilitychange triggered an immediate refetch (${afterShow - beforeHide} hit)`);

  console.log('\nOK — runtime polling verified.');
} finally {
  await browser.close();
  console.log('\n— cleanup —');
  await sb.from('restaurants').delete().eq('id', rest.id);
  console.log('  deleted test tenant');
}
