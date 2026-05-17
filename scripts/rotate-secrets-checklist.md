# Rotate Secrets — Pre-Launch Checklist

> سياق: مفاتيح Supabase service_role + R2 access key سُرِّبت داخل سجلّ المحادثة
> أثناء التطوير. قبل النشر العلني، دوِّر الكل واستبدل القيم في `.env.local`
> (محلياً) وفي Coolify env vars (الإنتاج).
>
> **مهم:** دوِّر الـsecret أولاً في الـdashboard، احفظ القيمة الجديدة في هذا
> الملف، ثم حدِّث `.env.local` و Coolify معاً، وأعد تشغيل التطبيق. لا تحذف
> الـkey القديم قبل التأكد إن الجديد شغّال (إلا إذا الـdashboard ما يدعم
> طريقتين بنفس الوقت — في هذه الحالة، اعمل الـrotation في وقت توقّف مخطّط).
>
> بعد كل خطوة: ضع `[x]` بدل `[ ]`، والصق الـkey الجديد في المكان المخصّص.

---

## 1) Supabase — service_role key (الأهم — يتجاوز RLS)

- [ ] افتح: https://supabase.com/dashboard/project/_/settings/api
  (أو من الـsidebar: **Project Settings → API**)
- [ ] في قسم **Project API keys**، انسخ الـ`service_role` الحالي إلى ملف
      مؤقّت كنسخة احتياطية (في حال احتجت rollback خلال الـ rotation).
- [ ] اضغط **Reset service_role secret** (أو **Rotate** حسب نسخة الـdashboard).
- [ ] أكّد الـreset في الـdialog. الـkey القديم يتوقّف فوراً.
- [ ] انسخ الـkey الجديد من الـ "Reveal" button وألصقه هنا:

  ```
  SUPABASE_SERVICE_ROLE_KEY=<paste-new-here>
  ```

- [ ] حدِّث `.env.local`:
  ```
  SUPABASE_SERVICE_ROLE_KEY=<value-above>
  ```
- [ ] حدِّث Coolify env vars (إذا الـdeployment موجود):
  Coolify → app → Environment Variables → `SUPABASE_SERVICE_ROLE_KEY` → Update
- [ ] اختبر محلياً: `node --env-file=.env.local scripts/smoke-supabase.mjs`
      → يجب يطبع `OK — Supabase reachable, schema present, service role works.`
- [ ] أعد نشر Coolify (إذا production يدور).

---

## 2) Supabase — anon key (اختياري — public key مكشوف في الـbundle)

> هذا الـkey مُعدّ للاستخدام في الـclient (NEXT_PUBLIC_*) ومحمي بـRLS، لذا
> rotation ليس أولوية أمنية. دوّره فقط إذا كنت قلقاً من abuse rate-limit أو
> usage tracking.

- [ ] افتح: https://supabase.com/dashboard/project/_/settings/api
- [ ] في **Project API keys** → **anon / public** → **Reset**.
- [ ] انسخ الـkey الجديد وألصقه هنا:

  ```
  NEXT_PUBLIC_SUPABASE_ANON_KEY=<paste-new-here>
  ```

- [ ] حدِّث `.env.local` و Coolify env vars.
- [ ] أعد build + start (الـkey مُضمَّن في الـclient bundle):
  ```
  npm run build && npm start    # أو إعادة نشر Coolify
  ```
- [ ] افتح `/admin` في الـbrowser وتأكّد ما في 401 من Supabase calls.

---

## 3) Cloudflare R2 — access key + secret

- [ ] افتح: https://dash.cloudflare.com/?to=/:account/r2/api-tokens
      (أو من الـsidebar: **R2** → **Manage R2 API Tokens**)
- [ ] لاحِظ token الـmesa الحالي. **لا تحذفه بعد** — أنشئ الجديد أولاً.
- [ ] **Create API token**:
  - Name: `mesa-os-lite-prod-YYYY-MM-DD`
  - Permissions: **Object Read & Write**
  - Specify bucket(s): اختار bucket الـmesa فقط (لا تعطه access كامل)
  - TTL: اختياري (يفضّل بدون TTL لـproduction)
- [ ] انسخ الـcredentials فوراً (تظهر مرة واحدة فقط):

  ```
  R2_ACCESS_KEY_ID=<paste-new-here>
  R2_SECRET_ACCESS_KEY=<paste-new-here>
  R2_ENDPOINT=<paste-endpoint-here>   # شكله: https://<account-id>.r2.cloudflarestorage.com
  ```

- [ ] حدِّث `.env.local`:
  ```
  R2_ACCESS_KEY_ID=<value-above>
  R2_SECRET_ACCESS_KEY=<value-above>
  R2_ENDPOINT=<value-above>
  ```
  (R2_BUCKET و R2_PUBLIC_URL لا تتغيّر — هي اسم الـbucket والـCDN الـpublic.)
- [ ] حدِّث Coolify env vars.
- [ ] اختبر محلياً: `node --env-file=.env.local scripts/smoke-r2.mjs`
      → يجب يطبع `OK — R2 reachable, PUT/GET/DELETE work, ...`
- [ ] أعد نشر Coolify.
- [ ] ارجع للـdashboard واحذف الـtoken القديم (Manage R2 API Tokens → ... →
      Delete). تأكّد إن `mesa-os-lite-prod-YYYY-MM-DD` الجديد لسه شغّال.

---

## 4) التحقّق النهائي (بعد كل rotation)

- [ ] محلياً: شغّل suite الـsmoke الكاملة:
  ```
  for t in smoke-supabase smoke-r2 smoke-rls smoke-modes smoke-closing-revert \
           smoke-delete-account smoke-desync smoke-polling-contract \
           smoke-runtime-polling smoke-pwa smoke-no-native-confirms; do
    node --env-file=.env.local scripts/$t.mjs
  done
  ```
  → كل واحد يطبع `OK` أو `✅`.
- [ ] في Production (Coolify): افتح `/owner` بحسابك، سجّل دخول، تأكّد إنّك
      تشوف الـrestaurants list. هذا يثبت إن الـservice_role + anon شغّالين.
- [ ] افتح `/admin` بحساب تجريبي، ارفع صورة لمنتج، تأكّد إن الصورة تظهر من
      الـR2 CDN URL. هذا يثبت إن الـR2 access key الجديد شغّال.
- [ ] احذف هذا الملف من الـrepo بعد إكمال الـrotation (يحوي keys).
      أو على الأقل، احذف الـvalues تحت كل bullet point.

---

## ملاحظات

- **لا تحفظ keys في git.** قبل ما تلصق أي key حقيقي، انسخ هذا الملف لـ
  `scripts/rotate-secrets-checklist.local.md` (مُضاف لـ`.gitignore` أصلاً)
  واعمل عليه. هذا الملف الأصلي يبقى template نظيف.
- **Coolify env vars:** بعد تعديلها، الـapp يحتاج **restart** (مش just reload)
  عشان `.env` يُعاد قراءته. Coolify عادةً يعمل auto-restart بعد update.
- **Rollback:** إذا الـkey الجديد ما اشتغل، ارجع للـdashboard وأنشئ key
  جديد بنفس الطريقة. لا تحاول استرجاع القديم — Supabase وR2 ما يحتفظون بنسخة
  بعد الـreset.
- **تواريخ:** ضع تاريخ الـrotation هنا للتتبّع:
  - Supabase service_role rotated on: _________
  - Supabase anon rotated on: _________
  - R2 token rotated on: _________
