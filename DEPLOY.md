# DEPLOY.md — Mesa OS Lite

> **Target stack:** Coolify on Contabo VPS, Cloudflare DNS for `qaema.app`, Supabase (Frankfurt) for DB+Auth, Cloudflare R2 for image storage.

---

## 0. Prerequisites (one-time)

- Contabo VPS provisioned (any plan with ≥2 vCPU / 4GB RAM is plenty for MVP traffic)
- Coolify installed on the VPS (`curl -fsSL https://cdn.coolify.io/coolify/install.sh | bash`)
- GitHub repo created (private), this codebase pushed
- Cloudflare account holds the `qaema.app` zone
- Supabase project running, both `0001_init.sql` and `0002_owner_rls_app_metadata.sql` applied
- R2 bucket `mesa-os-lite` created + public custom domain (e.g. `images.qaema.app`) bound to it

---

## 1. DNS — Cloudflare → VPS

In Cloudflare DNS for `qaema.app`:

| Type | Name | Content | Proxy | TTL |
|------|------|---------|-------|-----|
| A    | `@`  | `<VPS_PUBLIC_IPv4>` | DNS only (grey cloud)¹ | Auto |
| A    | `www`| `<VPS_PUBLIC_IPv4>` | DNS only | Auto |

¹ **DNS only**, not "Proxied". Coolify provisions its own Let's Encrypt cert through Traefik; the Cloudflare proxy would conflict with it. You can flip to "Proxied" later once issuance is confirmed working — but only after switching SSL mode to "Full (strict)" in Cloudflare.

If you also use R2 with a custom domain (`images.qaema.app`), add a CNAME for it per the R2 setup wizard. That can stay proxied.

---

## 2. Coolify — create the application

1. **Sources** → **GitHub** → connect with a personal access token, pick the `menupro` repo
2. **+ New** → **Application** → **Public/Private repo** → choose `menupro`
3. **Build pack:** **Dockerfile** (the repo has one at `/Dockerfile`)
4. **Branch:** `main`
5. **Ports:** internal port = `3000` (matches `Dockerfile` EXPOSE)
6. **Domains:** add `qaema.app` and `www.qaema.app`; enable **Force HTTPS**
7. **Healthcheck:** Coolify uses the Dockerfile `HEALTHCHECK` automatically; no extra config

Save. Don't deploy yet — set env vars first.

---

## 3. Environment variables in Coolify

Coolify exposes two scopes: **Build Args** and **Runtime**. Public envs must be set as **both** (Next inlines them at build time, and the runtime may also read them).

### Build Args (Build-time only, inlined into the bundle)

```
NEXT_PUBLIC_SUPABASE_URL          = https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY     = eyJ...    (Supabase Settings → API → anon public key)
NEXT_PUBLIC_APP_URL               = https://qaema.app
```

### Runtime envs (Secrets — never in the bundle)

```
SUPABASE_SERVICE_ROLE_KEY  = eyJ...           (Supabase Settings → API → service_role, KEEP SECRET)
R2_ENDPOINT                = https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID           = ...
R2_SECRET_ACCESS_KEY       = ...
R2_BUCKET                  = mesa-os-lite
R2_PUBLIC_URL              = https://images.qaema.app   (or https://pub-XXXX.r2.dev as fallback)
```

Mark `SUPABASE_SERVICE_ROLE_KEY`, `R2_SECRET_ACCESS_KEY`, and `R2_ACCESS_KEY_ID` as **secret** (eye-icon hidden) in the Coolify UI.

Reference: `.env.production.example` in the repo lists the same keys.

---

## 4. First deploy

1. Hit **Deploy** in Coolify. Coolify will:
   - Pull the repo
   - Run `docker build` with the Build Args
   - Start the container with the Runtime envs
   - Provision a Let's Encrypt cert via Traefik for `qaema.app` + `www.qaema.app`
   - Bind port 3000 to the public domain over HTTPS

2. Watch the build logs. Common first-time failures:
   - **Build arg missing** — Next will warn `NEXT_PUBLIC_X is not defined`; add it under Build Args and rebuild
   - **sharp install fails on Alpine** — Dockerfile already adds `libc6-compat`; if it still fails check the sharp version in package.json (≥0.33 ships prebuilt musl binaries)
   - **Cert issuance fails** — verify the DNS A record points to the VPS and propagated (`dig +short qaema.app`)

3. Once healthy, visit `https://qaema.app/` — should show the placeholder landing page.

---

## 5. Post-deploy verification (5 minutes)

Run these from your laptop after each deploy.

```bash
# 1. Landing page reachable + cert valid
curl -fsS -o /dev/null -w "%{http_code} %{ssl_verify_result}\n" https://qaema.app/
# expect: 200 0

# 2. PWA manifest is served and per-restaurant
curl -fsS "https://qaema.app/r/<some-real-slug>/manifest.webmanifest" | jq .theme_color
# expect: the restaurant's primary_color, not the default

# 3. Menu API responds and has the no-store header (Bug #3 fix)
curl -fsS -D - -o /dev/null "https://qaema.app/api/menu/<some-real-slug>" | grep -i cache-control
# expect: Cache-Control: no-store, no-cache, must-revalidate

# 4. Service worker is served at root with the right headers
curl -fsS -D - -o /dev/null https://qaema.app/sw.js | grep -iE "(service-worker-allowed|cache-control)"
# expect:
#   Service-Worker-Allowed: /r/
#   Cache-Control: no-cache
```

Manual smoke (browser):
- Open `https://qaema.app/r/<slug>` on Chrome desktop → DevTools → Application → Service Workers should show `activated` and scope `/r/<slug>/`
- Application → Manifest should show the restaurant name, theme color, and the 3 PNG icons (192, 512 any, 512 maskable)
- Run an actual diner flow: add to cart → open cart → "اقرأ للنادل"
- Run the owner flow: `/owner` → login → accounts CRUD
- Run the tenant flow: `/admin` → login → toggle modes, check the 30s polling reflects on the diner page

---

## 6. Day-2 operations

| Task | Where |
|------|-------|
| Push new code | `git push` → Coolify auto-rebuilds (if webhook enabled) |
| Tail container logs | Coolify → Application → **Logs** |
| Rebuild without code change (e.g. after env var change) | Coolify → **Redeploy** |
| Rollback to previous build | Coolify → **Deployments** tab → pick prior commit → **Redeploy** |
| Update Supabase schema | `psql ...` or Supabase dashboard SQL editor — Coolify is not in the loop |
| Restart container | Coolify → **Restart** |
| Adjust resource limits | Coolify → Application → **Advanced** → CPU/RAM limits |

---

## 7. Known production risks (from PRD §9)

- **R2 egress cost** — every diner page load fetches product images. Mitigate by binding a Cloudflare custom domain to the R2 bucket so Cloudflare caches the edge (free egress to the proxy). `R2_PUBLIC_URL` should be `https://images.qaema.app`, not the raw `pub-XXXX.r2.dev` URL
- **Cold start latency** — first request after a deploy renders all dynamic routes from scratch. Coolify's healthcheck warms the landing page; the diner page (`/r/<slug>`) only warms when first visited. For a multi-tenant launch where one slug dominates, add a manual warm-up curl to that slug in a post-deploy hook
- **Single VPS — no HA** — accepted MVP risk per RULES.md §1. If the box goes down, the app goes down. Snapshot the VPS in Contabo monthly
- **PWA icon = placeholder** — `public/icon-*.png` are sharp-generated "M" placeholders on `#327bb3`. Replace with the designed asset before public launch

---

## 8. Pre-launch checklist

- [ ] DNS A records for `qaema.app` + `www.qaema.app` point to VPS
- [ ] Coolify cert issued + Force HTTPS on
- [ ] R2 custom domain `images.qaema.app` bound + tested with one image
- [ ] All 9 env vars set in Coolify (3 build + 6 runtime)
- [ ] Owner user exists in Supabase Auth + `raw_app_meta_data.role = 'owner'` set (see `0002_owner_rls_app_metadata.sql` tail)
- [ ] First real tenant created via owner panel, smoke-tested end-to-end
- [ ] Secrets rotated (see ROTATION section in this file, to be added)
- [ ] PWA icons replaced with final design (PNG 192/512/512-maskable + apple-touch 180)
- [ ] Cloudflare proxy switched on (orange cloud) only after cert + Full Strict SSL confirmed
- [ ] Contabo snapshot taken
