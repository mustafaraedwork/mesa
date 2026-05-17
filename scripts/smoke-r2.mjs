// Smoke test: verifies R2 bucket access (PUT, public GET, DELETE).
// Run with:  node --env-file=.env.local scripts/smoke-r2.mjs

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const endpoint = process.env.R2_ENDPOINT;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET;
const publicUrl = process.env.R2_PUBLIC_URL?.replace(/\/$/, '');

for (const [k, v] of Object.entries({ endpoint, accessKeyId, secretAccessKey, bucket, publicUrl })) {
  if (!v) {
    console.error(`missing env: ${k}`);
    process.exit(1);
  }
}

const s3 = new S3Client({ region: 'auto', endpoint, credentials: { accessKeyId, secretAccessKey } });

const key = `smoke/${Date.now()}.txt`;
const body = `mesa-os-lite smoke test ${new Date().toISOString()}`;

console.log(`— PUT ${key} (${body.length} bytes) —`);
await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'text/plain' }));
console.log('  put ok');

const url = `${publicUrl}/${key}`;
console.log(`— GET ${url} —`);
const res = await fetch(url);
const text = await res.text();
console.log(`  status: ${res.status}`);
console.log(`  body:   ${text}`);
if (!res.ok || text !== body) {
  console.error('  public URL did not return the uploaded body — check R2 public access settings');
  process.exit(1);
}

console.log(`— DELETE ${key} —`);
await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
console.log('  delete ok');

console.log('\nOK — R2 reachable, PUT/GET/DELETE work, public URL serves uploaded objects.');
