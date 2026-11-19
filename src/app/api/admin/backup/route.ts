import { NextRequest } from "next/server";
import { getSession, audit } from "@/lib/auth";
import { db } from "@/db";
import { backups } from "@/db/schema";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Super-admin only: generates a full JSON dump in-memory and streams it as a file download. Works on Vercel/serverless. */
export async function GET(_req: NextRequest) {
  const s = await getSession();
  if (!s || s.role !== "super_admin") return Response.json({ error: "forbidden" }, { status: 403 });
  try {
    const tables = await db.execute(sql`select tablename from pg_tables where schemaname='public' order by tablename`);
    const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), tables: {} as Record<string, unknown[]> };
    for (const row of tables.rows as { tablename: string }[]) {
      const r = await db.execute(sql.raw(`select * from "${row.tablename.replace(/"/g, "")}"`));
      (out.tables as Record<string, unknown[]>)[row.tablename] = r.rows;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `backup-${stamp}.json`;
    const body = JSON.stringify(out);
    await db.insert(backups).values({ filename, size: Buffer.byteLength(body), method: "download", createdBy: s.id });
    await audit("backup_downloaded", "backup", null, { filename });
    return new Response(body, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return Response.json({ error: `فشل إنشاء النسخة: ${(e as Error).message}` }, { status: 500 });
  }
}
