import { createHash, timingSafeEqual } from "crypto";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import {
  categories,
  db,
  locacameraInventoryCategories,
  locacameraInventoryItems,
  productCategories,
  products,
  stores,
} from "@louez/db";

const DEFAULT_API_BASE = "https://api.estoquenow.com.br/v1";
type Row = Record<string, unknown>;

const text = (value: unknown) => String(value ?? "").trim();
const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
const stableId = (storeId: string, kind: string, sourceId: string) => createHash("sha256").update(`locacamera:${storeId}:estoquenow:${kind}:${sourceId}`).digest("base64url").slice(0, 21);

function safeTokenMatch(received: string, expected: string) {
  return timingSafeEqual(createHash("sha256").update(received).digest(), createHash("sha256").update(expected).digest());
}
function bool(value: unknown): boolean | null {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const v = text(value).toLowerCase();
  if (["true", "1", "sim", "yes"].includes(v)) return true;
  if (["false", "0", "nao", "não", "no"].includes(v)) return false;
  return null;
}
function money(value: unknown) {
  let raw = text(value).replace(/R\$/gi, "").replace(/\s/g, "").replace(/[^\d,.-]/g, "");
  if (raw.includes(",") && raw.includes(".")) raw = raw.lastIndexOf(",") > raw.lastIndexOf(".") ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  else if (raw.includes(",")) raw = raw.replace(",", ".");
  const parsed = Number(raw);
  return (Number.isFinite(parsed) ? Math.max(0, parsed) : 0).toFixed(2);
}
function integer(value: unknown) {
  const parsed = Number(text(value).replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}
function parseDate(value: unknown): Date | null {
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function extractList(payload: unknown): Row[] {
  if (Array.isArray(payload)) return payload as Row[];
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const candidate of [record.data, record.items, record.results, record.rows, record.records]) if (Array.isArray(candidate)) return candidate as Row[];
  if (record.data && typeof record.data === "object" && !Array.isArray(record.data)) {
    const nested = record.data as Record<string, unknown>;
    if (Array.isArray(nested.data)) return nested.data as Row[];
    if (Array.isArray(nested.items)) return nested.items as Row[];
  }
  return [];
}
function normalizedName(row: Row) { return text(row.name ?? row.title ?? row.item_name); }
function exactZve10(row: Row) {
  const name = normalizeSearch(normalizedName(row));
  return /\bZV\s*-?\s*E10\b/.test(name) && !/ZV\s*-?\s*E10\s*(?:II|2|MARK\s*II|MK\s*II)\b/.test(name);
}

async function getToken() {
  const clientId = text(process.env.ESTOQUENOW_CLIENT_ID);
  const clientSecret = text(process.env.ESTOQUENOW_CLIENT_SECRET);
  const baseUrl = text(process.env.ESTOQUENOW_BASE_URL || DEFAULT_API_BASE).replace(/\/+$/, "");
  if (!clientId || !clientSecret) throw new Error("ESTOQUENOW_CREDENTIALS_MISSING");
  const response = await fetch(`${baseUrl}/oauth2/token`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }), cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  const token = text(payload?.access_token ?? payload?.token);
  if (!response.ok || !token) throw new Error(`ESTOQUENOW_AUTH_${response.status}`);
  return token;
}
async function apiGet(endpoint: string, token: string) {
  const baseUrl = text(process.env.ESTOQUENOW_BASE_URL || DEFAULT_API_BASE).replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}${endpoint}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`ESTOQUENOW_${response.status}`);
  return payload;
}
async function getStoreId() {
  const availableStores = await db.select({ id: stores.id, name: stores.name }).from(stores);
  const matches = availableStores.filter((store) => store.name.toLocaleLowerCase("pt-BR").includes("locacamera"));
  if (matches.length === 1) return matches[0]!.id;
  if (availableStores.length === 1) return availableStores[0]!.id;
  throw new Error("STORE_AMBIGUOUS");
}
async function findEquipment(query: string) {
  const token = await getToken();
  const q = normalizeSearch(query);
  const matches: Row[] = [];
  for (let page = 1; page <= 20; page++) {
    const rows = extractList(await apiGet(`/inventory?page=${page}&per_page=100`, token));
    matches.push(...rows.filter((row) => ["ZV-E10", "ZVE10", "SONY ZV-E10"].includes(q) ? exactZve10(row) : normalizeSearch(normalizedName(row)).includes(q)));
    if (rows.length < 100) break;
  }
  if (matches.length === 0) throw new Error("EQUIPMENT_NOT_FOUND");
  if (matches.length > 1) throw new Error(`EQUIPMENT_AMBIGUOUS:${matches.map((row) => `${text(row.id ?? row.inventory_id ?? row.item_id ?? row.product_id)}=${normalizedName(row)}`).join("|")}`);
  return matches[0]!;
}
async function importEquipment(row: Row) {
  const storeId = await getStoreId();
  const externalProductId = text(row.id ?? row.inventory_id ?? row.item_id ?? row.product_id);
  if (!externalProductId) throw new Error("SOURCE_ID_MISSING");
  return db.transaction(async (tx) => {
    const category = row.category as Record<string, unknown> | undefined;
    const categoryExternalId = text(row.itemcategory_id ?? row.category_id);
    const categoryName = text(row.itemcategory_name ?? row.category_name ?? category?.name);
    let categoryId: string | null = null;
    if (categoryExternalId || categoryName) {
      const sourceKey = categoryExternalId || categoryName.toLowerCase();
      categoryId = stableId(storeId, "category", sourceKey);
      const [existingCategory] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.id, categoryId)).limit(1);
      const categoryValues = { storeId, name: categoryName || "Sem categoria", description: null, imageUrl: null, order: 0 };
      if (existingCategory) await tx.update(categories).set(categoryValues).where(eq(categories.id, categoryId)); else await tx.insert(categories).values({ id: categoryId, ...categoryValues });
      const [existingMeta] = await tx.select({ categoryId: locacameraInventoryCategories.categoryId }).from(locacameraInventoryCategories).where(and(eq(locacameraInventoryCategories.storeId, storeId), eq(locacameraInventoryCategories.sourceSystem, "estoquenow"), eq(locacameraInventoryCategories.externalCategoryId, categoryExternalId || sourceKey))).limit(1);
      const categoryMeta = { storeId, sourceSystem: "estoquenow", externalCategoryId: categoryExternalId || sourceKey, externalCompanyId: text(row.company_id ?? row.enterprise_id) || null, isVisibleVirtualStore: bool(row.itemcategory_is_visible_virtualstore ?? category?.is_visible_virtualstore), legacyData: category ?? null, syncedAt: new Date(), updatedAt: new Date() };
      if (existingMeta) await tx.update(locacameraInventoryCategories).set(categoryMeta).where(eq(locacameraInventoryCategories.categoryId, existingMeta.categoryId)); else await tx.insert(locacameraInventoryCategories).values({ categoryId, ...categoryMeta });
    }
    const productId = stableId(storeId, "product", externalProductId);
    const name = normalizedName(row) || `Produto EstoqueNow ${externalProductId}`;
    const archived = row.archived === true || row.is_archived === true || Number(row.is_archived ?? 0) === 1 || Boolean(row.archived_at ?? row.deleted_at) || ["archived", "inactive", "inativo", "arquivado"].includes(text(row.status ?? row.status_name).toLowerCase());
    const quantity = integer(row.qtd ?? row.quantity ?? row.stock ?? 0);
    const price = money(row.unit_price ?? row.price ?? row.daily_price);
    const sourceImages = [row.url_image, row.url_image1, row.url_image2, row.url_image3, row.url_image4].map(text).filter(Boolean);
    const [existingProduct] = await tx.select({ id: products.id }).from(products).where(eq(products.id, productId)).limit(1);
    const productValues = { storeId, categoryId, name, description: text(row.description ?? row.details ?? row.observations) || null, aiContext: null, images: [], imageHistory: [], price, deposit: "0.00", basePeriodMinutes: 1440, pricingMode: "day" as const, pricingKind: "duration" as const, stockKind: "returnable" as const, videoUrl: null, taxSettings: null, enforceStrictTiers: false, quantity, trackUnits: false, bookingAttributeAxes: null, status: archived ? "archived" as const : "active" as const, updatedAt: new Date() };
    if (existingProduct) await tx.update(products).set(productValues).where(eq(products.id, productId)); else { const createdAt = parseDate(row.created_at ?? row.createdAt ?? row.date_created); await tx.insert(products).values({ id: productId, ...productValues, ...(createdAt ? { createdAt } : {}) }); }
    await tx.delete(productCategories).where(eq(productCategories.productId, productId));
    if (categoryId) await tx.insert(productCategories).values({ id: stableId(storeId, "product-category", `${externalProductId}:${categoryExternalId || categoryName}`), productId, categoryId, position: 0 });
    const [existingInventoryMeta] = await tx.select({ productId: locacameraInventoryItems.productId }).from(locacameraInventoryItems).where(and(eq(locacameraInventoryItems.storeId, storeId), eq(locacameraInventoryItems.sourceSystem, "estoquenow"), eq(locacameraInventoryItems.externalProductId, externalProductId))).limit(1);
    const metaValues = { storeId, sourceSystem: "estoquenow", externalProductId, externalCompanyId: text(row.company_id ?? row.enterprise_id) || null, code: text(row.code ?? row.item_code ?? row.sku) || null, barcode: text(row.barcode ?? row.ean ?? row.gtin) || null, sourceUnitPrice: price, sourceQuantity: quantity, externalCategoryId: categoryExternalId || null, externalCategoryNameSnapshot: categoryName || null, isEnabled: bool(row.is_enabled ?? row.enabled), isVisibleVirtualStore: bool(row.is_visible_virtualstore ?? row.visible_virtualstore), isHighlighted: bool(row.is_highlighted ?? row.highlighted), isArchived: archived, observations: text(row.observations ?? row.observation) || null, uri: text(row.uri ?? row.slug) || null, sourceImageUrls: sourceImages, sourceCreatedAt: parseDate(row.created_at ?? row.createdAt ?? row.date_created), sourceUpdatedAt: parseDate(row.updated_at ?? row.updatedAt ?? row.date_updated), syncedAt: new Date(), legacyData: row, updatedAt: new Date() };
    if (existingInventoryMeta) await tx.update(locacameraInventoryItems).set(metaValues).where(eq(locacameraInventoryItems.productId, existingInventoryMeta.productId)); else await tx.insert(locacameraInventoryItems).values({ productId, ...metaValues });
    return { action: existingProduct ? "updated" : "created", productId, externalProductId, name, price, quantity, category: categoryName || null };
  });
}

async function authorize(request: NextRequest) {
  const expectedToken = text(process.env.MIGRATION_ADMIN_TOKEN);
  const receivedToken = text(request.headers.get("x-migration-token") || request.nextUrl.searchParams.get("token"));
  return Boolean(expectedToken && receivedToken && safeTokenMatch(receivedToken, expectedToken));
}

export async function GET(request: NextRequest) {
  if (!(await authorize(request))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const query = text(request.nextUrl.searchParams.get("query"));
  if (!query) return NextResponse.json({ error: "QUERY_REQUIRED" }, { status: 400 });
  try { const result = await importEquipment(await findEquipment(query)); return NextResponse.json({ ok: true, source: "estoquenow", ...result }); }
  catch (error) { const message = error instanceof Error ? error.message : "IMPORT_FAILED"; return NextResponse.json({ ok: false, error: message }, { status: message === "EQUIPMENT_NOT_FOUND" ? 404 : message.startsWith("EQUIPMENT_AMBIGUOUS") ? 409 : 500 }); }
}

export async function POST(request: NextRequest) {
  if (!(await authorize(request))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { query?: string };
  const query = text(body.query);
  if (!query) return NextResponse.json({ error: "QUERY_REQUIRED" }, { status: 400 });
  try { const result = await importEquipment(await findEquipment(query)); return NextResponse.json({ ok: true, source: "estoquenow", ...result }); }
  catch (error) { const message = error instanceof Error ? error.message : "IMPORT_FAILED"; return NextResponse.json({ ok: false, error: message }, { status: message === "EQUIPMENT_NOT_FOUND" ? 404 : message.startsWith("EQUIPMENT_AMBIGUOUS") ? 409 : 500 }); }
}
