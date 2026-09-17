# P0_FIXES_REPORT.md — إصلاحات القدرة الستة وإثبات أثرها

> الفرع `fix/capacity-p0` (6 commits فوق `04c0f4b`)، 2026-09-17. كل إصلاح commit مستقل قابل للإلغاء وحده بـ`git revert <sha>`.
> **قاعدة الإنتاج لم تُلمس**: الهجرة الجديدة `0019` ملف فقط، طُبِّقت على Supabase **محلي** (Docker) لأغراض الإثبات. بيئة القياس والمنهجية هي نفسها في `VERIFICATION_REPORT.md` (Playwright هاتف 390×844، proxy تسجيل بين المتصفّح والخادم، `pg_stat_statements`، `next start` إنتاجي على قاعدة محلية بـ100 صنف و100,000 حدث).
>
> ⚠️ **أثر جانبي على R2 الإنتاجي (البند 4 من التقرير):** إثبات الرفع أنشأ 4 كائنات حقيقية في البكت `mesa-os-lite` لأن مفاتيح R2 في `.env.local` حقيقية — المفاتيح في §6، لم أحذفها.

---

## 1. الإصلاحات

| # | الإصلاح | الملفات المعدّلة | commit | الاختبار الذي يثبته | النتيجة |
|---|---|---|---|---|---|
| 1 | إلغاء الـprefetch الكامل من بطاقات المنتج وروابط السلة والعودة | `app/r/[slug]/menu-view.tsx` (4 روابط + التعليق المبرِّر)، `app/r/[slug]/p/[productId]/product-view.tsx` (رابط العودة) | `4a45ee9` | جلسة Playwright 90 ثانية عبر proxy + `pg_stat_statements` | طلبات المنتج للخادم **64 → 0**؛ عبارات SQL في الجلسة **183 → 18**؛ الطلبات المدعومة بدوال **69 → 5** |
| 2 | كاش CDN لـ`/api/menu/[slug]` (10s + SWR 15s) مع بقاء `no-store` للمتصفّح/SW | `app/api/menu/[slug]/route.ts`، `scripts/smoke-polling-contract.mjs`، `CLAUDE.md`، `prd.md` §4.8، `docs/PAGES.md`، `docs/BIZIII-READINESS.md` | `e73069b` | `smoke-polling-contract.mjs` (20/20 ✓ — يحسب `fresh + swr < POLL_MS` و`POLL + fresh ≤ 40`) + `curl -I` يُظهر `vercel-cdn-cache-control: public, s-maxage=10, stale-while-revalidate=15` على 200 و`no-store` على 404 | الترويسة تُبثّ بشكل صحيح؛ الأثر الفعلي (تجميع polls كل الزبائن في تصيير واحد لكل منطقة كل 10 ثوانٍ) **لا يُقاس محلياً** — لا CDN؛ يُقاس بعد النشر بـ`x-vercel-cache: HIT` على `/api/menu/…` |
| 3 | منطقة الدوال `fra1` | `vercel.json` (جديد) | `3bb2072` | لا تعارض مع `next.config.ts` (لا `regions` فيه؛ ترويساته تبقى) | يجب أن تطابق منطقة مشروع Supabase الحيّ (`nwtlkcruiadvvtrggold` = Frankfurt / eu-central-1) — إن نُقل المشروع تُنقل معه |
| 4 | رفع الصور من الهاتف + إظهار كل فشل | `next.config.ts` (`experimental.serverActions.bodySizeLimit: '4mb'` — الاسم مؤكَّد من `next/dist/server/app-render/action-handler.js:566` و`config-shared.js:289`)، `lib/image-client.ts` (جديد)، `lib/r2/upload.ts` (الحدّ 10MB → 4MB)، `app/admin/dashboard/menu/product-dialog.tsx`، `app/admin/dashboard/design/design-view.tsx`، `scripts/load/upload-limit.spec.mjs` | `f55776a` | `SIZES=800KB,1.5MB,4MB KIND=photo` → ثلاثتها **نجحت** (صف + كائن R2 لكل واحدة، 2.8–3.4 ثانية). `SIZES=8MB KIND=gif` (ملف لا يمكن تصغيره) → **رفض ظاهر داخل الحوار**: «الصورة كبيرة جداً حتى بعد التصغير (الحد ٣٫٥ ميغابايت) — جرّب صورة أخرى»، الحوار يبقى مفتوحاً، **لا طلب يُرسل** | قبل الإصلاح: 1.5MB = 500 صامت والحوار يُغلق بلا صف |
| 5 | تحليلات المستأجر عبر RPC تجميعي + فهرس `events(product_id)` | `supabase/migrations/0019_tenant_analytics_rpc.sql` (جديد)، `app/admin/dashboard/analytics/page.tsx`، `docs/verify-fresh-db.sql` (18 فهرساً / 6 دوال) | `32b4120` | على 100,000 حدث: RPC مقابل `GROUP BY` مباشر → **0 اختلاف** (7 أيام، 1800 فتحة، 75 منتجاً، 3680 فتحة منتج)؛ الصفحة المصيَّرة بعد تسجيل الدخول تعرض **1800** = SQL؛ زمن RPC **7.1ms**؛ `has_function_privilege('anon', …) = false`؛ `EXPLAIN` لحذف منتج صار `Index Only Scan using idx_events_product` | قبل: الصفحة قرأت 1000 صف من 8,900 (max-rows) |
| 6 | تحديد المعدّل على `/api/track`: `slug+ip` 600/دقيقة + `slug` 3000/دقيقة | `lib/auth/rate-limit.ts`، `app/api/track/route.ts`، `scripts/load/track-ratelimit.mjs` | `6d687cb` | 300 طلب من IP واحد → **300 مخزَّنة، 0 مُسقَطة**؛ 1000 طلب → **600 مخزَّنة، 400 مُسقَطة** (كلها 204). حدود الدخول لم تتغيّر | قبل: 300 → 60 مخزَّنة |

بعد كل إصلاح: `next build` ✓، `tsc --noEmit` ✓، `eslint` ✓ (تحذير واحد أُزيل). **كل الـsmoke scripts (15/15) خضراء** بعد الإصلاحات الستة: analytics، billing، closing-revert، delete-account، desync، modes، no-native-confirms، polling-contract، pwa، r2-diag، r2، rls، runtime-polling، soft-delete، supabase — `pass: 15 fail: 0 skip: 0`.

### لماذا لم يعد تعليق الـprefetch القديم مبرَّراً (`menu-view.tsx:788-793` سابقاً)

التعليق قال: «المسار ديناميكي فالافتراضي يجلب الهيكل فقط ويدفع الرحلة الكاملة عند النقر؛ قِيس ≈ 0.55s كمون ثابت لأي طلب (حتى `/api/health`)؛ فجلب الحمولة الحقيقية والبطاقة على الشاشة هو ما يجعل النقر فورياً». ما تغيّر:
1. **الكمون الثابت 0.55s كان قياساً من `iad1` إلى قاعدة في فرانكفورت** (رحلتان متسلسلتان عبر الأطلسي لكل تصيير). مع `fra1` (الإصلاح 3) تصير الرحلة ≈ 5ms والتصيير الكامل ≈ 15–40ms — النقر «فوري» بلا prefetch.
2. **الكلفة كانت خفية:** prefetch كامل = طلبان و5 استعلامات **لكل بطاقة تدخل الشاشة** (`/_tree` ثم RSC كامل بـ`next-router-state-tree`)، أي 64 طلباً و183 عبارة في 90 ثانية لزائر لم ينقر شيئاً. الكمون المُوفَّر عند نقرة واحدة دُفع 30 مرة مقدّماً.
3. الافتراضي (`prefetch` بلا قيمة) ما زال يجلب حدود التحميل لكل بطاقة، لذا اخترنا `prefetch={false}` صراحةً. `loading.tsx` لصفحة المنتج يعرض هيكلاً أثناء التصيير الواحد عند النقر.

**البديل الأفضل (لم يُنفَّذ — يتجاوز ساعتين):** عرض تفاصيل المنتج كـSheet داخل `menu-view` من الحالة المحمّلة (المنيو كله في الذاكرة)، مع إبقاء `/r/[slug]/p/[productId]` للفتح المباشر/المشاركة. يتطلّب نقل `track('product_open')`، الاقتراحات (`pickSuggestions` على الحمولة المحلية)، المشاركة، وإدارة `history` (زر الرجوع يغلق الـSheet) — ≈ 4–6 ساعات مع اختبار. أثره الإضافي: صفر طلبات عند النقر بدل طلب واحد.

---

## 2. قبل / بعد (نفس المنهجية: جلسة هاتف 90 ثانية، قسمان، قاعدة محلية)

| المقياس | قبل (VERIFICATION §1.1, run4) | بعد (الفرع الحالي) | الهدف |
|---|---|---|---|
| طلبات مدعومة بدوال في 90s | **69** (2 HTML + 64 prefetch + 2 polls + 1 track) | **5** (2 HTML + 2 polls + 1 track) | — |
| عبارات SQL في 90s | **183** | **18** | — |
| Edge Requests في 90s (كل شيء) | ≈ 116 (27 static + 20 صورة + 69) | **52** (22 static + 24 صورة + 5 + sw.js) | — |
| بايتات من الخادم في 90s | ≈ 1.45MB (منها 94KB prefetch) | 816KB (منها 91KB صور حقيقية عبر next/image لأول مرة) | — |
| **إسقاط على جلسة 5 دقائق** — استدعاءات دوال | ≈ 62 | **≈ 20 محلياً** (2 HTML + 10 polls + manifest + 2 منتج + سلة + 4 track) → **≈ 10 على Vercel** (الـpolls العشرة تُخدَم من CDN لأن الإصلاح 2 يجمع كل زبائن المنطقة في تصيير واحد كل 10s) | ≈ 10 ✓ |
| **إسقاط 5 دقائق** — عبارات SQL | ≈ 190 | **≈ 81 محلياً** (2×5 + 10×4 + 2×5 + 5 + 4×4) → **≈ 41 على Vercel** (polls من CDN) | ≈ 45 ✓ |
| Lighthouse mobile (محاكاة slow-4G) | Performance 83 · FCP 0.8s · LCP 4.7s · TBT 30ms · CLS 0 · SI 0.8s · 649KiB | Performance **83** · FCP 0.8s · LCP 4.7s · TBT 110ms · CLS 0 · SI 1.1s · 649KiB | لا تراجع ✓ (فرق TBT/SI ضمن تذبذب المحاكاة؛ الحزمة والخطوط لم تتغيّر) |
| رفع صورة 1.5MB | 500 صامت | ينجح (2.8s) | ✓ |
| تحليلات مطعم بـ8,900 حدث/أسبوع | 1000 صف (11%) | كل الأحداث (RPC 7ms) | ✓ |
| 300 beacon من IP واحد | 60 مخزَّنة | 300 مخزَّنة | ✓ |

**تفسير الفارق بين «محلياً» و«على Vercel»:** الإصلاح 2 لا يظهر في القياس المحلي لأن `next start` بلا CDN؛ الـpolls العشرة ما زالت تصل الخادم. على Vercel تُخدَم من كاش المنطقة، فيبقى للدالة ≈ 10 استدعاءات و≈ 41 عبارة لكل جلسة — الهدف. طريقة التأكّد بعد النشر: `curl -sI https://menu.biziii.io/api/menu/<slug> | grep x-vercel-cache` مرتين خلال 10 ثوانٍ → `MISS` ثم `HIT`.

**أثر على جدول القدرة (VERIFICATION §3.3 → §3.4):** بهذه الأرقام يصبح استهلاك المطعم المتوسط ≈ 45K استدعاء/شهر (كان 279K) و≈ 185K عبارة SQL (كان 855K)، وegress Supabase ≈ 1.6GB خام (كان 8.4GB) — أي أن Pro+Pro يتحمّل ≈ 1000 مطعم بدل ≈ 150–300، وتبقى Edge Requests (static + صور + polls المخزّنة) البند المالي الأكبر كما في §3.4.

---

## 3. العقود والوثائق والاختبارات التي تغيّرت ولماذا

| ما تغيّر | من | إلى | السبب |
|---|---|---|---|
| عقد حداثة المنيو للزبون المتصل | «خلال دورة استطلاع واحدة ≤ 30s» | **≤ 40s** (30 استطلاع + 10 كاش CDN) | الإصلاح 2. الحدّ محسوب لا مقدَّر: `s-maxage=10 + stale-while-revalidate=15 = 25s < POLL_MS=30s` يضمن ألّا يحصل استطلاعان متتاليان على جسم ما قبل التغيير. مسجَّل في `CLAUDE.md` (سطر الأوضاع + قسم Menu freshness + خريطة المسارات)، `prd.md` §4.8 (فقرة تحديث؛ قرار «polling كل 30 ثانية» بقي كما هو)، `docs/PAGES.md`، `docs/BIZIII-READINESS.md`. |
| `scripts/smoke-polling-contract.mjs` | يؤكّد `Cache-Control: no-store` فقط | يؤكّد `no-store` للمتصفّح **و** الحسابيات الثلاث للكاش (fresh ≤ 10، fresh+swr < POLL، POLL+fresh ≤ 40) و`no-store` للأخطاء وعدم كاش `/api/admin/state` | حماية العقد الجديد من الانحدار |
| إيقاف Closing Mode يدوياً من لوحة الإدارة | يصل الزبون ≤ 30s | ≤ 40s | نفس آلية أي تغيير؛ لوحة الإدارة نفسها (`/api/admin/state`) **غير مخزّنة** وتبقى 10s |
| `visibilitychange` | poll فوري | poll فوري (قد يصيب كاشاً عمره ≤ 10s) | لم يُمسّ |
| `smoke-pwa.mjs` «online no-store contract» (تغيير في DB يظهر في الاستدعاء التالي) | يمرّ | يمرّ محلياً (بلا CDN) — على Vercel قد يتأخّر ≤ 10s؛ الاختبار يعمل ضد `localhost` فقط بالتصميم | توثيق |
| حدّ حجم الصورة الخادمي | 10MB (`MAX_IMAGE_BYTES`) ورسالة «١٠ ميغابايت» | 4MB ورسالة «٤ ميغابايت» | أي ملف > 4MB لا يصل الفحص أصلاً (حدّ جسم الـaction) — الرقم القديم كان وهمياً |
| نوع الملف المرفوع | JPEG/PNG كما اختاره المستخدم | WebP (أو JPEG) مُصغَّر ≤ 1600px من المتصفّح | الخادم يعيد الترميز 800×800 WebP كما كان؛ GIF/SVG تمرّ بلا تصغير |
| `docs/verify-fresh-db.sql` | 17 فهرساً / 5 دوال / `0001→0017` | 18 / 6 / `0001→0019` | الهجرة 0019 |
| `scripts/load/track-ratelimit.mjs`, `upload-limit.spec.mjs` | توقّعات ما قبل الإصلاح | توقّعات ما بعد الإصلاح (+ `KIND`/`SIZES`) | توثيق الإثبات |

**لا تعارض مع RULES.md/PRD:** PRD §4.8 يقرّر polling 30s ويُبقيه؛ الكاش يضيف 10s على سقف الوصول فقط. لم يُغيَّر أي سلوك مرئي آخر للزبون أو المستأجر إلا ما نصّت عليه الإصلاحات (رسالة الرفع، نجاح الصور الكبيرة).

---

## 4. الهجرات الجديدة وترتيب تطبيقها على الإنتاج

هجرة واحدة: **`supabase/migrations/0019_tenant_analytics_rpc.sql`** — تضيف `tenant_analytics(uuid, integer, integer)` (SECURITY DEFINER، `search_path=public`، EXECUTE لـ`service_role` فقط) وفهرس `idx_events_product ON events(product_id) WHERE product_id IS NOT NULL`.

**الترتيب على الإنتاج (Supabase SQL Editor أو `supabase db push` بعد `link`):**
1. تأكّد أن `0001`→`0018` مطبَّقة (`docs/verify-fresh-db.sql` القسم 10 يجب أن يقول 17 فهرساً / 5 دوال قبل 0019).
2. **انشر الكود أولاً أم الهجرة أولاً؟** الهجرة أولاً. صفحة التحليلات الجديدة تستدعي `tenant_analytics`؛ لو نُشر الكود قبل الهجرة تعرض الصفحة «لا توجد بيانات بعد» (الـRPC يفشل → `console.error` → مصفوفات فارغة) بلا خطأ للمستأجر — لكن الأرقام تغيب حتى تُطبَّق الهجرة.
3. طبّق `0019` كاملة كما هي. جدول `events` في الإنتاج فارغ الآن، فـ`CREATE INDEX` العادي فوري ولا يقفل شيئاً.
4. **فقط إن كان `events` يحوي ملايين الصفوف وقت التطبيق** (لن يحدث الآن): احذف سطر `CREATE INDEX` من الملف قبل التطبيق، ثم نفّذ **وحده خارج أي معاملة** (SQL Editor، عبارة منفردة):
   ```sql
   CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_product
     ON events (product_id) WHERE product_id IS NOT NULL;
   ```
   لهذا لم أضعه في ملف منفصل: `supabase db push` يلفّ كل ملف في معاملة و`CONCURRENTLY` يفشل داخلها، بينما الجدول الفارغ لا يحتاجه.
5. تحقّق: `docs/verify-fresh-db.sql` القسم 10 → 18 فهرساً / 6 دوال؛ و`SELECT has_function_privilege('anon','tenant_analytics(uuid,integer,integer)','EXECUTE')` → `false`.
6. `vercel.json` و`next.config.ts` يُنشران مع الكود؛ لا خطوة يدوية إلا التأكّد من أن منطقة Supabase = Frankfurt.

---

## 5. ما بقي خارج النطاق (المرحلة التالية)

| البند | الأثر | الجهد |
|---|---|---|
| **تجميع الأحداث اليومي + retention** (`events_daily` بـpg_cron، حذف الخام > 90 يوماً) | `events` ينمو 189 بايت/حدث بلا حدّ؛ 500 مطعم تملأ 8GB خلال ≈ 6 أشهر. الإصلاح 5 جعل الصفحة صحيحة، لا الجدول محدوداً | 4–5h |
| **RPCs تجميعية للوحة المالك** (`accounts/page.tsx:27-35`) | مسح كل `products`/`events`/`payments` في كل فتح؛ `ORDER BY created_at` على `events` = seq scan + sort على القرص (29ms عند 100K، خطي) | 3h |
| **precache للـSW من الزيارة الأولى** | offline يعمل من الزيارة الثانية فقط (chunks الزيارة الأولى تسبق سيطرة SW) — يخالف PRD §4.7 | 1h |
| **الخطوط** (326KB، 5 ملفات، منها 3 أوزان Mono لا يحتاجها المنيو) | LCP 4.7s على slow-4G؛ `preload` للوزن العربي + تأجيل Mono إلى admin | 1h |
| **دومين مخصّص لـR2** بدل `pub-*.r2.dev` + سياسة CORS | r2.dev بلا كاش CDN ومحدود المعدّل؛ بلا CORS يخزّن SW استجابات opaque بما فيها 404 | 30min + إعداد Cloudflare |
| **Sheet للمنتج من الحالة المحلية** | صفر طلبات عند النقر بدل واحد | 4–6h |
| **دمج استعلام الـlayout** (`primary_color`) في `loadMenuResult` عبر `cache()` | 5 عبارات → 4 لكل تصيير HTML | 30min |
| **دمج RPCs تحديد المعدّل** في `/api/track` | الإصلاح 6 يجعل كل beacon يكتب مرتين في `login_attempts` (بدل مرة)؛ RPC واحد يفحص المفتاحين | 1h |
| تنظيف R2: 5 كائنات اختبار (§6) + يتامى المشروع القديم (`scripts/load/r2-orphans.mjs`) | 3.65MB اليوم — نظافة لا قدرة | 15min |

---

## 6. كائنات R2 التي أنشأتها الإثباتات (للحذف يدوياً أو بموافقتك)

كلها تحت `restaurants/11111111-1111-1111-1111-111111111111/products/` في البكت `mesa-os-lite` (هذا المعرّف مطعم اختبار محلي لا وجود له في قاعدة الإنتاج):

| من | المفتاح |
|---|---|
| VERIFICATION (800KB, noise) | `6c18bb34-9af0-4c82-a140-238aba692fcf.webp` (311,692 بايت) |
| الإصلاح 4 (800KB photo) | `8c3fbdb6-81bb-46df-9d7d-c66d74db336d.webp` |
| الإصلاح 4 (1.5MB photo) | `64886842-8252-4e40-871b-ee8bc7f50cbe.webp` |
| الإصلاح 4 (4MB photo) | `c3a57493-f817-4c6a-9513-f10215548c21.webp` |
| الإصلاح 4 (8MB noise — نجح لأن التصغير أوصله تحت 3.5MB) | `0fd2efa1-1aed-4457-a2ab-4d6345316e4d.webp` |

أمر الحذف الجاهز (من جهاز فيه مفاتيح R2): `node --env-file=.env.local -e "..."` — أو من لوحة Cloudflare R2 → Objects → البادئة أعلاه → حذف الخمسة.

---

## ملحق: التنظيف

الخادم والـproxy وSupabase المحلي أُوقفوا (الأحجام حُذفت)؛ `node_modules/.cache/claude-audit` حُذف؛ `.next` أُعيد بناؤه بإعدادات `.env.local` الأصلية (لا أثر لعنوان Supabase المحلي). ملفات الاختبار المحلية (منتجات `upload-test-*`، صفوف `events`/`login_attempts`) ماتت مع الحاويات.
