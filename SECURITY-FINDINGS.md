# SECURITY-FINDINGS

ملف تتبّع لنتائج مراجعة الأمان وطبقة Supabase لمشروع **Mesa OS Lite**.

- التاريخ: 2026-05-31
- المراجعون: `security-reviewer` + `database-reviewer` (تقرير فقط، بدون تعديل كود)
- البنود المُعلَّمة ✓✓ وجدها الوكيلان بشكل مستقل ومتطابق (ثقة عالية).
- **هذا ملف تتبّع فقط — لا يُصلِح أي كود.** حدّث عمود "الحالة" عند إصلاح البند.

---

## CRITICAL

| المعرّف | العنوان | الخطورة | الملف / السطر | الحالة | ملخص الإصلاح |
|---|---|---|---|---|---|
| C-1 | أكشنات المالك بلا تحقّق هوية داخلي — تجاوز كامل للوحة المالك (الـ proxy يحمي تنقّل الصفحات فقط، لا يحمي إرسال Server Actions) ✓ محقَّق | CRITICAL | `app/owner/dashboard/accounts/actions.ts` (كل الدوال) · `app/owner/dashboard/page.tsx` (`loadOverview`) · `app/owner/dashboard/accounts/page.tsx` (`loadAccounts`) | مفتوح | أنشئ `requireOwner()` يستدعي `getAuthServerClient().auth.getUser()` ويرفض إن `app_metadata.role !== 'owner'`، واستدعِه كأول سطر في كل أكشن مالك وفي `loadOverview`/`loadAccounts`. لا تعتمد على الـ proxy وحده. |
| C-2 | `setMode`/`setChefPicks`: كتابة `UPDATE` نهائية بلا قيد `restaurant_id` (service-role يتجاوز RLS؛ التحقق والكتابة غير ذرّيين) ✓✓ | CRITICAL | `app/admin/dashboard/modes/actions.ts:121-124` · `:163-166` | مفتوح | أضف `.eq('restaurant_id', restaurantId)` لكلا الكتابتين، مطابقةً لخطوة المسح أعلاهما. |
| C-3 | رفع الصور: لا حدّ للحجم ولا تحقّق MIME قبل تمرير البايتات لـ sharp (قنبلة فك‑ضغط / SVG / polyglot) | CRITICAL | `app/admin/dashboard/menu/actions.ts:205-212, 287-301` · `app/admin/dashboard/design/actions.ts:59-66` · `lib/r2/upload.ts:45-67` | مفتوح | افرض حدّاً أقصى للحجم (~10MB) وallowlist لنوع MIME (`jpeg/png/webp/gif`، ارفض `svg+xml`) قبل `uploadProductImage`؛ يفضَّل فحص magic-bytes لأول 12 بايت. |

---

## HIGH

| المعرّف | العنوان | الخطورة | الملف / السطر | الحالة | ملخص الإصلاح |
|---|---|---|---|---|---|
| H-1 | `profit_percentage` يُسرَّب لكل زبون في JSON المنيو العام (حقل داخلي، database-reviewer صنّفه Critical) ✓✓ | HIGH | `lib/menu.ts:37-38, 159, 206-209` → `app/api/menu/[slug]/route.ts` | مفتوح | احذف `profit_percentage` من `select()` ومن نوعَي `ProductRow`/`MenuProduct`؛ أبقِه على المسار الإداري المُصادَق فقط. (`prep_time_minutes` ظاهر للزبون فيمكن إبقاؤه.) |
| H-2 | `deleteCategory`: تعداد/حذف صور R2 لمطعم آخر — قيد `restaurant_id` ناقص و`id` العلوي غير مُتحقَّق من ملكيته ✓✓ | HIGH | `app/admin/dashboard/menu/actions.ts:143-145` | مفتوح | تحقّق أن `id` يخص `restaurantId` أولاً (`.eq('id',id).eq('restaurant_id',restaurantId).maybeSingle()`)، وأضف `.eq('restaurant_id', restaurantId)` لاستعلام الصور. |
| H-3 | Lazy-revert كتابتان غير ذرّيتين عبر جدولين (نافذة تسابق تنتج حالة وسطية — خلل UX) | HIGH | `lib/menu.ts:134-148` · `app/api/admin/state/route.ts:47-64` | مفتوح | دالة Postgres `revert_closing_mode(restaurant_id)` تنفّذ التحديثين داخل معاملة واحدة، تُستدعى عبر `sb.rpc(...)` من الموضعين. |
| H-4 | Rate limiting ضعيف/غائب: محدِّد في الذاكرة فقط، per-username بلا قيد IP؛ `/api/track` و`/api/menu` بلا حدّ | HIGH | `lib/auth/rate-limit.ts` · `app/api/track/route.ts` · `app/api/menu/[slug]/route.ts` | مفتوح | أضف bucket بمفتاح IP لتسجيل الدخول؛ حدّ IP لـ `/api/track` (~60/دقيقة)؛ ETag/304 لـ `/api/menu`؛ تنظيف دوري لجدول `events`. |
| H-5 | توكن الجلسة دائم بلا تدوير/إبطال/انتهاء (التوليد سليم: 256 بت CSPRNG؛ لكن التسرّب = وصول دائم؛ مقارنة غير ثابتة‑الزمن) | HIGH | `lib/auth/session.ts:9-11, 26-35, 44-56` | مفتوح | أضف `created_at` + حدّاً أقصى لعمر الجلسة؛ واجهة «الجلسات النشطة» مع زر إبطال؛ اختيارياً خزّن `SHA-256(token)` وقارن بـ `timingSafeEqual`. |

---

## MEDIUM

| المعرّف | العنوان | الخطورة | الملف / السطر | الحالة | ملخص الإصلاح |
|---|---|---|---|---|---|
| M-1 | لا CSP ولا ترويسات أمان عامة (تُضبط ترويسات `/sw.js` فقط) | MEDIUM | `next.config.ts` | مفتوح | أضف `headers()` لـ `/(.*)`: `X-Content-Type-Options: nosniff`، `X-Frame-Options: SAMEORIGIN`، `Referrer-Policy`، `Permissions-Policy`، وCSP قائم على nonce. |
| M-2 | `SameSite=lax` + تغيير حالة داخل GET (الـ lazy-revert يحدث في `GET` ويصله الكوكي عبر المواقع) | MEDIUM | `lib/auth/session.ts:31` · `app/api/admin/state/route.ts` | مفتوح | اجعل GET للقراءة فقط (انقل الـ revert لـ POST/RPC)؛ فكّر بـ `SameSite=Strict` لكوكي الـ tenant. |
| M-3 | سياسة RLS للمالك تكشف عمود `token` الخام في `tenant_sessions` (database-reviewer صنّفه Critical؛ خُفِّض لأنه owner-only موثوق) | MEDIUM | `supabase/migrations/0001_init.sql` (سياسة Owner full access) | مفتوح | استثنِ `token` عبر view أو column-level security، أو وثّق القرار صراحةً (المالك طرف موثوق). |
| M-4 | قيد المستويين للفئات مُطبَّق في كود التطبيق فقط (DB يسمح بأي عمق) | MEDIUM | `app/admin/dashboard/menu/actions.ts:61-73` · `supabase/migrations/0001_init.sql` | مفتوح | أضف trigger `BEFORE INSERT/UPDATE` على `categories` يرفض `parent_id` لصفّ والده غير NULL. |
| M-5 | فهارس/ترتيب: لا فهرس على `complementary_categories.restaurant_id`؛ منتجات `loadMenu` تُرتَّب في JS؛ فهارس جزئية مفقودة | MEDIUM | `supabase/migrations/0001_init.sql:89-96` · `lib/menu.ts:157-163, 177-178` | مفتوح | أضف `idx_complementary_restaurant`؛ استخدم `ORDER BY display_order` في الاستعلام بدل sort في JS؛ فهارس جزئية على `is_in_closing_mode`/`is_chef_pick`. |
| M-6 | ثغرات قيود المخطط: `UNIQUE(category_id, complement_id)` بلا `restaurant_id`؛ لا قيد يمنع `active_mode='closing'` مع `closing_mode_discount IS NULL` | MEDIUM | `supabase/migrations/0001_init.sql:31, 95` | مفتوح | أضف `restaurant_id` للـ UNIQUE؛ أضف CHECK متعدد‑الأعمدة يفرض وجود `discount`+`ends_at` عند الوضع closing. |
| M-7 | هشاشة `extractR2Key`: fallback عند غياب `R2_PUBLIC_URL` قد يستخرج مفتاحاً عشوائياً مع `catch {}` صامت | MEDIUM | `app/admin/dashboard/menu/actions.ts:466-474` · `app/admin/dashboard/design/actions.ts:89-96` | مفتوح | تحقّق أن `image_url` يبدأ بـ `R2_PUBLIC_URL` قبل أي حذف؛ ارمِ خطأً إن لم تُضبَط البيئة بدل الـ fallback. |
| M-8 | تحقّق UUID مفقود في أكشنات المالك + `secure` على الكوكي مشروط بـ `NODE_ENV` | MEDIUM | `app/owner/dashboard/accounts/actions.ts:54, 77` · `lib/auth/session.ts:30` | مفتوح | أضف فحص UUID للـ `id` عند حدود الدوال؛ وثّق منع استخدام بيانات الإنتاج في بيئة التطوير (HTTP). |

---

## ملاحظات

**أولويات الإصلاح قبل أي إنتاج:** C-1 → C-2 → C-3 → H-1.

**ما هو سليم (لا توجد ملاحظات):**
- مفتاح service-role server-only (لا بادئة `NEXT_PUBLIC_`، لا يستورده أي `"use client"`).
- عزل الكتابة في بقية مسارات الـ tenant (`.eq('id')` + `.eq('restaurant_id')` + `requireTenant()`).
- bcrypt cost 10 + `bcrypt.compare` + مقارنة dummy-hash لمنع تعداد المستخدمين.
- proxy المالك يستخدم `getUser()` (تحقّق JWT خادم‑side).
- نطاق الـ SW = `/r/` فقط عبر `Service-Worker-Allowed`.
- `resolveSuggestions` يتحقّق من ملكية معرّفات الاقتراحات المخصّصة.

**تنويه دقّة:** أرقام أسطر ملفات migration (`0001_init.sql` …) مأخوذة من تقرير `database-reviewer` ولم تُتحقَّق سطراً بسطر في هذه الجلسة؛ تحقّق منها عند الإصلاح.

---

## Code Quality & Correctness

مراجعة جودة الكود (2026-05-31) بوكلاء `code-reviewer` + `react-reviewer` + `typescript-reviewer`. تقرير فقط، بدون تعديل.
البنود الأمنية في الجداول أعلاه (C/H/M) **مستبعَدة** هنا لتجنّب التكرار. `tsc --noEmit` نظيف — كل ما يلي مشاكل runtime/عقود/تدبير لا يلتقطها المترجم.

### HIGH

| المعرّف | العنوان | الخطورة | الملف / السطر | الحالة | ملخص الإصلاح |
|---|---|---|---|---|---|
| Q-1 | `NaN` من `Number(r.price)`/`profit_percentage` يصل لإجمالي السلة ("NaN IQD") بلا حارس | HIGH | `lib/menu.ts:184, 208` | مفتوح | ارفض/استبعد الصف إن كان `Number(r.price)` = `NaN` أو ≤ 0 قبل بناء `MenuProduct`. |
| Q-2 | `closing_mode_ends_at` مشوّه → `new Date(x).getTime()=NaN` → الوضع عالق على closing للأبد (لا auto-revert) | HIGH | `lib/menu.ts:133` · `app/api/admin/state/route.ts:49` | مفتوح | `const e=new Date(x).getTime(); if(!isNaN(e) && e<Date.now())`. |
| Q-3 | `loadMenu` يتجاهل `error` من الاستعلامات الثلاثة المتوازية → منيو فارغ صامت يُخدَم عبر الـ polling | HIGH | `lib/menu.ts:150-166` | مفتوح | فكّك `error` للثلاثة وأعِد `null` (مسار "غير متوفر") عند أي فشل. |
| Q-4 | `reorderCategories`/`reorderProducts`: كتابات `Promise.all` متوازية بلا تعافٍ من فشل جزئي → `display_order` غير متّسق + `{ok:false}` رغم التزام جزئي | HIGH | `app/admin/dashboard/menu/actions.ts:422-430, 451-458` | مفتوح | استبدل بـ `upsert` واحد لكل الصفوف (round-trip ذرّي). |
| Q-5 | `signOutTenant` يبتلع خطأ `deleteSession` → الكوكي يُمسح لكن صف الجلسة يبقى صالحًا خادم-side (جلسة شبح) | HIGH | `app/admin/actions.ts:58-63` · `lib/auth/session.ts:58-61` | مفتوح | اجعل `deleteSession` يتحقّق من `{error}` ويسجّله. |
| Q-6 | `data.restaurant_id as string` على FK قابل لـ null → null مُموَّه كـ string يمرّ عبر الحارس ثم ينهار لاحقًا | HIGH | `lib/auth/session.ts:55` | مفتوح | `if(!data.restaurant_id) return null;` بدل الـ cast. |
| Q-7 | poll السلة بلا fetch أوّلي ولا `visibilitychange` → تعرض `initialData` حتى 30s فيظهر سعر خصم منتهٍ | HIGH | `app/r/[slug]/cart/cart-view.tsx:58-78` | مفتوح | أطلق `tick()` عند mount + مستمع `visibilitychange`؛ استخرج `useMenuPoll(slug)` مشترك. |

### MEDIUM

| المعرّف | العنوان | الخطورة | الملف / السطر | الحالة | ملخص الإصلاح |
|---|---|---|---|---|---|
| Q-8 | `extractR2Key` مكرّر حرفيًا في ملفّين | MEDIUM | `app/admin/dashboard/menu/actions.ts:466-475` · `app/admin/dashboard/design/actions.ts:89-97` | مفتوح | انقله إلى `lib/r2/upload.ts` وصدّره؛ كلا الـ caller يستوردان منه. |
| Q-9 | كتلة lazy-revert مكرّرة حرفيًا (تكرار بنيوي — منفصل عن H-3 الذرّية) | MEDIUM | `lib/menu.ts:130-148` · `app/api/admin/state/route.ts:46-64` | مفتوح | استخرج `applyLazyRevert(sb,id,endsAt)` في `lib/closing.ts`. |
| Q-10 | `changeAccountPassword` يتجاهل خطأ حذف الجلسات → هدف "فرض إعادة الدخول" قد يفشل صامتًا | MEDIUM | `app/owner/dashboard/accounts/actions.ts:71` | مفتوح | تحقّق من `{error}` لحذف الجلسات وأعِد/سجّل الفشل. |
| Q-11 | كتل `catch {}` لتنظيف R2 بلا تسجيل → صور يتيمة غير مكتشَفة عند فشل مزدوج | MEDIUM | `app/admin/dashboard/menu/actions.ts:148, 247, 293, 340` | مفتوح | `console.error` في كل كتلة cleanup. |
| Q-12 | coercion للوضع موجود في `state` route لكن غائب في `loadMenu` → صف legacy `rush/profit` يعرض فئة افتراضية فارغة | MEDIUM | `lib/menu.ts:126` مقابل `app/api/admin/state/route.ts:71` | مفتوح | `coerceMode(raw)` مشتركة في `lib/closing.ts` تُستدعى في الموضعين. |
| Q-13 | `closing_mode_discount as Discount\|null` بلا فحص عضوية → قيمة DB مثل `15` تُعرض كشارة `-15%` لم يضبطها المالك | MEDIUM | `lib/menu.ts:172` | مفتوح | `[5,10,20].includes(x) ? x as Discount : null` قبل الاستخدام. |
| Q-14 | `getCart`: `JSON.parse(raw) as Cart` بلا تحقّق بنية → `updatedAt` غير معرّف يتخطّى فحص TTL | MEDIUM | `lib/cart.ts:19` | مفتوح | تحقّق `typeof updatedAt==='number'` و`Array.isArray(items)`، وإلا أعِد سلة فارغة. |
| Q-15 | استجابة الـ poll `as MenuPayload` بلا shape-guard على العميل | MEDIUM | `app/r/[slug]/menu-view.tsx:74` · `cart/cart-view.tsx:65` | مفتوح | تحقّق `typeof json?.restaurant?.id==='string'` قبل `setData`. |
| Q-16 | `!` على متغيّرَي بيئة Supabase في proxy (Edge) → 500 معتم لكل مسارات المالك عند الغياب | MEDIUM | `proxy.ts:28-29` | مفتوح | حارس بدء يتحقّق من المتغيّرات، أو إزالة `!`. |
| Q-17 | `body.kind as Kind` cast قبل حارس `KINDS.includes` | MEDIUM | `app/api/track/route.ts:24` | مفتوح | `typeof body.kind==='string' && KINDS.includes(body.kind as Kind)`. |
| Q-18 | `firstParentId` memo على `tree` التفاعلي ينزاح بعد إعادة ترتيب poll → ظهور/اختفاء اختيارات الشيف دون تدخّل | MEDIUM | `app/r/[slug]/menu-view.tsx:95-100` | مفتوح | احسبه من `initialData` الثابت (memo بلا deps / ref). |
| Q-19 | poll الأدمن (10s) بلا حارس `document.hidden` → يطلق في الخلفية ويستنزف البطارية (menu-view يحرس) | MEDIUM | `app/admin/dashboard/modes/modes-view.tsx:77-94` | مفتوح | أضف نفس حارس الرؤية + مستمع `visibilitychange`. |
| Q-20 | `offset` (تصحيح انحراف الساعة) يُحسب في جسم الـ render بلا memo → إعادة حساب غير متّسقة | MEDIUM | `app/admin/dashboard/modes/modes-view.tsx:73-74` | مفتوح | `useMemo(() => …, [state.server_now])`. |
| Q-21 | `dateEyebrow` مجمَّد عند mount → يوم/وقت خاطئ بعد منتصف الليل | MEDIUM | `app/r/[slug]/menu-view.tsx:46-51` | مفتوح | احسبه أثناء render (دالة نقية رخيصة) أو وثّق المقايضة صراحةً. |
| Q-22 | `setMode` جولة DB إضافية متسلسلة لجلب `currency` على مسار التفعيل الحرج | MEDIUM | `app/admin/dashboard/modes/actions.ts:67-73` | مفتوح | أضف `currency` إلى `requireTenant()`/`TenantContext` أو ادمج الجلب. |

### LOW

| المعرّف | العنوان | الخطورة | الملف / السطر | الحالة | ملخص الإصلاح |
|---|---|---|---|---|---|
| Q-23 | modals يدوية بلا Escape/`role="dialog"`/focus-trap → مستخدمو لوحة المفاتيح/AT محتجزون | LOW | `app/r/[slug]/cart/cart-view.tsx:399-461` · `welcome-screen.tsx:109-135` | مفتوح | `onKeyDown` Escape + `role`/`aria-modal` + focus-trap، أو shadcn `Dialog`. |
| Q-24 | إساءة ARIA لقائمة اللغة (`button[role="option"]`, لا `aria-controls`/`id`) | LOW | `app/r/[slug]/menu-view.tsx:404-440` | مفتوح | `div[role=option]` + ربط `aria-controls`/`id`، أو shadcn `Select`. |
| Q-25 | `Field` `<label>` بلا `htmlFor` → النقر لا يركّز الحقل | LOW | `closing-dialog.tsx:214` · `design-view.tsx:284` · `product-dialog.tsx:201` | مفتوح | مرّر `id` مطابق؛ لمجموعات الأزرار `role="group"`+`aria-labelledby`. |
| Q-26 | شعار `alt=""` يُخفي اسم المطعم حيث لا اسم مجاور | LOW | `app/r/[slug]/welcome-screen.tsx:75` · `design/design-view.tsx:356` | مفتوح | `alt={restaurant.display_name}` في هذين الموضعين. |
| Q-27 | `byId` Map يُعاد بناؤه كل render في مكوّن DnD حسّاس للأداء | LOW | `app/admin/dashboard/menu/sortable-list.tsx:42` | مفتوح | `useMemo(() => new Map(...), [items])`. |
| Q-28 | `setTimeout` في `copyLink` بلا تنظيف عند unmount | LOW | `app/admin/dashboard/design/qr-section.tsx:25-30` | مفتوح | `useRef` للمؤقّت + cleanup effect. |
| Q-29 | `key={index}` في قوائم skeleton مولّدة | LOW | `app/r/[slug]/cart/loading.tsx:10` (وأشقاؤه تحت `/r/[slug]/`) | مفتوح | مفتاح نصّي ثابت `skeleton-row-${i}`. |
| Q-30 | تدبير/تكرار: `NO_STORE_HEADERS` معرّف مرتين، رقم سحري `3_600_000`، نمط `reorder` مكرّر، parser لغة مكرّر 3× مع `as Lang` مبكّر، `original_price!` بلا type-predicate | LOW | `api/menu/[slug]/route.ts:11` · `api/admin/state/route.ts:10` · `modes/actions.ts:95` · `menu-view.tsx:56,580` · `cart-view.tsx:46,292` · `product-view.tsx:37,101` | مفتوح | استخرج ثوابت/أدوات مشتركة في `lib/` (`lib/http.ts`، `MS_PER_HOUR`، `parseLang`، helper إعادة ترتيب). |

### ملاحظات إضافية (Code Quality)
- **أولويات قبل الإنتاج:** Q-1، Q-2، Q-3، Q-4، Q-5 (أخطاء صحّة فعلية: NaN في الأسعار، وضع عالق، منيو فارغ صامت، عدم اتّساق الترتيب، جلسة شبح).
- **نظيف:** `tsc --noEmit` بلا أخطاء؛ نمط `requireTenant()` + ربط `restaurant_id` مُطبَّق باتّساق (الاستثناءات مسجّلة كـ C-2/H-2)؛ تنظيف `setInterval` في معظم الـ polling صحيح.
- **تنويه دقّة:** أرقام الأسطر مأخوذة من تقارير الوكلاء؛ تحقّق منها عند الإصلاح.

---

## PWA & Service Worker

مراجعة الـ PWA (2026-05-31): `public/sw.js`، `app/r/[slug]/sw-register.tsx`، `app/r/[slug]/manifest.webmanifest/route.ts`، `next.config.ts`. تقرير فقط، بدون تعديل. مستبعَد ما هو مسجّل أعلاه.

**تحقّق إيجابي:** حارس `navigator.onLine` يعمل (`public/sw.js:180`) — `handleApi` يخدم الكاش فقط عند رمي `fetch` **و** `onLine===false`؛ أونلاين دائمًا استجابة طازجة. إصلاح Bug #3 سليم (تغييرات الوضع/السعر لا تُحجَب بكاش قديم أونلاين).

### HIGH

| المعرّف | العنوان | الخطورة | الملف / السطر | الحالة | ملخص الإصلاح |
|---|---|---|---|---|---|
| SW-1 | الـ manifest الديناميكي per-restaurant يُطابق قاعدة `.webmanifest` فيُخدَم `CacheFirst` بلا انتهاء → علامة تجارية (theme_color/name) عالقة بعد تغيير DB، متناقضة مع `no-cache` من السيرفر | HIGH | `public/sw.js:126-135` مقابل `app/r/[slug]/manifest.webmanifest/route.ts:55-60` | مفتوح | استثنِ مسار الـ manifest الديناميكي من قاعدة 4 (اجعله NetworkFirst أو لا تعترضه). |
| SW-2 | `skipWaiting`+`clients.claim` مع حذف الكاش المُرقّم في `activate` → انحراف نسخة وخطر `ChunkLoadError` للزبون المفتوح وقت نشر يغيّر `sw.js`/البناء | HIGH | `public/sw.js:25-27, 29-34` | مفتوح | أبقِ static القديم حتى انتهاء الـ clients، أو نمط "تحديث جاهز — أعد التحميل"، أو `location.reload()` مرّة عند فشل تحميل chunk. |

### MEDIUM

| المعرّف | العنوان | الخطورة | الملف / السطر | الحالة | ملخص الإصلاح |
|---|---|---|---|---|---|
| SW-3 | `VERSION='v1'` ثابت يدويًا → لا تبطيل كاش لكل نشر؛ `STATIC_CACHE` CacheFirst بلا إخلاء/انتهاء → نمو تخزين غير محدود + لا تحديث قسري لـ HTML/API-fallback إلا برفع يدوي | MEDIUM | `public/sw.js:16-21` | مفتوح | اشتقّ `VERSION` من هاش البناء (`BUILD_ID` يُحقَن وقت البناء)، أو أضف إخلاء/انتهاء لـ `STATIC_CACHE`. |
| SW-4 | لا مهلة (`AbortController`) لطلبات API عند شبكة بطيئة-لكن-متصلة → المنيو/الـ poll يعلّق بلا fallback (بالتصميم لا يخدم كاش أونلاين) | MEDIUM | `public/sw.js:168-187` | مفتوح | أضف مهلة عبر `AbortController` تعرض "إعادة محاولة"؛ اختياريًا اخدم كاش مع شارة "غير محدّث" ظاهرة. |
| SW-5 | fallback تنقّل offline يخدم آخر HTML مطعم مخزّن لأي slug غير مخزّن → قشرة/بيانات مطعم خاطئ (offline + عدة مطاعم) | MEDIUM | `public/sw.js:159-163` | مفتوح | عند عدم التطابق الدقيق اعرض صفحة offline عامّة، أو طابِق على نفس الـ slug فقط. |
| SW-6 | إخلاء صور المنتجات FIFO لا LRU (تعليق مُسمّى خطأ) + سباق read‑modify‑write تحت تحميل متوازٍ (قد يتجاوز 50 أو يُفرط في الحذف) | MEDIUM | `public/sw.js:198-214` | مفتوح | أعِد إدراج العنصر عند الإصابة لـLRU حقيقي، أو صحّح التعليق إلى FIFO؛ قلّل السباق في منطق الإخلاء. |

### LOW

| المعرّف | العنوان | الخطورة | الملف / السطر | الحالة | ملخص الإصلاح |
|---|---|---|---|---|---|
| SW-7 | تخزين استجابات R2 المعتمة (opaque, status 0) قد يحفظ خطأ 404 كـ"صورة" تُخدَم CacheFirst لاحقًا كصورة مكسورة دائمة | LOW | `public/sw.js:203` | مفتوح | فعّل CORS على R2 وافحص `res.ok`، أو اقبل المخاطرة بتعليق. |
| SW-8 | فرع `=== '/api/admin/state'` شيفرة ميتة (نطاق الـ SW هو `/r/` فقط، وصفحات الـ diner لا تطلبه) | LOW | `public/sw.js:107-113` | مفتوح | احذف الشرط أو وثّقه كاحتياطي. |

### ملاحظات إضافية (PWA)
- **نظيف/صحيح:** حارس `onLine` (Bug #3)؛ `Service-Worker-Allowed: /r/` يقصر النطاق على الـ diner (`next.config.ts:17`)؛ `Cache-Control: no-cache` على `/sw.js` لتحديث سريع؛ تفكيك الـ SV+caches في التطوير (`sw-register.tsx:17-33`)؛ إبقاء الأيقونات خارج LRU الصور (قاعدة 4).
- **أولويات:** SW-1 (علامة قديمة عالقة) و SW-2 (صفحة مكسورة وقت النشر) قبل الإنتاج.
- **تنويه دقّة:** أرقام الأسطر تخصّ `public/sw.js` كما قُرئ في هذه الجلسة.
