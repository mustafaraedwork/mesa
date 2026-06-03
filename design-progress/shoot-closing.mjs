// One-off visual proof: diner menu + product page while the restaurant is in
// CLOSING mode. Confirms the "closing offer ends at HH:MM" banner is gone from
// the diner side while the discounts (struck price + −% badge + offers section)
// remain. Seeds an ephemeral active tenant and deletes it afterwards — never
// touches a real restaurant.
//
// Run:  node --env-file=.env.local design-progress/shoot-closing.mjs [outDir]

import { chromium } from 'playwright-core';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || 'design-progress/customer-ux-fixes/closing-no-banner';
mkdirSync(out, { recursive: true });
const BASE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const SLUG = `shoot-closing-${Date.now()}`;
const mobile = { width: 390, height: 844, deviceScaleFactor: 2 };
const endsAt = new Date(Date.now() + 3_600_000).toISOString();

const { data: rest, error: e1 } = await sb
  .from('restaurants')
  .insert({
    slug: SLUG,
    display_name: 'مطعم اللقطة',
    username: SLUG,
    password_hash: '$2b$10$smoketest.dummy.hash.value.placeholder.fortest',
    is_active: true,
    currency: 'IQD',
    show_unavailable_items: true,
    active_mode: 'closing',
    closing_mode_ends_at: endsAt,
    closing_mode_discount: 10,
    primary_color: '#0f766e',
    background_color: '#f8fafc',
    card_color: '#ffffff',
    text_color: '#0f172a',
  })
  .select('id')
  .single();
if (e1) {
  console.error('seed restaurant failed', e1);
  process.exit(1);
}
const rid = rest.id;

try {
  const { data: cat } = await sb
    .from('categories')
    .insert({ restaurant_id: rid, name_ar: 'الأطباق', display_order: 0 })
    .select('id')
    .single();
  await sb.from('products').insert([
    { restaurant_id: rid, category_id: cat.id, name_ar: 'برياني لحم', price: 15000, prep_time_minutes: 20, profit_percentage: 40, display_order: 0, is_available: true, is_in_closing_mode: true },
    { restaurant_id: rid, category_id: cat.id, name_ar: 'كباب', price: 13000, prep_time_minutes: 15, profit_percentage: 35, display_order: 1, is_available: true, is_in_closing_mode: true },
    { restaurant_id: rid, category_id: cat.id, name_ar: 'سلطة', price: 4000, prep_time_minutes: 5, profit_percentage: 60, display_order: 2, is_available: true, is_in_closing_mode: false },
  ]);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: mobile, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/r/${SLUG}`, { waitUntil: 'networkidle', timeout: 25000 });
  await p.waitForTimeout(700);
  const langBtn = p.getByRole('dialog').getByRole('button', { name: /عرب/i }).first();
  if (await langBtn.count()) { await langBtn.click({ timeout: 4000 }).catch(() => {}); await p.waitForTimeout(400); }
  const cta = p.getByRole('button', { name: /المنيو|قائمة/i }).first();
  if (await cta.count()) { await cta.click({ timeout: 5000 }).catch(() => {}); await p.waitForTimeout(900); }
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/closing-menu.png`, fullPage: true });
  console.log('  ✓ closing-menu');

  const card = p.locator('a[href*="/p/"]').first();
  if (await card.count()) { await card.click({ timeout: 6000 }).catch(() => {}); await p.waitForTimeout(1000); }
  await p.screenshot({ path: `${out}/closing-product.png`, fullPage: true });
  console.log('  ✓ closing-product');

  await browser.close();
} finally {
  await sb.from('restaurants').delete().eq('id', rid);
  console.log('  cleaned up ephemeral tenant');
}
console.log('done →', out);
