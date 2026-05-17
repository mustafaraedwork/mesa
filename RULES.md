# RULES.md — قواعد لا تُكسر

> **القاعدة الأم:** هذا **منيو طعام**، ليس بنكاً ولا منظومة طبية. كل قرار يبدأ من سؤال: *هل هذا التعقيد ضروري فعلاً؟* لو الجواب لا → احذفه.

---

## 1. البساطة فوق كل شيء

- ❌ لا تجريدات مبكرة. ٣ أسطر متشابهة أفضل من helper سابق لأوانه.
- ❌ لا "design patterns" لمجرد إظهار المعرفة (Repository, Factory, Strategy... إلخ).
- ❌ لا طبقات Service/UseCase/DTO. صفحة Next.js تنادي Supabase مباشرة كافٍ.
- ❌ لا state management خارجي (Redux/Zustand/Jotai). `useState` + URL params + localStorage يكفون.
- ✅ كل ميزة بأقل عدد ملفات ممكن. لو تنفع في ملف واحد، لا تكسرها على ملفين.

## 2. لا أمان زائد عن الحاجة

- العميل (Tenant) جلسته **دائمة عمداً** (PRD §3.2). لا تضف expiry أو refresh tokens.
- bcrypt cost=10 كافٍ. لا ترفعه لـ 12 ولا تضيف 2FA ولا CAPTCHA.
- Rate limit بسيط على الـ login (٥ محاولات / ١٥ دقيقة) — لا تضف WAF أو fingerprinting.
- httpOnly cookie + CORS مقيد على الدومين الرئيسي = نهاية القصة.
- ❌ لا CSP معقد، لا audit logs، لا anomaly detection، لا session rotation.

## 3. لا ميزات خارج الـ PRD

- §٨ من `prd.md` يحدد ما هو **خارج النطاق**. لو طُلب أحدها، أشِر للـ PRD وأكّد قبل البناء.
- ميزات ممنوعة افتراضياً: KDS، مدفوعات أونلاين، توصيل، نقاط ولاء، POS، push، تقارير مبيعات، multi-branch، ترجمة AI، multi-user-per-tenant.
- لا تُضِف "تحسينات" UX مالم يطلبها مصطفى.

## 4. حدود معمارية لا تُكسر

| القرار | السبب |
|---|---|
| ٣ أنظمة auth منفصلة (Diner/Tenant/Owner) | عمداً بحسب الـ PRD — لا تُوحّدها |
| `categories` مستويان فقط (parent + child) | فرض في كود التطبيق، لا grandchildren |
| `tenant_sessions` بلا `expires_at` | جلسة دائمة بحسب §٢.٢ |
| وضع واحد مفعّل لكل مطعم | enum، لا multi-mode |
| `name_ar` إجباري، fallback للعربي | لا تُظهر مفاتيح فارغة |
| تحديث المنيو = polling كل ٣٠ ثانية | **لا** تستخدم Realtime ابتداءً |
| ضغط الصور server-side (sharp) | لا تثق بضغط العميل |
| حذف Tenant → cascade + حذف صور R2 | DB cascade لا يكفي وحده |

## 5. لا تعليقات وثرثرة

- ❌ لا تعليقات تشرح **ماذا** يفعل الكود (الكود يشرح نفسه).
- ❌ لا JSDoc/docstrings طويلة.
- ✅ تعليق سطر واحد فقط لـ **لماذا** غير الواضح (constraint مخفي، workaround، invariant).
- ❌ لا تترك تعليقات `// TODO` أو `// removed X`. احذف الكود مباشرة.

## 6. لا error handling زائد

- تحقّق من المدخلات عند **حدود النظام** فقط: API routes، forms، QR slug.
- داخل الكود، ثق بالـ types وبضمانات Supabase.
- ❌ لا try/catch حول كل استدعاء.
- ❌ لا fallbacks لسيناريوهات لا تحدث (مثلاً: ماذا لو Supabase أرجع `null` لحقل `NOT NULL`).

## 7. الـ Stack محسوم — لا بدائل

| الطبقة | المحدد | لا بديل |
|---|---|---|
| Framework | Next.js 15 App Router | لا Pages Router، لا Remix |
| Styling | Tailwind + shadcn/ui | لا CSS Modules، لا styled-components |
| DB | Supabase Postgres | لا Prisma فوقه، لا ORM |
| Storage | Cloudflare R2 | لا S3، لا Supabase Storage |
| Image | sharp | لا imagemin، لا client-side |
| Hosting | Coolify على Contabo | لا Vercel، لا AWS |
| PWA | Workbox | لا next-pwa wrapper |

## 8. اختبر فعلياً قبل "تم"

- لكل ميزة UI: شغّل dev server وافتح الميزة في المتصفح.
- اختبر الـ golden path + حافة واحدة على الأقل.
- TypeCheck ≠ يعمل. Tests ≠ يعمل في المتصفح.
- لو ما قدرت تختبر بصرياً، قُل ذلك صراحةً بدل ادعاء النجاح.

## 9. الـ PRD مرجع — لا اجتهاد

- عند أي شك، الـ `prd.md` هو الحاكم.
- لو الـ PRD غامض في نقطة، اسأل مصطفى — لا تخترع قراراً.
- تغيير في السلوك يستوجب تحديث الـ PRD أولاً، ثم الكود.

## 10. تحديث الملفات الحيّة

- عند إنهاء مهمة من `PHASES.md` → علّم الـ checkbox فوراً.
- عند انتهاء جلسة عمل → سجّل سطراً في `PROGRESS.md`.
- لا تجمع التحديثات في الآخر.
