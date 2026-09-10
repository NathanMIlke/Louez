import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import {
  categories,
  customers,
  db,
  locacameraCustomerProfiles,
  productCategories,
  products,
} from "@louez/db";
import { currentUserHasPermission, getCurrentStore } from "@/lib/store-context";

const ESTOQUENOW_API = "https://api.estoquenow.com.br/v1";
const SMOKE_LIMIT = 10;

type SourceRecord = Record<string, any>;

type NormalizedCustomer = {
  legacyId: string;
  customerType: "individual" | "business";
  email: string;
  originalEmail: string;
  firstName: string;
  lastName: string;
  companyName: string | null;
  companyNumber: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string;
  notes: string | null;
  instagram: string | null;
  acquisitionSource: string | null;
  pinnedFiles: string | null;
  createdAt: Date | null;
};

type NormalizedProduct = {
  legacyId: string;
  categoryLegacyId: string;
  categoryName: string;
  name: string;
  description: string | null;
  price: string;
  quantity: number;
  status: "active" | "archived";
  sourceImages: string[];
  createdAt: Date | null;
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function digits(value: unknown): string {
  return text(value).replace(/\D/g, "");
}

function extractList(data: any): SourceRecord[] {
  const candidates = [
    data,
    data?.data,
    data?.items,
    data?.results,
    data?.rows,
    data?.records,
    data?.data?.data,
    data?.data?.items,
  ];
  return (candidates.find(Array.isArray) ?? []) as SourceRecord[];
}

function parseMoney(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let raw = text(value).replace(/R\$/gi, "").replace(/\s/g, "");
  if (!raw) return 0;
  raw = raw.replace(/[^\d,.-]/g, "");
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

function money(value: unknown): string {
  return Math.max(0, parseMoney(value)).toFixed(2);
}

function parseDate(value: unknown): Date | null {
  const raw = text(value);
  if (!raw) return null;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  const date = br
    ? new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), Number(br[4] ?? 0), Number(br[5] ?? 0), Number(br[6] ?? 0))
    : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function validEmail(value: unknown): string {
  const email = text(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function stableId(storeId: string, kind: string, legacyId: string): string {
  const digest = createHash("sha256")
    .update(`locacamera:${storeId}:estoquenow:${kind}:${legacyId}`)
    .digest("base64url");
  return digest.slice(0, 21);
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Cliente", lastName: "EstoqueNow" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "—" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function sourceClientId(item: SourceRecord, index: number): string {
  return text(item?.id ?? item?.client_id ?? item?.customer_id) || `smoke-client-${index + 1}`;
}

function sourceProductId(item: SourceRecord, index: number): string {
  return text(item?.id ?? item?.inventory_id ?? item?.item_id ?? item?.product_id) || `smoke-product-${index + 1}`;
}

function observationValue(notes: string, label: string): string {
  if (!notes) return "";
  const normalizedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = notes.match(new RegExp(`(?:^|\\n)\\s*${normalizedLabel}\\s*:\\s*(.+?)\\s*(?=\\n|$)`, "i"));
  return text(match?.[1]);
}

function normalizeInstagram(value: unknown): string {
  return text(value)
    .replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/\?.*$/, "")
    .replace(/\/+$/, "")
    .trim();
}

function normalizePinnedFiles(value: unknown): string | null {
  const flattened = Array.isArray(value)
    ? value.map((item) => text(item?.url ?? item?.reference ?? item?.id ?? item)).filter(Boolean)
    : text(value)
        .split(/\r?\n|\s*[,;]\s*/)
        .map((item) => item.trim())
        .filter(Boolean);

  const unique = Array.from(new Set(flattened));
  return unique.length ? unique.join("\n") : null;
}

function normalizeCustomer(item: SourceRecord, index: number): NormalizedCustomer {
  const legacyId = sourceClientId(item, index);
  const document = digits(
    item?.cpf_cnpj ?? item?.cnpj_cpf ?? item?.document ?? item?.cpf ?? item?.cnpj,
  );
  const fullName = text(
    item?.name ?? item?.client_name ?? item?.full_name ?? item?.corporate_name ?? item?.company_name,
  ) || `Cliente EstoqueNow ${legacyId}`;
  const { firstName, lastName } = splitName(fullName);
  const customerType: "individual" | "business" =
    document.length === 14 || Boolean(text(item?.corporate_name ?? item?.company_name))
      ? "business"
      : "individual";
  const originalEmail = validEmail(item?.email ?? item?.email_address ?? item?.mail);
  const email = originalEmail || `estoquenow-${legacyId.replace(/[^a-zA-Z0-9]/g, "-")}@migration.locacamera.invalid`;
  const street = text(item?.address_street ?? item?.street ?? item?.address?.street);
  const number = text(item?.address_number ?? item?.number ?? item?.address?.number);
  const complement = text(item?.address_complement ?? item?.complement ?? item?.address?.complement);
  const neighborhood = text(item?.address_neighborhood ?? item?.neighborhood ?? item?.address?.neighborhood);
  const address = [street, number, complement, neighborhood].filter(Boolean).join(", ");
  const sourceNotes = text(
    item?.observations ?? item?.observation ?? item?.notes ?? item?.comments ?? item?.details,
  );
  const instagram = normalizeInstagram(
    item?.instagram_username ??
      item?.instagram ??
      item?.social_instagram ??
      observationValue(sourceNotes, "Instagram"),
  );
  const acquisitionSource = text(
    item?.acquisition_source ??
      item?.how_did_you_hear ??
      item?.origin ??
      item?.origem ??
      observationValue(sourceNotes, "Como conheceu a loja"),
  );
  const pinnedFiles = normalizePinnedFiles(
    item?.documents_reference ??
      item?.document_reference ??
      item?.documentos_referencia ??
      item?.file_reference ??
      item?.files ??
      observationValue(sourceNotes, "Referência dos documentos"),
  );
  const migrationNotes = [
    `Migrado do EstoqueNow #${legacyId}`,
    document ? `CPF/CNPJ original: ${document}` : "",
    !originalEmail ? "E-mail original ausente/inválido; e-mail técnico criado para migração." : "",
    sourceNotes,
  ].filter(Boolean).join("\n");

  return {
    legacyId,
    customerType,
    email,
    originalEmail,
    firstName,
    lastName,
    companyName: customerType === "business" ? fullName : null,
    companyNumber: customerType === "business" && document ? document : null,
    phone: text(item?.cellphone ?? item?.cell_phone ?? item?.mobile ?? item?.phone ?? item?.telephone) || null,
    address: address || null,
    city: text(
      item?.address_city_name ?? item?.city_name ?? item?.city?.name ?? item?.address?.city_name ?? item?.address_city ?? item?.city,
    ) || null,
    postalCode: digits(item?.address_zipcode ?? item?.zipcode ?? item?.zip_code ?? item?.address?.zipcode ?? item?.address?.cep) || null,
    country: "BR",
    notes: migrationNotes || null,
    instagram: instagram || null,
    acquisitionSource: acquisitionSource || null,
    pinnedFiles,
    createdAt: parseDate(item?.created_at ?? item?.createdAt ?? item?.date_created),
  };
}

function normalizeProduct(item: SourceRecord, index: number): NormalizedProduct {
  const legacyId = sourceProductId(item, index);
  const categoryLegacyId = text(item?.itemcategory_id ?? item?.category_id);
  const categoryName = text(item?.itemcategory_name ?? item?.category_name ?? item?.category?.name);
  const archived =
    item?.archived === true ||
    item?.is_archived === true ||
    Number(item?.is_archived ?? 0) === 1 ||
    Boolean(item?.archived_at ?? item?.deleted_at) ||
    ["archived", "inactive", "inativo", "arquivado"].includes(text(item?.status ?? item?.status_name).toLowerCase());
  const sourceImages = [
    item?.url_image,
    item?.url_image1,
    item?.url_image2,
    item?.url_image3,
    item?.url_image4,
  ].map(text).filter(Boolean);

  return {
    legacyId,
    categoryLegacyId,
    categoryName,
    name: text(item?.name ?? item?.title) || `Produto EstoqueNow ${legacyId}`,
    description: text(item?.description ?? item?.details ?? item?.observations) || null,
    price: money(item?.unit_price ?? item?.price ?? item?.daily_price),
    quantity: Math.max(0, Math.trunc(Number(item?.qtd ?? item?.quantity ?? item?.stock ?? 0) || 0)),
    status: archived ? "archived" : "active",
    sourceImages,
    createdAt: parseDate(item?.created_at ?? item?.createdAt ?? item?.date_created),
  };
}

async function authorize() {
  const store = await getCurrentStore();
  if (!store) return { error: NextResponse.json({ error: "Não autenticado." }, { status: 401 }) } as const;
  const allowed = await currentUserHasPermission("manage_settings");
  if (!allowed) return { error: NextResponse.json({ error: "Sem permissão para migração." }, { status: 403 }) } as const;
  return { store } as const;
}

async function estoqueNowToken(): Promise<string> {
  const clientId = text(process.env.ESTOQUENOW_CLIENT_ID);
  const clientSecret = text(process.env.ESTOQUENOW_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    throw new Error("ESTOQUENOW_CREDENTIALS_MISSING");
  }

  const response = await fetch(`${ESTOQUENOW_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => null);
  const token = text(data?.access_token ?? data?.token);
  if (!response.ok || !token) {
    throw new Error(`Falha de autenticação no EstoqueNow (${response.status}).`);
  }
  return token;
}

async function estoqueNowGet(endpoint: string, token: string): Promise<any> {
  const response = await fetch(`${ESTOQUENOW_API}${endpoint}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`EstoqueNow ${endpoint} respondeu ${response.status}.`);
  }
  return data;
}

async function extractSmokeSample() {
  const token = await estoqueNowToken();
  const [clientData, inventoryData] = await Promise.all([
    estoqueNowGet(`/client?page=1&per_page=${SMOKE_LIMIT}`, token),
    estoqueNowGet(`/inventory?page=1&per_page=${SMOKE_LIMIT}`, token),
  ]);

  const rawCustomers = extractList(clientData).slice(0, SMOKE_LIMIT);
  const rawProducts = extractList(inventoryData).slice(0, SMOKE_LIMIT);

  return {
    customers: rawCustomers.map(normalizeCustomer),
    products: rawProducts.map(normalizeProduct),
  };
}

async function uniqueCustomerEmail(storeId: string, customerId: string, normalized: NormalizedCustomer) {
  const current = await db.query.customers.findFirst({ where: eq(customers.id, customerId) });
  if (current) return normalized.email;

  const byEmail = await db.query.customers.findFirst({
    where: and(eq(customers.storeId, storeId), eq(customers.email, normalized.email)),
  });
  if (!byEmail) return normalized.email;

  return `estoquenow-${normalized.legacyId.replace(/[^a-zA-Z0-9]/g, "-")}@migration.locacamera.invalid`;
}

async function saveLocaCameraProfile(storeId: string, customerId: string, customer: NormalizedCustomer) {
  const [existing] = await db
    .select({ customerId: locacameraCustomerProfiles.customerId })
    .from(locacameraCustomerProfiles)
    .where(
      and(
        eq(locacameraCustomerProfiles.customerId, customerId),
        eq(locacameraCustomerProfiles.storeId, storeId),
      ),
    )
    .limit(1);

  const values = {
    storeId,
    estoqueNowClientId: customer.legacyId,
    instagram: customer.instagram,
    acquisitionSource: customer.acquisitionSource,
    registeredAt: customer.createdAt,
    pinnedFiles: customer.pinnedFiles,
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(locacameraCustomerProfiles)
      .set(values)
      .where(eq(locacameraCustomerProfiles.customerId, customerId));
  } else {
    await db.insert(locacameraCustomerProfiles).values({
      customerId,
      ...values,
    });
  }
}

async function importCustomers(storeId: string, input: NormalizedCustomer[]) {
  const result: Array<{ legacyId: string; louezId: string; name: string; action: "created" | "updated" }> = [];

  for (const customer of input) {
    const id = stableId(storeId, "customer", customer.legacyId);
    const existing = await db.query.customers.findFirst({ where: eq(customers.id, id) });
    const email = await uniqueCustomerEmail(storeId, id, customer);
    const values = {
      storeId,
      customerType: customer.customerType,
      email,
      firstName: customer.firstName,
      lastName: customer.lastName,
      companyName: customer.companyName,
      companyNumber: customer.companyNumber,
      companyNumberScheme: null,
      vatNumber: null,
      phone: customer.phone,
      address: customer.address,
      city: customer.city,
      postalCode: customer.postalCode,
      country: customer.country,
      notes: customer.notes,
      ...(customer.createdAt ? { createdAt: customer.createdAt } : {}),
      updatedAt: new Date(),
    } as const;

    if (existing) {
      const { createdAt: _createdAt, ...updateValues } = values as any;
      await db.update(customers).set(updateValues).where(eq(customers.id, id));
    } else {
      await db.insert(customers).values({ id, ...values });
    }

    await saveLocaCameraProfile(storeId, id, customer);

    result.push({
      legacyId: customer.legacyId,
      louezId: id,
      name: `${customer.firstName} ${customer.lastName}`.trim(),
      action: existing ? "updated" : "created",
    });
  }

  return result;
}

async function ensureCategory(storeId: string, product: NormalizedProduct): Promise<string | null> {
  if (!product.categoryName) return null;
  const sourceKey = product.categoryLegacyId || product.categoryName.toLowerCase();
  const id = stableId(storeId, "category", sourceKey);
  const existing = await db.query.categories.findFirst({ where: eq(categories.id, id) });
  if (!existing) {
    await db.insert(categories).values({
      id,
      storeId,
      name: product.categoryName,
      description: null,
      imageUrl: null,
      order: 0,
    });
  }
  return id;
}

async function importProducts(storeId: string, input: NormalizedProduct[]) {
  const result: Array<{ legacyId: string; louezId: string; name: string; action: "created" | "updated" }> = [];

  for (const product of input) {
    const id = stableId(storeId, "product", product.legacyId);
    const categoryId = await ensureCategory(storeId, product);
    const existing = await db.query.products.findFirst({ where: eq(products.id, id) });
    const values = {
      storeId,
      categoryId,
      name: product.name,
      description: product.description,
      aiContext: null,
      images: [],
      imageHistory: [],
      price: product.price,
      deposit: "0.00",
      basePeriodMinutes: 1440,
      pricingMode: "day" as const,
      pricingKind: "duration" as const,
      stockKind: "returnable" as const,
      videoUrl: null,
      taxSettings: null,
      enforceStrictTiers: false,
      quantity: product.quantity,
      trackUnits: false,
      bookingAttributeAxes: null,
      status: product.status,
      ...(product.createdAt ? { createdAt: product.createdAt } : {}),
      updatedAt: new Date(),
    };

    if (existing) {
      const { createdAt: _createdAt, ...updateValues } = values as any;
      await db.update(products).set(updateValues).where(eq(products.id, id));
    } else {
      await db.insert(products).values({ id, ...values });
    }

    await db.delete(productCategories).where(eq(productCategories.productId, id));
    if (categoryId) {
      await db.insert(productCategories).values({
        id: stableId(storeId, "product-category", `${product.legacyId}:${product.categoryLegacyId || product.categoryName}`),
        productId: id,
        categoryId,
        position: 0,
      });
    }

    result.push({
      legacyId: product.legacyId,
      louezId: id,
      name: product.name,
      action: existing ? "updated" : "created",
    });
  }

  return result;
}

function previewPayload(sample: Awaited<ReturnType<typeof extractSmokeSample>>) {
  return {
    customers: sample.customers.map(({ legacyId, originalEmail, createdAt, ...customer }) => ({
      source: { system: "EstoqueNow", id: legacyId, originalEmail: originalEmail || null },
      louez: {
        ...customer,
        registeredAt: createdAt?.toISOString() ?? null,
        createdAt: createdAt?.toISOString() ?? null,
      },
    })),
    products: sample.products.map(({ legacyId, categoryLegacyId, sourceImages, createdAt, ...product }) => ({
      source: { system: "EstoqueNow", id: legacyId, categoryId: categoryLegacyId || null, imageUrls: sourceImages },
      louez: {
        ...product,
        pricingKind: "duration",
        pricingMode: "day",
        basePeriodMinutes: 1440,
        stockKind: "returnable",
        trackUnits: false,
        images: [],
        createdAt: createdAt?.toISOString() ?? null,
      },
    })),
  };
}

export async function GET() {
  const auth = await authorize();
  if ("error" in auth) return auth.error;

  try {
    const sample = await extractSmokeSample();
    return NextResponse.json({
      ok: true,
      mode: "preview",
      requested: { customers: SMOKE_LIMIT, products: SMOKE_LIMIT },
      received: { customers: sample.customers.length, products: sample.products.length },
      data: previewPayload(sample),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao extrair amostra do EstoqueNow.";
    const status = message === "ESTOQUENOW_CREDENTIALS_MISSING" ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST() {
  const auth = await authorize();
  if ("error" in auth) return auth.error;

  try {
    const sample = await extractSmokeSample();
    if (sample.customers.length !== SMOKE_LIMIT || sample.products.length !== SMOKE_LIMIT) {
      return NextResponse.json(
        {
          error: "A API não devolveu exatamente 10 clientes e 10 produtos; nada foi importado.",
          received: { customers: sample.customers.length, products: sample.products.length },
        },
        { status: 409 },
      );
    }

    const importedCustomers = await importCustomers(auth.store.id, sample.customers);
    const importedProducts = await importProducts(auth.store.id, sample.products);

    return NextResponse.json({
      ok: true,
      mode: "imported",
      imported: { customers: importedCustomers.length, products: importedProducts.length },
      customers: importedCustomers,
      products: importedProducts,
      notes: [
        "IDs do Louez são determinísticos a partir do ID do EstoqueNow, portanto o teste pode ser repetido sem duplicar estes registros.",
        "Instagram, origem, data de cadastro e referências de arquivos são preservados no perfil LocaCamera do cliente.",
        "Imagens externas ficaram apenas na prévia de origem neste primeiro teste; a migração definitiva copiará os arquivos para o storage do Louez.",
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao importar amostra do EstoqueNow.";
    const status = message === "ESTOQUENOW_CREDENTIALS_MISSING" ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
