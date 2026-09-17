-- 0019 — tenant analytics as an aggregate RPC + events(product_id) index
-- (P0 fix 5, 2026-09-17 — CAPACITY_REPORT §7.1 #7, VERIFICATION_REPORT §1.4/§1.22).
--
-- Why: app/admin/dashboard/analytics/page.tsx read the RAW events rows for the
-- last 8 days and aggregated in JavaScript. PostgREST caps any response at
-- max-rows (1000 on Supabase), so a restaurant with more than ~1,000 events a
-- week silently saw a fraction of its numbers (measured: 1,000 of 8,900 rows).
-- The aggregation now happens in SQL and the page never touches raw events.
--
-- Contract (mirrors the page exactly):
--   * days are BAGHDAD-local (UTC+3, no DST) — p_tz_offset_minutes = 180;
--   * the window is the last p_days local days INCLUDING today;
--   * "today" counters are the current local day;
--   * menu_open rows never carry a product_id; product_open / product_add do.
--
-- SECURITY DEFINER + fixed search_path; EXECUTE is granted to service_role
-- only, like check_rate_limit (0015): the tenant panel reaches it through the
-- service-role client after requireTenant() resolved the restaurant.
--
-- Safe / additive: one function, one index. No data change. Re-runnable.

CREATE OR REPLACE FUNCTION tenant_analytics(
  p_restaurant_id     uuid,
  p_days              integer DEFAULT 7,
  p_tz_offset_minutes integer DEFAULT 180
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_off    interval := make_interval(mins => p_tz_offset_minutes);
  v_today  date     := (now() + make_interval(mins => p_tz_offset_minutes))::date;
  v_from   date     := v_today - (GREATEST(p_days, 1) - 1);
  -- UTC instant at which the first local day of the window starts — lets the
  -- planner use idx_events_restaurant_created instead of scanning every row.
  v_since  timestamptz := (v_from::timestamp - v_off) AT TIME ZONE 'UTC';
  v_menu   jsonb;
  v_prod   jsonb;
BEGIN
  -- Menu opens per local day, every day of the window present (0 when empty).
  SELECT coalesce(jsonb_agg(jsonb_build_object('day', to_char(d.day, 'YYYY-MM-DD'), 'opens', coalesce(c.n, 0)) ORDER BY d.day), '[]'::jsonb)
    INTO v_menu
    FROM generate_series(v_from, v_today, interval '1 day') AS d(day)
    LEFT JOIN (
      SELECT (e.created_at + v_off)::date AS day, count(*) AS n
        FROM events e
       WHERE e.restaurant_id = p_restaurant_id
         AND e.kind = 'menu_open'
         AND e.created_at >= v_since
       GROUP BY 1
    ) c ON c.day = d.day::date;

  -- Per-product opens / adds over the window and for today.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'product_id',  p.product_id,
           'opens',       p.opens,
           'opens_today', p.opens_today,
           'adds',        p.adds,
           'adds_today',  p.adds_today
         )), '[]'::jsonb)
    INTO v_prod
    FROM (
      SELECT e.product_id,
             count(*) FILTER (WHERE e.kind = 'product_open')                                              AS opens,
             count(*) FILTER (WHERE e.kind = 'product_open' AND (e.created_at + v_off)::date = v_today)   AS opens_today,
             count(*) FILTER (WHERE e.kind = 'product_add')                                               AS adds,
             count(*) FILTER (WHERE e.kind = 'product_add'  AND (e.created_at + v_off)::date = v_today)   AS adds_today
        FROM events e
       WHERE e.restaurant_id = p_restaurant_id
         AND e.product_id IS NOT NULL
         AND e.kind IN ('product_open', 'product_add')
         AND e.created_at >= v_since
       GROUP BY e.product_id
    ) p;

  RETURN jsonb_build_object(
    'today',       to_char(v_today, 'YYYY-MM-DD'),
    'from',        to_char(v_from, 'YYYY-MM-DD'),
    'menu_by_day', v_menu,
    'products',    v_prod
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION tenant_analytics(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION tenant_analytics(uuid, integer, integer) TO service_role;

-- events.product_id is a FK with ON DELETE CASCADE but had no index, so every
-- product delete — and every restaurant delete, once per product — sequentially
-- scanned the whole events table (measured: 81 of 113 ms at 100k rows; ~11 s
-- at 10M). Plain CREATE INDEX is correct while the table is small (the live
-- database is fresh). If this migration is ever applied to an events table
-- that already holds millions of rows, run instead, OUTSIDE a transaction
-- (SQL Editor, one statement on its own):
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_product
--     ON events (product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_product
  ON events (product_id) WHERE product_id IS NOT NULL;
