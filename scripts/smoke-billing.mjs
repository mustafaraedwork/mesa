// Billing ledger verification (migration 0011 + lib/billing assumptions).
// Pure DB round-trip — no server needed. Proves the `payments` table constraints
// match the server action's input validation, and that per-currency aggregation
// sums correctly. Needs .env.local (service role).

import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let fail = 0;
const ok = (c, m) => {
  console.log((c ? '  ✓ ' : '  ✗ ') + m);
  if (!c) fail++;
};

const slug = 'verify-bill-' + Date.now();
const { data: r, error: seedErr } = await sb
  .from('restaurants')
  .insert({ display_name: 'Billing verify', slug, username: slug, password_hash: 'x', is_active: true })
  .select('id')
  .single();
if (seedErr) {
  console.error('seed failed:', seedErr.message);
  process.exit(1);
}
const rid = r.id;

try {
  console.log('— constraints —');
  const valid = await sb.from('payments').insert({
    restaurant_id: rid,
    kind: 'initial',
    amount: 800000,
    currency: 'IQD',
    paid_at: '2026-01-01',
    period_end: '2027-01-01',
  });
  ok(!valid.error, 'valid payment inserts');

  const zero = await sb.from('payments').insert({
    restaurant_id: rid,
    kind: 'renewal',
    amount: 0,
    currency: 'IQD',
    paid_at: '2026-01-01',
  });
  ok(!!zero.error, 'amount = 0 rejected (CHECK amount > 0)');

  const badPeriod = await sb.from('payments').insert({
    restaurant_id: rid,
    kind: 'renewal',
    amount: 100,
    currency: 'IQD',
    paid_at: '2026-06-01',
    period_start: '2026-06-01',
    period_end: '2026-05-01',
  });
  ok(!!badPeriod.error, 'period_end ≤ period_start rejected (CHECK)');

  const badKind = await sb.from('payments').insert({
    restaurant_id: rid,
    kind: 'bogus',
    amount: 100,
    currency: 'IQD',
    paid_at: '2026-06-01',
  });
  ok(!!badKind.error, 'invalid kind rejected (CHECK)');

  console.log('— aggregation round-trip —');
  await sb.from('payments').insert([
    { restaurant_id: rid, kind: 'renewal', amount: 200000, currency: 'IQD', paid_at: '2026-02-01' },
    { restaurant_id: rid, kind: 'renewal', amount: 50, currency: 'USD', paid_at: '2026-03-01' },
  ]);
  const { data: rows } = await sb.from('payments').select('amount, currency').eq('restaurant_id', rid);
  const byCur = {};
  for (const p of rows ?? []) byCur[p.currency] = (byCur[p.currency] ?? 0) + Number(p.amount);
  ok(byCur.IQD === 1000000, `IQD total = 1,000,000 (got ${byCur.IQD})`);
  ok(byCur.USD === 50, `USD total = 50 (got ${byCur.USD})`);

  console.log('— cascade —');
  await sb.from('restaurants').delete().eq('id', rid);
  const { data: after } = await sb.from('payments').select('id').eq('restaurant_id', rid);
  ok((after?.length ?? 0) === 0, 'payments cascade-deleted with restaurant');
} finally {
  await sb.from('restaurants').delete().eq('id', rid);
}

console.log(fail === 0 ? '\n✅ billing ledger verification passed' : `\n❌ ${fail} checks failed`);
process.exit(fail === 0 ? 0 : 1);
