# Mesa OS Lite – PRD (Product Requirements Document)

**النسخة:** 0.5
**التاريخ:** مايو 2026
**المالك:** Mustafa
**الحالة:** Final – جاهز للتطوير

---

## 1. نظرة عامة (Overview)

### 1.1 ما هو المشروع؟

**Mesa OS Lite** منصة SaaS ذات بيعة واحدة (One-time purchase) للمطاعم والكافيهات، توفر:

- منيو رقمي ذكي يعرض على الزبون عبر QR Code
- لوحة تحكم PWA لصاحب المطعم تعمل من الهاتف
- 4 أوضاع ذكية للعرض (عادي / سرعة / ربح / إغلاق) – وهي الميزة المميزة
- دعم 3 لغات (عربي / إنجليزي / كردي)
- يعمل offline بعد أول زيارة

### 1.2 نموذج العمل

- **بيعة واحدة** للعميل (لا اشتراكات شهرية)
- المالك (Mustafa) ينشئ الحسابات يدوياً
- الدفع يتم محلياً بين المالك والعميل
- صيانة سنوية اختيارية (يحددها المالك خارج النظام)

### 1.3 الفئات المستهدفة

| الفئة | الوصف |
|---|---|
| السوق الأساسي | المطاعم والكافيهات في العراق |
| السوق الموسّع | الوطن العربي (دعم متعدد العملات) |
| حجم العميل | مطاعم صغيرة ومتوسطة بفرع واحد |

---

## 2. أنواع المستخدمين (User Roles)

### 2.1 الزبون (End Customer)
- يمسح QR على الطاولة
- لا يحتاج تسجيل دخول
- يتصفح المنيو ويختار الأصناف في "السلة"
- يقرأ القائمة للنادل شفهياً

### 2.2 صاحب المطعم (Restaurant Owner / Tenant)
- يدخل بـ Username + Password (يعطيهما المالك يدوياً)
- جلسة دائمة لا تنتهي
- يقدر يدخل من أكثر من جهاز بنفس الحساب
- يدير المنيو والأوضاع والتصميم

### 2.3 المالك (Platform Owner – Mustafa)
- يدخل بحساب Supabase Auth
- ينشئ ويعطّل ويحذف حسابات العملاء
- يشاهد إحصائيات المنصة

---

## 3. الميزات التفصيلية (Features)

### 3.1 لوحة تحكم العميل (Tenant Dashboard)

تظهر كـ PWA على الهاتف، تتكون من **شريط سفلي بـ 3 أزرار**:

#### 🍽️ الزر الأول: المنيو (Menu)

**إدارة السكاشن (Categories):**
- إنشاء سكشن رئيسي (مثلاً: "مشروبات باردة")
- إنشاء سكشن فرعي داخل سكشن (مثلاً: "آيس تي" داخل "مشروبات باردة")
- مستويات: 2 فقط (parent + child)
- ترتيب يدوي بالـ Drag & Drop
- اسم السكشن: AR إجباري + EN/KU اختياري
- حذف نهائي

**إدارة المنتجات (Products):**

| الحقل | إجباري؟ | الوصف |
|---|---|---|
| الاسم (AR) | ✅ | الاسم العربي |
| الاسم (EN) | ❌ | الاسم الإنجليزي |
| الاسم (KU) | ❌ | الاسم الكردي |
| السعر | ✅ | رقم بالعملة المحددة |
| نسبة الربح % | ✅ | للحسابات الداخلية ووضع رفع الأرباح |
| وقت التحضير | ✅ | بالدقائق – لوضع السرعة |
| الصورة | ❌ | تُضغط تلقائياً 800x800، تُرفع لـ Cloudflare R2 |
| السكشن | ✅ | يختار من القائمة |
| متوفر / غير متوفر | ✅ | toggle |
| الاقتراحات | ❌ | "default" أو قائمة منتجات يدوية |

**عمليات على المنتج:**
- إضافة / تعديل / حذف نهائي
- ترتيب داخل السكشن بالـ Drag & Drop

**الإعدادات داخل تبويب المنيو:**
- السكاشن المكمّلة (لمنطق الاقتراحات الافتراضي)
  - مثال: "طعام رئيسي" مكمّل بـ ["مشروبات", "حلويات"]
- إظهار / إخفاء الأصناف غير المتوفرة من واجهة الزبون

---

#### 🎚️ الزر الثاني: الأوضاع (Modes)

**القاعدة:** وضع واحد فقط مفعّل في كل لحظة.

##### الوضع 1: عادي (Normal)
- الترتيب اليدوي للسكاشن والمنتجات
- لا توجد تعديلات على العرض

##### الوضع 2: السرعة (Rush Hour)
- يُفعّل عندما يكون المطعم مزدحم
- داخل كل سكشن، الأصناف الأسرع تحضيراً تظهر أولاً
- ترتيب تصاعدي حسب `prep_time_minutes`
- ترتيب السكاشن نفسه يبقى كما هو

##### الوضع 3: رفع الأرباح (Profit Mode)
- داخل كل سكشن، الأصناف الأعلى ربحاً تظهر أولاً
- ترتيب تنازلي حسب `profit_percentage`
- ترتيب السكاشن نفسه يبقى كما هو

##### الوضع 4: الإغلاق (Closing Mode)
- لتقليل الخسائر من الأصناف المعرّضة للتلف
- يحدد العميل:
  - الأصناف المشمولة (multi-select)
  - نسبة الخصم (5% / 10% / 20%)
  - مدة الوضع (1-24 ساعة)
- النتيجة على واجهة الزبون:
  - يظهر سكشن جديد **في الأعلى** بعنوان "عروض اليوم"
  - الأصناف المختارة تظهر فيه مع السعر الأصلي مشطوب والسعر بعد الخصم
  - الأصناف تبقى أيضاً في سكاشنها الأصلية، **بنفس السعر المخفض** (السعر الأصلي مشطوب + سعر الخصم) – لتسهيل الإيجاد
- **Countdown Timer** ظاهر للعميل في لوحة التحكم
- عند انتهاء الوقت: رجوع تلقائي للوضع العادي + الأصناف ترجع لأسعارها الأصلية بدون خصم في كل مكان

##### تغيير الوضع
- زر تبديل أعلى تبويب الأوضاع
- التغيير يؤثر فوراً على واجهة الزبون

---

#### 🎨 الزر الثالث: التصميم (Design)

**العناصر القابلة للتخصيص:**
- اللون الأساسي (Primary Color) – Color picker
- لون الخلفية (Background Color) – Color picker
- اللوغو – رفع/حذف صورة (مربع/مستطيل، أعلى المنيو)
- اسم المطعم (يظهر بدل اللوغو لو ما رفع لوغو)
- العملة (تُحدد مرة واحدة من الإعدادات)
  - الخيارات: IQD, USD, EUR, SAR, AED, EGP, KWD, QAR, BHD, OMR, JOD, LBP, SYP, MAD, TND, DZD, LYD, YER

**معاينة حية (Live Preview):**
- نصف الشاشة (أو نافذة منبثقة) تعرض المنيو كما يراه الزبون
- يتحدّث فورياً مع كل تغيير
- زر "حفظ" يطبّق التغييرات على واجهة الزبون

**رابط المنيو + QR Code:**
- عرض الرابط الكامل (مثلاً `domain.com/r/pizza-house`)
- زر نسخ الرابط
- زر تحميل QR كصورة PNG
- زر تحميل QR كملف PDF (للطباعة بحجم A4)
- إعادة توليد QR لو غيّر slug المطعم

---

### 3.2 واجهة الزبون (Customer Menu)

#### الوصول
- الزبون يمسح QR Code من الطاولة
- يفتح الرابط `domain.com/r/{restaurant-slug}`
- لا توجد شاشة تسجيل دخول

#### Layout الصفحة

```
┌─────────────────────────────────────┐
│  [اللوغو]  اسم المطعم  [AR|EN|KU]  │ ← Header
├─────────────────────────────────────┤
│                                     │
│  🔥 عروض اليوم (لو مفعل وضع إغلاق)│
│  ┌────┐ ┌────┐ ┌────┐              │
│  │P1  │ │P2  │ │P3  │              │
│  └────┘ └────┘ └────┘              │
│                                     │
│  ☕ مشروبات باردة                   │
│    ▸ آيس تي                         │
│      ┌────┐ ┌────┐ ┌────┐          │
│      │ P1 │ │ P2 │ │ P3 │          │
│      └────┘ └────┘ └────┘          │
│    ▸ موهيتو                         │
│      ...                            │
│                                     │
├─────────────────────────────────────┤
│  🛒 طلبي (3 أصناف – 15,000 د.ع)   │ ← Floating Cart Button
└─────────────────────────────────────┘
```

#### عناصر الواجهة

**Header:**
- لوغو المطعم (لو موجود) + اسم المطعم
- زر تبديل اللغة (AR / EN / KU)
- لو لغة ما متوفرة لمنتج معين، يظهر بالعربي افتراضياً

**عرض المنتجات:**
- بطاقات (Cards) فيها: صورة + اسم + سعر
- لو لا توجد صورة: placeholder graphic بألوان المطعم
- لو "غير متوفر":
  - الإعداد A (يخفي): لا يظهر
  - الإعداد B (يظهر): bg رمادي + كلمة "غير متوفر" + زر معطّل
- وقت التحضير يظهر كأيقونة صغيرة (⏱️ 5 دقائق)

**Floating Cart Button:**
- زر عائم أسفل الشاشة
- يظهر عدد الأصناف والمجموع
- النقر يفتح صفحة "طلبي"

**صفحة "طلبي" (Cart):**
- قائمة بالأصناف المختارة:
  - الصورة + الاسم + السعر للوحدة
  - أزرار + / – لتعديل الكمية
  - زر حذف
- المجموع الكلي
- **اقتراحات (3-4 منتجات):**
  - أولاً: الاقتراحات اليدوية للأصناف الموجودة في السلة
  - ثم: من السكاشن المكمّلة
  - لو ما حدد سكاشن مكمّلة: أصناف عشوائية من سكاشن مختلفة عن سكاشن السلة
  - استثناء: الأصناف الموجودة بالسلة + غير المتوفرة
  - الترتيب: حسب الوضع المفعّل
- زر "اطلب من الكابتن" – يعرض شاشة كبيرة فيها قائمة الطلب (للقراءة الصوتية)

#### السلة المحلية
- تخزين في `localStorage`
- TTL: ساعتان (تنحذف تلقائياً بعد ساعتين من آخر تعديل)
- Key: `mesa-cart-{restaurantSlug}`

#### Offline (PWA)
- بعد أول زيارة، الصفحة تعمل offline
- الـ Service Worker يحفظ:
  - HTML/CSS/JS الأساسي
  - بيانات المنيو (JSON)
  - صور المنتجات (cache LRU – آخر 50 صورة)
- التحديث: عند فتح الصفحة وهناك نت، يتحقق من تحديثات ويسحب البيانات الجديدة
- لو offline والمنيو محدّث على السيرفر: يعرض النسخة المحلية

---

### 3.3 لوحة المالك (Owner Dashboard)

**المسار:** `domain.com/owner`
**الدخول:** Supabase Auth (email + password)

#### صفحة 1: نظرة عامة (Overview)
- إجمالي الحسابات
- الحسابات النشطة
- الحسابات المعطّلة
- إجمالي المنتجات في النظام (مجموع كل المطاعم)
- إجمالي السكاشن
- أحدث 5 حسابات تم إنشاؤها

#### صفحة 2: إدارة الحسابات (Accounts)
**جدول بكل المطاعم:**

| العمود | الوصف |
|---|---|
| اسم المطعم | يقابل لـ slug في الرابط |
| Username | اللي يستخدمه العميل للدخول |
| الحالة | نشط / معطّل |
| عدد المنتجات | |
| عدد السكاشن | |
| تاريخ الإنشاء | |
| آخر دخول | |
| الإجراءات | تعطيل / تفعيل / تغيير باسوورد / حذف |

**زر "إنشاء حساب جديد":**
- اسم المطعم (Display Name)
- Slug (للرابط)
- Username
- Password (يُولد تلقائياً + إمكانية التعديل)
- زر "نسخ بيانات الدخول"

**حذف حساب:**
- تأكيد مزدوج
- يحذف: المطعم + كل السكاشن + المنتجات + الصور من R2

**تعطيل حساب:**
- العميل لا يقدر يدخل لوحة التحكم
- صفحة المنيو للزبون تعرض: "هذا المنيو غير متوفر حالياً"

---

## 4. التصميم التقني (Technical Architecture)

### 4.1 Stack

| الطبقة | التقنية |
|---|---|
| Frontend | Next.js 15 (App Router) + TypeScript |
| Styling | TailwindCSS + shadcn/ui |
| Database | Supabase (Postgres) – Frankfurt region |
| Auth (Owner) | Supabase Auth |
| Auth (Tenant) | Custom (جدول users + bcrypt) – جلسة دائمة |
| Storage | Cloudflare R2 |
| Image Compression | sharp (server-side) |
| Hosting | Coolify على Contabo VPS |
| PWA | Manifest + Service Worker (Workbox) |
| Realtime (للأوضاع) | Supabase Realtime |
| QR Generation | qrcode (npm) |

### 4.2 Routing

```
/                         → Landing page (اختياري لاحقاً)
/r/:slug                  → صفحة المنيو للزبون
/r/:slug/cart             → صفحة "طلبي"
/admin                    → صفحة دخول العميل
/admin/dashboard          → لوحة العميل (PWA)
/admin/dashboard/menu     → تبويب المنيو
/admin/dashboard/modes    → تبويب الأوضاع
/admin/dashboard/design   → تبويب التصميم
/owner                    → صفحة دخول المالك
/owner/dashboard          → لوحة المالك
/owner/dashboard/accounts → إدارة الحسابات
```

### 4.3 Database Schema (Supabase / Postgres)

#### جدول `restaurants`
```sql
CREATE TABLE restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Design
  logo_url TEXT,
  primary_color TEXT DEFAULT '#000000',
  background_color TEXT DEFAULT '#FFFFFF',
  currency TEXT DEFAULT 'IQD',
  
  -- Settings
  show_unavailable_items BOOLEAN DEFAULT TRUE,
  
  -- Mode state
  active_mode TEXT DEFAULT 'normal' CHECK (active_mode IN ('normal','rush','profit','closing')),
  closing_mode_ends_at TIMESTAMPTZ,
  closing_mode_discount INTEGER, -- 5, 10, or 20
  
  -- Meta
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

CREATE INDEX idx_restaurants_slug ON restaurants(slug);
CREATE INDEX idx_restaurants_username ON restaurants(username);
```

#### جدول `categories`
```sql
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  
  name_ar TEXT NOT NULL,
  name_en TEXT,
  name_ku TEXT,
  display_order INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_categories_restaurant ON categories(restaurant_id);
CREATE INDEX idx_categories_parent ON categories(parent_id);
```

#### جدول `products`
```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  
  name_ar TEXT NOT NULL,
  name_en TEXT,
  name_ku TEXT,
  
  price NUMERIC(10,2) NOT NULL,
  profit_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  prep_time_minutes INTEGER NOT NULL DEFAULT 5,
  
  image_url TEXT,
  is_available BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  
  -- Closing mode flag
  is_in_closing_mode BOOLEAN DEFAULT FALSE,
  
  -- Suggestions: 'default' or array of product IDs
  suggestions_type TEXT DEFAULT 'default' CHECK (suggestions_type IN ('default','custom')),
  custom_suggestion_ids UUID[],
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_restaurant ON products(restaurant_id);
CREATE INDEX idx_products_category ON products(category_id);
```

#### جدول `complementary_categories`
```sql
CREATE TABLE complementary_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  complement_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  UNIQUE(category_id, complement_id)
);
```

#### جدول `tenant_sessions`
```sql
CREATE TABLE tenant_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  device_info TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
  -- لا expires_at لأن الجلسة دائمة
);

CREATE INDEX idx_sessions_token ON tenant_sessions(token);
```

### 4.4 Row Level Security (RLS)

```sql
-- Restaurants: العميل يقرأ/يعدل سجله فقط
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full access" ON restaurants
  FOR ALL USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'owner');

CREATE POLICY "Public read active" ON restaurants
  FOR SELECT USING (is_active = TRUE);

-- Categories & Products: نفس المنطق
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON categories
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE id = categories.restaurant_id AND is_active = TRUE
    )
  );

CREATE POLICY "Public read" ON products
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE id = products.restaurant_id AND is_active = TRUE
    )
  );

-- Tenant operations عبر API routes تتحقق من الـ session token
```

### 4.5 الأمان (Security)

- كلمات السر: bcrypt (cost=10)
- جلسات العميل: token عشوائي 64 حرف، يُحفظ في httpOnly cookie
- جلسات المالك: Supabase Auth JWT
- Rate limiting على Login (5 محاولات / 15 دقيقة)
- CORS مقيد على الدومين الرئيسي

### 4.6 تنظيم الصور (Image Pipeline)

```
العميل يرفع صورة (أي حجم/صيغة)
        ↓
Next.js API Route يستقبل الصورة
        ↓
sharp يضغطها:
  - Max dimension: 800x800
  - Format: WebP
  - Quality: 80
        ↓
Upload to Cloudflare R2 bucket
        ↓
Return URL → save in DB
```

### 4.7 PWA Configuration

**manifest.json (للتنانت):**
```json
{
  "name": "Mesa OS – Restaurant Dashboard",
  "short_name": "Mesa OS",
  "start_url": "/admin/dashboard",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#000000",
  "background_color": "#FFFFFF",
  "icons": [...]
}
```

**Service Worker:**
- Strategy للأصول الثابتة: CacheFirst
- Strategy لـ API: NetworkFirst (fallback to cache)
- Strategy للصور: CacheFirst with max 50 entries

### 4.8 آلية تحديث المنيو للزبون

عندما يغيّر العميل الوضع أو الأصناف، الزبون لا يرى التغيير فوراً (لأنه يعمل offline أو الصفحة مفتوحة من قبل).

**الآلية المقترحة:**
- كل صفحة منيو تجلب البيانات عند الفتح (NetworkFirst)
- لو الصفحة مفتوحة بالفعل: تحديث تلقائي كل 30 ثانية (polling خفيف)
- البديل (لو احتجنا تحديث فوري): Supabase Realtime على جدول `restaurants` فقط

**القرار الافتراضي:** Polling كل 30 ثانية (أبسط، يكفي لاحتياج المشروع).

---

## 5. خريطة الشاشات (Screen Map)

### 5.1 شاشات العميل (Tenant – PWA)

| # | الشاشة | الوصف |
|---|---|---|
| T1 | تسجيل الدخول | Username + Password |
| T2 | الرئيسية – المنيو | قائمة السكاشن والمنتجات |
| T3 | إضافة/تعديل سكشن | نموذج |
| T4 | إضافة/تعديل منتج | نموذج كامل |
| T5 | اختيار اقتراحات يدوية | Multi-select للمنتجات |
| T6 | إعدادات المنيو | السكاشن المكمّلة + show_unavailable |
| T7 | الأوضاع | عرض الـ 4 أوضاع + active state |
| T8 | إعداد وضع الإغلاق | اختيار أصناف + خصم + مدة |
| T9 | التصميم | ألوان + لوغو + اسم |
| T10 | معاينة المنيو | iframe للمنيو الحالي |
| T11 | QR Code | عرض ونسخ وتحميل |
| T12 | إعدادات عامة | العملة فقط |

### 5.2 شاشات الزبون

| # | الشاشة | الوصف |
|---|---|---|
| C1 | المنيو | الصفحة الرئيسية |
| C2 | تفاصيل المنتج (Modal) | اختياري – صورة كبيرة + وصف |
| C3 | السلة (طلبي) | الأصناف + الاقتراحات + المجموع |
| C4 | شاشة "اقرأ للنادل" | عرض كبير وواضح |
| C5 | المطعم غير متوفر | لو معطّل |

### 5.3 شاشات المالك

| # | الشاشة | الوصف |
|---|---|---|
| O1 | تسجيل الدخول | Email + Password |
| O2 | نظرة عامة | الإحصائيات |
| O3 | إدارة الحسابات | جدول كامل |
| O4 | إنشاء حساب | Form |
| O5 | تفاصيل حساب | تعديل + إحصائيات + إجراءات |

---

## 6. خطة التنفيذ (Implementation Plan)

### المرحلة 1: البنية الأساسية (3-4 أيام)
- [x] إعداد Next.js 15 + TypeScript + Tailwind + shadcn
- [x] إعداد Supabase project (Frankfurt)
- [x] إنشاء جداول قاعدة البيانات + RLS
- [x] إعداد Cloudflare R2 bucket
- [x] إعداد Coolify على Contabo VPS
- [x] إعداد custom auth للتنانت

### المرحلة 2: لوحة المالك (1-2 يوم)
- [x] صفحة دخول المالك (Supabase Auth)
- [x] نظرة عامة + إحصائيات
- [x] إنشاء/تعديل/حذف/تعطيل الحسابات

### المرحلة 3: لوحة العميل – المنيو (3-4 أيام)
- [x] صفحة دخول العميل
- [x] CRUD السكاشن (مع sub-categories)
- [x] CRUD المنتجات (3 لغات + الصور + الضغط)
- [x] Drag & Drop للترتيب
- [x] إعدادات السكاشن المكمّلة

### المرحلة 4: الأوضاع (2-3 أيام)
- [x] منطق الـ 4 أوضاع
- [x] واجهة وضع الإغلاق + المؤقت
- [x] خوارزمية إعادة الترتيب حسب الوضع
- [x] Cron job أو scheduled task للرجوع التلقائي بعد انتهاء الإغلاق

### المرحلة 5: التصميم + QR (1-2 يوم)
- [x] تخصيص الألوان واللوغو
- [x] معاينة حية
- [x] توليد QR + تحميله

### المرحلة 6: واجهة الزبون (3-4 أيام)
- [x] صفحة المنيو
- [x] تبديل اللغة
- [x] السلة المحلية + TTL
- [x] صفحة "طلبي" + الاقتراحات
- [x] خوارزمية الاقتراحات (يدوي → سكاشن مكمّلة → عشوائي)
- [x] شاشة "اقرأ للنادل"

### المرحلة 7: PWA + Offline (1-2 يوم)
- [x] Manifest للتنانت
- [x] Manifest للمنيو (اختياري للزبون)
- [x] Service Worker
- [x] Cache strategies

### المرحلة 8: التحسينات والاختبار (2-3 أيام)
- [x] اختبار شامل على أجهزة مختلفة
- [x] اختبار الأوضاع والتفعيل التلقائي
- [x] اختبار الـ offline
- [x] تحسين الأداء (lazy loading، image optimization)

**الإجمالي التقديري:** 16-24 يوم تطوير

---

## 7. مقاييس النجاح (Success Metrics)

- زمن إنشاء حساب جديد: أقل من دقيقة
- زمن إضافة منتج: أقل من 30 ثانية
- زمن تحميل صفحة المنيو: أقل من 1.5 ثانية (3G)
- المنيو يعمل offline 100% بعد أول زيارة
- التغيير من وضع لآخر: ينعكس على الزبون في أقل من 3 ثوان

---

## 8. خارج النطاق (Out of Scope) – للنسخة الحالية

هذه ميزات **لن** يتم تنفيذها في v0.5:

- ❌ تتبع الطلبات (KDS / Kitchen Display)
- ❌ نظام طاولات بـ QR منفصل لكل طاولة
- ❌ مدفوعات أونلاين
- ❌ توصيل (Delivery)
- ❌ نقاط ولاء أو كوبونات
- ❌ تكامل مع POS خارجي
- ❌ إشعارات push للنادل
- ❌ تقارير مبيعات
- ❌ متعدد الفروع (Multi-branch)
- ❌ ترجمة AI تلقائية
- ❌ دعم متعدد المستخدمين لنفس الحساب (موظفين)

---

## 9. مخاطر ومسائل مفتوحة (Risks & Open Questions)

### مخاطر تقنية
- **R1:** RLS على Supabase يحتاج اختبار دقيق لمنع تسرّب بيانات بين الحسابات
- **R2:** Cloudflare R2 egress: لو حساب نشط جداً، تكلفة الـ egress قد ترتفع. Mitigation: caching على الـ CDN
- **R3:** Service Worker قد يعطّل تحديثات حرجة. Mitigation: versioning + force update strategy

### قرارات معلّقة
- اسم الدومين (يُحدد لاحقاً)
- استراتيجية التسعير الفعلي ($800 ثابت أو متدرج؟)

---

## 10. ملحقات (Appendices)

### أ. قاموس المصطلحات

| المصطلح | المعنى |
|---|---|
| Tenant | مطعم/كافيه يستخدم النظام (= العميل) |
| Owner | مالك المنصة (Mustafa) |
| Slug | اسم URL-friendly للمطعم (e.g. `pizza-house`) |
| Mode | أحد الأوضاع الأربعة |
| PWA | Progressive Web App |
| RLS | Row Level Security في Postgres |

### ب. مرجع الألوان الافتراضية

- Primary default: `#000000`
- Background default: `#FFFFFF`
- Closing mode badge: `#DC2626`
- Available indicator: `#16A34A`

### ج. قائمة العملات المدعومة (للإعدادات)

```
IQD - الدينار العراقي (افتراضي للسوق الأساسي)
USD - الدولار الأمريكي
EUR - اليورو
SAR - الريال السعودي
AED - الدرهم الإماراتي
EGP - الجنيه المصري
KWD - الدينار الكويتي
QAR - الريال القطري
BHD - الدينار البحريني
OMR - الريال العماني
JOD - الدينار الأردني
LBP - الليرة اللبنانية
SYP - الليرة السورية
MAD - الدرهم المغربي
TND - الدينار التونسي
DZD - الدينار الجزائري
LYD - الدينار الليبي
YER - الريال اليمني
```

---

**نهاية المستند**

*للأسئلة أو التعديلات: راجع المالك (Mustafa)*