"use server";
import { db } from "@/db";
import {
  products, categories, subOrders, orderStatusHistory, paymentTransactions, storePaymentAccounts, storePaymentMethods, shippingZones, coupons,
  stores, storePages, templates, domains, campaigns, storeStaff, users, plans, notifications, commissionRecords, orders, storeCustomers, platformSettings, paymentProviders,
  type PageBlock, type ThemeSettings,
} from "@/db/schema";
import { and, eq, sql, count } from "drizzle-orm";
import { requireMerchantStore, assertStoreAccess, audit, encrypt, hashPassword } from "@/lib/auth";
import { slugify, randomToken } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import type { ActionState } from "./auth";
import dns from "dns/promises";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const n = (fd: FormData, k: string) => Number(fd.get(k) ?? 0) || 0;
const b = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true" || fd.get(k) === "1";

/** Every merchant action starts here: resolves tenant & enforces access. */
async function ctx() {
  const { user, store } = await requireMerchantStore();
  await assertStoreAccess(user.id, store.id);
  return { user, store };
}

async function storePlan(storeId: number) {
  const [row] = await db.select({ p: plans }).from(stores).leftJoin(plans, eq(stores.planId, plans.id)).where(eq(stores.id, storeId));
  return row?.p ?? null;
}

// ───── Categories ─────
export async function saveCategory(_: ActionState, fd: FormData): Promise<ActionState> {
  const { store } = await ctx();
  const id = n(fd, "id"); const name = s(fd, "name"); if (!name) return { error: "الاسم مطلوب" };
  const data = { storeId: store.id, name, slug: s(fd, "slug") ? slugify(s(fd, "slug")) : slugify(name), imageUrl: s(fd, "imageUrl") || null, parentId: n(fd, "parentId") || null, sortOrder: n(fd, "sortOrder"), isActive: b(fd, "isActive") };
  if (id) await db.update(categories).set(data).where(and(eq(categories.id, id), eq(categories.storeId, store.id)));
  else await db.insert(categories).values(data);
  revalidatePath("/merchant/categories");
  return { success: "تم الحفظ" };
}
export async function deleteCategory(fd: FormData) {
  const { store } = await ctx();
  const id = n(fd, "id");
  await db.update(products).set({ categoryId: null }).where(and(eq(products.categoryId, id), eq(products.storeId, store.id)));
  await db.delete(categories).where(and(eq(categories.id, id), eq(categories.storeId, store.id)));
  revalidatePath("/merchant/categories");
}

// ───── Products ─────
export async function saveProduct(_: ActionState, fd: FormData): Promise<ActionState> {
  const { store } = await ctx();
  const id = n(fd, "id"); const name = s(fd, "name"); const price = n(fd, "price");
  if (!name || price <= 0) return { error: "الاسم والسعر مطلوبان" };
  if (!id) {
    const plan = await storePlan(store.id);
    const [{ c }] = await db.select({ c: count() }).from(products).where(eq(products.storeId, store.id));
    if (plan && c >= plan.maxProducts) return { error: `وصلت للحد الأقصى للمنتجات في باقتك (${plan.maxProducts}). قم بترقية الباقة.` };
  }
  let options: { name: string; values: string[] }[] = [];
  let variants: { key: string; price?: number; stock: number; sku?: string }[] = [];
  try { options = JSON.parse(s(fd, "options") || "[]"); variants = JSON.parse(s(fd, "variants") || "[]"); } catch { return { error: "صيغة الخيارات غير صحيحة" }; }
  const images = s(fd, "images").split("\n").map((x) => x.trim()).filter(Boolean);
  const stock = variants.length ? variants.reduce((a, v) => a + (Number(v.stock) || 0), 0) : n(fd, "stock");
  const data = {
    storeId: store.id, categoryId: n(fd, "categoryId") || null, name, slug: s(fd, "slug") ? slugify(s(fd, "slug")) : slugify(name), description: s(fd, "description"),
    price: String(price), compareAtPrice: n(fd, "compareAtPrice") ? String(n(fd, "compareAtPrice")) : null, costPrice: n(fd, "costPrice") ? String(n(fd, "costPrice")) : null,
    sku: s(fd, "sku") || null, stock, lowStockAlert: n(fd, "lowStockAlert") || 5, weightKg: String(Number(fd.get("weightKg")) || 0), images, options, variants,
    status: s(fd, "status") || "active", isFeatured: b(fd, "isFeatured"),
  };
  try {
    if (id) await db.update(products).set(data).where(and(eq(products.id, id), eq(products.storeId, store.id)));
    else await db.insert(products).values(data);
  } catch (e) { return { error: "تعذر الحفظ — ربما الرابط (slug) مكرر: " + (e as Error).message.slice(0, 80) }; }
  await audit(id ? "product_update" : "product_create", "product", id || null, { name }, store.id);
  revalidatePath("/merchant/products"); revalidatePath(`/s/${store.slug}`, "layout");
  return { success: "تم حفظ المنتج" };
}
export async function deleteProduct(fd: FormData) {
  const { store } = await ctx();
  await db.update(products).set({ status: "archived" }).where(and(eq(products.id, n(fd, "id")), eq(products.storeId, store.id)));
  await audit("product_archive", "product", n(fd, "id"), undefined, store.id);
  revalidatePath("/merchant/products");
}
export async function adjustStock(fd: FormData) {
  const { store } = await ctx();
  const id = n(fd, "id"); const delta = Number(fd.get("delta")) || 0;
  await db.update(products).set({ stock: sql`greatest(0, ${products.stock} + ${delta})` }).where(and(eq(products.id, id), eq(products.storeId, store.id)));
  await audit("stock_adjust", "product", id, { delta }, store.id);
  revalidatePath("/merchant/inventory");
}

// ───── Orders ─────
export async function updateOrderStatus(fd: FormData) {
  const { store, user } = await ctx();
  const id = n(fd, "id"); const status = s(fd, "status"); const note = s(fd, "note");
  const [so] = await db.select().from(subOrders).where(and(eq(subOrders.id, id), eq(subOrders.storeId, store.id)));
  if (!so) throw new Error("FORBIDDEN");
  await db.update(subOrders).set({ status, updatedAt: new Date(), merchantNote: note || so.merchantNote }).where(eq(subOrders.id, id));
  await db.insert(orderStatusHistory).values({ subOrderId: id, status, note, byUserId: user.id });
  if (status === "delivered") {
    await db.update(commissionRecords).set({ status: "due" }).where(and(eq(commissionRecords.subOrderId, id), eq(commissionRecords.status, "pending")));
    if (so.paymentMethod === "cod") await db.update(subOrders).set({ paymentStatus: "paid" }).where(eq(subOrders.id, id));
  }
  if (status === "cancelled") {
    await db.update(commissionRecords).set({ status: "waived" }).where(eq(commissionRecords.subOrderId, id));
    // restock
    const items = await db.execute(sql`select product_id, quantity from order_items where sub_order_id=${id}`);
    for (const it of items.rows as { product_id: number; quantity: number }[]) await db.update(products).set({ stock: sql`${products.stock} + ${it.quantity}` }).where(eq(products.id, it.product_id));
  }
  const [parent] = await db.select().from(orders).where(eq(orders.id, so.orderId));
  if (parent?.customerId) await db.insert(notifications).values({ userId: parent.customerId, storeId: store.id, type: "order_status", title: `تحديث طلبك ${so.number}`, body: `الحالة الجديدة: ${status}`, link: `/account/orders` });
  await audit("order_status", "sub_order", id, { status }, store.id);
  revalidatePath("/merchant/orders");
}

export async function reviewPayment(fd: FormData) {
  const { store, user } = await ctx();
  const id = n(fd, "id"); const decision = s(fd, "decision"); const note = s(fd, "note");
  const [tx] = await db.select().from(paymentTransactions).where(and(eq(paymentTransactions.id, id), eq(paymentTransactions.storeId, store.id)));
  if (!tx) throw new Error("FORBIDDEN");
  const verified = decision === "verified";
  await db.update(paymentTransactions).set({ status: verified ? "verified" : "rejected", reviewNote: note || (verified ? "تم التحقق من وصول المبلغ إلى الحساب" : "لم يتم العثور على التحويل"), verifiedBy: user.id, verifiedAt: new Date() }).where(eq(paymentTransactions.id, id));
  await db.update(subOrders).set({ paymentStatus: verified ? "paid" : "rejected", status: verified ? "confirmed" : undefined, updatedAt: new Date() }).where(eq(subOrders.id, tx.subOrderId));
  await db.insert(orderStatusHistory).values({ subOrderId: tx.subOrderId, status: verified ? "payment_verified" : "payment_rejected", note, byUserId: user.id });
  const [so] = await db.select().from(subOrders).where(eq(subOrders.id, tx.subOrderId));
  const [parent] = so ? await db.select().from(orders).where(eq(orders.id, so.orderId)) : [];
  if (parent?.customerId) await db.insert(notifications).values({ userId: parent.customerId, storeId: store.id, type: "payment", title: verified ? "تم تأكيد الدفع" : "تعذر التحقق من الدفع", body: `الطلب ${so?.number}: ${note || ""}`, link: "/account/orders" });
  await audit("payment_review", "payment_transaction", id, { decision }, store.id);
  revalidatePath("/merchant/orders"); revalidatePath("/merchant/payments");
}

// ───── Customers ─────
export async function saveCustomerNote(fd: FormData) {
  const { store } = await ctx();
  await db.update(storeCustomers).set({ notes: s(fd, "notes") }).where(and(eq(storeCustomers.id, n(fd, "id")), eq(storeCustomers.storeId, store.id)));
  revalidatePath("/merchant/customers");
}

// ───── Payments: methods & accounts ─────
export async function savePaymentMethods(_: ActionState, fd: FormData): Promise<ActionState> {
  const { store } = await ctx();
  for (const m of ["bank_transfer", "wallet_transfer", "cod", "gateway"]) {
    const data = { storeId: store.id, method: m, isEnabled: b(fd, `${m}_enabled`), instructions: s(fd, `${m}_instructions`), codFee: String(m === "cod" ? n(fd, "cod_fee") : 0) };
    if (m === "gateway" && data.isEnabled) {
      const [gw] = await db.select().from(paymentProviders).where(and(eq(paymentProviders.type, "gateway"), eq(paymentProviders.apiConfigured, true), eq(paymentProviders.isActive, true)));
      if (!gw) return { error: "لا توجد بوابة دفع مرخصة ومهيأة بمفاتيح API على المنصة بعد. لا يمكن تفعيل هذه الطريقة." };
    }
    await db.insert(storePaymentMethods).values(data).onConflictDoUpdate({ target: [storePaymentMethods.storeId, storePaymentMethods.method], set: data });
  }
  await audit("payment_methods_update", "store", store.id, undefined, store.id);
  revalidatePath("/merchant/payments");
  return { success: "تم حفظ طرق الدفع" };
}

export async function savePaymentAccount(_: ActionState, fd: FormData): Promise<ActionState> {
  const { store } = await ctx();
  const accountNumber = s(fd, "accountNumber"); const providerId = n(fd, "providerId");
  if (!providerId || !accountNumber || !s(fd, "accountName")) return { error: "الجهة ورقم الحساب واسم صاحب الحساب مطلوبة" };
  const id = n(fd, "id");
  const data = {
    storeId: store.id, providerId, accountName: s(fd, "accountName"), accountNumberEnc: encrypt(accountNumber), accountNumberLast4: accountNumber.slice(-4),
    ibanEnc: s(fd, "iban") ? encrypt(s(fd, "iban")) : null, phone: s(fd, "phone") || null, branch: s(fd, "branch") || null, proofUrl: s(fd, "proofUrl") || null,
    instructions: s(fd, "instructions") || null, isActive: b(fd, "isActive"), verificationStatus: "pending",
  };
  if (id) await db.update(storePaymentAccounts).set(data).where(and(eq(storePaymentAccounts.id, id), eq(storePaymentAccounts.storeId, store.id)));
  else await db.insert(storePaymentAccounts).values(data);
  await audit(id ? "payment_account_update" : "payment_account_create", "payment_account", id || null, { providerId, last4: data.accountNumberLast4 }, store.id);
  revalidatePath("/merchant/accounts");
  return { success: "تم حفظ الحساب (بانتظار تحقق المنصة من الملكية)" };
}
export async function deletePaymentAccount(fd: FormData) {
  const { store } = await ctx();
  await db.update(storePaymentAccounts).set({ isActive: false }).where(and(eq(storePaymentAccounts.id, n(fd, "id")), eq(storePaymentAccounts.storeId, store.id)));
  revalidatePath("/merchant/accounts");
}

// ───── Shipping ─────
export async function saveShippingZone(_: ActionState, fd: FormData): Promise<ActionState> {
  const { store } = await ctx();
  const id = n(fd, "id"); if (!s(fd, "name")) return { error: "اسم المنطقة مطلوب" };
  const data = { storeId: store.id, name: s(fd, "name"), cities: fd.getAll("cities").map(String).filter(Boolean), type: s(fd, "type") || "flat", baseCost: String(n(fd, "baseCost")), perKgCost: String(n(fd, "perKgCost")), freeAbove: n(fd, "freeAbove") ? String(n(fd, "freeAbove")) : null, etaDays: s(fd, "etaDays") || null, isActive: b(fd, "isActive") };
  if (id) await db.update(shippingZones).set(data).where(and(eq(shippingZones.id, id), eq(shippingZones.storeId, store.id))); else await db.insert(shippingZones).values(data);
  revalidatePath("/merchant/shipping");
  return { success: "تم الحفظ" };
}
export async function deleteShippingZone(fd: FormData) {
  const { store } = await ctx();
  await db.delete(shippingZones).where(and(eq(shippingZones.id, n(fd, "id")), eq(shippingZones.storeId, store.id)));
  revalidatePath("/merchant/shipping");
}

// ───── Coupons ─────
export async function saveCoupon(_: ActionState, fd: FormData): Promise<ActionState> {
  const { store } = await ctx();
  const plan = await storePlan(store.id);
  if (plan && !plan.marketingTools) return { error: "أدوات التسويق غير متاحة في باقتك" };
  const id = n(fd, "id"); const code = s(fd, "code").toUpperCase(); if (!code) return { error: "الكود مطلوب" };
  const data = { storeId: store.id, code, type: s(fd, "type") || "percent", value: String(n(fd, "value")), minOrder: String(n(fd, "minOrder")), maxUses: n(fd, "maxUses") || null, startsAt: s(fd, "startsAt") ? new Date(s(fd, "startsAt")) : null, endsAt: s(fd, "endsAt") ? new Date(s(fd, "endsAt")) : null, isActive: b(fd, "isActive") };
  try { if (id) await db.update(coupons).set(data).where(and(eq(coupons.id, id), eq(coupons.storeId, store.id))); else await db.insert(coupons).values(data); } catch { return { error: "الكود مستخدم مسبقاً" }; }
  revalidatePath("/merchant/coupons");
  return { success: "تم الحفظ" };
}
export async function deleteCoupon(fd: FormData) {
  const { store } = await ctx();
  await db.delete(coupons).where(and(eq(coupons.id, n(fd, "id")), eq(coupons.storeId, store.id)));
  revalidatePath("/merchant/coupons");
}

// ───── Design / Theme / Templates ─────
export async function saveTheme(_: ActionState, fd: FormData): Promise<ActionState> {
  const { store } = await ctx();
  const theme: ThemeSettings = {
    primaryColor: s(fd, "primaryColor"), secondaryColor: s(fd, "secondaryColor"), backgroundColor: s(fd, "backgroundColor"), textColor: s(fd, "textColor"),
    fontFamily: s(fd, "fontFamily") || "Tajawal", backgroundImage: s(fd, "backgroundImage"), radius: s(fd, "radius") || "16px", headerStyle: s(fd, "headerStyle") || "classic",
  };
  await db.update(stores).set({
    theme, logoUrl: s(fd, "logoUrl") || null, coverUrl: s(fd, "coverUrl") || null, name: s(fd, "name") || store.name, description: s(fd, "description"),
    seoTitle: s(fd, "seoTitle") || null, seoDescription: s(fd, "seoDescription") || null, phone: s(fd, "phone") || store.phone, city: s(fd, "city") || store.city, address: s(fd, "address"), currency: s(fd, "currency") || "YER",
  }).where(eq(stores.id, store.id));
  await audit("theme_update", "store", store.id, undefined, store.id);
  revalidatePath("/merchant/design"); revalidatePath(`/s/${store.slug}`, "layout");
  return { success: "تم حفظ التصميم ونشره" };
}
export async function applyTemplate(fd: FormData) {
  const { store } = await ctx();
  const [tpl] = await db.select().from(templates).where(and(eq(templates.id, n(fd, "id")), eq(templates.isActive, true)));
  if (!tpl) return;
  const plan = await storePlan(store.id);
  if (tpl.isPremium && plan && !plan.premiumTemplates) { revalidatePath("/merchant/templates"); return; }
  await db.update(stores).set({ templateId: tpl.id, theme: tpl.defaultTheme }).where(eq(stores.id, store.id));
  if (b(fd, "resetBlocks")) await db.update(storePages).set({ draftBlocks: tpl.defaultBlocks, blocks: tpl.defaultBlocks, updatedAt: new Date() }).where(and(eq(storePages.storeId, store.id), eq(storePages.isHome, true)));
  await audit("template_apply", "store", store.id, { templateId: tpl.id }, store.id);
  revalidatePath("/merchant", "layout"); revalidatePath(`/s/${store.slug}`, "layout");
}

// ───── Page builder ─────
export async function savePageBlocks(pageId: number, blocks: PageBlock[], publish: boolean) {
  const { store } = await ctx();
  const [page] = await db.select().from(storePages).where(and(eq(storePages.id, pageId), eq(storePages.storeId, store.id)));
  if (!page) return { error: "الصفحة غير موجودة" };
  await db.update(storePages).set({ draftBlocks: blocks, ...(publish ? { blocks, isPublished: true } : {}), updatedAt: new Date() }).where(eq(storePages.id, pageId));
  await audit(publish ? "page_publish" : "page_draft", "store_page", pageId, { blocks: blocks.length }, store.id);
  revalidatePath(`/s/${store.slug}`, "layout");
  return { success: publish ? "تم النشر" : "تم حفظ المسودة" };
}
export async function createPage(_: ActionState, fd: FormData): Promise<ActionState> {
  const { store } = await ctx();
  const title = s(fd, "title"); if (!title) return { error: "العنوان مطلوب" };
  try { await db.insert(storePages).values({ storeId: store.id, title, slug: slugify(s(fd, "slug") || title), blocks: [], draftBlocks: [] }); } catch { return { error: "الرابط مكرر" }; }
  revalidatePath("/merchant/builder");
  return { success: "تم إنشاء الصفحة" };
}
export async function deletePage(fd: FormData) {
  const { store } = await ctx();
  await db.delete(storePages).where(and(eq(storePages.id, n(fd, "id")), eq(storePages.storeId, store.id), eq(storePages.isHome, false)));
  revalidatePath("/merchant/builder");
}

// ───── Domains ─────
export async function addDomain(_: ActionState, fd: FormData): Promise<ActionState> {
  const { store } = await ctx();
  const hostname = s(fd, "hostname").toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(hostname)) return { error: "اسم الدومين غير صالح" };
  const plan = await storePlan(store.id);
  const [{ c }] = await db.select({ c: count() }).from(domains).where(and(eq(domains.storeId, store.id), eq(domains.type, "custom")));
  if (plan && c >= plan.maxDomains) return { error: `باقتك تسمح بـ ${plan.maxDomains} دومين مستقل. قم بالترقية.` };
  try { await db.insert(domains).values({ storeId: store.id, hostname, type: "custom", status: "pending", verificationToken: `ms-verify-${randomToken(24)}` }); } catch { return { error: "هذا الدومين مسجل مسبقاً" }; }
  await audit("domain_add", "domain", null, { hostname }, store.id);
  revalidatePath("/merchant/domain");
  return { success: "تمت إضافة الدومين. اتبع تعليمات DNS ثم اضغط تحقق" };
}
export async function verifyDomain(fd: FormData) {
  const { store } = await ctx();
  const id = n(fd, "id");
  const [d] = await db.select().from(domains).where(and(eq(domains.id, id), eq(domains.storeId, store.id)));
  if (!d) return;
  const [cfg] = await db.select().from(platformSettings).where(eq(platformSettings.key, "domains"));
  const settings = (cfg?.value ?? {}) as { cnameTarget?: string; aRecord?: string; verificationPrefix?: string };
  const prefix = settings.verificationPrefix || "_ms-verify";
  let txtOk = false, pointOk = false, err = "";
  try {
    const txt = await dns.resolveTxt(`${prefix}.${d.hostname}`);
    txtOk = txt.flat().some((v) => v.includes(d.verificationToken));
  } catch (e) { err += `TXT: ${(e as Error).message}; `; }
  try {
    const cn = await dns.resolveCname(d.hostname).catch(() => [] as string[]);
    if (settings.cnameTarget && cn.some((c) => c.replace(/\.$/, "") === settings.cnameTarget)) pointOk = true;
    if (!pointOk && settings.aRecord) { const a = await dns.resolve4(d.hostname).catch(() => [] as string[]); if (a.includes(settings.aRecord)) pointOk = true; }
    if (!pointOk) err += "لم يتم العثور على CNAME/A يشير للمنصة; ";
  } catch (e) { err += `DNS: ${(e as Error).message}`; }
  const status = txtOk && pointOk ? "active" : txtOk ? "verified" : "failed";
  await db.update(domains).set({ status, lastCheckedAt: new Date(), lastError: status === "active" ? null : err.trim(), verifiedAt: txtOk ? new Date() : d.verifiedAt, sslStatus: status === "active" ? "pending" : d.sslStatus }).where(eq(domains.id, id));
  await audit("domain_verify", "domain", id, { status, txtOk, pointOk }, store.id);
  revalidatePath("/merchant/domain"); revalidatePath("/admin/domains");
}
export async function deleteDomain(fd: FormData) {
  const { store } = await ctx();
  await db.delete(domains).where(and(eq(domains.id, n(fd, "id")), eq(domains.storeId, store.id), eq(domains.type, "custom")));
  revalidatePath("/merchant/domain");
}

// ───── Campaigns ─────
export async function saveCampaign(_: ActionState, fd: FormData): Promise<ActionState> {
  const { store } = await ctx();
  const plan = await storePlan(store.id);
  if (plan && !plan.marketingTools) return { error: "أدوات التسويق والإعلانات غير متاحة في باقتك الحالية" };
  const id = n(fd, "id"); if (!s(fd, "name")) return { error: "اسم الحملة مطلوب" };
  const data = {
    storeId: store.id, name: s(fd, "name"), type: s(fd, "type") || "banner", imageUrl: s(fd, "imageUrl") || null, videoUrl: s(fd, "videoUrl") || null, title: s(fd, "title") || null, subtitle: s(fd, "subtitle") || null,
    placement: s(fd, "placement") || "home_top", linkType: s(fd, "linkType") || "none", linkId: n(fd, "linkId") || null, linkUrl: s(fd, "linkUrl") || null, couponId: n(fd, "couponId") || null,
    startsAt: s(fd, "startsAt") ? new Date(s(fd, "startsAt")) : null, endsAt: s(fd, "endsAt") ? new Date(s(fd, "endsAt")) : null, isActive: b(fd, "isActive"),
  };
  if (id) await db.update(campaigns).set(data).where(and(eq(campaigns.id, id), eq(campaigns.storeId, store.id))); else await db.insert(campaigns).values(data);
  revalidatePath("/merchant/campaigns"); revalidatePath(`/s/${store.slug}`, "layout");
  return { success: "تم حفظ الحملة" };
}
export async function deleteCampaign(fd: FormData) {
  const { store } = await ctx();
  await db.delete(campaigns).where(and(eq(campaigns.id, n(fd, "id")), eq(campaigns.storeId, store.id)));
  revalidatePath("/merchant/campaigns");
}

// ───── Staff ─────
export async function addStaff(_: ActionState, fd: FormData): Promise<ActionState> {
  const { store, user } = await ctx();
  if (store.ownerId !== user.id && user.role !== "super_admin") return { error: "فقط مالك المتجر يمكنه إضافة موظفين" };
  const plan = await storePlan(store.id);
  const [{ c }] = await db.select({ c: count() }).from(storeStaff).where(eq(storeStaff.storeId, store.id));
  if (plan && c >= plan.maxStaff) return { error: `باقتك تسمح بـ ${plan.maxStaff} موظف` };
  const email = s(fd, "email").toLowerCase();
  let [u] = await db.select().from(users).where(eq(users.email, email));
  if (!u) [u] = await db.insert(users).values({ name: s(fd, "name") || email, email, passwordHash: await hashPassword(s(fd, "password") || randomToken(10)), role: "staff" }).returning();
  try { await db.insert(storeStaff).values({ storeId: store.id, userId: u.id, role: s(fd, "role") || "manager" }); } catch { return { error: "الموظف مضاف مسبقاً" }; }
  await audit("staff_add", "store_staff", u.id, { email }, store.id);
  revalidatePath("/merchant/staff");
  return { success: "تمت إضافة الموظف" };
}
export async function removeStaff(fd: FormData) {
  const { store } = await ctx();
  await db.delete(storeStaff).where(and(eq(storeStaff.id, n(fd, "id")), eq(storeStaff.storeId, store.id)));
  revalidatePath("/merchant/staff");
}
