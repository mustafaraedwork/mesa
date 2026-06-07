// Soft-delete + public-RLS verification. Proves migration 0011's policy swap:
//   1. an active, non-deleted restaurant is readable by the ANON client;
//   2. after soft-delete (deleted_at set) the same restaurant + its categories
//      + products are INVISIBLE to anon — which also proves the old
//      `is_active`-only "Public read" policy was REPLACED, not duplicated
//      (a stale permissive duplicate would keep the soft-deleted row visible);
//   3. restore makes it readable again;
//   4. the diner API (/api/menu/:slug, service-role path) honours the
//      app-level deleted_at guard too (200 live → 404 soft-deleted).
//
// Needs .env.local (service role + anon key). The API checks need the dev/prod
// server up at NEXT_PUBLIC_APP_URL; they are skipped (not failed) if it's down.

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const svc = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

let fail = 0;
const ok = (c, m) => {
  console.log((c ? '  ✓ ' : '  ✗ ') + m);
  if (!c) fail++;
};

const serverUp = await fetch(APP, { signal: AbortSignal.timeout(2500) }).then(() => true).catch(() => false);
const slug = 'verify-sd-' + Date.now();

const { data: r, error: e1 } = await svc
  .from('restaurants')
  .insert({ display_name: 'SD verify', slug, username: slug, password_hash: 'x', is_active: true })
  .select('id')
  .single();
if (e1) {
  console.error('seed failed:', e1.message);
  process.exit(1);
}
const rid = r.id;
const { data: cat } = await svc.from('categories').insert({ restaurant_id: rid, name_ar: 'قسم' }).select('id').single();
await svc.from('products').insert({ restaurant_id: rid, category_id: cat.id, name_ar: 'منتج', price: 1000 });

const apiStatus = async () => {
  try {
    const res = await fetch(`${APP}/api/menu/${slug}`, { cache: 'no-store' });
    return res.status;
  } catch {
    return -1;
  }
};

try {
  console.log('— state: active, not deleted —');
  ok((await anon.from('restaurants').select('id').eq('slug', slug).maybeSingle()).data != null, 'anon reads active restaurant (positive control)');
  ok(((await anon.from('categories').select('id').eq('restaurant_id', rid)).data?.length ?? 0) === 1, 'anon reads its categories');
  ok(((await anon.from('products').select('id').eq('restaurant_id', rid)).data?.length ?? 0) === 1, 'anon reads its products');
  if (serverUp) ok((await apiStatus()) === 200, 'API /api/menu = 200 when live');

  console.log('— state: soft-deleted —');
  await svc.from('restaurants').update({ deleted_at: new Date().toISOString() }).eq('id', rid);
  ok((await anon.from('restaurants').select('id').eq('slug', slug).maybeSingle()).data == null, 'anon CANNOT read restaurant (RLS deleted_at; no stale duplicate policy)');
  ok(((await anon.from('categories').select('id').eq('restaurant_id', rid)).data?.length ?? 0) === 0, 'anon CANNOT read its categories');
  ok(((await anon.from('products').select('id').eq('restaurant_id', rid)).data?.length ?? 0) === 0, 'anon CANNOT read its products');
  if (serverUp) ok((await apiStatus()) === 404, 'API /api/menu = 404 when soft-deleted (loadMenu guard)');

  console.log('— state: restored —');
  await svc.from('restaurants').update({ deleted_at: null }).eq('id', rid);
  ok((await anon.from('restaurants').select('id').eq('slug', slug).maybeSingle()).data != null, 'anon reads restaurant again after restore');
} finally {
  await svc.from('restaurants').delete().eq('id', rid);
}

console.log(
  fail === 0
    ? `\n✅ soft-delete + public-RLS verification passed${serverUp ? '' : ' (API checks skipped — server down)'}`
    : `\n❌ ${fail} checks failed`,
);
process.exit(fail === 0 ? 0 : 1);
