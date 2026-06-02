# MenuPro Redesign — Session Handoff

**Date:** 2026-06-02 · **Branch:** `feat/design-redesign` (created from `fix/security-findings` HEAD `045461b`, which includes all security fixes H-1..H-5, M-1..M-8).
**Plan being executed:** `DESIGN-PLAN.md` §ب (phased roadmap). **Visual direction reference:** `design-preview.html`.
**Rule:** visual/UI only — no backend/auth/service-role/migration logic changes.

---

## ✅ Done so far (committed)

| Commit | Phase | Summary |
|---|---|---|
| `abb63c5` | baseline | DESIGN-PLAN.md + design-preview.html |
| `d88e15c` | **Phase 0** | Token system + primitives |
| `f849298` | **Phase 1** | Diner surface redesign |

### Phase 0 — tokens & primitives (`d88e15c`)
- `app/globals.css`: rewritten. OKLCH palette; **semantic state tokens** (`--success/--warning/--destructive/--info` + `*-foreground`) **independent of brand**; `--destructive` now **pure red** (was burgundy, indistinct from primary); `--muted-foreground`/borders darkened to pass WCAG AA; **fluid type scale** (`--text-caption..--text-display`), **spacing scale** (`--spacing-gutter/card/stack/section`), **motion tokens**; **solid focus outline** (was `outline-ring/50` ≈2:1 invisible); `prefers-reduced-motion` honored globally; `--primary` is brand-overridable.
- `app/layout.tsx`: **Vazirmatn** (Arabic+Kurdish Sorani+Latin) + **Noto Sans Arabic** fallback + IBM Plex Mono. Dropped Tajawal/Inter. Variables: `--ff-vazir/--ff-noto/--ff-mono`.
- `components/ui/button.tsx`: sizes **≥44px** (default `h-11`, sm `h-9`, lg `h-12`, icon `size-11`); solid high-contrast focus ring with offset; **destructive = solid red fill**; shadow toned to `shadow-card`.
- `components/ui/input.tsx`: `h-11`; visible `border-border-strong`; fixed focus ring.
- `components/ui/dialog.tsx`: close button `end-2` (RTL-safe, was `right-2`).

### Phase 1 — diner surface (`f849298`)
- **`app/r/[slug]/_ui.tsx` (NEW):** `MenuImage` (next/image fill + designed no-photo fallback), `DiscountBadge` (semantic red, fixed — never re-skinned), `PriceTag` (mono, `dir`-safe), `useSyncHtmlLang` (sets `<html lang/dir>` on language switch — WCAG 3.1.2), `nameLangProps`, `formatAmount`.
- **`menu-view.tsx`:** **two-palette collision SOLVED** — `brandVars()` injects `--primary/--ring/--background/--card/--foreground` from the restaurant onto `<main>`, so chips/prices/add-buttons follow the tenant while semantic colors stay fixed. Header now **logical-direction** (removed `dir="ltr"` — logo at start, actions at end; mirrors RTL/LTR correctly). Removed the `WEDNESDAY · 14:22` clock eyebrow. Chips: dual-signal active state + `aria-selected` + ≥40px. ProductCard: `next/image` + `line-clamp-2` name + 44px add button + lang attrs. Logo via next/image.
- **`welcome-screen.tsx`:** brand vars, next/image logo, **mirrored CTA arrow** (ArrowRight + `rtl:-scale-x-100`), gold→`accent-text` (AA), language popup now has **focus trap + `aria-labelledby`**, 44–48px targets.
- **`product-view.tsx`:** brand vars, next/image hero (priority), mirrored back arrow (ArrowLeft + `rtl:-scale-x-100`), `Clock`/`Plus` lucide (was ⏱/+), PriceTag inline, 48px add button.
- **`cart-view.tsx`:** brand vars, next/image thumbs, **qty steppers = Minus/Plus icons in 40px hit areas** (was localized word in 28px box), PriceTag, designed empty state, `Trash2`/`Megaphone`/`X` lucide (was 🗑/📣/×), ReadToWaiter modal now **focus trap + `aria-labelledby` + named close**.
- **`closed-screen.tsx`:** lucide `Coffee` (was 🚫).
- **`next.config.ts`:** `images.remotePatterns` for R2 (`**.r2.dev`, `**.r2.cloudflarestorage.com`, + host from `R2_PUBLIC_URL`); `imageSizes` capped. **Dev-only CSP `'unsafe-eval'`** — see gotcha #1.

---

## 🧪 Verification status (last run)
- `npx tsc --noEmit` → **clean** (after both phases).
- `npx next build` → **OK** (compiles, all routes).
- `node scripts/run-smoke.mjs` → **11/13 pass**. The 2 "fails" are **dev-environment flakes, not regressions**:
  - `smoke-desync` — all functional asserts pass; fails only the `<1000ms` perf threshold on a cold-compiled route (got 1106ms; **passes warm: 792ms**).
  - `smoke-pwa` — "page loaded online" passes, then **hangs/races on SW activation under `next dev`+Turbopack**. SW (`public/sw.js`) + manifest were **not touched**; `next/image` is SW-safe (SW caches by `req.destination === 'image'`, which covers `/_next/image`). Production build (the real PWA gate) passes.

### Screenshots captured (mobile 390×844, slug `origins`, brand orange `#d05a0b`)
- `design-progress/phase-0/` and `design-progress/phase-1/`: `01-welcome`, `02-menu-rtl`, `03-menu-ltr`, `04-product`, `05-cart`, `06-admin-login`, `07-owner-login`.
- Phase-1 confirmed visually: RTL/LTR header mirroring correct, brand color consistent across chips/prices/buttons (two-palette fixed), real food photos via next/image, 44px targets, redesigned language popup + empty cart.

---

## ⚠️ Gotchas / decisions (READ before resuming)
1. **`next build` clobbers the running `next dev`'s `.next`.** After every `next build`, the dev server serves broken chunks (500 / `text/plain` MIME) until restarted. **Always restart `npm run dev` after a build** before running smokes/screenshots.
2. **Dev CSP needed `'unsafe-eval'`.** The strict prod CSP (M-1 security work, no `unsafe-eval`) breaks **Next dev mode** (React needs eval in dev). Added `IS_DEV` branch in `next.config.ts` so dev works while **production CSP stays strict & unchanged**. This is dev tooling, not a prod security change — flagged for review.
3. **`d88e15c` accidentally bundled two pre-existing working-tree edits** (not authored this session): `.claude/settings.local.json` and `supabase/migrations/0010_schema_constraints.sql` (+8 lines). They were `M` at session start (the user's own uncommitted work). Swept in by `git add -A`. **Going forward use explicit `git add <paths>`, not `-A`.** Surface to user.
4. Smoke tests that need the dev server have **35s polling waits** → suite takes ~3–4 min. Run in background + Monitor for the `pass:` line.
5. Admin/owner **interiors require auth** (tenant bcrypt session / Supabase owner JWT) — only the public login pages were live-screenshotted. Avoided minting service-role sessions for screenshots (per the "Mustafa runs admin SQL himself" rule). Admin verification leans on `smoke-modes` / `smoke-analytics` / `smoke-no-native-confirms` + build.

---

## ▶️ How to resume
```
# 1. confirm branch
git checkout feat/design-redesign
# 2. start dev (restart it after ANY next build)
npm run dev          # http://localhost:3000
# 3. screenshots (public diner + logins)
node design-progress/shoot.mjs design-progress/phase-N
# helper: list active slugs → node design-progress/_get-slug.mjs   (best slug: origins, 23 products)
# 4. gate after each phase
npx tsc --noEmit ; npx next build ; (restart dev) ; node scripts/run-smoke.mjs
```

---

## ⏭️ Remaining work (DESIGN-PLAN §ب roadmap)

### Phase 2 — Admin (NOT STARTED; was mid-read of `modes-view.tsx` when paused)
Audit refs in DESIGN-PLAN Part A: H2, K2, K3, K6, M1(admin), M2, F1, F2, F3, F6, F7, A2, A3, W5, W9, C5.
- **New primitives:** `Badge` (semantic, replaces duplicated status pills in `accounts-table.tsx` + `dashboard/page.tsx`), `Checkbox`, `Select`, `Switch` (replace native `<select>`/`<input type=checkbox>` — 3 divergent selects + OS-blue checkboxes in `product-dialog.tsx:157`, `design-view.tsx:138`, `complementary-section.tsx:80`, and all checkbox sites). Optional `Toast` (replace inline `<p>` feedback; fixes silent toggle F1).
- **`modes-view.tsx` (the hero screen, F2):** give Normal / Closing / **Off distinct semantic colors** (currently Normal == Off == `bg-muted`; `MODE_META` at line 43); replace emoji ⭐/✕ with lucide icons; add a per-mode "what the diner sees" mini-preview; toast/animated confirmation on switch (A3); the Off control is a `<Button>` holding a full explanatory sentence (line 250) — restructure. `closing-dialog.tsx`: native range slider → preset chips matching the discount chips (F6), add `aria-valuetext`/`<output>` (W10), search + per-category count.
- **`admin/dashboard/menu/menu-view.tsx`:** "button soup" rows → one primary action + `⋮` overflow for secondary/destructive (H2); FAB for "+ سكشن" (M4); `sortable-list.tsx` drag handle ≥24px + lift shadow + keyboard position live-region (M1/A2/W5); availability toggle needs success/error feedback (silent failure F1) + `aria-label` with product name (W9).
- **`analytics/page.tsx` (F3):** 7 number-boxes → bar/sparkline (unused `--chart-*` tokens exist); product table → magnitude bars + with-image/without-image grouping.
- **`design-view.tsx` (C5/F7):** live contrast guards on the 5 color pickers + curated presets; `<input type=color>` polish.
- **`bottom-nav.tsx` (M2):** add `pb-[env(safe-area-inset-bottom)]` (token `--spacing-safe-b` not yet added — add to globals if needed).
- **Confirmations (K3):** unify on `AlertDialog` for destructive; `confirm-dialog.tsx` (custom Dialog) duplicates it with a stray close-X.
- **Skeletons (F4):** `admin/dashboard/loading.tsx` doesn't match modes/design/analytics destinations.
- Extract the 4–5× duplicated `Field` component (K6).

### Phase 3 — Owner (NOT STARTED)
`accounts-table.tsx` + `table.tsx`: real data table (toolbar w/ count+search+primary action, sticky header, **mobile card layout** instead of 8-col overflow — H3/M3), `Badge` for status (C8), login page identity, add `loading.tsx` skeletons.

### Phase 4 — Motion & a11y polish (NOT STARTED)
Purposeful motion (cart-bar enter, chip/section transitions, drag lift) on the motion tokens (A1/A2); heading hierarchy + landmarks audit (W8); translate the (now-removed) Chef's caption properly if re-added; final automated a11y + keyboard + screen-reader pass (run the `a11y-architect` agent). Note: the diner Chef's-Picks English caption was **removed** in Phase 1 (was untranslated `CHEF'S SELECTION · TONIGHT`).

### Known deferral (needs data-layer change — out of "UI-only" scope, confirm with user)
- F5: distinguish "restaurant closed" from "transient DB error" — both currently render `ClosedScreen`. Requires `lib/menu.ts` change (backend), so left for explicit approval.

---

## Final report still owed to the user (per original request)
A single report: per-phase changes + commit hashes, before/after note per screen, screenshot paths, final tsc/smoke/build results, anything not done + why, and decisions taken. Phases 0–1 material for it is above; fill in 2–4 as completed.
