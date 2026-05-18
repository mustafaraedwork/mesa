// Unified smoke runner — `npm test`. Runs every scripts/smoke-*.mjs in order.
//
// Prerequisites differ per script:
//   STATIC  — source-shape checks; need nothing.
//   ENV     — hit Supabase / R2 directly; need .env.local at the repo root.
//   SERVER  — also need `npm run dev` reachable at NEXT_PUBLIC_APP_URL
//             (default http://localhost:3000), plus Playwright for the
//             browser-driven ones.
//
// A script whose prerequisites are missing is SKIPPED, not failed. The exit
// code is non-zero only when a script that actually ran reported failure —
// so `npm test` stays green on a bare checkout and turns red on a real break.

import { readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

// Scripts that need the Next dev server running (Playwright or /api fetches).
const NEEDS_SERVER = new Set([
  'smoke-no-native-confirms.mjs',
  'smoke-pwa.mjs',
  'smoke-runtime-confirms.mjs',
  'smoke-runtime-polling.mjs',
  'smoke-desync.mjs',
  'smoke-modes.mjs',
  'smoke-closing-revert.mjs',
  'smoke-analytics.mjs',
]);
// Scripts that need no env and no server — pure source-shape assertions.
const STATIC = new Set(['smoke-polling-contract.mjs']);

const hasEnv = existsSync(resolve(root, '.env.local'));

async function serverUp() {
  try {
    await fetch(APP, { signal: AbortSignal.timeout(2500) });
    return true;
  } catch {
    return false;
  }
}

const scripts = readdirSync(resolve(root, 'scripts'))
  .filter((f) => f.startsWith('smoke-') && f.endsWith('.mjs'))
  .sort();

const up = await serverUp();
console.log(`smoke runner — ${scripts.length} scripts`);
console.log(`  .env.local: ${hasEnv ? 'found' : 'MISSING'}`);
console.log(`  dev server (${APP}): ${up ? 'reachable' : 'down'}\n`);

const results = { pass: [], fail: [], skip: [] };

for (const name of scripts) {
  const isStatic = STATIC.has(name);
  const needsServer = NEEDS_SERVER.has(name);

  if (!isStatic && !hasEnv) {
    console.log(`⊘ SKIP ${name} — needs .env.local`);
    results.skip.push(name);
    continue;
  }
  if (needsServer && !up) {
    console.log(`⊘ SKIP ${name} — needs dev server (run \`npm run dev\`)`);
    results.skip.push(name);
    continue;
  }

  console.log(`▶ RUN  ${name}`);
  const args = [];
  if (hasEnv && !isStatic) args.push('--env-file=.env.local');
  args.push(`scripts/${name}`);
  const r = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (r.status === 0) {
    results.pass.push(name);
    console.log(`✓ PASS ${name}\n`);
  } else {
    results.fail.push(name);
    console.log(`✗ FAIL ${name} (exit ${r.status})\n`);
  }
}

console.log('─'.repeat(48));
console.log(`pass: ${results.pass.length}  fail: ${results.fail.length}  skip: ${results.skip.length}`);
if (results.fail.length > 0) {
  console.log(`failed: ${results.fail.join(', ')}`);
}
if (results.skip.length > 0) {
  console.log(`skipped: ${results.skip.join(', ')} — start the dev server / add .env.local for full coverage`);
}

process.exit(results.fail.length > 0 ? 1 : 0);
