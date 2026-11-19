import { db } from "@/db";
import { auditLogs, users, stores } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { PageHeader } from "@/components/shell";
import { Table } from "@/components/ui";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminAudit({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const sp = await searchParams; const page = Math.max(1, Number(sp.page) || 1);
  const list = await db.select({ a: auditLogs, user: users.name, store: stores.name }).from(auditLogs).leftJoin(users, eq(auditLogs.userId, users.id)).leftJoin(stores, eq(auditLogs.storeId, stores.id)).orderBy(desc(auditLogs.createdAt)).limit(100).offset((page - 1) * 100);
  return (
    <>
      <PageHeader title="سجل العمليات والتعديلات" desc="تتبع كامل لجميع العمليات الحساسة" action={<div className="flex gap-2 text-sm">{page > 1 && <a href={`?page=${page - 1}`} className="rounded-lg border px-3 py-1">السابق</a>}<a href={`?page=${page + 1}`} className="rounded-lg border px-3 py-1">التالي</a></div>} />
      <Table head={["الوقت", "المستخدم", "المتجر", "العملية", "الكيان", "تفاصيل", "IP"]} empty={!list.length}>
        {list.map(({ a, user, store }) => <tr key={a.id}><td className="px-4 py-2 text-xs whitespace-nowrap">{fmtDate(a.createdAt)}</td><td className="px-4 py-2">{user ?? "-"}</td><td className="px-4 py-2">{store ?? "-"}</td><td className="px-4 py-2 font-mono text-xs">{a.action}</td><td className="px-4 py-2 text-xs">{a.entity}{a.entityId ? ` #${a.entityId}` : ""}</td><td className="px-4 py-2 text-xs text-blue-600 max-w-xs truncate">{a.meta ? JSON.stringify(a.meta) : ""}</td><td className="px-4 py-2 text-xs">{a.ip}</td></tr>)}
      </Table>
    </>
  );
}
