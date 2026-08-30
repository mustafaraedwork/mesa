# SECURITY-FINDINGS

ملف تتبّع لنتائج مراجعة الأمان وطبقة Supabase لمشروع **BIZIII Menu**.

- التاريخ: 2026-05-31
- المراجعون: `security-reviewer` + `database-reviewer` (تقرير فقط، بدون تعديل كود)
- البنود المُعلَّمة ✓✓ وجدها الوكيلان بشكل مستقل ومتطابق (ثقة عالية).
- **هذا ملف تتبّع فقط — لا يُصلِح أي كود.** حدّث عمود "الحالة" عند إصلاح البند.

---

## CRITICAL

| المعرّف | العنوان | الخطورة | الملف / السطر | الحالة | ملخص الإصلاح |
|---|---|---|---|---|---|
| C-1 | أكشنات المالك بلا تحقّق هوية داخلي — تجاوز كامل للوحة المالك (الـ proxy يحمي تنقّل الصفحات فقط، لا يحمي إرسال Server Actions) ✓ محقَّق | CRITICAL | `app/owner/dashboard/accounts/actions.ts` (كل الدوال) · `app/owner/dashboard/page.tsx` (`loadOverview`) · `app/owner/dashboard/accounts/page.tsx` (`loadAccounts`) | ✅ مُصلَح | أنشئ `requireOwner()` يستدعي `getAuthServerClient().auth.getUser()` ويرفض إن `app_metadata.role !== 'owner'`، واستدعِه كأول سطر في كل أكشن مالك وفي `loadOverview`/`loadAccounts`. لا تعتمد على الـ proxy وحده. |
| C-2 | `setMode`/`setChefPicks`: كتابة `UPDATE` نهائية بلا قيد `restaurant_id` (service-role يتجاوز RLS؛ التحقق والكتابة غير ذرّيين) ✓✓ | CRITICAL | `app/admin/dashboard/modes/actions.ts:121-124` · `:163-166` | ✅ مُصلَح | أضف `.eq('restaurant_id', restaurantId)` لكلا الكتابتين، مطابقةً لخطوة المسح أعلاهما. |
| C-3 | رفع الصور: لا حدّ للحجم ولا تحقّق MIME قبل تمرير البايتات لـ sharp (قنبلة فك‑ضغط / SVG / polyglot) | CRITICAL | `app/admin/dashboard/menu/actions.ts:205-212, 287-301` · `app/admin/dashboard/design/actions.ts:59-66` · `lib/r2/upload.ts:45-67` | ✅ مُصلَح | افرض حدّاً أقصى للحجم (~10MB) وallowlist لنوع MIME (`jpeg/png/webp/gif`، ارفض `svg+xml`) قبل `uploadProductImage`؛ يفضَّل فحص magic-bytes لأول 12 بايت. |

---

## HIGH

| المعرّف | العنوان | الخطورة | الملف / السطر | الحالة | ملخص الإصلاح |
|---|---|---|---|---|---|
| H-1 | `profit_percentage` يُسرَّب لكل زبون في JSON المنيو العام (حقل داخلي، database-reviewer صنّفه Critical) ✓✓ | HIGH | `lib/menu.ts:37-38, 159, 206-209` → `app/api/menu/[slug]/route.ts` | ✅ مُصلَح | احذف `profit_percentage` من `select()` ومن نوعَي `ProductRow`/`MenuProduct`؛ أبقِه على المسار الإداري المُصادَق فقط. (`prep_time_minutes` ظاهر للزبون فيمكن إبقاؤه.) |
| H-2 | `deleteCategory`: تعداد/حذف صور R2 لمطعم آخر — قيد `restaurant_id` ناقص و`id` العلوي غير مُتحقَّق من ملكيته ✓✓ | HIGH | `app/admin/dashboard/menu/actions.ts:143-145` | ✅ مُصلَح | تحقّق أن `id` يخص `restaurantId` أولاً (`.eq('id',id).eq('restaurant_id',restaurantId).maybeSingle()`)، وأضف `.eq('restaurant_id', restaurantId)` لاستعلام الصور. |
| H-3 | Lazy-revert كتابتان غير ذرّيتين عبر جدولين (نافذة تسابق تنتج حالة وسطية — خلل UX) | HIGH | `lib/menu.ts:134-148` · `app/api/admin/state/route.ts:47-64` | ✅ مُطبَّق ومُتحقَّق | `0008` مُطبَّق على Supabase → `applyLazyRevert` يستخدم RPC `revert_closing_mode` الذرّي (smoke-closing-revert أخضر، شامل idempotency/race-safety/boundary). |
| H-4 | Rate limiting ضعيف/غائب: محدِّد في الذاكرة فقط، per-username بلا قيد IP؛ `/api/track` و`/api/menu` بلا حدّ | HIGH | `lib/auth/rate-limit.ts` · `app/api/track/route.ts` · `app/api/menu/[slug]/route.ts` | ✅ مُصلَح (جزئي) | `checkIpRate`: bucket IP لتسجيل الدخول (20/15د، فوق الـper-username) + `/api/track` (60/دقيقة). **مؤجّل بقرار:** ETag/304 لـ`/api/menu` (يتعارض مع no-store) وتنظيف `events` (يحتاج cron). المحدِّد في الذاكرة يبقى (مقبول MVP موثّق، يُستبدل بـPostgres عند التوسّع). |
| H-5 | توكن الجلسة دائم بلا تدوير/إبطال/انتهاء (التوليد سليم: 256 بت CSPRNG؛ لكن التسرّب = وصول دائم؛ مقارنة غير ثابتة‑الزمن) | HIGH | `lib/auth/session.ts:9-11, 26-35, 44-56` | ✅ مُصلَح (جزئي) | حدّ عمر 365 يومًا مُطبَّق في `getRestaurantIdFromCookie` (يستخدم `created_at` الموجود، ويحذف الجلسة المنتهية) + الإبطال موجود عبر تغيير المالك لكلمة السر. **مؤجّل بقرار:** تجزئة `SHA-256(token)`+`timingSafeEqual` (تكسر الجلسات الحالية، القناة الزمنية ضئيلة خلف HTTPS) وواجهة «الجلسات النشطة». |

---

## MEDIUM

| المعرّف | العنوان | الخطورة | الملف / السطر | الحالة | ملخص الإصلاح |
|---|---|---|---|---|---|
| M-1 | لا CSP ولا ترويسات أمان عامة (تُضبط ترويسات `/sw.js` فقط) | MEDIUM | `next.config.ts` | ✅ مُصلَح | `SECURITY_HEADERS` على `/:path*`: `nosniff`+`X-Frame-Options: SAMEORIGIN`+`Referrer-Policy`+`Permissions-Policy`+CSP (مؤكَّد حاضرًا في الردود). CSP يسمح بما يحتاجه التطبيق (R2/Supabase عبر https)؛ تشديد nonce لاحقًا. |
| M-2 | `SameSite=lax` + تغيير حالة داخل GET (الـ lazy-revert يحدث في `GET` ويصله الكوكي عبر المواقع) | MEDIUM | `lib/auth/session.ts:31` · `app/api/admin/state/route.ts` | ✅ موثّق (مقبول بالتصميم) | `SameSite=Strict` **يكسر** بقاء جلسة الـ PWA (الكوكي يسقط في التنقّل العلوي عند الإطلاق)؛ و`lax` لا يُرسَل في fetch عبر المواقع فلا يمكن استدعاء `/api/admin/state` عبرها (يرجع 401)؛ والـ lazy-revert في GET هو **self-heal متماثل** بلا قيمة لمهاجم. وُثِّق في `session.ts`. |
| M-3 | سياسة RLS للمالك تكشف عمود `token` الخام في `tenant_sessions` (database-reviewer صنّفه Critical؛ خُفِّض لأنه owner-only موثوق) | MEDIUM | `supabase/migrations/0001_init.sql` (سياسة Owner full access) | ✅ مُطبَّق | `0009` مُطبَّق → `REVOKE SELECT (token)` فعّال (service-role يتجاوزه؛ smoke-rls يؤكّد إخفاء `tenant_sessions` عن anon). |
| M-4 | قيد المستويين للفئات مُطبَّق في كود التطبيق فقط (DB يسمح بأي عمق) | MEDIUM | `app/admin/dashboard/menu/actions.ts:61-73` · `supabase/migrations/0001_init.sql` | ✅ مُطبَّق ومُتحقَّق | `0009` مُطبَّق → trigger `trg_categories_two_levels` فعّال؛ تحقّق مباشر: يرفض فئة حفيد (P0001). |
| M-5 | فهارس/ترتيب: لا فهرس على `complementary_categories.restaurant_id`؛ منتجات `loadMenu` تُرتَّب في JS؛ فهارس جزئية مفقودة | MEDIUM | `supabase/migrations/0001_init.sql:89-96` · `lib/menu.ts:157-163, 177-178` | ✅ مُصلَح (مُطبَّق) | `.order('display_order')` في `loadMenu` (كود) + الفهارس (`idx_complementary_restaurant` + الجزئية) مُطبَّقة عبر `0009`. |
| M-6 | ثغرات قيود المخطط: `UNIQUE(category_id, complement_id)` بلا `restaurant_id`؛ لا قيد يمنع `active_mode='closing'` مع `closing_mode_discount IS NULL` | MEDIUM | `supabase/migrations/0001_init.sql:31, 95` | ✅ مُطبَّق ومُتحقَّق | `0010` مُطبَّق (بيانات نظيفة) → `UNIQUE(restaurant_id,category_id,complement_id)` + CHECK فعّالان؛ تحقّق مباشر: يرفض closing بلا discount (23514) ورابطًا مكرّرًا (23505). |
| M-7 | هشاشة `extractR2Key`: fallback عند غياب `R2_PUBLIC_URL` قد يستخرج مفتاحاً عشوائياً مع `catch {}` صامت | MEDIUM | `app/admin/dashboard/menu/actions.ts:466-474` · `app/admin/dashboard/design/actions.ts:89-96` | ✅ مُصلَح | `extractR2Key` يرمي إن غابت `R2_PUBLIC_URL` أو لم يبدأ الـURL بها (لا fallback عشوائي)، ويُلفّ في `safeDeleteImageByUrl` (لا يرمي، يسجّل) في كل مسارات التنظيف. |
| M-8 | تحقّق UUID مفقود في أكشنات المالك + `secure` على الكوكي مشروط بـ `NODE_ENV` | MEDIUM | `app/owner/dashboard/accounts/actions.ts:54, 77` · `lib/auth/session.ts:30` | ✅ مُصلَح | `UUID_RE` يتحقّق من `id` في setAccountActive/changeAccountPassword/deleteAccount. `secure` المشروط بـ`NODE_ENV` صحيح بالتصميم (كوكي secure يتطلب HTTPS الغائب في dev) ووُثّق في `session.ts`. |

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
| Q-1 | `NaN` من `Number(r.price)`/`profit_percentage` يصل لإجمالي السلة ("NaN IQD") بلا حارس | HIGH | `lib/menu.ts:184, 208` | ✅ مُصلَح | ارفض/استبعد الصف إن كان `Number(r.price)` = `NaN` أو ≤ 0 قبل بناء `MenuProduct`. |
| Q-2 | `closing_mode_ends_at` مشوّه → `new Date(x).getTime()=NaN` → الوضع عالق على closing للأبد (لا auto-revert) | HIGH | `lib/menu.ts:133` · `app/api/admin/state/route.ts:49` | ✅ مُصلَح | `const e=new Date(x).getTime(); if(!isNaN(e) && e<Date.now())`. |
| Q-3 | `loadMenu` يتجاهل `error` من الاستعلامات الثلاثة المتوازية → منيو فارغ صامت يُخدَم عبر الـ polling | HIGH | `lib/menu.ts:150-166` | ✅ مُصلَح | فكّك `error` للثلاثة وأعِد `null` (مسار "غير متوفر") عند أي فشل. |
| Q-4 | `reorderCategories`/`reorderProducts`: كتابات `Promise.all` متوازية بلا تعافٍ من فشل جزئي → `display_order` غير متّسق + `{ok:false}` رغم التزام جزئي | HIGH | `app/admin/dashboard/menu/actions.ts:422-430, 451-458` | ✅ مُصلَح | استبدل بـ `upsert` واحد لكل الصفوف (round-trip ذرّي). |
| Q-5 | `signOutTenant` يبتلع خطأ `deleteSession` → الكوكي يُمسح لكن صف الجلسة يبقى صالحًا خادم-side (جلسة شبح) | HIGH | `app/admin/actions.ts:58-63` · `lib/auth/session.ts:58-61` | ✅ مُصلَح | اجعل `deleteSession` يتحقّق من `{error}` ويسجّله. |
| Q-6 | `data.restaurant_id as string` على FK قابل لـ null → null مُموَّه كـ string يمرّ عبر الحارس ثم ينهار لاحقًا | HIGH | `lib/auth/session.ts:55` | ✅ مُصلَح | `if(!data.restaurant_id) return null;` بدل الـ cast. |
| Q-7 | poll السلة بلا fetch أوّلي ولا `visibilitychange` → تعرض `initialData` حتى 30s فيظهر سعر خصم منتهٍ | HIGH | `app/r/[slug]/cart/cart-view.tsx:58-78` | ✅ مُصلَح | `void tick()` عند mount في cart-view (الـ`visibilitychange`+`document.hidden` موجودان أصلًا). لم يُستخرج hook مشترك للحفاظ على أنماط smoke-polling-contract الحرفية. |

### MEDIUM

| المعرّف | العنوان | الخطورة | الملف / السطر | الحالة | ملخص الإصلاح |
|---|---|---|---|---|---|
| Q-8 | `extractR2Key` مكرّر حرفيًا في ملفّين | MEDIUM | `app/admin/dashboard/menu/actions.ts:466-475` · `app/admin/dashboard/design/actions.ts:89-97` | ✅ مُصلَح | نُقل إلى `lib/r2/upload.ts` (مصدر واحد)؛ menu+design يستوردانه. |
| Q-9 | كتلة lazy-revert مكرّرة حرفيًا (تكرار بنيوي — منفصل عن H-3 الذرّية) | MEDIUM | `lib/menu.ts:130-148` · `app/api/admin/state/route.ts:46-64` | ✅ مُصلَح | استخرج `applyLazyRevert(sb,id,endsAt)` في `lib/closing.ts`. |
| Q-10 | `changeAccountPassword` يتجاهل خطأ حذف الجلسات → هدف "فرض إعادة الدخول" قد يفشل صامتًا | MEDIUM | `app/owner/dashboard/accounts/actions.ts:71` | ✅ مُصلَح | تحقّق من `{error}` لحذف الجلسات وأعِد/سجّل الفشل. |
| Q-11 | كتل `catch {}` لتنظيف R2 بلا تسجيل → صور يتيمة غير مكتشَفة عند فشل مزدوج | MEDIUM | `app/admin/dashboard/menu/actions.ts:148, 247, 293, 340` | ✅ مُصلَح | `console.error` في كل كتلة cleanup. |
| Q-12 | coercion للوضع موجود في `state` route لكن غائب في `loadMenu` → صف legacy `rush/profit` يعرض فئة افتراضية فارغة | MEDIUM | `lib/menu.ts:126` مقابل `app/api/admin/state/route.ts:71` | ✅ مُصلَح | `coerceMode(raw)` في `lib/closing.ts`، تُستدعى في `loadMenu` و`state` route. |
| Q-13 | `closing_mode_discount as Discount\|null` بلا فحص عضوية → قيمة DB مثل `15` تُعرض كشارة `-15%` لم يضبطها المالك | MEDIUM | `lib/menu.ts:172` | ✅ مُصلَح | `[5,10,20].includes(x) ? x as Discount : null` قبل الاستخدام. |
| Q-14 | `getCart`: `JSON.parse(raw) as Cart` بلا تحقّق بنية → `updatedAt` غير معرّف يتخطّى فحص TTL | MEDIUM | `lib/cart.ts:19` | ✅ مُصلَح | تحقّق `typeof updatedAt==='number'` و`Array.isArray(items)`، وإلا أعِد سلة فارغة. |
| Q-15 | استجابة الـ poll `as MenuPayload` بلا shape-guard على العميل | MEDIUM | `app/r/[slug]/menu-view.tsx:74` · `cart/cart-view.tsx:65` | ✅ مُصلَح | تحقّق `typeof json?.restaurant?.id==='string'` قبل `setData`. |
| Q-16 | `!` على متغيّرَي بيئة Supabase في proxy (Edge) → 500 معتم لكل مسارات المالك عند الغياب | MEDIUM | `proxy.ts:28-29` | ✅ مُصلَح | حارس في proxy: عند غياب متغيّرات Supabase يسجّل ويعيد توجيه لـ`/owner` بدل تمرير undefined (لا 500 معتم). |
| Q-17 | `body.kind as Kind` cast قبل حارس `KINDS.includes` | MEDIUM | `app/api/track/route.ts:24` | ✅ مُصلَح | `typeof body.kind==='string' && KINDS.includes(body.kind as Kind)`. |
| Q-18 | `firstParentId` memo على `tree` التفاعلي ينزاح بعد إعادة ترتيب poll → ظهور/اختفاء اختيارات الشيف دون تدخّل | MEDIUM | `app/r/[slug]/menu-view.tsx:95-100` | ✅ مُصلَح | `firstParentId` يُحسب من `initialData` الثابت (`buildTree(initialData.categories)`), لا من `tree` التفاعلي. |
| Q-19 | poll الأدمن (10s) بلا حارس `document.hidden` → يطلق في الخلفية ويستنزف البطارية (menu-view يحرس) | MEDIUM | `app/admin/dashboard/modes/modes-view.tsx:77-94` | ✅ مُصلَح | `if(document.hidden) return` + مستمع `visibilitychange` في poll الأدمن (10s). |
| Q-20 | `offset` (تصحيح انحراف الساعة) يُحسب في جسم الـ render بلا memo → إعادة حساب غير متّسقة | MEDIUM | `app/admin/dashboard/modes/modes-view.tsx:73-74` | ✅ مُصلَح | `offset` صار `useMemo(..., [state.server_now])`. |
| Q-21 | `dateEyebrow` مجمَّد عند mount → يوم/وقت خاطئ بعد منتصف الليل | MEDIUM | `app/r/[slug]/menu-view.tsx:46-51` | ✅ موثّق | المقايضة موثّقة في `menu-view` (قراءة الساعة مرة عند mount لـeyebrow تجميلي؛ تجنّب `Date()` غير نقية كل render). |
| Q-22 | `setMode` جولة DB إضافية متسلسلة لجلب `currency` على مسار التفعيل الحرج | MEDIUM | `app/admin/dashboard/modes/actions.ts:67-73` | ✅ مُصلَح | `currency` أُضيف إلى `TenantContext`/`requireTenant`؛ `setMode` يستخدمه ويحذف الجلب المنفصل. |

### LOW

| المعرّف | العنوان | الخطورة | الملف / السطر | الحالة | ملخص الإصلاح |
|---|---|---|---|---|---|
| Q-23 | modals يدوية بلا Escape/`role="dialog"`/focus-trap → مستخدمو لوحة المفاتيح/AT محتجزون | LOW | `app/r/[slug]/cart/cart-view.tsx:399-461` · `welcome-screen.tsx:109-135` | ✅ مُصلَح | Escape (useEffect/keydown) للمودالين + `role="dialog"`/`aria-modal` + إغلاق بالنقر على الخلفية لـwelcome. focus-trap كامل مؤجّل. |
| Q-24 | إساءة ARIA لقائمة اللغة (`button[role="option"]`, لا `aria-controls`/`id`) | LOW | `app/r/[slug]/menu-view.tsx:404-440` | ✅ مُصلَح | `div[role=option]`+`tabIndex`+`onKeyDown` بدل `button`، و`id="lang-listbox"`+`aria-controls`. |
| Q-25 | `Field` `<label>` بلا `htmlFor` → النقر لا يركّز الحقل | LOW | `closing-dialog.tsx:214` · `design-view.tsx:284` · `product-dialog.tsx:201` | ✅ مُصلَح | `Field` يلفّ الحقل داخل `<label>` (ربط ضمني) في الملفات الأربعة (design/product/category/closing). |
| Q-26 | شعار `alt=""` يُخفي اسم المطعم حيث لا اسم مجاور | LOW | `app/r/[slug]/welcome-screen.tsx:75` · `design/design-view.tsx:356` | ✅ مُصلَح | welcome: `alt={restaurant.display_name}`؛ معاينتا design: `alt="شعار المطعم"`. |
| Q-27 | `byId` Map يُعاد بناؤه كل render في مكوّن DnD حسّاس للأداء | LOW | `app/admin/dashboard/menu/sortable-list.tsx:42` | ✅ مُصلَح | `byId` صار `useMemo(() => new Map(...), [items])`. |
| Q-28 | `setTimeout` في `copyLink` بلا تنظيف عند unmount | LOW | `app/admin/dashboard/design/qr-section.tsx:25-30` | ✅ مُصلَح | `copiedTimer` ref + cleanup effect عند unmount في qr-section. |
| Q-29 | `key={index}` في قوائم skeleton مولّدة | LOW | `app/r/[slug]/cart/loading.tsx:10` (وأشقاؤه تحت `/r/[slug]/`) | ✅ مُصلَح | مفاتيح نصّية ثابتة في cart/loading + admin/dashboard/loading. |
| Q-30 | تدبير/تكرار: `NO_STORE_HEADERS` معرّف مرتين، رقم سحري `3_600_000`، نمط `reorder` مكرّر، parser لغة مكرّر 3× مع `as Lang` مبكّر، `original_price!` بلا type-predicate | LOW | `api/menu/[slug]/route.ts:11` · `api/admin/state/route.ts:10` · `modes/actions.ts:95` · `menu-view.tsx:56,580` · `cart-view.tsx:46,292` · `product-view.tsx:37,101` | ✅ مُصلَح (جزئي) | `parseLang()` في `lib/i18n.ts` (يستبدل التكرار + `as Lang` في 3 views) + `MS_PER_HOUR` في modes/actions. **مُبقى بقرار:** `NO_STORE_HEADERS` مكرّر (smoke-polling-contract يعتمد على السلسلة الحرفية داخل كل route)، و`original_price!` (محروس بـ`hasDiscount`)، ودالتا reorder (صارتا upsert في Q-4). |

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
| SW-1 | الـ manifest الديناميكي per-restaurant يُطابق قاعدة `.webmanifest` فيُخدَم `CacheFirst` بلا انتهاء → علامة تجارية (theme_color/name) عالقة بعد تغيير DB، متناقضة مع `no-cache` من السيرفر | HIGH | `public/sw.js:126-135` مقابل `app/r/[slug]/manifest.webmanifest/route.ts:55-60` | ✅ مُصلَح | استثنِ مسار الـ manifest الديناميكي من قاعدة 4 (اجعله NetworkFirst أو لا تعترضه). |
| SW-2 | `skipWaiting`+`clients.claim` مع حذف الكاش المُرقّم في `activate` → انحراف نسخة وخطر `ChunkLoadError` للزبون المفتوح وقت نشر يغيّر `sw.js`/البناء | HIGH | `public/sw.js:25-27, 29-34` | ✅ مُصلَح | أبقِ static القديم حتى انتهاء الـ clients، أو نمط "تحديث جاهز — أعد التحميل"، أو `location.reload()` مرّة عند فشل تحميل chunk. |

### MEDIUM

| المعرّف | العنوان | الخطورة | الملف / السطر | الحالة | ملخص الإصلاح |
|---|---|---|---|---|---|
| SW-3 | `VERSION='v1'` ثابت يدويًا → لا تبطيل كاش لكل نشر؛ `STATIC_CACHE` CacheFirst بلا إخلاء/انتهاء → نمو تخزين غير محدود + لا تحديث قسري لـ HTML/API-fallback إلا برفع يدوي | MEDIUM | `public/sw.js:16-21` | ✅ مُصلَح | أُضيف `STATIC_LRU_MAX=200` بإخلاء FIFO في `cacheFirst` (يحدّ نمو `STATIC_CACHE`). |
| SW-4 | لا مهلة (`AbortController`) لطلبات API عند شبكة بطيئة-لكن-متصلة → المنيو/الـ poll يعلّق بلا fallback (بالتصميم لا يخدم كاش أونلاين) | MEDIUM | `public/sw.js:168-187` | ✅ مُصلَح | `AbortController` بمهلة `API_TIMEOUT_MS=8000` في `handleApi`؛ عند الانتهاء يُعاد رمي الخطأ أونلاين (العميل يعيد المحاولة، لا يخدم كاش قديم). |
| SW-5 | fallback تنقّل offline يخدم آخر HTML مطعم مخزّن لأي slug غير مخزّن → قشرة/بيانات مطعم خاطئ (offline + عدة مطاعم) | MEDIUM | `public/sw.js:159-163` | ✅ مُصلَح | حُذف fallback "آخر HTML مخزّن"؛ عند عدم التطابق الدقيق offline يفشل التنقّل بدل عرض مطعم خاطئ. |
| SW-6 | إخلاء صور المنتجات FIFO لا LRU (تعليق مُسمّى خطأ) + سباق read‑modify‑write تحت تحميل متوازٍ (قد يتجاوز 50 أو يُفرط في الحذف) | MEDIUM | `public/sw.js:198-214` | ✅ مُصلَح | صُحّح التعليق إلى FIFO (إخلاء حسب ترتيب الإدراج، استراتيجية صحيحة ومحدودة) — تجنّبًا لكتابات/سباق إعادة الإدراج. |

### LOW

| المعرّف | العنوان | الخطورة | الملف / السطر | الحالة | ملخص الإصلاح |
|---|---|---|---|---|---|
| SW-7 | تخزين استجابات R2 المعتمة (opaque, status 0) قد يحفظ خطأ 404 كـ"صورة" تُخدَم CacheFirst لاحقًا كصورة مكسورة دائمة | LOW | `public/sw.js:203` | ✅ موثّق · R2 CORS (بنية) | قُبِلت المخاطرة بتعليق صريح في `sw.js` (صور R2 المعتمة مطلوبة offline)؛ الإصلاح الكامل يتطلب تفعيل CORS على bucket الـ R2 (بنية، خارج الكود). |
| SW-8 | فرع `=== '/api/admin/state'` شيفرة ميتة (نطاق الـ SW هو `/r/` فقط، وصفحات الـ diner لا تطلبه) | LOW | `public/sw.js:107-113` | ✅ مُصلَح | حُذف فرع `/api/admin/state` الميت من معالج fetch. |

### ملاحظات إضافية (PWA)
- **نظيف/صحيح:** حارس `onLine` (Bug #3)؛ `Service-Worker-Allowed: /r/` يقصر النطاق على الـ diner (`next.config.ts:17`)؛ `Cache-Control: no-cache` على `/sw.js` لتحديث سريع؛ تفكيك الـ SV+caches في التطوير (`sw-register.tsx:17-33`)؛ إبقاء الأيقونات خارج LRU الصور (قاعدة 4).
- **أولويات:** SW-1 (علامة قديمة عالقة) و SW-2 (صفحة مكسورة وقت النشر) قبل الإنتاج.
- **تنويه دقّة:** أرقام الأسطر تخصّ `public/sw.js` كما قُرئ في هذه الجلسة.
