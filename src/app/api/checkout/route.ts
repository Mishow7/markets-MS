import { NextRequest } from "next/server";
import { placeOrder, quoteCart, type CheckoutInput } from "@/actions/storefront";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return Response.json({ error: "bad request" }, { status: 400 });
  if (body.action === "quote") {
    const r = await quoteCart(body.lines ?? [], body.city ?? "", body.coupons ?? {});
    return Response.json(r);
  }
  const r = await placeOrder(body as CheckoutInput);
  return Response.json(r, { status: "error" in r && r.error ? 400 : 200 });
}
