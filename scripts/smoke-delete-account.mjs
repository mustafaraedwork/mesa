// Phase 8 — Account deletion + R2 purge smoke test.
//
// PRD §3.3: deleting a tenant must purge their images from R2 (DB cascade
// cannot reach external storage). This test mirrors `deleteAccount` in
// `app/owner/dashboard/accounts/actions.ts`:
//   1. Seed restaurant + category + product
//   2. Upload N fake images under `restaurants/<id>/{logo,products}/...`
//   3. Run the same purge logic (ListObjectsV2 + DeleteObjects loop)
//   4. Run DB cascade delete
//   5. Verify R2 prefix is empty AND no DB rows remain
//
// Run:  node --env-file=.env.local scripts/smoke-delete-account.mjs

import { createClient } from '@supabase/supabase-js';
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const BUCKET = process.env.R2_BUCKET;

const SLUG = `smoke-del-${Date.now()}`;
let failed = 0;
function ok(m) { console.log(`  ✓ ${m}`); }
function fail(m) { console.error(`  ✗ ${m}`); failed++; }

async function countPrefix(prefix) {
  let count = 0;
  let ContinuationToken;
  do {
    const list = await r2.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken }),
    );
    count += list.Contents?.length ?? 0;
    ContinuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return count;
}

// Mirrors lib/r2/upload.ts → deleteRestaurantImages.
async function purgeRestaurantPrefix(restaurantId) {
  const Prefix = `restaurants/${restaurantId}/`;
  let deleted = 0;
  let ContinuationToken;
  do {
    const list = await r2.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix, ContinuationToken }),
    );
    const Objects = list.Contents?.map((o) => ({ Key: o.Key })) ?? [];
    if (Objects.length > 0) {
      await r2.send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects, Quiet: true } }));
      deleted += Objects.length;
    }
    ContinuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (ContinuationToken);
  return deleted;
}

console.log(`— seeding tenant: ${SLUG} —`);
const { data: rest } = await sb
  .from('restaurants')
  .insert({
    slug: SLUG,
    display_name: 'Delete Smoke',
    username: SLUG,
    password_hash: '$2b$10$smoke.del.dummy.hash.placeholder.value',
    is_active: true,
  })
  .select('id')
  .single();
const restaurantId = rest.id;

const { data: cat } = await sb
  .from('categories')
  .insert({ restaurant_id: restaurantId, name_ar: 'تجريب', display_order: 0 })
  .select('id')
  .single();

const { data: prod } = await sb
  .from('products')
  .insert({
    restaurant_id: restaurantId,
    category_id: cat.id,
    name_ar: 'منتج تجريبي',
    price: 100,
  })
  .select('id')
  .single();

await sb
  .from('tenant_sessions')
  .insert({ restaurant_id: restaurantId, token: `del-smoke-token-${Date.now()}` });

console.log('— uploading dummy images to R2 prefix —');
const keys = [
  `restaurants/${restaurantId}/logo/${Date.now()}-a.webp`,
  `restaurants/${restaurantId}/products/${Date.now()}-b.webp`,
  `restaurants/${restaurantId}/products/${Date.now()}-c.webp`,
];
for (const Key of keys) {
  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key,
      Body: Buffer.from(`dummy ${Key}`),
      ContentType: 'image/webp',
    }),
  );
}

const beforeCount = await countPrefix(`restaurants/${restaurantId}/`);
beforeCount === 3 ? ok(`R2 prefix has ${beforeCount} objects before delete`) : fail(`expected 3 objects, got ${beforeCount}`);

console.log('— running deletion (R2 purge → DB cascade) —');
const purged = await purgeRestaurantPrefix(restaurantId);
purged === 3 ? ok(`purgeRestaurantPrefix returned deletion count = ${purged}`) : fail(`expected 3 purged, got ${purged}`);

const { error: delErr } = await sb.from('restaurants').delete().eq('id', restaurantId);
delErr ? fail(`DB delete failed: ${delErr.message}`) : ok('DB delete on restaurants returned no error');

console.log('— verifying everything is gone —');
const afterCount = await countPrefix(`restaurants/${restaurantId}/`);
afterCount === 0 ? ok('R2 prefix is empty after purge') : fail(`R2 still has ${afterCount} objects under prefix!`);

const { data: rrow } = await sb.from('restaurants').select('id').eq('id', restaurantId).maybeSingle();
rrow ? fail('restaurant row still exists') : ok('restaurant row gone');

const { data: crows } = await sb.from('categories').select('id').eq('restaurant_id', restaurantId);
crows.length === 0 ? ok('categories cascaded') : fail(`${crows.length} categories survived cascade`);

const { data: prows } = await sb.from('products').select('id').eq('restaurant_id', restaurantId);
prows.length === 0 ? ok('products cascaded') : fail(`${prows.length} products survived cascade`);

const { data: srows } = await sb.from('tenant_sessions').select('id').eq('restaurant_id', restaurantId);
srows.length === 0 ? ok('tenant_sessions cascaded') : fail(`${srows.length} sessions survived cascade`);

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed.`);
  process.exit(1);
}
console.log('\n✅ account deletion + R2 purge verified');
