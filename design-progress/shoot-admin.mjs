// Phase-2 admin screenshots. The tenant dashboard is auth-gated, so we seed an
// ephemeral tenant + a tenant_sessions cookie (same pattern as
// scripts/smoke-no-native-confirms.mjs), capture the redesigned screens at a
// mobile viewport, then delete the tenant (cascade cleans the rest).
//
// Run:  node --env-file=.env.local design-progress/shoot-admin.mjs [outDir]

import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const OUT = process.argv[2] || 'design-progress/phase-2';
mkdirSync(OUT, { recursive: true });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const SLUG = `shoot-admin-${Date.now()}`;
const SESSION_COOKIE = 'mesa-tenant-token';
const DAY = 86_400_000;
const mobile = { width: 390, height: 844, deviceScaleFactor: 2 };

// Reuse a real R2 image URL (allowed by next.config remotePatterns) for a few
// products so next/image renders and the analytics "with image" group shows.
const { data: imgRow } = await sb
  .from('products')
  .select('image_url')
  .not('image_url', 'is', null)
  .limit(1)
  .maybeSingle();
const SAMPLE_IMG = imgRow?.image_url ?? null;
console.log('sample image:', SAMPLE_IMG ? 'found' : 'none (icon fallback)');

console.log(`— seeding ${SLUG} —`);
const { data: rest } = await sb
  .from('restaurants')
  .insert({
    slug: SLUG,
    display_name: 'مطعم الأصيل',
    username: SLUG,
    password_hash: '$2b$10$smoketest.dummy.hash.value.placeholder.fortest',
    is_active: true,
    currency: 'IQD',
    show_unavailable_items: true,
    active_mode: 'normal',
    primary_color: '#0f766e',
    background_color: '#f5faf8',
    header_color: '#0f5f59',
    card_color: '#ffffff',
    text_color: '#13211e',
  })
  .select('id')
  .single();

async function cat(name_ar, display_order, parent_id = null) {
  const { data } = await sb
    .from('categories')
    .insert({ restaurant_id: rest.id, name_ar, parent_id, display_order })
    .select('id')
    .single();
  return data.id;
}
async function product(category_id, name_ar, name_en, price, opts = {}) {
  const { data } = await sb
    .from('products')
    .insert({
      restaurant_id: rest.id,
      category_id,
      name_ar,
      name_en,
      price,
      prep_time_minutes: opts.prep ?? 8,
      profit_percentage: opts.profit ?? 40,
      display_order: opts.order ?? 0,
      is_available: opts.available ?? true,
      is_chef_pick: opts.chef ?? false,
      image_url: opts.img ?? null,
    })
    .select('id')
    .single();
  return data.id;
}

const cMishawi = await cat('المشاوي', 0);
const cDrinks = await cat('المشروبات', 1);
const cJuice = await cat('العصائر الطازجة', 0, cDrinks);

const pids = [];
pids.push(await product(cMishawi, 'تكة دجاج', 'Chicken Tikka', 12000, { chef: true, img: SAMPLE_IMG, order: 0, prep: 15 }));
pids.push(await product(cMishawi, 'كباب لحم', 'Lamb Kebab', 15000, { chef: true, img: SAMPLE_IMG, order: 1, prep: 18 }));
pids.push(await product(cMishawi, 'ريش غنم', 'Lamb Chops', 22000, { order: 2, available: false }));
pids.push(await product(cDrinks, 'شاي عراقي', 'Iraqi Tea', 1000, { order: 0, prep: 3 }));
pids.push(await product(cDrinks, 'قهوة عربية', 'Arabic Coffee', 2000, { chef: true, order: 1, prep: 4 }));
pids.push(await product(cJuice, 'عصير برتقال', 'Orange Juice', 4000, { img: SAMPLE_IMG, order: 0 }));
pids.push(await product(cJuice, 'عصير رمان', 'Pomegranate', 5000, { order: 1 }));

// Seed analytics events across the last 7 days (menu opens + per-product opens/adds).
const events = [];
for (let d = 0; d < 7; d++) {
  const base = Date.now() - d * DAY;
  const opens = 6 + ((d * 5) % 11);
  for (let i = 0; i < opens; i++) {
    events.push({ restaurant_id: rest.id, kind: 'menu_open', product_id: null, created_at: new Date(base - i * 600_000).toISOString() });
  }
  pids.forEach((pid, idx) => {
    const n = ((idx + 1) * (7 - d)) % 9;
    for (let i = 0; i < n; i++) {
      events.push({ restaurant_id: rest.id, kind: 'product_open', product_id: pid, created_at: new Date(base - i * 300_000).toISOString() });
    }
    if (n > 3) events.push({ restaurant_id: rest.id, kind: 'product_add', product_id: pid, created_at: new Date(base).toISOString() });
  });
}
await sb.from('events').insert(events);
console.log(`seeded ${pids.length} products, ${events.length} events`);

const token = randomBytes(32).toString('hex');
await sb.from('tenant_sessions').insert({ restaurant_id: rest.id, token, device_info: 'shoot-admin' });

const browser = await chromium.launch();
async function snap(page, name) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log('  ✓', name);
}

try {
  const ctx = await browser.newContext({ viewport: mobile, isMobile: true, hasTouch: true });
  await ctx.addCookies([
    { name: SESSION_COOKIE, value: token, domain: 'localhost', path: '/', httpOnly: true, secure: false, sameSite: 'Lax' },
  ]);
  const page = await ctx.newPage();

  // 01 — menu editor
  await page.goto(`${APP}/admin/dashboard/menu`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('text=المنيو', { timeout: 8000 }).catch(() => {});
  await snap(page, '01-menu');

  // 02 — product dialog (primary "+ منتج" on first category)
  await page.getByRole('button', { name: /^منتج$/ }).first().click({ timeout: 6000 }).catch(() => {});
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 }).catch(() => {});
  await snap(page, '02-menu-product-dialog');
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);

  // 03 — modes hero
  await page.goto(`${APP}/admin/dashboard/modes`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('text=الأوضاع', { timeout: 8000 }).catch(() => {});
  await snap(page, '03-modes');

  // 04 — closing dialog
  await page.getByRole('button', { name: /اختر منتجات/ }).first().click({ timeout: 6000 }).catch(() => {});
  await page.waitForSelector('text=تفعيل وضع الإغلاق', { timeout: 5000 }).catch(() => {});
  await snap(page, '04-closing-dialog');
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);

  // 05 — chef picks dialog
  await page.getByRole('button', { name: /اختيارات الشيف/ }).first().click({ timeout: 6000 }).catch(() => {});
  await page.waitForSelector('text=اتركها فارغة', { timeout: 5000 }).catch(() => {});
  await snap(page, '05-chef-picks-dialog');
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);

  // 06 — analytics
  await page.goto(`${APP}/admin/dashboard/analytics`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('text=التحليلات', { timeout: 8000 }).catch(() => {});
  await snap(page, '06-analytics');

  // 07 — design (with contrast guards + presets)
  await page.goto(`${APP}/admin/dashboard/design`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForSelector('text=التصميم', { timeout: 8000 }).catch(() => {});
  await snap(page, '07-design');

  console.log('\nOK — admin screenshots captured →', OUT);
} finally {
  await browser.close();
  console.log('— cleanup —');
  await sb.from('restaurants').delete().eq('id', rest.id);
  console.log('  deleted test tenant');
}
