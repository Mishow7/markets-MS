import Link from "next/link";
import { db } from "@/db";
import { stores, users, plans, templates, subOrders } from "@/db/schema";
import { eq, desc, ne, sql, count } from "drizzle-orm";
import { PageHeader } from "@/components/shell";
import { Table, Badge, Modal, ActionForm, Field, Select, SubmitButton, ConfirmButton } from "@/components/ui";
import { adminCreateStore, adminToggleStore, adminDeleteStore } from "@/actions/admin";
import { money, YEMEN_CITIES } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminStores({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const rows = await db.select({ s: stores, owner: users.name, ownerEmail: users.email, plan: plans.name, sales: sql<string>`coalesce(sum(${subOrders.total}) filter (where ${subOrders.status}<>'cancelled'),0)`, orders: count(subOrders.id) }).from(stores).innerJoin(users, eq(stores.ownerId, users.id)).leftJoin(plans, eq(stores.planId, plans.id)).leftJoin(subOrders, eq(subOrders.storeId, stores.id)).where(ne(stores.status, "deleted")).groupBy(stores.id, users.name, users.email, plans.name).orderBy(desc(stores.createdAt));
  const list = sp.q ? rows.filter((r) => r.s.name.includes(sp.q!) || r.s.slug.includes(sp.q!) || r.ownerEmail.includes(sp.q!)) : rows;
  const [planRows, tplRows] = await Promise.all([db.select().from(plans).orderBy(plans.sortOrder), db.select().from(templates)]);
  return (
    <>
      <PageHeader title="إدارة المتاجر" desc={`${rows.length} متجر`} action={
        <Modal title="إنشاء متجر جديد" trigger="+ متجر جديد">
          <ActionForm action={adminCreateStore} className="space-y-3">
            <div className="grid grid-cols-2 gap-3"><Field label="اسم المتجر" name="name" required /><Field label="الرابط الفرعي" name="slug" placeholder="my-store" /></div>
            <Select label="المدينة" name="city" options={YEMEN_CITIES.map((c) => ({ value: c, label: c }))} />
            <div className="grid grid-cols-2 gap-3"><Select label="الباقة" name="planId" options={planRows.map((p) => ({ value: p.id, label: p.name }))} /><Select label="القالب" name="templateId" options={tplRows.map((t) => ({ value: t.id, label: t.name }))} /></div>
            <div className="rounded-xl bg-blue-50 p-3 space-y-3"><div className="text-sm font-bold">بيانات التاجر (يُنشأ حساب إن لم يكن موجوداً)</div><Field label="البريد الإلكتروني" name="ownerEmail" type="email" required /><div className="grid grid-cols-2 gap-3"><Field label="الاسم" name="ownerName" /><Field label="الهاتف" name="ownerPhone" /></div><Field label="كلمة المرور (للحساب الجديد)" name="ownerPassword" type="password" /></div>
            <SubmitButton>إنشاء</SubmitButton>
          </ActionForm>
        </Modal>} />
      <form className="mb-4"><input name="q" defaultValue={sp.q} placeholder="بحث بالاسم أو الرابط أو بريد التاجر…" className="w-full sm:w-80 rounded-xl border border-blue-200 px-4 py-2 text-sm" /></form>
      <Table head={["المتجر", "التاجر", "الباقة", "الطلبات", "المبيعات", "العمولة", "الحالة", "إجراءات"]} empty={!list.length}>
        {list.map(({ s, owner, ownerEmail, plan, sales, orders }) => (
          <tr key={s.id} className="hover:bg-blue-50">
            <td className="px-4 py-2"><Link href={`/admin/stores/${s.id}`} className="font-semibold hover:underline">{s.name}</Link><div className="text-xs text-blue-600">{s.slug}.mscommerce.com</div></td>
            <td className="px-4 py-2 text-xs">{owner}<div className="text-blue-600">{ownerEmail}</div></td>
            <td className="px-4 py-2">{plan ?? "-"}</td><td className="px-4 py-2">{orders}</td><td className="px-4 py-2">{money(sales)}</td>
            <td className="px-4 py-2 text-xs">{s.commissionType ? `${s.commissionValue}${s.commissionType === "percent" ? "%" : ""}` : "افتراضي"}</td>
            <td className="px-4 py-2"><Badge className={s.status === "active" ? "bg-blue-100 text-blue-800" : s.status === "suspended" ? "bg-blue-100 text-blue-900" : "bg-blue-100 text-blue-900"}>{s.status === "active" ? "نشط" : s.status === "suspended" ? "معطل" : s.status}</Badge></td>
            <td className="px-4 py-2"><div className="flex gap-2 text-xs"><Link href={`/admin/stores/${s.id}`} className="font-semibold text-blue-800">تعديل</Link><Link href={`/s/${s.slug}`} target="_blank" className="text-blue-800">عرض</Link>
              <form action={adminToggleStore}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="status" value={s.status === "active" ? "suspended" : "active"} /><button className={s.status === "active" ? "text-blue-800 font-semibold" : "text-blue-800 font-semibold"}>{s.status === "active" ? "تعطيل" : "تفعيل"}</button></form>
              <form action={adminDeleteStore}><input type="hidden" name="id" value={s.id} /><ConfirmButton message="سيتم أرشفة المتجر وإزالة دوميناته. متابعة؟">حذف</ConfirmButton></form></div></td>
          </tr>
        ))}
      </Table>
    </>
  );
}
