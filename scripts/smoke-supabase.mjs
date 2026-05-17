// Smoke test: verifies Supabase connection, schema, and RLS bypass via service role.
// Run with:  node --env-file=.env.local scripts/smoke-supabase.mjs

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('missing env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const tables = ['restaurants', 'categories', 'products', 'complementary_categories', 'tenant_sessions'];
console.log('— counting rows in each table —');
for (const t of tables) {
  const { count, error } = await sb.from(t).select('*', { count: 'exact', head: true });
  if (error) {
    console.error(`  ${t}: ERROR ${error.message}`);
    process.exit(1);
  }
  console.log(`  ${t}: ${count ?? 0} rows`);
}

console.log('— inserting test restaurant —');
const { data: ins, error: insErr } = await sb
  .from('restaurants')
  .insert({
    slug: `smoke-${Date.now()}`,
    display_name: 'Smoke Test',
    username: `smoke-${Date.now()}`,
    password_hash: '$2b$10$smoketest.dummy.hash.value.placeholder.fortest',
    is_active: false,
  })
  .select('id, slug, active_mode, currency, created_at')
  .single();
if (insErr) {
  console.error('  insert failed:', insErr.message);
  process.exit(1);
}
console.log('  inserted:', ins);

console.log('— deleting test restaurant —');
const { error: delErr } = await sb.from('restaurants').delete().eq('id', ins.id);
if (delErr) {
  console.error('  delete failed:', delErr.message);
  process.exit(1);
}
console.log('  deleted ok');

console.log('\nOK — Supabase reachable, schema present, service role works.');
