import { db } from "@/db";
import { templates, stores } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import { PageHeader } from "@/components/shell";
import { Modal, ActionForm, Field, Select, Checkbox, TextArea, SubmitButton, Badge } from "@/components/ui";
import { adminSaveTemplate } from "@/actions/admin";

export const dynamic = "force-dynamic";
const CATS = [["general", "عام"], ["fashion", "ملابس"], ["electronics", "إلكترونيات"], ["perfume", "عطور"], ["furniture", "أثاث"], ["food", "أغذية"], ["beauty", "تجميل"]];

function TplForm({ t }: { t?: typeof templates.$inferSelect }) {
  return (
    <ActionForm action={adminSaveTemplate} className="space-y-3">
      {t && <input type="hidden" name="id" value={t.id} />}
      <div className="grid grid-cols-3 gap-3"><Field label="المعرف" name="slug" defaultValue={t?.slug} required /><Field label="الاسم" name="name" defaultValue={t?.name} required /><Field label="الاسم EN" name="nameEn" defaultValue={t?.nameEn} required /></div>
      <Select label="النشاط" name="category" defaultValue={t?.category} options={CATS.map(([v, l]) => ({ value: v, label: l }))} />
      <TextArea label="الوصف" name="description" defaultValue={t?.description} rows={2} />
      <Field label="رابط صورة المعاينة" name="previewUrl" defaultValue={t?.previewUrl} />
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3"><Field label="اللون الأساسي" name="primaryColor" type="color" defaultValue={t?.defaultTheme.primaryColor ?? "#1e3a8a"} /><Field label="الثانوي" name="secondaryColor" type="color" defaultValue={t?.defaultTheme.secondaryColor ?? "#3b82f6"} /><Field label="الخلفية" name="backgroundColor" type="color" defaultValue={t?.defaultTheme.backgroundColor ?? "#ffffff"} /><Field label="النص" name="textColor" type="color" defaultValue={t?.defaultTheme.textColor ?? "#172554"} /><Select label="الخط" name="fontFamily" defaultValue={t?.defaultTheme.fontFamily ?? "Tajawal"} options={["Tajawal", "Cairo", "Amiri"].map((f) => ({ value: f, label: f }))} /></div>
      <div className="flex gap-4"><Checkbox label="قالب مميز (للباقات المدفوعة)" name="isPremium" defaultChecked={t?.isPremium} /><Checkbox label="مفعل" name="isActive" defaultChecked={t?.isActive ?? true} /></div>
      <SubmitButton>حفظ</SubmitButton>
    </ActionForm>
  );
}

export default async function AdminTemplates() {
  const list = await db.select({ t: templates, c: count(stores.id) }).from(templates).leftJoin(stores, eq(stores.templateId, templates.id)).groupBy(templates.id).orderBy(templates.id);
  return (
    <>
      <PageHeader title="مكتبة القوالب" desc="القوالب المركزية المتاحة للتجار" action={<Modal title="قالب جديد" trigger="+ قالب"><TplForm /></Modal>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {list.map(({ t, c }) => (
          <div key={t.id} className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
            <div className="h-36 p-4 flex flex-col justify-end" style={{ background: t.previewUrl ? `url(${t.previewUrl}) center/cover` : `linear-gradient(135deg, ${t.defaultTheme.primaryColor}, ${t.defaultTheme.secondaryColor})`, fontFamily: t.defaultTheme.fontFamily }}><span className="w-fit rounded-lg bg-white/90 px-3 py-1 text-sm font-bold" style={{ color: t.defaultTheme.primaryColor }}>{t.name}</span></div>
            <div className="p-4">
              <div className="flex items-center justify-between"><div className="font-bold">{t.name} <span className="text-xs text-blue-500">{t.nameEn}</span></div><div className="flex gap-1">{t.isPremium && <Badge className="bg-blue-100 text-blue-900">مميز</Badge>}{!t.isActive && <Badge className="bg-blue-100 text-blue-900">معطل</Badge>}</div></div>
              <p className="mt-1 text-xs text-blue-600">{t.description}</p>
              <div className="mt-3 flex items-center justify-between text-xs"><span>{CATS.find((x) => x[0] === t.category)?.[1]} · {c} متجر</span><Modal title={`تعديل ${t.name}`} trigger="تعديل" triggerClass="font-semibold text-blue-800"><TplForm t={t} /></Modal></div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
