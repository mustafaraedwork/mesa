# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Company context — read first:** `docs/COMPANY-CONTEXT.md` (BIZIII, the two products, the total-isolation rule, and the host-only cookie constraint).

## Project status

**Functionally complete, not yet deployed.** The app is built and builds clean: ~109 `.ts`/`.tsx` source files, 11 applied migrations (`0001`–`0011`), 24 routes, 19 smoke scripts. `tsc --noEmit` and `eslint` both pass with zero errors.

The commercial name is **BIZIII Menu**; the in-code identifier is still `mesa-os-lite` (`package.json`, `app/layout.tsx`, `public/sw.js` and 8 other spots). Both names refer to this repo.

| File | Role |
|---|---|
| `docs/COMPANY-CONTEXT.md` | Company + product isolation context — the one non-negotiable frame |
| `prd.md` | Source of truth for product behavior — read before architectural decisions |
| `RULES.md` | Hard constraints, simplicity-first principle. **Read first.** |
| `PHASES.md` | 8-phase implementation checklist. **Currently stale** — several items marked deferred actually shipped (drag & drop, `suggestions_type`, complementary categories, `show_unavailable_items`) |
| `PROGRESS.md` | Session log — append one line per work session |
| `docs/PAGES.md` | Per-page inventory read straight from the code |
| `docs/BIZIII-READINESS.md` | Deployment-readiness audit |
| `CLAUDE.md` | This file — orientation for future Claude instances |

The project owner is **Mustafa**; he prefers Arabic communication and authored the PRD himself. Frame technical work in terms of PRD sections (e.g. "the Closing mode flow in §3.1").

**Discipline when working:**
- Update `PHASES.md` checkboxes the moment a sub-task is done — not at end of session.
- Append to `PROGRESS.md` at end of each session (one line per item).
- If something contradicts `RULES.md`, stop and surface it before coding.

## Product in one paragraph

**BIZIII Menu** (`mesa-os-lite` in code) is a SaaS for small/medium single-branch restaurants, sold as manually-administered annual packages — primary market Iraq (IQD default), expanded market the Arab world (18 currencies). It delivers a QR-scanned digital menu for diners and a mobile PWA dashboard for restaurant owners. The signature feature is **mutually-exclusive smart modes** — now **Normal** and **Closing** (the Rush and Profit re-rank modes were retired 2026-05-26 — see below). Mustafa creates tenant accounts manually; payments are collected offline and only *recorded* in the owner panel (`payments` table, migration `0011`, with `plan` and `period_end` for optional annual renewal tracking). No online payment processing.

## Three user surfaces, three auth models

| Surface | Route | Auth |
|---|---|---|
| End customer (diner) | `/r/{slug}` | None — cart in `localStorage`, key `mesa-cart-{slug}`, TTL 2h |
| Tenant (restaurant owner) | `/admin/dashboard` | Custom: `username` + bcrypt(password) → 64-char token in **httpOnly cookie**, **permanent session** (no `expires_at` in `tenant_sessions`) |
| Platform owner (Mustafa) | `/owner/dashboard` | Supabase Auth (email + password), JWT role check |

Three auth systems coexist on purpose — do not unify them. RLS policies in §4.4 distinguish public reads (only when `restaurants.is_active = TRUE`) from owner full access. Tenant writes go through API routes that validate the session token; they do **not** rely on RLS for tenant identity.

## The modes (the core feature)

Exactly one mode active per restaurant at any time, stored as `restaurants.active_mode` ∈ `{normal, closing, off}` (migration `0004` removed the original rush/profit; `0006` added `off`). Mode changes propagate to the diner view eventually, bounded by the polling window (≤30s typical — see "Menu freshness" below). PRD §3.1 says "فوراً"; the actual contract is "within one polling cycle".

- **Normal** — manual `display_order`, plus an optional curated **Chef's Picks** selection: the owner flags products via `products.is_chef_pick` (modes tab → Normal card → "تعديل اختيارات الشيف" → `setChefPicks` clean-and-apply). Flagged items surface in the virtual "اختيارات الشيف" category at the top of the diner menu **with no discount** — but only alongside the first/default section (`parentId === firstParentId`), not every section. Empty selection hides it.
- **Closing** — discount 5/10/20% on a multi-select of products for 1–24h. A virtual "اختيارات الشيف" category renders **at the top** of the menu; the same items also appear in their original categories with the discounted price + struck-through original. Driven by `closing_mode_ends_at` and `closing_mode_discount` on `restaurants`, plus `products.is_in_closing_mode`. Auto-reverts to Normal via **lazy revert** (no cron) — `loadMenu` / `GET /api/admin/state` flip it back on the first read after the timer expires.
- **Off** (migration `0006`, 2026-05-26) — a plain menu: no Closing offers and no Chef's Picks section/heading; the diner sees only categories + products (the editorial greeting is also hidden). Set via the "إيقاف كل الأوضاع" button beside the mode cards. **Not** the same as deactivating the restaurant (`is_active = false`, which shows the closed screen). Chef-pick flags are preserved — they reappear when Normal is reactivated.

**Retired 2026-05-26 (owner decision):** **Rush** (sort by `prep_time_minutes` ASC within category) and **Profit** (sort by `profit_percentage` DESC within category). Reason: after the magazine/chip-filter redesign they were invisible within-category reordering with no diner-facing signal and no auto-revert — near-redundant with manually dragging items in Normal. The `profit_percentage` and `prep_time_minutes` **columns stay** (owner-facing fields, still shown in the admin menu); only the re-rank modes are gone.

When implementing modes, the re-ranking is a query/view-layer concern over the same `products` rows; do not duplicate data per mode.

## Suggestions algorithm (cart page)

Order of precedence for the 3–4 suggestions on `/r/:slug/cart`:
1. Manual `custom_suggestion_ids` for items currently in cart (when `suggestions_type = 'custom'`).
2. Items from categories listed in `complementary_categories` for the cart's categories.
3. If no complements configured: random items from categories **not** represented in the cart.
4. Always exclude: items already in cart, and unavailable items.
5. Final ordering of the suggestion list itself respects the active mode.

## Menu freshness

**Default: 30s polling** from the diner page (NetworkFirst on open, then poll). Supabase Realtime is the documented fallback only if polling proves insufficient — do not reach for it first. Service Worker caches HTML/CSS/JS (CacheFirst), API JSON (NetworkFirst with cache fallback), and the last 50 product images (CacheFirst LRU). Offline-after-first-visit is a hard requirement for the diner surface.

## Database (Supabase Postgres, Frankfurt)

8 tables — the 5 in `prd.md` §4.3 (`restaurants`, `categories`, `products`, `complementary_categories`, `tenant_sessions`) plus `events` (`0003`, analytics), `payments` (`0011`, billing ledger) and `login_attempts` (`0015`, the rate-limit window). Key constraints:

- `categories` is **2-level only** (`parent_id` self-FK, no grandchildren). Enforced in app code *and* by a DB trigger (`categories_enforce_two_levels`, migration `0009`).
- `products.suggestions_type` is `'default' | 'custom'`; `custom_suggestion_ids UUID[]` is only meaningful when `'custom'`.
- `complementary_categories` is a many-to-many self-join on `categories` scoped to a restaurant.
- `tenant_sessions` deliberately has **no `expires_at`** — sessions are permanent by design (multi-device login on the same account is allowed).
- `anon`/`authenticated` hold an **explicit column list** on `restaurants` and `tenant_sessions` since `0013`, not a blanket table grant. A new column on `restaurants` needs `GRANT SELECT (col)` in the SAME migration or the diner path breaks silently — see `docs/COMPANY-CONTEXT.md` §9.0.
- `restaurants.subscription_ends_at` (`0016`) is denormalized from `MAX(payments.period_end)` and maintained **only** by a trigger — never write it from app code.
- `ON DELETE CASCADE` flows from `restaurants` down through everything; deleting a tenant must also purge images from Cloudflare R2 (not handled by the DB).

## Image pipeline

Upload → Next.js API route → `sharp` (max 800×800, WebP, quality 80) → Cloudflare R2 → store URL. Never accept client-side compressed images as the source of truth — the server re-compresses. R2 egress is a flagged risk (§9 R2); plan on CDN caching in front of R2 for hot tenants.

## Languages

`name_ar` is **required** on `categories` and `products`. `name_en` and `name_ku` are optional. Diner UI falls back to Arabic when the selected language is missing for a given item — do not show empty strings or English keys.

## Routing map

`proxy.ts` (named `proxy.ts`, not `middleware.ts` — Next 16 rename) guards `/admin/dashboard/:path*` and `/owner/dashboard/:path*` only.

```
/                                       internal landing page (exists)
/r/:slug                                diner menu
/r/:slug/p/:productId                   product page
/r/:slug/cart                           cart + suggestions + "read to waiter" screen
/r/:slug/manifest.webmanifest           per-tenant PWA manifest
/admin                                  tenant login
/admin/dashboard/{menu,modes,analytics,design}   tenant PWA (4-tab bottom nav)
/admin/suspended                        subscription lapsed past grace (0016)
/owner                                  owner login (Supabase Auth)
/owner/dashboard                        owner overview
/owner/dashboard/accounts               account management
/owner/dashboard/accounts/:id           account detail
/owner/dashboard/billing                payment ledger + renewals
/owner/dashboard/analytics              platform analytics
/api/menu/:slug                         public menu JSON (30s polling target)
/api/admin/state                        tenant state polling
/api/admin/qr-pdf                       A4 QR sheet
/api/track                              analytics ingest
/api/health                             healthcheck
```

## Stack (installed)

Next.js **16.2.6** App Router + React 19.2.4 + TypeScript (strict) • TailwindCSS v4 + shadcn/ui • Supabase Postgres + RLS • Cloudflare R2 + `sharp` • PWA via a **hand-written `public/sw.js`** (no Workbox dependency) • `qrcode` + `pdf-lib` for QR generation • bcrypt (cost=10, `lib/auth/password.ts`) for tenant passwords.

Hosting: a `Dockerfile` + `output: 'standalone'` for Coolify/Contabo exist from an earlier plan; the current destination is **Vercel on `menu.biziii.io`** (`docs/COMPANY-CONTEXT.md`). Nothing is deployed yet.

## Explicitly out of scope (do not build)

KDS / kitchen display, per-table QR, online payments, delivery, loyalty/coupons, external POS integration, push notifications, sales reports, multi-branch, AI translation, multi-user-per-tenant. If a request implies any of these, surface the conflict with §8 of the PRD before implementing.

## Implementation phases

Phases 1–8 in `prd.md` §6 are the agreed sequencing (Foundation → Owner panel → Tenant menu CRUD → Modes → Design+QR → Diner UI → PWA/offline → Polish). All eight are substantially shipped; what remains open needs a live VPS/device or a manual pass. `PHASES.md` is the tracker — tick items there as they ship (it currently lags the code).

## Agent skills

### Issue tracker

Local markdown files under `.scratch/<feature>/` — no GitHub remote. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) recorded as `Status:` lines in issue files. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context convention: one `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`. **Neither exists yet** — the standing context lives in `docs/COMPANY-CONTEXT.md`, `prd.md`, and `RULES.md`.
