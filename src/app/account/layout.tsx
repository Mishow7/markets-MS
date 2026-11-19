import type { ReactNode } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { logoutAction } from "@/actions/auth";

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const nav = [["/account", "حسابي"], ["/account/orders", "طلباتي"], ["/account/addresses", "عناويني"], ["/account/wishlist", "المفضلة"]];
  return (
    <div className="min-h-screen bg-blue-50">
      <header className="border-b bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3"><Link href="/" className="text-xl font-extrabold text-blue-800">MS <span className="text-blue-500">Commerce</span></Link><div className="flex items-center gap-2 text-sm">{(user.role === "merchant" || user.role === "super_admin") && <Link href={user.role === "super_admin" ? "/admin" : "/merchant"} className="rounded-xl border px-3 py-1.5 font-semibold">لوحة التحكم</Link>}<form action={logoutAction}><button className="rounded-xl bg-blue-950 px-3 py-1.5 text-white">خروج</button></form></div></div></header>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[220px_1fr]">
        <aside className="h-fit rounded-2xl bg-white p-3 shadow-sm"><div className="px-3 py-2 font-bold">{user.name}</div>{nav.map(([h, l]) => <Link key={h} href={h} className="block rounded-xl px-3 py-2 text-sm hover:bg-blue-50">{l}</Link>)}{user.role === "customer" && <Link href="/merchant/onboarding" className="mt-2 block rounded-xl bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">🏬 افتح متجرك</Link>}</aside>
        <main>{children}</main>
      </div>
    </div>
  );
}
