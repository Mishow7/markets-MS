import { db } from "@/db";
import { domains, stores, platformSettings } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { PageHeader } from "@/components/shell";
import { Card, Table, Badge, ActionForm, Field, SubmitButton } from "@/components/ui";
import { adminUpdateDomain, adminSaveSettings } from "@/actions/admin";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
const ST: Record<string, string> = { pending: "bg-blue-50 text-blue-900", verified: "bg-blue-100 text-blue-800", active: "bg-blue-100 text-blue-800", failed: "bg-blue-100 text-blue-900" };

export default async function AdminDomains() {
  const list = await db.select({ d: domains, store: stores.name, slug: stores.slug }).from(domains).innerJoin(stores, eq(domains.storeId, stores.id)).orderBy(desc(domains.createdAt));
  const [cfg] = await db.select().from(platformSettings).where(eq(platformSettings.key, "domains"));
  const v = (cfg?.value ?? {}) as { cnameTarget?: string; aRecord?: string; verificationPrefix?: string };
  return (
    <>
      <PageHeader title="إدارة الدومينات" desc="متابعة حالة جميع الدومينات الفرعية والمستقلة" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="إعدادات DNS للمنصة">
          <ActionForm action={adminSaveSettings} className="space-y-3">
            <input type="hidden" name="key" value="domains" />
            <Field label="هدف CNAME" name="cnameTarget" defaultValue={v.cnameTarget} hint="مثال: stores.mscommerce.com — يجب أن يشير إلى خادم المنصة" />
            <Field label="سجل A (IP الخادم)" name="aRecord" defaultValue={v.aRecord} hint="للدومينات الجذرية (بدون www)" />
            <Field label="بادئة سجل TXT للتحقق" name="verificationPrefix" defaultValue={v.verificationPrefix ?? "_ms-verify"} />
            <SubmitButton>حفظ</SubmitButton>
          </ActionForm>
          <div className="mt-4 rounded-xl bg-blue-50 p-3 text-xs text-blue-900 leading-relaxed">
            <b>متطلبات التشغيل الحقيقية:</b> يجب توجيه <code>*.{"{"}الدومين الرئيسي{"}"}</code> والدومينات المستقلة إلى هذا الخادم، وتثبيت وكيل عكسي (Caddy أو Nginx + certbot) لإصدار شهادات SSL تلقائياً عبر Let&apos;s Encrypt (On-Demand TLS). التحقق من TXT/CNAME يتم فعلياً من هذه اللوحة، أما إصدار SSL فيتم على مستوى الوكيل العكسي ويُحدَّث هنا.
          </div>
        </Card>
        <div className="lg:col-span-2">
          <Table head={["الدومين", "المتجر", "النوع", "الحالة", "SSL", "آخر فحص", "إجراءات"]} empty={!list.length}>
            {list.map(({ d, store }) => (
              <tr key={d.id}>
                <td className="px-4 py-2 font-mono text-xs">{d.hostname}{d.isPrimary && " ★"}</td><td className="px-4 py-2">{store}</td><td className="px-4 py-2 text-xs">{d.type === "subdomain" ? "فرعي" : "مستقل"}</td>
                <td className="px-4 py-2"><Badge className={ST[d.status]}>{d.status}</Badge>{d.lastError && <div className="text-[10px] text-blue-900 max-w-[180px] truncate" title={d.lastError}>{d.lastError}</div>}</td>
                <td className="px-4 py-2 text-xs">{d.sslStatus}</td><td className="px-4 py-2 text-xs">{fmtDate(d.lastCheckedAt)}</td>
                <td className="px-4 py-2"><form action={adminUpdateDomain} className="flex gap-1"><input type="hidden" name="id" value={d.id} /><select name="status" defaultValue={d.status} className="rounded-lg border px-1 py-1 text-xs"><option value="pending">pending</option><option value="verified">verified</option><option value="active">active</option><option value="failed">failed</option></select><select name="sslStatus" defaultValue={d.sslStatus} className="rounded-lg border px-1 py-1 text-xs"><option value="none">none</option><option value="pending">pending</option><option value="issued">issued</option><option value="failed">failed</option></select><button className="rounded-lg bg-blue-950 px-2 text-xs text-white">حفظ</button></form></td>
              </tr>
            ))}
          </Table>
        </div>
      </div>
    </>
  );
}
