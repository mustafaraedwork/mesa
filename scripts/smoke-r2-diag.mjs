// Diagnose R2 access: HeadBucket → ListObjects → PutObject.
// Identifies which permission tier the API token actually has.

import { S3Client, HeadBucketCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const Bucket = process.env.R2_BUCKET;

const probe = async (label, fn) => {
  try {
    const out = await fn();
    console.log(`  ${label}: OK`, out ? `(${out})` : '');
    return true;
  } catch (e) {
    console.log(`  ${label}: ${e.$metadata?.httpStatusCode ?? '???'} ${e.Code ?? e.name} — ${e.message}`);
    return false;
  }
};

console.log(`bucket: ${Bucket}`);
await probe('HeadBucket   ', () => s3.send(new HeadBucketCommand({ Bucket })));
await probe('ListObjectsV2', async () => {
  const r = await s3.send(new ListObjectsV2Command({ Bucket, MaxKeys: 1 }));
  return `${r.KeyCount ?? 0} keys`;
});
await probe('PutObject    ', () => s3.send(new PutObjectCommand({ Bucket, Key: 'smoke/diag.txt', Body: 'diag', ContentType: 'text/plain' })));
