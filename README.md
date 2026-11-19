# MS Commerce — منصة تجارة إلكترونية متعددة المتاجر (اليمن)

Next.js 16 (App Router) + PostgreSQL + Drizzle ORM + Tailwind 4.

## حسابات تجريبية (تُنشأ تلقائياً عند أول تشغيل)
| الدور | البريد | كلمة المرور |
|---|---|---|
| مالك المنصة | admin@mscommerce.com | Admin@12345 |
| تاجر | merchant@mscommerce.com | Merchant@123 |
| عميل | customer@mscommerce.com | Customer@123 |

⚠️ غيّر هذه الكلمات فوراً بعد النشر من صفحة التجار.

## التشغيل المحلي
```
npm install
npx drizzle-kit push        # يقرأ DATABASE_URL من .env
node --experimental-strip-types src/db/seed.ts   # أو يتم البذر تلقائياً عند أول زيارة
npm run dev
```

## النشر على Vercel (خطوة بخطوة)

### 1. قاعدة بيانات PostgreSQL سحابية (Neon — مجاني)
1. أنشئ حساباً على [neon.tech](https://neon.tech) ومشروعاً جديداً.
2. من لوحة Neon انسخ **Pooled connection string** (الذي يحتوي على `-pooler`) — مهم لبيئة Serverless.

### 2. متغيرات البيئة في Vercel
من لوحة المشروع: **Settings → Environment Variables** — أضفها لبيئات **Production و Preview و Development**:

| المتغير | القيمة |
|---|---|
| `DATABASE_URL` | رابط الاتصال من Neon (pooled) |
| `AUTH_SECRET` | نص عشوائي 32+ حرفاً (توقيع الجلسات) |
| `ENCRYPTION_KEY` | نص عشوائي آخر 32+ حرفاً (تشفير أرقام الحسابات AES-256-GCM) |
| `PLATFORM_HOST` | دومينك الرئيسي (مثال: `mscommerce.com`) |
| `FORCE_HTTPS` | `1` |

### 3. تخزين الملفات (مطلوب — نظام ملفات Vercel مؤقت)
1. من لوحة Vercel: **Storage → Create → Blob**.
2. اربط الـ Store بالمشروع — سيُضيف `BLOB_READ_WRITE_TOKEN` تلقائياً.
3. بدون هذه الخطوة سيرفض API الرفع برسالة واضحة.

### 4. النشر
- اربط المستودع بـ Vercel. أمر البناء في `vercel.json` يشغّل `node scripts/migrate.mjs` تلقائياً (يطبق ملفات `drizzle/*.sql` بالترتيب ويتتبعها في جدول `_migrations`) قبل `next build`.
- عند أول زيارة لصفحة الدخول تُبذر البيانات الأساسية (المالك، الباقات، القوالب، جهات الدفع اليمنية، متجر تجريبي).

> بديل يدوي (عند الحاجة): `DATABASE_URL="<رابط Neon>" node scripts/migrate.mjs` من جهازك.

### 6. تعديل قاعدة البيانات مستقبلاً
1. عدّل `src/db/schema.ts` محلياً.
2. شغّل `npx drizzle-kit generate` (يولّد ملف SQL جديد في `drizzle/`).
3. ادفع إلى GitHub — سيطبّق Vercel الترحيل الجديد تلقائياً عند النشر.

### 5. الدومينات على Vercel
- **الروابط الفرعية للمتاجر** (`store.yourdomain.com`): أضف دومين Wildcard `*.yourdomain.com` في **Vercel → Domains** ووجّه DNS حسب تعليمات Vercel.
- **دومينات التجار المستقلة**: يجب إضافة كل دومين في **Vercel → Domains** حتى تصل طلباته إلى التطبيق (شرط تقني من Vercel)، ثم يعمل التحقق من TXT/CNAME من لوحة التاجر، وشهادة SSL تصدر تلقائياً من Vercel.

## المسارات
- `/` المنصة · `/admin` لوحة المالك · `/merchant` لوحة التاجر · `/account` حساب العميل
- `/s/{slug}` واجهة المتجر (تُعاد كتابة `{slug}.PLATFORM_HOST` والدومينات المستقلة إليها عبر `src/proxy.ts`)
- `/order/{number}?token=` تتبع الطلب وتعليمات الدفع ورفع إثبات التحويل

## الدفع
- تحويل بنكي / محافظ: تظهر للعميل بيانات حساب التاجر + رقم مرجعي؛ يرفع إثبات التحويل؛ **التاجر يتحقق من وصول المبلغ فعلياً** قبل الاعتماد.
- الدفع عند الاستلام: يُعتمد عند التسليم.
- بوابات الدفع: غير مفعّلة حتى توقيع اتفاقية مع مزود مرخص من البنك المركزي اليمني وإدخال مفاتيح API.

## النسخ الاحتياطية
من `/admin/backups`: زر **تنزيل نسخة JSON** يعمل في كل البيئات (بما فيها Vercel)، و`pg_dump` متاح على الخوادم الذاتية فقط.
