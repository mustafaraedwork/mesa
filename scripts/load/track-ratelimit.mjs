// STAGING ONLY — proves what happens to /api/track when many diners share one IP
// (restaurant Wi-Fi, or a mobile carrier behind CGNAT). Writes events rows, so
// never point it at production.
//
// Run: node --env-file=.env.staging scripts/load/track-ratelimit.mjs https://staging.menu.biziii.io <slug> 300
// Needs in the env file: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY of the STAGING project
// (used only to count events before/after — the beacons themselves are anonymous).
//
// Before P0 fix 6 (LIMIT_TRACK_PER_IP = 60/min): 300 sent → 60 stored, 240 dropped silently.
// After P0 fix 6 (slug+IP 600/min, slug 3000/min): 300 sent → 300 stored;
// 1000 sent from one IP+slug → 600 stored, 400 dropped (every response is still 204).

const [base, slug, nStr = '300'] = process.argv.slice(2);
const n = Number(nStr);
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function countEvents() {
  const r = await fetch(`${URL_}/rest/v1/events?select=id&restaurant_id=eq.${await restaurantId()}`, {
    method: 'HEAD',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'count=exact', Range: '0-0' },
  });
  return Number((r.headers.get('content-range') || '/0').split('/')[1]);
}
let _rid;
async function restaurantId() {
  if (_rid) return _rid;
  const r = await fetch(`${URL_}/rest/v1/restaurants?select=id&slug=eq.${slug}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  _rid = (await r.json())[0].id;
  return _rid;
}

const before = await countEvents();
const t0 = Date.now();
const statuses = {};
let sumMs = 0;
for (let i = 0; i < n; i++) {
  const s = Date.now();
  const r = await fetch(`${base}/api/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, kind: 'menu_open', product_id: null }),
  });
  sumMs += Date.now() - s;
  statuses[r.status] = (statuses[r.status] || 0) + 1;
}
const after = await countEvents();
console.log(JSON.stringify({ sent: n, seconds: (Date.now() - t0) / 1000, statuses, avg_ms: +(sumMs / n).toFixed(1), events_before: before, events_after: after, accepted: after - before, dropped_silently: n - (after - before) }, null, 1));
