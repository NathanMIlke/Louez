import { createHash } from "crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  categories,
  db,
  locacameraInventoryCategories,
  locacameraInventoryItems,
  productCategories,
  products,
  stores,
} from "@louez/db";

const API_BASE = process.env.ESTOQUENOW_BASE_URL || "https://api.estoquenow.com.br/v1";

type Row = Record<string, any>;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function numberValue(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let raw = text(value).replace(/R\$/gi, "").replace(/\s/g, "").replace(/[^\d,.-]/g, "");
  if (raw.includes(",") && raw.includes(".")) {
    raw = raw.lastIndexOf(",") > raw.lastIndexOf(".")
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(/,/g, "");
  } else if (raw.includes(",")) {
    raw = raw.replace(",", ".");
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: unknown) {
  return Math.max(0, numberValue(value)).toFixed(2);
}

function integer(value: unknown) {
  return Math.max(0, Math.trunc(numberValue(value)));
}

function bool(value: unknown): boolean | null {
  if (value === true || value === 1 || text(value).toLowerCase() === "true") return true;
  if (value === false || value === 0 || text(value).toLowerCase() === "false") return false;
  return null;
}

function parseDate(value: unknown): Date | null {
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function stableId(storeId: string, kind: string, sourceId: string) {
  return createHash("sha256")
    .update(`locacamera:${storeId}:estoquenow:${kind}:${sourceId}`)
    .digest("base64url")
    .slice(0, 21);
}

function extractList(data: any): Row[] {
  const candidates = [data, data?.data, data?.items, data?.results, data?.rows, data?.records, data?.data?.data, data?.data?.items];
  return (candidates.find(Array.isArray) ?? []) as Row[];
}

function normalizedName(row: Row) {
  return text(row?.name ?? row?.title ?? row?.item_name);
}

function isExactZve10(row: Row) {
  const name = normalizedName(row).toUpperCase().replace(/[–—]/g, "-");
  const hasZve10 = /\bZV\s*-?\s*E10\b/.test(name);
  const isMark2 = /\b(?:II|2|MARK\s*II|MK\s*II)\b/.test(name) || /ZV\s*-?\s*E10\s*-?\s*II/.test(name);
  return hasZve10 && !isMark2;
}

async function getToken() {
  const clientId = text(process.env.ESTOQUENOW_CLIENT_ID);
  const clientSecret = text(process.env.ESTOQUENOW_CLIENT_SECRET);
  if (!clientId || !clientSecret) throw new Error("ESTOQUENOW_CREDENTIALS_MISSING");

  const response = await fetch(`${API_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => null);
  const token = text(data?.access_token ?? data?.token);
  if (!response.ok || !token) throw new Error(`ESTOQUENOW_AUTH_${response.status}`);
  return token;
}

async function apiGet(endpoint: string, token: string) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`ESTOQUENOW_${response.status}_${endpoint}`);
  return data;
}

async function findZve10(token: string) {
  const matches: Row[] = [];
  for (let page = 1; page <= 20; page++) {
    const data = await apiGet(`/inventory?page=${page}&per_page=100`, token);
    const rows = extractList(data);
    matches.push(...rows.filter(isExactZve10));
    if (rows.length < 100) break;
  }
  return matches;
}

export async function GET() {
  try {
    const allStores = await db.select({ id: stores.id, name: stores.name }).from(stores).limit(2);
    if (allStores.length !== 1) {
      return NextResponse.json({ ok: false, error: "STORE_AMBIGUOUS", stores: allStores.map((s) => ({ id: s.id, name: s.name })) }, { status: 409 });
    }
    const store = allStores[0];

    const token = await getToken();
    const matches = await findZve10(token);

    if (matches.length !== 1) {
      return NextResponse.json({
        ok: false,
        error: matches.length === 0 ? "ZVE10_NOT_FOUND" : "ZVE10_AMBIGUOUS",
        candidates: matches.map((row) => ({
          id: text(row?.id ?? row?.inventory_id ?? row?.item_id ?? row?.product_id),
          name: normalizedName(row),
          price: row?.unit_price ?? row?.price ?? row?.daily_price ?? null,
          quantity: row?.qtd ?? row?.quantity ?? row?.stock ?? null,
          categoryId: row?.itemcategory_id ?? row?.category_id ?? null,
          categoryName: row?.itemcategory_name ?? row?.category_name ?? row?.category?.name ?? null,
          status: row?.status ?? row?.status_name ?? null,
        })),
      }, { status: 409 });
    }

    const row = matches[0];
    const externalProductId = text(row?.id ?? row?.inventory_id ?? row?.item_id ?? row?.product_id);
    if (!externalProductId) throw new Error("ZVE10_SOURCE_ID_MISSING");

    const categoryExternalId = text(row?.itemcategory_id ?? row?.category_id);
    const categoryName = text(row?.itemcategory_name ?? row?.category_name ?? row?.category?.name);
    let categoryId: string | null = null;

    if (categoryExternalId || categoryName) {
      const categoryKey = categoryExternalId || categoryName.toLowerCase();
      categoryId = stableId(store.id, "category", categoryKey);
      const existingCategory = await db.query.categories.findFirst({ where: eq(categories.id, categoryId) });
      const categoryValues = {
        storeId: store.id,
        name: categoryName || "Sem categoria",
        description: null,
        imageUrl: null,
        order: 0,
      };
      if (existingCategory) {
        await db.update(categories).set(categoryValues).where(eq(categories.id, categoryId));
      } else {
        await db.insert(categories).values({ id: categoryId, ...categoryValues });
      }

      const existingMeta = await db.query.locacameraInventoryCategories.findFirst({
        where: and(
          eq(locacameraInventoryCategories.storeId, store.id),
          eq(locacameraInventoryCategories.sourceSystem, "estoquenow"),
          eq(locacameraInventoryCategories.externalCategoryId, categoryExternalId || categoryKey),
        ),
      });
      const categoryMetaValues = {
        storeId: store.id,
        sourceSystem: "estoquenow",
        externalCategoryId: categoryExternalId || categoryKey,
        externalCompanyId: text(row?.company_id ?? row?.enterprise_id) || null,
        isVisibleVirtualStore: bool(row?.itemcategory_is_visible_virtualstore ?? row?.category?.is_visible_virtualstore),
        legacyData: row?.category && typeof row.category === "object" ? row.category : null,
        syncedAt: new Date(),
        updatedAt: new Date(),
      };
      if (existingMeta) {
        await db.update(locacameraInventoryCategories).set(categoryMetaValues).where(eq(locacameraInventoryCategories.categoryId, existingMeta.categoryId));
      } else {
        await db.insert(locacameraInventoryCategories).values({ categoryId, ...categoryMetaValues });
      }
    }

    const productId = stableId(store.id, "product", externalProductId);
    const name = normalizedName(row) || `Produto EstoqueNow ${externalProductId}`;
    const archived = row?.archived === true || row?.is_archived === true || Number(row?.is_archived ?? 0) === 1 || Boolean(row?.archived_at ?? row?.deleted_at) || ["archived", "inactive", "inativo", "arquivado"].includes(text(row?.status ?? row?.status_name).toLowerCase());
    const sourceImages = [row?.url_image, row?.url_image1, row?.url_image2, row?.url_image3, row?.url_image4].map(text).filter(Boolean);
    const quantity = integer(row?.qtd ?? row?.quantity ?? row?.stock ?? 0);
    const price = money(row?.unit_price ?? row?.price ?? row?.daily_price);

    const existingProduct = await db.query.products.findFirst({ where: eq(products.id, productId) });
    const productValues = {
      storeId: store.id,
      categoryId,
      name,
      description: text(row?.description ?? row?.details ?? row?.observations) || null,
      aiContext: null,
      images: [],
      imageHistory: [],
      price,
      deposit: "0.00",
      basePeriodMinutes: 1440,
      pricingMode: "day" as const,
      pricingKind: "duration" as const,
      stockKind: "returnable" as const,
      videoUrl: null,
      taxSettings: null,
      enforceStrictTiers: false,
      quantity,
      trackUnits: false,
      bookingAttributeAxes: null,
      status: archived ? "archived" as const : "active" as const,
      updatedAt: new Date(),
    };
    if (existingProduct) {
      await db.update(products).set(productValues).where(eq(products.id, productId));
    } else {
      const createdAt = parseDate(row?.created_at ?? row?.createdAt ?? row?.date_created);
      await db.insert(products).values({ id: productId, ...productValues, ...(createdAt ? { createdAt } : {}) });
    }

    await db.delete(productCategories).where(eq(productCategories.productId, productId));
    if (categoryId) {
      await db.insert(productCategories).values({
        id: stableId(store.id, "product-category", `${externalProductId}:${categoryExternalId || categoryName}`),
        productId,
        categoryId,
        position: 0,
      });
    }

    const existingItemMeta = await db.query.locacameraInventoryItems.findFirst({
      where: and(
        eq(locacameraInventoryItems.storeId, store.id),
        eq(locacameraInventoryItems.sourceSystem, "estoquenow"),
        eq(locacameraInventoryItems.externalProductId, externalProductId),
      ),
    });

    const itemMetaValues = {
      storeId: store.id,
      sourceSystem: "estoquenow",
      externalProductId,
      externalCompanyId: text(row?.company_id ?? row?.enterprise_id) || null,
      code: text(row?.code ?? row?.item_code ?? row?.sku) || null,
      barcode: text(row?.barcode ?? row?.ean ?? row?.gtin) || null,
      externalType: Number.isFinite(Number(row?.type ?? row?.item_type)) ? Number(row?.type ?? row?.item_type) : null,
      managementType: text(row?.management_type ?? row?.inventory_management_type) || null,
      sourceUnitPrice: price,
      promotionalUnitPrice: row?.promotional_unit_price != null ? money(row.promotional_unit_price) : null,
      unitPriceForPj: row?.unit_price_for_pj != null ? money(row.unit_price_for_pj) : null,
      buyPrice: row?.buy_price != null ? money(row.buy_price) : null,
      unitCostPrice: row?.unit_cost_price != null ? money(row.unit_cost_price) : null,
      repositionPrice: row?.reposition_price != null ? money(row.reposition_price) : null,
      failurePrice: row?.failure_price != null ? money(row.failure_price) : null,
      sourceQuantity: quantity,
      maintainingQuantity: row?.maintaining_quantity != null ? integer(row.maintaining_quantity) : null,
      unitType: text(row?.unit_type) || null,
      externalCategoryId: categoryExternalId || null,
      externalCategoryNameSnapshot: categoryName || null,
      providerId: text(row?.provider_id) || null,
      isEnabled: bool(row?.is_enabled ?? row?.enabled),
      isVisibleVirtualStore: bool(row?.is_visible_virtualstore ?? row?.visible_virtualstore),
      isHighlighted: bool(row?.is_highlighted ?? row?.highlighted),
      isArchived: archived,
      isFavoriteItem: bool(row?.is_favorite_item ?? row?.favorite),
      hasInventoryManaged: bool(row?.has_inventory_managed ?? row?.inventory_managed),
      keywords: text(row?.keywords) || null,
      observations: text(row?.observations ?? row?.observation) || null,
      uri: text(row?.uri ?? row?.slug) || null,
      sourceImageUrls: sourceImages,
      sourceVideoUrl: text(row?.video_url ?? row?.url_video) || null,
      minutesBlockedBeforeDelivery: row?.minutes_blocked_before_delivery != null ? integer(row.minutes_blocked_before_delivery) : null,
      minutesBlockedAfterReturn: row?.minutes_blocked_after_return != null ? integer(row.minutes_blocked_after_return) : null,
      quantityTimesRented: row?.quantity_times_rented != null ? integer(row.quantity_times_rented) : null,
      sourceCreatedAt: parseDate(row?.created_at ?? row?.createdAt ?? row?.date_created),
      sourceUpdatedAt: parseDate(row?.updated_at ?? row?.updatedAt ?? row?.date_updated),
      syncedAt: new Date(),
      legacyData: row,
      updatedAt: new Date(),
    };

    if (existingItemMeta) {
      await db.update(locacameraInventoryItems).set(itemMetaValues).where(eq(locacameraInventoryItems.productId, existingItemMeta.productId));
    } else {
      await db.insert(locacameraInventoryItems).values({ productId, ...itemMetaValues });
    }

    return NextResponse.json({
      ok: true,
      result: {
        externalProductId,
        productId,
        name,
        price,
        quantity,
        category: categoryName || null,
        categoryExternalId: categoryExternalId || null,
        status: archived ? "archived" : "active",
        sourceVisible: bool(row?.is_visible_virtualstore ?? row?.visible_virtualstore),
        action: existingProduct ? "updated" : "created",
        tables: ["products", ...(categoryId ? ["categories", "product_categories", "locacamera_inventory_categories"] : []), "locacamera_inventory_items"],
      },
    });
  } catch (error) {
    console.error("ZVE10_MIGRATION_TEST_FAILED", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "UNKNOWN" }, { status: 500 });
  }
}
