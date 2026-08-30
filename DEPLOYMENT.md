# دليل النشر — BIZIII Menu (مسار مهجور: qaema.app)

> ⚠️ **مسار نشر مهجور — للأرشيف فقط.** هذا الملف يصف نشراً على **Coolify + Contabo VPS**
> بدومين **`qaema.app`**. الوجهة الحالية هي **Vercel على `menu.biziii.io`** — راجع
> `docs/COMPANY-CONTEXT.md`. لم يُحذف الملف لأن أقسام Cloudflare/R2 والمراقبة فيه ما زالت مرجعاً مفيداً.

نشر ذاتي على **Contabo VPS** عبر **Coolify**، خلف **Cloudflare**، مع الصور على **Cloudflare R2** وقاعدة البيانات على **Supabase (Frankfurt)**.

> هذا الملف يغطّي الخطوات **اليدوية** التي لا يستطيع المساعد تنفيذها (تجهيز خادم، لوحات تحكم، DNS). أما تجهيز الريبو (Dockerfile، `output:'standalone'`، `/api/health`، CF-Connecting-IP، `.env.example`) فمُنجَز في الكود — انظر قسم «ما المُجهَّز في الريبو» في النهاية.

---

## 0) المعمارية بنظرة واحدة

```
المتصفّح ──HTTPS──> Cloudflare (CDN + WAF + TLS) ──HTTPS──> Coolify/Traefik على Contabo VPS ──> حاوية Next.js (server.js :3000)
                         │                                                                            │
                         │                                                              Supabase (Postgres + Auth, Frankfurt)
                         └── صور المنتجات تُخدَم من R2 العام (pub-….r2.dev) عبر <Image> ──> next/image optimizer
```

- **TLS يُنهى مرّتين:** المتصفّح↔Cloudflare (شهادة Cloudflare)، وCloudflare↔الأصل (شهادة Coolify/Let's Encrypt). لهذا **SSL = Full (strict)** إلزامي.
- **منفذ الحاوية: 3000** (الحاوية تقرأ `PORT` وتستمع على `0.0.0.0` — مضبوط في الـDockerfile).
- **فحص الصحة: `/api/health`** (liveness خفيف، لا يلمس DB).

---

## 1) تجهيز Contabo VPS + تثبيت Coolify

1. أنشئ VPS على Contabo (الموصى به للبداية: **VPS بـ4 vCPU / 8GB RAM / 200GB NVMe**، Ubuntu 22.04 LTS). اختر منطقة قريبة من Frankfurt لتقليل زمن الوصول إلى Supabase.
2. ادخل عبر SSH كـroot، وحدّث النظام:
   ```bash
   apt update && apt -y upgrade
   ```
3. ثبّت Coolify (السكربت الرسمي يثبّت Docker تلقائيًا):
   ```bash
   curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
   ```
4. افتح لوحة Coolify على `http://<VPS-IP>:8000`، أنشئ حساب الأدمن (أول مستخدم يصبح المالك)، وفعّل **2FA** فورًا.
5. **جدار الحماية** (UFW) — اسمح فقط بما يلزم:
   ```bash
   ufw allow 22/tcp      # SSH
   ufw allow 80/tcp      # HTTP (Let's Encrypt + redirect)
   ufw allow 443/tcp     # HTTPS
   ufw allow 8000/tcp    # لوحة Coolify (أغلقه لاحقًا أو قيّده بـIP بعد الإعداد)
   ufw enable
   ```
6. (تحصين مُوصى به لاحقًا) بعد ربط Cloudflare: اقصر منفذ 443 على نطاقات Cloudflare فقط حتى لا يتجاوز أحد البروكسي بضرب IP الأصل مباشرةً (انظر §5.4).

---

## 2) Cloudflare R2 (تخزين الصور)

> غالبًا مُجهَّز سلفًا (التطبيق يرفع/يخدم الصور بنجاح). وثّقه هنا للاستنساخ.

1. في لوحة Cloudflare → **R2** → أنشئ bucket باسم `mesa-os-lite`.
2. فعّل **Public access / r2.dev subdomain** للـbucket (أو اربط نطاقًا مخصّصًا مثل `images.qaema.app`). انسخ الرابط العام — مثل `https://pub-xxxxxxxx.r2.dev` → هذا `R2_PUBLIC_URL`.
3. أنشئ **R2 API Token** (صلاحية Object Read & Write على هذا الـbucket فقط). انسخ:
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_ENDPOINT` = `https://<account-id>.r2.cloudflarestorage.com`
4. (أداء/تكلفة) فعّل كاش Cloudflare على نطاق R2 العام لتقليل egress للمطاعم كثيفة الزيارة (مخاطرة §9 R2 في الـPRD).

---

## 3) Supabase (قاعدة البيانات + Auth)

> المشروع موجود (Frankfurt). للنشر الإنتاجي تأكّد من القيم التالية.

1. من Supabase → Project Settings → API، انسخ:
   - `NEXT_PUBLIC_SUPABASE_URL` (عام)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (عام)
   - `SUPABASE_SERVICE_ROLE_KEY` (**سرّي — خادم فقط، لا يُوضع في Build Args العامة**)
2. تأكّد أن سياسات RLS مفعّلة (مُتحقَّق منها في `smoke-rls`) وأن الهجرات مطبَّقة.
3. فعّل **Point-in-Time Recovery / النسخ المجدولة** (انظر §7).

---

## 4) إنشاء التطبيق في Coolify

1. Coolify → **+ New Resource → Application → Public/Private Repository**. اربط حساب GitHub واختر ريبو `mesa` والفرع المراد نشره (`master` بعد الدمج، أو فرع نشر مخصّص).
2. **Build Pack = Dockerfile** (الريبو فيه `Dockerfile` جاهز متعدّد المراحل).
3. **Ports:** عرّف المنفذ **3000** (Ports Exposes = `3000`).
4. **Health Check:** المسار **`/api/health`**، المنفذ 3000، الفاصل ~30s. (الـDockerfile يحتوي HEALTHCHECK على نفس المسار أصلًا.)
5. **Environment Variables** — هذه أهم خطوة. ميّز بين build وruntime:

   | المتغيّر | النوع | ملاحظة |
   |---|---|---|
   | `NEXT_PUBLIC_APP_URL` | **Build Arg + Runtime** | `https://qaema.app` (بلا شرطة أخيرة) |
   | `NEXT_PUBLIC_SUPABASE_URL` | **Build Arg + Runtime** | عام |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Build Arg + Runtime** | عام |
   | `SUPABASE_SERVICE_ROLE_KEY` | **Runtime فقط** | سرّي — لا تضعه في Build Args |
   | `R2_ENDPOINT` | **Runtime فقط** | سرّي |
   | `R2_ACCESS_KEY_ID` | **Runtime فقط** | سرّي |
   | `R2_SECRET_ACCESS_KEY` | **Runtime فقط** | سرّي |
   | `R2_BUCKET` | **Runtime فقط** | `mesa-os-lite` |
   | `R2_PUBLIC_URL` | **Build Arg + Runtime** | يُحقَن هوست R2 في `images.remotePatterns` وقت البناء، فاجعله Build Arg أيضًا |

   > **لماذا `NEXT_PUBLIC_*` و`R2_PUBLIC_URL` Build Args؟** لأن Next يُدمجها في الباندل وقت `next build`. في Coolify فعّل خيار «Available at build time» لهذه المفاتيح. القالب الكامل في `.env.example` و`.env.production.example`.
   > **`NODE_ENV=production`** مضبوط داخل الـDockerfile — لا تحتاج ضبطه يدويًّا (وهو ما يجعل كوكي الجلسة `Secure=true`، انظر §6).
6. اضغط **Deploy**. تابع السجلّات حتى ينجح البناء ويصبح الفحص الصحي أخضر.

---

## 5) ربط qaema.app عبر Cloudflare

### 5.1 DNS
1. أضف النطاق `qaema.app` في Cloudflare (إن لم يكن مضافًا) وحدّث nameservers عند المسجّل.
2. أنشئ سجلًّا:
   - **Type:** `A` · **Name:** `@` (أو `qaema.app`) · **Content:** `<VPS-IP>` · **Proxy status: Proxied (السحابة برتقالية)**.
   - (اختياري) `A` لـ`www` → نفس الـIP، Proxied، ثم Redirect Rule من `www` إلى الجذر.

### 5.2 SSL/TLS
1. في Coolify فعّل **Generate SSL (Let's Encrypt)** لنطاق التطبيق `qaema.app` حتى يحمل الأصل شهادة صالحة.
2. في Cloudflare → SSL/TLS → **Overview → Full (strict)**. (لا تستخدم Flexible — يكسر الكوكيز ويُحدث حلقات إعادة توجيه.)
3. SSL/TLS → Edge Certificates → فعّل **Always Use HTTPS** و**Automatic HTTPS Rewrites** و**HSTS** (بعد التأكّد أن كل شيء يعمل على HTTPS).

### 5.3 قواعد الكاش (حرجة — منع تخزين بيانات مطعم وعرضها لآخر)
الأصل يُصدر ترويسات سليمة سلفًا، لكن بدرجتَي ضمان مختلفتين:
- **`/api/*` والـmanifest (`/r/<slug>/manifest.webmanifest`):** `no-store` **صريح في الكود** (مثل `app/api/menu/[slug]/route.ts`).
- **صفحات `/r/*` (المنيو/المنتج/السلة):** تُرسَم ديناميكيًّا (`export const dynamic = 'force-dynamic'`)، وNext يُصدر لها `Cache-Control: private, no-store` **افتراضيًّا** (تحقّقنا منه: `private, no-cache, no-store, max-age=0, must-revalidate`) — لا ترويسة صريحة في الكود.

لذلك **قواعد Cloudflare أدناه هي الضمان الفعلي**، لا اعتماد على سلوك Next الافتراضي وحده. و**لا تفعّل "Cache Everything" أبدًا** على المسارات الديناميكية. أنشئ **Cache Rules** (Caching → Cache Rules):

| الأولوية | المطابقة | الإجراء |
|---|---|---|
| 1 | `URI Path starts with /api/` | **Bypass cache** |
| 2 | `URI Path starts with /r/` | **Bypass cache** (يشمل المنيو/المنتج/السلة/الـmanifest) |
| 3 | `URI Path starts with /admin` أو `/owner` | **Bypass cache** |
| 4 | `URI Path starts with /_next/static/` | **Cache (Eligible)** + Edge TTL طويل (أصول مبصومة، آمنة) |

- لا تنشئ أي Page Rule بـ"Cache Everything" على الجذر. الـCDN يكفيه السلوك الافتراضي + القاعدتان أعلاه.
- الـ`slug` في مسار `/r/<slug>` يعني أن مفتاح الكاش لكل مطعم على حدة أصلًا — قواعد الـBypass طبقة أمان ثانية فوق `no-store`.

### 5.4 (تحصين مُوصى به) اقصر الأصل على Cloudflare
حتى لا يتجاوز مهاجم البروكسي بضرب IP الـVPS مباشرةً (ما يُفسد حدّ المعدّل المعتمد على `CF-Connecting-IP`):
- إمّا **UFW**: اسمح بـ443 فقط من [نطاقات Cloudflare](https://www.cloudflare.com/ips/).
- أو فعّل **Authenticated Origin Pulls** في Cloudflare + Coolify.

---

## 6) الكوكيز خلف البروكسي (M-8) — لا تغيير في الكود، لكن انتبه

كوكي جلسة المستأجر يُضبط بـ`secure: process.env.NODE_ENV === 'production'` (`lib/auth/session.ts`). **هذا صحيح خلف Cloudflare** ولا يحتاج قراءة `X-Forwarded-Proto`:
- علم `Secure` يحكمه **اتصال المتصفّح** (HTTPS عبر حافة Cloudflare)، لا اتصال الأصل. الأصل يُصدر `Set-Cookie; Secure`، فيصل للمتصفّح عبر HTTPS فيُقبَل.
- الشرط الوحيد: **`NODE_ENV=production`** (مضبوط في الـDockerfile) + **SSL = Full (strict)** (الخطوة 5.2).
- لذلك: لا تشغّل الحاوية بـ`NODE_ENV` غير `production`، ولا تستخدم Flexible SSL.

> قرار واعٍ: لم نعدّل منطق الكوكي (auth منتهٍ، وM-8 مغلق). قراءة `X-Forwarded-Proto` كانت ستكون no-op في الإنتاج وتفتح بندًا أمنيًّا مغلقًا.

---

## 7) النسخ الاحتياطية + المراقبة — من اليوم الأول

### نسخ احتياطية
1. **قاعدة البيانات (Supabase):** فعّل **Daily backups / PITR** من لوحة Supabase. إضافةً، صدّر نسخة منطقية دورية:
   ```bash
   pg_dump "$SUPABASE_DB_URL" -Fc -f mesa-$(date +%F).dump   # خزّنها خارج الـVPS (R2/خارجي)
   ```
2. **الكود:** على GitHub (الفرع المنشور). أنشئ tag لكل إصدار منشور (`git tag deploy-YYYY-MM-DD && git push --tags`).
3. **أحجام/إعدادات Coolify:** فعّل **Coolify → Settings → Backups** (نسخ إعدادات Coolify + أي volume). صور المنتجات في R2 (دائمة)، لكن فعّل **R2 versioning** للحماية من الحذف العَرَضي.
4. اختبر **الاستعادة** فعليًّا مرّة واحدة على الأقل — نسخة لم تُختبَر = لا نسخة.

### مراقبة Uptime
- أضف مراقبًا خارجيًّا (UptimeRobot / Better Stack / Cloudflare Health Checks) يضرب **`https://qaema.app/api/health`** كل دقيقة، مع تنبيه (بريد/تيليجرام).
- (اختياري) فعّل Cloudflare **Notifications** على أخطاء الأصل (5xx spike).

---

## 8) قائمة تحقّق بعد النشر

```
[ ] https://qaema.app/api/health يُرجِع {"status":"ok"} (200)
[ ] https://qaema.app/r/<slug> يفتح منيو مطعم حقيقي، والصور (R2) تظهر عبر next/image
[ ] تبديل وضع الإغلاق من /admin ينعكس على المنيو خلال ≤30s (الـpolling)
[ ] تسجيل دخول /admin ينجح ويبقى بعد إعادة فتح المتصفّح (كوكي Secure مقبول)
[ ] صفحة /admin/dashboard لا تُفتح بدون كوكي (proxy.ts يحرس)
[ ] /owner يتطلّب Supabase Auth بدور owner
[ ] curl -I https://qaema.app/api/menu/<slug> يُظهر Cache-Control: no-store (صريح)
[ ] curl -I https://qaema.app/r/<slug> يُظهر no-store (افتراضي Next لـforce-dynamic) + قاعدة Bypass في Cloudflare مفعّلة
[ ] رفع صورة منتج من /admin ينجح ويُخزَّن في R2 ويظهر فورًا
[ ] حدّ المعدّل: محاولات دخول خاطئة متكرّرة تُحجب (CF-Connecting-IP = IP الزبون الحقيقي)
[ ] مراقب Uptime على /api/health مفعّل ويُرسل تنبيهًا
[ ] نسخة احتياطية أولى من Supabase أُخذت واخُتبرت استعادتها
```

---

## ترتيب التنفيذ خطوة بخطوة

1. **R2** (§2) → احصل على مفاتيح R2 والرابط العام.
2. **Supabase** (§3) → احصل على المفاتيح الثلاثة + فعّل النسخ.
3. **VPS + Coolify** (§1).
4. **تطبيق Coolify** (§4) → اضبط متغيّرات البيئة (build vs runtime) → Deploy → انتظر الفحص الصحي أخضر (الوصول عبر IP/منفذ مؤقّت).
5. **Cloudflare DNS + SSL Full(strict)** (§5.1–5.2).
6. **قواعد كاش Cloudflare** (§5.3) + **تحصين الأصل** (§5.4).
7. **النسخ + المراقبة** (§7).
8. **قائمة التحقّق** (§8) — لا تُعلن الإطلاق قبل اخضرارها كاملةً.

---

## ما المُجهَّز في الريبو (مرجع)

| العنصر | الحالة | الملف |
|---|---|---|
| `output: 'standalone'` | جاهز | `next.config.ts` |
| `images.remotePatterns` يسمح بـR2 | جاهز (`**.r2.dev`, `**.r2.cloudflarestorage.com`, + هوست `R2_PUBLIC_URL`) | `next.config.ts` |
| Dockerfile إنتاجي (deps→build→runner، standalone، non-root، PORT/0.0.0.0) | جاهز | `Dockerfile` |
| `.dockerignore` | جاهز | `.dockerignore` |
| فحص صحة `/api/health` (liveness، بلا DB) | **مُضاف** | `app/api/health/route.ts` |
| HEALTHCHECK يشير لـ`/api/health` | **مُحدَّث** | `Dockerfile` |
| `CF-Connecting-IP` لحدّ المعدّل (H-4) و`/api/track` | **مُضاف** عبر `clientIp()` | `lib/auth/rate-limit.ts`، `app/admin/actions.ts`، `app/api/track/route.ts` |
| كوكي Secure خلف البروكسي (M-8) | صحيح بلا تغيير (NODE_ENV=production) | `lib/auth/session.ts` (§6) |
| `no-store` على المسارات الديناميكية لكل مطعم | `/api/*` + الـmanifest صريح؛ صفحات `/r/*` افتراضي Next لـforce-dynamic (وقاعدة Cloudflare Bypass هي الضمان §5.3) | `app/r/[slug]/**`، `app/api/**` |
| قوالب البيئة | `.env.example` (مرجعي) + `.env.production.example` (Coolify) + `.env.local.example` (تطوير محلّي) | الجذر |
| `.env.example` مُوثَّق (build vs runtime) | **مُضاف** | `.env.example` (+ `.env.production.example`) |
