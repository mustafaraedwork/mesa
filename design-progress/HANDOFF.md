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
| **working tree (uncommitted)** | **Phase 2** | **Admin panel redesign — this session.** Ready to commit (see "Commit" below). |

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

---

## 🧪 Verification status (last run, clean warm server)
- `npx tsc --noEmit` → **clean**.
- `npx next build` → **OK** (compiles, all routes).
- `node scripts/run-smoke.mjs` → **12/13 pass**. Only `smoke-pwa` is the **documented dev flake** (passes "page loaded online", then hangs on SW activation under `next dev`+Turbopack; SW/manifest untouched; prod build passes). **Critically, both admin validators pass:** `smoke-no-native-confirms` (logs into the redesigned modes screen, drives the T2/T3 AlertDialogs, **zero console errors**) and `smoke-modes` (modes/chef-picks/off + suggestions/complementary/reorder data paths). `smoke-desync` now passes warm.
- **Console probe** across all 4 admin pages → **zero warnings/errors** (after the dnd-kit `useId` fix).
- **Screenshots:** `design-progress/phase-2/` — `01-menu`, `02-menu-product-dialog`, `03-modes`, `04-closing-dialog`, `05-chef-picks-dialog`, `06-analytics`, `07-design` (mobile 390×844, seeded ephemeral tenant via `shoot-admin.mjs`, emerald brand). Visually confirmed: distinct mode colors + mini-previews, Switch availability, contrast guards, bar chart + image grouping, chip-based duration, branded checkboxes.

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

## 💾 Commit (Phase 2 is uncommitted)
Stage explicitly (exclude `.claude/settings.local.json`):
```
git add components/ui app/admin app/owner app/globals.css lib/contrast.ts design-progress/phase-2 design-progress/shoot-admin.mjs design-progress/HANDOFF.md PROGRESS.md
git commit -m "feat(design-phase-2): admin panel — primitives, modes hero, analytics, design guards"
```

---

## ⏭️ Remaining work (DESIGN-PLAN §ب roadmap)

### Phase 3 — Owner (NOT STARTED)
`owner/dashboard/accounts/accounts-table.tsx` + `components/ui/table.tsx`: real data table — toolbar (count + search + primary action), sticky header, **mobile card layout** instead of the 8-col horizontal overflow (H3/M3). `Badge` for status is already applied (C8). Owner overview stat cards (H6 — "numbers in boxes"). Owner login identity. Add `ToastProvider` + `loading.tsx` skeletons to the owner shell. The Badge/Toast/Field/Table primitives are ready to reuse.

### Phase 4 — Motion & a11y polish (NOT STARTED)
Purposeful motion on the motion tokens (cart-bar enter, chip/section transitions — A1/A2 beyond the drag lift already done). Full heading-hierarchy + landmarks audit (W8) across diner + admin. Final automated a11y + keyboard + screen-reader pass (run `a11y-architect`). `LanguageDropdown` listbox contract (W7). Diner Chef's-Picks caption (was removed in Phase 1 as untranslated).

### Known deferral (needs data-layer change — out of "UI-only" scope, confirm with user)
- **F5:** distinguish "restaurant closed" from "transient DB/network error" — both render `ClosedScreen`. Requires `lib/menu.ts` (backend), so left for explicit approval.

---

## Final report owed to the user
Per-phase changes + commit hashes, before/after per screen, screenshot paths, final tsc/smoke/build results, anything not done + why. Phases 0–2 material is above; fill in 3–4 as completed.
