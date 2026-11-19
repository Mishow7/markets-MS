import { db } from "@/db";
import { platformSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/shell";
import { Card, ActionForm, Field, Select, SubmitButton } from "@/components/ui";
import { adminSaveSettings } from "@/actions/admin";

export const dynamic = "force-dynamic";

export default async function AdminSettings() {
  const [g] = await db.select().from(platformSettings).where(eq(platformSettings.key, "general"));
  const v = (g?.value ?? {}) as Record<string, string>;
  const env: [string, boolean, string?][] = [["DATABASE_URL", !!process.env.DATABASE_URL], ["AUTH_SECRET", !!process.env.AUTH_SECRET], ["ENCRYPTION_KEY", !!process.env.ENCRYPTION_KEY], ["PLATFORM_HOST", !!process.env.PLATFORM_HOST], ["BLOB_READ_WRITE_TOKEN", !!process.env.BLOB_READ_WRITE_TOKEN, process.env.VERCEL ? "مطلوب على Vercel لرفع الصور" : "اختياري — بدونه يُستخدم مجلد uploads/ المحلي"]];
  return (
    <>
      <PageHeader title="إعدادات المنصة" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="الإعدادات العامة">
          <ActionForm action={adminSaveSettings} className="space-y-3"><input type="hidden" name="key" value="general" />
            <div className="grid grid-cols-2 gap-3"><Field label="اسم المنصة" name="platformName" defaultValue={v.platformName} /><Field label="الاسم بالإنجليزية" name="platformNameEn" defaultValue={v.platformNameEn} /></div>
            <Field label="الدومين الرئيسي" name="primaryDomain" defaultValue={v.primaryDomain} hint="تُنشأ الروابط الفرعية للمتاجر تحته: store.domain" />
            <div className="grid grid-cols-2 gap-3"><Field label="بريد الدعم" name="supportEmail" defaultValue={v.supportEmail} /><Field label="هاتف الدعم" name="supportPhone" defaultValue={v.supportPhone} /></div>
            <Select label="العملة الافتراضية" name="currency" defaultValue={v.currency ?? "YER"} options={[{ value: "YER", label: "ريال يمني (YER)" }, { value: "SAR", label: "ريال سعودي (SAR)" }, { value: "USD", label: "دولار (USD)" }]} />
            <SubmitButton>حفظ</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="حالة بيئة التشغيل والأمان">
          <ul className="space-y-2 text-sm">{env.map(([k, ok, hint]) => <li key={String(k)} className="rounded-xl bg-blue-50 px-3 py-2"><div className="flex justify-between"><code>{k}</code><span className={ok ? "text-blue-800 font-bold" : "text-blue-800 font-bold"}>{ok ? "مضبوط ✓" : "غير مضبوط"}</span></div>{hint && <div className="text-xs text-blue-600 mt-0.5">{hint}</div>}</li>)}</ul>
          <div className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-sm flex justify-between"><span>التخزين الحالي للملفات</span><b>{process.env.BLOB_READ_WRITE_TOKEN ? "Vercel Blob ☁️" : "مجلد uploads/ المحلي 💾"}</b></div>
          <div className="mt-4 rounded-xl bg-blue-50 p-3 text-xs text-blue-900 leading-relaxed">
            <b>قبل الإطلاق التجاري:</b> اضبط <code>AUTH_SECRET</code> و<code>ENCRYPTION_KEY</code> (مفاتيح عشوائية 32+ حرفاً) و<code>PLATFORM_HOST</code> (الدومين الرئيسي) و<code>FORCE_HTTPS=1</code>. أرقام الحسابات البنكية مشفرة بـ AES-256-GCM بالمفتاح الحالي؛ تغيير المفتاح بعد إدخال بيانات يتطلب إعادة تشفير.
          </div>
        </Card>
      </div>
    </>
  );
}
