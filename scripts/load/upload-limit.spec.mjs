// STAGING ONLY — proves the Server Action body limit on product image upload.
// Logs in as a tenant (writes tenant_sessions + login_attempts), opens the
// "new product" dialog, submits a 1.5 MB JPEG then an 800 KB JPEG, and prints
// exactly what the tenant sees plus the raw server-action response.
//
// Run: node scripts/load/upload-limit.spec.mjs https://staging.menu.biziii.io <username> <password> <categoryName>
// Env:  SIZES=1.5MB,800KB  (default). Known sizes: 800KB,1.5MB,3MB,4MB,5MB,8MB.
//       After P0 fix 4, 800KB/1.5MB/4MB must succeed (client downscales) and 8MB must
//       fail with a visible Arabic message inside the dialog.
// Requires: @playwright/test (devDependency) and sharp (dependency).

import { chromium } from '@playwright/test';
import sharp from 'sharp';

const [base, username, password, categoryName] = process.argv.slice(2);
const SIZES = (process.env.SIZES || '1.5MB,800KB').split(',').map((s) => s.trim());
const BYTES = { '800KB': 800 * 1024, '1.5MB': 1.5 * 1024 * 1024, '3MB': 3 * 1024 * 1024, '4MB': 4 * 1024 * 1024, '5MB': 5 * 1024 * 1024, '8MB': 8 * 1024 * 1024 };

// KIND=photo (default): photo-like content (smooth gradients + mild texture),
// ~0.3 byte/pixel at q90 — behaves like a real phone photo, so the client-side
// downscale to 1600 px brings it well under 1 MB.
// KIND=gif: same bytes but sent as image/gif — the client never resizes GIFs (animation), so
// the size check alone decides; the only reliable way to hit the 'still too large' refusal.
// KIND=noise: incompressible noise — stays huge even after downscaling, which
// is the only way to exercise the "still too large after resize" refusal.
const KIND = process.env.KIND || 'photo';
async function jpegOfSize(targetBytes) {
  let side = 1200;
  for (let i = 0; i < 10; i++) {
    const raw = Buffer.alloc(side * side * 3);
    if (KIND === 'noise') {
      for (let j = 0; j < raw.length; j++) raw[j] = (Math.random() * 256) | 0;
    } else {
      for (let y = 0; y < side; y++) {
        for (let x = 0; x < side; x++) {
          const o = (y * side + x) * 3;
          const t = ((x * 7 + y * 3) % 97) < 4 ? 40 : 0; // sparse "edges"
          raw[o] = (x / side) * 200 + ((Math.random() * 12) | 0) + t;
          raw[o + 1] = (y / side) * 180 + ((Math.random() * 12) | 0);
          raw[o + 2] = 120 + ((Math.random() * 12) | 0) + t;
        }
      }
    }
    const buf = await sharp(raw, { raw: { width: side, height: side, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
    if (Math.abs(buf.length - targetBytes) / targetBytes < 0.1) return buf;
    side = Math.round(side * Math.sqrt(targetBytes / buf.length));
    if (side > 9000) throw new Error('target too large for a single image');
  }
  throw new Error('could not hit target size');
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const posts = [];
page.on('response', async (r) => {
  if (r.request().method() !== 'POST') return;
  let body = '';
  try { body = (await r.text()).slice(0, 200); } catch {}
  posts.push({ t: Date.now(), status: r.status(), url: r.url().replace(base, ''), body });
});

await page.goto(`${base}/admin`);
await page.getByLabel('اسم المستخدم').fill(username);
await page.getByLabel('كلمة السر').fill(password);
await page.getByRole('button', { name: /دخول|sign in/i }).click();
await page.waitForURL('**/admin/dashboard**');
await page.goto(`${base}/admin/dashboard/menu`, { waitUntil: 'networkidle' });
console.log('menu page buttons:', (await page.locator('button').allInnerTexts()).map((t) => t.trim()).filter(Boolean).slice(0, 12).join(' | '));

for (const label of SIZES) {
  const img = await jpegOfSize(BYTES[label]);
  try {
    await page.getByRole('button', { name: /^منتج$|منتج جديد|إضافة منتج|add product/ }).first().click({ timeout: 10000 });
  } catch (e) {
    await page.screenshot({ path: 'upload-debug.png' });
    console.log('add-product click failed:', String(e.message).split('\n')[0], 'url=', page.url());
    process.exit(1);
  }
  await page.getByLabel('الاسم بالعربي').first().fill(`upload-test-${label}`);
  await page.getByLabel('السعر').first().fill('1000');
  await page.setInputFiles('input[type=file]', KIND === 'gif' ? { name: `test-${label}.gif`, mimeType: 'image/gif', buffer: img } : { name: `test-${label}.jpg`, mimeType: 'image/jpeg', buffer: img });
  const nPosts = posts.length;
  const t0 = Date.now();
  await page.getByRole('button', { name: /حفظ|إنشاء|إضافة|save|create/i }).last().click();
  const deadline = Date.now() + 20000;
  while (posts.length === nPosts && Date.now() < deadline) await page.waitForTimeout(200);
  await page.waitForTimeout(1500);
  const alerts = (await page.locator('[role=alert]').allInnerTexts()).map((a) => a.trim()).filter(Boolean);
  const dialogError = await page.locator('p.text-destructive-text').allInnerTexts();
  const dialogOpen = await page.getByRole('dialog').count();
  console.log(JSON.stringify({ file: label, bytes: img.length, ms: Date.now() - t0, tenant_sees: { alerts, dialogError, dialogStillOpen: dialogOpen > 0 }, serverAction: posts[posts.length - 1] }));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
}
await browser.close();
