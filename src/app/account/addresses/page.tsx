import { requireUser } from "@/lib/auth";
import { db } from "@/db";
import { addresses } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Modal, ActionForm, Field, Select, Checkbox, SubmitButton, ConfirmButton } from "@/components/ui";
import { saveAddress, deleteAddress } from "@/actions/storefront";
import { YEMEN_CITIES } from "@/lib/utils";

export const dynamic = "force-dynamic";
export default async function Addresses() {
  const u = await requireUser();
  const list = await db.select().from(addresses).where(eq(addresses.userId, u.id));
  const Form = ({ a }: { a?: typeof addresses.$inferSelect }) => <ActionForm action={saveAddress} className="space-y-3">{a && <input type="hidden" name="id" value={a.id} />}<div className="grid grid-cols-2 gap-3"><Field label="التسمية" name="label" defaultValue={a?.label ?? "المنزل"} /><Field label="الاسم الكامل" name="fullName" defaultValue={a?.fullName} required /><Field label="الهاتف" name="phone" defaultValue={a?.phone} required /><Select label="المدينة" name="city" defaultValue={a?.city} options={YEMEN_CITIES.map((c) => ({ value: c, label: c }))} /><Field label="المديرية / الحي" name="district" defaultValue={a?.district} /><Field label="الشارع" name="street" defaultValue={a?.street} /></div><Field label="ملاحظات" name="notes" defaultValue={a?.notes} /><Checkbox label="العنوان الافتراضي" name="isDefault" defaultChecked={a?.isDefault} /><SubmitButton>حفظ</SubmitButton></ActionForm>;
  return (
    <>
      <div className="mb-4 flex items-center justify-between"><h1 className="text-xl font-extrabold">عناويني</h1><Modal title="عنوان جديد" trigger="+ عنوان"><Form /></Modal></div>
      <div className="grid gap-4 sm:grid-cols-2">{list.map((a) => <div key={a.id} className="rounded-2xl bg-white p-4 shadow-sm"><div className="flex justify-between"><b>{a.label} {a.isDefault && "⭐"}</b><div className="flex gap-2 text-xs"><Modal title="تعديل" trigger="تعديل" triggerClass="text-blue-800 font-semibold"><Form a={a} /></Modal><form action={deleteAddress}><input type="hidden" name="id" value={a.id} /><ConfirmButton>حذف</ConfirmButton></form></div></div><div className="mt-2 text-sm text-blue-800">{a.fullName} · {a.phone}<br />{a.city} {a.district} {a.street}</div></div>)}{!list.length && <p className="text-blue-500">لا توجد عناوين محفوظة</p>}</div>
    </>
  );
}
