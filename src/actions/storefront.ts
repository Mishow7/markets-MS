"use server";
import { db } from "@/db";
import {
  products, stores, orders, subOrders, orderItems, orderStatusHistory, shippingZones, coupons, storePaymentMethods, storePaymentAccounts, paymentTransactions,
  commissionRecords, campaigns, campaignEvents, notifications, storeCustomers, platformSettings, addresses, wishlists, reviews, users,
} from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getSession, audit } from "@/lib/auth";
import { genNumber, randomToken, computeCommission, num } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "./auth";

export type CartLine = { productId: number; qty: number; variantKey?: string };

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function calcShipping(storeId: number, city: string, weight: number, subtotal: number) {
  const zones = await db.select().from(shippingZones).where(and(eq(shippingZones.storeId, storeId), eq(shippingZones.isActive, true)));
  const matches = zones.filter((z) => z.cities.length === 0 || z.cities.includes(city));
  return matches.map((z) => {
    let cost = 0;
    if (z.type === "free" || z.type === "pickup") cost = 0;
    else if (z.type === "flat") cost = num(z.baseCost);
    else cost = num(z.baseCost) + num(z.perKgCost) * Math.max(0, weight);
    if (z.freeAbove && subtotal >= num(z.freeAbove)) cost = 0;
    return { id: z.id, name: z.name, type: z.type, eta: z.etaDays, cost };
  });
}

/**
 * Quote: groups cart lines by store, validates stock, computes totals, available shipping and payment methods.
 */
export async function quoteCart(lines: CartLine[], city: string, couponCodes: Record<number, string> = {}) {
  const ids = [...new Set(lines.map((l) => l.productId))];
  if (!ids.length) return { groups: [] as QuoteGroup[], errors: ["السلة فارغة"] };
  const prods = await db.select().from(products).where(and(inArray(products.id, ids), eq(products.status, "active")));
  const storeIds = [...new Set(prods.map((p) => p.storeId))];
  const storeRows = storeIds.length ? await db.select().from(stores).where(and(inArray(stores.id, storeIds), eq(stores.status, "active"))) : [];
  const errors: string[] = [];
  const groups: QuoteGroup[] = [];
  for (const st of storeRows) {
    const items = lines.map((l) => {
      const p = prods.find((x) => x.id === l.productId && x.storeId === st.id); if (!p) return null;
      const variant = l.variantKey ? p.variants.find((v) => v.key === l.variantKey) : undefined;
      const unit = variant?.price ? Number(variant.price) : num(p.price);
      const available = variant ? variant.stock : p.stock;
      if (l.qty > available) errors.push(`الكمية المتاحة من ${p.name} هي ${available}`);
      return { productId: p.id, name: p.name, image: p.images[0] ?? null, variantKey: l.variantKey ?? null, price: unit, qty: l.qty, total: unit * l.qty, weight: num(p.weightKg) * l.qty };
    }).filter(Boolean) as QuoteItem[];
    if (!items.length) continue;
    const subtotal = items.reduce((a, i) => a + i.total, 0);
    const weight = items.reduce((a, i) => a + i.weight, 0);
    let discount = 0; let couponId: number | null = null; let couponMsg = "";
    const code = couponCodes[st.id]?.toUpperCase();
    if (code) {
      const [c] = await db.select().from(coupons).where(and(eq(coupons.storeId, st.id), eq(coupons.code, code), eq(coupons.isActive, true)));
      const now = new Date();
      if (!c) couponMsg = "كوبون غير صالح";
      else if ((c.startsAt && c.startsAt > now) || (c.endsAt && c.endsAt < now)) couponMsg = "الكوبون منتهي";
      else if (c.maxUses && c.usedCount >= c.maxUses) couponMsg = "تم استنفاد الكوبون";
      else if (subtotal < num(c.minOrder)) couponMsg = `الحد الأدنى للطلب ${c.minOrder}`;
      else { discount = c.type === "percent" ? Math.round(subtotal * num(c.value)) / 100 : Math.min(subtotal, num(c.value)); couponId = c.id; couponMsg = "تم تطبيق الكوبون"; }
    }
    const shipping = await calcShipping(st.id, city, weight, subtotal - discount);
    const methods = await db.select().from(storePaymentMethods).where(and(eq(storePaymentMethods.storeId, st.id), eq(storePaymentMethods.isEnabled, true)));
    const accounts = await db.select({ id: storePaymentAccounts.id, providerId: storePaymentAccounts.providerId, accountName: storePaymentAccounts.accountName, last4: storePaymentAccounts.accountNumberLast4 }).from(storePaymentAccounts).where(and(eq(storePaymentAccounts.storeId, st.id), eq(storePaymentAccounts.isActive, true)));
    groups.push({ storeId: st.id, storeName: st.name, storeSlug: st.slug, currency: st.currency, items, subtotal, weight, discount, couponId, couponMsg, shipping, methods: methods.map((m) => ({ method: m.method, codFee: num(m.codFee), instructions: m.instructions })), hasAccounts: accounts.length > 0 });
  }
  return { groups, errors };
}
export type QuoteItem = { productId: number; name: string; image: string | null; variantKey: string | null; price: number; qty: number; total: number; weight: number };
export type QuoteGroup = { storeId: number; storeName: string; storeSlug: string; currency: string; items: QuoteItem[]; subtotal: number; weight: number; discount: number; couponId: number | null; couponMsg: string; shipping: { id: number; name: string; type: string; eta: string | null; cost: number }[]; methods: { method: string; codFee: number; instructions: string | null }[]; hasAccounts: boolean };

export type CheckoutInput = {
  lines: CartLine[]; customer: { name: string; phone: string; email?: string; city: string; district?: string; street?: string; notes?: string };
  perStore: Record<number, { shippingZoneId: number | null; paymentMethod: string; coupon?: string; campaignId?: number | null }>;
};

/** Places an order: one parent order, one sub-order per store (true multi-vendor split). Runs in a DB transaction. */
export async function placeOrder(input: CheckoutInput) {
  const session = await getSession();
  if (!input.customer.name || !input.customer.phone || !input.customer.city) return { error: "الاسم والهاتف والمدينة مطلوبة" };
  const couponCodes: Record<number, string> = {};
  for (const [sid, v] of Object.entries(input.perStore)) if (v.coupon) couponCodes[Number(sid)] = v.coupon;
  const { groups, errors } = await quoteCart(input.lines, input.customer.city, couponCodes);
  if (errors.length) return { error: errors.join("، ") };
  if (!groups.length) return { error: "السلة فارغة" };
  const [commissionCfg] = await db.select().from(platformSettings).where(eq(platformSettings.key, "commission"));
  const defaultCommission = (commissionCfg?.value ?? { type: "percent", value: 0 }) as { type: string; value: number };

  const result = await db.transaction(async (tx) => {
    let subtotal = 0, shippingTotal = 0, discountTotal = 0, total = 0;
    const prepared = groups.map((g) => {
      const cfg = input.perStore[g.storeId];
      if (!cfg?.paymentMethod || !g.methods.some((m) => m.method === cfg.paymentMethod)) throw new Error(`اختر طريقة دفع صالحة لمتجر ${g.storeName}`);
      const ship = g.shipping.find((z) => z.id === cfg.shippingZoneId);
      if (g.shipping.length && !ship) throw new Error(`اختر طريقة شحن لمتجر ${g.storeName}`);
      const codFee = cfg.paymentMethod === "cod" ? (g.methods.find((m) => m.method === "cod")?.codFee ?? 0) : 0;
      const gTotal = g.subtotal - g.discount + (ship?.cost ?? 0) + codFee;
      subtotal += g.subtotal; shippingTotal += ship?.cost ?? 0; discountTotal += g.discount; total += gTotal;
      return { g, cfg, ship, codFee, gTotal };
    });
    const [order] = await tx.insert(orders).values({
      orderNumber: genNumber("ORD"), customerId: session?.id ?? null, customerName: input.customer.name, customerPhone: input.customer.phone, customerEmail: input.customer.email || null,
      shippingAddress: { city: input.customer.city, district: input.customer.district, street: input.customer.street, notes: input.customer.notes },
      subtotal: String(subtotal), shippingTotal: String(shippingTotal), discountTotal: String(discountTotal), total: String(total), trackingToken: randomToken(40),
    }).returning();

    const created: { storeId: number; number: string; id: number }[] = [];
    for (const { g, cfg, ship, codFee, gTotal } of prepared) {
      const [st] = await tx.select().from(stores).where(eq(stores.id, g.storeId));
      const cType = st.commissionType ?? defaultCommission.type; const cVal = st.commissionType ? num(st.commissionValue) : Number(defaultCommission.value);
      const commission = computeCommission(g.subtotal - g.discount, cType, cVal);
      const [so] = await tx.insert(subOrders).values({
        orderId: order.id, storeId: g.storeId, number: genNumber(`S${g.storeId}`), subtotal: String(g.subtotal), shippingCost: String(ship?.cost ?? 0), discount: String(g.discount), codFee: String(codFee), total: String(gTotal),
        commissionAmount: String(commission), status: "pending", paymentMethod: cfg.paymentMethod, paymentStatus: cfg.paymentMethod === "cod" ? "cod_pending" : "unpaid", paymentReference: `PAY-${randomToken(8).toUpperCase()}`,
        shippingZoneId: ship?.id ?? null, couponId: g.couponId, campaignId: cfg.campaignId ?? null, customerNote: input.customer.notes,
      }).returning();
      await tx.insert(orderItems).values(g.items.map((i) => ({ subOrderId: so.id, storeId: g.storeId, productId: i.productId, name: i.name, variantKey: i.variantKey, imageUrl: i.image, price: String(i.price), quantity: i.qty, total: String(i.total) })));
      await tx.insert(orderStatusHistory).values({ subOrderId: so.id, status: "pending", note: "تم إنشاء الطلب" });
      await tx.insert(commissionRecords).values({ storeId: g.storeId, subOrderId: so.id, baseAmount: String(g.subtotal - g.discount), amount: String(commission), type: cType, rate: String(cVal) });
      // Stock deduction (with variant support)
      for (const i of g.items) {
        const [p] = await tx.select().from(products).where(eq(products.id, i.productId));
        if (i.variantKey && p.variants.length) {
          const variants = p.variants.map((v) => v.key === i.variantKey ? { ...v, stock: Math.max(0, v.stock - i.qty) } : v);
          await tx.update(products).set({ variants, stock: variants.reduce((a, v) => a + v.stock, 0), salesCount: sql`${products.salesCount} + ${i.qty}` }).where(eq(products.id, p.id));
        } else await tx.update(products).set({ stock: sql`greatest(0, ${products.stock} - ${i.qty})`, salesCount: sql`${products.salesCount} + ${i.qty}` }).where(eq(products.id, p.id));
      }
      if (g.couponId) await tx.update(coupons).set({ usedCount: sql`${coupons.usedCount} + 1` }).where(eq(coupons.id, g.couponId));
      if (cfg.campaignId) await tx.insert(campaignEvents).values({ campaignId: cfg.campaignId, storeId: g.storeId, type: "order", subOrderId: so.id, amount: String(gTotal) });
      // Store customer record (per-tenant CRM)
      const existing = await tx.select().from(storeCustomers).where(and(eq(storeCustomers.storeId, g.storeId), eq(storeCustomers.phone, input.customer.phone)));
      if (existing[0]) await tx.update(storeCustomers).set({ ordersCount: sql`${storeCustomers.ordersCount} + 1`, totalSpent: sql`${storeCustomers.totalSpent} + ${gTotal}`, name: input.customer.name, userId: session?.id ?? existing[0].userId }).where(eq(storeCustomers.id, existing[0].id));
      else await tx.insert(storeCustomers).values({ storeId: g.storeId, userId: session?.id ?? null, name: input.customer.name, phone: input.customer.phone, email: input.customer.email || null, ordersCount: 1, totalSpent: String(gTotal) });
      await tx.insert(notifications).values({ userId: st.ownerId, storeId: g.storeId, type: "new_order", title: `طلب جديد ${so.number}`, body: `${input.customer.name} - ${gTotal.toLocaleString()} ${st.currency}`, link: `/merchant/orders/${so.id}` });
      created.push({ storeId: g.storeId, number: so.number, id: so.id });
    }
    return { order, created };
  }).catch((e: Error) => ({ error: e.message }));

  if ("error" in result) return { error: result.error };
  await audit("order_placed", "order", result.order.id, { subOrders: result.created.length });
  return { ok: true, orderNumber: result.order.orderNumber, token: result.order.trackingToken };
}

/** Customer submits proof of transfer. This does NOT mark the order as paid; the merchant must verify the funds first. */
export async function submitPaymentProof(_: ActionState, fd: FormData): Promise<ActionState> {
  const subOrderId = Number(fd.get("subOrderId")); const token = s(fd, "token");
  const [so] = await db.select().from(subOrders).where(eq(subOrders.id, subOrderId));
  if (!so) return { error: "الطلب غير موجود" };
  const [parent] = await db.select().from(orders).where(eq(orders.id, so.orderId));
  const session = await getSession();
  if (!parent || (parent.trackingToken !== token && parent.customerId !== session?.id)) return { error: "غير مصرح" };
  if (so.paymentStatus === "paid") return { error: "تم تأكيد الدفع مسبقاً" };
  const accountId = Number(fd.get("accountId")) || null;
  if (accountId) {
    const [acc] = await db.select().from(storePaymentAccounts).where(and(eq(storePaymentAccounts.id, accountId), eq(storePaymentAccounts.storeId, so.storeId)));
    if (!acc) return { error: "حساب الاستلام غير صالح" };
  }
  await db.insert(paymentTransactions).values({ storeId: so.storeId, subOrderId: so.id, method: so.paymentMethod, accountId, amount: so.total, reference: so.paymentReference, senderName: s(fd, "senderName"), senderPhone: s(fd, "senderPhone"), transferRef: s(fd, "transferRef"), receiptUrl: s(fd, "receiptUrl") || null, status: "under_review" });
  await db.update(subOrders).set({ paymentStatus: "pending_verification", paymentAccountId: accountId, updatedAt: new Date() }).where(eq(subOrders.id, so.id));
  await db.insert(orderStatusHistory).values({ subOrderId: so.id, status: "payment_submitted", note: `تم إرسال إثبات تحويل (${s(fd, "transferRef")})` });
  const [st] = await db.select().from(stores).where(eq(stores.id, so.storeId));
  if (st) await db.insert(notifications).values({ userId: st.ownerId, storeId: st.id, type: "payment_proof", title: `إثبات دفع جديد للطلب ${so.number}`, body: "يرجى التحقق من وصول المبلغ إلى حسابك قبل الاعتماد", link: `/merchant/orders/${so.id}` });
  await audit("payment_proof_submitted", "sub_order", so.id, undefined, so.storeId);
  revalidatePath(`/order/${parent.orderNumber}`);
  return { success: "تم استلام إثبات التحويل. سيقوم التاجر بالتحقق من وصول المبلغ فعلياً قبل اعتماد الدفع." };
}

export async function trackCampaign(campaignId: number, type: "view" | "click") {
  const [c] = await db.select({ id: campaigns.id, storeId: campaigns.storeId }).from(campaigns).where(eq(campaigns.id, campaignId));
  if (!c) return;
  await db.insert(campaignEvents).values({ campaignId, storeId: c.storeId, type });
  await db.update(campaigns).set(type === "view" ? { views: sql`${campaigns.views} + 1` } : { clicks: sql`${campaigns.clicks} + 1` }).where(eq(campaigns.id, campaignId));
}

// ───── Customer account ─────
export async function saveAddress(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await getSession(); if (!u) redirect("/login");
  const id = Number(fd.get("id")) || 0;
  const data = { userId: u.id, label: s(fd, "label") || "المنزل", fullName: s(fd, "fullName"), phone: s(fd, "phone"), city: s(fd, "city"), district: s(fd, "district"), street: s(fd, "street"), notes: s(fd, "notes"), isDefault: fd.get("isDefault") === "on" };
  if (!data.fullName || !data.phone || !data.city) return { error: "الاسم والهاتف والمدينة مطلوبة" };
  if (data.isDefault) await db.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, u.id));
  if (id) await db.update(addresses).set(data).where(and(eq(addresses.id, id), eq(addresses.userId, u.id))); else await db.insert(addresses).values(data);
  revalidatePath("/account/addresses");
  return { success: "تم الحفظ" };
}
export async function deleteAddress(fd: FormData) {
  const u = await getSession(); if (!u) return;
  await db.delete(addresses).where(and(eq(addresses.id, Number(fd.get("id"))), eq(addresses.userId, u.id)));
  revalidatePath("/account/addresses");
}
export async function toggleWishlist(fd: FormData) {
  const u = await getSession();
  const productId = Number(fd.get("productId")); const back = s(fd, "back") || "/";
  if (!u) redirect(`/login?next=${encodeURIComponent(back)}`);
  const [ex] = await db.select().from(wishlists).where(and(eq(wishlists.userId, u.id), eq(wishlists.productId, productId)));
  if (ex) await db.delete(wishlists).where(eq(wishlists.id, ex.id)); else await db.insert(wishlists).values({ userId: u.id, productId });
  revalidatePath(back); revalidatePath("/account/wishlist");
}
export async function addReview(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await getSession(); if (!u) return { error: "سجّل الدخول لإضافة تقييم" };
  const productId = Number(fd.get("productId")); const rating = Math.min(5, Math.max(1, Number(fd.get("rating")) || 5));
  const [p] = await db.select().from(products).where(eq(products.id, productId)); if (!p) return { error: "المنتج غير موجود" };
  await db.insert(reviews).values({ storeId: p.storeId, productId, userId: u.id, rating, comment: s(fd, "comment") });
  const [agg] = await db.select({ avg: sql<string>`avg(${reviews.rating})`, c: sql<number>`count(*)` }).from(reviews).where(eq(reviews.productId, productId));
  await db.update(products).set({ ratingAvg: String(Number(agg.avg).toFixed(2)), ratingCount: Number(agg.c) }).where(eq(products.id, productId));
  revalidatePath(s(fd, "back") || "/");
  return { success: "شكراً لتقييمك" };
}
export async function updateProfile(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await getSession(); if (!u) redirect("/login");
  await db.update(users).set({ name: s(fd, "name") || u.name, phone: s(fd, "phone") }).where(eq(users.id, u.id));
  revalidatePath("/account");
  return { success: "تم التحديث" };
}
