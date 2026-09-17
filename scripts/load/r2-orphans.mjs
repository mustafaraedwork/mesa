// Read-only R2 vs DB reconciliation: lists every object under restaurants/ in
// the bucket and every image_url / logo_url in the database, then prints
// objects with no DB reference (orphans) and DB references with no object
// (broken images). Deletes NOTHING.
//
// Run: node --env-file=.env.production.local scripts/load/r2-orphans.mjs
// Needs: R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL,
//        NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';

const s3 = new S3Client({ region: 'auto', endpoint: process.env.R2_ENDPOINT, credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY } });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const base = process.env.R2_PUBLIC_URL.replace(/\/$/, '') + '/';

const objects = new Map();
let token;
do {
  const page = await s3.send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET, Prefix: 'restaurants/', ContinuationToken: token }));
  for (const o of page.Contents ?? []) objects.set(o.Key, o.Size);
  token = page.IsTruncated ? page.NextContinuationToken : undefined;
} while (token);

const refs = new Set();
let from = 0;
for (;;) {
  const { data } = await sb.from('products').select('image_url').not('image_url', 'is', null).range(from, from + 999);
  for (const p of data ?? []) if (p.image_url.startsWith(base)) refs.add(p.image_url.slice(base.length));
  if (!data || data.length < 1000) break;
  from += 1000;
}
const { data: rests } = await sb.from('restaurants').select('logo_url').not('logo_url', 'is', null);
for (const r of rests ?? []) if (r.logo_url.startsWith(base)) refs.add(r.logo_url.slice(base.length));

const orphans = [...objects.keys()].filter((k) => !refs.has(k));
const broken = [...refs].filter((k) => !objects.has(k));
const orphanBytes = orphans.reduce((s, k) => s + objects.get(k), 0);
const totalBytes = [...objects.values()].reduce((s, b) => s + b, 0);
console.log(JSON.stringify({ objects: objects.size, total_MB: +(totalBytes / 1048576).toFixed(1), avg_KB: +(totalBytes / Math.max(1, objects.size) / 1024).toFixed(1), db_refs: refs.size, orphans: orphans.length, orphan_MB: +(orphanBytes / 1048576).toFixed(1), broken_refs: broken.length }, null, 1));
if (orphans.length) console.log('ORPHANS (first 20):', orphans.slice(0, 20));
if (broken.length) console.log('BROKEN REFS (first 20):', broken.slice(0, 20));
