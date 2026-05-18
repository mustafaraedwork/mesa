# خطة: التحليلات + صفحة المنتج

> أُنشئت 2026-05-18 بعد نقاش مع المالك. القاعدة الأم (RULES.md): البساطة أولاً.
> المرجع للتصميم: نظام تصميم ميسا (مطبَّق بالفعل).

## الهدف

صاحب المطعم يرى — يوماً بيوم — كم فُتح المنيو، وكم فُتح/أُضيف كل منتج، ليقارن أثر تغيير الصور والترتيب بسرعة.

**ملاحظة نطاق:** `prd.md` §٨ يستثني "تقارير المبيعات" — هذا **تحليل تفاعل** (لا طلبات ولا مدفوعات في التطبيق)، مختلف، والمالك يطلبه صراحةً → إضافة نطاق مقبولة.

## القرارات المثبّتة (من المالك)

- صفحة منتج جديدة؛ النقر على بطاقة المنتج يفتحها.
- **زرّان للإضافة:** زرّ "+ أضف" يبقى على بطاقة المنيو (إضافة سريعة) + زرّ "أضف للطلب" داخل صفحة المنتج.
- تحليلات **يوماً بيوم** (آخر ٧ أيام) — لا عدّاد تراكمي.
- المقاييس: **فتحات + إضافات فقط**. لا سكاشن، لا heatmaps، لا تحويلات.

## الأحداث الثلاثة

| `kind` | متى |
|---|---|
| `menu_open` | تحميل صفحة المنيو `/r/{slug}` |
| `product_open` | تحميل صفحة منتج (= الضغط على البطاقة) |
| `product_add` | إضافة للسلة (من زرّ البطاقة **أو** زرّ صفحة المنتج) |

---

## المرحلة أ — طبقة البيانات

**`supabase/migrations/0003_events.sql`** (يشغّله Mustafa):
```sql
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('menu_open','product_open','product_add')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_events_restaurant_created ON events(restaurant_id, created_at);
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner full access" ON events
  FOR ALL USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'owner');
```
- `product_id` nullable (لا قيمة لـ`menu_open`). `ON DELETE CASCADE` ينظّف أحداث المنتج/المطعم المحذوف.
- لا سياسة قراءة/كتابة عامة — الكتابة عبر API بـservice-role، والقراءة من لوحة Tenant بـservice-role (نفس نمط `tenant_sessions`).

**`POST /api/track/route.ts`** — عام (الزبون غير مسجَّل):
- body: `{ slug, kind, product_id? }`. يتحقّق من `kind`، يحوّل `slug` → `restaurant_id` (موجود ونشط)، ويتحقّق أن `product_id` (إن وُجد) يخصّ المطعم.
- `insert` صفّاً واحداً، يرجع 204، headers `no-store`. خفيف.
- مخاطرة مقبولة (MVP): نداء عام قد يُضخَّم بالـbots — لا rate limit الآن (RULES — منيو لا بنك).

**`lib/track.ts`** — helper صغير: `track(kind, { slug, productId? })` عبر `navigator.sendBeacon` (مع fallback `fetch` keepalive) كي لا يبطّئ الصفحة.

## المرحلة ب — صفحة المنتج + ربط البطاقة

**`app/r/[slug]/p/[productId]/page.tsx`** (server) + **`product-view.tsx`** (client):
- يعيد استخدام `loadMenu(slug)` الموجود ويلتقط المنتج بالـid (لا query جديد). منتج غير موجود/مطعم معطّل → `ClosedScreen` أو رجوع للمنيو.
- المحتوى: صورة كبيرة + الاسم (مع تبديل اللغة) + السعر (والخصم مشطوباً إن وُجد) + وقت التحضير + زرّ "أضف للطلب" + رابط رجوع. ألوان المطعم + تصميم ميسا.
- `product-view.tsx`: `useEffect` mount → `track('product_open')`؛ زرّ الإضافة → `addToCart` + `track('product_add')`.

**`menu-view.tsx` (الزبون):**
- `useEffect` mount → `track('menu_open')` (dedupe بسيط: مرة واحدة لكل tab-session عبر `sessionStorage`).
- `ProductCard`: جسم البطاقة (الصورة + الاسم) يصير `<Link>` لـ`/r/{slug}/p/{id}`؛ عمود السعر + زرّ "+ أضف" يبقى **شقيقاً** للرابط لا بداخله (تفادي زرّ داخل رابط). زرّ "+ أضف" يستدعي `addToCart` + `track('product_add')`.

## المرحلة ج — صفحة التحليلات + التبويب الرابع

**`bottom-nav.tsx`:** ٣ أزرار → ٤ — المنيو · الأوضاع · **التحليلات** · التصميم (`grid-cols-3` → `grid-cols-4`).

**`app/admin/dashboard/analytics/page.tsx`** (server، `requireTenant()`):
- query: `events` لهذا المطعم، `created_at >= now() - 7 يوم`. التجميع بـ"يوم" بتوقيت بغداد (+٣) في JS بعد الجلب.
- العرض (جدول بسيط، لا رسوم):
  - **فتحات المنيو** — شريط ٧ خلايا، كل يوم برقمه.
  - **جدول المنتجات** — لكل منتج: الاسم · سكشنه · صورة ✓/✗ · فتحاته (اليوم / ٧ أيام) · إضافاته (اليوم / ٧ أيام). مرتّب تنازلياً حسب الفتحات.
- هكذا: غيّر صورة منتج اليوم → قارن رقم "اليوم" بالأيام السابقة فوراً.

## التحقّق

`tsc` + `eslint` + `next build` خضراء · بعد تشغيل المهاجرة: smoke صغير يتحقّق أن `/api/track` يُدخل صفّاً وأن صفحة المنتج تُحمَّل.

## حُرّاس

- الكتابة عبر service-role فقط؛ فحص ملكية `product_id`.
- زرّ الإضافة لا يكون داخل `<a>` — جسم البطاقة رابط، الزرّ شقيق.
- لا مقاييس إضافية (سكاشن/heatmaps/تحويلات).
- ألوان المطعم على صفحة المنتج محفوظة، وتصميم ميسا للبقية.
