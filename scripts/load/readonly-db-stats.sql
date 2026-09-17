-- ════════════════════════════════════════════════════════════════════════════
-- readonly-db-stats.sql — capacity facts from the LIVE database (SELECT-only)
-- ════════════════════════════════════════════════════════════════════════════
-- Paste into Supabase Dashboard → SQL Editor on the production project.
-- Nothing here writes. EXPLAIN ANALYZE on SELECTs is read-only.
-- Replace :slug with a real restaurant slug in §4 before running that section.

-- §1 table + index sizes, row estimates
SELECT c.relname AS table,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS total,
       pg_size_pretty(pg_relation_size(c.oid))       AS heap,
       pg_size_pretty(pg_indexes_size(c.oid))        AS indexes,
       c.reltuples::bigint                            AS est_rows,
       CASE WHEN c.reltuples > 0 THEN pg_total_relation_size(c.oid) / c.reltuples ELSE NULL END AS bytes_per_row
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY pg_total_relation_size(c.oid) DESC;

-- §2 exact row counts (cheap at this scale)
SELECT 'restaurants' t, count(*) FROM restaurants UNION ALL
SELECT 'categories', count(*) FROM categories UNION ALL
SELECT 'products', count(*) FROM products UNION ALL
SELECT 'complementary_categories', count(*) FROM complementary_categories UNION ALL
SELECT 'tenant_sessions', count(*) FROM tenant_sessions UNION ALL
SELECT 'events', count(*) FROM events UNION ALL
SELECT 'payments', count(*) FROM payments UNION ALL
SELECT 'login_attempts', count(*) FROM login_attempts;

-- §3 every index with size and usage
SELECT s.relname AS table, s.indexrelname AS index, pg_size_pretty(pg_relation_size(s.indexrelid)) AS size,
       s.idx_scan, s.idx_tup_read, i.indexdef
FROM pg_stat_user_indexes s JOIN pg_indexes i ON i.indexname = s.indexrelname AND i.schemaname = 'public'
ORDER BY s.relname, s.indexrelname;

-- §4 plans for the diner path (lib/menu.ts) — replace :slug
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, slug, display_name, is_active, deleted_at, subscription_ends_at, primary_color, background_color, header_color, card_color, text_color, logo_url, currency, show_unavailable_items, active_mode, closing_mode_ends_at, closing_mode_discount
FROM restaurants WHERE slug = :slug;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id, parent_id, name_ar, name_en, name_ku, display_order FROM categories
WHERE restaurant_id = (SELECT id FROM restaurants WHERE slug = :slug) ORDER BY display_order;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id, category_id, name_ar, name_en, name_ku, price, prep_time_minutes, image_url, is_available, is_in_closing_mode, closing_discount_percent, is_chef_pick, display_order, suggestions_type, custom_suggestion_ids
FROM products WHERE restaurant_id = (SELECT id FROM restaurants WHERE slug = :slug) ORDER BY display_order;

EXPLAIN (ANALYZE, BUFFERS)
SELECT category_id, complement_id FROM complementary_categories
WHERE restaurant_id = (SELECT id FROM restaurants WHERE slug = :slug);

-- §5 tenant analytics query (app/admin/dashboard/analytics/page.tsx:43) — 8-day window
EXPLAIN (ANALYZE, BUFFERS)
SELECT kind, product_id, created_at FROM events
WHERE restaurant_id = (SELECT id FROM restaurants WHERE slug = :slug)
  AND created_at >= now() - interval '8 days';

-- §6 owner accounts page scans (app/owner/dashboard/accounts/page.tsx:27-33)
EXPLAIN (ANALYZE, BUFFERS) SELECT restaurant_id FROM products;
EXPLAIN (ANALYZE, BUFFERS) SELECT restaurant_id, created_at FROM events ORDER BY created_at DESC LIMIT 50000;

-- §7 cost of deleting a tenant: the events FK on product_id has no index
EXPLAIN SELECT 1 FROM events WHERE product_id = (SELECT id FROM products LIMIT 1);

-- §8 pg_stat_statements (enabled by default on Supabase) — slowest 20 by total time
SELECT calls, round(total_exec_time::numeric, 1) AS total_ms, round(mean_exec_time::numeric, 2) AS mean_ms,
       rows, left(query, 140) AS query
FROM pg_stat_statements
WHERE query NOT ILIKE '%pg_stat%'
ORDER BY total_exec_time DESC LIMIT 20;

-- §9 connections + settings that bound throughput
SELECT name, setting FROM pg_settings WHERE name IN ('max_connections', 'shared_buffers', 'work_mem', 'effective_cache_size');
SELECT usename, application_name, state, count(*) FROM pg_stat_activity GROUP BY 1, 2, 3 ORDER BY 4 DESC;

-- §10 PostgREST max-rows check: PostgREST caps responses at db-max-rows. Run from a shell instead:
--   curl -s -o /dev/null -w '%{http_code} %header{content-range}\n' \
--     -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" -H "Prefer: count=exact" \
--     "$SUPABASE_URL/rest/v1/events?select=id&limit=5000"
--   → content-range "0-999/N" with N > 1000 proves the 1000-row cap.
