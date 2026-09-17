// k6 load script — one realistic diner session against a STAGING deployment.
// DO NOT run against production: it writes analytics rows via /api/track.
//
// Install k6: https://k6.io/docs/get-started/installation/
// Run (staging):
//   k6 run -e BASE=https://staging.menu.biziii.io -e SLUG=demo -e DINERS=60 -e DURATION=10m scripts/load/diner-session.k6.js
// Env:
//   BASE      base URL of the staging app (no trailing slash)
//   SLUG      restaurant slug to hit
//   DINERS    concurrent diners (VUs). 60 = one big restaurant at peak; 3000 = 50 such restaurants
//   DURATION  how long to keep DINERS concurrent (each VU loops full sessions)
//   PREFETCH  number of product-page prefetches a diner triggers per section (default 10 — one viewport of cards)
//   TRACK     1 to send /api/track beacons (default 1), 0 to disable
//
// The session mirrors app/r/[slug]/menu-view.tsx exactly:
//   HTML → manifest → sw.js → (SW re-fetch of HTML) → N× product prefetch (RSC) →
//   poll /api/menu every 30s → 2 product pages → cart → track beacons.

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://localhost:3000';
const SLUG = __ENV.SLUG || 'demo';
const DINERS = Number(__ENV.DINERS || 20);
const DURATION = __ENV.DURATION || '5m';
const PREFETCH = Number(__ENV.PREFETCH || 10);
const TRACK = (__ENV.TRACK || '1') === '1';

export const options = {
  scenarios: {
    diners: { executor: 'constant-vus', vus: DINERS, duration: DURATION },
  },
  thresholds: {
    'http_req_duration{kind:html}': ['p(95)<1500'],
    'http_req_duration{kind:poll}': ['p(95)<800'],
    http_req_failed: ['rate<0.01'],
  },
};

const tHtml = new Trend('t_html', true);
const tPoll = new Trend('t_poll', true);
const tPrefetch = new Trend('t_prefetch', true);
const tProduct = new Trend('t_product', true);
const tTrack = new Trend('t_track', true);
const bytes = new Counter('bytes_total');

function get(url, kind, headers = {}) {
  const r = http.get(url, { tags: { kind }, headers: { 'Accept-Encoding': 'gzip, br', ...headers } });
  bytes.add(r.body ? r.body.length : 0);
  return r;
}

function track(kind, productId) {
  if (!TRACK) return;
  const r = http.post(`${BASE}/api/track`, JSON.stringify({ slug: SLUG, kind, product_id: productId || null }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { kind: 'track' },
  });
  tTrack.add(r.timings.duration);
}

export default function () {
  // 1. QR scan → HTML
  const html = get(`${BASE}/r/${SLUG}`, 'html');
  tHtml.add(html.timings.duration);
  check(html, { 'html 200': (r) => r.status === 200 });

  // product ids come from the polling payload (same shape the page embeds)
  const menu = get(`${BASE}/api/menu/${SLUG}`, 'poll');
  tPoll.add(menu.timings.duration);
  let products = [];
  try {
    const j = menu.json();
    for (const c of j.categories) for (const p of c.products) products.push(p.id);
  } catch (e) {
    /* closed/suspended restaurant */
  }

  // 2. manifest + sw.js + SW re-fetch of the page (activate-time priming)
  get(`${BASE}/r/${SLUG}/manifest.webmanifest`, 'manifest');
  get(`${BASE}/sw.js`, 'static');
  get(`${BASE}/r/${SLUG}`, 'html', { 'Service-Worker': 'script' });

  track('menu_open');

  // 3. cards enter the viewport → full RSC prefetch of the dynamic product route
  const seen = products.slice(0, PREFETCH);
  for (const id of seen) {
    const r = get(`${BASE}/r/${SLUG}/p/${id}`, 'prefetch', { RSC: '1', 'Next-Router-Prefetch': '1' });
    tPrefetch.add(r.timings.duration);
  }

  // 4. session of ~5 minutes: poll every 30s, open 2 products, visit cart
  const sessionSecs = 300;
  let elapsed = 0;
  let opened = 0;
  while (elapsed < sessionSecs) {
    sleep(30);
    elapsed += 30;
    const p = get(`${BASE}/api/menu/${SLUG}`, 'poll');
    tPoll.add(p.timings.duration);

    if (opened < 2 && products.length > opened) {
      const id = products[opened];
      const pr = get(`${BASE}/r/${SLUG}/p/${id}`, 'product');
      tProduct.add(pr.timings.duration);
      track('product_open', id);
      if (opened === 0) track('product_add', id);
      opened++;
    }
    if (elapsed === 150) {
      const c = get(`${BASE}/r/${SLUG}/cart`, 'cart');
      tProduct.add(c.timings.duration);
    }
  }
}
