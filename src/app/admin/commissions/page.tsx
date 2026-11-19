import { db } from "@/db";
import { commissionRecords, stores, subOrders, platformSettings } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { PageHeader } from "@/components/shell";
import { Card, Table, Badge, StatCard, ActionForm, Field, Select, SubmitButton } from "@/components/ui";
import { adminSettleCommission, adminSaveSettings } from "@/actions/admin";
import { money, fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminCommissions({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const list = await db.select({ c: commissionRecords, store: stores.name, number: subOrders.number, orderStatus: subOrders.status }).from(commissionRecords).innerJoin(stores, eq(commissionRecords.storeId, stores.id)).innerJoin(subOrders, eq(commissionRecords.subOrderId, subOrders.id)).where(sp.status ? eq(commissionRecords.status, sp.status) : undefined).orderBy(desc(commissionRecords.createdAt)).limit(100);
  const totals = await db.select({ status: commissionRecords.status, s: sql<string>`coalesce(sum(amount),0)` }).from(commissionRecords).groupBy(commissionRecords.status);
  const byStore = await db.select({ store: stores.name, s: sql<string>`coalesce(sum(${commissionRecords.amount}) filter (where ${commissionRecords.status} in ('due','pending')),0)` }).from(commissionRecords).innerJoin(stores, eq(commissionRecords.storeId, stores.id)).groupBy(stores.name).orderBy(desc(sql`2`)).limit(10);
  const [cfg] = await db.select().from(platformSettings).where(eq(platformSettings.key, "commission"));
  const v = (cfg?.value ?? { type: "percent", value: 5 }) as { type: string; value: number };
  const t = (k: string) => totals.find((x) => x.status === k)?.s ?? 0;
  const SM: Record<string, string> = { pending: "bg-blue-50 text-blue-900", due: "bg-blue-100 text-blue-900", settled: "bg-blue-100 text-blue-800", waived: "bg-blue-100 text-blue-900" };
  return (
    <>
      <PageHeader title="العمولات" desc="عمولة المنصة على مبيعات كل متجر. تُستحق عند التسليم وتُسوّى عند تحصيلها من التاجر." />
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4"><StatCard label="قيد الانتظار (طلبات لم تُسلّم)" value={money(t("pending"))} tone="slate" /><StatCard label="مستحقة على التجار" value={money(t("due"))} tone="amber" /><StatCard label="محصّلة" value={money(t("settled"))} tone="emerald" /><StatCard label="ملغاة" value={money(t("waived"))} tone="rose" /></div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="العمولة الافتراضية للمنصة">
          <ActionForm action={adminSaveSettings} className="space-y-3"><input type="hidden" name="key" value="commission" /><Select label="النوع" name="type" defaultValue={v.type} options={[{ value: "percent", label: "نسبة مئوية من المبيعات" }, { value: "fixed", label: "مبلغ ثابت لكل طلب" }]} /><Field label="القيمة" name="value" type="number" step="0.01" defaultValue={v.value} /><SubmitButton>حفظ</SubmitButton></ActionForm>
          <p className="mt-3 text-xs text-blue-600">يمكن تخصيص عمولة مختلفة لكل متجر من صفحة المتجر.</p>
          <div className="mt-4"><div className="text-sm font-bold mb-2">المستحق حسب المتجر</div>{byStore.map((b) => <div key={b.store} className="flex justify-between text-sm py-1 border-b"><span>{b.store}</span><b>{money(b.s)}</b></div>)}</div>
        </Card>
        <div className="lg:col-span-2">
          <div className="mb-3 flex gap-1 text-xs">{[["", "الكل"], ["pending", "انتظار"], ["due", "مستحقة"], ["settled", "محصلة"], ["waived", "ملغاة"]].map(([k, l]) => <a key={k} href={k ? `?status=${k}` : "?"} className={`rounded-lg border px-3 py-1.5 ${(sp.status ?? "") === k ? "bg-blue-950 text-white" : "bg-white"}`}>{l}</a>)}</div>
          <Table head={["الطلب", "المتجر", "الأساس", "النسبة", "العمولة", "الحالة", "التاريخ", "إجراء"]} empty={!list.length}>
            {list.map(({ c, store, number }) => <tr key={c.id}><td className="px-4 py-2 font-mono text-xs">{number}</td><td className="px-4 py-2">{store}</td><td className="px-4 py-2">{money(c.baseAmount)}</td><td className="px-4 py-2 text-xs">{c.rate}{c.type === "percent" ? "%" : ""}</td><td className="px-4 py-2 font-bold">{money(c.amount)}</td><td className="px-4 py-2"><Badge className={SM[c.status]}>{c.status}</Badge></td><td className="px-4 py-2 text-xs">{fmtDate(c.createdAt)}</td><td className="px-4 py-2"><div className="flex gap-2 text-xs">{c.status !== "settled" && <form action={adminSettleCommission}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value="settled" /><button className="font-semibold text-blue-800">تسوية</button></form>}{c.status !== "waived" && <form action={adminSettleCommission}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value="waived" /><button className="text-blue-900">إعفاء</button></form>}</div></td></tr>)}
          </Table>
        </div>
      </div>
    </>
  );
}
