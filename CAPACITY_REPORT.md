# CAPACITY_REPORT.md — تدقيق قدرة الاستيعاب لـ BIZIII Menu

> تدقيق **قراءة فقط** للفرع `feat/owner-panel` بتاريخ 2026-09-17. لم يُعدَّل أي ملف مصدري،
> لم تُشغَّل أي هجرة، لم يُلمس `.env` ولا قاعدة البيانات. كل رقم مُسنَد إلى ملف/سطر أو إلى أمر
> شُغِّل فعلاً (`next build` محلياً، `npm ls`، تحليل `.next/`، قياس JSON صناعي، جلب صفحات
> التسعير الرسمية). ما لم يُتحقَّق منه موسوم **«غير مؤكد»** مع السبب.
>
> **حدود التدقيق:** لا يوجد ربط `supabase link` محلي (المجلد `supabase/.temp` فيه `cli-latest` فقط)،
> فلم يُنفَّذ `supabase db dump`. مصدر الـschema هو ملفات الهجرة `0001`→`0018`. لم يُجرَ أي
> اختبار حمل حقيقي — أرقام التزامن تقديرية.

---

## 1. الملخص التنفيذي

1. **بوضعه الحالي على الخطط المجانية (Vercel Hobby + Supabase Free) يتحمّل المشروع ≈ 4–6 مطاعم متوسطة** قبل تجاوز حدّ استدعاءات الدوال (1M/شهر) وحدّ الـActive CPU (4 ساعات/شهر) على Vercel، وحدّ egress في Supabase (5GB). الخطة المجانية في Supabase تُوقف المشروع بعد أسبوع خمول أصلاً، فهي غير صالحة للإنتاج.
2. **على Pro + Pro ($45/شهر) بلا أي تعديل كود:** ≈ 150–300 مطعم. الحدّ الأول هو حمل قاعدة البيانات (حساب Micro) بسبب تضخيم الاستعلامات، ثم كلفة Edge Requests/Data Transfer التي تنمو خطياً.
3. **أول عنق زجاجة (بنيوي، لا مالي): تضخيم الطلبات في صفحة المنيو.** كل بطاقة منتج تظهر على الشاشة تُطلق `prefetch` لصفحة منتج `force-dynamic` (`app/r/[slug]/menu-view.tsx:796`)، وكل prefetch = استدعاء دالة + 5 استعلامات DB (المنيو كاملاً يُعاد تحميله). مع polling كل 30 ثانية بلا أي تخزين CDN (`app/api/menu/[slug]/route.ts:12`)، تصل زيارة واحدة إلى **≈ 36 استدعاء دالة و≈ 160 استعلام DB** بدل ≈ 8 و≈ 30.
4. **بعد الإصلاحات السريعة (≈ 8 ساعات عمل، §7):** تنخفض كلفة الزيارة ≈ 4–5× في الاستدعاءات و≈ 5× في استعلامات DB، ويصبح Pro + Pro كافياً لـ **≈ 1000 مطعم** مع رفع حساب Supabase إلى Small/Medium عند ≈ 500.
5. **خطر صامت في الصحّة لا القدرة:** حدّ PostgREST الافتراضي (1000 صف) يقطع صفحة تحليلات المستأجر (أحداث 8 أيام لمطعم متوسط = ≈ 4,800 صف) وصفحة حسابات المالك — «غير مؤكد» حتى يُفحص إعداد `max-rows` في لوحة Supabase.
6. **جدول `events`** ينمو بلا حدود (صف لكل فتح منيو/منتج/إضافة، بلا تجميع ولا حذف): ≈ 2.5MB/مطعم/شهر → 500 مطعم تملأ 8GB من Pro خلال ≈ 6 أشهر.
7. **الصور ليست المشكلة:** تُضغط على الخادم إلى WebP 800×800 (`lib/r2/upload.ts:72`)، تُخدَم عبر `next/image`، وR2 بلا رسوم egress. لكن رفع أي صورة أكبر من 1MB **يفشل** لأن حدّ جسم Server Action الافتراضي 1MB بينما الكود يسمح بـ10MB.
8. **منطقة الدوال** الافتراضية في Vercel هي `iad1` (واشنطن) بينما Supabase في فرانكفورت؛ كل تصيير صفحة = رحلتان ذهاباً وإياباً متسلسلتان عبر الأطلسي. لا يوجد `vercel.json`.
9. **العزل بين المستأجرين سليم** على مسار المستأجر والزبون: كل استعلام مُصفّى بـ`restaurant_id` أو بمعرّف مُتحقَّق منه، والاستعلامات غير المصفّاة كلها في لوحة المالك خلف `requireOwner()`.
10. **الجاهزية للتسليم:** لا `README.md`، لا `vercel.json`، لا seed. لكن الهجرات مرتّبة، `.env.example` كامل، وملف تحقّق `docs/verify-fresh-db.sql` موجود. مشترٍ خبير ينشر خلال ≈ 2–3 ساعات، لا ساعة.

---

## 2. الجرد

### 2.1 الـstack (من `package.json` و`npm ls --depth=0`)

| المكوّن | الإصدار المثبّت | الدور |
|---|---|---|
| next | **16.2.6** (Turbopack) | App Router حصراً — لا `pages/` |
| react / react-dom | 19.2.4 | |
| typescript | 5.9.3 (strict) | |
| @supabase/supabase-js | 2.105.3 | كل وصول DB عبر PostgREST (HTTPS) — **لا اتصال Postgres مباشر، لا `pg`، لا `DATABASE_URL`** (grep فارغ) |
| @supabase/ssr | 0.10.3 | جلسة المالك فقط (`lib/supabase/auth-server.ts`, `proxy.ts`) |
| sharp | 0.34.5 | ضغط الصور على الخادم |
| @aws-sdk/client-s3 | 3.1045.0 | Cloudflare R2 |
| bcrypt | 6.0.0 | كلمات سر المستأجرين (cost 10) |
| qrcode / pdf-lib | 1.5.4 / 1.17.1 | ورقة QR (مسار الإدارة فقط) |
| @base-ui/react + shadcn | 1.4.1 / 4.7.0 | مكوّنات UI |
| @dnd-kit/* | 6.3.1 / 10.0.0 / 3.2.2 | سحب وإفلات — **لوحة الإدارة فقط** |
| lucide-react | 1.14.0 | أيقونات (tree-shaken) |
| tailwindcss v4 | 4.2.4 | |
| @playwright/test | 1.59.1 (dev) | اختبارات دخان |

### 2.2 نمط التصيير لكل route (من `next build` — الناتج الفعلي)

`next build` نجح محلياً (EXIT=0). كل الصفحات **ƒ Dynamic** عدا `/` و`/_not-found` و`/icon.png` (○ Static).

| Route | النمط | التوجيه | ملاحظة |
|---|---|---|---|
| `/r/[slug]` | SSR (Node) | `export const dynamic='force-dynamic'` (`app/r/[slug]/page.tsx:6`) + layout (`layout.tsx:11`) | لا `revalidate`، لا `unstable_cache`، لا `generateStaticParams` في المشروع كله (grep) |
| `/r/[slug]/cart`, `/r/[slug]/p/[productId]` | SSR | `force-dynamic` | كلاهما يعيد تحميل المنيو كاملاً |
| `/api/menu/[slug]` | Route Handler (Node) | `force-dynamic` + `Cache-Control: no-store, no-cache, must-revalidate` (`route.ts:12`) | **لا تخزين CDN إطلاقاً** |
| `/api/track` | Route Handler | `force-dynamic`, no-store | كتابة DB |
| `/api/admin/state` | Route Handler | `force-dynamic`, no-store | polling الإدارة كل 10s |
| `/r/[slug]/manifest.webmanifest` | Route Handler | `no-store` | استعلام DB لكل جلب |
| `/admin/**`, `/owner/**` | SSR | `force-dynamic` | |
| `proxy.ts` | Edge | matcher: `/admin/dashboard/:path*`, `/owner/dashboard/:path*` فقط | مسار الزبون لا يمرّ بالـproxy |

**Runtime:** لا يوجد `export const runtime = 'edge'` في أي مكان؛ كل الدوال Node.js. Fluid compute مفعّل افتراضياً للمشاريع الجديدة على Vercel.

### 2.3 شجرة المجلدات

```
app/
  r/[slug]/            الزبون: page, layout (SW + manifest), menu-view (907 سطراً, client), cart/, p/[productId]/
  admin/               دخول المستأجر + dashboard/{menu,modes,analytics,design} + suspended
  owner/               دخول المالك (Supabase Auth) + dashboard/{accounts,billing,analytics}
  api/                 menu/[slug], track, admin/state, admin/qr-pdf, health
lib/                   menu.ts (المحمّل المشترك), closing.ts, suggestions.ts, track.ts, auth/*, r2/upload.ts, supabase/*
components/ui/         13 مكوّن shadcn
public/sw.js           service worker يدوي (249 سطراً)
supabase/migrations/   0001 → 0018 (18 ملفاً، لا config.toml، لا seed)
scripts/               19 سكربت دخان + run-smoke.mjs + set-owner-role.mjs
docs/                  COMPANY-CONTEXT, BIZIII-READINESS, PAGES, verify-fresh-db.sql
```

### 2.4 ملفات الإعداد

- **`next.config.ts`**: ترويسات أمان + CSP، `images.remotePatterns` لـ`**.r2.dev` و`**.r2.cloudflarestorage.com` + `R2_PUBLIC_URL`، `imageSizes: [48,64,96,128,200,256,384]`، `deviceSizes` الافتراضية (`[640…3840]`)، `minimumCacheTTL` الافتراضي 14400s (من `.next/images-manifest.json`)، `Service-Worker-Allowed: /r/`. **لا `experimental.serverActions.bodySizeLimit`** → الحدّ الافتراضي **1MB** (مؤكَّد من `node_modules/next/dist/server/config-shared.js`: `1024 * 1024 // 1 MB`).
- **`vercel.json`**: **غير موجود** → منطقة الدوال الافتراضية `iad1`، لا `regions`، لا cron.
- **`supabase/config.toml`**: **غير موجود**.
- **`Dockerfile`**: موسوم صراحةً «لا يُبنى منذ 2026-08-25» (حُذف `output:'standalone'`).
- **`.env.example` / `.env.production.example`**: 8 متغيّرات (`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`). `.env.local` موجود ولم يُقرأ.

### 2.5 حجم الحزم على صفحة المنيو العامة (مقاس من `.next/` بعد البناء)

| العنصر | raw | gzip |
|---|---|---|
| `rootMainFiles` (React + Next runtime، مشتركة لكل الصفحات) | 446 KB | **130 KB** |
| chunks خاصة بـ`/r/[slug]` (8 ملفات: menu-view, base-ui dropdown, lucide, cart, i18n…) | 230 KB | **73 KB** |
| CSS (Tailwind v4، ملف واحد لكل الصفحات) | 73 KB | 13 KB |
| **مجموع JS+CSS للزيارة الأولى** | ≈ 750 KB | **≈ 216 KB** |
| خطوط: `noto-sans-arabic-var` 162 KB + `vazirmatn-var` 109 KB + IBM Plex Mono 3×15 KB | ≈ 315 KB | (woff2 مضغوط أصلاً) |
| `/r/[slug]/p/[productId]` chunks | 248 KB | 79 KB |
| `/admin/dashboard/menu` chunks (للمقارنة — يحمل dnd-kit) | 350 KB | 114 KB |

المكتبات الثقيلة (`sharp`, `@aws-sdk`, `pdf-lib`, `qrcode`, `bcrypt`, `@dnd-kit`) **لا تصل** إلى حزمة الزبون؛ كلها server-only أو admin-only. لا يوجد `@next/bundle-analyzer` مثبّتاً.

---

## 3. نموذج تعدد المستأجرين والعزل

### 3.1 تمييز المطعم

- **الزبون:** بالـ**path** — `/r/{slug}`؛ الـslug يُحلّ إلى `restaurants.id` بـ`.eq('slug', slug)` (`lib/menu.ts:144`, `app/r/[slug]/layout.tsx:21`, `manifest.webmanifest/route.ts:23`, `api/track/route.ts:49`). لا subdomain، لا query.
- **المستأجر:** بـ**كوكي جلسة** `mesa-tenant-token` (httpOnly, lax, maxAge 365 يوماً، بلا `domain`) → `sha256(token)` → صف في `tenant_sessions` → `restaurant_id` (`lib/auth/session.ts:79-112`). كل صفحة/action يمرّ بـ`requireTenant()` (`lib/auth/require-tenant.ts:22`).
- **المالك:** Supabase Auth JWT + `app_metadata.role === 'owner'` (`lib/auth/require-owner.ts:16`, `proxy.ts:40-45`).

### 3.2 الـschema الكامل (مركّب من الهجرات 0001→0018)

**restaurants** — `id uuid PK`, `slug text UNIQUE`, `display_name`, `username text UNIQUE`, `password_hash`, `is_active bool`, `logo_url`, `primary_color`, `background_color`, `header_color`, `card_color`, `text_color` (0007), `currency`, `show_unavailable_items`, `active_mode CHECK IN ('normal','closing','off')` (0006), `closing_mode_ends_at`, `closing_mode_discount CHECK IN (5,10,20)`, `closing_discount_mode CHECK IN ('general','specific')` (0018), `plan CHECK IN ('menu','growth','growth_pro')` (0016), `branch_count int ≥1`, `deleted_at` (0011), `subscription_ends_at` (0016، يُصان بـtrigger فقط), `created_at`, `last_login_at`. CHECK إضافي: `active_mode<>'closing' OR (discount AND ends_at NOT NULL)` (0010).

**categories** — `id`, `restaurant_id FK→restaurants CASCADE`, `parent_id FK→categories CASCADE` (مستويان فقط — trigger `trg_categories_two_levels`, 0009), `name_ar NOT NULL`, `name_en`, `name_ku`, `display_order`, `created_at`.

**products** — `id`, `restaurant_id FK CASCADE`, `category_id FK CASCADE`, `name_ar NOT NULL`, `name_en`, `name_ku`, `price numeric(10,2)`, `profit_percentage numeric(5,2)`, `prep_time_minutes int`, `image_url`, `is_available`, `display_order`, `is_in_closing_mode`, `closing_discount_percent CHECK IN (5,10,20)` (0018), `is_chef_pick` (0005), `suggestions_type CHECK IN ('default','custom')`, `custom_suggestion_ids uuid[]`, `created_at`.

**complementary_categories** — `id`, `restaurant_id FK`, `category_id FK`, `complement_id FK`, `UNIQUE(restaurant_id, category_id, complement_id)` (0010).

**tenant_sessions** — `id`, `restaurant_id FK CASCADE`, `token_hash text UNIQUE CHECK ~'^[0-9a-f]{64}$'` (0014), `device_info`, `created_at`. **لا `expires_at`** (بالتصميم).

**events** (0003) — `id uuid`, `restaurant_id FK CASCADE`, `product_id FK→products CASCADE` (**بلا فهرس**), `kind CHECK IN ('menu_open','product_open','product_add')`, `created_at`.

**payments** (0011) — `id`, `restaurant_id FK CASCADE`, `kind CHECK IN ('initial','renewal','adjustment')`, `amount numeric(12,2) >0`, `currency`, `paid_at`, `period_start`, `period_end`, `note`, `recorded_by`, `created_at`. Trigger `trg_payments_sync_subscription` يحدّث `restaurants.subscription_ends_at` (0016).

**login_attempts** (0015) — `id bigserial`, `bucket_key`, `created_at`. نافذة تحديد المعدّل (دخول + `/api/track`).

**دوال:** `revert_closing_mode(uuid)` (0008/0018)، `check_rate_limit(text,int,int)`، `clear_rate_limit(text)` (0015)، `categories_enforce_two_levels()`، `payments_sync_subscription_end()`.

### 3.3 عزل البيانات: RLS أم كود؟

**الاثنان معاً، لكن الكود هو الحامل الفعلي.** كل الجداول عليها RLS (0001, 0003, 0011, 0015). سياسات القراءة العامة (`anon`) مشروطة بـ`restaurants.is_active = TRUE AND deleted_at IS NULL` (0011). لكن **كل مسارات التطبيق تستخدم `service_role`** (`lib/supabase/server.ts:14`) الذي **يتجاوز RLS كلياً**، بما فيها مسار الزبون (`lib/menu.ts:137`). أي أن RLS يحمي فقط من وصول مباشر بالـanon key من المتصفّح (وهو غير مستخدم لقراءة القوائم — `lib/supabase/client.ts` موجود لكن غير مستورد في مسار المنيو).

**نتيجة grep على كل `.from(`/`.rpc(` (95 موضعاً — القائمة الكاملة في §9):**

- **مسار الزبون (7 استعلامات):** كلها مصفّاة بـ`slug` ثم `restaurant_id`. ✅
- **مسار المستأجر (≈ 55):** كلها مصفّاة بـ`restaurant_id` أو بـ`id` لصف تحقّق الكود من ملكيته قبل الكتابة (مثل `menu/actions.ts:200-206` قبل `:224`، و`:416`/`:444` select مصفّى قبل `upsert(reordered)`). الاستثناء الوحيد **`menu/actions.ts:224`**: `products.select('display_order').eq('category_id', …)` بلا `restaurant_id` — آمن لأن `category_id` تحقّق منه السطر 200، لكنه نمط هشّ. ✅
- **استعلامات بلا فلتر مستأجر (كلها في لوحة المالك، خلف `requireOwner()`):**
  - `owner/dashboard/accounts/page.tsx:27` `products.select('restaurant_id')` — **كل صفوف كل المطاعم**
  - `:28` `categories.select('restaurant_id')` — كل الصفوف
  - `:30-33` `events` آخر 50,000 صف
  - `:35` `payments` كل الصفوف
  - `owner/dashboard/page.tsx:26`, `analytics/page.tsx:35-37`, `billing/page.tsx:23-27` — كل `restaurants`/`payments`
  - `billing/actions.ts:91-92` payments by `id` (مالك)

  هذه مقصودة (المالك يرى الكل) لكنها **O(مجموع الصفوف في المنصة)** — انظر §7.

### 3.4 المصادقة وتكلفتها لكل طلب

| السطح | أين الجلسة | تكلفة التحقّق لكل طلب |
|---|---|---|
| مستأجر | **DB** (`tenant_sessions.token_hash`) + كوكي httpOnly | `sha256` (مجانية) + **1 استعلام** مفهرس على `token_hash` (`session.ts:88-92`) + **1 استعلام** `restaurants` (`require-tenant.ts:27-31`) = **2 استعلام لكل صفحة/action**؛ `/api/admin/state` = 1 (جلسة) + 1 (restaurants) كل 10s لكل لوحة مفتوحة (`modes-view.tsx:130`) |
| مالك | كوكي Supabase Auth (JWT) | `supabase.auth.getUser()` = **طلب HTTP إلى Supabase Auth** في الـproxy (`proxy.ts:43`) **و** في `requireOwner()` (مرتان لكل صفحة). منخفض الحجم |
| زبون | لا شيء | 0 |
| دخول المستأجر | — | 2 RPC تحديد معدّل + select + **bcrypt cost 10 (≈ 60–100ms CPU)** + insert جلسة + update `last_login_at` + RPC clear = 6 عمليات |

### 3.5 الفهارس

**موجودة (17 فهرساً حسب `docs/verify-fresh-db.sql`):**

| الفهرس | الجدول/الأعمدة | المصدر |
|---|---|---|
| `restaurants_pkey`, `restaurants_slug_key`, `restaurants_username_key` | UNIQUE | 0001 |
| `idx_restaurants_slug`, `idx_restaurants_username` | **مكرّرة** مع UNIQUE أعلاه — بلا فائدة، كلفة كتابة فقط | 0001:38-39 |
| `idx_restaurants_live` | `(created_at) WHERE deleted_at IS NULL` | 0011 |
| `idx_restaurants_subscription_ends` | جزئي | 0016 |
| `idx_categories_restaurant`, `idx_categories_parent` | | 0001 |
| `idx_products_restaurant`, `idx_products_category` | | 0001 |
| `idx_products_in_closing`, `idx_products_chef_pick` | جزئيان | 0009 |
| `idx_complementary_restaurant` | | 0009 |
| `complementary_categories_uniq` | `(restaurant_id, category_id, complement_id)` | 0010 |
| `idx_sessions_token_hash` + UNIQUE `tenant_sessions_token_hash_key` | مكرّر أيضاً | 0001/0014 |
| `idx_events_restaurant_created` | `(restaurant_id, created_at)` | 0003 |
| `idx_payments_restaurant_paid`, `idx_payments_period_end` | | 0011 |
| `idx_login_attempts_key_time`, `idx_login_attempts_created` | | 0015 |

**أعمدة تُستخدم في WHERE/JOIN/ORDER بلا فهرس مناسب:**

| الاستعلام | الملف:السطر | الفجوة | الأثر |
|---|---|---|---|
| `events.product_id` (FK بـ`ON DELETE CASCADE`) | 0003:12 | لا فهرس | حذف منتج/مطعم = **seq scan على `events`** كاملاً. عند ملايين الصفوف يصبح حذف حساب بطيئاً جداً |
| `events ORDER BY created_at DESC LIMIT 50000` (لكل المطاعم) | `accounts/page.tsx:30-33` | الفهرس المركّب يبدأ بـ`restaurant_id`؛ الترتيب العام على `created_at` وحده يحتاج فهرساً منفصلاً أو يستخدم seq scan + sort | صفحة المالك تبطؤ مع نمو `events` |
| `categories/products ORDER BY display_order` ضمن `restaurant_id` | `lib/menu.ts:187,194` | فهرس `restaurant_id` ثم sort في الذاكرة | مهمل عند ≤ 200 صف/مطعم |
| `products WHERE category_id ORDER BY display_order DESC LIMIT 1` | `menu/actions.ts:224` | `idx_products_category` ثم sort | مهمل |
| `restaurants ORDER BY created_at` (مالك) | `accounts/page.tsx:25` | جزئي فقط | مهمل |

---

## 4. مسار طلب المنيو العام بالأرقام

### 4.1 ماذا يحدث عند مسح الـQR (`/r/{slug}`)

**أ) طلب HTML (استدعاء دالة واحد):**

| # | الاستعلام | الملف:السطر | متسلسل/متوازٍ |
|---|---|---|---|
| 1 | `restaurants.select('primary_color').eq('slug')` — لـ`generateViewport` | `layout.tsx:18-22` | متوازٍ مع الصفحة (React `cache` لا يشارك بين layout وpage لأن الصفحة تستدعي دالة أخرى) |
| 2 | `restaurants.select(17 عموداً).eq('slug')` | `lib/menu.ts:139-145` | **متسلسل** (يحتاج `id`) |
| 3–5 | `categories`, `products`, `complementary_categories` `.eq('restaurant_id')` | `lib/menu.ts:182-199` | `Promise.all` |
| (6) | `rpc('revert_closing_mode')` فقط إذا انتهى Closing | `lib/closing.ts:64` | نادر |

= **5 استعلامات، رحلتان متسلسلتان (2 RTT) على الأقل**. **لا N+1**: الأقسام والمنتجات تُجلب دفعة واحدة وتُجمَّع في الذاكرة (`menu.ts:205-299`).

**ب) بعد التحميل (من المتصفّح):**
- `/r/{slug}/manifest.webmanifest` → 1 استدعاء + 1 استعلام (`route.ts:20-23`)، `no-store`.
- `/sw.js` (static) ثم SW يعيد جلب HTML الصفحة لتخزينها (`sw.js:67`, `:92`) → **استدعاء إضافي + 5 استعلامات** (`CACHE_PAGE` من `sw-register.tsx:45`) — في الإنتاج فقط.
- **Polling** `/api/menu/{slug}` كل **30s** (`menu-view.tsx:31,116`) وعند كل `visibilitychange` → 1 استدعاء + 4 استعلامات (`route.ts:21` → `loadMenu`).
- **Prefetch**: كل `ProductCard` يحمل `<Link prefetch>` (`menu-view.tsx:796`، والتعليق في `:788-793` يوضح أنه مقصود ليجلب «الـpayload الحقيقي»). المسار `force-dynamic`، فكل بطاقة تدخل الـviewport = **استدعاء دالة + 5 استعلامات** (نفس `loadMenuResult` + layout). قسم من 10 منتجات = 10 استدعاءات فور ظهوره. (غير مؤكد: العدد الفعلي يعتمد على التمرير وعلى `staleTimes` في Next 16 — يحتاج قياساً في المتصفّح.)
- **التحليلات** (`lib/track.ts`): `sendBeacon` غير متزامن، لا يعطّل العرض. `menu_open` مرة لكل جلسة متصفّح (`sessionStorage`, `menu-view.tsx:286-289`)، `product_open` لكل صفحة منتج، `product_add` لكل إضافة.

**ج) `/api/track` لكل beacon** (`route.ts`): `rpc('check_rate_limit')` (= DELETE + SELECT + INSERT داخل الدالة) → `restaurants.select('id').eq('slug')` → (`products.select('id')` للمنتجات) → `events.insert` = **3–4 رحلات، 2–3 كتابات**. صف واحد لكل حدث، **لا تجميع، لا حذف/retention** (grep فارغ).

### 4.2 هل النتيجة مخزّنة مؤقتاً؟

**لا، في أي طبقة:**
- Next: `force-dynamic` في كل ملفات مسار الزبون، لا `unstable_cache`.
- CDN: `Cache-Control: no-store, no-cache, must-revalidate` (`api/menu/[slug]/route.ts:12`); صفحات HTML الديناميكية لا تُخزَّن افتراضياً.
- SW: `handleApi` يذهب للشبكة دائماً ويستخدم الكاش **فقط عند `navigator.onLine === false`** (`sw.js:177-204`).
- Supabase: لا كاش لـPostgREST.

كل زيارة وكل poll وكل prefetch = قراءة كاملة من DB.

### 4.3 حجم الاستجابة لمنيو بـ100 صنف (10 أقسام، 30 صورة)

| العنصر | القياس | الطريقة |
|---|---|---|
| JSON `/api/menu` | **53.3 KB raw → 5.0 KB gzip** | payload صناعي بنفس شكل `MenuPayload` (أسماء عربية/إنجليزية/كردية، 30 رابط R2 ≈ 110 حرفاً) |
| HTML الصفحة | ≈ 80–100 KB raw / **≈ 15–20 KB gzip** (تقدير: RSC flight يضمّن `initialData` كاملاً + markup قسم واحد فقط لأن `filteredProducts` يعرض القسم المختار — `menu-view.tsx:153-168`) | غير مقاس على خادم حيّ |
| JS+CSS (زيارة أولى) | **216 KB gzip** | §2.5 |
| خطوط (زيارة أولى) | ≈ 270 KB (العائلتان العربيتان؛ Mono تُحمَّل عند الاستخدام) | §2.5 |
| صور القسم الأول (10 بطاقات، `sizes="(max-width:768px) 50vw, 200px"`, lazy) | ≈ 10 × 20–30 KB (WebP 384–640px) ≈ **250 KB** | تقدير من `imageSizes`/`deviceSizes` |
| **زيارة أولى كاملة** | **≈ 750–800 KB** | |
| **زيارة متكرّرة** (SW يخزّن JS/CSS/خطوط/آخر 50 صورة CacheFirst — `sw.js:130,151`) | ≈ 20 KB HTML + polls + prefetch + صور جديدة ≈ **250–350 KB** | |

### 4.4 الصور

- **التخزين:** Cloudflare R2 (S3 API)، مفتاح `restaurants/{id}/products/{uuid}.webp`، `CacheControl: public, max-age=31536000, immutable` (`lib/r2/upload.ts:83-93`).
- **الضغط:** على الخادم فقط، `sharp` → rotate → resize 800×800 cover → WebP q72 effort 6، `limitInputPixels: 100MP` (`upload.ts:72-81`). لا ضغط على العميل (grep `canvas|toBlob|compress` في `product-dialog.tsx` فارغ).
- **التقديم:** كل الصور عبر `next/image` (`_ui.tsx:132`, `unoptimized: false` في `images-manifest.json`) → Vercel Image Optimization يجلب من R2 مرة لكل variant (TTL سنة بسبب `max-age` من R2) ويخدم من كاش Vercel. **R2 egress ≈ صفر** (فقط عند cache miss)، و**Vercel Fast Data Transfer** هو من يدفع الصور.
- **الرفع:** الحدّ في الكود 10MB (`upload.ts:45`) لكن **Server Action body limit = 1MB افتراضياً** (لا `bodySizeLimit` في `next.config.ts`) و**Vercel يقطع عند 4.5MB**. أي صورة هاتف عادية (2–5MB) **تفشل** برسالة عامة قبل الوصول إلى `validateImageUpload`.
- **كلفة الـbandwidth لكل مشاهدة منيو:** ≈ 250 KB صور (زيارة أولى) / ≈ 50–100 KB (متكرّرة مع SW). المالك لا يدفع شيئاً على R2 ضمن 10GB.

### 4.5 PWA/offline (`public/sw.js`)

4 كاشات: `mesa-static-v1` (chunks + fonts + icons، FIFO 200 مدخلاً)، `mesa-images-v1` (**50 صورة FIFO** ≈ 1–1.5MB)، `mesa-api-fallback-v1` (آخر JSON، يُقرأ offline فقط)، `mesa-html-v1` (آخر HTML لكل URL زُوِّر). الحجم الكلي المتوقّع لكل زبون ≈ **1.5–2.5 MB**. لا `skipWaiting` (تحديثات SW تُطبَّق عند الإغلاق التام).

**أثر SW على الخادم:** عند التفعيل الأول يعيد جلب HTML الصفحة (`sw.js:67`) = استدعاء + 5 استعلامات إضافية لكل زبون جديد.

---

## 5. حدود المنصات (من صفحات التسعير الرسمية، جُلبت 2026-09-17)

### 5.1 Supabase

| المورد | Free | Pro ($25/شهر) | الزيادة |
|---|---|---|---|
| حجم DB | 500 MB | 8 GB | $0.125/GB |
| Egress (كل ما يخرج من المشروع بما فيه REST) | 5 GB | 250 GB | $0.09/GB |
| File Storage (غير مستخدم — الصور على R2) | 1 GB | 100 GB | — |
| Compute | Nano (CPU مشترك، 500MB RAM) | Micro (2-core ARM، 1GB) مشمول | Small $15، Medium $60 |
| اتصالات (Micro) | — | 60 مباشر / 200 pooler | |
| إيقاف عند الخمول | **بعد أسبوع** | لا | |
| Pooling | **غير مستخدم أصلاً** — الكود يستخدم PostgREST (HTTP) لا اتصال Postgres؛ PostgREST له pool داخلي حجمه يتبع الـcompute (**غير مؤكد**: الرقم لكل حجم غير منشور في صفحة التسعير) | | |
| `max-rows` PostgREST | افتراضي **1000** صف/استجابة (**غير مؤكد** لهذا المشروع — إعداد في Dashboard → API) | | |

### 5.2 Vercel

| المورد | Hobby | Pro ($20/شهر + credit) | الزيادة |
|---|---|---|---|
| Fast Data Transfer | 100 GB | 1 TB | ≈ $0.15/GB (**غير مؤكد** — الرقم من الذاكرة، يختلف بالمنطقة) |
| Edge Requests (كل طلب HTTP بما فيه static) | 1M | 10M | $2 / 1M |
| Function Invocations | 1M | مشمول ضمن الـcredit | $0.60 / 1M |
| Fluid Active CPU | 4 ساعات | — | $0.128 / ساعة |
| Provisioned Memory | 360 GB-hr | — | $0.0106 / GB-hr |
| Image Transformations | 5K | — | $0.05 / 1K |
| Image Cache Reads / Writes | 300K / 100K | — | $0.40/1M / $4/1M |
| مدة الدالة (Fluid) | 300s | 300s افتراضي، 800s حدّ | |
| ذاكرة الدالة | 2GB / 1 vCPU | حتى 4GB / 2 vCPU | |
| حجم body | 4.5 MB | 4.5 MB | |
| التزامن | حتى 30,000 | حتى 30,000 | |
| المنطقة الافتراضية | `iad1` | `iad1` (قابلة للتغيير) | |
| Hobby: **الاستخدام التجاري ممنوع** ويُوقف المشروع عند تجاوز الحدود | | | |

### 5.3 Cloudflare R2

10 GB-month تخزين مجاناً ثم $0.015/GB · Class A (رفع) 1M مجاناً ثم $4.50/M · Class B (قراءة) 10M مجاناً ثم $0.36/M · **Egress مجاني**.

### 5.4 أي حدّ يُصطدَم به أولاً؟

- **الآن (Hobby+Free):** Supabase Free يتوقف بعد أسبوع خمول → غير صالح أصلاً. ثم Vercel Active CPU (4h) و Function Invocations (1M) عند ≈ 4–6 مطاعم متوسطة، وSupabase egress (5GB) عند ≈ 7.
- **Pro+Pro:** حمل DB على Micro (§6.4) عند ≈ 150–300 مطعم، وكلفة Edge Requests تصبح البند الأكبر بعد 200.

---

## 6. التقدير الكمي

### 6.1 الافتراضات (المطعم المتوسط)

- 100 صنف، 10 أقسام، 30 صورة، 150 مسح QR/يوم = **4,500 زيارة/شهر**، ذروة 20 زائر متزامن.
- جلسة الزبون ≈ 5 دقائق: يتصفّح 1.5 قسم (≈ 15 بطاقة تدخل الـviewport → 15 prefetch)، يفتح صفحتي منتج، يزور السلة مرة، 4 أحداث تحليلات (1 `menu_open` + 2 `product_open` + 1 `product_add`).
- 50% زيارات متكرّرة (SW مفعّل).
- ضغط النقل بين Vercel وSupabase **مؤكَّد**: `fetch` في Node 22 يرسل `Accept-Encoding: br, gzip, deflate` افتراضياً (اختُبر فعلياً)، فحجم `loadMenu` على السلك ≈ 5 KB لا 53 KB.

### 6.2 تكلفة زيارة منيو واحدة (الوضع الحالي)

| البند | التفصيل | المجموع |
|---|---|---|
| استدعاءات دوال | HTML 1 + manifest 1 + SW re-fetch 0.5 (أولى فقط) + polls 10 + prefetch 15 + منتج 2 + سلة 1 + polls سلة 2 + track 4 | **≈ 36** |
| استعلامات DB | HTML 5 + manifest 1 + SW 2.5 + polls 40 + prefetch 75 + منتج 10 + سلة 5+8 + track ≈ 14 | **≈ 160** |
| بيانات من DB (على السلك) | ≈ 30 استدعاء `loadMenu` × 5 KB + صغائر | **≈ 160 KB** |
| Vercel Data Transfer | أولى ≈ 800 KB / متكرّرة ≈ 300 KB (×50%) + polls/prefetch/صفحات ≈ 200 KB | **≈ 0.65 MB** |
| Edge Requests | 36 دالة + ≈ 20 static/صور (متوسط أولى/متكرّرة) | **≈ 55** |
| كتابات تحليلات | 4 صفوف `events` + 4×(INSERT+DELETE) في `login_attempts` | **4 صفوف دائمة، ≈ 12 عملية كتابة** |
| Active CPU (تقدير) | SSR ≈ 40ms × 4 + prefetch ≈ 30ms × 15 + API ≈ 8ms × 12 + track ≈ 5ms × 4 | **≈ 0.75 ثانية CPU** (غير مؤكد ±2×) |

### 6.3 الاستهلاك الشهري لكل مطعم متوسط (× 4,500 زيارة)

| المورد | لكل مطعم/شهر |
|---|---|
| Function Invocations | ≈ 162K |
| استعلامات DB | ≈ 720K |
| Supabase egress | ≈ 0.7 GB |
| Vercel Data Transfer | ≈ 2.9 GB |
| Edge Requests | ≈ 250K |
| Active CPU | ≈ 56 دقيقة |
| نمو DB (`events` 18K صف × ≈ 140B مع الفهرسين) | ≈ 2.5 MB/شهر، تراكمي بلا حذف |
| Image transformations | ≈ 60–100 مرة واحدة عند رفع الصور (يُخزَّن سنة) |

### 6.4 جدول القدرة — الوضع الحالي بلا تعديل كود

| المورد | 50 مطعماً | 200 | 500 | 1000 | حدّ Hobby/Free | حدّ Pro/Pro |
|---|---|---|---|---|---|---|
| Invocations/شهر | 8.1M | 32M | 81M | 162M | 1M ✗ عند **6** | $5 / $19 / $49 / $97 |
| Edge Requests | 12.5M | 50M | 125M | 250M | 1M ✗ عند **4** | 10M مشمولة → $5 / $80 / $230 / $480 |
| Data Transfer | 145 GB | 580 GB | 1.45 TB | 2.9 TB | 100GB ✗ عند **34** | 1TB مشمول → $0 / $0 / ≈$68 / ≈$285 |
| Active CPU | 47 h | 187 h | 467 h | 933 h | 4h ✗ عند **4** | $6 / $24 / $60 / $120 |
| Provisioned Memory (غير مؤكد — يعتمد على تزامن Fluid) | ≈ 1.4K GB-hr | 5.4K | 13.5K | 27K | 360 ✗ | ≈ $15 / $57 / $143 / $286 |
| Supabase egress | 35 GB | 140 GB | 350 GB | 700 GB | 5GB ✗ عند **7** | 250GB → $0 / $0 / $9 / $41 |
| نمو DB/شهر | 125 MB | 500 MB | 1.25 GB | 2.5 GB | 500MB ممتلئة خلال 4 أشهر عند 50 | 8GB: تمتلئ خلال ≈ 6 أشهر عند 500 |
| ذروة استعلامات DB/ثانية (افتراض 10% من المطاعم في الذروة معاً × 20 زائراً) | ≈ 40 qps | ≈ 160 | ≈ 400 | ≈ 800 | Nano: ≈ 100–150 qps (غير مؤكد) | Micro ≈ 300–500 qps (غير مؤكد) → Small/Medium عند ≥ 300 مطعم (+$15–60) |
| **الكلفة الشهرية التقريبية (Pro+Pro+compute)** | **≈ $75** | **≈ $230** | **≈ $620** | **≈ $1,370** | | |

طريقة الحساب: كل خانة = الرقم في §6.3 × عدد المطاعم؛ الكلفة = (الاستهلاك − المشمول) × سعر الوحدة من §5. الـcredit الشهري لـPro ($20) لم يُخصم.

### 6.5 جدول القدرة — بعد الإصلاحات السريعة (§7.2)

الافتراض: كاش CDN لـ`/api/menu` (s-maxage 10s) يمتصّ ≥ 90% من الـpolls، إلغاء prefetch البطاقات، دمج استعلام الـlayout، تجميع الأحداث. الزيارة تصبح ≈ **8 استدعاءات، ≈ 30 استعلاماً، ≈ 0.45 MB نقل، ≈ 0.15 ثانية CPU**.

| المورد | 50 | 200 | 500 | 1000 | حدّ Pro/Pro |
|---|---|---|---|---|---|
| Invocations | 1.8M | 7.2M | 18M | 36M | $1 / $4 / $11 / $22 |
| Edge Requests | 10M | 40M | 100M | 200M | $0 / $60 / $180 / $380 (يبقى البند الأكبر — طلبات static وpolls المخزّنة تُحسب) |
| Data Transfer | 100 GB | 400 GB | 1 TB | 2 TB | $0 / $0 / $0 / ≈$150 |
| Active CPU | 9 h | 37 h | 94 h | 188 h | $1 / $5 / $12 / $24 |
| Supabase egress | 7 GB | 27 GB | 68 GB | 135 GB | مشمول |
| ذروة DB qps | ≈ 8 | ≈ 32 | ≈ 80 | ≈ 160 | Micro يكفي حتى ≈ 1000 (غير مؤكد) |
| نمو DB (مع rollup يومي + حذف الخام بعد 90 يوماً) | ثابت ≈ 40 MB | ≈ 150 MB | ≈ 375 MB | ≈ 750 MB | مشمول |
| **الكلفة التقريبية** | **≈ $50** | **≈ $115** | **≈ $250** | **≈ $640** | |

### 6.6 أقصى عدد زوار متزامنين على الإعداد الحالي

كل زائر نشط يولّد ≈ 0.2 طلب/ثانية (poll كل 30s + prefetch ≈ 15 لكل 5 دقائق) × ≈ 4.5 استعلام = **≈ 0.9 استعلام DB/ثانية/زائر**.

- **Vercel** ليس الحدّ: Fluid يتوسّع حتى 30,000 تزامن؛ مدة الطلب ≈ 200–400ms (رحلتان iad1→Frankfurt).
- **Supabase Nano (Free):** بافتراض ≈ 100–150 qps مستدامة (**غير مؤكد** — CPU مشترك) → **≈ 120–170 زائراً متزامناً** قبل ارتفاع الكمون ثم timeouts (`API_TIMEOUT_MS = 8000` في `sw.js:28` يحمي الزبون؛ الخادم يرجع 5xx من PostgREST).
- **Supabase Micro (Pro):** ≈ 300–500 qps → **≈ 350–550 زائراً متزامناً**.
- **بعد الإصلاحات:** ≈ 0.1 استعلام/ثانية/زائر → Micro ≈ **3,000–5,000 متزامن**.

الأعراض عند الاقتراب: زيادة زمن `/api/menu` > 1s، أخطاء `PGRST` / 502 من PostgREST، ثم يتوقف polling الزبون بصمت (يبقى على آخر بيانات) ويفشل `/api/track` بصمت (204).

### 6.7 نقطة الانكسار الأولى

| الوضع | المورد | عند كم مطعم | الأعراض |
|---|---|---|---|
| Hobby + Free | Supabase Free pause / Vercel Active CPU 4h | **1 / ≈ 4** | المشروع يتوقف (Supabase) أو Vercel يوقف الدوال حتى نهاية الشهر → المنيو يعرض `ClosedScreen`/خطأ |
| Pro + Pro (الكود الحالي) | حمل DB على Micro + كلفة Edge Requests | **≈ 150–300** | كمون polling يتجاوز 8s، prefetch يفشل، فاتورة Vercel تتجاوز $200 |
| Pro + Pro (بعد الإصلاحات) | كلفة Edge Requests (خطية) وحجم `events` إن لم يُطبَّق retention | **≈ 1000+** | فاتورة فقط، لا انكسار تقني |

---

## 7. المخاطر وخطة الإصلاح

### 7.1 جدول المخاطر

| # | الخطر | الملف/الموضع | الأثر على القدرة | صعوبة الإصلاح | الأولوية |
|---|---|---|---|---|---|
| 1 | **prefetch كامل لصفحة منتج ديناميكية من كل بطاقة** | `app/r/[slug]/menu-view.tsx:796` (وأيضاً `:341`, `:867`, `:894`, `product-view.tsx:121`) | ×15 استدعاءات/استعلامات لكل زيارة؛ أكبر مضخّم منفرد | 1h: `prefetch={false}` على البطاقات، أو تمرير المنتج من الحالة المحمّلة (المنيو موجود في الذاكرة أصلاً) | **P0** |
| 2 | **`/api/menu` بلا كاش CDN** | `app/api/menu/[slug]/route.ts:11-14` | كل poll = دالة + 4 استعلامات؛ 10 polls/زيارة | 2h: `Cache-Control: public, s-maxage=10, stale-while-revalidate=20` (يحفظ عقد الـ30s: أقصى تأخير 30+10s) مع إبقاء `no-store` للمتصفّح عبر `Vercel-CDN-Cache-Control`. تحديث `smoke-polling-contract.mjs` | **P0** |
| 3 | **منطقة الدوال `iad1` مقابل Supabase Frankfurt** | لا `vercel.json` | +150–200ms لكل تصيير (2 RTT)؛ يرفع Provisioned Memory time | 15min: `vercel.json` → `{"regions":["fra1"]}` | **P0** |
| 4 | **Supabase Free للإنتاج** | تشغيلي | إيقاف بعد أسبوع خمول، 500MB، Nano | Pro ($25) قبل أول عميل | **P0** |
| 5 | **حدّ Server Action 1MB مقابل 10MB في الكود** | `next.config.ts` (غياب `serverActions.bodySizeLimit`) + `lib/r2/upload.ts:45` | ليس قدرة، لكن كل صورة هاتف تفشل | 2h: `bodySizeLimit: '4mb'` + تصغير على العميل (`canvas`) قبل الرفع ليبقى تحت 4.5MB لـVercel | **P1** |
| 6 | **صف لكل حدث تحليلات، 3–4 رحلات DB لكل beacon، بلا retention** | `app/api/track/route.ts:28-67`, `0003`, `0015` (`check_rate_limit` = DELETE+SELECT+INSERT) | نمو DB 2.5MB/مطعم/شهر؛ 12 عملية كتابة/زيارة؛ `login_attempts` تتضخّم | 5h: RPC واحد `track_event(slug, kind, product_id, ip)` يجمع التحقّق+الإدراج؛ جدول `events_daily` بتجميع يومي (pg_cron في Supabase Pro) + حذف الخام > 90 يوماً | **P1** |
| 7 | **PostgREST `max-rows` = 1000 يقطع النتائج بصمت** (غير مؤكد) | `admin/dashboard/analytics/page.tsx:43-46` (أحداث 8 أيام: مطعم متوسط = ≈ 4,800 صف)، `owner/dashboard/accounts/page.tsx:27-37` (كل المنتجات/الأقسام/الأحداث/المدفوعات) | تحليلات المستأجر تُقلّل الأرقام بصمت من أول مطعم متوسط؛ عدّادات المالك تنكسر بعد ≈ 10 مطاعم | 3h: RPC بـ`GROUP BY` (`count(*)` لكل مطعم، تجميع الأحداث لكل يوم/منتج) | **P1** |
| 8 | **استعلام `restaurants` مكرّر بين layout والصفحة** | `app/r/[slug]/layout.tsx:16-25` + `lib/menu.ts:139` | 5 استعلامات بدل 4 لكل تصيير | 30min: لفّ `loadMenuResult` بـ`cache()` من React واستخدامه في `generateViewport` | **P2** |
| 9 | **لا فهرس على `events.product_id`** | `0003:12` | حذف منتج/حساب = seq scan على `events`؛ يبطؤ خطياً مع الأحداث | 10min: `CREATE INDEX CONCURRENTLY idx_events_product ON events(product_id) WHERE product_id IS NOT NULL` | **P2** |
| 10 | **لوحة المالك تمسح كل الجداول** | `owner/dashboard/accounts/page.tsx:20-37`, `page.tsx:26`, `analytics/page.tsx:35`, `billing/page.tsx:23` | O(إجمالي الصفوف)؛ عند 1000 مطعم = 100K منتج + كل المدفوعات في كل فتح صفحة | 3h: RPCs تجميعية + pagination | **P2** |
| 11 | **SW يعيد جلب HTML بعد التفعيل** | `public/sw.js:67,92`, `sw-register.tsx:45` | +1 استدعاء +5 استعلامات لكل زبون جديد | 30min: تخزين الاستجابة الأصلية من `handleNavigation` يكفي؛ إبقاء `CACHE_PAGE` للتحديثات فقط | **P3** |
| 12 | **manifest `no-store` مع استعلام DB** | `manifest.webmanifest/route.ts:20,68` | +1 استدعاء +1 استعلام لكل زيارة | 15min: `s-maxage=300` | **P3** |
| 13 | **فهارس مكرّرة** (`idx_restaurants_slug`, `idx_restaurants_username`, `idx_sessions_token_hash` تكرّر UNIQUE) | `0001:38-39,108` | كلفة كتابة صغيرة | 10min | **P3** |
| 14 | **`pub-*.r2.dev` ليس للإنتاج** (Cloudflare يحدّ معدّله) | `.env.example` R2_PUBLIC_URL | عند cache miss في Vercel Image | 30min: دومين مخصّص للـbucket | **P3** |
| 15 | **polling الإدارة 10s = 2 استعلام** | `modes-view.tsx:130`, `api/admin/state/route.ts:23-36` | 720 استعلام/ساعة لكل لوحة مفتوحة؛ مهمل عند مئات المستأجرين | — | P3 |

### 7.2 أعلى 5 تعديلات: أكبر رفع للقدرة بأقل جهد

| # | التعديل | الجهد | الأثر |
|---|---|---|---|
| 1 | إلغاء `prefetch` على بطاقات المنتج (أو صفحة منتج من الحالة المحلية) | 1h | −15 استدعاء و−75 استعلاماً لكل زيارة (**≈ −45% / −47%**) |
| 2 | كاش CDN 10s لـ`/api/menu/[slug]` | 2h | −9 استدعاءات و−36 استعلاماً لكل زيارة؛ يحوّل الذروة من DB إلى CDN |
| 3 | `vercel.json` → `fra1` | 15min | −40% من زمن الاستجابة، −Provisioned Memory |
| 4 | RPC واحد للتتبّع + تجميع يومي + retention 90 يوماً | 5h | −8 عمليات كتابة/زيارة؛ نمو DB ثابت؛ يحلّ خطر #7 لتحليلات المستأجر |
| 5 | `bodySizeLimit` + تصغير الصور على العميل | 2h | ليس قدرة لكنه أول شكوى سيسمعها المالك من أول مطعم |

المجموع ≈ **10 ساعات** → الزيارة من ≈ 36/160 إلى ≈ 8/30 استدعاء/استعلام.

### 7.3 ما يجب أن يكون جاهزاً

**قبل أول 100 مطعم:**
- Vercel Pro + Supabase Pro (Hobby يمنع الاستخدام التجاري أصلاً).
- التعديلات 1–3 و5 من §7.2 (≈ 5 ساعات).
- فحص `max-rows` في Supabase وإصلاح #7 لتحليلات المستأجر.
- تفعيل Point-in-time recovery أو على الأقل النسخ اليومية في Supabase Pro، ومراقبة (Vercel Observability أو log drain).
- `vercel.json` بـ`fra1`.

**قبل 500 مطعم:**
- التعديل 4 (تجميع الأحداث + retention) — بدونه تمتلئ 8GB خلال ≈ 6 أشهر.
- RPCs تجميعية للوحة المالك (#10) — بدونها صفحة الحسابات تجلب 50K منتج.
- رفع compute إلى Small/Medium حسب قياس CPU في لوحة Supabase.
- فهرس `events.product_id` (#9) قبل أن يصبح حذف حساب عملية دقائق.
- اختبار حمل حقيقي (k6/artillery) على staging: 500 زائر متزامن × polling 30s.
- دومين مخصّص لـR2.

---

## 8. الجاهزية للتسليم (Due Diligence)

**هل ينشر مشترٍ جديد من الصفر خلال ساعة اعتماداً على الـrepo فقط؟ لا — ≈ 2–3 ساعات لمهندس خبير، وأكثر لغيره.**

| العنصر | الحالة | التفصيل |
|---|---|---|
| `README.md` | ❌ **غير موجود** | نقطة الدخول الوحيدة هي `CLAUDE.md` (موجّه لوكلاء AI) و`docs/COMPANY-CONTEXT.md` |
| `.env.example` | ✅ | كامل ومشروح (`.env.example`, `.env.production.example`)؛ لكن يذكر Coolify لا Vercel |
| Migrations | ✅ مرتّبة `0001`→`0018` | **لكن** لا `supabase/config.toml` ولا ربط CLI؛ التطبيق يدوي عبر SQL Editor أو `supabase db push` بعد `link`. `0002` يتطلّب خطوة يدوية (تعيين `app_metadata.role`) موثّقة في التعليقات + `scripts/set-owner-role.mjs` |
| التحقّق من DB | ✅ | `docs/verify-fresh-db.sql` (يتوقّع 8 جداول، 76 عموداً، 12 سياسة، 17 فهرساً) |
| Seed | ❌ | لا بيانات تجريبية؛ أول مطعم يُنشأ من لوحة المالك يدوياً |
| دليل نشر Vercel | ❌ | `DEPLOY.md` و`DEPLOYMENT.md` موسومان **«مهجور»** (Coolify/Contabo)؛ لا يوجد دليل للوجهة الحالية |
| `vercel.json` | ❌ | لا منطقة، لا cron |
| Backups | ❌ غير موثّقة | تعتمد على خطة Supabase؛ لا سكربت تصدير |
| Tests | 🟡 | `npm test` = 19 سكربت دخان، معظمها يحتاج `.env.local` + خادم يعمل (بعضها production build) — لا unit tests، لا CI (لا `.github/`) |
| `Dockerfile` | 🟡 | موجود لكن **لا يُبنى** (موسوم) |
| أسرار في الـrepo | ✅ | `.env*` في `.gitignore` إلا القوالب؛ لا مفاتيح في الكود (grep) |
| ملفات غريبة في الجذر | 🟡 | 3 صور غير متعقّبة (`Generated Image…jpg`, `…removebg-preview.png`, `ba8c…jpg`) + `public/Generated Image….jpg` متعقّبة — تنظيف |

**الناقص الحرج للتسليم:** README بمسار Vercel خطوة بخطوة (env → migrations → owner role → أول مطعم)، `vercel.json`، seed لمطعم تجريبي، توثيق النسخ الاحتياطي.

---

## 9. ملحق: كل الاستعلامات مع الملف والسطر

### 9.1 مسار الزبون (بلا مصادقة، service_role)

| الملف:السطر | الجدول | العملية | الفلتر |
|---|---|---|---|
| `lib/menu.ts:140` | restaurants | select 17 عموداً | `slug` |
| `lib/menu.ts:184` | categories | select + order display_order | `restaurant_id` |
| `lib/menu.ts:189` | products | select 15 عموداً + order | `restaurant_id` |
| `lib/menu.ts:196` | complementary_categories | select | `restaurant_id` |
| `lib/closing.ts:64` | rpc `revert_closing_mode` | UPDATE×2 | `p_restaurant_id` |
| `lib/closing.ts:68,73` | restaurants, products | update (fallback) | `id`/`restaurant_id` |
| `app/r/[slug]/layout.tsx:19` | restaurants | select primary_color | `slug` |
| `app/r/[slug]/manifest.webmanifest/route.ts:21` | restaurants | select 5 أعمدة | `slug` |
| `app/api/track/route.ts:47` | restaurants | select id | `slug`, `is_active`, `deleted_at` |
| `app/api/track/route.ts:59` | products | select id | `id`, `restaurant_id` |
| `app/api/track/route.ts:67` | events | **insert** | — |
| `lib/auth/rate-limit.ts:31` | rpc `check_rate_limit` | DELETE+SELECT+INSERT | `p_key` |

### 9.2 مسار المستأجر (كوكي → service_role)

| الملف:السطر | الجدول | العملية | الفلتر |
|---|---|---|---|
| `lib/auth/session.ts:30` | tenant_sessions | insert | — |
| `lib/auth/session.ts:89` | tenant_sessions | select | `token_hash` |
| `lib/auth/session.ts:117` | tenant_sessions | delete | `token_hash` |
| `lib/auth/require-tenant.ts:28` | restaurants | select 6 أعمدة | `id` |
| `lib/auth/rate-limit.ts:57` | rpc `clear_rate_limit` | DELETE | `p_key` |
| `app/admin/actions.ts:48` | restaurants | select password_hash… | `username` |
| `app/admin/actions.ts:73` | restaurants | update last_login_at | `id` |
| `app/admin/suspended/page.tsx:32` | restaurants | select | `id` |
| `app/api/admin/state/route.ts:33` | restaurants | select mode | `id` |
| `app/api/admin/qr-pdf/route.ts:19` | restaurants | select slug, display_name | `id` |
| `app/admin/dashboard/menu/page.tsx:20,25,30` | categories, products, complementary_categories | select | `restaurant_id` |
| `app/admin/dashboard/menu/actions.ts:40` | products | select (resolveSuggestions) | `restaurant_id` + `in(ids)` |
| `…menu/actions.ts:67,81,92,118,140,150,167,200,371,416,428` | categories | select/insert/update/delete/upsert | `restaurant_id` أو `id` مُتحقَّق |
| `…menu/actions.ts:157,224,233,275,308,322,336,346,444,456` | products | select/insert/update/delete/upsert | `restaurant_id` (`:224` عبر `category_id` مُتحقَّق) |
| `…menu/actions.ts:378,393` | complementary_categories | delete/insert | `restaurant_id` |
| `app/admin/dashboard/modes/page.tsx:23,28,33` | restaurants, categories, products | select | `id`/`restaurant_id` |
| `app/admin/dashboard/modes/actions.ts:83,146,156,175,200,212,220` | products | select/update | `restaurant_id` (+`in(ids)`) |
| `app/admin/dashboard/modes/actions.ts:133` | restaurants | update mode | `id` |
| `app/admin/dashboard/design/page.tsx:27` | restaurants | select | `id` |
| `app/admin/dashboard/design/actions.ts:44,79` | restaurants | select/update | `id` |
| `app/admin/dashboard/analytics/page.tsx:43,48,52` | events (8 أيام), products, categories | select | `restaurant_id` |

### 9.3 مسار المالك (Supabase Auth → service_role) — بلا فلتر مستأجر بالتصميم

| الملف:السطر | الجدول | العملية | الفلتر |
|---|---|---|---|
| `app/owner/dashboard/page.tsx:23,26` | restaurants, payments | select الكل | — |
| `app/owner/dashboard/accounts/page.tsx:22,27,28,30,35` | restaurants, products, categories, events (limit 50K), payments | select الكل | — |
| `app/owner/dashboard/accounts/[id]/page.tsx:41,51,52,53,55,59` | restaurants, categories, products, tenant_sessions, payments, events | select | `id`/`restaurant_id` |
| `app/owner/dashboard/accounts/actions.ts:94,111,121,190,211,225,230,240,255,257,286` | restaurants, payments, tenant_sessions | insert/update/delete | `id` |
| `app/owner/dashboard/analytics/page.tsx:35,37` | restaurants, payments | select الكل | — |
| `app/owner/dashboard/billing/page.tsx:23,27` | payments, restaurants | select الكل | — |
| `app/owner/dashboard/billing/actions.ts:55,62,91,92` | restaurants, payments | select/insert/delete | `id` |
| `lib/auth/require-owner.ts:20`, `proxy.ts:43` | Supabase Auth `getUser()` | HTTP | JWT |

### 9.4 خارج DB

| الملف:السطر | الخدمة | العملية |
|---|---|---|
| `lib/r2/upload.ts:85` | R2 `PutObject` | رفع WebP |
| `lib/r2/upload.ts:99` | R2 `DeleteObject` | حذف صورة |
| `lib/r2/upload.ts:151,156` | R2 `ListObjectsV2` + `DeleteObjects` | حذف حساب |
| `app/api/admin/qr-pdf/route.ts:41-49` | `qrcode` + `pdf-lib` | CPU-bound (≈ 100–300ms) |

---

*انتهى التقرير. لم يُعدَّل أي ملف عدا إنشاء هذا الملف.*
