# جرد الصفحات — BIZIII Menu (mesa-os-lite)

> ⚠️ **مُحدَّث جزئياً 2026-08-30**: أُضيفت `/admin/suspended` (تعليق الاشتراك، هجرة
> `0016`)، وأُضيف عمود `restaurants.subscription_ends_at` وجدول `login_attempts`
> (`0015`). بقيّة الجرد أدناه من التدقيق الأصلي ولم يُعَد بناؤه بالكامل.
>
> مبني **قراءةً من الكود** على الفرع `feat/owner-panel` (آخر التزام `f2ca098`، 2026-06-07).
> لا يعتمد على `prd.md` ولا `CLAUDE.md` ولا أي وثيقة أخرى — راجع قسم «انحراف التوثيق» في
> `docs/BIZIII-READINESS.md`.

**الإطار**: Next.js 16.2.6 App Router · React 19.2.4 · TypeScript strict · Tailwind v4 + shadcn
**الحارس العام**: `proxy.ts` (كان `middleware.ts` قبل Next 16) — matcher: `/admin/dashboard/:path*` و `/owner/dashboard/:path*` فقط.
**لا يوجد** `basePath`، ولا توجيه حسب الـsubdomain، ولا i18n في المسار.

---

## 1) الأسطح العليا

| السطح | جذر المسار | المصادقة | عدد الصفحات |
|---|---|---|---|
| **public / diner** (الزبون) | `/`، `/r/:slug/*` | لا شيء | 5 |
| **app / tenant** (صاحب المطعم) | `/admin/*` | كوكي `mesa-tenant-token` + جدول `tenant_sessions` | 7 |
| **admin / owner** (المالك) | `/owner/*` | Supabase Auth + `app_metadata.role === 'owner'` | 6 |

---

## 2) السطح العام — الزبون

### 2.1 `/` — الصفحة التسويقية الداخلية

| البند | التفصيل |
|---|---|
| **الملفات** | `app/page.tsx` (27 سطر) · `app/layout.tsx` (root، خطوط + `lang="ar" dir="rtl"`) |
| **الحارس** | لا شيء — عامة |
| **مصادر البيانات** | **لا شيء** — صفحة ثابتة بالكامل |
| **الحقول** | `/logo.png` (104×105) · العنوان `BIZIII Menu` (`app/page.tsx:15`) · سطر وصفي عربي · زر → `/admin` |
| **الأفعال** | رابط واحد: «دخول أصحاب المطاعم» → `/admin` |
| **الحالات** | لا فارغ ولا تحميل ولا خطأ — لا شيء يُجلب |

> هذه هي الصفحة الوحيدة ذات الطابع التسويقي في المستودع، وهي بذرة فقط. لا يوجد
> hero ولا تسعير ولا صفحات تسويقية أخرى.

### 2.2 `/r/[slug]` — منيو الزبون (السطح الرئيسي)

| البند | التفصيل |
|---|---|
| **الملفات** | `app/r/[slug]/page.tsx` · `layout.tsx` (67) · `menu-view.tsx` (**868**) · `welcome-screen.tsx` (201) · `closed-screen.tsx` (23) · `_ui.tsx` (223، مكوّنات مشتركة) · `sw-register.tsx` (59) · `loading.tsx` (22) |
| **الحارس** | لا شيء. البوابة بياناتية: `loadMenu()` يُرجع `null` إذا `!rest \|\| !rest.is_active \|\| rest.deleted_at` (`lib/menu.ts:127`) → تُعرض `ClosedScreen` |
| **مصادر البيانات** | `lib/menu.ts → loadMenu(slug)` عبر **service-role client** (`lib/supabase/server.ts:7`). يقرأ 4 جداول: `restaurants` (`menu.ts:117`)، `categories`، `products`، `complementary_categories` (`menu.ts:154-170`) بالتوازي |
| **التحديث الحي** | استطلاع كل **30 ثانية** على `/api/menu/{slug}` (`menu-view.tsx:31 POLL_MS`, `:107`)، يتوقّف عند `document.hidden`، يستأنف على `visibilitychange` |
| **الحقول المعروضة** | ألوان البراند الخمسة كـCSS vars (`menu-view.tsx:36-49`) · `logo_url` · `display_name` · أقسام من مستويين (chips) · لكل منتج: `name_ar/en/ku`، `price`، `original_price` مشطوب + `discount_percent`، `image_url`، `prep_time_minutes`، `is_available`، نجمة `is_chef_pick` · قسم افتراضي «اختيارات الشيف» (`lib/closing.ts:23-31`) |
| **الأفعال** | اختيار اللغة (ar/en/ku) · «افتح المنيو» · تصفية بالقسم/القسم الفرعي · بحث نصّي · إضافة للسلة · مشاركة (Web Share + clipboard، `menu-view.tsx:245-252`) · فتح صفحة صنف · الذهاب للسلة |
| **التتبّع** | `track('menu_open')` مرة واحدة لكل جلسة تصفّح (مفتاح `sessionStorage: mesa-opened-{slug}`، `menu-view.tsx:263-268`) · `track('product_add')` عند الإضافة (`:257`) |
| **الحالات** | **welcome-screen** قبل البدء · **تحميل** `loading.tsx` هيكل عظمي · **مغلق** `ClosedScreen` · **منيو فارغ** `menu_coming_soon` / `no_menu` · **لا نتائج بحث** `no_results` · **offline** شريط `offline_banner` (`_ui.tsx`) |

### 2.3 `/r/[slug]/p/[productId]` — صفحة الصنف

| البند | التفصيل |
|---|---|
| **الملفات** | `page.tsx` (30) · `product-view.tsx` (201) · `loading.tsx` (21) |
| **الحارس** | عام. يبحث عن المنتج في الأقسام **غير الافتراضية** فقط؛ إن لم يوجد → `redirect('/r/{slug}')` (`page.tsx:27`) |
| **مصادر البيانات** | `loadMenu(slug)` — نفس الحمولة |
| **الحقول** | الصورة · الاسم (باللغة المختارة مع fallback عربي) · السعر/السعر المخفّض + الأصلي مشطوب · `prep_time_minutes` · عدّاد كمية |
| **الأفعال** | `+/-` كمية · إضافة للسلة (`product-view.tsx:43`) · رجوع (`router.back()` وإلا `/r/{slug}`) |
| **التتبّع** | `track('product_open')` عند التركيب (`:66`) · `track('product_add')` (`:44`) |
| **الحالات** | تحميل · إعادة توجيه عند صنف غير موجود · `ClosedScreen` |

> **لا يوجد** حقل وصف للصنف — لا في الجدول ولا في الواجهة.

### 2.4 `/r/[slug]/cart` — السلة + الاقتراحات

| البند | التفصيل |
|---|---|
| **الملفات** | `page.tsx` (16) · `cart-view.tsx` (**580**) · `loading.tsx` (21) |
| **الحارس** | عام |
| **مصادر البيانات** | `loadMenu(slug)` + السلة من `localStorage['mesa-cart-{slug}']` (`lib/cart.ts:11`، TTL ساعتان) · استطلاع 30 ث فوري عند التركيب (`cart-view.tsx:79-81`) لضمان أسعار حيّة |
| **الحقول** | لكل سطر: الاسم، السعر الحالي، الكمية، إجمالي السطر · المجموع الكلي · حتى **4** اقتراحات · نافذة «اطلب من الكابتن» |
| **خوارزمية الاقتراحات** | `cart-view.tsx:123-164` — (1) `custom_suggestion_ids` للأصناف من نوع `custom` (2) أصناف الأقسام المكمّلة (3) تعبئة من أقسام غير ممثَّلة في السلة. يُستثنى دائماً: ما في السلة + غير المتوفّر |
| **الأفعال** | `+/-` كمية · حذف سطر · إفراغ بخطوتين (`clearConfirm`) · إضافة اقتراح · فتح/إغلاق نافذة الطلب · رجوع |
| **الحالات** | **سلة فارغة** (`cart_empty` + زر رجوع) · تحميل · offline · `ClosedScreen` |

### 2.5 `/r/[slug]/manifest.webmanifest` — مانيفست PWA لكل مطعم

| البند | التفصيل |
|---|---|
| **الملف** | `app/r/[slug]/manifest.webmanifest/route.ts` (65) — Route Handler، `dynamic = 'force-dynamic'` |
| **الحارس** | عام |
| **البيانات** | `restaurants`: `slug, display_name, primary_color, background_color, is_active` |
| **المخرَج** | `name: '{display_name} — BIZIII Menu'`، `short_name: 'BIZIII'`، `start_url: /r/{slug}` **نسبي**، `scope: /r/{slug}` **نسبي**، `display: standalone`، `orientation: portrait`، `theme_color`/`background_color` من براند المطعم (بتحقّق HEX)، `lang: 'ar'`, `dir: 'rtl'`، 3 أيقونات مطلقة المسار |
| **ناقص** | لا يوجد حقل `id` |
| **الترويسات** | `Content-Type: application/manifest+json` · `Cache-Control: no-store` |

---

## 3) سطح المستأجر — `/admin`

**الحارس المشترك**: `proxy.ts:19-23` يتحقّق من **وجود** الكوكي فقط (بلا تحقّق من الجلسة — قرار تكلفة Edge)، ثم `requireTenant()` في كل layout/page/action يحوّل الكوكي إلى `restaurant_id` حقيقي عبر `tenant_sessions` (`lib/auth/require-tenant.ts:15`). الفشل ⇒ `redirect('/admin')`.

### 3.1 `/admin` — تسجيل الدخول

| البند | التفصيل |
|---|---|
| **الملفات** | `app/admin/page.tsx` (25) · `login-form.tsx` |
| **الحارس** | معكوس: إن كان الكوكي صالحاً → `redirect('/admin/dashboard')` (`page.tsx:10`) |
| **البيانات** | `getRestaurantIdFromCookie()` |
| **الحقول** | `username`، `password` |
| **الأفعال** | `signInTenant(formData)` — `app/admin/actions.ts:13` |
| **الحالات** | رسائل خطأ عربية: بيانات ناقصة / محاولات كثيرة من الجهاز / محاولات كثيرة للاسم / بيانات غير صحيحة / حساب معطّل. حالة `pending` أثناء الإرسال |

### 3.2 `/admin/dashboard` — إعادة توجيه

`app/admin/dashboard/page.tsx:4` → `redirect('/admin/dashboard/menu')`. لا واجهة.

**القشرة**: `layout.tsx` (37) — `requireTenant()`، ترويسة باسم المطعم + تحذير «الحساب معطّل من قِبَل المالك» عند `!isActive`، زر خروج، و`BottomNav` بأربعة تبويبات (`bottom-nav.tsx:7-12`).

### 3.3 `/admin/dashboard/menu` — إدارة المنيو

| البند | التفصيل |
|---|---|
| **الملفات** | `page.tsx` (86) · `menu-view.tsx` · `product-dialog.tsx` · `category-dialog.tsx` · `sortable-list.tsx` (dnd-kit) · `complementary-section.tsx` · `confirm-dialog.tsx` · `loading.tsx` · `actions.ts` (**467**) |
| **الحارس** | `requireTenant()` — `page.tsx:78` |
| **البيانات** | `categories` + `products` + `complementary_categories`، الثلاثة مُصفّاة بـ`.eq('restaurant_id', …)` (`page.tsx:18-33`)، ثم تُبنى شجرة من مستويين |
| **الحقول** | القسم: `name_ar` (إلزامي)، `name_en`، `name_ku`، `display_order`، `parent_id` · المنتج: الأسماء الثلاثة، `price`، `profit_percentage`، `prep_time_minutes`، `image_url`، `is_available`، `display_order`، `suggestions_type`، `custom_suggestion_ids` · الروابط المكمّلة |
| **الأفعال (11 server actions)** | `createCategory` · `updateCategory` · `deleteCategory` · `createProduct` · `updateProduct` · `setProductAvailable` · `deleteProduct` · `addComplement` · `removeComplement` · `reorderCategories` · `reorderProducts` |
| **الحالات** | `loading.tsx` · رسائل خطأ عربية لكل فعل · حوارات تأكيد لكل حذف (لا `window.confirm` — يفرضه `scripts/smoke-no-native-confirms.mjs`) |

### 3.4 `/admin/dashboard/modes` — الأوضاع

| البند | التفصيل |
|---|---|
| **الملفات** | `page.tsx` (76) · `modes-view.tsx` · `closing-dialog.tsx` · `chef-picks-dialog.tsx` · `countdown.tsx` · `mode-preview.tsx` · `loading.tsx` · `actions.ts` (169) |
| **الحارس** | `requireTenant()` — `page.tsx:17` |
| **البيانات** | `restaurants(active_mode, closing_mode_ends_at, closing_mode_discount, currency)` + `categories` + `products(is_in_closing_mode, is_chef_pick)` |
| **التحديث الحي** | استطلاع `/api/admin/state` كل **10 ثوانٍ** (`modes-view.tsx:128`) لكشف الانحراف بين الأجهزة |
| **الحقول** | ثلاث بطاقات وضع: **Normal** / **Closing** / زر «إيقاف كل الأوضاع» (`off`) · عدّاد تنازلي · نسبة الخصم (5/10/20) · المدة (1-24 ساعة) · اختيار متعدّد للمنتجات |
| **الأفعال** | `setMode({mode:'normal'\|'off'})` أو `setMode({mode:'closing', closing:{product_ids, discount, duration_hours}})` · `setChefPicks(productIds[])` |
| **الحالات** | أخطاء: منتج غير موجود / منتج لا يخصّ الحساب / سعر صغير جداً للخصم (مع `offending_ids`) · تحذير غير حاجب: عدد المنتجات غير المتوفّرة المختارة |

### 3.5 `/admin/dashboard/analytics` — تحليلات المطعم

| البند | التفصيل |
|---|---|
| **الملفات** | `page.tsx` (256) · `loading.tsx` |
| **الحارس** | `requireTenant()` — `page.tsx:30` |
| **البيانات** | `events` آخر 8 أيام (`.gte('created_at', since)`) + `products` + `categories`، كلها مُصفّاة بـ`restaurant_id` |
| **التوقيت** | بغداد UTC+3 ثابت بلا DST (`page.tsx:9 TZ_OFFSET`) |
| **الحقول** | مخطّط أعمدة: فتحات المنيو لآخر 7 أيام + الإجمالي · قائمة المنتجات مقسّمة **«بصورة» / «بدون صورة»** مع متوسّط الفتحات لكل مجموعة · لكل منتج: `opens7`، `adds7`، `addsToday`، اسم القسم |
| **الأفعال** | **لا شيء** — للقراءة فقط |
| **الحالات** | لا بيانات: «لا توجد بيانات بعد — شارك رابط المنيو…» (`page.tsx:116`) · تحميل |

### 3.6 `/admin/dashboard/design` — التصميم + QR

| البند | التفصيل |
|---|---|
| **الملفات** | `page.tsx` (52) · `design-view.tsx` (497) · `qr-section.tsx` (98) · `loading.tsx` · `actions.ts` (93) |
| **الحارس** | `requireTenant()` — `page.tsx:22` |
| **البيانات** | صف `restaurants` كامل التصميم + **`NEXT_PUBLIC_APP_URL`** لبناء `menuUrl` (`page.tsx:31-32`) |
| **الحقول** | `display_name` · العملة (18 خياراً، `lib/currencies.ts`) · 5 ألوان: أساسي/خلفية/هيدر/بطاقة/خط · اللوغو · `show_unavailable_items` · **رابط المنيو + رمز QR** |
| **الأفعال** | `saveDesign(formData)` · نسخ الرابط · تحميل PNG (من الـcanvas) · تحميل PDF A4 (→ `/api/admin/qr-pdf`) |
| **الحالات** | أخطاء التحقّق: اسم مطلوب/طويل، لون غير صالح (HEX سداسي)، عملة غير مدعومة، فشل رفع اللوغو · معاينة حيّة للألوان |

---

## 4) سطح المالك — `/owner`

**الحارس المشترك**: `proxy.ts:25-51` يستدعي فعلياً `supabase.auth.getUser()` ويتحقّق من `app_metadata.role === 'owner'`، **بالإضافة إلى** `requireOwner()` في كل صفحة وكل server action (`lib/auth/require-owner.ts:16`) — لأن الـServer Actions لا تمرّ عبر الـproxy.

### 4.1 `/owner` — دخول المالك

`app/owner/page.tsx` (31) + `login-form.tsx`. البيانات: `supabase.auth.getUser()` — إن كان المستخدم مالكاً → `redirect('/owner/dashboard')`. الحقول: `email`, `password`. الفعل: `signInOwner` (`app/owner/actions.ts:6`). الحالات: خطأ دخول، «هذا الحساب ليس لديه صلاحية المالك» (مع `signOut` فوري).

### 4.2 `/owner/dashboard` — نظرة عامة

| البند | التفصيل |
|---|---|
| **الملفات** | `page.tsx` (178) · `layout.tsx` (55) · `owner-nav-link.tsx` · `loading.tsx` |
| **الحارس** | `requireOwner()` — `page.tsx:16` |
| **البيانات** | كل صفوف `restaurants` + **كل** صفوف `payments` (`page.tsx:21-27`) |
| **الحقول** | 4 عدّادات: نشطة/معطّلة/محذوفة/الإجمالي · إجمالي الإيراد **لكل عملة على حدة** · «تجديدات تحتاج انتباهاً» (متأخّرة + خلال 30 يوم) · أحدث 5 مطاعم |
| **الأفعال** | روابط تنقّل فقط |
| **الحالات** | «لا دفعات مسجّلة بعد» · «لا متأخرات ولا تجديدات قريبة» · «لا توجد مطاعم بعد» |

### 4.3 `/owner/dashboard/accounts` — إدارة المطاعم

| البند | التفصيل |
|---|---|
| **الملفات** | `page.tsx` (80+) · `accounts-table.tsx` · `create-account-dialog.tsx` · `edit-restaurant-dialog.tsx` · `change-password-dialog.tsx` · `delete-account-dialog.tsx` · `actions.ts` (285) |
| **الحارس** | `requireOwner()` — `page.tsx:14` |
| **البيانات** | `restaurants` (كامل) + `products(restaurant_id)` + `categories(restaurant_id)` + `events` بحدّ **50,000** صف (`page.tsx:11 EVENTS_SCAN_LIMIT`) + `payments` (كامل) — كلها بلا تصفية، ثم تُجمّع في الذاكرة |
| **الحقول (`AccountRow`)** | `id, display_name, slug, username, is_active, deleted_at, created_at, last_login_at, last_event_at, plan, branch_count, currency, product_count, category_count, billing` |
| **الأفعال (7)** | `createAccount` (مع دفعة تأسيس اختيارية) · `updateRestaurant` · `setAccountActive` · `softDeleteAccount` · `restoreAccount` · `changeAccountPassword` (يُبطل كل الجلسات) · `deleteAccount` (حذف نهائي + مسح صور R2) |
| **الحالات** | حوارات تأكيد لكل عملية هدّامة · أخطاء تكرار slug/username (`23505`) · صفوف محذوفة معطّلة الأزرار |

### 4.4 `/owner/dashboard/accounts/[id]` — تفاصيل مطعم

| البند | التفصيل |
|---|---|
| **الملفات** | `[id]/page.tsx` · `restaurant-detail-actions.tsx` |
| **الحارس** | `requireOwner()` + تحقّق UUID وإلا `notFound()` (`page.tsx:33`) |
| **البيانات** | `restaurants` (صف واحد) + `categories` + `products` + **`tenant_sessions`** + `payments` + آخر حدث — كلها `.eq('restaurant_id', id)` |
| **الحقول** | الملف التعريفي · حالة الفوترة المشتقّة (`deriveBilling`) · شجرة الأقسام مع عدد المنتجات لكل قسم · عدد المتوفّر · **قائمة الجلسات النشطة** (`device_info`، `created_at`) · آخر دخول · آخر نشاط |
| **الأفعال** | نفس أفعال جدول الحسابات مطبّقة على هذا المطعم |
| **الحالات** | `notFound()` · لا دفعات · لا جلسات |

### 4.5 `/owner/dashboard/billing` — الفوترة

| البند | التفصيل |
|---|---|
| **الملفات** | `page.tsx` · `billing-view.tsx` · `record-payment-dialog.tsx` · `actions.ts` (98) |
| **الحارس** | `requireOwner()` — `page.tsx:16` |
| **البيانات** | كل `payments` + كل `restaurants` |
| **الحقول** | **دفتر الأستاذ**: مطعم، نوع (`initial/renewal/adjustment`)، مبلغ، عملة، تاريخ الدفع، نهاية الفترة، ملاحظة · **الإجماليات لكل عملة** · **لوحة التجديدات**: فقط `overdue` و`due-soon`، مرتّبة بأيام التجديد |
| **الأفعال** | `recordPayment(...)` · `deletePayment(id)` |
| **الحالات** | دفتر فارغ · لا تجديدات مستحقّة · أخطاء تحقّق (مبلغ، عملة، تواريخ، طول الملاحظة ≤200) |

### 4.6 `/owner/dashboard/analytics` — تحليلات المنصّة

| البند | التفصيل |
|---|---|
| **الملف** | `page.tsx` |
| **الحارس** | `requireOwner()` — `page.tsx:29` |
| **البيانات** | `restaurants` (حقول وصفية) + كل `payments` |
| **الحقول** | العدّادات · النمو الشهري لآخر 12 شهراً · الإيراد الشهري للعملة الأساسية · أعلى 3 أشهر · متوسّط الإيراد لكل مطعم · توقّعات التجديد · الإيراد حسب الخطة · التوزيع حسب `branch_count` |
| **الأفعال** | لا شيء |
| **الحالات** | `hasRevenue === false` → رسائل فارغة |

---

## 5) مسارات API

| المسار | الملف | الطريقة | الحارس | عند الفشل | الترويسات |
|---|---|---|---|---|---|
| `/api/menu/[slug]` | `app/api/menu/[slug]/route.ts` | GET | **عام** | 404 + رسالة عربية | `Cache-Control: no-store, no-cache, must-revalidate` + `Pragma` |
| `/api/track` | `app/api/track/route.ts` | POST | **عام** + حدّ 60 طلب/دقيقة لكل IP (`:27`) | **دائماً 204** (beacon — لا قارئ للخطأ) | `Cache-Control: no-store` |
| `/api/admin/state` | `app/api/admin/state/route.ts` | GET | كوكي المستأجر (`getRestaurantIdFromCookie`) | **401 JSON** (وليس redirect — العميل AJAX) · 404 إن لم يوجد المطعم | `no-store` |
| `/api/admin/qr-pdf` | `app/api/admin/qr-pdf/route.ts` | GET | `requireTenant()` | `redirect('/admin')` عبر الحارس · 404 إن لم يوجد الصف | `application/pdf` + `Content-Disposition: attachment` + `no-store` |
| `/api/health` | `app/api/health/route.ts` | GET | **عام** | لا يفشل — لا يلمس DB ولا R2 عمداً | `no-store` |
| `/r/[slug]/manifest.webmanifest` | route handler | GET | **عام** | يُرجع مانيفست افتراضياً حتى لو لم يوجد المطعم | `application/manifest+json` + `no-store` |

---

## 6) Server Actions (27)

### مستأجر (16)

| الملف | الفعل | الحارس |
|---|---|---|
| `app/admin/actions.ts:13` | `signInTenant` | — (تسجيل دخول) + حدّان للمعدّل |
| `app/admin/actions.ts:68` | `signOutTenant` | حذف الجلسة + الكوكي |
| `app/admin/dashboard/menu/actions.ts:52` | `createCategory` | `requireTenant()` |
| `…:106` | `updateCategory` | `requireTenant()` |
| `…:132` | `deleteCategory` | `requireTenant()` + تحقّق ملكية قبل تعداد الصور |
| `…:179` | `createProduct` | `requireTenant()` + تحقّق ملكية القسم |
| `…:263` | `updateProduct` | `requireTenant()` |
| `…:324` | `setProductAvailable` | `requireTenant()` |
| `…:337` | `deleteProduct` | `requireTenant()` |
| `…:364` | `addComplement` | `requireTenant()` + تحقّق ملكية القسمين |
| `…:395` | `removeComplement` | `requireTenant()` |
| `…:413` | `reorderCategories` | `requireTenant()` + upsert ذرّي |
| `…:441` | `reorderProducts` | `requireTenant()` + upsert ذرّي |
| `app/admin/dashboard/modes/actions.ts:25` | `setMode` | `requireTenant()` |
| `…:131` | `setChefPicks` | `requireTenant()` |
| `app/admin/dashboard/design/actions.ts:19` | `saveDesign` | `requireTenant()` |

### مالك (11)

| الملف | الفعل | الحارس |
|---|---|---|
| `app/owner/actions.ts:6` | `signInOwner` | — (تسجيل دخول، **بلا حدّ معدّل تطبيقي**) |
| `app/owner/actions.ts:28` | `signOutOwner` | — |
| `app/owner/dashboard/accounts/actions.ts:41` | `createAccount` | `requireOwner()` |
| `…:131` | `updateRestaurant` | `requireOwner()` + UUID |
| `…:198` | `setAccountActive` | `requireOwner()` + UUID |
| `…:213` | `softDeleteAccount` | `requireOwner()` + UUID |
| `…:229` | `restoreAccount` | `requireOwner()` + UUID |
| `…:240` | `changeAccountPassword` | `requireOwner()` + UUID |
| `…:266` | `deleteAccount` | `requireOwner()` + UUID |
| `app/owner/dashboard/billing/actions.ts:18` | `recordPayment` | `requireOwner()` + UUID |
| `…:86` | `deletePayment` | `requireOwner()` + UUID |

> **تحقّق مطابقة**: عدد استدعاءات `requireTenant()`/`requireOwner()` يساوي عدد الأفعال المصدَّرة في كل ملف — لا يوجد فعل غير محروس.

---

## 7) دوال قاعدة البيانات

| الدالة | الملف | الغرض |
|---|---|---|
| `revert_closing_mode(p_restaurant_id uuid)` | `supabase/migrations/0008_atomicity_rpcs.sql` | إرجاع وضع الإغلاق المنتهي في **معاملة واحدة**. يستدعيها `lib/closing.ts:64` مع fallback لتحديثين منفصلين إن لم تُطبَّق الهجرة |
| `categories_enforce_two_levels()` | `0009_db_hardening.sql:20` | trigger على `categories` يمنع مستوى ثالث |

**لا يوجد** cron ولا `pg_cron` ولا مهام مجدولة — الإرجاع «كسول» عند أول قراءة (`lib/menu.ts:138-147` و`app/api/admin/state/route.ts:50-59`).

---

## 8) الجداول (7)

| الجدول | الهجرة | RLS |
|---|---|---|
| `restaurants` | `0001` (+`0011` أضاف `plan`, `branch_count`, `deleted_at`؛ `0007` أضاف 3 ألوان) | «Owner full access» + **«Public read active»** (`is_active AND deleted_at IS NULL`) |
| `categories` | `0001` | Owner + Public read (عبر المطعم) |
| `products` | `0001` (+`0005` أضاف `is_chef_pick`) | Owner + Public read |
| `complementary_categories` | `0001` (+`0010` وحّد القيد بالمطعم) | Owner + Public read |
| `tenant_sessions` | `0001` | Owner فقط · `REVOKE SELECT (token)` من anon/authenticated (`0009:46`) |
| `events` | `0003` | Owner فقط |
| `payments` | `0011` | Owner فقط |

---

## 9) التخزين المحلي في المتصفّح

| المفتاح | النوع | الملف | الغرض |
|---|---|---|---|
| `mesa-cart-{slug}` | localStorage | `lib/cart.ts:11` | السلة، TTL ساعتان، تحقّق شكل عند القراءة |
| `mesa-lang` | localStorage | `menu-view.tsx:30` وغيره | اللغة المختارة |
| `mesa-opened-{slug}` | sessionStorage | `menu-view.tsx:265` | منع تكرار حدث `menu_open` |
| `mesa-sw-cleaned` | sessionStorage | `sw-register.tsx:27` | تنظيف SW في التطوير فقط |
| `mesa-tenant-token` | **كوكي httpOnly** | `lib/auth/cookie.ts:4` | جلسة المستأجر |
| `sb-*-auth-token` | كوكي (Supabase) | `@supabase/ssr` | جلسة المالك |

> **لا توجد أي كتابة كوكي على نطاق أب.** لا `document.cookie` في أي مكان، ولا خيار `domain:` في أي استدعاء `cookies().set()`.
