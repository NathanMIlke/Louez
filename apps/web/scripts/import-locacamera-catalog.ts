import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { categories, pgDb, products, stores } from "@louez/db/postgres";

type LegacyCatalogItem = {
  id: string;
  name: string;
  description?: string;
  image?: string;
  dailyPrice: number;
  quantity: number;
  category?: string;
  categoryGroup?: string;
  brand?: string;
  filterType?: string;
  tags?: string[];
  featured?: boolean;
};

type LegacyCatalogResponse = {
  items: LegacyCatalogItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "equipamentos";
}

async function loadLegacyCatalog(baseUrl: string) {
  const items: LegacyCatalogItem[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const url = new URL(baseUrl);
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", "48");
    url.searchParams.set("sort", "name");

    const response = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Legacy catalog request failed (${response.status})`);
    }

    const payload = (await response.json()) as LegacyCatalogResponse;
    items.push(...(Array.isArray(payload.items) ? payload.items : []));
    totalPages = Math.max(1, Number(payload.pagination?.totalPages || 1));
    page += 1;
  } while (page <= totalPages);

  return items;
}

async function main() {
  const sourceUrl =
    process.env.LOCACAMERA_LEGACY_CATALOG_URL || "https://locacamera.com.br/api/catalogo";

  const [store] = await pgDb
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.slug, "locacamera"))
    .limit(1);

  if (!store) throw new Error("LocaCamera store was not bootstrapped");

  const legacyItems = await loadLegacyCatalog(sourceUrl);
  if (legacyItems.length === 0) throw new Error("Legacy catalog returned no products");

  const categoryIds = new Map<string, string>();
  const categoryNames = [...new Set(legacyItems.map((item) => item.categoryGroup || item.category || "Equipamentos"))];

  for (const name of categoryNames) {
    const slug = slugify(name);
    const [existing] = await pgDb
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.storeId, store.id), eq(categories.slug, slug)))
      .limit(1);

    const categoryId = existing?.id || nanoid();

    if (!existing) {
      await pgDb.insert(categories).values({
        id: categoryId,
        storeId: store.id,
        name,
        slug,
      });
    }

    categoryIds.set(name, categoryId);
  }

  let inserted = 0;
  let updated = 0;

  for (const item of legacyItems) {
    const legacyId = String(item.id || "").trim();
    if (!legacyId || !item.name || Number(item.dailyPrice) <= 0) continue;

    const categoryName = item.categoryGroup || item.category || "Equipamentos";
    const categoryId = categoryIds.get(categoryName) ?? null;
    const tags = [
      ...(Array.isArray(item.tags) ? item.tags : []),
      item.brand ? `Marca: ${item.brand}` : "",
      item.filterType ? `Tipo: ${item.filterType}` : "",
    ].filter(Boolean);
    const images = item.image ? [item.image] : [];

    const [existing] = await pgDb
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.storeId, store.id), eq(products.legacyEstoqueNowId, legacyId)))
      .limit(1);

    const values = {
      storeId: store.id,
      categoryId,
      name: item.name,
      description: item.description || null,
      images,
      price: String(Number(item.dailyPrice).toFixed(2)),
      quantity: Math.max(0, Math.trunc(Number(item.quantity || 0))),
      pricingMode: "day" as const,
      pricingKind: "duration" as const,
      stockKind: "returnable" as const,
      status: "active" as const,
      tags,
      isVisible: true,
      isFeatured: Boolean(item.featured),
      legacyEstoqueNowId: legacyId,
      updatedAt: new Date(),
    };

    if (existing) {
      await pgDb.update(products).set(values).where(eq(products.id, existing.id));
      updated += 1;
    } else {
      await pgDb.insert(products).values({ id: nanoid(), ...values });
      inserted += 1;
    }
  }

  console.log(
    JSON.stringify({ source: sourceUrl, received: legacyItems.length, inserted, updated }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
