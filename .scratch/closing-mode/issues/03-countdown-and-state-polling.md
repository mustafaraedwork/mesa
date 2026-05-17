# Closing Mode — tenant countdown + multi-device state polling

Status: ready-for-agent
Date: 2026-05-08
Source: `.scratch/closing-mode/design-decisions.md` (Q10, Q12)

## What to build

The tenant Owner Dashboard needs a live HH:MM:SS countdown of the active Closing offer, kept consistent across devices and resilient to wrong system clocks on tenant phones.

**Source of truth**: `restaurants.closing_mode_ends_at` (TIMESTAMPTZ). Fetched once on dashboard mount, then a client-side `setInterval(1000)` ticks the displayed timer. **No per-second server polling.**

**Multi-device drift**: dashboard polls `GET /api/admin/state` every 10s. Response is small — `{ active_mode, closing_mode_ends_at, closing_mode_discount, server_now }`. Last-write-wins: no optimistic locking, no conflict resolution UI.

**Server clock correction (Q12)**: both `GET /api/menu/:slug` and `GET /api/admin/state` return `server_now: ISO8601`. On page load:

```ts
const offset = new Date(server_now).getTime() - Date.now();
// each tick:
const remainingMs = new Date(ends_at).getTime() - (Date.now() + offset);
```

This corrects countdown rendering for tenant devices whose system clock drifts. Recompute `offset` on every poll response.

**Expired-but-not-yet-reverted state (Q10)**: when the client detects `now > ends_at` it shows "انتهى — في انتظار التحديث" (expired — pending revert). The DB self-cleans on the next diner read or the next dashboard poll, both of which trigger the lazy revert from `02-lazy-auto-revert.md`. There is no `POST /revert-if-expired` endpoint; the indicator is purely a UI state.

## Acceptance criteria

- [ ] `GET /api/admin/state` returns `{ active_mode, closing_mode_ends_at, closing_mode_discount, server_now }` and runs the lazy revert (depends on slice 2)
- [ ] `GET /api/menu/:slug` includes `server_now: ISO8601` in its response
- [ ] Dashboard fetches state on mount, then polls every 10s
- [ ] `app/admin/modes/countdown.tsx` renders HH:MM:SS computed as `ends_at - (Date.now() + offset)`; updates every 1s via `setInterval`
- [ ] Setting the test browser's system clock 2 minutes ahead does not skew the countdown — it stays correct via the `server_now` offset
- [ ] When `now > ends_at`, the countdown is replaced by "انتهى — في انتظار التحديث"; after the next poll completes, the indicator clears and the dashboard reflects `active_mode='normal'`
- [ ] Two browser tabs on the same tenant account stay within 10s of each other when one tab activates Closing
- [ ] No optimistic locking, no conflict UI: a write from device B while device A's poll is in flight simply overwrites — last-write-wins

## Blocked by

- `01-activation-tracer.md` — needs an active Closing to count down from
- `02-lazy-auto-revert.md` — the dashboard's expired indicator relies on the next poll triggering the revert

## Comments

(empty)
