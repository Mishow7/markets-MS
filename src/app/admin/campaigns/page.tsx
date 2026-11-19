import { db } from "@/db";
import { campaigns, stores, campaignEvents } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { PageHeader } from "@/components/shell";
import { Table, Badge } from "@/components/ui";
import { adminToggleCampaign } from "@/actions/admin";
import { money, PLACEMENTS } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminCampaigns() {
  const list = await db.select({ c: campaigns, store: stores.name, orders: sql<number>`(select count(*) from campaign_events e where e.campaign_id=${campaigns.id} and e.type='order')`, revenue: sql<string>`(select coalesce(sum(amount),0) from campaign_events e where e.campaign_id=${campaigns.id} and e.type='order')` }).from(campaigns).innerJoin(stores, eq(campaigns.storeId, stores.id)).orderBy(desc(campaigns.createdAt));
  void campaignEvents;
  return (
    <>
      <PageHeader title="إعلانات التجار" desc="مراقبة جميع الحملات الإعلانية وأدائها على مستوى المنصة" />
      <Table head={["الحملة", "المتجر", "النوع", "الموضع", "مشاهدات", "نقرات", "CTR", "طلبات", "مبيعات", "الحالة", ""]} empty={!list.length}>
        {list.map(({ c, store, orders, revenue }) => <tr key={c.id}><td className="px-4 py-2 font-semibold">{c.name}</td><td className="px-4 py-2">{store}</td><td className="px-4 py-2">{c.type}</td><td className="px-4 py-2 text-xs">{PLACEMENTS[c.placement]}</td><td className="px-4 py-2">{c.views}</td><td className="px-4 py-2">{c.clicks}</td><td className="px-4 py-2">{c.views ? ((c.clicks / c.views) * 100).toFixed(1) : 0}%</td><td className="px-4 py-2">{orders}</td><td className="px-4 py-2">{money(revenue)}</td><td className="px-4 py-2"><Badge className={c.isActive ? "bg-blue-100 text-blue-800" : "bg-blue-50"}>{c.isActive ? "نشطة" : "موقوفة"}</Badge></td><td className="px-4 py-2"><form action={adminToggleCampaign}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="active" value={c.isActive ? "0" : "1"} /><button className="text-xs font-semibold text-blue-800">{c.isActive ? "إيقاف" : "تفعيل"}</button></form></td></tr>)}
      </Table>
    </>
  );
}
