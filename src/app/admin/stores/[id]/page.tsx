import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { stores, users, plans, subOrders, products, domains, storePaymentAccounts, paymentProviders, commissionRecords } from "@/db/schema";
import { eq, desc, count, sum, ne, and } from "drizzle-orm";
import { PageHeader } from "@/components/shell";
import { Card, StatCard, Table, Badge, ActionForm, Field, Select, SubmitButton } from "@/components/ui";
import { adminUpdateStore } from "@/actions/admin";
import { money, fmtDate, ORDER_STATUSES, PAYMENT_STATUSES } from "@/lib/utils";

export default async function AdminStoreDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const sid = Number(id);
  const [row] = await db.select({ s: stores, owner: users }).from(stores).innerJoin(users, eq(stores.ownerId, users.id)).where(eq(stores.id, sid));
  if (!row) notFound();
  const { s, owner } = row;
  const [planRows, [stats], [prodCount], ords, doms, accs, [comm]] = await Promise.all([
    db.select().from(plans).orderBy(plans.sortOrder),
    db.select({ c: count(), s: sum(subOrders.total) }).from(subOrders).where(and(eq(subOrders.storeId, sid), ne(subOrders.status, "cancelled"))),
    db.select({ c: count() }).from(products).where(eq(products.storeId, sid)),
    db.select().from(subOrders).where(eq(subOrders.storeId, sid)).orderBy(desc(subOrders.createdAt)).limit(15),
    db.select().from(domains).where(eq(domains.storeId, sid)),
    db.select({ a: storePaymentAccounts, p: paymentProviders }).from(storePaymentAccounts).innerJoin(paymentProviders, eq(storePaymentAccounts.providerId, paymentProviders.id)).where(eq(storePaymentAccounts.storeId, sid)),
    db.select({ s: sum(commissionRecords.amount) }).from(commissionRecords).where(and(eq(commissionRecords.storeId, sid), ne(commissionRecords.status, "waived"))),
  ]);
  return (
    <>
      <PageHeader title={s.name} desc={`${s.slug}.mscommerce.com · المالك: ${owner.name} (${owner.email})`} action={<Link href={`/s/${s.slug}`} target="_blank" className="rounded-xl border px-4 py-2 text-sm font-semibold">عرض المتجر</Link>} />
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="الطلبات" value={stats.c} tone="teal" /><StatCard label="المبيعات" value={money(stats.s)} tone="emerald" /><StatCard label="المنتجات" value={prodCount.c} tone="amber" /><StatCard label="عمولة المنصة" value={money(comm.s)} tone="rose" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="إعدادات المتجر والعمولة">
          <ActionForm action={adminUpdateStore} className="space-y-3">
            <input type="hidden" name="id" value={s.id} />
            <Field label="الاسم" name="name" defaultValue={s.name} /><Field label="المدينة" name="city" defaultValue={s.city} /><Field label="الهاتف" name="phone" defaultValue={s.phone} />
            <Select label="الحالة" name="status" defaultValue={s.status} options={[{ value: "active", label: "نشط" }, { value: "suspended", label: "معطل" }, { value: "pending", label: "قيد المراجعة" }]} />
            <Select label="الباقة" name="planId" defaultValue={s.planId ?? ""} options={planRows.map((p) => ({ value: p.id, label: `${p.name} (${money(p.priceMonthly)}/شهر)` }))} />
            <Select label="نوع العمولة" name="commissionType" defaultValue={s.commissionType ?? "default"} options={[{ value: "default", label: "العمولة الافتراضية للمنصة" }, { value: "percent", label: "نسبة مئوية خاصة" }, { value: "fixed", label: "مبلغ ثابت لكل طلب" }]} />
            <Field label="قيمة العمولة" name="commissionValue" type="number" step="0.01" defaultValue={s.commissionValue} />
            <SubmitButton>حفظ</SubmitButton>
          </ActionForm>
        </Card>
        <div className="lg:col-span-2 space-y-6">
          <Card title="آخر الطلبات"><Table head={["الرقم", "الإجمالي", "الدفع", "الحالة", "التاريخ"]} empty={!ords.length}>{ords.map((o) => <tr key={o.id}><td className="px-4 py-2 font-mono text-xs">{o.number}</td><td className="px-4 py-2">{money(o.total)}</td><td className="px-4 py-2"><Badge className={PAYMENT_STATUSES[o.paymentStatus]?.color}>{PAYMENT_STATUSES[o.paymentStatus]?.ar}</Badge></td><td className="px-4 py-2"><Badge className={ORDER_STATUSES[o.status]?.color}>{ORDER_STATUSES[o.status]?.ar}</Badge></td><td className="px-4 py-2 text-xs">{fmtDate(o.createdAt)}</td></tr>)}</Table></Card>
          <Card title="الدومينات"><Table head={["الدومين", "النوع", "الحالة", "SSL"]} empty={!doms.length}>{doms.map((d) => <tr key={d.id}><td className="px-4 py-2 font-mono text-xs">{d.hostname}</td><td className="px-4 py-2">{d.type}</td><td className="px-4 py-2">{d.status}</td><td className="px-4 py-2">{d.sslStatus}</td></tr>)}</Table></Card>
          <Card title="الحسابات البنكية والمحافظ (مقنّعة)"><Table head={["الجهة", "صاحب الحساب", "الرقم", "التحقق"]} empty={!accs.length}>{accs.map(({ a, p }) => <tr key={a.id}><td className="px-4 py-2">{p.name}</td><td className="px-4 py-2">{a.accountName}</td><td className="px-4 py-2 font-mono">****{a.accountNumberLast4}</td><td className="px-4 py-2"><Badge className={a.verificationStatus === "verified" ? "bg-blue-100 text-blue-800" : "bg-blue-100 text-blue-900"}>{a.verificationStatus}</Badge></td></tr>)}</Table></Card>
        </div>
      </div>
    </>
  );
}
