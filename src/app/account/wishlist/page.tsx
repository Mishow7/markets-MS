import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/db";
import { wishlists, products, stores } from "@/db/schema";
import { eq } from "drizzle-orm";
import { toggleWishlist } from "@/actions/storefront";
import { money } from "@/lib/utils";

export const dynamic = "force-dynamic";
export default async function Wishlist() {
  const u = await requireUser();
  const list = await db.select({ p: products, store: stores }).from(wishlists).innerJoin(products, eq(wishlists.productId, products.id)).innerJoin(stores, eq(products.storeId, stores.id)).where(eq(wishlists.userId, u.id));
  return (
    <>
      <h1 className="mb-4 text-xl font-extrabold">المفضلة</h1>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">{list.map(({ p, store }) => <div key={p.id} className="rounded-2xl bg-white p-3 shadow-sm"><Link href={`/s/${store.slug}/product/${p.slug}`}><div className="aspect-square rounded-xl bg-blue-50 overflow-hidden grid place-items-center">{p.images[0] ? <img src={p.images[0]} alt="" className="h-full w-full object-cover" /> : "🛍️"}</div><div className="mt-2 text-xs text-blue-800">{store.name}</div><div className="font-semibold line-clamp-1">{p.name}</div><div className="font-bold">{money(p.price, store.currency)}</div></Link><form action={toggleWishlist}><input type="hidden" name="productId" value={p.id} /><input type="hidden" name="back" value="/account/wishlist" /><button className="mt-1 text-xs text-blue-900">إزالة</button></form></div>)}{!list.length && <p className="col-span-full text-blue-500">لا توجد منتجات مفضلة</p>}</div>
    </>
  );
}
