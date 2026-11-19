import { db } from "@/db";
import { plans, stores, subscriptions } from "@/db/schema";
import { eq, count, desc } from "drizzle-orm";
import { PageHeader } from "@/components/shell";
import { Card, Table, Modal, ActionForm, Field, Checkbox, TextArea, SubmitButton, Badge } from "@/components/ui";
import { adminSavePlan } from "@/actions/admin";
import { money, fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

function PlanForm({ p }: { p?: typeof plans.$inferSelect }) {
  return (
    <ActionForm action={adminSavePlan} className="space-y-3">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid grid-cols-3 gap-3"><Field label="المعرف (slug)" name="slug" defaultValue={p?.slug} required /><Field label="الاسم" name="name" defaultValue={p?.name} required /><Field label="الاسم بالإنجليزية" name="nameEn" defaultValue={p?.nameEn} required /></div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3"><Field label="السعر الشهري" name="priceMonthly" type="number" defaultValue={p?.priceMonthly} /><Field label="حد المنتجات" name="maxProducts" type="number" defaultValue={p?.maxProducts ?? 20} /><Field label="الدومينات" name="maxDomains" type="number" defaultValue={p?.maxDomains ?? 0} /><Field label="الموظفون" name="maxStaff" type="number" defaultValue={p?.maxStaff ?? 0} /><Field label="الترتيب" name="sortOrder" type="number" defaultValue={p?.sortOrder ?? 0} /></div>
      <div className="flex flex-wrap gap-4"><Checkbox label="قوالب مميزة" name="premiumTemplates" defaultChecked={p?.premiumTemplates} /><Checkbox label="أدوات التسويق" name="marketingTools" defaultChecked={p?.marketingTools} /><Checkbox label="منشئ الصفحات" name="pageBuilder" defaultChecked={p?.pageBuilder ?? true} /><Checkbox label="مفعلة" name="isActive" defaultChecked={p?.isActive ?? true} /></div>
      <TextArea label="المزايا (سطر لكل ميزة)" name="features" defaultValue={p?.features.join("\n")} rows={4} />
      <SubmitButton>حفظ</SubmitButton>
    </ActionForm>
  );
}

export default async function AdminPlans() {
  const list = await db.select({ p: plans, c: count(stores.id) }).from(plans).leftJoin(stores, eq(stores.planId, plans.id)).groupBy(plans.id).orderBy(plans.sortOrder);
  const subs = await db.select({ s: subscriptions, store: stores.name, plan: plans.name }).from(subscriptions).innerJoin(stores, eq(subscriptions.storeId, stores.id)).innerJoin(plans, eq(subscriptions.planId, plans.id)).orderBy(desc(subscriptions.createdAt)).limit(30);
  return (
    <>
      <PageHeader title="الباقات والاشتراكات" action={<Modal title="باقة جديدة" trigger="+ باقة"><PlanForm /></Modal>} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {list.map(({ p, c }) => (
          <Card key={p.id} title={p.name} action={<Modal title={`تعديل ${p.name}`} trigger="تعديل" triggerClass="text-xs font-semibold text-blue-800"><PlanForm p={p} /></Modal>}>
            <div className="text-2xl font-extrabold text-blue-800">{money(p.priceMonthly)}<span className="text-xs text-blue-600 font-normal">/شهر</span></div>
            <ul className="mt-3 space-y-1 text-xs text-blue-800"><li>📦 {p.maxProducts} منتج</li><li>🌐 {p.maxDomains} دومين</li><li>👤 {p.maxStaff} موظف</li><li>{p.premiumTemplates ? "✅" : "❌"} قوالب مميزة</li><li>{p.marketingTools ? "✅" : "❌"} أدوات تسويق</li></ul>
            <div className="mt-3 flex items-center justify-between"><Badge>{c} متجر</Badge>{!p.isActive && <Badge className="bg-blue-100 text-blue-900">معطلة</Badge>}</div>
          </Card>
        ))}
      </div>
      <Card title="سجل الاشتراكات" className="mt-6"><Table head={["المتجر", "الباقة", "المبلغ", "الحالة", "البداية", "النهاية"]} empty={!subs.length}>{subs.map(({ s, store, plan }) => <tr key={s.id}><td className="px-4 py-2 font-semibold">{store}</td><td className="px-4 py-2">{plan}</td><td className="px-4 py-2">{money(s.amount)}</td><td className="px-4 py-2"><Badge className={s.status === "active" ? "bg-blue-100 text-blue-800" : ""}>{s.status}</Badge></td><td className="px-4 py-2 text-xs">{fmtDate(s.startsAt)}</td><td className="px-4 py-2 text-xs">{fmtDate(s.endsAt)}</td></tr>)}</Table></Card>
    </>
  );
}
