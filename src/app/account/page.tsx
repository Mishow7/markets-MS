import { requireUser } from "@/lib/auth";
import { db } from "@/db";
import { orders, notifications } from "@/db/schema";
import { eq, desc, count } from "drizzle-orm";
import { Card, ActionForm, Field, SubmitButton } from "@/components/ui";
import { updateProfile } from "@/actions/storefront";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export default async function Account() {
  const u = await requireUser();
  const [[o], notifs] = await Promise.all([db.select({ c: count() }).from(orders).where(eq(orders.customerId, u.id)), db.select().from(notifications).where(eq(notifications.userId, u.id)).orderBy(desc(notifications.createdAt)).limit(10)]);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="بياناتي"><ActionForm action={updateProfile} className="space-y-3"><Field label="الاسم" name="name" defaultValue={u.name} /><Field label="البريد" name="email" defaultValue={u.email} /><Field label="الهاتف" name="phone" /><SubmitButton>حفظ</SubmitButton></ActionForm><p className="mt-3 text-sm text-blue-600">عدد طلباتك: <b>{o.c}</b></p></Card>
      <Card title="الإشعارات">{notifs.length === 0 && <p className="text-sm text-blue-500">لا توجد إشعارات</p>}{notifs.map((n) => <div key={n.id} className="border-b py-2 text-sm"><div className="font-semibold">{n.title}</div><div className="text-blue-800">{n.body}</div><div className="text-xs text-blue-500">{fmtDate(n.createdAt)}</div></div>)}</Card>
    </div>
  );
}
