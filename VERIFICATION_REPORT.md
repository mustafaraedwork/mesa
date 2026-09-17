# VERIFICATION_REPORT.md — تحويل تقديرات CAPACITY_REPORT.md إلى أرقام مقاسة

> تاريخ القياس 2026-09-17. **لم يُعدَّل أي ملف مصدري.** الملفات الجديدة في المستودع: هذا التقرير و`scripts/load/` (5 ملفات). كل ما يُنشأ أثناء القياس (خادم، proxy، Supabase محلي، صور، سكربتات مساعدة) عاش في مجلد مؤقّت خارج المستودع وحُذف في النهاية، و`.next` أُعيد بناؤه بإعدادات المستودع الأصلية.
>
> **بيئة القياس:** هذه الآلة (Intel i7-13700H، Windows 11)، Node 22.20، Next 16.2.6 بـ`next start` إنتاجي، **Supabase محلي كامل عبر Docker** (Postgres 17 + PostgREST + Kong، CLI 2.72.7) طُبِّقت عليه الهجرات `0001`→`0018` من الصفر ثم بيانات مولّدة: مطعم بـ100 صنف / 10 أقسام / 30 صورة / **100,000 حدث** + مطعم صغير. سبب اللجوء للمحلي: **`.env.local` يشير إلى مشروع Supabase محذوف** (`itmjtsanrgrlytgxemls.supabase.co` → `ENOTFOUND`)، والمشروع الحيّ `nwtlkcruiadvvtrggold` (Frankfurt) رفضت أداة الحماية استخدام مفتاحه حتى للقراءة، فلم يُلمس.
>
> **أثر جانبي واحد على الإنتاج يجب الانتباه له (§5):** اختبار الرفع (البند 13) نجح في حالة 800KB ورفع **كائناً واحداً إلى bucket R2 الحقيقي** لأن مفاتيح R2 في `.env.local` حقيقية. المفتاح مذكور في §5 ولم أحذفه لأنه كتابة على مورد إنتاجي.

---

## 1. جدول البنود 1–25

| # | البند | الحالة | الرقم / النتيجة | طريقة القياس |
|---|---|---|---|---|
| 1 | prefetch الفعلي | **مؤكَّد — وأسوأ ممّا قُدِّر** | جلسة هاتف 390×844، 90 ثانية، قسمان: **32 رابط منتج دخل الـviewport → 64 طلباً للخادم**: 32 × `/_tree` (434 بايت، **0 SQL**) + 32 × جلب RSC كامل (8.7–9.2KB خام، **5 استعلامات SQL كل واحد**، نفس `loadMenuResult` + استعلام الـlayout). Desktop: 16 رابط → 32 طلباً. Polls: 2 في 90s. Track: 1 (`menu_open`). Manifest: 0 (Chromium headless لا يجلبه؛ Chrome الحقيقي يجلبه مرة = 1 استدعاء + 1 SQL). إعادة جلب SW للـHTML: 1 على الهاتف، 2 على desktop. **إجمالي SQL في 90 ثانية لزائر واحد: 183 عبارة** (37 تنفيذاً كاملاً لاستعلامات المنيو الأربعة + 35 استعلام layout). `staleTimes` الافتراضية في Next 16: `dynamic: 0, static: 300` (`node_modules/next/dist/server/config-shared.js:243`) → لا إلغاء تكرار بين البطاقات (كل بطاقة URL مختلف)، والـ`dynamic: 0` يعني أن التنقّل الفعلي يعيد الجلب رغم الـprefetch. الآلية: `prefetch={true}` → `FetchStrategy.FULL` (`client/app-dir/link.js:385-396`)، التفعيل بـ`IntersectionObserver` بهامش `200px` (`client/components/links.js:97`) | proxy تسجيل بين Playwright والخادم (كل طلب يصل الخادم فعلاً بما فيه طلبات SW) + `pg_stat_statements_reset()` قبل الجلسة وقراءة `calls` بعدها + تجميع طلبات المنتج حسب ترويسات `next-*` وإعادة تشغيل كل نوع 30× |
| 2 | حجم HTML وJSON لمنيو 100 صنف | **مؤكَّد** | `/r/[slug]` HTML: **80,818 خام / 10,026 gzip**. `/api/menu/[slug]`: **61,426 خام / 3,929 gzip**. صفحة منتج: 42,813 / 8,704. السلة: 83,635 / 10,494. Manifest: 596 / 332. RSC الكامل لصفحة منتج (prefetch): 8,725–9,225 خام / **2,696–2,752 على السلك**. تصحيح: التقدير السابق لـJSON (53KB/5KB) صحيح تقريباً؛ HTML كان مقدّراً 80–100KB/15–20KB gzip → الفعلي 80.8KB/**10KB**. **ملاحظة مقاسة:** `next start` المحلي **لا يضغط** `/api/menu` (61,426 على السلك حتى مع `Accept-Encoding: gzip`) بينما يضغط HTML؛ على Vercel تضغط CDN كل `application/json` و`text/x-component` تلقائياً (وثيقة `vercel.com/docs/how-vercel-cdn-works/compression`, 2026-03-05) | `curl -H "Accept-Encoding: gzip" --write-out size_download` + حساب gzip في Node على الجسم الخام |
| 3 | p50/p95 لكل مسار (30 طلباً متتالياً) | **مؤكَّد (محلياً: DB على نفس الآلة)** | HTML **13.0 / 18.9 ms** · `/api/menu` **8.1 / 10.2** · manifest 3.6 / 4.6 · منتج HTML 11.0 / 14.0 · RSC `/_tree` 4.5 / 5.2 · السلة 11.0 / 12.2 · health 1.0 / 1.8 · `/api/track` (جسم تالف، بلا DB) 1.1 / 2.2. **زمن DB مفصولاً** (نفس الاستعلامات الأربعة عبر supabase-js على PostgREST المحلي): restaurants 3.0/4.8 · categories 1.8/2.3 · products (100 صف، 50.4KB) 3.1/4.1 · complementary 1.4/1.6 · **السلسلة كما في التطبيق (1 ثم Promise.all(3)): 4.4 / 7.2 ms**. أي أن تصيير HTML ≈ 13 − 4.4 ≈ **8.6ms** والباقي DB. على Vercel `iad1` مع Supabase Frankfurt أضف **رحلتين متسلسلتين ≈ 2 × 85–95ms** لكل تصيير؛ على `fra1` ≈ 2 × 5ms | `route-timing.mjs` (fetch متسلسل، p50/p95) + `db-timing.mjs` عبر supabase-js |
| 4 | max-rows في PostgREST | **مؤكَّد = 1000** | `supabase init` يولّد `[api] max_rows = 1000` (افتراض المنصّة؛ PostgREST الخام افتراضه ∞ — وثائقه الرسمية). تجريبياً على المحلي: `events?limit=5000` → **1000 صف مُرجَع، `count=100000`**. استعلام تحليلات المستأجر كما هو مكتوب (`analytics/page.tsx:43`، 8 أيام، بلا limit) → **1000 صف من 8,900** → الصفحة تُظهر ≈ 11% من الحقيقة **بصمت**. القيمة على مشروع الإنتاج تحتاج تأكيداً من Dashboard → Settings → API (§5) | REST مع `Prefer: count=exact` + `content-range` |
| 5 | سعة DB الفعلية | **مؤكَّد محلياً (نفس الـschema، 100K حدث)** | `events`: **18 MB / 102,000 صف = 189 بايت/صف** (heap 9.6MB + فهرسان 9.2MB: `events_pkey` 4.3MB، `idx_events_restaurant_created` 5.0MB). `products` 144KB/108 صف (الحدّ الأدنى للصفحات، لا يعني 1.3KB/صف عند الحجم الكبير). `restaurants` 128KB لصفّين (8 فهارس منها 2 مكرّران). **EXPLAIN (ANALYZE, BUFFERS):** الاستعلامات الأربعة للمنيو 0.009–0.053ms (seq scan لأن الجداول صغيرة؛ الفهارس موجودة وستُستخدم عند النمو). تحليلات المستأجر 8 أيام: **Bitmap Index Scan على `idx_events_restaurant_created`، 8,900 صف، 2.2ms**. صفحة حسابات المالك `events ORDER BY created_at DESC LIMIT 50000`: **Seq Scan + external merge sort على القرص 3.4MB، 29ms** عند 100K حدث (ينمو خطياً). `events WHERE product_id = …` (FK بلا فهرس): **Seq Scan 102,000 صف، 3ms**. **`DELETE FROM restaurants` (100 صنف، 100K حدث، ROLLBACK): 113ms** — منها 81ms trigger `events_product_id_fkey` (100 نداء × seq scan) + 30ms `events_restaurant_id_fkey`. `pg_stat_statements` مفعّل (Supabase يفعّله افتراضياً). `max_connections` محلياً 100 | `docker exec … psql` بملف SQL (SELECT/EXPLAIN فقط، الحذف داخل `BEGIN…ROLLBACK`) |
| 6 | حدود PostgREST/pool | **موثَّق + محسوب** | جدول Supabase الرسمي (`supabase.com/docs/guides/platform/compute-and-disk`): Nano/Micro **60 اتصالاً مباشراً / 200 pooler**، Small 90/400، Medium 120/600، Large 160/800. PostgREST pool: افتراض PostgREST الرسمي **`db-pool = 10`** (`docs.postgrest.org/en/latest/references/configuration.html`)؛ قيمة Supabase لكل حجم **غير منشورة** — طريقة القياس على الإنتاج: `SELECT usename, application_name, count(*) FROM pg_stat_activity GROUP BY 1,2` (في `scripts/load/readonly-db-stats.sql` §9). **الحساب:** عبارة واحدة تكلّف 1.4–3.1ms p50 على هذه الآلة (§3) → pool من 10 اتصالات يتحمّل نظرياً **≈ 3,000–7,000 عبارة/ثانية**؛ على Micro (نواتان ARM مشتركتان) العامل المقيِّد هو CPU لا الـpool — يحتاج قياس k6 على staging مع مراقبة CPU في لوحة Supabase (`scripts/load/diner-session.k6.js`) | وثائق رسمية + قسمة على الزمن المقاس |
| 7 | أسعار Vercel | **مصحَّح من الوثائق الرسمية (جُلبت 2026-09-17)** | **Fast Data Transfer**: Hobby 100GB؛ Pro عبر **Flat Rate CDN** — مشمول 1TB + **1M طلب CDN**؛ الطبقات: **$20 → 10M طلب/50TB، $100 → 50M، $300 → 150M**؛ فوقها on-demand **$2.00–3.20/1M طلب** و**$0.15–0.35/GB** (`/docs/pricing/flat-rate-cdn` 2026-09-08، `/docs/pricing/regional-pricing` 2026-08-31). **الخطأ في التقرير الأول:** «10M مشمولة ثم $2/1M» — الصحيح 1M مشمولة ثم طبقات ثابتة. **Active CPU**: iad1 $0.128/h، **fra1 $0.184/h**. **Provisioned Memory**: iad1 $0.0106، **fra1 $0.0152/GB-hr**. **Image transformations** $0.05–0.0812/1K، cache reads $0.40–0.64/1M، cache writes $4.00–6.40/1M؛ Hobby: 5K/300K/100K (`/docs/image-optimization/limits-and-pricing` 2026-08-11). Invocations $0.60/1M (`/docs/functions/usage-and-pricing` 2026-06-16). Hobby يمنع الاستخدام التجاري صراحةً (`/docs/limits/fair-use-guidelines`) | WebFetch للصفحات الرسمية |
| 8 | Active CPU لكل طلب | **مؤكَّد (i7-13700H، فرق `TotalProcessorTime` على عملية `next start` / 40 طلباً)** | HTML **16.8ms** · `/api/menu` **6.3** · manifest 2.0 · منتج HTML 13.7 · prefetch `/_tree` 0.5–7.8 (متوسط ≈ 4) · **prefetch RSC كامل 4.2–13.5 (متوسط 8.5)** · السلة 12.1 · health 1.6. لكل جلسة 5 دقائق (2 HTML + 10 polls + 20 tree + 20 full + 2 منتج + سلة + manifest + 4 track) ≈ **370ms CPU** على هذه الآلة؛ vCPU في Vercel أبطأ بعامل ≈ 1.3–2 → **≈ 0.5–0.75 ثانية/جلسة** | `cpu-measure.ps1` (PowerShell `Get-Process … TotalProcessorTime`) |
| 9 | R2_PUBLIC_URL وترويسات الصور | **مؤكَّد على R2 الحقيقي** | `R2_PUBLIC_URL = https://pub-9eb57ce7905e4c59989e5d7fc0317fc1.r2.dev` — **`pub-*.r2.dev` لا دومين مخصّص** (Cloudflare يصفه بأنه لغير الإنتاج ومحدود المعدّل). ترويسات كائن حقيقي: `HTTP/1.1 200`، `Content-Type: image/webp`، `Content-Length: 311692`، `Cache-Control: public, max-age=31536000, immutable`، `ETag: "d62e…"`، `Last-Modified`، `Server: cloudflare`. **لا `cf-cache-status` ولا `Age`** حتى بعد الجلب الثاني → r2.dev **لا يمرّ بكاش CDN** | `curl -I` مرتين |
| 10 | next/image: variants وتكلفتها | **مؤكَّد (خوارزمية Next نفسها + قياس محلي)** | srcset المولَّد فعلياً (`next/dist/shared/lib/get-img-props.js` بإعدادات المشروع): بطاقة `(max-width:768px) 50vw, 200px` → 9 عروض `[384,640,750,828,1080,1200,1920,2048,3840]`؛ صفحة المنتج `100vw, 640px` → 8؛ الشعار `44px`/`56px`/`96px` → 15. **ما يطلبه المتصفّح فعلاً** (DPR 2–3 على هاتف 390px): البطاقة **640** (أحياناً 384)، صفحة المنتج **828–1200**، الاقتراح 384/640، الشعار 96–200. أي **≈ 5–7 variants لكل صورة منتج** = 5–7 transformations + 5–7 cache writes **مرة واحدة** (TTL سنة مُشتقّ من `max-age` R2 — مقاس محلياً: `Cache-Control: public, max-age=31536000, must-revalidate`, `X-Nextjs-Cache: HIT`). مطعم بـ30 صورة → ≈ **150–210 transformation عند الرفع ≈ $0.01**. أحجام variant لصورة اختبار 800×800 (ضوضاء = أسوأ حالة): w=384 → 30.8KB، w=640 → 114.5KB، w=828 → 226.5KB | Node على وحدة `get-img-props` + `curl /_next/image?...` |
| 11 | حجم الصور الفعلي | **مؤكَّد (bucket الإنتاج، قراءة فقط)** | 61 كائناً / **3.65 MB**؛ 56 صورة منتج، 3 شعارات، 6 بادئات مطاعم. صور المنتجات: **min 1.1KB · p50 50.8KB · avg 64.7KB · p90 108KB · max 304KB** (الأقصى هو صورة اختباري). أول 20: 304, 53.5, 46.2, 169.8, 74.6, 104.8, 30, 145.5, 76.8, 38.5, 79.8, 69.3, 41.9, 83.8, 56, 65.6, 29.8, 26.6, 70.4, 48.8 KB. **تصحيح:** تقدير 20–30KB كان للـvariant المُقدَّم؛ المصدر 800px متوسطه **65KB**، والمقدَّم للزبون (640px) ≈ 40–70% منه ≈ **30–45KB** | `ListObjectsV2` على البكت |
| 12 | عمومية البكت / CORS / الحذف / اليتامى | **مؤكَّد** | أي كائن يُقرأ بمعرفة الرابط (200)؛ **الجذر غير قابل للسرد** (404)؛ مفتاح غير موجود 404. **لا سياسة CORS**: `OPTIONS` مع Origin → **403 بلا `Access-Control-*`** (لذا يخزّن SW استجابات opaque — `sw.js:238`). **الحذف في الكود:** `updateProduct` (استبدال: `menu/actions.ts:298`, إزالة: `:303`), `deleteProduct` (`:343`), `deleteCategory` يجمع صور المنتجات والأقسام الفرعية (`:150-163`), الشعار (`design/actions.ts:82,88`), `deleteAccount` يمسح البادئة كاملة (`accounts/actions.ts:279`). **الفجوات:** soft-delete لا يحذف الصور (مقصود)؛ فشل الحذف يُسجَّل فقط (`safeDeleteImage`) → يتامى؛ **6 بادئات مطاعم في البكت** بينما القاعدة الحيّة جديدة → يتامى من المشروع القديم المحذوف على الأرجح. سكربت الإحصاء بلا حذف: `scripts/load/r2-orphans.mjs` | `curl` + `ListObjectsV2` + قراءة الكود |
| 13 | حدّ الرفع 1MB عملياً | **مؤكَّد (محلياً عبر الواجهة الحقيقية)** | **1.5MB (1,583,357 بايت):** الـServer Action يردّ **HTTP 500** بجسم RSC `1:E{"digest":"1528542347@E394"}` بعد 1.8 ثانية؛ **الحوار يُغلق، لا رسالة، لا `role=alert`، لا صف في DB** — فشل صامت تماماً. السبب: `Body exceeded 1 MB limit` (`next/dist/server/app-render/action-handler.js`, الافتراض `1024 * 1024`) يُرمى قبل تنفيذ `createProduct`، والخطأ المرمي لا يمرّ بمسار `{ok:false}` الذي يعرضه `product-dialog.tsx:73`. **800KB (827,994 بايت): نجح** — صف جديد + كائن WebP في R2 (311,692 بايت). **الرسالة غير مفهومة لصاحب المطعم لأنها غير موجودة أصلاً** | `scripts/load/upload-limit.spec.mjs` (Playwright، تسجيل دخول حقيقي، صور JPEG مولّدة بـsharp) |
| 14 | عزل مفاتيح Supabase في مسار الزبون | **مؤكَّد بالكود؛ اختبار REST على الإنتاج يحتاج المالك** | `lib/supabase/server.ts` (service role) **لا يُستورد من أي ملف `'use client'`** (فحص كل المستوردين). `getBrowserClient` (anon) **لا يُستورد إطلاقاً** — مسار الزبون لا يستخدم الـanon key؛ فسياسات RLS العامة دفاع في العمق لمن يضرب REST مباشرة فقط. الأعمدة المكشوفة لـ`anon` هي قائمة `0013` الصريحة (20 عموداً على `restaurants` بلا `password_hash`/`username`، 4 على `tenant_sessions` بلا `token_hash`)؛ التقرير `docs/BIZIII-READINESS.md` §1.1 يذكر تحقّقاً حيّاً بـ`has_column_privilege` في 2026-08-30. اختباري بـcurl على الإنتاج مُنع (مفاتيح) → الأوامر في §5 | grep + قراءة الهجرات |
| 15 | تحديد المعدّل على `/api/track` | **مؤكَّد — مطعم مزدحم يفقد التحليلات بصمت** | الحدّ `60 طلباً / 60 ثانية لكل IP` (`rate-limit.ts:20`). **300 beacon من IP واحد خلال 1.48 ثانية: كلها 204، المخزَّن 60، المُسقَط بصمت 240.** مطعم على Wi-Fi واحد (IP خروج واحد) يتجاوز 60 حدثاً/دقيقة بمجرّد 15 زبوناً يفتحون المنيو ويتصفّحون معاً. أسوأ: شبكات الهاتف في العراق خلف CGNAT تشارك IP الخروج بين آلاف المستخدمين → عدّاد واحد لحيّ كامل. الـIP يُقرأ من `x-vercel-forwarded-for` (`rate-limit.ts:88`) | `scripts/load/track-ratelimit.mjs` على المحلي (عدّ الصفوف قبل/بعد) |
| 16 | انتهاء الاشتراك من الـtrigger إلى الزبون | **مؤكَّد بالكود** | `payments` INSERT/UPDATE/DELETE → `trg_payments_sync_subscription` يكتب `restaurants.subscription_ends_at = MAX(period_end)` (`0016`). **لا cron**: `deriveSubscription()` تُحسب **عند كل طلب** في `lib/menu.ts:154` (الزبون)، `require-tenant.ts:36` (كل صفحة/action للمستأجر)، وصفحات المالك. المهلة **3 أيام بتقويم بغداد** (`GRACE_DAYS = 3`، `bagDayDiff` في `lib/billing.ts:88` — فرق أيام كاملة بإزاحة بغداد، لا ساعات). **اليوم 1–3 بعد الانتهاء:** كل شيء يعمل مع تحذير. **اليوم 4:** الزبون يرى `PausedScreen` «المنيو الرقمي متوقّف مؤقتاً» (لا «مغلق»)، والمستأجر يُحوَّل إلى `/admin/suspended` «انتهى اشتراك …» بما فيه استدعاء server action مباشرة. **التجديد:** تسجيل دفعة بـ`period_end` مستقبلي → الـtrigger يحدّث العمود فوراً → **الطلب التالي يفتح كل شيء** (لا كاش في المسار: كله `force-dynamic`). فجوة: دفعة بلا `period_end` لا تمدّد شيئاً | قراءة `0016`, `lib/subscription.ts`, `lib/billing.ts`, `paused-screen.tsx`, `admin/suspended/page.tsx` |
| 17 | انتهاء Closing Mode وأسوأ تأخير | **مؤكَّد بالكود + قياس offline** | الخادم **لا يُرجع أبداً سعراً مخفّضاً منتهياً**: `loadMenuResult` يفحص `closing_mode_ends_at < now` قبل حساب أي خصم (`menu.ts:166-176`) ثم ينفّذ `revert_closing_mode` لازماً. إذا لم يزر أحد: الصف يبقى `closing` في DB بلا أثر مرئي حتى أول قراءة (زبون، أو `/api/admin/state` كل 10 ثوانٍ ما دامت لوحة المستأجر مفتوحة). **العميل لا يملك مؤقّتاً محلياً** (لا استخدام لـ`closing_mode_ends_at` في أي مكوّن للزبون — grep) → يعرض الخصم القديم حتى الـpoll التالي. **أسوأ تأخير:** متصل والتبويب ظاهر: **≤ 30 ثانية**؛ تبويب مخفي: حتى يعود ظاهراً (`visibilitychange` يطلق poll فورياً)؛ **offline:** SW يخدم آخر JSON من `mesa-api-fallback` وآخر HTML → **بلا حدّ** حتى عودة الاتصال + poll (مقاس: **24.4–25 ثانية** بعد عودة الاتصال). الزبون في هذه الحالة قد يطلب بسعر منتهٍ من النادل — لكن السعر الفعلي لدى المطعم هو الصحيح (الخصم يُحسب عند القراءة فقط، لا يُخزَّن) | قراءة الكود + `offline-test2` بـPlaywright (`context.setOffline`) |
| 18 | تراكم الجلسات | **مؤكَّد بالكود** | صف واحد لكل تسجيل دخول (`session.ts:29-31`)؛ **لا حدّ لعدد الجلسات ولا `expires_at`**؛ الحدّ الوحيد فحص عمر 365 يوماً عند القراءة مع حذف الصف المنتهي (`session.ts:100-109`). مطعم يدخل من جهاز جديد يومياً = 365 صفاً/سنة ≈ **55KB** — مهمل. الإبطال الجماعي: تغيير كلمة السر (`accounts/actions.ts:257`) والحذف الناعم (`:230`) والحذف الكامل (cascade). **خروج المالك (`owner/actions.ts:62`) لا يمسّ جلسات المستأجرين** — نظامان منفصلان بالتصميم | grep |
| 19 | i18n | **مؤكَّد — مكتمل** | 44 مفتاحاً × 3 لغات، **لا مفتاح ناقص في EN أو KU**. المفتاحان «المتطابقان» مع العربية `qty_increase`/`qty_decrease` هما الرمزان `+`/`–` (ليسا نقصاً). **صفر نصوص عربية مكتوبة مباشرة** خارج `t()` في مكوّنات الزبون (grep بـPCRE على `\p{Arabic}` عدا `name_ar`). تبديل اللغة = حالة محلية + `localStorage` (`menu-view.tsx:239-240`) **بلا إعادة جلب** (الأسماء الثلاثة في الحمولة أصلاً) | سكربت تحليل `lib/i18n.ts` + grep |
| 20 | Service Worker عند النشر وoffline | **مؤكَّد بالقياس** | **النشر:** `VERSION = 'v1'` ثابت؛ لا `skipWaiting`؛ لكن HTML **NetworkFirst** وchunks مجزّأة الاسم → المتصل يحصل على النسخة الجديدة **فوراً في التنقّل التالي**؛ الذي يتغيّر عند الإغلاق التام فقط هو منطق SW نفسه. **offline:** بعد الزيارة الأولى الكاش يحوي **HTML فقط** (`mesa-html-v1: 1`) لأن chunks الزيارة الأولى حُمِّلت قبل سيطرة SW → إعادة التحميل offline بعد زيارة واحدة تعطي صفحة **غير قابلة للاستخدام** (نص ≤ 200 حرف)؛ **بعد الزيارة الثانية** (`mesa-static-v1: 22`) إعادة التحميل offline **تعمل كاملة**: 34 رابط منتج، مُهيّأة (hydrated)، الأخطاء الوحيدة تحميل الصور غير المخزّنة. polls offline تُخدَم من `mesa-api-fallback`. **عودة الإنترنت: أول poll ناجح بعد 24.4 ثانية** (مقاسان: 25 و24.4) → تغيير السعر يصل خلال ≤ 30s | `offline-test2` بـPlaywright + عدّ مفاتيح `caches` |
| 21 | Lighthouse (mobile، محاكاة slow-4G) على `/r/demo-load` | **مؤكَّد** | **Performance 83** · FCP **0.8s** · **LCP 4.7s** · TBT 30ms · CLS 0 · Speed Index 0.8s · TTI 4.7s · إجمالي النقل **649 KiB**: خطوط **326KB (5 ملفات — تُحمَّل أوزان Mono الثلاثة أيضاً)**، JS 250KB (16 ملفاً)، CSS 14.5KB، HTML 11.6KB، manifest 1.4KB. زمن استجابة الجذر 20ms. الشاشة المقاسة هي شاشة الترحيب (أول رسم حقيقي). **الـLCP 4.7s سببه وزن الخطوط على الاتصال البطيء** لا الخادم | `npx lighthouse@13 --form-factor=mobile --throttling-method=simulate` على `next start` |
| 22 | حذف حساب كامل | **مؤكَّد (EXPLAIN ANALYZE مع ROLLBACK)** | السلسلة: `restaurants` → cascade إلى `categories` (→ `products` عبر `category_id`, `complementary_categories`), `products` (→ `events.product_id`), `tenant_sessions`, `events.restaurant_id`, `payments` (+ trigger المزامنة)؛ R2 يُمسح قبل الحذف (`deleteRestaurantImages`: `ListObjectsV2` + `DeleteObjects` دفعات 1000). **الزمن المقاس لمطعم بـ100 صنف و100K حدث: 113ms** في DB، منها **111ms بسبب `events`** (81ms = 100 seq scan لعدم وجود فهرس على `product_id` + 30ms). ينمو خطياً مع الأحداث: **≈ 1.1s عند 1M حدث، ≈ 11s عند 10M** (فوق ذلك قد يتجاوز حدّ Server Action). R2: 1 list + 1 delete-batch لـ56 كائناً ≈ 0.3–0.6s. فهرس `events(product_id)` يُسقط الجزء الأكبر | `EXPLAIN (ANALYZE, BUFFERS) DELETE … ROLLBACK` |
| 23 | أكبر الملفات وقابلية الصيانة | **مؤكَّد** | `app/r/[slug]/menu-view.tsx` **907** · `owner/dashboard/accounts/accounts-table.tsx` 559 · `admin/dashboard/menu/menu-view.tsx` 502 · `admin/dashboard/design/design-view.tsx` 497 · `r/[slug]/cart/cart-view.tsx` 489 (إجمالي المصدر 14,383 سطراً). **الرأي:** `menu-view.tsx` يجمع 6 مسؤوليات (polling، سلة، لغة، بحث، شجرة الأقسام، بطاقة المنتج/الشريحة) في ملف واحد بـ`useMemo`/`useEffect` متشابكة؛ يُفهم لكن كل تعديل يلمس ملفاً حرجاً لمسار الزبون بلا اختبارات وحدة. **قبل التسليم:** فصل `usePolling`, `ProductCard`, `CategoryChips`, `SearchPanel` إلى ملفات (≈ 3 ساعات، بلا تغيير سلوكي)، والأهم إضافة اختبار واحد لعقد الـpolling (موجود جزئياً في `smoke-polling-contract.mjs`). بقية الملفات ضمن 500 سطر ومقبولة | `wc -l` |
| 24 | سيناريو الذروة | **محسوب من الأرقام المقاسة** | انظر §3.2 | — |
| 25 | سكربت الحمل | **مكتوب** | `scripts/load/diner-session.k6.js` — يحاكي الجلسة المقاسة بدقة (HTML → manifest → sw.js → إعادة جلب SW → prefetch كامل لكل بطاقة → poll/30s → صفحتا منتج → سلة → track) بمعامل `DINERS`. التشغيل على staging: `k6 run -e BASE=https://staging… -e SLUG=… -e DINERS=60 -e DURATION=10m scripts/load/diner-session.k6.js` | — |

---

## 2. ما تغيّر من CAPACITY_REPORT.md (القديم → الجديد)

| الرقم | القديم (تقدير) | الجديد (مقاس) | الأثر |
|---|---|---|---|
| استدعاءات الدوال لكل زيارة 5 دقائق | ≈ 36 | **≈ 62** (كل بطاقة = طلبان: `/_tree` + RSC كامل؛ 20 بطاقة لقسمين = 40 طلباً وحدها) | ×1.7 |
| استعلامات DB لكل زيارة | ≈ 160 | **≈ 190** (36 تصييراً كاملاً × 5 + polls 40 + track ≈ 14) | ×1.2 |
| Edge Requests لكل زيارة | ≈ 55 | **≈ 98** (62 دالة + 27 static أولى + 20 صورة) | ×1.8 |
| HTML gzip | 15–20KB | **10.0KB** | أقل |
| استجابة prefetch | «≈ 8KB» | **2.7KB على السلك** (8.9KB خام)، لكن بـ5 استعلامات | — |
| egress من Supabase لكل تصيير | 5KB (افتراض الضغط) | **52KB خام؛ Kong/PostgREST المحلي لا يضغط** حتى مع `Accept-Encoding` → **1.9MB/زيارة** إن لم تضغط سحابة Supabase (يُقاس بأمر في §5) | ×10 محتمل — يصبح أول عنق زجاجة مالي |
| Edge Requests على Pro | 10M مشمولة ثم $2/1M | **1M مشمولة، طبقات $20/10M، $100/50M، $300/150M، ثم $2–3.2/1M** | الكلفة تُعاد |
| حجم صف `events` | ≈ 140–150B | **189B** مع الفهرسين | +30% |
| صور المنتج (المصدر) | 20–30KB | **avg 64.7KB، p50 50.8KB** | ×2.5 (المُقدَّم 30–45KB) |
| Active CPU لكل زيارة | ≈ 0.75s (±2×) | **≈ 0.37s على i7 → ≈ 0.5–0.75s على vCPU** | مؤكَّد |
| max-rows | «غير مؤكد» | **1000 مؤكَّد — تحليلات المستأجر تعرض 1000 من 8,900** | خطأ صامت مثبت |
| حدّ الرفع 1MB | «يفشل برسالة عامة» | **يفشل بلا أيّ رسالة (500 صامت)**؛ 800KB ينجح | أسوأ |
| تحديد معدّل التتبّع | «قد يُحظر» | **240 من 300 تُسقط بصمت** | مثبت |
| offline من الزيارة الأولى | «offline بعد أول زيارة متطلّب صلب» | **يعمل من الزيارة الثانية فقط** | فجوة مع PRD §4.7 |
| Provisioned Memory | «غير مؤكد» | محسوب من wall-time المقاس (§3) | — |
| Lighthouse LCP | — | **4.7s** (خطوط 326KB) | جديد |
| `.env.local` | — | **يشير إلى مشروع Supabase محذوف** | جديد — الخادم المحلي لا يعمل أصلاً |

---

## 3. جدول القدرة المحدَّث

### 3.1 الافتراضات المقاسة لكل زيارة (مطعم متوسط: 100 صنف، 30 صورة، 150 مسح/يوم = 4,500 زيارة/شهر، جلسة 5 دقائق، تصفّح قسمين = 20 بطاقة)

| البند | القيمة | المصدر |
|---|---|---|
| استدعاءات دوال | **62** = HTML 1 + إعادة جلب SW 1 + manifest 1 + polls 10 + `/_tree` 20 + RSC كامل 20 + prefetch سلة 2 + منتج 2 + سلة 1 + track 4 | جلسة Playwright المقاسة |
| عبارات SQL | **190** = 36 تصييراً كاملاً × 5 + polls 10 × 4 + track 4 × ≈ 3.5 | `pg_stat_statements` |
| DB → Vercel (خام) | 36 × 52.4KB = **1.9MB** (≈ 0.19MB إن ضُغط) | `db-timing` |
| Vercel → الزبون | أولى ≈ 1.4MB (705KB مقاس بلا صور + 20 صورة × 35KB) · متكرّرة ≈ 0.5MB · **متوسط 0.95MB** | Playwright `transferSize` + §11 |
| Edge Requests | **≈ 98** | proxy |
| Active CPU | **≈ 0.55s** (0.37s محلياً × 1.5) | `cpu-measure` |
| wall-time للدوال (لـProvisioned Memory) | iad1: 36 تصييراً × ≈ 250ms + 26 طلباً خفيفاً × 100ms ≈ **11.6s**؛ fra1: 36 × 40 + 26 × 15 ≈ **1.8s** | زمن محلي + RTT |
| صفوف `events` | 4 × 189B = **0.76KB** دائمة | §5 |

### 3.2 سيناريو الذروة (البند 24)

**مطعم كبير واحد:** 300 زبون/ساعة، 60 متزامناً، جلسة 5 دقائق.
- معدّل لكل زبون: 62 استدعاء / 300s = **0.21 طلب دالة/ث** (+ ≈ 0.16 static/صور)؛ 190 / 300 = **0.63 عبارة SQL/ث**؛ 1.9MB / 300 = **6.3KB/ث** من DB.
- 60 متزامناً: **≈ 12.4 استدعاء/ث (≈ 22 طلباً/ث مع الثوابت)**، **≈ 38 عبارة SQL/ث**، **≈ 380KB/ث** خام من DB. مع 1.4–3.1ms للعبارة على هذه الآلة (≈ 5ms على Micro تقديراً) = ≈ 190ms DB-time/ثانية ≈ **20% من نواة واحدة** — Micro يتحمّل مطعماً واحداً بارتياح. **الانفجار اللحظي:** فتح قسم = 10 تصييرات كاملة خلال ثانية (50 عبارة)؛ 60 زبوناً يفتحون أقساماً في نفس 10 ثوانٍ = **300 عبارة/ث** لحظياً.
- **50 مطعماً بهذا الحجم في نفس الساعة (رمضان/الجمعة):** 3,000 متزامن → **≈ 620 استدعاء/ث، ≈ 1,900 عبارة SQL/ث، ≈ 19MB/ث خام (≈ 68GB/ساعة) من DB**. pool 10 اتصالات × (1000ms / 5ms) = 2,000 عبارة/ث نظرياً → **Micro على الحافة أو يسقط** (CPU مشترك)؛ Supabase egress في ساعة واحدة = 68GB إن لم يُضغط. **الحكم:** بلا إصلاح prefetch هذا السيناريو يحتاج Small/Medium وتأكيد الضغط؛ بعد الإصلاح (36 → 16 تصييراً/جلسة) تنزل الأرقام إلى ≈ 850 عبارة/ث و8.5MB/ث.

### 3.3 الجدول الشهري — الكود الحالي، Pro + Pro، `fra1`

| المورد | لكل مطعم/شهر | 50 | 200 | 500 | 1000 | الحدّ / السعر | الكلفة 50 / 200 / 500 / 1000 |
|---|---|---|---|---|---|---|---|
| Invocations | 279K | 14M | 56M | 140M | 279M | $0.60/1M | $8 / $34 / $84 / $167 |
| Edge Requests | 441K | 22M | 88M | 220M | 441M | 1M مشمول؛ طبقات $20/10M، $100/50M، $300/150M؛ ثم $2–3.2/1M | **$100 / $300 / $440–700 / $880–1,400** |
| Data Transfer | 4.3GB | 215GB | 860GB | 2.15TB | 4.3TB | 1TB مشمول؛ الطبقات تشمل 50TB | $0 / $0 / (ضمن طبقة $100+) / (ضمن الطبقة) |
| Active CPU | 0.69h | 34h | 138h | 344h | 688h | fra1 $0.184/h | $6 / $25 / $63 / $127 |
| Provisioned Memory (2GB × wall) | 4,500 × 1.8s × 2GB / 3600 = 4.5 GB-h | 225 | 900 | 2,250 | 4,500 | fra1 $0.0152/GB-h | $3 / $14 / $34 / $68 (×6.4 لو بقيت `iad1`) |
| Supabase egress **إن لم يُضغط** | 8.4GB | 420GB | 1.7TB | 4.2TB | 8.4TB | 250GB مشمول؛ $0.09/GB | **$15 / $130 / $355 / $735** |
| Supabase egress **إن ضُغط** | 0.85GB | 43GB | 170GB | 425GB | 850GB | — | $0 / $0 / $16 / $54 |
| نمو DB/شهر (`events`) | 3.4MB | 170MB | 680MB | 1.7GB | 3.4GB | 8GB مشمول؛ $0.125/GB | تمتلئ 8GB بعد 47 / 12 / 5 / 2.4 شهراً |
| ذروة SQL/ث (10% من المطاعم في الذروة × 20 زائراً × 0.63) | — | 63 | 250 | 630 | 1,260 | Micro: يحتاج قياساً؛ نظرياً pool ≈ 2,000 | Micro / Micro / Small $15 / Medium $60 |
| Image transformations | ≈ 200 (مرة واحدة) | 10K | 40K | 100K | 200K | $0.05/1K | $0.5 / $2 / $5 / $10 |
| **المجموع التقريبي (Pro $20 + Pro $25 + ما سبق)** | | **≈ $180–195** | **≈ $550–560** | **≈ $1,050–1,320** | **≈ $2,000–2,650** | | |

الفارق الأكبر عن التقرير الأول: **Edge Requests** (طبقات Flat Rate بدل $2/1M بعد 10M) و**egress Supabase غير المضغوط**.

### 3.4 بعد الإصلاحات السريعة (إلغاء prefetch البطاقات + كاش CDN 10s للـpolls + `fra1` + تجميع الأحداث)

لكل زيارة: استدعاءات **≈ 10**، SQL **≈ 45**، Edge Requests ≈ 55 (polls من CDN تُحسب طلبات لكن ليست استدعاءات)، DB خام ≈ 0.3MB.

| المورد | 50 | 200 | 500 | 1000 |
|---|---|---|---|---|
| Invocations | 2.3M ($1) | 9M ($5) | 22.5M ($13) | 45M ($27) |
| Edge Requests | 12.4M → طبقة $20 | 50M → $100 | 124M → $300 | 248M → $500–800 |
| Active CPU | 6h ($1) | 23h ($4) | 56h ($10) | 113h ($21) |
| Supabase egress (خام) | 68GB ($0) | 270GB ($2) | 675GB ($38) | 1.35TB ($99) |
| DB (`events_daily` + حذف الخام بعد 90 يوماً) | ثابت | ثابت | ثابت | ثابت |
| ذروة SQL/ث | 15 | 60 | 150 | 300 |
| **المجموع** | **≈ $70** | **≈ $160** | **≈ $420** | **≈ $750–1,000** |

---

## 4. المخاطر الجديدة المكتشفة (بنفس شكل §7.1 من التقرير الأول)

| # | الخطر | الملف/الموضع | الأثر على القدرة | صعوبة الإصلاح | الأولوية |
|---|---|---|---|---|---|
| N1 | **`.env.local` يشير إلى مشروع Supabase محذوف** — التطوير والاختبارات (`npm test`) والـsmoke كلها معطّلة صامتاً | `.env.local` | لا قدرة — لكن أي قياس/اختبار محلي مستحيل حتى يُصحَّح | 5 دقائق (مفاتيح المشروع الحيّ أو staging) | **P0** |
| N2 | **egress Supabase غير مضغوط (مقاس محلياً)** → 52KB لكل تصيير بدل 5KB | Kong/PostgREST؛ `lib/menu.ts:189` (products بـ15 عموداً منها 3 أسماء + `custom_suggestion_ids`) | ×10 على أول حدّ يُصطدم به في Supabase Pro (250GB عند ≈ 30 مطعماً) | 15 دقيقة للتحقّق على الإنتاج (§5)؛ الحلّ الجذري هو تقليل التصييرات (prefetch/CDN) | **P0** |
| N3 | **كل بطاقة = تصيير كامل بـ5 استعلامات** (مثبت: 33 تصييراً في 90 ثانية لزائر واحد) | `menu-view.tsx:796` | مضاعف ×3 على DB و×1.7 على الاستدعاءات و×1.8 على Edge Requests | 1 ساعة | **P0** |
| N4 | **فشل رفع الصور > 1MB صامت** (500 بلا رسالة) — صور الهواتف الحديثة 2–5MB | `next.config.ts` (لا `serverActions.bodySizeLimit`) + `product-dialog.tsx:73` (لا catch للأخطاء المرمية) | أول ما سيشتكي منه كل مطعم؛ يبدو للمالك أن «الزر لا يعمل» | 2 ساعة: `bodySizeLimit: '4mb'` + تصغير على العميل + `try/catch` يعرض رسالة | **P0** |
| N5 | **تحليلات المستأجر تعرض 1000 صف فقط** (11% للمطعم المتوسط) | `analytics/page.tsx:43` + `max_rows = 1000` | أرقام خاطئة تُباع كميزة | 3 ساعات: RPC تجميعي (`GROUP BY day, kind, product_id`) | **P1** |
| N6 | **التحليلات تُسقط بصمت فوق 60 حدثاً/دقيقة/IP** — Wi-Fi المطعم وCGNAT | `rate-limit.ts:20`, `api/track/route.ts:28-31` | مطعم مزدحم = تحليلات ناقصة بلا إنذار | 1 ساعة: مفتاح `ip+slug` وحدّ 600/دقيقة، أو حدّ لكل `slug` | **P1** |
| N7 | **offline يعمل من الزيارة الثانية فقط** | `public/sw.js` (لا precache للـchunks عند `install`/`activate`) | يخالف PRD §4.7 «offline بعد أول زيارة» | 1 ساعة: في `activate` جلب chunks الصفحة الحالية (من `performance.getEntries` عبر `CACHE_PAGE`) | **P1** |
| N8 | **LCP 4.7s على slow-4G** بسبب 326KB خطوط (5 ملفات، منها 3 أوزان Mono غير مستخدمة في المنيو) | `app/layout.tsx:14-39` | تجربة أول فتح للـQR | 1 ساعة: `preload` للوزن العربي الواحد + تأجيل Mono إلى admin | **P2** |
| N9 | كائن اختبار في bucket الإنتاج (من هذا التدقيق) | `restaurants/11111111-1111-1111-1111-111111111111/products/6c18bb34-9af0-4c82-a140-238aba692fcf.webp` (311,692 بايت) | لا | حذف واحد (يحتاج موافقتك — §5) | P2 |
| N10 | **يتامى محتملون في R2**: 6 بادئات مطاعم مقابل قاعدة حيّة جديدة | البكت `mesa-os-lite` | 3.65MB اليوم — مهمل مالياً، لكن يشير إلى أن الحذف الناعم/المشروع القديم تركا صوراً | `scripts/load/r2-orphans.mjs` ثم حذف يدوي | P3 |
| N11 | **`pub-*.r2.dev` بلا كاش CDN ومحدود المعدّل** (لا `cf-cache-status`) | `R2_PUBLIC_URL` | Vercel Image Optimization يجلب المصدر مرة لكل variant؛ عند cache miss عالمي متزامن قد يُحدَّ | 30 دقيقة: دومين مخصّص للبكت | P3 |
| N12 | لا CORS على R2 → SW يخزّن استجابات opaque بما فيها 404 كـ«صورة» | `sw.js:238` | صورة مكسورة تبقى مكسورة offline | 15 دقيقة: سياسة CORS على البكت + `res.ok` في SW | P3 |
| N13 | `restaurants` بـ8 فهارس على جدول من عشرات الصفوف (2 مكرّران) | `0001:38-39` | كتابة إضافية فقط | 10 دقائق | P3 |

**تأكيد لما في التقرير الأول بلا تغيير في الأولوية:** #2 (كاش CDN للـpolls)، #3 (`fra1` — كل تصيير = رحلتان متسلسلتان مقاستان)، #9 (فهرس `events.product_id` — 81ms من 113ms عند الحذف)، #10 (لوحة المالك: `ORDER BY created_at` على `events` = seq scan + sort على القرص).

---

## 5. ما يحتاج مني (المالك)

1. **مفاتيح المشروع الحيّ أو staging في `.env.local`.** المشروع الحالي محذوف. الأفضل: مشروع Supabase **staging** منفصل (Frankfurt) وتشغيل الأربعة التالية عليه بلا خوف: `scripts/load/diner-session.k6.js` (k6، بمعامل `DINERS`)، `scripts/load/track-ratelimit.mjs`، `scripts/load/upload-limit.spec.mjs`، `scripts/load/r2-orphans.mjs`.
2. **على مشروع الإنتاج، من SQL Editor (SELECT فقط):** `scripts/load/readonly-db-stats.sql` — يعطي أحجام الجداول الحقيقية، pg_stat_statements، عدد اتصالات PostgREST (`pg_stat_activity`)، وEXPLAIN للاستعلامات الأربعة على العتاد الحقيقي.
3. **هل يضغط Supabase egress؟ (يحدّد ×10 في الفاتورة)** — من أي جهاز:
   ```
   curl -s -o /dev/null -D - -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>" -H "Accept-Encoding: gzip, br" \
     "https://nwtlkcruiadvvtrggold.supabase.co/rest/v1/products?select=*&limit=100" | grep -i -E "content-encoding|content-length"
   ```
   وجود `content-encoding: gzip|br` = مضغوط. ثم قارن رقم Egress في Usage بعد يوم تشغيل.
4. **قيمة `max_rows`:** Dashboard → Project Settings → API → «Max rows». إن كانت 1000 (الافتراض) فالبند N5 قائم.
5. **تأكيد الأعمدة المكشوفة لـanon على الإنتاج** (بديل اختباري الممنوع):
   ```
   curl -s -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>" "https://nwtlkcruiadvvtrggold.supabase.co/rest/v1/restaurants?select=password_hash,username&limit=1"
   ```
   المتوقّع: خطأ `permission denied for table restaurants` (42501). ونفسه لـ`tenant_sessions?select=token_hash`.
6. **حذف كائن الاختبار من R2** (أنشأه البند 13): `restaurants/11111111-1111-1111-1111-111111111111/products/6c18bb34-9af0-4c82-a140-238aba692fcf.webp` — من لوحة Cloudflare أو أخبرني لأحذفه بأمر واحد.
7. **قياس Micro الحقيقي:** شغّل k6 على staging بـ`DINERS=60` ثم `600` ثم `3000` لمدة 10 دقائق مع مراقبة Database → Reports (CPU, connections) — هذا الرقم الوحيد الذي لا يُقاس إلا على عتاد Supabase.
8. صلاحية `vercel` CLI أو مشروع Vercel لقياس `x-vercel-cache` على `/_next/image` وحجم النقل الفعلي بعد ضغط Brotli (البند 10 على الإنتاج).

---

## ملحق: الآثار المحلية والتنظيف

- Supabase المحلي أُوقف وحُذفت أحجامه (`supabase stop --no-backup`)؛ الحاويات صفر.
- الخادم والـproxy أُوقفا؛ `.next` أُعيد بناؤه بـ`.env.local` الأصلي (لا أثر لـ`127.0.0.1:54321` في `.next/server`).
- كتابات القاعدة **المحلية فقط** أثناء القياس: 5 جلسات، 95 صف `login_attempts`، 62 حدثاً من اختبار المعدّل، منتج اختبار واحد — كلها ماتت مع الحاويات.
- الكتابة الوحيدة على مورد إنتاجي: كائن R2 المذكور في §5.6.
- `git status`: الجديد فقط `CAPACITY_REPORT.md`, `VERIFICATION_REPORT.md`, `scripts/load/` (5 ملفات: `diner-session.k6.js`, `track-ratelimit.mjs`, `upload-limit.spec.mjs`, `r2-orphans.mjs`, `readonly-db-stats.sql`).
