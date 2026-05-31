import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { randomUUID } from 'crypto';

let cached: S3Client | null = null;

function client(): S3Client {
  if (cached) return cached;
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('R2 env vars missing (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)');
  }
  cached = new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
  return cached;
}

const BUCKET = () => {
  const b = process.env.R2_BUCKET;
  if (!b) throw new Error('R2_BUCKET env var missing');
  return b;
};

const PUBLIC_URL = () => {
  const u = process.env.R2_PUBLIC_URL;
  if (!u) throw new Error('R2_PUBLIC_URL env var missing');
  return u.replace(/\/$/, '');
};

// Reject oversized or non-image uploads BEFORE the bytes reach sharp (C-3):
// guards against decompression bombs and SVG/polyglot inputs. `file.type` is
// client-controlled, so this is a cheap first gate; the size cap and sharp's
// `limitInputPixels` are the real decode-time backstops.
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export function validateImageUpload(file: File): string | null {
  if (file.size <= 0) return 'الملف فارغ';
  if (file.size > MAX_IMAGE_BYTES) return 'حجم الصورة كبير جداً (الحد ١٠ ميغابايت)';
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return 'صيغة الصورة غير مدعومة (JPG أو PNG أو WebP أو GIF فقط)';
  }
  return null;
}

// Re-encode incoming image as WebP, cropped to a centered 800x800 square
// (PRD §4.6). `fit: 'cover'` crops the overflow so every product image has the
// same 1:1 ratio regardless of the uploaded dimensions — uniform menu cards.
// `keyPrefix` should be e.g. `restaurants/<uuid>/products/`.
export async function uploadProductImage(
  input: Buffer | Uint8Array,
  keyPrefix: string,
): Promise<{ url: string; key: string }> {
  // limitInputPixels caps decoded dimensions (~100MP) as a decompression-bomb
  // backstop — well above any phone/DSLR photo, far below bomb territory.
  const buffer = await sharp(input, { limitInputPixels: 100_000_000 })
    .rotate()
    .resize(800, 800, { fit: 'cover', position: 'center' })
    .webp({ quality: 80 })
    .toBuffer();

  const key = `${keyPrefix.replace(/\/$/, '')}/${randomUUID()}.webp`;

  await client().send(
    new PutObjectCommand({
      Bucket: BUCKET(),
      Key: key,
      Body: buffer,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );

  return { url: `${PUBLIC_URL()}/${key}`, key };
}

export async function deleteImage(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: BUCKET(), Key: key }));
}

// Best-effort image delete that never throws — logs on failure so orphaned R2
// objects stay discoverable (Q-11). Use in cleanup paths where a delete failure
// must not abort the surrounding operation.
export async function safeDeleteImage(key: string): Promise<void> {
  try {
    await deleteImage(key);
  } catch (e) {
    console.error('[r2] image cleanup failed for key', key, e);
  }
}

// Convert the public R2 URL stored in `image_url` back to the bucket key.
// The URL format is `${R2_PUBLIC_URL}/${key}`. Single source of truth (Q-8) —
// previously duplicated in the menu and design actions.
export function extractR2Key(publicUrl: string): string {
  const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, '') ?? '';
  if (publicUrl.startsWith(base + '/')) return publicUrl.slice(base.length + 1);
  // Fallback: strip protocol+host.
  try {
    return new URL(publicUrl).pathname.replace(/^\//, '');
  } catch {
    return publicUrl;
  }
}

// Purge every object under `restaurants/<restaurantId>/`. Used when a tenant
// account is deleted (PRD §3.3). DB cascade handles the rows; R2 doesn't.
export async function deleteRestaurantImages(restaurantId: string): Promise<number> {
  const Prefix = `restaurants/${restaurantId}/`;
  const c = client();
  const Bucket = BUCKET();
  let deleted = 0;
  let ContinuationToken: string | undefined;
  do {
    const list = await c.send(
      new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken }),
    );
    const Objects = list.Contents?.map((o) => ({ Key: o.Key! })) ?? [];
    if (Objects.length > 0) {
      await c.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects, Quiet: true } }));
      deleted += Objects.length;
    }
    ContinuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return deleted;
}
