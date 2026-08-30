-- ════════════════════════════════════════════════════════════════════════════
-- verify-fresh-db.sql — تحقّق قراءة-فقط من قاعدة BIZIII Menu
-- ════════════════════════════════════════════════════════════════════════════
-- كل ما في هذا الملف مستخرَج حرفياً من supabase/migrations/0001 … 0017.
-- لا يعدّل ولا ينشئ ولا يحذف أي شيء — SELECT فقط (عدا القسم 11 الاختياري الذي
-- يستخدم معاملة تنتهي بـ ROLLBACK).
--
-- الاستعمال: الصقه كاملاً في Supabase SQL Editor، أو قسماً قسماً.
-- كل استعلام يُرجع عمود verdict: '✅ OK' أو '❌ ...'.
-- القسم 10 يعطي سطراً واحداً نهائياً.
--
-- التوقّع على قاعدة جديدة طُبِّقت عليها 0001→0017 من الصفر:
--   8 جداول · 76 عموداً · 12 سياسة RLS · 17 فهرساً · 5 دوال · triggerان · صفر صفوف.
-- ════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════════
-- القسم 1 — الأمن: منح الأعمدة  (0013؛ ولماذا فشلت 0009:46 و 0012)
-- ════════════════════════════════════════════════════════════════════════════
-- ⚠️ خلفية مثبَتة عملياً على قاعدة نظيفة بتاريخ 2026-08-25:
-- في Postgres، فحص صلاحية قراءة عمود ينجح إذا كان للدور صلاحية SELECT على
-- **الجدول كله** أو على **العمود** — أيهما وُجد. و REVOKE على مستوى العمود
-- *لا* يُلغي منحة مستوى الجدول:
--
--   "When revoking privileges on a table, the corresponding column privileges
--    are automatically revoked as well. On the other hand, if a role has been
--    granted privileges on a table, then revoking the same privileges from
--    individual columns will have no effect."   — PostgreSQL REVOKE docs
--
-- Supabase يمنح anon/authenticated صلاحية SELECT على مستوى الجدول افتراضياً،
-- فكانت 0009:46 و0012 **بلا أي أثر** — أعادت هذه الاستعلامات EXPOSED للستة كلها.
-- الإصلاح في 0013: سحب منحة الجدول ثم منح قائمة أعمدة صريحة.
--
-- الحكم الحقيقي هو has_column_privilege() أدناه، لا قائمة المنح.
-- المتوقّع بعد 0013: ✅ للصفوف الستة. أي '❌ EXPOSED' يعني أن 0013 لم تُطبَّق.

SELECT
  t.role_name,
  t.tbl || '.' || t.col                                        AS target,
  has_column_privilege(t.role_name, t.tbl, t.col, 'SELECT')    AS can_read,
  CASE WHEN has_column_privilege(t.role_name, t.tbl, t.col, 'SELECT')
       THEN '❌ EXPOSED — الـREVOKE بلا أثر (منحة مستوى الجدول تتجاوزه)'
       ELSE '✅ OK — محجوب' END                                AS verdict
FROM (VALUES
  ('anon',          'restaurants',     'password_hash'),
  ('anon',          'restaurants',     'username'),
  ('authenticated', 'restaurants',     'password_hash'),
  ('authenticated', 'restaurants',     'username'),
  ('anon',          'tenant_sessions', 'token_hash'),
  ('authenticated', 'tenant_sessions', 'token_hash')
) AS t(role_name, tbl, col)
ORDER BY t.tbl, t.col, t.role_name;


-- الوجه الآخر لـ0013: التقييد يجب ألّا يكسر قراءة الزبون.
--
-- ⚠️ هذا الفحص كان يفحص خمسة أعمدة مسمّاة، فلم يمسك العمود الذي أضافته 0016
-- بلا GRANT (`subscription_ends_at`) — لأن العمود الجديد، بحكم التعريف، ليس على
-- أي قائمة ثابتة. صار الآن **شاملاً ذاتياً**: يمرّ على كل أعمدة `restaurants`
-- ويستثني العمودين الاعتماديين وحدهما، فأي عمود مستقبلي بلا GRANT يظهر تلقائياً.
--
-- المتوقّع: صفّ واحد، `blocked_columns` = '—' والحكم ✅.
SELECT
  'كل عمود غير اعتمادي مقروء لـanon' AS check_name,
  COALESCE(string_agg(c.column_name, ', ' ORDER BY c.column_name), '—') AS blocked_columns,
  CASE WHEN count(*) = 0 THEN '✅ OK'
       ELSE '❌ BROKEN — عمود بلا GRANT؛ أضِف GRANT SELECT (col) في هجرته' END AS verdict
FROM information_schema.columns c
WHERE c.table_schema = 'public' AND c.table_name = 'restaurants'
  AND c.column_name NOT IN ('username', 'password_hash')
  AND NOT has_column_privilege('anon', 'restaurants', c.column_name, 'SELECT');


-- تشخيص مساعد: هل توجد منحة SELECT على مستوى الجدول؟ إن ظهر anon/authenticated
-- هنا لجدول restaurants فهذا هو سبب فشل الفحص أعلاه.
SELECT
  grantee,
  table_name,
  '⚠️ منحة على مستوى الجدول — تتجاوز أي REVOKE عمودي' AS note
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND privilege_type = 'SELECT'
  AND grantee IN ('anon', 'authenticated')
  AND table_name IN ('restaurants', 'tenant_sessions')
ORDER BY table_name, grantee;


-- المنح على مستوى العمود فعلياً. إن كانت منحة الجدول قائمة فقد تكون هذه
-- القائمة فارغة وليست دليلاً على الأمان.
SELECT grantee, table_name, column_name, privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
  AND table_name IN ('restaurants', 'tenant_sessions')
  AND column_name IN ('password_hash', 'username', 'token_hash')
ORDER BY table_name, column_name, grantee;


-- ════════════════════════════════════════════════════════════════════════════
-- القسم 2 — الأمن: RLS مفعَّل على كل جدول
-- ════════════════════════════════════════════════════════════════════════════
-- المصدر: 0001 (5 جداول) · 0003 (events) · 0011 (payments).
-- المتوقّع: 7 صفوف، كلها ✅.

SELECT
  e.tbl                                                     AS table_name,
  COALESCE(c.relrowsecurity, false)                         AS rls_enabled,
  CASE
    WHEN c.oid IS NULL        THEN '❌ TABLE MISSING'
    WHEN NOT c.relrowsecurity THEN '❌ RLS DISABLED'
    ELSE '✅ OK'
  END                                                       AS verdict
FROM (VALUES
  ('restaurants'), ('categories'), ('products'),
  ('complementary_categories'), ('tenant_sessions'),
  ('events'), ('payments'), ('login_attempts')
) AS e(tbl)
LEFT JOIN pg_class c
  ON c.relname = e.tbl
 AND c.relnamespace = 'public'::regnamespace
ORDER BY e.tbl;


-- ════════════════════════════════════════════════════════════════════════════
-- القسم 3 — الأمن: سياسات RLS (الأسماء والأوامر والتعبير)
-- ════════════════════════════════════════════════════════════════════════════
-- الحالة النهائية بعد 0001 → 0002 (تصحيح app_metadata) → 0003 → 0011.
-- المتوقّع: 11 سياسة بالضبط، كلها ✅.
--
-- تحقّقان مدمجان:
--   (أ) "Owner full access" يجب أن تستعمل مسار app_metadata (0002) لا المسار
--       القديم auth.jwt() ->> 'role' من 0001.
--   (ب) "Public read*" يجب أن تتضمّن شرط deleted_at (0011).

SELECT
  e.tbl                       AS table_name,
  e.polname                   AS policy_name,
  p.cmd                       AS command,
  CASE
    WHEN p.policyname IS NULL                                THEN '❌ MISSING'
    WHEN p.cmd <> e.expect_cmd                               THEN '❌ WRONG CMD — ' || p.cmd
    WHEN e.polname = 'Owner full access'
         AND p.qual NOT LIKE '%app_metadata%'                THEN '❌ STALE — لم تُطبَّق 0002 (مسار role القديم)'
    WHEN e.polname LIKE 'Public read%'
         AND p.qual NOT LIKE '%deleted_at%'                  THEN '❌ STALE — لم تُطبَّق 0011 (بلا deleted_at)'
    ELSE '✅ OK'
  END                         AS verdict
FROM (VALUES
  ('restaurants',              'Owner full access', 'ALL'),
  ('restaurants',              'Public read active','SELECT'),
  ('categories',               'Owner full access', 'ALL'),
  ('categories',               'Public read',       'SELECT'),
  ('products',                 'Owner full access', 'ALL'),
  ('products',                 'Public read',       'SELECT'),
  ('complementary_categories', 'Owner full access', 'ALL'),
  ('complementary_categories', 'Public read',       'SELECT'),
  ('tenant_sessions',          'Owner full access', 'ALL'),
  ('events',                   'Owner full access', 'ALL'),
  ('payments',                 'Owner full access', 'ALL'),
  ('login_attempts',           'Owner full access', 'ALL')
) AS e(tbl, polname, expect_cmd)
LEFT JOIN pg_policies p
  ON p.schemaname = 'public' AND p.tablename = e.tbl AND p.policyname = e.polname
ORDER BY e.tbl, e.polname;


-- سياسات زائدة لم تصفها أي هجرة (المتوقّع: صفر صفوف).
SELECT tablename, policyname, cmd, '❌ UNEXPECTED POLICY' AS verdict
FROM pg_policies
WHERE schemaname = 'public'
  AND (tablename, policyname) NOT IN (
    ('restaurants','Owner full access'), ('restaurants','Public read active'),
    ('categories','Owner full access'),  ('categories','Public read'),
    ('products','Owner full access'),    ('products','Public read'),
    ('complementary_categories','Owner full access'),
    ('complementary_categories','Public read'),
    ('tenant_sessions','Owner full access'),
    ('events','Owner full access'),
    ('payments','Owner full access'),
    ('login_attempts','Owner full access')
  )
ORDER BY tablename, policyname;


-- ════════════════════════════════════════════════════════════════════════════
-- القسم 4 — البنية: الجداول
-- ════════════════════════════════════════════════════════════════════════════
-- 8 جداول. لا هجرة من 0001→0017 تحذف أي جدول.
-- المتوقّع: 7 صفوف ✅، ولا جدول زائد.

SELECT
  e.tbl                                                        AS table_name,
  CASE WHEN c.oid IS NULL THEN '❌ MISSING' ELSE '✅ OK' END    AS verdict
FROM (VALUES
  ('restaurants'), ('categories'), ('products'),
  ('complementary_categories'), ('tenant_sessions'),
  ('events'), ('payments'), ('login_attempts')
) AS e(tbl)
LEFT JOIN pg_class c
  ON c.relname = e.tbl AND c.relkind = 'r'
 AND c.relnamespace = 'public'::regnamespace
ORDER BY e.tbl;


-- جداول زائدة في public (المتوقّع: صفر صفوف).
SELECT tablename, '⚠️ جدول غير موصوف في الهجرات' AS verdict
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN ('restaurants','categories','products',
                        'complementary_categories','tenant_sessions',
                        'events','payments','login_attempts')
ORDER BY tablename;


-- ════════════════════════════════════════════════════════════════════════════
-- القسم 5 — البنية: الأعمدة (النوع + الافتراضي + nullable)
-- ════════════════════════════════════════════════════════════════════════════
-- مستخرَجة عموداً بعمود من 0001 + 0003 + 0005 + 0007 + 0011.
-- المتوقّع: 72 صفاً، كلها ✅.
--   restaurants 22 · categories 8 · products 17 ·
--   complementary_categories 4 · tenant_sessions 5 · events 5 · payments 11
--
-- ملاحظة على nullable: 0001 يكتب `is_active BOOLEAN DEFAULT TRUE` بلا NOT NULL،
-- فالعمود nullable فعلاً وهذا مطابق للهجرة لا انحراف عنها. نفس الشيء لـ
-- is_available و display_order و is_in_closing_mode و created_at.

WITH expected(tbl, col, typ, req_notnull, has_default) AS (VALUES
  -- ── restaurants (0001) ──
  ('restaurants','id','uuid',true,true),
  ('restaurants','slug','text',true,false),
  ('restaurants','display_name','text',true,false),
  ('restaurants','username','text',true,false),
  ('restaurants','password_hash','text',true,false),
  ('restaurants','is_active','boolean',false,true),
  ('restaurants','logo_url','text',false,false),
  ('restaurants','primary_color','text',false,true),
  ('restaurants','background_color','text',false,true),
  ('restaurants','currency','text',false,true),
  ('restaurants','show_unavailable_items','boolean',false,true),
  ('restaurants','active_mode','text',false,true),
  ('restaurants','closing_mode_ends_at','timestamp with time zone',false,false),
  ('restaurants','closing_mode_discount','integer',false,false),
  ('restaurants','created_at','timestamp with time zone',false,true),
  ('restaurants','last_login_at','timestamp with time zone',false,false),
  -- ── restaurants (0007) ──
  ('restaurants','header_color','text',false,false),
  ('restaurants','card_color','text',false,false),
  ('restaurants','text_color','text',false,false),
  -- ── restaurants (0011) ──
  ('restaurants','plan','text',false,false),
  ('restaurants','branch_count','integer',true,true),
  ('restaurants','deleted_at','timestamp with time zone',false,false),
  -- ── restaurants (0016) ──
  ('restaurants','subscription_ends_at','timestamp with time zone',false,false),
  -- ── categories (0001) ──
  ('categories','id','uuid',true,true),
  ('categories','restaurant_id','uuid',true,false),
  ('categories','parent_id','uuid',false,false),
  ('categories','name_ar','text',true,false),
  ('categories','name_en','text',false,false),
  ('categories','name_ku','text',false,false),
  ('categories','display_order','integer',false,true),
  ('categories','created_at','timestamp with time zone',false,true),
  -- ── products (0001) ──
  ('products','id','uuid',true,true),
  ('products','restaurant_id','uuid',true,false),
  ('products','category_id','uuid',true,false),
  ('products','name_ar','text',true,false),
  ('products','name_en','text',false,false),
  ('products','name_ku','text',false,false),
  ('products','price','numeric',true,false),
  ('products','profit_percentage','numeric',true,true),
  ('products','prep_time_minutes','integer',true,true),
  ('products','image_url','text',false,false),
  ('products','is_available','boolean',false,true),
  ('products','display_order','integer',false,true),
  ('products','is_in_closing_mode','boolean',false,true),
  ('products','suggestions_type','text',false,true),
  ('products','custom_suggestion_ids','ARRAY',false,false),
  ('products','created_at','timestamp with time zone',false,true),
  -- ── products (0005) ──
  ('products','is_chef_pick','boolean',true,true),
  -- ── complementary_categories (0001) ──
  ('complementary_categories','id','uuid',true,true),
  ('complementary_categories','restaurant_id','uuid',true,false),
  ('complementary_categories','category_id','uuid',true,false),
  ('complementary_categories','complement_id','uuid',true,false),
  -- ── tenant_sessions (0001) ──
  ('tenant_sessions','id','uuid',true,true),
  ('tenant_sessions','restaurant_id','uuid',true,false),
  ('tenant_sessions','token_hash','text',true,false),
  ('tenant_sessions','device_info','text',false,false),
  ('tenant_sessions','created_at','timestamp with time zone',false,true),
  -- ── events (0003) ──
  ('events','id','uuid',true,true),
  ('events','restaurant_id','uuid',true,false),
  ('events','product_id','uuid',false,false),
  ('events','kind','text',true,false),
  ('events','created_at','timestamp with time zone',false,true),
  -- ── payments (0011) ──
  ('payments','id','uuid',true,true),
  ('payments','restaurant_id','uuid',true,false),
  ('payments','kind','text',true,false),
  ('payments','amount','numeric',true,false),
  ('payments','currency','text',true,false),
  ('payments','paid_at','timestamp with time zone',true,false),
  ('payments','period_start','timestamp with time zone',false,false),
  ('payments','period_end','timestamp with time zone',false,false),
  ('payments','note','text',false,false),
  ('payments','recorded_by','uuid',false,false),
  ('payments','created_at','timestamp with time zone',true,true),
  -- ── login_attempts (0015) ──
  ('login_attempts','id','bigint',true,true),
  ('login_attempts','bucket_key','text',true,false),
  ('login_attempts','created_at','timestamp with time zone',true,true)
)
SELECT
  e.tbl || '.' || e.col                        AS target,
  c.data_type                                  AS actual_type,
  CASE
    WHEN c.column_name IS NULL                            THEN '❌ MISSING COLUMN'
    WHEN c.data_type <> e.typ                             THEN '❌ TYPE — متوقّع ' || e.typ || ' وُجد ' || c.data_type
    WHEN (c.is_nullable = 'NO') <> e.req_notnull          THEN '❌ NULLABILITY — متوقّع notnull=' || e.req_notnull
    WHEN (c.column_default IS NOT NULL) <> e.has_default  THEN '❌ DEFAULT — متوقّع has_default=' || e.has_default
    ELSE '✅ OK'
  END                                          AS verdict
FROM expected e
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public' AND c.table_name = e.tbl AND c.column_name = e.col
ORDER BY e.tbl, e.col;


-- عدّاد سريع للأعمدة لكل جدول (بديل بصري للجدول أعلاه).
-- المتوقّع بالضبط: 8 / 4 / 5 / 11 / 17 / 22 / 5
SELECT
  table_name,
  count(*) AS actual_columns,
  CASE table_name
    WHEN 'restaurants'              THEN CASE WHEN count(*) = 23 THEN '✅ OK' ELSE '❌ متوقّع 23' END
    WHEN 'categories'               THEN CASE WHEN count(*) =  8 THEN '✅ OK' ELSE '❌ متوقّع 8'  END
    WHEN 'products'                 THEN CASE WHEN count(*) = 17 THEN '✅ OK' ELSE '❌ متوقّع 17' END
    WHEN 'complementary_categories' THEN CASE WHEN count(*) =  4 THEN '✅ OK' ELSE '❌ متوقّع 4'  END
    WHEN 'tenant_sessions'          THEN CASE WHEN count(*) =  5 THEN '✅ OK' ELSE '❌ متوقّع 5'  END
    WHEN 'events'                   THEN CASE WHEN count(*) =  5 THEN '✅ OK' ELSE '❌ متوقّع 5'  END
    WHEN 'payments'                 THEN CASE WHEN count(*) = 11 THEN '✅ OK' ELSE '❌ متوقّع 11' END
    WHEN 'login_attempts'           THEN CASE WHEN count(*) =  3 THEN '✅ OK' ELSE '❌ متوقّع 3'  END
  END AS verdict
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('restaurants','categories','products',
                     'complementary_categories','tenant_sessions','events','payments',
                     'login_attempts')
GROUP BY table_name
ORDER BY table_name;


-- ════════════════════════════════════════════════════════════════════════════
-- القسم 6 — البنية: القيود (PK / UNIQUE / FK / CHECK)
-- ════════════════════════════════════════════════════════════════════════════

-- 6.1 المفاتيح الأساسية والتفرّد.
-- المتوقّع: 12 صفاً ✅.
-- انتبه للصفّ الأخير: القيد المضمَّن من 0001 يجب أن يكون **محذوفاً** بفعل 0010.
SELECT
  e.label,
  CASE
    WHEN e.must_exist AND con.conname IS NULL THEN '❌ MISSING'
    WHEN NOT e.must_exist AND con.conname IS NOT NULL
      THEN '❌ لم تُطبَّق 0010 — القيد القديم ما زال موجوداً'
    ELSE '✅ OK'
  END AS verdict
FROM (VALUES
  ('restaurants_pkey',              'restaurants',              true),
  ('restaurants_slug_key',          'restaurants',              true),
  ('restaurants_username_key',      'restaurants',              true),
  ('categories_pkey',               'categories',               true),
  ('products_pkey',                 'products',                 true),
  ('complementary_categories_pkey', 'complementary_categories', true),
  ('complementary_categories_uniq', 'complementary_categories', true),
  ('tenant_sessions_pkey',          'tenant_sessions',          true),
  ('tenant_sessions_token_hash_key','tenant_sessions',          true),
  ('events_pkey',                   'events',                   true),
  ('payments_pkey',                 'payments',                 true),
  ('complementary_categories_category_id_complement_id_key',
                                    'complementary_categories', false)
) AS e(label, tbl, must_exist)
LEFT JOIN pg_constraint con
  ON con.conname = e.label
 AND con.conrelid = ('public.' || e.tbl)::regclass
ORDER BY e.label;


-- 6.2 تفرّد slug **عالمياً** (غير مقيَّد بمطعم) — 0001:13.
-- المتوقّع: صفّ واحد ✅ نصّه UNIQUE (slug).
SELECT
  con.conname,
  pg_get_constraintdef(con.oid) AS definition,
  CASE WHEN pg_get_constraintdef(con.oid) = 'UNIQUE (slug)'
       THEN '✅ OK — تفرّد عالمي على slug'
       ELSE '❌ غير متوقّع: ' || pg_get_constraintdef(con.oid) END AS verdict
FROM pg_constraint con
WHERE con.conrelid = 'public.restaurants'::regclass
  AND con.contype = 'u'
  AND pg_get_constraintdef(con.oid) LIKE '%slug%';


-- 6.3 قيد complementary_categories الموحَّد بالمطعم — 0010.
-- المتوقّع: صفّ واحد ✅ يشمل الأعمدة الثلاثة بهذا الترتيب.
SELECT
  con.conname,
  pg_get_constraintdef(con.oid) AS definition,
  CASE WHEN pg_get_constraintdef(con.oid) = 'UNIQUE (restaurant_id, category_id, complement_id)'
       THEN '✅ OK — التفرّد مقيَّد بالمطعم'
       ELSE '❌ غير متوقّع: ' || pg_get_constraintdef(con.oid) END AS verdict
FROM pg_constraint con
WHERE con.conrelid = 'public.complementary_categories'::regclass
  AND con.contype = 'u';


-- 6.4 قيود CHECK المسمّاة صراحةً في الهجرات.
-- المتوقّع: 5 صفوف ✅.
-- الأهمّ: active_mode يجب أن يقبل ثلاث قيم (0006 يستبدل 0004 يستبدل 0001).
SELECT
  e.conname,
  pg_get_constraintdef(con.oid) AS definition,
  CASE
    WHEN con.conname IS NULL                                 THEN '❌ MISSING'
    WHEN e.conname = 'restaurants_active_mode_check'
         AND pg_get_constraintdef(con.oid) LIKE '%rush%'     THEN '❌ STALE — لم تُطبَّق 0004 (rush/profit ما زالا)'
    WHEN e.conname = 'restaurants_active_mode_check'
         AND pg_get_constraintdef(con.oid) NOT LIKE '%off%'  THEN '❌ STALE — لم تُطبَّق 0006 (لا قيمة off)'
    ELSE '✅ OK'
  END AS verdict
FROM (VALUES
  ('restaurants_active_mode_check',      'restaurants'),  -- 0006
  ('restaurants_closing_complete_check', 'restaurants'),  -- 0010
  ('restaurants_branch_count_check',     'restaurants'),  -- 0011
  ('payments_period_order_check',        'payments'),     -- 0011
  ('tenant_sessions_token_hash_format_check', 'tenant_sessions'),  -- 0014
  ('restaurants_plan_check',             'restaurants')     -- 0016
) AS e(conname, tbl)
LEFT JOIN pg_constraint con
  ON con.conname = e.conname AND con.conrelid = ('public.' || e.tbl)::regclass
ORDER BY e.conname;


-- 6.5 قيود CHECK المضمَّنة (أسماؤها مولَّدة تلقائياً) — نطابق بالنصّ لا بالاسم.
-- المتوقّع: 5 صفوف ✅.
SELECT
  e.label,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint con
    WHERE con.conrelid = ('public.' || e.tbl)::regclass
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE e.pattern
  ) THEN '✅ OK' ELSE '❌ MISSING' END AS verdict
FROM (VALUES
  ('restaurants.closing_mode_discount IN (5,10,20)',      'restaurants', '%closing_mode_discount%5%10%20%'),
  ('products.suggestions_type IN (default,custom)',       'products',    '%suggestions_type%custom%'),
  ('events.kind IN (menu_open,product_open,product_add)', 'events',      '%product_add%'),
  ('payments.kind IN (initial,renewal,adjustment)',       'payments',    '%adjustment%'),
  ('payments.amount > 0',                                 'payments',    '%amount > (0)%')
) AS e(label, tbl, pattern)
ORDER BY e.label;


-- 6.6 المفاتيح الأجنبية + سلوك الحذف.
-- المتوقّع: 11 صفاً، كلها ON DELETE CASCADE (0001 · 0003 · 0011).
SELECT
  e.tbl || '.' || e.col || ' → ' || e.ref                 AS fk,
  pg_get_constraintdef(con.oid)                           AS definition,
  CASE
    WHEN con.oid IS NULL                                     THEN '❌ MISSING FK'
    WHEN pg_get_constraintdef(con.oid) NOT LIKE '%ON DELETE CASCADE%'
                                                             THEN '❌ NOT CASCADE'
    ELSE '✅ OK'
  END                                                     AS verdict
FROM (VALUES
  ('categories','restaurant_id','restaurants'),
  ('categories','parent_id','categories'),
  ('products','restaurant_id','restaurants'),
  ('products','category_id','categories'),
  ('complementary_categories','restaurant_id','restaurants'),
  ('complementary_categories','category_id','categories'),
  ('complementary_categories','complement_id','categories'),
  ('tenant_sessions','restaurant_id','restaurants'),
  ('events','restaurant_id','restaurants'),
  ('events','product_id','products'),
  ('payments','restaurant_id','restaurants')
) AS e(tbl, col, ref)
LEFT JOIN pg_constraint con
  ON con.conrelid = ('public.' || e.tbl)::regclass
 AND con.contype = 'f'
 AND con.conkey = ARRAY[(SELECT attnum FROM pg_attribute
                          WHERE attrelid = ('public.' || e.tbl)::regclass
                            AND attname = e.col)]::smallint[]
ORDER BY e.tbl, e.col;


-- ════════════════════════════════════════════════════════════════════════════
-- القسم 7 — البنية: الفهارس
-- ════════════════════════════════════════════════════════════════════════════
-- 14 فهرساً أنشأتها الهجرات صراحةً: 0001 (7) · 0003 (1) · 0009 (3) · 0011 (3).
-- فهارس PK/UNIQUE التلقائية غير مدرَجة (يغطّيها القسم 6.1).
-- المتوقّع: 14 صفاً ✅، مع تحقّق من شرط WHERE للفهارس الجزئية الأربعة.

SELECT
  e.idx                                                     AS index_name,
  CASE
    WHEN i.indexname IS NULL                                   THEN '❌ MISSING'
    WHEN e.partial AND i.indexdef NOT LIKE '%WHERE%'           THEN '❌ NOT PARTIAL — ينقصه شرط WHERE'
    ELSE '✅ OK'
  END                                                       AS verdict,
  i.indexdef                                                AS definition
FROM (VALUES
  ('idx_restaurants_slug',          false),  -- 0001
  ('idx_restaurants_username',      false),  -- 0001
  ('idx_categories_restaurant',     false),  -- 0001
  ('idx_categories_parent',         false),  -- 0001
  ('idx_products_restaurant',       false),  -- 0001
  ('idx_products_category',         false),  -- 0001
  ('idx_sessions_token_hash',       false),  -- 0001
  ('idx_events_restaurant_created', false),  -- 0003
  ('idx_complementary_restaurant',  false),  -- 0009
  ('idx_products_in_closing',       true),   -- 0009 partial
  ('idx_products_chef_pick',        true),   -- 0009 partial
  ('idx_restaurants_live',          true),   -- 0011 partial
  ('idx_payments_restaurant_paid',  false),  -- 0011
  ('idx_payments_period_end',       true),   -- 0011 partial
  ('idx_login_attempts_key_time',   false),  -- 0015
  ('idx_login_attempts_created',    false),  -- 0015
  ('idx_restaurants_subscription_ends', true) -- 0016 partial
) AS e(idx, partial)
LEFT JOIN pg_indexes i
  ON i.schemaname = 'public' AND i.indexname = e.idx
ORDER BY e.idx;


-- ════════════════════════════════════════════════════════════════════════════
-- القسم 8 — الدوال والـtriggers والامتدادات
-- ════════════════════════════════════════════════════════════════════════════

-- 8.1 الدالتان اللتان تنشئهما الهجرات (0008 · 0009).
-- المتوقّع: صفّان ✅ — كلتاهما plpgsql.
SELECT
  e.fname,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prorettype::regtype::text               AS returns,
  CASE
    WHEN p.oid IS NULL                             THEN '❌ MISSING'
    WHEN p.prorettype::regtype::text <> e.rettype  THEN '❌ WRONG RETURN — ' || p.prorettype::regtype::text
    WHEN l.lanname <> 'plpgsql'                    THEN '❌ WRONG LANGUAGE — ' || l.lanname
    ELSE '✅ OK'
  END                                       AS verdict
FROM (VALUES
  ('revert_closing_mode',           'void'),     -- 0008
  ('categories_enforce_two_levels', 'trigger'),  -- 0009
  ('check_rate_limit',              'record'),   -- 0015 (RETURNS TABLE)
  ('clear_rate_limit',              'void'),     -- 0015
  ('payments_sync_subscription_end','trigger')   -- 0016
) AS e(fname, rettype)
LEFT JOIN pg_proc p
  ON p.proname = e.fname AND p.pronamespace = 'public'::regnamespace
LEFT JOIN pg_language l ON l.oid = p.prolang
ORDER BY e.fname;


-- 8.2 توقيع revert_closing_mode يجب أن يقبل uuid واحداً باسم p_restaurant_id
-- (الكود ينادي RPC باسم المعامل — lib/closing.ts).
SELECT
  'revert_closing_mode(p_restaurant_id uuid)' AS expected_signature,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'revert_closing_mode'
      AND pronamespace = 'public'::regnamespace
      AND pg_get_function_identity_arguments(oid) = 'p_restaurant_id uuid'
  ) THEN '✅ OK' ELSE '❌ توقيع مختلف — استدعاء الـRPC من الكود سيفشل' END AS verdict;


-- 8.3 الـtrigger مربوط فعلاً بجدول categories (0009).
-- المتوقّع: صفّ واحد ✅ — BEFORE INSERT OR UPDATE OF parent_id, FOR EACH ROW.
SELECT
  CASE WHEN NOT EXISTS (
         SELECT 1 FROM pg_trigger
         WHERE tgrelid = 'public.categories'::regclass
           AND tgname = 'trg_categories_two_levels' AND NOT tgisinternal)
       THEN '❌ MISSING — لم تُطبَّق 0009'
       WHEN (SELECT pg_get_triggerdef(oid) FROM pg_trigger
              WHERE tgrelid = 'public.categories'::regclass
                AND tgname = 'trg_categories_two_levels' AND NOT tgisinternal)
            NOT LIKE '%BEFORE INSERT OR UPDATE OF parent_id%'
       THEN '❌ WRONG TIMING/EVENTS'
       WHEN (SELECT pg_get_triggerdef(oid) FROM pg_trigger
              WHERE tgrelid = 'public.categories'::regclass
                AND tgname = 'trg_categories_two_levels' AND NOT tgisinternal)
            NOT LIKE '%FOR EACH ROW%'
       THEN '❌ NOT ROW-LEVEL'
       WHEN (SELECT pg_get_triggerdef(oid) FROM pg_trigger
              WHERE tgrelid = 'public.categories'::regclass
                AND tgname = 'trg_categories_two_levels' AND NOT tgisinternal)
            NOT LIKE '%categories_enforce_two_levels%'
       THEN '❌ WRONG FUNCTION'
       ELSE '✅ OK' END AS verdict,
  (SELECT pg_get_triggerdef(oid) FROM pg_trigger
    WHERE tgrelid = 'public.categories'::regclass
      AND tgname = 'trg_categories_two_levels' AND NOT tgisinternal) AS definition;


-- 8.4 الامتدادات — 0001:9 يطلب pgcrypto (لأجل gen_random_uuid).
-- المتوقّع: صفّان ✅.
SELECT 'pgcrypto extension' AS item,
       CASE WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto')
            THEN '✅ OK' ELSE '❌ MISSING' END AS verdict
UNION ALL
SELECT 'gen_random_uuid() function',
       CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'gen_random_uuid')
            THEN '✅ OK' ELSE '❌ MISSING — كل DEFAULT في كل جدول سيفشل' END;


-- ════════════════════════════════════════════════════════════════════════════
-- القسم 9 — حالة الفراغ
-- ════════════════════════════════════════════════════════════════════════════
-- المتوقّع على قاعدة جديدة: صفر في الجداول السبعة كلها.

SELECT 'restaurants' AS tbl, count(*) AS rows,
       CASE WHEN count(*) = 0 THEN '✅ فارغ' ELSE '⚠️ فيه بيانات' END AS verdict FROM restaurants
UNION ALL SELECT 'categories', count(*),
       CASE WHEN count(*) = 0 THEN '✅ فارغ' ELSE '⚠️ فيه بيانات' END FROM categories
UNION ALL SELECT 'products', count(*),
       CASE WHEN count(*) = 0 THEN '✅ فارغ' ELSE '⚠️ فيه بيانات' END FROM products
UNION ALL SELECT 'complementary_categories', count(*),
       CASE WHEN count(*) = 0 THEN '✅ فارغ' ELSE '⚠️ فيه بيانات' END FROM complementary_categories
UNION ALL SELECT 'tenant_sessions', count(*),
       CASE WHEN count(*) = 0 THEN '✅ فارغ' ELSE '⚠️ فيه بيانات' END FROM tenant_sessions
UNION ALL SELECT 'events', count(*),
       CASE WHEN count(*) = 0 THEN '✅ فارغ' ELSE '⚠️ فيه بيانات' END FROM events
UNION ALL SELECT 'payments', count(*),
       CASE WHEN count(*) = 0 THEN '✅ فارغ' ELSE '⚠️ فيه بيانات' END FROM payments
UNION ALL SELECT 'login_attempts', count(*),
       CASE WHEN count(*) = 0 THEN '✅ فارغ' ELSE 'ℹ️ محاولات دخول مسجّلة (طبيعي)' END FROM login_attempts
ORDER BY tbl;


-- مستخدمو Supabase Auth — خارج نطاق الهجرات، لكنها الخطوة التالية (انظر 0002).
-- المتوقّع الآن: 0 و 0. بعد إنشاء حساب المالك وضبط app_metadata: 1 و 1.
SELECT
  count(*)                                                       AS auth_users,
  count(*) FILTER (WHERE raw_app_meta_data ->> 'role' = 'owner')  AS owner_role_users,
  CASE
    WHEN count(*) = 0 THEN 'ℹ️ لا مستخدمين بعد — أنشئ حساب المالك (انظر 0002)'
    WHEN count(*) FILTER (WHERE raw_app_meta_data ->> 'role' = 'owner') = 0
      THEN '❌ يوجد مستخدم بلا app_metadata.role = owner — لوحة المالك سترفضه'
    ELSE '✅ OK — يوجد مستخدم بدور owner'
  END                                                            AS verdict
FROM auth.users;


-- ════════════════════════════════════════════════════════════════════════════
-- القسم 10 — الحكم النهائي (سطر واحد)
-- ════════════════════════════════════════════════════════════════════════════
-- شغّل هذا وحده إن أردت إجابة سريعة. يعيد حساب كل ما سبق ويلخّصه في صفّ واحد.

WITH
tables_ok AS (
  SELECT count(*) AS n FROM pg_tables
   WHERE schemaname='public'
     AND tablename IN ('restaurants','categories','products',
                       'complementary_categories','tenant_sessions','events','payments',
                       'login_attempts')
),
rls_ok AS (
  SELECT count(*) AS n FROM pg_class
   WHERE relnamespace='public'::regnamespace AND relrowsecurity
     AND relname IN ('restaurants','categories','products',
                     'complementary_categories','tenant_sessions','events','payments',
                     'login_attempts')
),
pol_ok AS (
  SELECT count(*) AS n FROM pg_policies
   WHERE schemaname='public'
     AND (tablename, policyname) IN (
       ('restaurants','Owner full access'),('restaurants','Public read active'),
       ('categories','Owner full access'),('categories','Public read'),
       ('products','Owner full access'),('products','Public read'),
       ('complementary_categories','Owner full access'),
       ('complementary_categories','Public read'),
       ('tenant_sessions','Owner full access'),
       ('events','Owner full access'),('payments','Owner full access'),
       ('login_attempts','Owner full access'))
),
pol_fresh AS (   -- 0002 + 0011 طُبِّقتا فعلاً
  SELECT count(*) AS n FROM pg_policies
   WHERE schemaname='public'
     AND ((policyname='Owner full access' AND qual LIKE '%app_metadata%')
       OR (policyname LIKE 'Public read%'  AND qual LIKE '%deleted_at%'))
),
idx_ok AS (
  SELECT count(*) AS n FROM pg_indexes
   WHERE schemaname='public' AND indexname IN (
     'idx_restaurants_slug','idx_restaurants_username','idx_categories_restaurant',
     'idx_categories_parent','idx_products_restaurant','idx_products_category',
     'idx_sessions_token_hash','idx_events_restaurant_created','idx_complementary_restaurant',
     'idx_products_in_closing','idx_products_chef_pick','idx_restaurants_live',
     'idx_payments_restaurant_paid','idx_payments_period_end',
     'idx_login_attempts_key_time','idx_login_attempts_created',
     'idx_restaurants_subscription_ends')
),
col_ok AS (
  SELECT count(*) AS n FROM information_schema.columns
   WHERE table_schema='public'
     AND table_name IN ('restaurants','categories','products',
                        'complementary_categories','tenant_sessions','events','payments',
                        'login_attempts')
),
fn_ok AS (
  SELECT count(*) AS n FROM pg_proc
   WHERE pronamespace='public'::regnamespace
     AND proname IN ('revert_closing_mode','categories_enforce_two_levels',
                     'check_rate_limit','clear_rate_limit',
                     'payments_sync_subscription_end')
),
trg_ok AS (
  SELECT count(*) AS n FROM pg_trigger
   WHERE tgrelid='public.categories'::regclass
     AND tgname='trg_categories_two_levels' AND NOT tgisinternal
),
mode_ok AS (
  SELECT count(*) AS n FROM pg_constraint
   WHERE conname='restaurants_active_mode_check'
     AND conrelid='public.restaurants'::regclass
     AND pg_get_constraintdef(oid) LIKE '%off%'
     AND pg_get_constraintdef(oid) NOT LIKE '%rush%'
),
uniq_ok AS (
  SELECT count(*) AS n FROM pg_constraint
   WHERE conrelid='public.complementary_categories'::regclass
     AND conname='complementary_categories_uniq'
),
uniq_old_gone AS (
  SELECT count(*) AS n FROM pg_constraint
   WHERE conrelid='public.complementary_categories'::regclass
     AND conname='complementary_categories_category_id_complement_id_key'
),
ext_ok AS (SELECT count(*) AS n FROM pg_extension WHERE extname='pgcrypto'),
-- شامل ذاتياً: صفر عمود محجوب خارج العمودين الاعتماديين (انظر 0017).
diner_ok AS (
  SELECT CASE WHEN count(*) = 0 THEN 1 ELSE 0 END AS n
    FROM information_schema.columns c
   WHERE c.table_schema = 'public' AND c.table_name = 'restaurants'
     AND c.column_name NOT IN ('username','password_hash')
     AND NOT has_column_privilege('anon','restaurants',c.column_name,'SELECT')
),
creds_exposed AS (
  SELECT count(*) AS n FROM (VALUES
    ('anon','restaurants','password_hash'),('anon','restaurants','username'),
    ('authenticated','restaurants','password_hash'),('authenticated','restaurants','username'),
    ('anon','tenant_sessions','token_hash'),('authenticated','tenant_sessions','token_hash')
  ) v(r,t,c)
  WHERE has_column_privilege(v.r, v.t, v.c, 'SELECT')
),
rows_total AS (
  -- login_attempts مستثنى عمداً: صفوفه تتراكم وتُنظَّف كسولاً، فوجودها طبيعي.
  SELECT (SELECT count(*) FROM restaurants) + (SELECT count(*) FROM categories)
       + (SELECT count(*) FROM products) + (SELECT count(*) FROM complementary_categories)
       + (SELECT count(*) FROM tenant_sessions) + (SELECT count(*) FROM events)
       + (SELECT count(*) FROM payments) AS n
)
SELECT
  tables_ok.n     || '/8'  AS tables,
  rls_ok.n        || '/8'  AS rls,
  pol_ok.n        || '/12' AS policies,
  pol_fresh.n     || '/12' AS policies_current,
  col_ok.n        || '/76' AS columns,
  idx_ok.n        || '/17' AS indexes,
  fn_ok.n         || '/5'  AS functions,
  trg_ok.n        || '/1'  AS triggers,
  creds_exposed.n || '/0'  AS creds_still_readable,
  diner_ok.n      || '/1'  AS diner_cols_readable,
  rows_total.n             AS total_rows,
  CASE WHEN tables_ok.n = 8 AND rls_ok.n = 8 AND pol_ok.n = 12 AND pol_fresh.n = 12
        AND col_ok.n = 76 AND idx_ok.n = 17 AND fn_ok.n = 5 AND trg_ok.n = 1
        AND mode_ok.n = 1 AND uniq_ok.n = 1 AND uniq_old_gone.n = 0 AND ext_ok.n = 1
        AND diner_ok.n = 1
       THEN CASE WHEN creds_exposed.n = 0
                 THEN '✅ كل شيء سليم — البنية مطابقة 0001→0017 والاعتمادات محجوبة'
                 ELSE '⚠️ البنية سليمة لكن ' || creds_exposed.n ||
                      ' عمود اعتماد ما زال مقروءاً — راجع القسم 1' END
       ELSE '❌ يوجد انحراف — راجع الأقسام 1-9 لتحديد موضعه' END AS overall
FROM tables_ok, rls_ok, pol_ok, pol_fresh, col_ok, idx_ok, fn_ok, trg_ok,
     mode_ok, uniq_ok, uniq_old_gone, ext_ok, creds_exposed, diner_ok, rows_total;


-- ════════════════════════════════════════════════════════════════════════════
-- القسم 11 (اختياري) — اختبار حيّ بصلاحيات anon داخل معاملة تُلغى
-- ════════════════════════════════════════════════════════════════════════════
-- يحاكي ما يراه زائر المنيو فعلاً. **قراءة فقط**، وينتهي بـ ROLLBACK فيستحيل
-- أن يترك أثراً.
--
-- كيف تنهيه بأمان: الـ ROLLBACK في آخر الكتلة كافٍ ويُسقط SET LOCAL ROLE تلقائياً.
-- إن قاطعتَ التنفيذ في المنتصف وبقيت الجلسة على دور anon، شغّل:
--     ROLLBACK;  RESET ROLE;
-- ولا ضرر في تشغيلهما مرتين. ولا تشغّل هذا القسم إن كانت الجلسة تحتوي عملاً آخر.

BEGIN;
SET LOCAL ROLE anon;

  -- (أ) ما يجب أن يبقى مقروءاً — المتوقّع: ينجح (صفر صفوف لأن القاعدة فارغة).
  SELECT current_user AS running_as, count(*) AS visible_restaurants
  FROM public.restaurants;

  -- (ب) tenant_sessions بلا سياسة عامة — المتوقّع: صفر صفوف دائماً.
  SELECT count(*) AS visible_sessions FROM public.tenant_sessions;

  -- (ج) payments بلا سياسة عامة — المتوقّع: صفر صفوف دائماً.
  SELECT count(*) AS visible_payments FROM public.payments;

ROLLBACK;
RESET ROLE;

-- (د) الاختبار الحاسم — شغّله **وحده** لأنه يجب أن يرمي خطأ يُجهض المعاملة:
--     المتوقّع: ERROR: permission denied for column password_hash
--     إن أرجع صفوفاً بدل الخطأ فالثغرة مفتوحة و 0012 بلا أثر.
--
-- BEGIN;
-- SET LOCAL ROLE anon;
--   SELECT username, password_hash FROM public.restaurants LIMIT 1;
-- ROLLBACK;
-- RESET ROLE;
