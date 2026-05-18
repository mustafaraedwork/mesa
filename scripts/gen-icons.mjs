// Generate every app icon from public/logo.png.
//   public/icon-192.png, icon-512.png     — PWA manifest, purpose "any"
//   public/icon-512-maskable.png          — PWA manifest, purpose "maskable" (full-bleed)
//   public/apple-touch-icon.png           — iOS home screen (opaque)
//   app/icon.png                          — Next.js App Router favicon source
//   app/favicon.ico                       — served at /favicon.ico
//
// Run:  node scripts/gen-icons.mjs

import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PUBLIC = resolve(ROOT, 'public');
const APP = resolve(ROOT, 'app');
const LOGO = resolve(PUBLIC, 'logo.png');

// Sample the logo's cream background from a strip along the top edge — used to
// fill the maskable + Apple icons so they have no transparent corners.
const meta = await sharp(LOGO).metadata();
const strip = await sharp(LOGO)
  .extract({ left: Math.round(meta.width / 2) - 20, top: 6, width: 40, height: 12 })
  .stats();
const [r, g, b] = strip.channels.slice(0, 3).map((c) => Math.round(c.mean));
const BG = { r, g, b };
console.log(`— icons from logo.png — background sampled rgb(${r},${g},${b})`);

// "any" icon: the logo fitted onto a transparent square — keeps its silhouette.
async function anyIcon(size) {
  return sharp(LOGO)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

// Opaque icon: the logo scaled to `inner` of the canvas, centered on the
// sampled cream background. Used for maskable (full-bleed) and Apple touch.
async function opaqueIcon(size, inner) {
  const logoSize = Math.round(size * inner);
  const logo = await sharp(LOGO)
    .resize(logoSize, logoSize, { fit: 'contain', background: { r, g, b, alpha: 0 } })
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 3, background: BG } })
    .composite([{ input: logo, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function write(dir, name, buf) {
  await writeFile(resolve(dir, name), buf);
  console.log(`  ✓ ${name} (${buf.length} bytes)`);
}

await write(PUBLIC, 'icon-192.png', await anyIcon(192));
await write(PUBLIC, 'icon-512.png', await anyIcon(512));
await write(PUBLIC, 'icon-512-maskable.png', await opaqueIcon(512, 0.8));
await write(PUBLIC, 'apple-touch-icon.png', await opaqueIcon(180, 0.92));
await write(APP, 'icon.png', await anyIcon(512));

// favicon.ico — a minimal single-image ICO wrapping a 48×48 opaque PNG.
const fav = await opaqueIcon(48, 0.96);
const ico = Buffer.alloc(22 + fav.length);
ico.writeUInt16LE(0, 0); // reserved
ico.writeUInt16LE(1, 2); // type: icon
ico.writeUInt16LE(1, 4); // image count
ico.writeUInt8(48, 6); // width
ico.writeUInt8(48, 7); // height
ico.writeUInt8(0, 8); // palette count
ico.writeUInt8(0, 9); // reserved
ico.writeUInt16LE(1, 10); // colour planes
ico.writeUInt16LE(32, 12); // bits per pixel
ico.writeUInt32LE(fav.length, 14); // image byte size
ico.writeUInt32LE(22, 18); // image offset
fav.copy(ico, 22);
await write(APP, 'favicon.ico', ico);

console.log('\n✅ icons written from logo.png');
