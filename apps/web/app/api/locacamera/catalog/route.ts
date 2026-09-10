import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { categories, pgDb, products, stores } from "@louez/db/postgres";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const storeSlug = url.searchParams.get("store")?.trim() || "locacamera";
  const requestedLimit = Number(url.searchParams.get("limit") || 500);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(500, Math.max(1, Math.trunc(requestedLimit)))
    : 500;

  const [store] = await pgDb
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.slug, storeSlug))
    .limit(1);

  if (!store) {
    return NextResponse.json({ error: "store_not_found" }, { status: 404 });
  }

  const rows = await pgDb
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      price: products.price,
      deposit: products.deposit,
      images: products.images,
      quantity: products.quantity,
      trackUnits: products.trackUnits,
      pricingMode: products.pricingMode,
      pricingKind: products.pricingKind,
      tags: products.tags,
      isFeatured: products.isFeatured,
      categoryId: products.categoryId,
      categoryName: categories.name,
      categorySlug: categories.slug,
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(
      and(
        eq(products.storeId, store.id),
        eq(products.status, "active"),
        eq(products.isVisible, true),
      ),
    )
    .orderBy(asc(products.displayOrder), asc(products.name))
    .limit(limit);

  return NextResponse.json(
    {
      store: storeSlug,
      count: rows.length,
      products: rows,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
      },
    },
  );
}
