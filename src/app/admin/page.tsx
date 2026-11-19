import { db } from "@/db";
import { stores, users, products, subOrders, commissionRecords, subscriptions, plans } from "@/db/schema";
import { count, eq, sql, sum, desc, ne } from "drizzle-orm";
import { StatCard, Card, Table, Badge } from "@/components/ui";
import { Charts } from "@/components/shell-client";
import { PageHeader } from "@/components/shell";
import { money, fmtDate, ORDER_STATUSES } from "@/lib/utils";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [[st], [mer], [cus], [prod], [ord], [sales], [comm], [subRev]] = await Promise.all([
    db.select({ c: count(), active: sql<number>`count(*) filter (where status='active')` }).from(stores).where(ne(stores.status, "deleted")),
    db.select({ c: count() }).from(users).where(eq(users.role, "merchant")),
    db.select({ c: count() }).from(users).where(eq(users.role, "customer")),
    db.select({ c: count() }).from(products).where(eq(products.status, "active")),
    db.select({ c: count() }).from(subOrders),
    db.select({ s: sum(subOrders.total) }).from(subOrders).where(ne(subOrders.status, "cancelled")),
    db.select({ s: sum(commissionRecords.amount), due: sql<string>`coalesce(sum(amount) filter (where status in ('due','pending')),0)`, settled: sql<string>`coalesce(sum(amount) filter (where status='settled'),0)` }).from(commissionRecords).where(ne(commissionRecords.status, "waived")),
    db.select({ s: sum(subscriptions.amount) }).from(subscriptions).where(eq(subscriptions.status, "active")),
  ]);
  const daily = await db.execute(sql`select to_char(d, 'MM-DD') as day, coalesce(sum(so.total),0)::float as sales, count(so.id)::int as orders from generate_series(current_date - interval '13 days', current_date, '1 day') d left join sub_orders so on so.created_at::date = d::date and so.status <> 'cancelled' group by d order by d`);
  const topStores = await db.select({ id: stores.id, name: stores.name, slug: stores.slug, status: stores.status, sales: sql<string>`coalesce(sum(${subOrders.total}) filter (where ${subOrders.status} <> 'cancelled'),0)`, orders: count(subOrders.id) }).from(stores).leftJoin(subOrders, eq(subOrders.storeId, stores.id)).where(ne(stores.status, "deleted")).groupBy(stores.id).orderBy(desc(sql`3`)).limit(6);
  const recent = await db.select({ so: subOrders, storeName: stores.name }).from(subOrders).innerJoin(stores, eq(subOrders.storeId, stores.id)).orderBy(desc(subOrders.createdAt)).limit(8);
  const byPlan = await db.select({ name: plans.name, c: count(stores.id) }).from(plans).leftJoin(stores, eq(stores.planId, plans.id)).groupBy(plans.id);
  return (
    <>
      <PageHeader title="نظرة عامة على المنصة" desc="إحصائيات جميع المتاجر والتجار والمبيعات" />
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard label="المتاجر" value={st.c} sub={`${st.active} نشط`} icon="🏬" tone="teal" />
        <StatCard label="التجار / العملاء" value={`${mer.c} / ${cus.c}`} icon="👥" tone="indigo" />
        <StatCard label="المنتجات / الطلبات" value={`${prod.c} / ${ord.c}`} icon="📦" tone="amber" />
        <StatCard label="إجمالي المبيعات" value={money(sales.s)} icon="💵" tone="emerald" />
        <StatCard label="عمولات المنصة" value={money(comm.s)} sub={`مستحق: ${money(comm.due)} · محصّل: ${money(comm.settled)}`} icon="💰" tone="rose" />
        <StatCard label="إيراد الاشتراكات الشهري" value={money(subRev.s)} icon="🧾" tone="slate" />
        <StatCard label="الأرباح الإجمالية (عمولات + اشتراكات)" value={money(Number(comm.s ?? 0) + Number(subRev.s ?? 0))} icon="📈" tone="teal" />
        <StatCard label="متوسط قيمة الطلب" value={money(ord.c ? Number(sales.s ?? 0) / ord.c : 0)} icon="🧮" tone="indigo" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="المبيعات آخر 14 يوم" className="lg:col-span-2"><Charts type="area" data={daily.rows as Record<string, unknown>[]} xKey="day" series={[{ key: "sales", label: "المبيعات", color: "#1e3a8a" }]} /></Card>
        <Card title="المتاجر حسب الباقة"><Charts type="pie" data={byPlan.map((p) => ({ name: p.name, value: Number(p.c) }))} xKey="name" series={[{ key: "value", label: "متاجر", color: "#1e3a8a" }]} /></Card>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="أفضل المتاجر مبيعاً"><Table head={["المتجر", "الطلبات", "المبيعات", "الحالة"]}>{topStores.map((s) => <tr key={s.id}><td className="px-4 py-2 font-semibold"><Link href={`/admin/stores/${s.id}`} className="hover:underline">{s.name}</Link></td><td className="px-4 py-2">{s.orders}</td><td className="px-4 py-2">{money(s.sales)}</td><td className="px-4 py-2"><Badge className={s.status === "active" ? "bg-blue-100 text-blue-800" : "bg-blue-100 text-blue-900"}>{s.status}</Badge></td></tr>)}</Table></Card>
        <Card title="أحدث الطلبات"><Table head={["الطلب", "المتجر", "الإجمالي", "الحالة", "التاريخ"]} empty={!recent.length}>{recent.map(({ so, storeName }) => <tr key={so.id}><td className="px-4 py-2 font-mono text-xs">{so.number}</td><td className="px-4 py-2">{storeName}</td><td className="px-4 py-2">{money(so.total)}</td><td className="px-4 py-2"><Badge className={ORDER_STATUSES[so.status]?.color}>{ORDER_STATUSES[so.status]?.ar}</Badge></td><td className="px-4 py-2 text-xs text-blue-600">{fmtDate(so.createdAt)}</td></tr>)}</Table></Card>
      </div>
    </>
  );
}
