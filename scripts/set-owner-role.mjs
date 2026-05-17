// One-shot: set app_metadata.role='owner' for a given email via the
// Supabase Admin API. Service-role key required.
//
// Run:  node --env-file=.env.local scripts/set-owner-role.mjs <email>

import { createClient } from '@supabase/supabase-js';

const email = process.argv[2];
if (!email) {
  console.error('usage: node scripts/set-owner-role.mjs <email>');
  process.exit(1);
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

console.log(`— looking up user: ${email} —`);
// admin.listUsers paginates; for one user a direct lookup is simpler:
const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
if (error) {
  console.error('  list failed:', error.message);
  process.exit(1);
}
const user = data.users.find((u) => u.email === email);
if (!user) {
  console.error(`  user not found in first 200; refine if you have more users`);
  process.exit(1);
}
console.log(`  found id=${user.id}`);
console.log(`  current app_metadata:`, user.app_metadata);

console.log(`— updating app_metadata.role='owner' —`);
const { data: upd, error: updErr } = await sb.auth.admin.updateUserById(user.id, {
  app_metadata: { ...user.app_metadata, role: 'owner' },
});
if (updErr) {
  console.error('  update failed:', updErr.message);
  process.exit(1);
}
console.log(`  new app_metadata:`, upd.user.app_metadata);
console.log('\nOK — user must sign out + back in for the new claim to land in their JWT.');
