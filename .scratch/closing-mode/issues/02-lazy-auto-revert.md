# Closing Mode — lazy auto-revert on menu read

Status: ready-for-agent
Date: 2026-05-08
Source: `.scratch/closing-mode/design-decisions.md` (Q3)

## What to build

When `closing_mode_ends_at < NOW()` and `active_mode = 'closing'`, the next call to `GET /api/menu/:slug` reverts the restaurant to Normal *inline* — before reading the menu. No cron, no `pg_cron`, no Coolify scheduler, no webhook. Same revert step also runs at the top of `GET /api/admin/state` so a tenant who opens the dashboard after expiry sees clean state.

Pseudocode:

```sql
IF restaurant.active_mode = 'closing' AND restaurant.closing_mode_ends_at < NOW() THEN
  UPDATE restaurants
    SET active_mode='normal',
        closing_mode_ends_at=NULL,
        closing_mode_discount=NULL
    WHERE id = $1
      AND active_mode = 'closing';

  UPDATE products
    SET is_in_closing_mode=FALSE
    WHERE restaurant_id = $1
      AND is_in_closing_mode = TRUE;
END IF;
-- then proceed with the normal read
```

The `WHERE active_mode = 'closing'` and `WHERE is_in_closing_mode = TRUE` guards are load-bearing: they make the revert idempotent under concurrent reads. Two diner requests arriving simultaneously after expiry must not double-revert or race.

If no diner reads the menu for an hour after expiry, the DB legitimately stays in `active_mode='closing'`. That is acceptable — no consumer is misled, and the next read self-cleans.

## Acceptance criteria

- [ ] `GET /api/menu/:slug` performs the lazy revert before reading menu data when `closing_mode_ends_at < NOW()`
- [ ] `GET /api/admin/state` performs the same revert on first read after expiry
- [ ] After revert, the menu response shows `active_mode: 'normal'` and no `__closing__` virtual category
- [ ] Concurrent-request test: two simultaneous reads on an expired restaurant produce one set of UPDATEs total (verified via row-version or query plan); no duplicate updates, no errors
- [ ] If `active_mode = 'closing'` but `closing_mode_ends_at > NOW()`, no revert runs and the menu is served as Closing
- [ ] No new endpoint is introduced; specifically, no `POST /api/admin/modes/revert-if-expired`

## Blocked by

- `01-activation-tracer.md` — needs the activation path and menu API in place to have any expired state to revert from

## Comments

(empty)
