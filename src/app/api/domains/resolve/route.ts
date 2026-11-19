import { NextRequest } from "next/server";
import { db } from "@/db";
import { domains, stores } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
/** Used by proxy.ts to map an incoming hostname (custom domain or subdomain) to a store slug. */
export async function GET(req: NextRequest) {
  const host = (req.nextUrl.searchParams.get("host") ?? "").toLowerCase().split(":")[0];
  if (!host) return Response.json({ slug: null });
  const [row] = await db.select({ slug: stores.slug, status: stores.status }).from(domains).innerJoin(stores, eq(domains.storeId, stores.id)).where(and(eq(domains.hostname, host), eq(domains.status, "active")));
  if (row && row.status === "active") return Response.json({ slug: row.slug });
  return Response.json({ slug: null });
}
