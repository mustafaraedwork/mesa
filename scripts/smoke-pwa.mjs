// Phase 7 smoke — drives a real Chromium via Playwright to verify:
//   1. The diner SW registers and takes control on /r/<slug>.
//   2. Static + HTML + API responses are served from cache when offline.
//   3. The online no-store contract is preserved: a DB mutation is reflected
//      in the very next /api/menu/<slug> response while connectivity is up
//      (i.e. the SW must NOT serve a stale cached body when online).
//
// Run:  node --env-file=.env.local scripts/smoke-pwa.mjs
// Requires: dev server already on http://localhost:3000

import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const SLUG = `smoke-pwa-${Date.now()}`;

function pass(msg) { console.log(`  ✓ ${msg}`); }
function fail(msg) { console.error(`  ✗ ${msg}`); process.exit(1); }

console.log(`— seeding tenant ${SLUG} —`);
const { data: rest, error: restErr } = await sb.from('restaurants').insert({
  slug: SLUG,
  display_name: 'PWA Smoke',
  username: SLUG,
  password_hash: '$2b$10$smoketest.dummy.hash.value.placeholder.fortest',
  is_active: true,
  currency: 'IQD',
  show_unavailable_items: true,
  active_mode: 'normal',
  primary_color: '#2563eb',
  background_color: '#ffffff',
}).select('id').single();
if (restErr) fail(`seed failed: ${restErr.message}`);

const { data: cat } = await sb.from('categories').insert({
  restaurant_id: rest.id,
  name_ar: 'مشروبات',
  display_order: 0,
}).select('id').single();

const { data: prod } = await sb.from('products').insert({
  restaurant_id: rest.id,
  category_id: cat.id,
  name_ar: 'شاي',
  price: 2000,
  prep_time_minutes: 5,
  profit_percentage: 50,
  display_order: 0,
  is_available: true,
}).select('id').single();

const browser = await chromium.launch({ headless: true });
try {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`console.error: ${msg.text()}`);
  });

  // ── 1. ONLINE: page loads, SW registers and takes control ──────────────
  console.log(`— [1] online navigation to /r/${SLUG} —`);
  await page.goto(`${APP}/r/${SLUG}`, { waitUntil: 'networkidle' });
  const h1Online = (await page.textContent('h1'))?.trim();
  if (!h1Online?.includes('PWA Smoke')) fail(`h1 missing or wrong: "${h1Online}"`);
  pass(`page loaded online — h1 = "${h1Online}"`);

  // Wait until the SW is fully activated (its activate-handler waitUntil
  // chain has settled — that's where HTML_CACHE priming happens) AND it is
  // controlling this client. `serviceWorker.ready` resolves once activation
  // completes; then `clients.claim()` guarantees `controller != null`.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const hasController = await page.evaluate(() => navigator.serviceWorker.controller !== null);
  if (!hasController) fail('SW activated but did not claim the client');
  pass('service worker is active and controlling the page');

  // Confirm activate-time priming actually populated HTML_CACHE for this
  // URL. If this poll fails, offline reload below will too — fail fast and
  // loud here with a clearer error.
  const primed = await page.evaluate(async (href) => {
    for (let i = 0; i < 50; i++) {
      const cache = await caches.open('mesa-html-v1');
      const m = await cache.match(href);
      if (m) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  }, `${APP}/r/${SLUG}`);
  if (!primed) fail('HTML_CACHE was not primed within 5s after SW activation');
  pass('HTML_CACHE primed with the diner page');

  // Verify the manifest link points at the per-restaurant route.
  const manifestHref = await page.getAttribute('link[rel="manifest"]', 'href');
  if (manifestHref !== `/r/${SLUG}/manifest.webmanifest`) {
    fail(`manifest href wrong: "${manifestHref}"`);
  }
  pass(`manifest link = ${manifestHref}`);

  // Verify theme-color meta picks up the seeded primary_color.
  const themeColor = await page.getAttribute('meta[name="theme-color"]', 'content');
  if (themeColor?.toLowerCase() !== '#2563eb') {
    fail(`theme-color wrong: "${themeColor}" (expected #2563eb)`);
  }
  pass(`theme-color meta = ${themeColor}`);

  // Hit the manifest route directly and check the JSON body.
  const manifestRes = await page.request.get(`${APP}/r/${SLUG}/manifest.webmanifest`);
  if (manifestRes.status() !== 200) fail(`manifest GET = ${manifestRes.status()}`);
  const manifest = await manifestRes.json();
  if (manifest.theme_color?.toLowerCase() !== '#2563eb') {
    fail(`manifest.theme_color wrong: "${manifest.theme_color}"`);
  }
  if (manifest.start_url !== `/r/${SLUG}`) {
    fail(`manifest.start_url wrong: "${manifest.start_url}"`);
  }
  pass(`manifest JSON: theme_color=${manifest.theme_color}, start_url=${manifest.start_url}`);

  // ── 2. ONLINE no-store contract: DB mutation lands in next API hit ─────
  console.log('— [2] online no-store contract —');
  await sb.from('products').update({ price: 3000 }).eq('id', prod.id);
  // Force a fresh fetch through the SW (page-context, not request.get which
  // bypasses SW). Because navigator.onLine is true, the SW must hit network.
  const freshJson = await page.evaluate(async (slug) => {
    const r = await fetch(`/api/menu/${slug}`, { cache: 'no-store' });
    return r.json();
  }, SLUG);
  const freshPrice = freshJson.categories
    ?.flatMap((c) => c.products)
    .find((p) => p.id === prod.id)?.price;
  if (freshPrice !== 3000) {
    fail(`SW served stale data while online — got price=${freshPrice}, expected 3000`);
  }
  pass(`online fetch saw the new price (${freshPrice}) — no-store honoured`);

  // ── 3. OFFLINE: reload still renders, cached API still answers ─────────
  console.log('— [3] go offline + reload —');
  await ctx.setOffline(true);

  // The reload navigation should hit the SW's HTML cache.
  const navResponse = await page.reload({ waitUntil: 'domcontentloaded' });
  if (!navResponse || !navResponse.ok()) {
    fail(`offline reload failed: status=${navResponse?.status()}`);
  }
  const h1Offline = (await page.textContent('h1'))?.trim();
  if (!h1Offline?.includes('PWA Smoke')) {
    fail(`offline reload didn't render menu — h1 = "${h1Offline}"`);
  }
  pass(`offline reload rendered cached HTML — h1 = "${h1Offline}"`);

  // While offline, page-context fetch to the API must return the cached body.
  const offlineJson = await page.evaluate(async (slug) => {
    try {
      const r = await fetch(`/api/menu/${slug}`, { cache: 'no-store' });
      return { ok: r.ok, body: await r.json() };
    } catch (e) {
      return { ok: false, err: String(e) };
    }
  }, SLUG);
  if (!offlineJson.ok) fail(`offline API fetch failed: ${offlineJson.err ?? 'no body'}`);
  const offlineCount = offlineJson.body.categories?.[0]?.products?.length ?? 0;
  if (offlineCount < 1) fail(`offline API returned empty menu`);
  pass(`offline API served cached body (${offlineCount} product(s))`);

  // ── 4. cleanup checks ──────────────────────────────────────────────────
  await ctx.setOffline(false);
  if (consoleErrors.length > 0) {
    console.error('  ✗ console errors during run:');
    for (const e of consoleErrors) console.error(`    - ${e}`);
    fail('console errors observed');
  }
  pass('no console errors');

  console.log('\nOK — Phase 7 PWA contract verified.');
} finally {
  await browser.close();
  console.log('\n— cleanup —');
  await sb.from('restaurants').delete().eq('id', rest.id);
  console.log('  deleted test tenant');
}
