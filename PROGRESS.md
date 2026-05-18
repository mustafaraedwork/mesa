# PROGRESS.md — سجل التقدم

> سطر واحد لكل جلسة عمل. آخر التحديثات في الأعلى. تفاصيل الـ checkboxes في `PHASES.md`.

---

## الحالة الحالية

- **المرحلة الحالية:** 🟢 خطة إكمال الإطلاق — كل الكود (دفعات ٠+١) مكتمل و`next build` أخضر؛ المتبقّي نشر + تحقّق يدوي (مهام Mustafa)
- **آخر إنجاز:** `next build` كامل ناجح — يؤكّد جاهزية المراحل ٢–٥ للإنتاج
- **التالي:** مهام Mustafa — repo على GitHub، نشر Coolify، أيقونات حقيقية، التحقّق اليدوي (المرحلة ٧)
- **عقبات/قرارات معلّقة:**
  - اسم الدومين (PRD §٩)
  - استراتيجية التسعير (PRD §٩)
  - **PRD §٤.٤ غلط:** الـ RLS يستخدم `auth.jwt() ->> 'role'` وهذا ما يشتغل في Supabase — صُحّح في `0002_owner_rls_app_metadata.sql` ليستخدم `auth.jwt() -> 'app_metadata' ->> 'role'` (يُستحسن تحديث الـ PRD)

---

## نسبة الإنجاز

| المرحلة | الحالة | تاريخ البدء | تاريخ الانتهاء |
|---|---|---|---|
| ١. البنية الأساسية | 🟡 جارية (Coolify deploy فقط) | 2026-05-08 | — |
| ٢. لوحة المالك | ✅ مكتملة (محلياً) | 2026-05-08 | 2026-05-08 |
| ٣. المنيو (Tenant) | 🟡 جارية (core ✅، dnd/suggestions/settings مؤجَّلة) | 2026-05-08 | — |
| ٤. الأوضاع | ✅ مكتملة (backend + tenant UI؛ diner UI في المرحلة ٦) | 2026-05-08 | 2026-05-08 |
| ٥. التصميم + QR | ✅ مكتملة (typecheck نظيف، يحتاج فحص بصري) | 2026-05-09 | 2026-05-09 |
| ٦. واجهة الزبون | ✅ مكتملة (verified runtime via Playwright) | 2026-05-09 | 2026-05-10 |
| ٧. PWA + Offline | ✅ مكتملة (typecheck نظيف، smoke جاهز، يحتاج تشغيل فعلي) | 2026-05-10 | 2026-05-10 |
| ٨. الاختبار والتحسين | 🟡 الأتمتة ✅، اليدوي مؤجَّل | 2026-05-13 | — |

**الرموز:** ⬜ لم تبدأ • 🟡 جارية • ✅ مكتملة • ⏸ متوقفة

---

## السجل اليومي

### 2026-05-17 (دفعة ٢ — المرحلة ٦: بناء الإنتاج)
- ✅ **`next build` كامل ناجح** — تجميع نظيف في 2.5s، TypeScript تمّ، كل الـ١٦ مساراً بُنيت، صفر أخطاء/تحذيرات. يؤكّد أن drag & drop ومكوّنات `@dnd-kit` (المرحلة ٥) تُبنى للإنتاج سليمةً
- ✅ **أيقونات حقيقية** — `gen-icons.mjs` أُعيد ليولّد كل الأيقونات من `public/logo.png` (شعار رمز QR): `icon-192/512`, `icon-512-maskable` (full-bleed)، `apple-touch-icon`، `app/icon.png`، و`app/favicon.ico` (ICO يلفّ PNG 48px). الشعار أُضيف لصفحة الهبوط
- 🚧 المتبقّي من المرحلة ٦ مهام Mustafa: نشر Coolify/DNS، تشغيل migrations + owner role، التحقّق على HTTPS
- ⏭️ التالي: المرحلة ٧ — التحقّق اليدوي على الأجهزة (Mustafa)

### 2026-05-17 (دفعة ١ — المرحلة ٥: السحب والإفلات)
- ✅ تنصيب `@dnd-kit/core@6` + `sortable@10` + `utilities@3` (الكلاسيكي المستقر — لا `@dnd-kit/react`)
- ✅ **server actions** — `reorderCategories` / `reorderProducts` في `menu/actions.ts`: فحص ملكية، رفض التكرار، `display_order = الفهرس` عبر `Promise.all`
- ✅ **مكوّن `sortable-list.tsx`** عام — `order` يحفظ ids فقط (تفاؤلي) ومحتوى العنصر يُقرأ من props دائماً (يتفادى تعفّن القوائم المتداخلة)؛ `key` مشتقّ من ids يعيد التركيب عند تغيّر الخادم
- ✅ **`menu-view.tsx`** — `SortableList` متداخل (سكاشن جذرية + منتجات كل سكشن + سكاشن فرعية)؛ مقبض سحب `GripVertical` في `CategoryHeader`/`ProductRow`؛ `reorder()` helper مع `router.refresh()`
- ✅ `smoke-modes.mjs` خطوة [7] (٣ assertions) — `display_order` يقود ترتيب Normal؛ كل الـ٣٠ assertion خضراء؛ typecheck + eslint نظيفان
- ⏭️ التالي: دفعة ٢ — المرحلة ٦ (أيقونات + deploy + build كامل)

### 2026-05-17 (دفعة ١ — المرحلة ٤: مفتاح show_unavailable_items)
- ✅ بطاقة "إعدادات المنيو" في صفحة `/admin/dashboard/design` — `<input type="checkbox">` native، لا تبويب رابع
- ✅ `design/page.tsx` يجلب العمود، `design-view.tsx` حالة + dirty + FormData، `saveDesign` يقرأه ويحفظه
- ✅ الفلتر في `lib/menu.ts` موجود مسبقاً — التبديل الآن يصل إليه؛ typecheck + eslint نظيفان
- ⏭️ التالي: المرحلة ٥ — drag & drop

### 2026-05-17 (دفعة ١ — المرحلة ٣: الأصناف المكمّلة)
- ✅ **server actions** — `addComplement`/`removeComplement` في `menu/actions.ts`: فحص ملكية الطرفين، منع ربط السكشن بنفسه، خطأ `UNIQUE` (23505) برسالة عربية
- ✅ **طبقة البيانات** — `lib/menu.ts`: query ثالثة لـ`complementary_categories`، حقل `complement_ids: string[]` على `MenuCategory`
- ✅ **الواجهة** — مكوّن جديد `complementary-section.tsx` أسفل `MenuView` (لا تبويب رابع): chips للمكمّلات + `<select>` للإضافة؛ `page.tsx` يجلب القائمة المسطّحة والروابط
- ✅ **الخطوة ٢** — `cart-view.tsx`: منتجات السكاشن المكمّلة بين الخطوتين ١ و٣؛ الترتيب الآن custom→complementary→random كاملاً
- ✅ `smoke-modes.mjs` خطوة [6] جديدة (٣ assertions) — كل الـ٢٧ assertion خضراء؛ typecheck + eslint نظيفان
- 🔵 حذف السكشن ينظّف `complementary_categories` تلقائياً عبر `ON DELETE CASCADE` (مؤكَّد من `0001_init.sql`)
- ⏭️ التالي: المرحلة ٤ — مفتاح `show_unavailable_items`

### 2026-05-17 (دفعة ١ — المرحلة ٢: الاقتراحات المخصّصة)
- ✅ **طبقة البيانات** — `lib/menu.ts` يجلب ويُصدِّر `suggestions_type` + `custom_suggestion_ids` في `MenuProduct`
- ✅ **واجهة نموذج المنتج** — `product-dialog.tsx`: `<select>` للنوع + checkboxes native للمنتجات المقترَحة (استثناء المنتج نفسه)؛ `MenuView` يسطّح الشجرة لـ`allProducts` ويمرّرها
- ✅ **server actions** — helper `resolveSuggestions` في `menu/actions.ts`: يتحقّق من ملكية كل ID، يُسقط self-id، `default` → `null`. مستدعىً من `createProduct`/`updateProduct`
- ✅ **الخطوة ١** — `cart-view.tsx`: المقترحات المخصّصة للأصناف في السلة قبل الـrandom fallback؛ helper `tryAdd` يمنع التكرار/غير المتوفر
- ✅ `smoke-modes.mjs` خطوة [5] جديدة (٤ assertions) — كل الـ٢٤ assertion خضراء على dev server؛ typecheck + eslint نظيفان
- ⏭️ التالي: المرحلة ٣ — الأصناف المكمّلة

### 2026-05-17 (خطة إكمال الإطلاق — دفعة ٠)
- ✅ **مراجعة كاملة للمشروع** + خطة مرحلية في `.scratch/launch-completion/plan.md` (٨ مراحل، ٤ دفعات) بعد اكتشاف توثيق لأنماط الكود وواجهة `@dnd-kit`
- ✅ **git** — `git init` + أول commit (`8267b9b`) كنقطة استعادة + `.gitattributes` (`eol=lf`) لمنع ضجيج CRLF. 🚧 إنشاء repo على GitHub معلّق (`gh` غير منصَّب — مهمة Mustafa)
- ✅ **صفحة `/`** — استُبدل boilerplate الـcreate-next-app بصفحة عربية RTL بسيطة (عنوان + جملة + رابط `/admin`)
- ✅ **ESLint: ٢٠ خطأ → صفر** — `no-unescaped-entities` (٤ ملفات، `&quot;`)؛ `set-state-in-effect` بإصلاح نظيف حيث أمكن (حذف حالة `logoUrl` الزائدة، حذف effect إعادة الضبط في `change-password-dialog` لصالح `key`) والباقي `eslint-disable` بتعليق "لماذا"؛ `purity` في `modes-view` بـblock-disable. ٣١ warning في `scripts/` مقبولة
- ✅ **`npm test`** — `scripts/run-smoke.mjs` يكتشف كل `smoke-*.mjs`، يصنّفها ويتخطّى ما تنقصه متطلباته بدل الفشل. التشغيل: ٦ نجح / ٠ فشل / ٧ مُتخطّى (تحتاج dev server)
- ✅ typecheck نظيف
- ⏭️ التالي: دفعة ١ — المرحلة ٢ (الاقتراحات المخصّصة)

### 2026-05-13 (مساءً — تجهيز النشر)
- ✅ **PRD §٤.٤ صُحّحت** — `auth.jwt() ->> 'role'` → `auth.jwt() -> 'app_metadata' ->> 'role'`. الكود محلياً يطابق منذ migration 0002؛ تحديث PRD يمنع linkage drift مستقبلاً. (الـ0001 يحتفظ بالـbug كـrecord تاريخي — معيار append-only للـmigrations)
- ✅ **Next standalone build**: `output: 'standalone'` في next.config.ts؛ التحقق المحلي عبر `npm run build` — `.next/standalone/server.js` يتولّد بحجم ~bundle traced، يجمع كل dependencies المستخدمة من node_modules تلقائياً (سما sharp و bcrypt و pdf-lib)
- ✅ **Dockerfile** متعدد المراحل: `node:22-alpine` لكل المراحل، `deps` يثبّت بـ`npm ci`، `builder` يبني مع تمرير الـpublic envs كـbuild args (يجب inline في Next)، `runner` ينسخ standalone+static+public، يشغّل غير-root، healthcheck على `/` كل ٣٠ث
- ✅ **`.dockerignore`** يستثني node_modules، .next، .git، envs، docs، scripts، tsbuildinfo — يقلّص build context من ~600MB لـ~7MB
- ✅ **`.env.production.example`** بـnaming كاملة + توضيح ما هو Build Args (Next inlines) vs Runtime (secrets)؛ NEXT_PUBLIC_APP_URL مثبّت على `https://qaema.app`
- ✅ **`DEPLOY.md`** دليل Coolify من ٨ أقسام: DNS Cloudflare → Coolify create app → env vars split (build/runtime) → first deploy → verification (٤ curl assertions + ٣ browser checks) → day-2 ops → known prod risks → pre-launch checklist
- 🚧 يتبقّى: provisioning VPS + Coolify UI + DNS عملياً (Mustafa)، secrets rotation، تصميم icon حقيقي، replacement لـlanding page placeholder بصفحة عربية بسيطة

### 2026-05-13 (مساءً — PNG icons للـPWA)
- ✅ **`scripts/gen-icons.mjs`** — يولّد PNGs من SVG inline عبر sharp: `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` (M بـsafe ratio 0.5 ليحترم 20% crop adaptive shapes)، `apple-touch-icon.png` (180×180). الخلفية `#327bb3`، الـforeground أبيض، Arial bold
- ✅ `app/r/[slug]/manifest.webmanifest/route.ts`: استُبدلت الـSVG entries بـ٣ PNG entries (any 192 + any 512 + maskable 512)
- ✅ `app/r/[slug]/layout.tsx`: `generateMetadata.icons` يشير لـ`icon-192.png` + `icon-512.png` + `apple-touch-icon.png`
- ✅ `public/sw.js`: rule #4 يلتقط الآن `/icon-*` و `/apple-touch-icon.png` (CacheFirst → STATIC_CACHE خارج الـ50-slot image LRU)
- ✅ typecheck نظيف، الـicons معاينتها صحيحة بصرياً
- ⚠️ placeholders فقط؛ التصميم النهائي يستبدلها قبل launch علني

### 2026-05-13 (بدء المرحلة ٨ — الأتمتة)
- ✅ **Lazy loading للصور** — أُضيف `loading="lazy" decoding="async"` على ٣ أماكن: `ProductCard` في menu-view، `CartRow` و `SuggestionCard` في cart-view. logo الـheader (above-the-fold = LCP) متروك eager عمداً
- ✅ **`scripts/smoke-rls.mjs`** — ١٦ assertion: anon لا يقرأ inactive restaurant/categories/products، tenant_sessions مخفي تماماً حتى لمطعم نشط (لا policy public)، updates/deletes تكون silent no-op (Postgres RLS standard) — تحقّق فعلي عبر إعادة قراءة الـrow بـservice role بعدها، inserts على categories/tenant_sessions تُرفض بـerror صريح، positive control يثبت إن الـactive يُقرأ
- ✅ **`scripts/smoke-delete-account.mjs`** — ٨ assertions: يُنشئ مطعم + ٣ أوبجكتس R2 تحت `restaurants/<id>/{logo,products}/`، يستدعي نفس logic الـ `deleteRestaurantImages` (ListObjectsV2 + DeleteObjects loop)، يتحقق إن الـprefix فاضي بعدها، ثم DB cascade يحذف restaurant + categories + products + tenant_sessions
- ✅ **`scripts/smoke-closing-revert.mjs`** — ١١ assertions تضيف فوق ما يغطّيه smoke-modes: **idempotency** (re-read بعد revert لا يغيّر شيئاً)، **race safety** (تبديل يدوي لـrush قبل الـrevert لا يُستَم بسبب `.eq('active_mode','closing')` في الـUPDATE)، **boundary** (ends_at قبل الـnow بـ50ms يفعّل الـrevert)
- ✅ typecheck نظيف بعد التغييرات
- 🚧 يتبقّى المرحلة ٨: Lighthouse score، install prompt على Chrome desktop + Android + iOS، DevTools Network=Offline reload — كلها يدوية، Mustafa يشغّل dev server ويجرّب
- ⚠️ **placeholder icon** لسه قائم — `public/icon.svg` يحتاج raster PNGs (192/512) قبل الإنتاج

### 2026-05-10 (مساءً — المرحلة ٧ PWA + Offline)
- ✅ **قرار stack:** hand-rolled vanilla SW بدلاً من Workbox/next-pwa — السبب: NetworkFirst في Workbox لا يفحص `navigator.onLine` افتراضياً، والـno-store contract الذي أصلح Bug #3 يحتاج لمنطق "cache يُقرأ فقط offline" مخصّص. كذلك next-pwa لا يدعم Next 16 رسمياً. SW النهائي ~١٢٠ سطر فقط — RULES §١ (البساطة)
- ✅ `public/sw.js`: ٤ caches (`mesa-static-v1`, `mesa-images-v1`, `mesa-api-fallback-v1`, `mesa-html-v1`)؛ كلها تُنظَّف من القديم في `activate`
  - **API (`/api/menu/*` + `/api/admin/state`)**: try network → نجاح: clone للـfallback cache + إرجاع الشبكة. فشل: لو `navigator.onLine === false` → cached. لو online → re-throw (الـpolling سيحاول مرة أخرى). الـcache يُملأ صامتاً لكن لا يُقرَأ إلا offline → الـno-store contract محفوظ
  - **Static** (`/_next/static/*`, fonts, icon, manifest): CacheFirst (immutable assets)
  - **Images**: CacheFirst LRU max ٥٠ — يدعم opaque cross-origin من R2
  - **Navigation** (`/r/*` HTML): NetworkFirst → fallback لآخر HTML cached من نفس الـpath، وإلا أحدث HTML من cache (للسلة → menu أو العكس)
- ✅ Scope: SW على `/sw.js` (root) لكن مقيّد بـ`Service-Worker-Allowed: /r/` في `next.config.ts` — admin/owner لا يُسجّلون SW أصلاً (لا يُرَكَّب `<SwRegister/>` على pages أخرى)
- ✅ `app/r/[slug]/manifest.webmanifest/route.ts`: dynamic JSON per-restaurant — `theme_color` من `primary_color`، `start_url`/`scope` = `/r/<slug>` (الـPWA installs per-restaurant)؛ icons بـ`/icon.svg` (placeholder)
- ✅ `app/r/[slug]/layout.tsx`: server component جديد. `generateMetadata` يُربط الـmanifest. `generateViewport` يجلب `primary_color` من DB ويضعه في meta `theme-color`. الـbrand fetch مُغلَّف بـ`React.cache()` لتفادي query مكرر مع `loadMenu`
- ✅ `sw-register.tsx`: client component، `useEffect` يستدعي `navigator.serviceWorker.register('/sw.js', {scope: '/r/'})`. يتجاهل non-localhost http silently. يُرَكَّب من الـlayout فقط
- ✅ `public/icon.svg`: placeholder بسيط (مربع أخضر، حرف M أبيض، rounded ٩٦px)؛ ⚠️ يحتاج raster PNGs (192/512) قبل الإنتاج لدعم Android install banner + iOS home-screen
- ✅ `scripts/smoke-pwa.mjs` (٧ assertions): seed → online navigate → SW يأخذ التحكم خلال ١٠ث (`clients.claim`) → manifest link/JSON صحيحان → theme-color meta = `#2563eb` → DB mutation تظهر في next API hit (no-store contract) → `setOffline(true)` → reload يرجع HTML cached → offline fetch لـ`/api/menu` يرجع cached body
- ✅ typecheck نظيف
- 🚧 لم يُختبر بصرياً بعد — Mustafa سيشغّل dev server ويجرّب: install prompt على Chrome desktop + DevTools Application tab (SW + manifest + caches) + Network throttle = Offline + reload

### 2026-05-10 (مساءً — جولة QA ثانية)
- 🟡 QA agent ادّعى Bugs #1+#2 لسه قائمة بعد الـCache-Control patch، مع repro details ("Network tab shows ZERO /api/menu requests"، "No dialog appears"). طُلب runtime test (Playwright) بدل grep
- ✅ تنصيب `@playwright/test` + chromium headless (~111MB)
- ✅ `scripts/smoke-runtime-polling.mjs`: متصفّح حقيقي يفتح `/r/<slug>`، يرصد `page.on('request')` لكل `/api/menu/<slug>`، ينتظر ٣٥ث، يتحقّق من ≥١ poll. ثم يحاكي `visibilitychange` ويتحقّق من refetch فوري. **النتيجة: ١ poll خلال ٣٥ث + ١ refetch عند العودة للظهور = الـpolling شغّال**. لا console errors
- ✅ `scripts/smoke-runtime-confirms.mjs`: متصفّح حقيقي مع cookie `mesa-tenant-token` مزروع مباشرة في DB، يفتح `/admin/dashboard/modes` مع Closing نشط، يضغط "تفعيل" → يلتقط T2 dialog ("تفعيل العادي سيُلغي عرض الإغلاق الجاري. متابعة؟")، dismiss → يتحقّق DB لسه closing، يضغط "تعديل العرض" → يلتقط T3 dialog مع remaining time ("ينتهي خلال 59د"). **النتيجة: T2 + T3 يظهران بالنص الصحيح**
- 🔵 **الخلاصة الصادقة:** الـsource كان سليم منذ Phase 4. الـCache-Control patch (الجولة السابقة) أصلح Bug #3 الحقيقي. Bugs #1+#2 الـQA ادّعاها كانت غير قائمة في الكود. الـruntime tests الآن تثبت ذلك بمتصفّح حقيقي ومراقبة شبكة فعلية — ليس grep
- 🔧 لا تغيير كود إضافي مطلوب لـPhase 6. Phase 7 جاهز للبدء

### 2026-05-10 (نهاراً — جولة QA أولى)
- 🟡 QA Phase 6: ٣ "bugs" مُبلَّغة. التتبّع الكودي أظهر:
  - **Bug #1 (T2 confirm مفقود)**: غير موجود في الكود — الـconfirm حاضر في `modes-view.tsx:84-91`. لا يصل المستخدم إليه فقط لو `state.active_mode !== 'closing'` لحظة الضغط — وهذا أثر جانبي للـBug #3
  - **Bug #2 (polling لا يعمل)**: الكود سليم — `setInterval(tick, POLL_MS=30_000)` + `document.hidden` guard + `visibilitychange` listener كلها موجودة في `menu-view.tsx:41-58` و`cart-view.tsx`
  - **Bug #3 (API/UI desync)**: السبب الحقيقي = headers ناقصة. `dynamic = 'force-dynamic'` يُلغي data cache بتاع Next.js لكن **لا يضع HTTP response cache headers** — متصفح/SW/proxy يقدر يخدّم الـpayload المخزّن
- 🔧 الإصلاح: أضيف `Cache-Control: no-store, no-cache, must-revalidate` + `Pragma: no-cache` على ردود `/api/menu/[slug]` و `/api/admin/state` (كل المسارات: 200 / 404 / 401)
- ✅ smoke جديد: `scripts/smoke-desync.mjs` — يكتب لـDB ثم يقرأ API مباشرة، يتحقق من header `no-store`، يقارن server_now بين قراءتين متتاليتين
- ✅ smoke جديد: `scripts/smoke-polling-contract.mjs` — يفحص شكل الـsource (POLL_MS=30_000 + visibilitychange + cache:'no-store' + cache headers على الـroutes) بدون الحاجة لـserver
- ✅ `smoke-modes.mjs` (Phase 4) لسه أخضر — ١٨ assertion
- ✅ `smoke-desync.mjs` أخضر — DB write→API read = ٩١٨ms، server_now يختلف بين قراءتين
- ✅ `smoke-polling-contract.mjs` أخضر — ١١ contract check
- ⚠️ ملاحظة: الـQA report ذكر "T2 confirm مفقود" و"polling لا يعمل" كأنهما bugs مستقلين — هذان غير مؤكدين في الكود؛ إذا ظهروا بعد الـheader fix، نبحث في cookie/restaurant_id mismatch أو UI race، لكن الـrepro الحالي يُفسَّر كله بالـHTTP cache

### 2026-05-09
- ✅ تأكيد المرحلة ٤ شغّالة end-to-end: `/api/menu/<slug>` يرجع شكل JSON متوقع، الـ١٢ قراراً (grill-me) كلها مطبّقة
- ✅ المرحلة ٥ — التصميم + QR كاملة:
  - `lib/currencies.ts`: ١٨ عملة (PRD §٣.١) + helpers (`isSupportedCurrency`, `currencyLabel`)
  - `app/admin/dashboard/design/page.tsx`: server fetch لإعدادات المطعم + يمرّر `menuUrl` المحسوب من `NEXT_PUBLIC_APP_URL`
  - `design-view.tsx`: form تفاعلي بـcontrolled state — display_name + color pickers (input[type=color] جنب hex text) + currency select + logo upload/replace/remove
  - **Live Preview** inline (mock card بألوان المطعم وlogo placeholder) — يتحدّث فوراً، لا iframe
  - زر حفظ مفعّل فقط لو `dirty`؛ بعد الحفظ ينظّف logoFile/removeLogo + `router.refresh()`
  - logo preview محلي للملف المختار عبر `URL.createObjectURL` + cleanup في useEffect
  - `actions.ts → saveDesign(FormData)`: validation كامل (hex regex، currency allowlist، 100 char limit للاسم)؛ يحذف اللوغو القديم من R2 بعد نجاح الـDB update فقط
  - `qr-section.tsx`: canvas يرسم الـQR عبر `QRCode.toCanvas` (errorCorrectionLevel='M', 240px)؛ نسخ الرابط (Clipboard API) + تحميل PNG (canvas.toDataURL)
  - `app/api/admin/qr-pdf/route.ts`: `requireTenant` ثم `QRCode.toBuffer` (1200px PNG) ثم `pdf-lib` لبناء A4 (595.28×841.89pt) — اسم المطعم بـHelvetica (sanitized لـASCII لأن Helvetica لا تدعم العربية) + subtitle "Scan to view menu" + QR ٣٨٠pt مركزي + الرابط أسفله
  - reuse `uploadProductImage` للـlogo بـprefix مختلف (`restaurants/<id>/logo`) — نفس خط الأنابيب sharp 800×800 WebP، تجنّب تجريد جديد (RULES §١)
  - typecheck نظيف
- 🚧 لم يُختبر بصرياً بعد — Mustafa سيشغّل dev server ويجرّب color pickers، live preview، logo upload، QR display، PDF download

- ✅ المرحلة ٦ — واجهة الزبون كاملة:
  - **Refactor:** استُخرج `lib/menu.ts → loadMenu(slug)` كمصدر وحيد للـpayload؛ الـAPI route + الصفحة الـserver كلاهما يستهلكها (single source of truth، تجنب fetch داخلي)
  - `lib/cart.ts`: localStorage cart بصيغة `{product_id, quantity}` فقط (Q5 — لا snapshot للسعر)؛ TTL ساعتان عند `getCart`؛ cross-tab sync عبر `storage` event + same-tab عبر `mesa-cart-change` custom event
  - `lib/i18n.ts`: `Lang = 'ar'|'en'|'ku'` + `pickName(item, lang)` مع fallback للعربي + dictionary للـUI labels (٢٠ string لكل لغة)
  - `app/r/[slug]/page.tsx` (server): يستدعي `loadMenu`؛ لو null → `<ClosedScreen/>` (للـmissing/inactive)؛ غير ذلك → `<MenuView/>`
  - `closed-screen.tsx`: RTL، أيقونة كبيرة، رسالة عربية فقط (لا نعرف لغة الزبون قبل ما يدخل)
  - `menu-view.tsx` (client): Header sticky بألوان المطعم + لوغو/أحرف placeholder + language switcher pill؛ tree builder للسكاشن (parent_id → children)؛ ProductCard بـimage/placeholder/خصم badge/strikethrough/أيقونة وقت تحضير؛ FloatingCart يُخفى لو فاضية؛ polling ٣٠ث عبر `setInterval` + `visibilitychange` (إيقاف عند tab مخفي)
  - `cart/page.tsx` + `cart-view.tsx`: السعر pulled live من الـmenu (Q5) — polling ٣٠ث؛ resolved cart يربط `{product_id, qty}` بمنتجات الـmenu، يسقط المحذوف؛ qty controls (+/–/حذف)؛ المجموع بالعملة المحلية
  - **Suggestions algorithm**: random من سكاشن غير ممثلة في السلة، استثناء الـin-cart والـunavailable، الترتيب يأتي مفروزاً من API (per-mode)؛ steps 1 (custom) و 2 (complementary) معطّلتان لحين بناء UI الإعدادات في المرحلة ٣
  - **"اقرأ للنادل" modal**: full-screen على الموبايل، rounded على الديسكتوب؛ الكميات بـ`×N` ضخمة (text-2xl)؛ زر مسح السلة + زر العودة
  - typecheck نظيف
- 🚧 لم يُختبر بصرياً — Mustafa سيشغّل dev server ويجرّب: تبديل اللغة، إضافة منتجات، فتح السلة، modal الـwaiter، closing mode (بادج الخصم + سكشن "عروض اليوم")، صفحة المطعم المعطّل

### 2026-05-08
- ✅ تشغيل `setup-matt-pocock-skills` — أُنشئت `docs/agents/{issue-tracker,triage-labels,domain}.md` وأُضيف `## Agent skills` إلى `CLAUDE.md` (issue tracker = local markdown، single-context)
- ✅ جلسة `grill-me` على Closing Mode — حُسمت ١٢ قراراً معمارياً (السعر derived، lazy revert بدون cron، virtual category في الـAPI، إلخ)
- ✅ كُتبت قرارات Closing في `.scratch/closing-mode/design-decisions.md` (status: ready-for-human)
- ✅ إصلاح تناقض في `CLAUDE.md`: "≤3s" → "within one polling cycle, ≤30s typical"
- ✅ تشغيل `to-issues` — تكسير قرارات Closing إلى ٣ شرائح عمودية في `.scratch/closing-mode/issues/01..03.md` (status: ready-for-agent)
- ✅ بدء المرحلة ١: scaffold Next.js 16.2.6 + TypeScript + Tailwind v4 + App Router (سُكّب في temp dir ثم نُسخ إلى الجذر للحفاظ على docs)
- ✅ shadcn/ui init + المكونات الأساسية (button, input, dialog, table, card)
- ✅ Prettier + `prettier-plugin-tailwindcss` + script `npm run format`
- ✅ هيكل المجلدات: `app/r/[slug]`, `app/admin`, `app/owner`, `lib/{supabase,r2,auth}`, `components/ui`
- ✅ `supabase/migrations/0001_init.sql` — الجداول الـ٥ + RLS policies (PRD §٤.٣ + §٤.٤)
- ✅ `lib/supabase/{server,client}.ts`, `lib/r2/upload.ts` (sharp 800×800 WebP), `lib/auth/{password,session}.ts`, `middleware.ts`
- ✅ `.env.local.example` بكل المتغيرات المطلوبة
- 🚧 ينتظر credentials: Supabase project + R2 bucket + Coolify/VPS
- ✅ Supabase: مشروع منشأ في Frankfurt + migration مطبّق (٥ جداول + RLS) + smoke test ناجح (insert/read/delete via service role)
- ✅ Next 16 deprecation: نقل `middleware.ts` → `proxy.ts` + استخراج `SESSION_COOKIE` لـ `lib/auth/cookie.ts` (لتجنّب `crypto` في Edge runtime)
- ✅ dev server يعمل بدون warnings: `/`, `/r/[slug]`, `/admin`, `/owner` كلها 200 + `/admin/dashboard` يعيد التوجيه 307 لـ `/admin?next=...`
- ✅ R2: token جديد (Read+Write scoped to bucket) → smoke test ناجح (PUT + public GET + DELETE)
- ⏸ النشر مؤجَّل بقرار Mustafa: سنبني المرحلة ٢ (لوحة المالك) أولاً ثم نعود لـ Coolify
- ⚠️ تنبيه أمان: مفاتيح Supabase service_role + R2 access key سُرِّبت داخل سجلّ المحادثة — يُستحسن تدويرها بعد انتهاء التطوير
- ✅ المرحلة ٢ — لوحة المالك مكتملة محلياً:
  - `/owner` صفحة دخول (server action + Cairo + RTL)؛ يرفض الحسابات بدون `app_metadata.role='owner'`
  - `proxy.ts` يحرس `/owner/dashboard/*` (Supabase getUser + role check)
  - `/owner/dashboard` overview (4 stat cards + recent 5)
  - `/owner/dashboard/accounts` جدول كامل + create/disable/change-pw/delete
  - حذف الحساب: تأكيد بكتابة الـslug + R2 image purge عبر `deleteRestaurantImages()` + DB cascade
  - تغيير الباسوورد يُلغي كل tenant_sessions للحساب فوراً
  - PRD §٤.٤ صُحّح في `0002_owner_rls_app_metadata.sql` (`auth.jwt() -> 'app_metadata' ->> 'role'`)
- ✅ المرحلة ٣ — لوحة العميل (core):
  - `/admin` login: bcrypt verify + rate limit ٥/١٥د (in-memory)؛ `last_login_at` يتحدّث؛ logout يحذف الـsession من DB ويُلغي الكوكي
  - timing-safe: حتى لو الـusername ما موجود، نشغّل bcrypt على dummy hash لمنع تسريب وجود الحساب من خلال زمن الاستجابة
  - `/admin/dashboard` shell: header (اسم المطعم + خروج + تحذير تعطيل) + sticky bottom nav (المنيو/الأوضاع/التصميم)
  - `/admin/dashboard/menu`: شجرة sub-categories بمستويين (التحقّق من القاعدة في server action)
  - Categories: create root/sub، edit، delete (يُنظّف R2 قبل الـcascade)
  - Products: create/edit مع رفع صورة → sharp 800×800 WebP → R2؛ toggle متوفر/غير متوفر؛ حذف يُنظّف الصورة
  - `/admin/dashboard/{modes,design}`: placeholder pages للمراحل ٤ و ٥
  - مؤجَّل في المرحلة ٣: drag-drop ترتيب، حقل suggestions_type + custom_suggestion_ids، complementary_categories، toggle show_unavailable_items
- ✅ المرحلة ٤ — الأوضاع كاملة (backend + tenant UI):
  - `lib/closing.ts`: `roundDiscountedPriceIQD` (Q2 IQD-only)، `applyDiscount(price, pct, currency)` مع جدول `ROUNDING_STEPS`، constants للـvirtual category
  - `setMode` server action: clean-and-apply transaction (Q6) لكل الأوضاع الأربعة + Q8 validation كاملة
  - `/admin/dashboard/modes`: ٤ بطاقات، T2/T3 confirms، closing dialog (multi-select بمعاينة قبل/بعد، خصم ٥/١٠/٢٠، مدة ١–٢٤، اختيار الكل)، countdown مع server_now offset
  - `GET /api/menu/[slug]` (public): تطبيق Q1 derivation، Q3 lazy auto-revert، Q4 virtual category في الأعلى، Rush/Profit sort داخل السكشن، Q11 defensive read، server-side filter للـ`show_unavailable_items=false`
  - `GET /api/admin/state` (10s polling Q10): يرجع 401 للـunauthed (مش redirect — fetch clients ما يفهموا HTML)
  - smoke test (`scripts/smoke-modes.mjs`) — ١٨ assertion كلها خضراء
  - **انحراف عن PHASES.md:** الـcron/scheduled task استُبدل بـlazy revert حسب التصميم المُحكَم — أبسط، صفر بنية تحتية إضافية

### 2026-05-07
- ✅ مراجعة الـ PRD كاملاً (٧١٥ سطر)
- ✅ إنشاء `CLAUDE.md` (للمساعدين القادمين)
- ✅ إنشاء `RULES.md` (القواعد التي لا تُكسر — البساطة أولاً)
- ✅ إنشاء `PHASES.md` (مراحل ١–٨ مفصّلة بـ checkboxes)
- ✅ إنشاء `PROGRESS.md` (هذا الملف)
- ⏭️ التالي: انتظار قرار البدء بالمرحلة ١

---

## قالب لإضافة جلسة جديدة

```markdown
### YYYY-MM-DD
- ✅ ما أُنجز (سطر مختصر)
- 🟡 ما بدأ ولم يكتمل
- 🚧 عقبات
- ⏭️ التالي
```
