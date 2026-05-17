# PHASES.md — مراحل التنفيذ

> المرجع الأصلي: `prd.md` §٦. هذا الملف يفصّل كل مرحلة لمهام صغيرة قابلة للتعليم. علّم `[x]` فور الإنجاز.
> **التقدير الإجمالي:** ١٦–٢٤ يوم تطوير.

---

## المرحلة ١ — البنية الأساسية (٣–٤ أيام)

**الهدف:** مشروع يعمل محلياً، DB مع جداول، تخزين صور، auth أساسي.

### إعداد المشروع
- [x] `npx create-next-app@latest` — Next.js 16.2.6 + TypeScript + Tailwind v4 + App Router (CNA latest moved past Next 15)
- [x] تنصيب shadcn/ui + إضافة المكونات الأساسية (button, input, dialog, table, card)
- [x] إعداد ESLint + Prettier (الإعدادات الافتراضية كافية)
- [x] هيكل المجلدات: `app/r/[slug]`, `app/admin`, `app/owner`, `lib/`, `components/`

### Supabase
- [x] إنشاء مشروع Supabase (region: Frankfurt)
- [x] تشغيل migrations لإنشاء الجداول الـ ٥ (PRD §٤.٣) — `supabase/migrations/0001_init.sql`:
  - [x] `restaurants`
  - [x] `categories`
  - [x] `products`
  - [x] `complementary_categories`
  - [x] `tenant_sessions`
- [x] تطبيق RLS policies (PRD §٤.٤) — مدمجة في الـ migration
- [x] إنشاء `lib/supabase/server.ts` و `lib/supabase/client.ts`

### Cloudflare R2
- [x] إنشاء bucket (`mesa-os-lite`)
- [x] الحصول على Access Keys (Read+Write scoped to bucket)
- [x] إعداد public domain للـ bucket (`pub-…r2.dev`)
- [x] دالة `lib/r2/upload.ts` تستخدم AWS SDK v3

### Auth — البنية فقط
- [x] دالة `hashPassword` و `verifyPassword` بـ bcrypt
- [x] دالة `createSession` ترجع token ٦٤ حرف
- [x] middleware يقرأ httpOnly cookie ويُمرر `restaurant_id` — يُعيد التوجيه فقط لو ما في كوكي؛ الـ lookup للـ `restaurant_id` يحصل في كل API route عبر `getRestaurantIdFromCookie()` (انحراف مقصود لتقليل تكلفة الـ Edge)

### النشر
> 🟡 جاهز للتنفيذ (2026-05-13): الـDockerfile + standalone build + DEPLOY.md جاهزة. الدومين النهائي = `qaema.app`. التنفيذ الفعلي على VPS = مهمة Mustafa.
- [x] Next standalone (`output: 'standalone'` + Dockerfile multi-stage + .dockerignore + .env.production.example)
- [x] DEPLOY.md ٨ أقسام — Cloudflare DNS → Coolify create → env vars split → verification curls + browser checks → day-2 ops → known risks → pre-launch checklist
- [ ] إعداد Coolify على Contabo VPS (Mustafa)
- [ ] ربط الـ repo (Mustafa، GitHub private)
- [ ] متغيرات البيئة في Coolify UI (٣ build + ٦ runtime)
- [ ] أول deploy ناجح + cert Let's Encrypt

---

## المرحلة ٢ — لوحة المالك (١–٢ يوم)

**الهدف:** Mustafa يقدر ينشئ/يعطّل/يحذف حسابات.

- [x] `/owner` — صفحة دخول Supabase Auth (server action + Cairo font + RTL)
- [x] حماية `/owner/dashboard/*` بـ proxy يتحقق من `app_metadata.role = 'owner'` (PRD §٤.٤ كان غلط، صُحّح في `0002_owner_rls_app_metadata.sql`)
- [x] `/owner/dashboard` — صفحة Overview:
  - [x] إجمالي الحسابات / النشطة / المعطّلة
  - [x] إجمالي المنتجات والسكاشن
  - [x] أحدث ٥ حسابات
- [x] `/owner/dashboard/accounts` — جدول كامل (PRD §٣.٣)
- [x] إنشاء حساب جديد:
  - [x] form (display_name, slug, username, password) — slug يُولَّد تلقائياً من اسم المطعم ويمكن تعديله
  - [x] توليد password تلقائي + إمكانية تعديل (`lib/util/random-password.ts`)
  - [x] زر "نسخ بيانات الدخول" (Username + Password + Link)
- [x] تعطيل / تفعيل
- [x] تغيير password (يُلغي كل الجلسات الموجودة)
- [x] حذف حساب (تأكيد بكتابة الـslug + R2 image purge + DB cascade)

---

## المرحلة ٣ — لوحة العميل: المنيو (٣–٤ أيام)

**الهدف:** Tenant يدير سكاشنه ومنتجاته بالكامل.

### الدخول
- [x] `/admin` — صفحة دخول (username + password)
- [x] Rate limit: ٥ محاولات / ١٥ دقيقة (`lib/auth/rate-limit.ts` — in-memory sliding window؛ يُعاد ضبطه عند restart، وهذا مقبول للـMVP)
- [x] إنشاء session token + httpOnly cookie + redirect لـ `/admin/dashboard` (يحدّث `last_login_at` ويُصفّر عداد المحاولات بعد دخول ناجح)

### Layout الـ PWA
- [x] Bottom nav بـ ٣ أزرار (Menu / Modes / Design)
- [x] Header بسيط (اسم المطعم + زر خروج) — يُنبّه لو الحساب معطّل من المالك

### السكاشن (Categories)
- [x] قائمة السكاشن بالـ tree (parent + child)
- [x] إنشاء سكشن رئيسي (AR إجباري + EN/KU اختياري)
- [x] إنشاء سكشن فرعي تحت رئيسي (التحقّق من قاعدة الـ٢-level في الـ server action)
- [x] تعديل / حذف نهائي (الحذف يُنظّف صور R2 لكل المنتجات تحت السكشن وفروعه قبل الـcascade)
- [ ] Drag & Drop للترتيب (مكتبة `@dnd-kit/sortable`) — مؤجَّل

### المنتجات
- [x] قائمة المنتجات تحت كل سكشن
- [x] form كامل بكل الحقول (PRD §٣.١ جدول المنتجات) — ما عدا حقول الاقتراحات (مؤجَّلة)
- [x] رفع صورة → server action → sharp (800×800 WebP) → R2 → URL (التعديل يحذف الصورة القديمة؛ الفشل في الـDB بعد رفع صورة جديدة يحاول التراجع)
- [x] toggle متوفر/غير متوفر
- [x] حذف نهائي (يحذف الصورة من R2 قبل الصف)
- [ ] Drag & Drop للترتيب داخل السكشن — مؤجَّل

### الاقتراحات (مؤجَّلة)
- [ ] حقل `suggestions_type` (default / custom)
- [ ] لو custom: multi-select للمنتجات

### إعدادات المنيو (مؤجَّلة)
- [ ] السكاشن المكمّلة (matrix-style UI أو list)
- [ ] toggle `show_unavailable_items`

---

## المرحلة ٤ — الأوضاع (٢–٣ أيام)

**الهدف:** الأوضاع الـ ٤ تشتغل وتنعكس على واجهة الزبون.

- [x] صفحة `/admin/dashboard/modes`:
  - [x] عرض الـ ٤ بطاقات + المفعّل بحالة بصرية مميزة (`ring-primary` + شارة "نشط")
  - [x] زر تبديل لكل وضع (T2 confirm عند الانتقال من Closing نشط؛ T3 confirm عند إعادة تفعيل Closing)
- [x] منطق إعادة الترتيب في API layer (`/api/menu/[slug]`):
  - [x] Normal: `display_order ASC`
  - [x] Rush: `prep_time_minutes ASC` داخل كل سكشن
  - [x] Profit: `profit_percentage DESC` داخل كل سكشن
- [x] وضع الإغلاق (Closing) — حسب التصميم المُحكَم في `.scratch/closing-mode/`:
  - [x] form: multi-select منتجات + خصم ٥/١٠/٢٠٪ + مدة ١–٢٤ ساعة
  - [x] حفظ `closing_mode_ends_at`, `closing_mode_discount`, `is_in_closing_mode`
  - [x] Countdown timer مع تصحيح `server_now` offset (Q12)
  - [x] سكشن وهمي "عروض اليوم" في رد الـAPI (`__closing__`، display_order = -1)
  - [x] الأسعار derived عند القراءة (Q1)؛ يُرجع `price`/`original_price`/`discount_percent` لكل منتج بـClosing — الـUI يبني عليها strikethrough + شارة (Phase 6)
  - [x] Q11 defensive: إذا `is_in_closing_mode=true` لكن `active_mode != 'closing'`، الـAPI يتجاهل الـflag
- [x] **الرجوع التلقائي** بـ Lazy revert (Q3) — لا cron، لا pg_cron، لا scheduled task. يحصل inline في `GET /api/menu/[slug]` و `GET /api/admin/state` كلما حصلت قراءة بعد انتهاء الوقت.
- [x] التحقق من قاعدة "وضع واحد مفعّل" (single source of truth = `restaurants.active_mode`)
- [x] Q8 server-side validation: empty product_ids، خصم خارج {5,10,20}، مدة خارج [1,24]، منتج لا يخصّ الحساب (403)، منتج خصمه يصير صفر → يرجع `offending_ids`، منتج غير متوفر → warning غير حاجب
- [x] Q10 polling: `GET /api/admin/state` كل ١٠ث في dashboard المالك (يرجع 401 لو غير مسجل دخول، لا 307)
- [x] smoke test كامل (`scripts/smoke-modes.mjs`) — ١٨ assertion: Normal default، Closing activation، Q1 derivation، Q4 denormalization، Q6 clean-and-apply، Rush sort، Q3 lazy revert

---

## المرحلة ٥ — التصميم + QR (١–٢ يوم)

- [x] صفحة `/admin/dashboard/design`:
  - [x] color picker للـ primary (input[type=color] + hex text)
  - [x] color picker للـ background
  - [x] رفع/حذف لوغو (يمر بـ `uploadProductImage` بنفس خط الأنابيب — sharp 800×800 WebP → R2)
  - [x] حقل اسم المطعم
  - [x] dropdown العملة (الـ ١٨ من `lib/currencies.ts`)
- [x] Live Preview (component مشترك inline؛ يحدّث فوراً مع كل state change — لا iframe)
- [x] زر حفظ يطبّق التغييرات (مفعّل فقط لو dirty)
- [x] قسم QR:
  - [x] عرض الرابط الكامل + زر نسخ (Clipboard API)
  - [x] توليد QR على canvas في المتصفح (`qrcode` npm)
  - [x] تحميل PNG (canvas.toDataURL)
  - [x] تحميل PDF بحجم A4 (`/api/admin/qr-pdf` — pdf-lib + qrcode → buffer → A4 page)

---

## المرحلة ٦ — واجهة الزبون (٣–٤ أيام)

**الهدف:** صفحة المنيو والسلة كاملة بكل اللغات والاقتراحات.

- [x] `/r/[slug]` — صفحة المنيو:
  - [x] Header (لوغو + اسم + لغة) — sticky، ألوان أساسي
  - [x] تطبيق ألوان المطعم (background على الـmain، primary على الـheader/أزرار)
  - [x] قائمة السكاشن والمنتجات حسب الوضع المفعّل (الترتيب يأتي من API)
  - [x] سكشن "عروض اليوم" بالأعلى لو closing (مع 🔥 emoji)
  - [x] Cards للمنتجات (صورة + اسم + سعر + ⏱ وقت تحضير + شارة خصم)
  - [x] حالات "غير متوفر" حسب `show_unavailable_items` (server-side filter + opacity grayscale + كلمة "غير متوفر")
  - [x] placeholder graphic لو ما في صورة (لون أساسي بشفافية ١٥٪)
- [x] تبديل اللغة AR/EN/KU + fallback للعربي (`lib/i18n.ts` — `pickName` + dictionary للـlabels)
- [x] Floating Cart Button (عدد فقط — يُخفى لو السلة فاضية)
- [x] السلة المحلية (`lib/cart.ts`):
  - [x] localStorage key: `mesa-cart-{slug}`
  - [x] TTL ساعتان (تحقّق عند `getCart`)
  - [x] صيغة: `{ product_id, quantity }[]` فقط — لا snapshot للسعر (Q5)
  - [x] cross-tab sync عبر `storage` event + custom event للنفس tab
- [x] صفحة `/r/[slug]/cart`:
  - [x] قائمة الأصناف + كميات +/- + حذف
  - [x] المجموع الكلي
  - [x] السعر يُسحب من الـmenu API الحي (Q5) — polling ٣٠ث على نفس endpoint
  - [x] الاقتراحات (٣–٤):
    - [x] الخوارزمية: random من سكاشن خارج السلة (steps 1+2 معطلتان لحين بناء UI الـsuggestions/complementary)
    - [x] استثناء: الموجود بالسلة + غير المتوفر
    - [x] الترتيب حسب الوضع المفعّل (الترتيب يأتي مفروزاً من API)
- [x] شاشة "اقرأ للنادل" (modal كبير، نص ٢xl، يأخذ كامل الشاشة على الموبايل)
- [x] صفحة "المطعم غير متوفر" لو `is_active = false` (`closed-screen.tsx` — RTL، أيقونة كبيرة)
- [x] Polling كل ٣٠ ثانية للتحديث التلقائي (يُوقف تلقائياً لو الـtab مخفي)

---

## المرحلة ٧ — PWA + Offline (١–٢ يوم)

- [x] `manifest.webmanifest` للزبون — dynamic per-restaurant route (`app/r/[slug]/manifest.webmanifest/route.ts`)؛ theme_color من `primary_color`، scope/start_url مقيّدان بالـslug. **انحراف عن PHASES:** الـtenant dashboard لم يُعطَ manifest — قرار MVP: PWA install للزبون فقط (PRD §٤.٧)؛ tenant يستخدمها كـwebsite عادي
- [x] Service Worker (hand-rolled، vanilla JS — Workbox/next-pwa استُغنيا عنهما لأن الـno-store contract يحتاج لمنطق مخصّص لا يوفّره NetworkFirst افتراضياً):
  - [x] CacheFirst للـ static assets (`/_next/static/*`, `/fonts/*`, `/icon.svg`, `*.webmanifest`)
  - [x] **Online-aware NetworkFirst** للـAPI (`/api/menu/*` + `/api/admin/state`): الشبكة تفوز دائماً وأنت online؛ الـcache يُقرأ فقط لو `navigator.onLine === false` — يحفظ الـno-store contract الذي أصلح Bug #3
  - [x] CacheFirst للصور (LRU، max ٥٠) — يدعم opaque responses من R2
  - [x] NetworkFirst للـnavigation (HTML للـ`/r/*`) مع cache fallback offline
- [x] versioning — كل cache بـsuffix `-v1`، old caches تُحذف في `activate`؛ SW نفسه يُخدَم بـ`Cache-Control: no-cache` لتسريع التحديثات (لتفادي R3)
- [x] Service-Worker-Allowed: /r/ header في `next.config.ts` — يقصر الـSW على diner pages فقط؛ admin/owner لا يُسجّلون SW أصلاً
- [x] PWA registration component (`sw-register.tsx`) — client component يُرَكَّب من diner layout فقط
- [ ] اختبار install prompt على iOS + Android — مؤجَّل للمرحلة ٨ (يحتاج جهاز فعلي)
- [x] اختبار offline بعد أول زيارة (`scripts/smoke-pwa.mjs` — Playwright headless، ٧ assertions: SW activation + manifest content + theme_color meta + online no-store contract + offline reload + offline API fallback)
- [x] **PNG icons placeholders** — `scripts/gen-icons.mjs` يولّد `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` (safe zone 50%), `apple-touch-icon.png` (180×180) على `#327bb3` بحرف M أبيض. الـmanifest والـlayout يشيران للـPNGs. الـSW يضع كل الـicons في `mesa-static-v1` (خارج الـimage LRU). ⚠️ لسه placeholders؛ يحتاج تصميم حقيقي قبل launch علني

---

## المرحلة ٨ — التحسينات والاختبار (٢–٣ أيام)

- [ ] اختبار شامل (يحتاج جهاز فعلي — Mustafa):
  - [ ] أجهزة Android مختلفة
  - [ ] iOS Safari
  - [ ] متصفحات desktop (Chrome, Firefox)
- [x] اختبار الأوضاع:
  - [ ] التبديل اليدوي بين الـ ٤ (يدوي بصري — Mustafa)
  - [x] الرجوع التلقائي من Closing بعد انتهاء الوقت — `scripts/smoke-closing-revert.mjs` (idempotent + race-safe + boundary)
  - [x] انعكاس التغيير على الزبون خلال ٣ ثوان — `smoke-runtime-polling.mjs` (Phase 6 round 2: ١ poll/٣٥ث + refetch on visibilitychange)
- [ ] اختبار offline كامل (مغطّى عبر `smoke-pwa.mjs` headless؛ Mustafa يجرّب يدوياً DevTools Network=Offline)
- [x] اختبار RLS — محاولة قراءة بيانات مطعم آخر (R1) — `scripts/smoke-rls.mjs` (١٦ assertion: anon لا يقرأ inactive، tenant_sessions مخفي تماماً، writes تكون silent no-op، positive control يثبت إن الـactive يُقرأ)
- [x] Lazy loading للصور — `loading="lazy" decoding="async"` على ProductCard + CartRow + SuggestionCard. logo الـheader متروك eager (LCP candidate)
- [ ] Lighthouse score على صفحة المنيو (يدوي — Mustafa)
- [x] اختبار حذف حساب (التأكد من حذف صور R2) — `scripts/smoke-delete-account.mjs` (٨ assertions: 3 أوبجكتس R2 تُمسح + cascade لـcategories/products/sessions)

---

## ✅ معيار الانتهاء النهائي

كل مقاييس النجاح في PRD §٧ محققة:
- [ ] إنشاء حساب < دقيقة
- [ ] إضافة منتج < ٣٠ ثانية
- [ ] تحميل صفحة المنيو < ١.٥ ثانية على 3G
- [ ] offline يعمل ١٠٠٪ بعد أول زيارة
- [ ] تغيير وضع → ينعكس على الزبون < ٣ ثوان
