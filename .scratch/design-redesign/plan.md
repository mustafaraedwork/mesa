# خطة إعادة تصميم Mesa OS Lite — تطبيق نظام تصميم ميسا

> المرجع: `Design-System.html` في جذر المشروع. القاعدة الأم (RULES.md): البساطة أولاً — التغيير مركزي عبر الـtokens، لا إعادة كتابة.
> أُنشئت 2026-05-18 بعد مراجعة نظام التصميم وحالة التنسيق الحالية.

## القرارات المثبّتة (من المالك)

- **الأرقام:** تبقى لاتينية (`0123`) — لا تغيير في صيغة الأرقام. النظام يطبّق ألوان/خطوط/مكوّنات فقط.
- **صور المنتجات:** يبقى المربّع كما هو (صورة المنتج بداخله، أو placeholder حين لا صورة) — **لا** رموز أطباق دائرية. الـplaceholder يُعاد تلوينه فقط.
- **ألوان الزبون القابلة للتخصيص:** تبقى — `primary_color`/`background_color` لكل مطعم (PRD §٣.١). لوحة ميسا تصير القيمة الافتراضية، والمطعم يقدر يتجاوزها على منيوه. لوحتا الإدارة/المالك بلوحة ميسا ثابتة.
- **خارج النطاق:** كل ما يخصّ "جهاز الكابتن"/KDS/بلاطات الطاولات في نظام التصميم — Mesa OS Lite لا يحويها (CLAUDE.md §خارج النطاق). نطبّق فقط ما يخصّ الزبون + الإدارة + المالك.

## الاستراتيجية

التطبيق يستخدم **Tailwind v4 + shadcn** بـtokens في `app/globals.css` (`:root` + `@theme inline`). إعادة تعيين هذه الـtokens للوحة ميسا **تُحدّث معظم المكوّنات تلقائياً** لأنها تستهلك `bg-primary`/`text-muted-foreground`/`border`... إلخ. الباقي = لمسات لكل مكوّن (ظلال، زوايا، أشكال الأزرار، الـbadges).

---

## لوحة ميسا (مرجع التنفيذ)

| token | القيمة | الاستخدام |
|---|---|---|
| burgundy | `#8B1A1A` | primary — أزرار، أسعار، تأكيد |
| burgundy-deep | `#6B1414` | تدرّجات/hover |
| gold | `#C9A961` | accent — فخامة، أرقام مميّزة على داكن |
| gold-deep | `#9A7B2E` | تدرّجات الذهب |
| cream | `#FAF7F2` | الخلفية الافتراضية |
| cream-deep | `#F3EEE4` | muted/secondary |
| surface | `#FFFFFF` | البطاقات |
| ink | `#1A1A1A` | النصوص، الأزرار الجادّة |
| ink-2 | `#2B2622` | نص ثانوي داكن |
| muted | `#6B5E52` | نص خافت |
| muted-lite | `#9B8E82` | نص خافت جداً |
| border | `#E8DFD1` | حدود |
| border-lite | `#F0E8DA` | حدود ناعمة |
| olive | `#6B7F3F` | success |
| amber | `#D97706` | warning |
| danger | `#991B1B` | destructive |
| info | `#1F4068` | معلومات |

**الخطوط:** Tajawal (عربي أساسي، أوزان 300/400/500/700/800) · Inter (لاتيني صغير/eyebrow) · IBM Plex Mono (أرقام طلبات — استخدام محدود). **لا خط مائل (italic) في أي مكان.**
**الزوايا:** sm 8 · md 12 (افتراضي) · lg 18 (بطاقات) · full 9999 (pills).
**الظلال (بنّية دافئة):** subtle `0 1px 3px rgba(60,40,20,.06)` · card `0 2px 10px rgba(60,40,20,.08)` · lifted `0 8px 24px rgba(60,40,20,.12)` · modal `0 12px 40px rgba(60,40,20,.18)`.
**الأزرار:** primary نبيذي بظلّ نبيذي خفيف · dark حبري · secondary سطح+حدود · ghost · icon دائري.

---

## المرحلة ٠ — الأساس: tokens + خطوط (أعلى رافعة)

**`app/globals.css`:**
- استبدال كل قيم `:root` الرمادية (OKLCH) بلوحة ميسا (hex):
  `--background:#FAF7F2`, `--foreground:#1A1A1A`, `--card/--popover:#FFFFFF`, `--primary:#8B1A1A`, `--primary-foreground:#FFFFFF`, `--secondary/--muted/--accent:#F3EEE4`, `--muted-foreground:#6B5E52`, `--destructive:#991B1B`, `--border/--input:#E8DFD1`, `--ring:#8B1A1A`.
- `--radius: 0.75rem` (12px)، وتعديل اشتقاق `@theme` ليعطي `rounded-md≈12` و`rounded-xl≈18` (زاوية البطاقات).
- إضافة tokens ميسا الإضافية في `:root` (`--gold`, `--gold-deep`, `--olive`, `--amber`, `--info`, `--ink-2`, `--muted-lite`, `--cream-deep`, `--border-lite`, `--burgundy-deep`) وكشفها في `@theme inline` كـ`--color-gold` … إلخ ليعمل `bg-gold`/`text-olive`.
- إضافة `@layer base { *, body { font-style: normal; } }` — قاعدة "لا مائل".
- `.dark` غير مستخدم (الـ`<html>` لا يحمل `.dark`) — يُترك كما هو (غير ضارّ).

**`app/layout.tsx`:**
- استبدال `Cairo` بـ`Tajawal` من `next/font/google` (أوزان 300/400/500/700/800، subsets عربي+لاتيني) → `--font-sans`.
- إضافة `Inter` → متغيّر `--font-latin`، و`IBM_Plex_Mono` → `--font-mono`. كشفها في `@theme inline`.

**تحقّق:** `tsc` + `eslint` + `next build` نظيفة · الخلفية كريمية والنص حبري في كل الصفحات بلا تعديل آخر.

---

## المرحلة ١ — المكوّنات الأوّلية (`components/ui/`)

- **`button.tsx`:** ظلّ نبيذي خفيف على `default` (primary)، إضافة variant `dark` (خلفية ink) للأفعال الجادّة، تأكيد `rounded-lg`. الأحجام تبقى قريبة (كثافة لوحة الإدارة) مع رفع بسيط للـ`default`.
- **`card.tsx`:** زاوية `lg` (18)، ظلّ `card` الدافئ، حدّ `border-lite`.
- **`dialog.tsx` / `alert-dialog.tsx`:** ظلّ `modal`، زوايا، خلفية overlay دافئة.
- **`input.tsx`:** حدّ `border`، تركيز بحلقة نبيذية، زاوية `md`.
- **`table.tsx`:** رؤوس بـcream-deep، حدود `border-lite`.
- **نمط `pill`/`badge` موحّد:** النظام فيه badges (🔥 الأكثر طلباً…) وstatus pills بألوان دافئة. تُوحَّد في classes متّسقة (المشروع يستخدم pills inline في `accounts-table` و`modes`).

**تحقّق:** `tsc` + `eslint` نظيفان · فحص بصري للأزرار/البطاقات/الحوارات.

---

## المرحلة ٢ — واجهة الزبون (`/r/[slug]`)

- **`menu-view.tsx`:** الهيدر الـsticky (لوغو + اسم + مبدّل اللغة pill)، بطاقات المنتجات (زاوية lg، ظلّ، السعر نبيذي، شارة الخصم، أيقونة وقت التحضير)، الـplaceholder المربّع يُعاد تلوينه (cream-deep بدل لون primary الباهت)، زرّ السلة العائم.
- **`cart/cart-view.tsx`:** صفوف السلة، الاقتراحات، صفّ المجموع (نبيذي، tabular-nums)، modal "اقرأ للنادل".
- **`closed-screen.tsx`:** أيقونة + رسالة بلوحة ميسا.
- **ملاحظة:** الزبون يُبقي تجاوز `primary_color`/`background_color` للمطعم؛ لوحة ميسا هي الافتراض البصري لبقية البنية.
- **اختياري:** migration `0003_mesa_color_defaults.sql` يغيّر افتراضَي `restaurants.primary_color`/`background_color` إلى `#8B1A1A`/`#FAF7F2` للحسابات الجديدة (الموجودة لا تتأثّر).

**تحقّق:** `tsc` + `eslint` نظيفان · الـsmoke الحالي أخضر · فحص بصري للمنيو والسلة.

---

## المرحلة ٣ — لوحة المطعم (`/admin`)

- `admin/dashboard/layout.tsx` + `bottom-nav.tsx` — الهيدر والـbottom nav بلوحة ميسا.
- `menu/*` — `menu-view`, `category-dialog`, `product-dialog`, `complementary-section`, `confirm-dialog`, مقابض السحب.
- `modes/*` — بطاقات الأوضاع الأربعة (الحالة النشطة بحلقة نبيذية)، `closing-dialog`, `countdown`.
- `design/*` — `design-view` (color pickers، معاينة حية)، `qr-section`.
- `admin/login-form.tsx` + `admin/page.tsx`.

**تحقّق:** `tsc` + `eslint` نظيفان · فحص بصري لكل تبويبات اللوحة.

---

## المرحلة ٤ — لوحة المالك (`/owner`)

- `owner/dashboard/page.tsx` (overview/KPIs — نمط بطاقات KPI من النظام)، `accounts/*` (الجدول + الحوارات).
- `owner/login-form.tsx` + `owner/page.tsx`.

**تحقّق:** `tsc` + `eslint` نظيفان · فحص بصري.

---

## المرحلة ٥ — صفحة الهبوط + التلميع + التحقّق النهائي

- `app/page.tsx` — صفحة الهبوط بلوحة ميسا (الشعار موجود مسبقاً).
- مراجعة شاملة: لا ألوان hex مكتوبة يدوياً تخالف الـtokens، لا خط مائل، الظلال الدافئة مطبّقة.
- `tsc` + `eslint` + `next build` + `npm test` — كلها خضراء.
- تحديث `PHASES.md`/`PROGRESS.md`.

---

## ترتيب التنفيذ

٠ (الأساس) → ١ (الأوّليات) → ٢ (الزبون) → ٣ (الإدارة) → ٤ (المالك) → ٥ (الهبوط + تحقّق).
المرحلة ٠ وحدها تقلب ~٧٠٪ من المظهر فوراً؛ الباقي لمسات. كل مرحلة قابلة للتنفيذ في جلسة ومستقلّة بـcommit.

## حُرّاس

- لا ألوان hex مبعثرة في المكوّنات — كل لون عبر token (`bg-primary`, `text-gold`…).
- لا تكسر تجاوز ألوان المطعم في صفحة الزبون.
- لا مكتبات UI جديدة (RULES §١) — Tailwind + الموجود يكفي.
- لا تغيير سلوكي — إعادة جلد بصري فقط (لا أرقام عربية، لا رموز أطباق).
- `next build` يبقى أخضر بعد كل مرحلة.
