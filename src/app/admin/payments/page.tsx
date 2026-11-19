import { db } from "@/db";
import { paymentProviders, storePaymentAccounts, stores, paymentTransactions } from "@/db/schema";
import { eq, desc, count, sql } from "drizzle-orm";
import { PageHeader } from "@/components/shell";
import { Card, Table, Badge, Modal, ActionForm, Field, Select, Checkbox, TextArea, SubmitButton } from "@/components/ui";
import { adminSaveProvider, adminVerifyAccount } from "@/actions/admin";
import { money, fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

function ProviderForm({ p }: { p?: typeof paymentProviders.$inferSelect }) {
  return (
    <ActionForm action={adminSaveProvider} className="space-y-3">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid grid-cols-3 gap-3"><Field label="الكود" name="code" defaultValue={p?.code} required /><Field label="الاسم" name="name" defaultValue={p?.name} required /><Field label="الاسم EN" name="nameEn" defaultValue={p?.nameEn} required /></div>
      <div className="grid grid-cols-3 gap-3"><Select label="النوع" name="type" defaultValue={p?.type ?? "bank"} options={[{ value: "bank", label: "بنك" }, { value: "wallet", label: "محفظة إلكترونية" }, { value: "gateway", label: "بوابة دفع" }]} /><Select label="وضع التكامل" name="integrationMode" defaultValue={p?.integrationMode ?? "manual"} options={[{ value: "manual", label: "يدوي (تحويل + تحقق)" }, { value: "api", label: "API (يتطلب مفاتيح)" }]} /><Field label="الترتيب" name="sortOrder" type="number" defaultValue={p?.sortOrder ?? 0} /></div>
      <TextArea label="ملاحظة الترخيص" name="licenseNote" defaultValue={p?.licenseNote} rows={2} />
      <div className="flex gap-4"><Checkbox label="جهة مرخصة من البنك المركزي" name="isLicensed" defaultChecked={p?.isLicensed ?? true} /><Checkbox label="مفعلة" name="isActive" defaultChecked={p?.isActive ?? true} /></div>
      <SubmitButton>حفظ</SubmitButton>
    </ActionForm>
  );
}

export default async function AdminPayments() {
  const providers = await db.select({ p: paymentProviders, c: count(storePaymentAccounts.id) }).from(paymentProviders).leftJoin(storePaymentAccounts, eq(storePaymentAccounts.providerId, paymentProviders.id)).groupBy(paymentProviders.id).orderBy(paymentProviders.sortOrder);
  const pending = await db.select({ a: storePaymentAccounts, p: paymentProviders.name, store: stores.name }).from(storePaymentAccounts).innerJoin(paymentProviders, eq(storePaymentAccounts.providerId, paymentProviders.id)).innerJoin(stores, eq(storePaymentAccounts.storeId, stores.id)).orderBy(desc(storePaymentAccounts.createdAt)).limit(40);
  const txStats = await db.select({ status: paymentTransactions.status, c: count(), s: sql<string>`coalesce(sum(amount),0)` }).from(paymentTransactions).groupBy(paymentTransactions.status);
  return (
    <>
      <PageHeader title="وسائل الدفع اليمنية" desc="البنوك والمحافظ الإلكترونية وبوابات الدفع المتاحة للتجار" action={<Modal title="إضافة جهة دفع" trigger="+ جهة دفع"><ProviderForm /></Modal>} />
      <div className="grid gap-4 grid-cols-3 mb-6">{["under_review", "verified", "rejected"].map((st) => { const r = txStats.find((x) => x.status === st); return <div key={st} className="rounded-2xl bg-white border p-4"><div className="text-xs text-blue-600">{st === "under_review" ? "تحويلات قيد المراجعة" : st === "verified" ? "تحويلات متحقق منها" : "تحويلات مرفوضة"}</div><div className="text-xl font-extrabold">{r?.c ?? 0}</div><div className="text-xs">{money(r?.s)}</div></div>; })}</div>
      <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 text-sm text-blue-900 mb-6"><b>سياسة التسوية:</b> الأموال تذهب مباشرة إلى حساب/محفظة التاجر. المنصة لا تستلم أموالاً إلا عبر بوابة مرخصة بعد توقيع اتفاقية رسمية وإدخال مفاتيح API (حالة التكامل تظهر أدناه بصدق: لا يوجد تكامل API مفعّل حالياً).</div>
      <Table head={["الجهة", "النوع", "الترخيص", "التكامل", "حسابات التجار", "الحالة", ""]}>
        {providers.map(({ p, c }) => <tr key={p.id}><td className="px-4 py-2 font-semibold">{p.name}<div className="text-xs text-blue-500">{p.nameEn}{p.licenseNote && ` — ${p.licenseNote}`}</div></td><td className="px-4 py-2">{p.type === "bank" ? "🏦 بنك" : p.type === "wallet" ? "📱 محفظة" : "🌐 بوابة"}</td><td className="px-4 py-2">{p.isLicensed ? <Badge className="bg-blue-100 text-blue-800">مرخصة</Badge> : <Badge className="bg-blue-100 text-blue-900">غير مؤكدة</Badge>}</td><td className="px-4 py-2 text-xs">{p.integrationMode === "api" ? (p.apiConfigured ? "API مهيأ" : "API غير مهيأ") : "يدوي"}</td><td className="px-4 py-2">{c}</td><td className="px-4 py-2">{p.isActive ? <Badge className="bg-blue-100 text-blue-800">مفعلة</Badge> : <Badge className="bg-blue-50">معطلة</Badge>}</td><td className="px-4 py-2"><Modal title={`تعديل ${p.name}`} trigger="تعديل" triggerClass="text-xs font-semibold text-blue-800"><ProviderForm p={p} /></Modal></td></tr>)}
      </Table>
      <Card title="التحقق من ملكية حسابات التجار" className="mt-6">
        <Table head={["المتجر", "الجهة", "صاحب الحساب", "الرقم", "إثبات الملكية", "الحالة", "إجراء"]} empty={!pending.length}>
          {pending.map(({ a, p, store }) => <tr key={a.id}><td className="px-4 py-2 font-semibold">{store}</td><td className="px-4 py-2">{p}</td><td className="px-4 py-2">{a.accountName}</td><td className="px-4 py-2 font-mono">****{a.accountNumberLast4}</td><td className="px-4 py-2">{a.proofUrl ? <a href={a.proofUrl} target="_blank" className="text-blue-800 underline text-xs">عرض</a> : <span className="text-xs text-blue-500">لا يوجد</span>}</td><td className="px-4 py-2"><Badge className={a.verificationStatus === "verified" ? "bg-blue-100 text-blue-800" : a.verificationStatus === "rejected" ? "bg-blue-100 text-blue-900" : "bg-blue-100 text-blue-900"}>{a.verificationStatus}</Badge><div className="text-[10px] text-blue-500">{fmtDate(a.createdAt)}</div></td><td className="px-4 py-2"><div className="flex gap-2 text-xs"><form action={adminVerifyAccount}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="status" value="verified" /><button className="font-semibold text-blue-800">اعتماد</button></form><form action={adminVerifyAccount}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="status" value="rejected" /><button className="font-semibold text-blue-900">رفض</button></form></div></td></tr>)}
        </Table>
      </Card>
    </>
  );
}
