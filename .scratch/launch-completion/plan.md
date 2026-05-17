# خطة إكمال Mesa OS Lite وإيصاله للإطلاق

> خطة مرحلية. كل مرحلة قابلة للتنفيذ في جلسة مستقلة. علّم `[x]` فور الإنجاز.
> المرجع: `prd.md`, `RULES.md`, `PHASES.md`. القاعدة الأم: البساطة أولاً — لا تجريدات، لا مكتبات state، أقل ملفات ممكنة.
> أُنشئت 2026-05-17 بعد مراجعة كاملة + اكتشاف توثيق (Phase 0).

---

## Phase 0 — اكتشاف التوثيق (مرجع ثابت لكل المراحل)

### أنماط الكود المؤكَّدة (لا تُخمَّن — منقولة من الملفات)

**Server Actions في `app/admin/dashboard/menu/actions.ts`:**
- كل action يبدأ بـ`const { restaurantId } = await requireTenant();` ثم `getServiceClient()`، وكل query مقيّد بـ`.eq('restaurant_id', restaurantId)`.
- نوع الإرجاع الموحّد: `type Result = { ok: true } | { ok: false; error: string }`.
- نمطان للإدخال: **object-literal** (مثل `createCategory(input: {...})`) و**FormData** (مثل `createProduct(formData: FormData)` — يُستخدم عند وجود رفع صورة).
- `createCategory`/`createProduct` يحسبان `display_order` تلقائياً = `max+1` ضمن النطاق.

**نماذج الـDialog:**
- `category-dialog.tsx`: حقول **controlled** عبر `useState` لكل حقل، يُرسل **object literal** للـaction، `useTransition` للـpending.
- `product-dialog.tsx`: `useRef<HTMLFormElement>` + `new FormData(formRef.current!)` عند الإرسال، `useState` منفصل فقط لحالات خاصة (`removeImage`).
- `confirm-dialog.tsx`: مكوّن عام يستقبل `run: () => Promise<Result>`؛ يُستخدم للحذف.
- مكوّنات `dialog.tsx` المتاحة: `Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger, ...`.

**أنواع البيانات الحالية:**
- `Product` و `CategoryNode` مُصدَّران من `menu-view.tsx` (سطور 14–37) — **لا** يحتويان `suggestions_type`/`custom_suggestion_ids` بعد.
- `MenuProduct`/`MenuCategory`/`MenuPayload` في `lib/menu.ts` (سطور 51–95) — كذلك لا تحتويها.

**`lib/menu.ts` — نقاط التعديل:**
- `loadMenu()` سطور 143–149: `products.select()` لا يجلب `suggestions_type, custom_suggestion_ids`؛ ولا يوجد أي query لجدول `complementary_categories`.

**`cart-view.tsx` — خوارزمية الاقتراحات:**
- `useMemo` سطور 99–119 ينفّذ **الخطوة ٣ فقط** (عشوائي من سكاشن خارج السلة). تعليق سطر 100 يذكر أن الخطوتين ١ و٢ معطّلتان.
- البيانات المتاحة: `data.categories` (كل واحد فيه `products: MenuProduct[]`)، `resolved` (عناصر السلة المربوطة بمنتجاتها).

**`design-view.tsx` + `design/actions.ts`:**
- `saveDesign(formData: FormData): Promise<Result>` — `requireTenant()` ثم validation ثم `sb.from('restaurants').update(...)`.
- الفورم controlled بالكامل + `dirty` boolean يقارن كل حقل بـ`initial.*` + زر الحفظ `disabled={pending || !dirty}`.
- لا يوجد مكوّن Switch/Checkbox — النمط الموجود native inputs (`type="color"`, `type="file"`, `<select>`).

**PRD §3.2 — ترتيب أولوية الاقتراحات (`prd.md` سطور 222–227):**
1. الاقتراحات اليدوية (custom) للأصناف في السلة.
2. من السكاشن المكمّلة (complementary).
3. عشوائي من سكاشن مختلفة (fallback).
4. استثناء دائم: الموجود في السلة + غير المتوفر.
5. الترتيب النهائي حسب الوضع المفعّل (يأتي مفروزاً من API).

### الـAPIs المسموحة — `@dnd-kit` (موثّقة من npm registry + dndkit.com)

**التنصيب (الكلاسيكي المستقر — وليس النسخة الجديدة):**
```
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```
يُحَل إلى: `@dnd-kit/core@6.3.1` · `@dnd-kit/sortable@10.0.0` · `@dnd-kit/utilities@3.2.2`. peer = `react >=16.8.0` → React 19 متوافق، **لا حاجة لـ`--legacy-peer-deps`**.

**الـAPI المسموح:**
- من `@dnd-kit/core`: `DndContext` (props: `sensors`, `collisionDetection`, `onDragEnd`)، `closestCenter`، `PointerSensor`، `KeyboardSensor`، `useSensor`، `useSensors`، نوع `DragEndEvent`.
- من `@dnd-kit/sortable`: `SortableContext` (props: `items` = مصفوفة IDs نصّية، `strategy`)، `verticalListSortingStrategy`، `sortableKeyboardCoordinates`، `useSortable({id})` → `{attributes, listeners, setNodeRef, transform, transition, isDragging}`، `arrayMove`.
- من `@dnd-kit/utilities`: `CSS` → `CSS.Transform.toString(transform)`.

**أنماط ممنوعة (anti-patterns):**
- ❌ تنصيب `@dnd-kit/react` (الإصدار 0.4.0) — API مختلف تماماً (`DragDropProvider`/`useDraggable`) وقبل-1.0 غير مستقر.
- ❌ توليد IDs عشوائية وقت الـrender — استخدم UUIDs الحقيقية من DB كـ`id`.
- ❌ استدعاء `arrayMove` بدون حارس `if (over && active.id !== over.id)`.
- ❌ نسيان `'use client'` في أي مكوّن يستدعي `DndContext`/`useSortable`.

---

## دفعة ٠ — المرحلة ١: نظافة فورية

**الهدف:** version control + إزالة الـboilerplate + lint نظيف + اختبار موحّد. لا منطق منتج جديد.

### ١.١ — git
- [x] `git init` في جذر المشروع — `.gitignore` يستثني `.next`/`node_modules`/`.env*`/`*.tsbuildinfo`. أُضيف `.gitattributes` (`eol=lf`) لمنع ضجيج CRLF على Windows.
- [x] commit أول (`8267b9b`) كنقطة استعادة قبل عمل المرحلة ١.
- [ ] إنشاء repo خاص على GitHub وربطه + push. **معلّق — `gh` غير منصَّب على الجهاز؛ مهمة Mustafa** (أو تنصيب `gh`). شرط لربط Coolify (المرحلة ٦).

### ١.٢ — صفحة `/`
- [x] استُبدلت `app/page.tsx` بصفحة عربية RTL: عنوان "Mesa OS Lite" + جملة تعريفية + رابط `/admin`. لا `next/image`، تعتمد RTL/الخط من `app/layout.tsx`.

### ١.٣ — تنظيف ESLint (٢٠ خطأ)
- [x] **`react/no-unescaped-entities`** — ٤ ملفات، استُبدلت `"` بـ`&quot;`.
- [x] **`react-hooks/set-state-in-effect`** — إصلاح نظيف حيث أمكن: حُذفت حالة `logoUrl` الزائدة في `design-view.tsx`، وحُذف effect إعادة الضبط الزائد في `change-password-dialog.tsx` (المكوّن يُعاد تركيبه عبر `key`). الباقي (قراءات mount لـlocalStorage/cart، seed الساعة، reset-on-open) `eslint-disable` مع تعليق "لماذا".
- [x] **`react-hooks/purity`** (`modes-view.tsx`): block-disable مع تعليق — قراءة الساعة مقصودة والـview يُعاد رسمه مع poll الـ10ث.
- [x] التحقق: `npx eslint` → **صفر errors** (٣١ warning في `scripts/` مقبولة).

### ١.٤ — اختبار موحّد
- [x] `scripts/run-smoke.mjs` + `"test"` في `package.json`. يكتشف كل `smoke-*.mjs`، يصنّفها STATIC/ENV/SERVER، يتخطّى ما تنقصه متطلباته (dev server / `.env.local`) بدل أن يفشل، ويخرج بـnon-zero فقط عند فشل حقيقي.
- [x] التحقق: `npm test` — ٦ نجح / ٠ فشل / ٧ مُتخطّى (server-dependent، لا dev server شغّال).

**تحقّق المرحلة ١:** `npx tsc --noEmit` نظيف · `npx eslint` صفر errors · `git log` فيه commit · صفحة `/` عربية · `npm test` موجود.

**حُرّاس:** لا تضف مكتبات. لا تغيّر منطق المنتج. `0001_init.sql` يبقى كما هو (append-only).

---

## دفعة ١ — المرحلة ٢: الاقتراحات المخصّصة (custom)

**الهدف:** صاحب المطعم يحدّد لمنتج معيّن `suggestions_type` ومنتجات مقترَحة يدوياً؛ تظهر في صفحة السلة كأولوية أولى. الأعمدة موجودة في DB (`products.suggestions_type`, `products.custom_suggestion_ids UUID[]`).

### ٢.١ — طبقة البيانات
- [x] `lib/menu.ts`: أُضيف `suggestions_type, custom_suggestion_ids` إلى `products.select(...)`، ولنوعَي `ProductRow` و `MenuProduct`، ويُعبّآن في حلقة بناء `product`.

### ٢.٢ — واجهة نموذج المنتج
- [x] `product-dialog.tsx`: قسم "الاقتراحات" — `<select name="suggestions_type">` (تلقائي/مخصّص)، وعند `custom` قائمة checkboxes native باسم `custom_suggestion_ids` (استثناء المنتج نفسه، `defaultChecked` من `initial`). نمط FormData الموجود.
- [x] `MenuView` يسطّح الشجرة لـ`allProducts` (`{id, name_ar}[]`) ويمرّرها لـ`ProductDialog` — لا حاجة لتعديل `page.tsx` لذلك (الشجرة محمّلة أصلاً). `page.tsx` يجلب العمودين لتعبئة الـedit form، و`Product` type وُسِّع.

### ٢.٣ — الـserver actions
- [x] `menu/actions.ts`: helper محلي `resolveSuggestions` (غير مُصدَّر) — يقرأ الحقلين من FormData، يتحقّق أن كل ID يخصّ `restaurantId` (يرجع خطأ وإلا)، يُسقط المنتج نفسه (`selfId` للـedit)، `default` → `custom_suggestion_ids = null`. مستدعىً من `createProduct` و `updateProduct`.

### ٢.٤ — تفعيل الخطوة ١ في صفحة السلة
- [x] `cart-view.tsx` `useMemo`: الخطوة ١ (مقترحات custom للأصناف في السلة) قبل الخطوة ٣، عبر helper `tryAdd` يمنع التكرار/الموجود/غير المتوفر ويحترم `SUGGESTION_COUNT`. التعليق محدَّث.

**تحقّق المرحلة ٢:** ✅ `tsc` + `eslint` نظيفان · `smoke-modes.mjs` خطوة [5] جديدة (٤ assertions) تؤكّد `/api/menu` يرجع الحقلين — كل الـ٢٤ assertion خضراء على dev server.

**حُرّاس:** لا تُضِف مكتبة multi-select — checkboxes native (RULES §1). تحقّق الملكية إجباري — `custom_suggestion_ids` يجب ألا يحوي IDs خارج المطعم. لا تكسر الخطوة ٣ القائمة.

---

## دفعة ١ — المرحلة ٣: الأصناف المكمّلة (complementary)

**الهدف:** صاحب المطعم يربط سكشن بسكشن مكمّل؛ صفحة السلة تستخدمها كأولوية ثانية. الجدول `complementary_categories(restaurant_id, category_id, complement_id)` موجود، `UNIQUE(category_id, complement_id)`، لكن **لا واجهة ولا query**.

### ٣.١ — الـserver actions
- [x] `menu/actions.ts`: `addComplement({ category_id, complement_id })` و `removeComplement(id)` — `requireTenant()`، فحص ملكية السكشنين، منع `category_id === complement_id`، خطأ `UNIQUE` (`23505`) → "هذا الربط موجود مسبقاً".

### ٣.٢ — الواجهة
- [x] مكوّن جديد `complementary-section.tsx` يُعرَض أسفل `MenuView` في صفحة `/admin/dashboard/menu` — لا تبويب رابع. لكل سكشن: chips للمكمّلات الحالية (× للحذف) + `<select>` لإضافة مكمّل (يستثني نفسه والمربوط مسبقاً).

### ٣.٣ — طبقة البيانات
- [x] `lib/menu.ts`: query ثالثة لـ`complementary_categories` ضمن `Promise.all`، حقل `complement_ids: string[]` على `MenuCategory` يُعبّأ من map (والـvirtual category يأخذ `[]`).

### ٣.٤ — تفعيل الخطوة ٢ في صفحة السلة
- [x] `cart-view.tsx` `useMemo`: الخطوة ٢ (منتجات السكاشن المكمّلة لسكاشن السلة) بين الخطوتين ١ و٣، عبر نفس `tryAdd`. التعليق محدَّث — الخطوات الثلاث مفعّلة.

**تحقّق المرحلة ٣:** ✅ `tsc` + `eslint` نظيفان · `smoke-modes.mjs` خطوة [6] جديدة (٣ assertions) — ربط سكشن يظهر في `complement_ids` على الـpayload، والربط directional. كل الـ٢٧ assertion خضراء على dev server. الحذف: `complementary_categories` يحوي `ON DELETE CASCADE` على `category_id` و`complement_id` — حذف السكشن ينظّفها تلقائياً (مؤكَّد من `0001_init.sql`).

---

## دفعة ١ — المرحلة ٤: مفتاح `show_unavailable_items`

**الهدف:** صاحب المطعم يتحكّم بإظهار/إخفاء الأصناف غير المتوفرة في منيو الزبون. العمود + الفلتر (`lib/menu.ts`) موجودان — الواجهة فقط مفقودة.

- [ ] الموضع: ضمن صفحة `/admin/dashboard/design` (Option A — لا تبويب جديد).
- [ ] `design/page.tsx`: أضف `show_unavailable_items` إلى الـselect الذي يجلب بيانات المطعم ومرّره ضمن `initial`.
- [ ] `design-view.tsx`: `useState` جديد `showUnavailable`، أضفه لشرط `dirty`، أظهره كـ`<input type="checkbox">` (native — لا مكتبة) ضمن نمط الحقول الموجود، وأضفه لـ`FormData` في `onSubmit` كـ`'true'`/`'false'`.
- [ ] `design/actions.ts` `saveDesign`: اقرأ `show_unavailable_items` من FormData وأدرجه في كائن `update`.

**تحقّق المرحلة ٤:** `tsc` + `eslint` نظيفان · تبديل المفتاح والحفظ يغيّر العمود في DB · منيو الزبون يعكس التغيير خلال دورة polling.

**حُرّاس:** native checkbox فقط. لا تبويب رابع.

---

## دفعة ١ — المرحلة ٥: السحب والإفلات (drag & drop)

**الهدف:** إعادة ترتيب السكاشن والمنتجات بالسحب، وحفظ `display_order`.

### ٥.١ — التنصيب
- [ ] `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities` (انظر Phase 0 — الإصدارات والـAPI). تحقّق أنها أُضيفت لـ`package.json` و`commit`.

### ٥.٢ — server action للترتيب
- [ ] في `menu/actions.ts`: `reorderCategories(orderedIds: string[])` و `reorderProducts(categoryId: string, orderedIds: string[])` — نمط object-literal، `requireTenant()`، فحص أن كل ID يخصّ `restaurantId` (والمنتجات تخصّ `categoryId`)، تحديث `display_order` = الفهرس. حدّث الصفوف بأقل عدد queries ممكن.

### ٥.٣ — الواجهة
- [ ] حوّل قوائم `menu-view.tsx` لقوائم قابلة للسحب باستخدام النمط الكلاسيكي (مقتطف Phase 0): `DndContext` + `SortableContext` (`verticalListSortingStrategy`) للسكاشن الجذرية، و`SortableContext` منفصل لمنتجات كل سكشن، وللسكاشن الفرعية. `useSortable` لكل عنصر، مقبض سحب مرئي. `id` = UUID الحقيقي.
- [ ] `onDragEnd`: حارس `over` + `arrayMove` + تحديث الحالة المحلية تفاؤلياً ثم استدعاء الـserver action؛ عند الفشل `router.refresh()` للتراجع.
- [ ] `menu-view.tsx` بالفعل `'use client'` — أكّد ذلك.

**تحقّق المرحلة ٥:** `tsc` + `eslint` نظيفان · سحب سكشن/منتج يحفظ `display_order` ويبقى بعد إعادة التحميل · الترتيب ينعكس على منيو الزبون · لا تحذيرات hydration في console.

**حُرّاس:** لا `@dnd-kit/react`. حارس `over === null`. IDs ثابتة من DB. فحص الملكية في الـaction. لا state management خارجي — `useState` محلي يكفي.

---

## دفعة ٢ — المرحلة ٦: الأيقونات والنشر والتحقّق

**الهدف:** أيقونات حقيقية + أول deploy إنتاجي على HTTPS فعلي.

- [ ] **أيقونات PWA:** استبدال placeholders (حرف M) بتصميم حقيقي → تشغيل `scripts/gen-icons.mjs` أو استبداله لإنتاج `icon-192/512/512-maskable/apple-touch-icon`. (التصميم قرار Mustafa).
- [ ] **النشر (Mustafa ينفّذ، الخطة ترشد):** اتبع `DEPLOY.md` — DNS على Cloudflare لـ`qaema.app` → إنشاء تطبيق Coolify وربط الـrepo → متغيرات البيئة (٣ build + ٦ runtime) → أول deploy + شهادة Let's Encrypt.
- [ ] **بعد النشر — تشغيل migrations:** `0001` ثم `0002` على Supabase، ثم `UPDATE auth.users ... role:owner` يدوياً (Mustafa يشغّل SQL بنفسه).
- [ ] **التحقّق على HTTPS فعلي:** فحوصات `DEPLOY.md` (curl + متصفّح) — رفع صورة يصل R2 ويُعرَض، الـSW يُسجَّل ويتحكّم على `/r/`، الـmanifest يُحمَّل، الأوضاع تنعكس.

**تحقّق المرحلة ٦:** الموقع يفتح على `https://qaema.app` · إنشاء حساب من لوحة المالك يعمل end-to-end · منيو زبون حقيقي يُعرَض بصورة من R2 · الأوضاع الأربعة تعمل على الإنتاج.

**حُرّاس:** لا تضع secrets في الـrepo. تحقّق من `Service-Worker-Allowed: /r/`. لا تحوّل الـlazy revert لـcron.

---

## دفعة ٣ — المرحلة ٧: التحقّق اليدوي على الأجهزة

**الهدف:** ما لا تغطّيه الأتمتة (يحتاج أجهزة فعلية — Mustafa).

- [ ] Lighthouse على `/r/[slug]` — هدف PRD: تحميل < ١.٥ث على 3G، PWA installable.
- [ ] install prompt: Chrome desktop + Android (banner) + iOS Safari (Add to Home Screen).
- [ ] offline: DevTools Network=Offline + reload بعد أول زيارة → المنيو يعمل ١٠٠٪.
- [ ] التبديل اليدوي بين الأوضاع الأربعة على جهاز حقيقي + رصد انعكاسه على الزبون < ٣ث.
- [ ] فحص بصري لكل اللغات (AR/EN/KU) و fallback العربي.

**تحقّق المرحلة ٧:** كل مقاييس PRD §٧ محقّقة على أجهزة فعلية.

---

## المرحلة ٨ — التحقّق النهائي

- [ ] `npx tsc --noEmit` نظيف · `npx eslint` صفر errors.
- [ ] `npm test` — كل سكربتات smoke خضراء (شغّل dev server أولاً للسكربتات التي تحتاجه).
- [ ] grep للأنماط الممنوعة: لا `@dnd-kit/react` في `package.json` · لا `confirm(`/`alert(` native · لا `expires` على cookie الجلسة · لا استدعاء `getServiceClient` من client component.
- [ ] تحديث `PHASES.md` (علّم البنود) و `PROGRESS.md` (سطر لكل جلسة) و `prd.md` (علّم §٦ المنجَز).
- [ ] تحديث `CLAUDE.md`: إزالة عبارة "Pre-code" — المشروع لم يعد pre-code.
- [ ] قائمة "مخاطر معروفة" موثّقة: rate limit in-memory، جلسات دائمة بلا إبطال، لا حدّ حجم لرفع الصور.

---

## ترتيب التنفيذ الموصى به

١ (نظافة) → ٢ → ٣ → ٤ → ٥ (دفعة الميزات، بأي ترتيب لكن ٢ قبل ٣ لأن كليهما يلمس `cart-view` `useMemo`) → ٦ (نشر) → ٧ (يدوي) → ٨ (تحقّق نهائي).

المراحل ١–٥ كود محض (Claude ينفّذها). ٦ نشر مشترك. ٧ يدوي بالكامل (Mustafa).
