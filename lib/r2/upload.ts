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

// Re-encode incoming image as WebP, max 800x800, quality 80 (PRD §4.6).
// `keyPrefix` should be e.g. `restaurants/<uuid>/products/`.
export async function uploadProductImage(
  input: Buffer | Uint8Array,
  keyPrefix: string,
): Promise<{ url: string; key: string }> {
  const buffer = await sharp(input)
    .rotate()
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
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
