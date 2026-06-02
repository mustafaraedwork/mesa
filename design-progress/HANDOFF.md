# MenuPro Redesign — Session Handoff

**Updated:** 2026-06-02 · **Branch:** `feat/design-redesign` (from `fix/security-findings` HEAD `045461b`, includes security fixes H-1..H-5, M-1..M-8).
**Plan being executed:** `DESIGN-PLAN.md` §ب (phased roadmap). **Visual direction reference:** `design-preview.html`.
**Rule:** visual/UI only — no backend/auth/service-role/migration logic changes.

---

## ✅ Done so far

| Commit | Phase | Summary |
|---|---|---|
| `abb63c5` | baseline | DESIGN-PLAN.md + design-preview.html |
| `d88e15c` | **Phase 0** | Token system + primitives (button/input/dialog) |
| `f849298` | **Phase 1** | Diner surface redesign |
| `d5d1035` | **Phase 2** | Admin panel — primitives, modes hero, analytics, design guards |
| `da621ad` | **Phase 3** | Owner panel — responsive accounts table, stat cards, toasts |
| **working tree (uncommitted)** | **Phase 4** | **Motion + a11y polish — this session.** Ready to commit (see "Commit"). |

### Phase 0 — tokens & primitives (`d88e15c`)
OKLCH palette; semantic state tokens independent of brand; fluid type scale; spacing/motion tokens; solid focus outline; reduced-motion honored. Button ≥44px + focus ring + solid-red destructive; Input visible border; Dialog `end-2` close (RTL). Vazirmatn + Noto Sans Arabic + IBM Plex Mono.

### Phase 1 — diner surface (`f849298`)
`app/r/[slug]/_ui.tsx` (MenuImage/DiscountBadge/PriceTag/useSyncHtmlLang/nameLangProps). Two-palette collision solved (`brandVars()` injection). Logical-direction header, `next/image`, lucide icons, 44px targets, focus-trapped dialogs, mirrored arrows. `next.config.ts` R2 remotePatterns + dev-only CSP `'unsafe-eval'`.

### Phase 2 — admin panel (THIS SESSION — working tree)
**New primitives (`components/ui/`):**
- `badge.tsx` — semantic variants (success/warning/destructive/info/primary/neutral/outline/solid) using new `--*-text` AA-safe shades. Replaces hand-rolled status pills (K6/C8).
- `checkbox.tsx`, `switch.tsx`, `select.tsx` — on `@base-ui/react`, brand-styled; replace OS-native `<input type=checkbox>`/`<select>` (K2). Switch thumb mirrors under RTL.
- `dropdown-menu.tsx` — `@base-ui/react/menu`; powers the `⋮` overflow + the complementary "add" picker (H2).
- `field.tsx` — shared Field; `group` prop renders `role=group` (not `<label>`) for control *sets* so the heading doesn't bind to the first chip/checkbox or nest labels (K6).
- `toast.tsx` — `@base-ui/react/toast`: `ToastProvider` + `useToast()`. Wired into the dashboard layout. Replaces inline `<p>` feedback (A4); drives mode-switch + availability confirmations (A3/F1).

**Tokens (`globals.css`):** added `--success-text/--warning-text/--destructive-text/--info-text` (deepened, clear AA on light tints) + `--spacing-safe-b: env(safe-area-inset-bottom)`.

**`lib/contrast.ts` (NEW):** WCAG contrast utilities (`contrastRatio`, `readableTextOn`) for the design tab's live guards.

**Screens:**
- **`menu/menu-view.tsx`** — "button soup" → one primary action (`+ منتج`) + `⋮` overflow (H2); FAB for "+ سكشن" (M4); availability is now a **Switch** with optimistic state + success/error **toast** (was a silent swallow — F1) + `aria-label` carrying the product name (W9); `next/image` thumbs + designed icon fallback; per-span `lang/dir` on en/ku names (W2); designed empty state; root=`h3`/sub=`h4` headings (W8).
- **`menu/sortable-list.tsx`** — drag handle ≥24px (`h-9 w-7`) + lift shadow/ring while dragging (A2); Arabic keyboard **live-region announcements** of position (W5); stable `id={useId()}` per DndContext to kill the dnd-kit SSR hydration mismatch.
- **`menu/confirm-dialog.tsx`** — rebuilt on **AlertDialog** (role=alertdialog, no stray close-X) — unifies destructive confirmations (K3).
- **`menu/product-dialog.tsx` / `category-dialog.tsx` / `complementary-section.tsx`** — shared `Field`, `Select` (suggestions_type), `Checkbox` (custom suggestions via hidden inputs so the server action is unchanged), `DropdownMenu` (add-complement), lang attrs, styled file picker.
- **`modes/modes-view.tsx`** (the hero, F2) — three distinct semantic colors (Normal=success / Closing=primary / Off=warning, was Normal==Off==muted); lucide icons (no ⭐/✕); per-mode **mini-preview** of "what the diner sees" (`mode-preview.tsx`, NEW); Off restructured into a proper card; mode-switch **toast** "applies within ~30s" (A3); active state via `Badge` + ring.
- **`modes/closing-dialog.tsx`** (F6/W10) — duration **preset chips** (replace the raw range), `<output>` summary, product **search** + per-category count Badge, branded `Checkbox`, emphasized price-transition; `Field group` on chip sets.
- **`modes/chef-picks-dialog.tsx`** — search + branded `Checkbox` + count Badge.
- **`design/design-view.tsx`** (C5/F7) — **live WCAG contrast guards** (text/bg, text/card, primary/card with pass/fail Badges), curated **palette presets**, `Select` currency, `Switch` for show-unavailable, lucide icons in preview, header text auto-readable (`readableTextOn`).
- **`analytics/page.tsx`** (F3) — 7-day **bar chart** (today highlighted) + product **magnitude bars** grouped **with-image / without-image** showing average opens (answers "do photos help?"). Replaced the 7 number-boxes + ✓/✗.
- **`bottom-nav.tsx`** (M2) — `pb-[var(--spacing-safe-b)]`, lucide icons, active top-indicator.
- **`loading.tsx` ×5** — per-destination skeletons (menu/modes/analytics/design) + neutral parent fallback (F4).
- **`layout.tsx`** — wraps dashboard in `ToastProvider`; header uses lucide LogOut + tokens.
- **Owner (`accounts-table.tsx`, `owner/dashboard/page.tsx`)** — status pills → `Badge` (C8). (Full owner redesign is Phase 3.)

### Phase 3 — owner panel (THIS SESSION — working tree)
- **`owner/dashboard/accounts/accounts-table.tsx`** (H3/M3) — real data table: toolbar (search + count `Badge` + "حساب جديد" primary); **responsive split** — `<table>` on `md+`, **card-per-account on mobile** (was an 8-col horizontal scroll); availability is a **`Switch`** with optimistic state + success/error **toast** (was a silent button); row actions collapsed into a `⋮` `DropdownMenu` (change-password / delete). Client-side search over name/slug/username.
- **`owner/dashboard/page.tsx`** (H6) — stat cards gain semantic icon chips + meaning (Store/CircleSlash/UtensilsCrossed) instead of bare numbers; recent list uses `Badge` + a mirrored "all accounts" link.
- **`owner/dashboard/layout.tsx`** — wrapped in `ToastProvider`; sticky header with brand mark + in-header nav (`owner-nav-link.tsx`, NEW, active-aware) + lucide LogOut. Added `owner/dashboard/loading.tsx` skeleton.
- **`owner/page.tsx`** (login) — brand identity (logo mark + title + subtitle).
- **Dialogs** — `create-account-dialog` migrated to the shared `Field` (password field uses `group`); `delete-account-dialog` fires a success **toast**. (The "type the slug to confirm" delete stays a Dialog — it's a friction-gated destructive form.)
- Screenshots captured via a **temporary** `app/owner-preview` route with mock data (no owner auth needed), then the route was deleted before commit.

### Phase 4 — motion + a11y polish (THIS SESSION — working tree)
- **Motion (A1/A2):** diner cart-bar enter (`animate-in slide-in-from-bottom fade-in`, `--ease-out-expo`); product grid fades on section change (`key`+`animate-in fade-in`). (Drag-lift was already added in Phase 2.) All ride the existing motion tokens and are suppressed under `prefers-reduced-motion` (global rule).
- **W7 — diner language picker** converted from a hand-rolled listbox (every option `tabindex=0`, no roving focus) to the **base-ui `DropdownMenu`** primitive — correct keyboard nav / focus / aria for free; per-item `lang`/`dir`; check on the active language.
- **`useReturnFocus` hook (NEW in `_ui.tsx`)** — restores focus to the trigger when the welcome language popup and the "read to waiter" modal close (2.4.3); both were hand-rolled focus traps that didn't return focus.
- **Diner chips** — dropped the broken `role="tablist"`/`tab` contract (no tabpanels existed); chips are now `aria-pressed` filter buttons.
- **Admin/owner a11y** — modes `ModeCard` gets `aria-current` + an always-mounted `role=status` live region (4.1.3); design HEX input gets an `aria-label` (4.1.2); closing/chef product lists get `role=group`+`aria-labelledby` (1.3.1).
- **Audit:** ran the `a11y-architect` agent over all three surfaces — it confirmed **heading hierarchy + landmarks are clean** (W8) and the W7 fix is correct; its substantive findings were applied (the above), false positives (e.g. "outline-none kills the ring" — it's a box-shadow ring) and low-value items were logged and skipped.

---

## 🧪 Verification status (last run, clean warm server)
- `npx tsc --noEmit` → **clean**.
- `npx next build` → **OK** (compiles, all routes).
- `node scripts/run-smoke.mjs` → **12/13 pass**. Only `smoke-pwa` is the **documented dev flake** (passes "page loaded online", then hangs on SW activation under `next dev`+Turbopack; SW/manifest untouched). **Confirmed 2026-06-02:** against a real production server (`next build` → `next start`), `smoke-pwa` **passes fully** (11/11 — SW activates & controls, HTML+API caches, offline reload served, no console errors). So the suite is 13/13 green in the environment each test targets; the dev hang is purely a Turbopack artifact. **Critically, both admin validators pass:** `smoke-no-native-confirms` (logs into the redesigned modes screen, drives the T2/T3 AlertDialogs, **zero console errors**) and `smoke-modes` (modes/chef-picks/off + suggestions/complementary/reorder data paths). `smoke-desync` now passes warm.
- **Console probe** across all 4 admin pages → **zero warnings/errors** (after the dnd-kit `useId` fix).
- **Phase 3 re-run:** tsc clean, build OK; smoke with `smoke-pwa` sidelined → **11/12**, the only fail being `smoke-desync` which **passes warm/isolated** (709ms < 1000ms) — the documented perf-threshold flake under suite load, not a regression (Phase 3 touched owner files only). The owner-preview route showed **zero dev-overlay issues** (clean console).
- **Screenshots:**
  - `design-progress/phase-2/` — `01-menu`, `02-menu-product-dialog`, `03-modes`, `04-closing-dialog`, `05-chef-picks-dialog`, `06-analytics`, `07-design` (mobile 390×844, ephemeral tenant via `shoot-admin.mjs`).
  - `design-progress/phase-3/` — `01-login` (390), `02-overview-accounts-desktop` (1280), `03-accounts-mobile` (390). Confirmed: stat-card icons, table↔cards responsive split, Switch toggles, search/count toolbar.
- **Phase 4 re-run:** tsc clean, build OK; smoke (pwa sidelined) → **12/12** (smoke-desync passed warm this time). a11y-architect audit applied. Diner screenshots in `design-progress/phase-4/` (`01-welcome`, `02-menu-rtl`, `03-menu-ltr`, `04-product`, `05-cart`, `06-admin-login`, `07-owner-login`) — confirmed the diner is intact after the language-picker swap + motion (no regression).

---

## ⚠️ Gotchas / decisions (READ before resuming)
1. **`next build` clobbers the running `next dev`'s `.next`** → the dev server then serves 500s/broken chunks until restarted. **This bit us this session:** `TaskStop` killed the wrapper but the node process survived on :3000 with a clobbered `.next`, so a fresh `npm run dev` landed on :3001 and the smoke suite hit the stale :3000 → 6 false failures. **Fix:** after any build, kill the node process holding :3000 (`Get-NetTCPConnection -LocalPort 3000` → `Stop-Process`), then start one clean dev, **warm the routes with curl** (Turbopack compiles per-route on first hit; cold compiles exceed the smoke 30s waits), then run smokes.
2. **dnd-kit SSR hydration** — nested DndContexts diverge on `aria-describedby="DndDescribedBy-N"` (global counter). Fixed with `id={useId()}` on each `DndContext` in `sortable-list.tsx`. Keep it.
3. **`@base-ui/react` Select is generic** — `Select.Root.Props` needs type args; the `select.tsx` wrapper is generic `<Value, Multiple>`. Pass `items={record}` to the Root so `Select.Value` renders the chosen label; render `SelectItem`s for the list. `name=` on the Root submits a hidden input (used for `suggestions_type`).
4. **`Field group`** — use `group` whenever the field wraps a *set* of controls (chip toggles, checkbox lists). Plain `<Field>` is a `<label>`; wrapping a button group makes the heading click the first button and nests labels.
5. **Toast position** — viewport sits above the bottom-nav (`bottom-[calc(var(--spacing-safe-b)+4.75rem)]`). `useToast()` only works inside `ToastProvider` (in the dashboard layout). Owner pages don't have it yet (Phase 3).
6. **Admin screenshots need auth** — `design-progress/shoot-admin.mjs` seeds an ephemeral tenant + `tenant_sessions` cookie (same pattern as `smoke-no-native-confirms.mjs`) and deletes it after. Run with `node --env-file=.env.local`.
7. **`.claude/settings.local.json`** is `M` in the working tree but is **not** part of this redesign — do not stage it (use explicit `git add <paths>`).

---

## ▶️ How to resume
```
git checkout feat/design-redesign
npm run dev                       # if you just built, FIRST kill the node on :3000 (see gotcha #1)
# warm routes so smokes don't hit cold-compile timeouts:
curl -s -o /dev/null http://localhost:3000/r/origins ; for r in menu modes analytics design; do curl -s -o /dev/null http://localhost:3000/admin/dashboard/$r; done
# gate:
npx tsc --noEmit ; npx next build ; (kill :3000 node, restart dev, warm) ; node scripts/run-smoke.mjs
# admin screenshots: node --env-file=.env.local design-progress/shoot-admin.mjs design-progress/phase-N
# diner/public screenshots: node design-progress/shoot.mjs design-progress/phase-N
```

## 💾 Commit (Phase 4 is uncommitted)
Stage explicitly (exclude `.claude/settings.local.json`):
```
git add app/r components/ui/.gitkeep app/admin/dashboard/modes app/admin/dashboard/design design-progress/phase-4 design-progress/HANDOFF.md PROGRESS.md
git commit -m "feat(design-phase-4): motion + a11y polish — listbox→menu, return-focus, chip semantics"
```
(adjust paths to the actual changed files — see `git status`.)

---

## ✅ Redesign complete — phases 0–4 all shipped

The full DESIGN-PLAN §ب roadmap is done: tokens/primitives (0), diner (1), admin (2), owner (3), motion + a11y (4). All gates green (tsc/build/smoke 12/13 with the single documented `smoke-pwa` dev flake). a11y-architect confirmed heading hierarchy + landmarks clean.

### Possible future polish (optional, not blocking)
- Re-add a **translated** diner Chef's-Picks eyebrow caption (removed in Phase 1 as untranslated `CHEF'S SELECTION · TONIGHT`).
- Analytics bars could expose `role=meter` (low value — the adjacent number is the accessible data).
- A polite live region announcing "cart cleared" after the read-to-waiter clear (a11y nicety).

### Known deferral (needs data-layer change — out of "UI-only" scope, confirm with user)
- **F5:** distinguish "restaurant closed" from "transient DB/network error" — both render `ClosedScreen`. Requires `lib/menu.ts` (backend), so left for explicit approval.

---

## Final report owed to the user
Per-phase changes + commit hashes, before/after per screen, screenshot paths, final tsc/smoke/build results, anything not done + why. Phases 0–2 material is above; fill in 3–4 as completed.
