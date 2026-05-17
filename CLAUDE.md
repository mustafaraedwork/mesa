# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

**Pre-code.** No `package.json`, no source files, no tooling yet. The repo currently contains only docs:

| File | Role |
|---|---|
| `prd.md` | Source of truth for product behavior — read before architectural decisions |
| `RULES.md` | Hard constraints, simplicity-first principle. **Read first.** |
| `PHASES.md` | 8-phase implementation checklist — tick `[x]` as you ship |
| `PROGRESS.md` | Session log — append one line per work session |
| `CLAUDE.md` | This file — orientation for future Claude instances |

The project owner is **Mustafa**; he prefers Arabic communication and authored the PRD himself. Frame technical work in terms of PRD sections (e.g. "the Closing mode flow in §3.1").

**Discipline when working:**
- Update `PHASES.md` checkboxes the moment a sub-task is done — not at end of session.
- Append to `PROGRESS.md` at end of each session (one line per item).
- If something contradicts `RULES.md`, stop and surface it before coding.

## Product in one paragraph

**Mesa OS Lite** is a one-time-purchase SaaS (no subscriptions) for small/medium single-branch restaurants — primary market Iraq (IQD default), expanded market the Arab world (18 currencies). It delivers a QR-scanned digital menu for diners and a mobile PWA dashboard for restaurant owners. The killer feature is **4 mutually-exclusive smart modes** (Normal / Rush / Profit / Closing) that re-rank the menu in real time. Mustafa creates tenant accounts manually; payments are handled offline.

## Three user surfaces, three auth models

| Surface | Route | Auth |
|---|---|---|
| End customer (diner) | `/r/{slug}` | None — cart in `localStorage`, key `mesa-cart-{slug}`, TTL 2h |
| Tenant (restaurant owner) | `/admin/dashboard` | Custom: `username` + bcrypt(password) → 64-char token in **httpOnly cookie**, **permanent session** (no `expires_at` in `tenant_sessions`) |
| Platform owner (Mustafa) | `/owner/dashboard` | Supabase Auth (email + password), JWT role check |

Three auth systems coexist on purpose — do not unify them. RLS policies in §4.4 distinguish public reads (only when `restaurants.is_active = TRUE`) from owner full access. Tenant writes go through API routes that validate the session token; they do **not** rely on RLS for tenant identity.

## The 4 modes (the core feature)

Exactly one mode active per restaurant at any time, stored as `restaurants.active_mode` ∈ `{normal, rush, profit, closing}`. Mode changes propagate to the diner view eventually, bounded by the polling window (≤30s typical — see "Menu freshness" below). PRD §3.1 says "فوراً"; the actual contract is "within one polling cycle".

- **Normal** — manual `display_order` only.
- **Rush** — within each category, sort by `prep_time_minutes` ascending. Category order unchanged.
- **Profit** — within each category, sort by `profit_percentage` descending. Category order unchanged.
- **Closing** — discount 5/10/20% on a multi-select of products for 1–24h. A virtual "عروض اليوم" category renders **at the top** of the menu; the same items also appear in their original categories with the discounted price + struck-through original. Driven by `closing_mode_ends_at` and `closing_mode_discount` on `restaurants`, plus `products.is_in_closing_mode`. **A cron / scheduled task auto-reverts** to Normal when the timer expires and resets prices everywhere — this is required, not optional.

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

5 tables — schema defined in `prd.md` §4.3. Key constraints:

- `categories` is **2-level only** (`parent_id` self-FK, no grandchildren). Enforce in app code.
- `products.suggestions_type` is `'default' | 'custom'`; `custom_suggestion_ids UUID[]` is only meaningful when `'custom'`.
- `complementary_categories` is a many-to-many self-join on `categories` scoped to a restaurant.
- `tenant_sessions` deliberately has **no `expires_at`** — sessions are permanent by design (multi-device login on the same account is allowed).
- `ON DELETE CASCADE` flows from `restaurants` down through everything; deleting a tenant must also purge images from Cloudflare R2 (not handled by the DB).

## Image pipeline

Upload → Next.js API route → `sharp` (max 800×800, WebP, quality 80) → Cloudflare R2 → store URL. Never accept client-side compressed images as the source of truth — the server re-compresses. R2 egress is a flagged risk (§9 R2); plan on CDN caching in front of R2 for hot tenants.

## Languages

`name_ar` is **required** on `categories` and `products`. `name_en` and `name_ku` are optional. Diner UI falls back to Arabic when the selected language is missing for a given item — do not show empty strings or English keys.

## Routing map

```
/                         landing (optional, later)
/r/:slug                  diner menu
/r/:slug/cart             cart + suggestions + "read to waiter" screen
/admin                    tenant login
/admin/dashboard/{menu,modes,design}   tenant PWA (3-tab bottom nav)
/owner                    owner login (Supabase Auth)
/owner/dashboard/accounts owner account management
```

## Stack (planned, not yet installed)

Next.js 15 App Router + TypeScript • TailwindCSS + shadcn/ui • Supabase Postgres + RLS • Cloudflare R2 + `sharp` • Coolify on Contabo VPS • PWA via Workbox • `qrcode` for QR generation • bcrypt (cost=10) for tenant passwords.

## Explicitly out of scope (do not build)

KDS / kitchen display, per-table QR, online payments, delivery, loyalty/coupons, external POS integration, push notifications, sales reports, multi-branch, AI translation, multi-user-per-tenant. If a request implies any of these, surface the conflict with §8 of the PRD before implementing.

## Implementation phases

Phases 1–8 in `prd.md` §6 are the agreed sequencing (Foundation → Owner panel → Tenant menu CRUD → Modes → Design+QR → Diner UI → PWA/offline → Polish). Cross items off in `prd.md` as they ship — the checklist there is the project tracker.

## Agent skills

### Issue tracker

Local markdown files under `.scratch/<feature>/` — no GitHub remote. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`) recorded as `Status:` lines in issue files. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
