import { db } from "@/db";
import { users, stores } from "@/db/schema";
import { eq, desc, sql, inArray } from "drizzle-orm";
import { PageHeader } from "@/components/shell";
import { Table, Badge, Modal, ActionForm, Field, SubmitButton } from "@/components/ui";
import { adminToggleUser, adminResetPassword } from "@/actions/admin";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminMerchants({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const sp = await searchParams; const role = sp.role ?? "merchant";
  const list = await db.select({ u: users, storesCount: sql<number>`(select count(*) from stores where owner_id=${users.id})` }).from(users).where(inArray(users.role, role === "all" ? ["merchant", "staff", "customer"] : [role])).orderBy(desc(users.createdAt)).limit(300);
  const storeNames = await db.select({ ownerId: stores.ownerId, name: stores.name }).from(stores);
  return (
    <>
      <PageHeader title="إدارة الحسابات" desc="التجار والموظفون والعملاء" action={<div className="flex gap-1 text-xs">{[["merchant", "التجار"], ["staff", "الموظفون"], ["customer", "العملاء"], ["all", "الكل"]].map(([k, l]) => <a key={k} href={`?role=${k}`} className={`rounded-lg border px-3 py-1.5 ${role === k ? "bg-blue-950 text-white" : "bg-white"}`}>{l}</a>)}</div>} />
      <Table head={["الاسم", "البريد", "الهاتف", "الدور", "المتاجر", "الحالة", "التسجيل", "إجراءات"]} empty={!list.length}>
        {list.map(({ u, storesCount }) => (
          <tr key={u.id}>
            <td className="px-4 py-2 font-semibold">{u.name}</td><td className="px-4 py-2 text-xs">{u.email}</td><td className="px-4 py-2 text-xs">{u.phone}</td><td className="px-4 py-2">{u.role}</td>
            <td className="px-4 py-2 text-xs">{storesCount} <span className="text-blue-600">{storeNames.filter((s) => s.ownerId === u.id).map((s) => s.name).join("، ")}</span></td>
            <td className="px-4 py-2"><Badge className={u.isActive ? "bg-blue-100 text-blue-800" : "bg-blue-100 text-blue-900"}>{u.isActive ? "نشط" : "معطل"}</Badge></td>
            <td className="px-4 py-2 text-xs">{fmtDate(u.createdAt)}</td>
            <td className="px-4 py-2"><div className="flex items-center gap-2 text-xs">
              <form action={adminToggleUser}><input type="hidden" name="id" value={u.id} /><input type="hidden" name="active" value={u.isActive ? "0" : "1"} /><button className="font-semibold text-blue-800">{u.isActive ? "تعطيل" : "تفعيل"}</button></form>
              <Modal title={`إعادة تعيين كلمة مرور ${u.name}`} trigger="كلمة المرور" triggerClass="text-blue-800 font-semibold"><ActionForm action={adminResetPassword} className="space-y-3"><input type="hidden" name="id" value={u.id} /><Field label="كلمة المرور الجديدة" name="password" type="password" required /><SubmitButton>حفظ</SubmitButton></ActionForm></Modal>
            </div></td>
          </tr>
        ))}
      </Table>
    </>
  );
}
