import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/db";
import { orders, subOrders, stores } from "@/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { Badge, Table } from "@/components/ui";
import { money, fmtDate, ORDER_STATUSES, PAYMENT_STATUSES } from "@/lib/utils";

export const dynamic = "force-dynamic";
export default async function MyOrders() {
  const u = await requireUser();
  const list = await db.select().from(orders).where(eq(orders.customerId, u.id)).orderBy(desc(orders.createdAt)).limit(50);
  const subs = list.length ? await db.select({ so: subOrders, store: stores.name }).from(subOrders).innerJoin(stores, eq(subOrders.storeId, stores.id)).where(inArray(subOrders.orderId, list.map((o) => o.id))) : [];
  return (
    <>
      <h1 className="mb-4 text-xl font-extrabold">طلباتي</h1>
      <Table head={["الطلب", "المتاجر / الحالة", "الإجمالي", "التاريخ", ""]} empty={!list.length}>
        {list.map((o) => <tr key={o.id}><td className="px-4 py-2 font-mono text-xs font-bold">{o.orderNumber}</td><td className="px-4 py-2 space-y-1">{subs.filter((s) => s.so.orderId === o.id).map(({ so, store }) => <div key={so.id} className="flex flex-wrap gap-1 items-center text-xs"><span className="font-semibold">{store}</span><Badge className={ORDER_STATUSES[so.status]?.color}>{ORDER_STATUSES[so.status]?.ar}</Badge><Badge className={PAYMENT_STATUSES[so.paymentStatus]?.color}>{PAYMENT_STATUSES[so.paymentStatus]?.ar}</Badge></div>)}</td><td className="px-4 py-2 font-bold">{money(o.total)}</td><td className="px-4 py-2 text-xs">{fmtDate(o.createdAt)}</td><td className="px-4 py-2"><Link href={`/order/${o.orderNumber}?token=${o.trackingToken}`} className="text-xs font-semibold text-blue-800">التفاصيل والدفع</Link></td></tr>)}
      </Table>
    </>
  );
}
