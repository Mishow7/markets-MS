import { NextRequest } from "next/server";
import { trackCampaign } from "@/actions/storefront";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = Number(body.id); const type = body.type === "click" ? "click" : "view";
  if (!id) return Response.json({ ok: false }, { status: 400 });
  await trackCampaign(id, type);
  return Response.json({ ok: true });
}
