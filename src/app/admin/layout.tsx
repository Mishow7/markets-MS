import type { ReactNode } from "react";
import { requireSuperAdmin } from "@/lib/auth";
import { getLocale, t } from "@/lib/i18n";
import { DashboardShell } from "@/components/shell";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { desc, eq, or, isNull } from "drizzle-orm";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireSuperAdmin();
  const locale = await getLocale();
  const notifs = await db.select().from(notifications).where(or(eq(notifications.userId, user.id), isNull(notifications.userId))).orderBy(desc(notifications.createdAt)).limit(15);
  const nav = [
    { href: "/admin", label: t(locale, "dashboard"), icon: "📊" }, { href: "/admin/stores", label: t(locale, "stores"), icon: "🏬" }, { href: "/admin/merchants", label: t(locale, "merchants"), icon: "👥" },
    { href: "/admin/plans", label: t(locale, "plans"), icon: "📦" }, { href: "/admin/templates", label: t(locale, "templates"), icon: "🎨" }, { href: "/admin/domains", label: t(locale, "domains"), icon: "🌐" },
    { href: "/admin/payments", label: t(locale, "payments"), icon: "🏦" }, { href: "/admin/commissions", label: t(locale, "commissions"), icon: "💰" }, { href: "/admin/campaigns", label: t(locale, "campaigns"), icon: "📢" },
    { href: "/admin/reports", label: t(locale, "reports"), icon: "📈" }, { href: "/admin/audit", label: t(locale, "audit"), icon: "🧾" }, { href: "/admin/backups", label: t(locale, "backups"), icon: "💾" }, { href: "/admin/settings", label: t(locale, "settings"), icon: "⚙️" },
  ];
  return <DashboardShell nav={nav} title={t(locale, "superAdmin")} user={user} locale={locale} notifications={notifs} accent="slate">{children}</DashboardShell>;
}
