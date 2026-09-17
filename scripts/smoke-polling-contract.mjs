// Bug #2 regression guard — source-shape assertion.
//
// We can't drive the diner's client polling from Node without spinning up
// JSDOM + a Next.js bundle. Instead we assert the source code still contains
// the load-bearing patterns: setInterval(POLL_MS=30_000), the visibility
// guard, the cache: 'no-store' fetch option, and the `Cache-Control:
// no-store` server header. If any of these regresses, the diner view will
// silently stop refreshing — exactly the QA scenario in Bug #2.
//
// Run:  node scripts/smoke-polling-contract.mjs

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const menuView = readFileSync(resolve(root, 'app/r/[slug]/menu-view.tsx'), 'utf8');
const cartView = readFileSync(resolve(root, 'app/r/[slug]/cart/cart-view.tsx'), 'utf8');
const menuRoute = readFileSync(resolve(root, 'app/api/menu/[slug]/route.ts'), 'utf8');
const stateRoute = readFileSync(resolve(root, 'app/api/admin/state/route.ts'), 'utf8');

let failed = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    console.error(`  ✗ ${msg}`);
    failed += 1;
  }
}

console.log('— diner menu-view polling contract —');
assert(/POLL_MS\s*=\s*30_?000/.test(menuView), 'POLL_MS = 30_000');
assert(/setInterval\(\s*tick\s*,\s*POLL_MS\s*\)/.test(menuView), 'setInterval(tick, POLL_MS)');
assert(/document\.hidden/.test(menuView), 'pauses when document.hidden');
assert(/visibilitychange/.test(menuView), 'subscribes to visibilitychange');
assert(/cache:\s*'no-store'/.test(menuView), "fetch uses cache: 'no-store'");

console.log('\n— cart-view polling contract (Q5 live prices) —');
assert(/setInterval\([^)]+,\s*30_?000\s*\)/.test(cartView), 'cart polls every 30s');
assert(/cache:\s*'no-store'/.test(cartView), "cart fetch uses cache: 'no-store'");
assert(/document\.hidden/.test(cartView), 'cart pauses when document.hidden');

console.log('\n— server response cache headers (Bug #3 root cause) —');
assert(/no-store/.test(menuRoute), '/api/menu/[slug] sets Cache-Control: no-store');
assert(/no-store/.test(stateRoute), '/api/admin/state sets Cache-Control: no-store');
assert(
  /'Cache-Control':\s*'no-store/.test(menuRoute),
  '/api/menu/[slug] browser header is exact `Cache-Control: no-store`',
);

// P0 fix 2: the CDN may hold a successful menu body briefly. The contract is
// now "worst-case staleness for a connected diner ≤ 40 s": POLL_MS (30 s) +
// CDN fresh window (≤ 10 s). For that bound to hold, fresh + stale-while-
// revalidate must stay strictly below POLL_MS — otherwise two consecutive
// polls could both be served a pre-change body.
console.log('\n— CDN cache window vs polling interval (P0 fix 2) —');
const pollMs = Number((menuView.match(/POLL_MS\s*=\s*(\d[\d_]*)/) ?? [])[1]?.replace(/_/g, ''));
const maxAge = Number((menuRoute.match(/CDN_MAX_AGE_S\s*=\s*(\d+)/) ?? [])[1]);
const swr = Number((menuRoute.match(/CDN_SWR_S\s*=\s*(\d+)/) ?? [])[1]);
assert(Number.isFinite(maxAge) && Number.isFinite(swr), 'route declares CDN_MAX_AGE_S and CDN_SWR_S');
assert(/'Vercel-CDN-Cache-Control':\s*`public, s-maxage=\$\{CDN_MAX_AGE_S\}, stale-while-revalidate=\$\{CDN_SWR_S\}`/.test(menuRoute), 'success response carries Vercel-CDN-Cache-Control built from those constants');
assert(maxAge <= 10, `CDN fresh window ≤ 10 s (is ${maxAge})`);
assert(maxAge + swr < pollMs / 1000, `fresh + stale-while-revalidate (${maxAge + swr} s) < POLL_MS (${pollMs / 1000} s)`);
assert(pollMs / 1000 + maxAge <= 40, `worst-case diner staleness ${pollMs / 1000 + maxAge} s ≤ 40 s`);
assert(/'Vercel-CDN-Cache-Control':\s*'no-store'/.test(menuRoute), 'error responses (404) are not CDN-cached');
assert(!/Vercel-CDN-Cache-Control/.test(stateRoute), '/api/admin/state (tenant, 10 s poll) is never CDN-cached');

if (failed > 0) {
  console.error(`\n✗ ${failed} contract check(s) failed`);
  process.exit(1);
}
console.log('\nOK — polling + cache contract intact.');
