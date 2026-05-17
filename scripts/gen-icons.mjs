// Generate PNG placeholder icons for the PWA from an inline SVG.
// Output to public/. Replace with real designs before public launch.
//
// Run:  node scripts/gen-icons.mjs

import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, '..', 'public');

const BG = '#327bb3';
const FG = '#ffffff';

// Square icon — letter centered. `safeRatio` controls how large the letter is
// relative to the canvas; smaller = more padding for maskable shapes (Android
// crops up to 20% of the canvas in extreme adaptive shapes).
function svg(size, safeRatio = 0.7) {
  const fontSize = Math.round(size * safeRatio);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BG}"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
        font-family="Arial, Helvetica, sans-serif" font-weight="700"
        font-size="${fontSize}" fill="${FG}">M</text>
</svg>`;
}

async function render(name, size, safeRatio) {
  const buf = await sharp(Buffer.from(svg(size, safeRatio)))
    .png({ compressionLevel: 9 })
    .toBuffer();
  const out = resolve(PUBLIC_DIR, name);
  await writeFile(out, buf);
  console.log(`  ✓ ${name} (${size}×${size}, ${buf.length} bytes)`);
}

console.log('— generating PNG icons —');
await render('icon-192.png', 192, 0.72);
await render('icon-512.png', 512, 0.72);
// Maskable: keep the letter well inside the 80% safe zone (per W3C spec).
await render('icon-512-maskable.png', 512, 0.5);
// Apple touch — iOS does not honour maskable; the visible canvas is the full square.
await render('apple-touch-icon.png', 180, 0.72);

console.log('\n✅ icons written to public/');
