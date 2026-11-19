import { db } from "@/db";
import { subOrders, stores, commissionRecords, subscriptions, paymentTransactions } from "@/db/schema";
import { eq, sql, ne, and } from "drizzle-orm";
import { PageHeader } from "@/components/shell";
import { Card, Table, StatCard } from "@/components/ui";
import { Charts } from "@/components/shell-client";
import { money, PAYMENT_METHODS } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminReports() {
  const monthly = await db.execute(sql`select to_char(m, 'YYYY-MM') as month, coalesce((select sum(total) from sub_orders so where date_trunc('month', so.created_at)=m and so.status<>'cancelled'),0)::float as sales, coalesce((select sum(amount) from commission_records c where date_trunc('month', c.created_at)=m and c.status<>'waived'),0)::float as commission, coalesce((select sum(amount) from subscriptions s where date_trunc('month', s.starts_at)=m),0)::float as subscriptions from generate_series(date_trunc('month', current_date) - interval '5 months', date_trunc('month', current_date), '1 month') m order by m`);
  const byMethod = await db.select({ method: subOrders.paymentMethod, c: sql<number>`count(*)::int`, s: sql<string>`coalesce(sum(total),0)` }).from(subOrders).where(ne(subOrders.status, "cancelled")).groupBy(subOrders.paymentMethod);
  const byStore = await db.select({ store: stores.name, orders: sql<number>`count(${subOrders.id})::int`, sales: sql<string>`coalesce(sum(${subOrders.total}) filter (where ${subOrders.status}<>'cancelled'),0)`, paid: sql<string>`coalesce(sum(${subOrders.total}) filter (where ${subOrders.paymentStatus}='paid'),0)`, commission: sql<string>`coalesce(sum(${subOrders.commissionAmount}) filter (where ${subOrders.status}<>'cancelled'),0)` }).from(stores).leftJoin(subOrders, eq(subOrders.storeId, stores.id)).where(ne(stores.status, "deleted")).groupBy(stores.name).orderBy(sql`3 desc`);
  const [tot] = await db.select({ sales: sql<string>`coalesce(sum(total) filter (where status<>'cancelled'),0)`, paid: sql<string>`coalesce(sum(total) filter (where payment_status='paid'),0)`, pendingVerif: sql<string>`coalesce(sum(total) filter (where payment_status='pending_verification'),0)` }).from(subOrders);
  const [comm] = await db.select({ s: sql<string>`coalesce(sum(amount),0)` }).from(commissionRecords).where(ne(commissionRecords.status, "waived"));
  const [subs] = await db.select({ s: sql<string>`coalesce(sum(amount),0)` }).from(subscriptions).where(eq(subscriptions.status, "active"));
  const [txs] = await db.select({ c: sql<number>`count(*)::int` }).from(paymentTransactions).where(and(eq(paymentTransactions.status, "under_review")));
  return (
    <>
      <PageHeader title="التقارير المالية" desc="إجمالي المبيعات والعمولات والاشتراكات عبر المنصة" />
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4"><StatCard label="إجمالي المبيعات" value={money(tot.sales)} tone="teal" /><StatCard label="مبيعات متحقق من دفعها" value={money(tot.paid)} sub={`بانتظار التحقق: ${money(tot.pendingVerif)}`} tone="emerald" /><StatCard label="عمولات المنصة" value={money(comm.s)} tone="rose" /><StatCard label="اشتراكات نشطة" value={money(subs.s)} sub={`${txs.c} تحويل قيد المراجعة`} tone="indigo" /></div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="المبيعات والعمولات الشهرية" className="lg:col-span-2"><Charts type="bar" data={monthly.rows as Record<string, unknown>[]} xKey="month" series={[{ key: "sales", label: "المبيعات", color: "#1e3a8a" }, { key: "commission", label: "العمولات", color: "#3b82f6" }, { key: "subscriptions", label: "الاشتراكات", color: "#1e40af" }]} /></Card>
        <Card title="حسب طريقة الدفع"><Charts type="pie" data={byMethod.map((m) => ({ name: PAYMENT_METHODS[m.method]?.ar ?? m.method, value: Number(m.s) }))} xKey="name" series={[{ key: "value", label: "المبلغ", color: "#1e3a8a" }]} /></Card>
      </div>
      <Card title="التقرير حسب المتجر" className="mt-6"><Table head={["المتجر", "الطلبات", "المبيعات", "المدفوع (متحقق)", "عمولة المنصة", "صافي التاجر"]}>{byStore.map((r) => <tr key={r.store}><td className="px-4 py-2 font-semibold">{r.store}</td><td className="px-4 py-2">{r.orders}</td><td className="px-4 py-2">{money(r.sales)}</td><td className="px-4 py-2">{money(r.paid)}</td><td className="px-4 py-2">{money(r.commission)}</td><td className="px-4 py-2 font-bold">{money(Number(r.sales) - Number(r.commission))}</td></tr>)}</Table></Card>
    </>
  );
}
