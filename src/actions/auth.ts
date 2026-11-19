"use server";
import { db } from "@/db";
import { users, stores, storePages, templates, plans, domains, subscriptions, storePaymentMethods, notifications, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createSession, destroySession, hashPassword, verifyPassword, audit, getSession, setActiveStore } from "@/lib/auth";
import { slugify, randomToken } from "@/lib/utils";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

export type ActionState = { error?: string; success?: string } | undefined;

function str(fd: FormData, k: string) { return String(fd.get(k) ?? "").trim(); }

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  const [u] = await db.select().from(users).where(eq(users.email, email));
  if (!u || !(await verifyPassword(password, u.passwordHash))) {
    await db.insert(auditLogs).values({ action: "login_failed", entity: "user", meta: { email } });
    return { error: "بيانات الدخول غير صحيحة" };
  }
  if (!u.isActive) return { error: "الحساب معطل. تواصل مع إدارة المنصة" };
  await createSession({ id: u.id, name: u.name, email: u.email, role: u.role, locale: u.locale });
  await audit("login", "user", u.id);
  const next = str(fd, "next");
  if (next && next.startsWith("/")) redirect(next);
  redirect(u.role === "super_admin" ? "/admin" : u.role === "customer" ? "/account" : "/merchant");
}

export async function registerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const name = str(fd, "name"); const email = str(fd, "email").toLowerCase(); const phone = str(fd, "phone");
  const password = str(fd, "password"); const type = str(fd, "type") === "merchant" ? "merchant" : "customer";
  if (!name || !email || password.length < 8) return { error: "يرجى تعبئة البيانات؛ كلمة المرور 8 أحرف على الأقل" };
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (exists) return { error: "البريد الإلكتروني مسجل مسبقاً" };
  const [u] = await db.insert(users).values({ name, email, phone, passwordHash: await hashPassword(password), role: type }).returning();
  await createSession({ id: u.id, name: u.name, email: u.email, role: u.role, locale: u.locale });
  await audit("register", "user", u.id, { type });
  if (type === "merchant") {
    const storeName = str(fd, "storeName");
    if (storeName) { await createStoreForUser(u.id, storeName, str(fd, "storeSlug") || storeName, str(fd, "city")); redirect("/merchant"); }
    redirect("/merchant/onboarding");
  }
  redirect(str(fd, "next") || "/account");
}

export async function createStoreForUser(ownerId: number, name: string, slugRaw: string, city?: string, templateId?: number, planId?: number) {
  let slug = slugify(slugRaw).replace(/[^a-z0-9-]/g, "") || `store-${randomToken(6)}`;
  const [taken] = await db.select({ id: stores.id }).from(stores).where(eq(stores.slug, slug));
  if (taken) slug = `${slug}-${randomToken(4)}`;
  const [tpl] = templateId ? await db.select().from(templates).where(eq(templates.id, templateId)) : await db.select().from(templates).where(eq(templates.slug, "general-modern"));
  const [freePlan] = planId ? await db.select().from(plans).where(eq(plans.id, planId)) : await db.select().from(plans).where(eq(plans.slug, "free"));
  const [store] = await db.insert(stores).values({ ownerId, name, slug, city, templateId: tpl?.id, theme: tpl?.defaultTheme, planId: freePlan?.id, status: "active" }).returning();
  await db.insert(storePages).values({ storeId: store.id, title: "الرئيسية", slug: "home", isHome: true, blocks: tpl?.defaultBlocks ?? [], draftBlocks: tpl?.defaultBlocks ?? [], isPublished: true });
  await db.insert(domains).values({ storeId: store.id, hostname: `${slug}.mscommerce.com`, type: "subdomain", status: "active", sslStatus: "issued", verificationToken: randomToken(24), isPrimary: true, verifiedAt: new Date() });
  if (freePlan) await db.insert(subscriptions).values({ storeId: store.id, planId: freePlan.id, amount: freePlan.priceMonthly });
  await db.insert(storePaymentMethods).values([
    { storeId: store.id, method: "cod", isEnabled: true }, { storeId: store.id, method: "bank_transfer", isEnabled: false },
    { storeId: store.id, method: "wallet_transfer", isEnabled: false }, { storeId: store.id, method: "gateway", isEnabled: false },
  ]);
  await db.insert(notifications).values({ userId: ownerId, storeId: store.id, type: "store_created", title: "تم إنشاء متجرك", body: `متجر ${name} جاهز. أضف منتجاتك وحساباتك البنكية لبدء البيع.`, link: "/merchant" });
  await audit("store_created", "store", store.id, { name, slug }, store.id);
  return store;
}

export async function onboardingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await getSession();
  if (!s) redirect("/login");
  const name = str(fd, "storeName"); if (!name) return { error: "اسم المتجر مطلوب" };
  const tplId = Number(fd.get("templateId")) || undefined;
  const store = await createStoreForUser(s.id, name, str(fd, "storeSlug") || name, str(fd, "city"), tplId);
  if (s.role === "customer") await db.update(users).set({ role: "merchant" }).where(eq(users.id, s.id));
  await setActiveStore(store.id);
  redirect("/merchant");
}

export async function logoutAction() {
  await audit("logout", "user", null);
  await destroySession();
  redirect("/login");
}

export async function switchLocaleAction(fd: FormData) {
  const c = await cookies();
  const locale = String(fd.get("locale")) === "en" ? "en" : "ar";
  c.set("ms_locale", locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  const s = await getSession();
  if (s) await db.update(users).set({ locale }).where(eq(users.id, s.id));
  revalidatePath("/", "layout");
}

export async function switchStoreAction(fd: FormData) {
  const s = await getSession(); if (!s) return;
  const id = Number(fd.get("storeId"));
  const { assertStoreAccess } = await import("@/lib/auth");
  await assertStoreAccess(s.id, id);
  await setActiveStore(id);
  revalidatePath("/merchant", "layout");
  redirect("/merchant");
}

export async function markNotificationsRead() {
  const s = await getSession(); if (!s) return;
  await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, s.id));
  revalidatePath("/", "layout");
}
