"use server";
import { db } from "@/db";
import { users, stores, plans, templates, domains, paymentProviders, platformSettings, campaigns, commissionRecords, subscriptions, storePaymentAccounts, notifications, backups } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireSuperAdmin, hashPassword, audit } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { createStoreForUser } from "./auth";
import type { ActionState } from "./auth";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const execAsync = promisify(exec);
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const n = (fd: FormData, k: string) => Number(fd.get(k) ?? 0) || 0;
const b = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true" || fd.get(k) === "1";

// ───── Stores ─────
export async function adminCreateStore(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const ownerEmail = s(fd, "ownerEmail").toLowerCase();
  let [owner] = await db.select().from(users).where(eq(users.email, ownerEmail));
  if (!owner) {
    const pwd = s(fd, "ownerPassword") || "Merchant@123";
    [owner] = await db.insert(users).values({ name: s(fd, "ownerName") || ownerEmail, email: ownerEmail, phone: s(fd, "ownerPhone"), passwordHash: await hashPassword(pwd), role: "merchant" }).returning();
  } else if (owner.role === "customer") {
    await db.update(users).set({ role: "merchant" }).where(eq(users.id, owner.id));
  }
  const store = await createStoreForUser(owner.id, s(fd, "name"), s(fd, "slug") || s(fd, "name"), s(fd, "city"), n(fd, "templateId") || undefined, n(fd, "planId") || undefined);
  revalidatePath("/admin/stores");
  return { success: `تم إنشاء المتجر #${store.id}` };
}

export async function adminUpdateStore(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const id = n(fd, "id");
  const commissionType = s(fd, "commissionType");
  await db.update(stores).set({
    name: s(fd, "name"), status: s(fd, "status") || "active", planId: n(fd, "planId") || null, city: s(fd, "city"), phone: s(fd, "phone"),
    commissionType: commissionType === "default" ? null : commissionType, commissionValue: commissionType === "default" ? null : String(n(fd, "commissionValue")),
  }).where(eq(stores.id, id));
  if (n(fd, "planId")) {
    const [p] = await db.select().from(plans).where(eq(plans.id, n(fd, "planId")));
    await db.update(subscriptions).set({ status: "cancelled" }).where(eq(subscriptions.storeId, id));
    if (p) await db.insert(subscriptions).values({ storeId: id, planId: p.id, amount: p.priceMonthly, endsAt: new Date(Date.now() + 30 * 864e5) });
  }
  await audit("admin_update_store", "store", id, { status: s(fd, "status") }, id);
  revalidatePath("/admin/stores");
  return { success: "تم حفظ التغييرات" };
}

export async function adminToggleStore(fd: FormData) {
  await requireSuperAdmin();
  const id = n(fd, "id"); const status = s(fd, "status");
  await db.update(stores).set({ status }).where(eq(stores.id, id));
  const [st] = await db.select().from(stores).where(eq(stores.id, id));
  if (st) await db.insert(notifications).values({ userId: st.ownerId, storeId: id, type: "store_status", title: status === "suspended" ? "تم تعطيل متجرك" : "تم تفعيل متجرك", body: `حالة متجر ${st.name} الآن: ${status}` });
  await audit("admin_toggle_store", "store", id, { status }, id);
  revalidatePath("/admin/stores");
}

export async function adminDeleteStore(fd: FormData) {
  await requireSuperAdmin();
  const id = n(fd, "id");
  // Soft-delete by archiving: keep financial records intact.
  await db.update(stores).set({ status: "deleted", slug: sql`${stores.slug} || '-deleted-' || ${stores.id}` }).where(eq(stores.id, id));
  await db.delete(domains).where(eq(domains.storeId, id));
  await audit("admin_delete_store", "store", id, undefined, id);
  revalidatePath("/admin/stores");
}

// ───── Merchants / Users ─────
export async function adminToggleUser(fd: FormData) {
  await requireSuperAdmin();
  const id = n(fd, "id");
  await db.update(users).set({ isActive: b(fd, "active") }).where(eq(users.id, id));
  await audit("admin_toggle_user", "user", id, { active: b(fd, "active") });
  revalidatePath("/admin/merchants");
}
export async function adminResetPassword(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const pwd = s(fd, "password"); if (pwd.length < 8) return { error: "8 أحرف على الأقل" };
  await db.update(users).set({ passwordHash: await hashPassword(pwd) }).where(eq(users.id, n(fd, "id")));
  await audit("admin_reset_password", "user", n(fd, "id"));
  return { success: "تم تغيير كلمة المرور" };
}

// ───── Plans ─────
export async function adminSavePlan(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const data = {
    slug: s(fd, "slug"), name: s(fd, "name"), nameEn: s(fd, "nameEn"), priceMonthly: String(n(fd, "priceMonthly")), maxProducts: n(fd, "maxProducts"), maxDomains: n(fd, "maxDomains"),
    maxStaff: n(fd, "maxStaff"), premiumTemplates: b(fd, "premiumTemplates"), marketingTools: b(fd, "marketingTools"), pageBuilder: b(fd, "pageBuilder"), isActive: b(fd, "isActive"),
    features: s(fd, "features").split("\n").map((x) => x.trim()).filter(Boolean), sortOrder: n(fd, "sortOrder"),
  };
  if (!data.slug || !data.name) return { error: "الاسم والمعرف مطلوبان" };
  const id = n(fd, "id");
  if (id) await db.update(plans).set(data).where(eq(plans.id, id)); else await db.insert(plans).values(data);
  await audit(id ? "plan_update" : "plan_create", "plan", id || null);
  revalidatePath("/admin/plans");
  return { success: "تم الحفظ" };
}

// ───── Templates ─────
export async function adminSaveTemplate(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const id = n(fd, "id");
  const data = {
    slug: s(fd, "slug"), name: s(fd, "name"), nameEn: s(fd, "nameEn"), category: s(fd, "category"), description: s(fd, "description"), previewUrl: s(fd, "previewUrl") || null,
    isPremium: b(fd, "isPremium"), isActive: b(fd, "isActive"),
    defaultTheme: { primaryColor: s(fd, "primaryColor") || "#1e3a8a", secondaryColor: s(fd, "secondaryColor") || "#3b82f6", backgroundColor: s(fd, "backgroundColor") || "#ffffff", textColor: s(fd, "textColor") || "#172554", fontFamily: s(fd, "fontFamily") || "Tajawal", radius: "16px", headerStyle: "classic" },
  };
  if (!data.slug || !data.name) return { error: "الاسم والمعرف مطلوبان" };
  if (id) await db.update(templates).set(data).where(eq(templates.id, id));
  else {
    const [base] = await db.select().from(templates).where(eq(templates.slug, "general-modern"));
    await db.insert(templates).values({ ...data, defaultBlocks: base?.defaultBlocks ?? [] });
  }
  revalidatePath("/admin/templates");
  return { success: "تم الحفظ" };
}

// ───── Domains ─────
export async function adminUpdateDomain(fd: FormData) {
  await requireSuperAdmin();
  const id = n(fd, "id");
  await db.update(domains).set({ status: s(fd, "status"), sslStatus: s(fd, "sslStatus"), lastCheckedAt: new Date(), verifiedAt: s(fd, "status") === "active" ? new Date() : null }).where(eq(domains.id, id));
  await audit("admin_update_domain", "domain", id, { status: s(fd, "status") });
  revalidatePath("/admin/domains");
}

// ───── Payment providers ─────
export async function adminSaveProvider(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const id = n(fd, "id");
  const data = { code: s(fd, "code"), name: s(fd, "name"), nameEn: s(fd, "nameEn"), type: s(fd, "type"), isLicensed: b(fd, "isLicensed"), licenseNote: s(fd, "licenseNote"), integrationMode: s(fd, "integrationMode") || "manual", isActive: b(fd, "isActive"), sortOrder: n(fd, "sortOrder") };
  if (!data.code || !data.name) return { error: "الكود والاسم مطلوبان" };
  if (id) await db.update(paymentProviders).set(data).where(eq(paymentProviders.id, id)); else await db.insert(paymentProviders).values(data);
  revalidatePath("/admin/payments");
  return { success: "تم الحفظ" };
}
export async function adminVerifyAccount(fd: FormData) {
  await requireSuperAdmin();
  const id = n(fd, "id");
  await db.update(storePaymentAccounts).set({ verificationStatus: s(fd, "status") }).where(eq(storePaymentAccounts.id, id));
  await audit("admin_verify_account", "payment_account", id, { status: s(fd, "status") });
  revalidatePath("/admin/payments");
}

// ───── Settings & Commissions ─────
export async function adminSaveSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireSuperAdmin();
  const key = s(fd, "key");
  let value: unknown;
  if (key === "general") value = { platformName: s(fd, "platformName"), platformNameEn: s(fd, "platformNameEn"), primaryDomain: s(fd, "primaryDomain"), supportEmail: s(fd, "supportEmail"), supportPhone: s(fd, "supportPhone"), currency: s(fd, "currency") || "YER" };
  else if (key === "commission") value = { type: s(fd, "type") || "percent", value: n(fd, "value") };
  else if (key === "domains") value = { cnameTarget: s(fd, "cnameTarget"), aRecord: s(fd, "aRecord"), verificationPrefix: s(fd, "verificationPrefix") || "_ms-verify" };
  else return { error: "مفتاح غير معروف" };
  await db.insert(platformSettings).values({ key, value }).onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedAt: new Date() } });
  await audit("settings_update", "settings", null, { key });
  revalidatePath("/admin", "layout");
  return { success: "تم حفظ الإعدادات" };
}
export async function adminSettleCommission(fd: FormData) {
  await requireSuperAdmin();
  const id = n(fd, "id");
  await db.update(commissionRecords).set({ status: s(fd, "status"), settledAt: s(fd, "status") === "settled" ? new Date() : null }).where(eq(commissionRecords.id, id));
  await audit("commission_status", "commission", id, { status: s(fd, "status") });
  revalidatePath("/admin/commissions");
}

// ───── Campaign moderation ─────
export async function adminToggleCampaign(fd: FormData) {
  await requireSuperAdmin();
  await db.update(campaigns).set({ isActive: b(fd, "active") }).where(eq(campaigns.id, n(fd, "id")));
  revalidatePath("/admin/campaigns");
}

// ───── Backups ─────
export async function adminCreateBackup(): Promise<ActionState> {
  const admin = await requireSuperAdmin();
  if (process.env.VERCEL) {
    return { error: "على Vercel لا يعمل pg_dump (نظام ملفات مؤقت). استخدم زر «تنزيل نسخة JSON» بدلاً من ذلك." };
  }
  const dir = path.join(process.cwd(), "backups");
  await fs.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `backup-${stamp}.sql`;
  const full = path.join(dir, filename);
  let method = "pg_dump";
  try {
    await execAsync(`pg_dump "${process.env.DATABASE_URL}" --no-owner --no-privileges -f "${full}"`);
  } catch {
    // Fallback: JSON export of all tables
    method = "json";
    const tables = await db.execute(sql`select tablename from pg_tables where schemaname='public'`);
    const out: Record<string, unknown[]> = {};
    for (const row of tables.rows as { tablename: string }[]) {
      const r = await db.execute(sql.raw(`select * from "${row.tablename}"`));
      out[row.tablename] = r.rows;
    }
    await fs.writeFile(full.replace(/\.sql$/, ".json"), JSON.stringify(out));
  }
  const finalName = method === "json" ? filename.replace(/\.sql$/, ".json") : filename;
  const stat = await fs.stat(path.join(dir, finalName));
  await db.insert(backups).values({ filename: finalName, size: stat.size, method, createdBy: admin.id });
  await audit("backup_created", "backup", null, { filename: finalName, method });
  revalidatePath("/admin/backups");
  return { success: `تم إنشاء النسخة ${finalName}` };
}
