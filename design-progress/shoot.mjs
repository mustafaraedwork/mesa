import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || 'design-progress/phase-x';
mkdirSync(out, { recursive: true });
const BASE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const SLUG = 'origins';
const mobile = { width: 390, height: 844, deviceScaleFactor: 2 };
const browser = await chromium.launch();

async function fresh() {
  const ctx = await browser.newContext({ viewport: mobile, isMobile: true, hasTouch: true });
  return ctx;
}
async function openMenu(page, langLabel) {
  await page.goto(`${BASE}/r/${SLUG}`, { waitUntil: 'networkidle', timeout: 25000 });
  await page.waitForTimeout(700);
  // language popup auto-opens on first visit — pick a language
  const langBtn = page.getByRole('dialog').getByRole('button', { name: new RegExp(langLabel, 'i') }).first();
  if (await langBtn.count()) { await langBtn.click({ timeout: 4000 }).catch(()=>{}); await page.waitForTimeout(400); }
  // tap the open-menu CTA (bottom full-width button)
  const cta = page.getByRole('button', { name: /المنيو|menu|مێنو|قائمة/i }).first();
  if (await cta.count()) { await cta.click({ timeout: 5000 }).catch(()=>{}); await page.waitForTimeout(900); }
}
async function snap(page, name) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  console.log('  ✓', name);
}

console.log('Shooting →', out);

// 01 welcome (Arabic)
{ const ctx = await fresh(); const p = await ctx.newPage();
  await p.goto(`${BASE}/r/${SLUG}`, { waitUntil:'networkidle' }); await p.waitForTimeout(900);
  await snap(p, '01-welcome'); await ctx.close(); }

// 02 menu RTL (Arabic)
{ const ctx = await fresh(); const p = await ctx.newPage();
  await openMenu(p, 'عرب'); await snap(p, '02-menu-rtl'); await ctx.close(); }

// 03 menu LTR (English)
{ const ctx = await fresh(); const p = await ctx.newPage();
  await openMenu(p, 'EN|English'); await snap(p, '03-menu-ltr'); await ctx.close(); }

// 04 product (Arabic)
{ const ctx = await fresh(); const p = await ctx.newPage();
  await openMenu(p, 'عرب');
  const card = p.locator('a[href*="/p/"]').first();
  if (await card.count()) { await card.click({ timeout: 6000 }).catch(()=>{}); await p.waitForTimeout(1000); }
  await snap(p, '04-product'); await ctx.close(); }

// 05 cart (Arabic) — add an item first
{ const ctx = await fresh(); const p = await ctx.newPage();
  await openMenu(p, 'عرب');
  const add = p.getByRole('button', { name: /أضف|add/i }).first();
  if (await add.count()) { await add.click({ timeout: 5000 }).catch(()=>{}); await p.waitForTimeout(500); }
  await p.goto(`${BASE}/r/${SLUG}/cart`, { waitUntil:'networkidle' }); await p.waitForTimeout(900);
  await snap(p, '05-cart'); await ctx.close(); }

// 06/07 logins
{ const ctx = await fresh(); const p = await ctx.newPage();
  await p.goto(`${BASE}/admin`, { waitUntil:'networkidle' }); await snap(p, '06-admin-login'); await ctx.close(); }
{ const ctx = await fresh(); const p = await ctx.newPage();
  await p.goto(`${BASE}/owner`, { waitUntil:'networkidle' }); await snap(p, '07-owner-login'); await ctx.close(); }

await browser.close();
console.log('done.');
