import { NextRequest } from "next/server";
import { getSession, audit } from "@/lib/auth";
import { execFile } from "child_process";
import { promisify } from "util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// TEMPORARY one-time endpoint so the project owner can download the complete,
// verified source tree and push it to GitHub (the current GitHub copy is missing
// files, e.g. src/db/schema.ts, which breaks the Vercel build).
// - Requires a logged-in super_admin session AND the one-time token.
// - Refuses to run on Vercel (only the dev sandbox).
// - Excludes secrets (.env), dependencies, build output and uploads.
// TODO: delete this file after the owner confirms the download.
const EXPORT_TOKEN = "ms-export-9f3k7q2z8x4v6b1n5m";

export async function GET(req: NextRequest) {
  if (process.env.VERCEL) return Response.json({ error: "disabled" }, { status: 403 });
  const s = await getSession();
  if (!s || s.role !== "super_admin") return Response.json({ error: "forbidden" }, { status: 403 });
  if (req.nextUrl.searchParams.get("token") !== EXPORT_TOKEN) return Response.json({ error: "bad token" }, { status: 403 });
  try {
    const execFileAsync = promisify(execFile);
    const { stdout } = await execFileAsync("tar", [
      "-czf", "-", "--exclude=node_modules", "--exclude=.next", "--exclude=uploads",
      "--exclude=backups", "--exclude=.env", "--exclude=.env.local", "--exclude=.git",
      ".",
    ], { cwd: process.cwd(), maxBuffer: 64 * 1024 * 1024, encoding: "buffer" });
    await audit("source_exported", "system", null, { by: s.email });
    return new Response(new Uint8Array(stdout as Buffer), {
      headers: {
        "Content-Type": "application/gzip",
        "Content-Disposition": `attachment; filename="ms-commerce-source.tar.gz"`,
      },
    });
  } catch (e) {
    return Response.json({ error: `export failed: ${(e as Error).message}` }, { status: 500 });
  }
}
