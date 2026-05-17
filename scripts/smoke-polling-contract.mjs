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
  '/api/menu/[slug] header is exact `Cache-Control: no-store`',
);

if (failed > 0) {
  console.error(`\n✗ ${failed} contract check(s) failed`);
  process.exit(1);
}
console.log('\nOK — polling + cache contract intact.');
