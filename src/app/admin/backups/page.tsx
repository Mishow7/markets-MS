import { db } from "@/db";
import { backups, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { PageHeader } from "@/components/shell";
import { Table, SubmitButton } from "@/components/ui";
import { adminCreateBackup } from "@/actions/admin";
import { fmtDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminBackups() {
  const list = await db.select({ b: backups, user: users.name }).from(backups).leftJoin(users, eq(backups.createdBy, users.id)).orderBy(desc(backups.createdAt));
  return (
    <>
      <PageHeader title="النسخ الاحتياطية" desc={process.env.VERCEL ? "على Vercel: نزّل نسخة JSON كاملة مباشرة (نظام الملفات مؤقت ولا يدعم pg_dump)" : "نسخ كاملة لقاعدة البيانات (pg_dump) تُحفظ في مجلد backups/ على الخادم"} action={<div className="flex gap-2"><a href="/api/admin/backup" className="rounded-xl bg-blue-800 px-4 py-2.5 text-sm font-semibold text-white">⬇ تنزيل نسخة JSON الآن</a>{!process.env.VERCEL && <form action={async () => { "use server"; await adminCreateBackup(); }}><SubmitButton>+ نسخة pg_dump على الخادم</SubmitButton></form>}</div>} />
      <Table head={["الملف", "الحجم", "الطريقة", "بواسطة", "التاريخ"]} empty={!list.length}>
        {list.map(({ b, user }) => <tr key={b.id}><td className="px-4 py-2 font-mono text-xs">{b.filename}</td><td className="px-4 py-2">{(b.size / 1024).toFixed(1)} KB</td><td className="px-4 py-2">{b.method}</td><td className="px-4 py-2">{user}</td><td className="px-4 py-2 text-xs">{fmtDate(b.createdAt)}</td></tr>)}
      </Table>
      <p className="mt-4 text-xs text-blue-600">للنسخ المجدولة: أضف cron على الخادم يستدعي <code>pg_dump</code> يومياً أو استخدم خدمة النسخ لدى مزود الاستضافة. يُنصح بنقل الملفات إلى تخزين خارجي.</p>
    </>
  );
}
