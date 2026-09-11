import { createHash, timingSafeEqual } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import {
  customers,
  db,
  locacameraCustomerProfiles,
  stores,
} from "@louez/db";

const ESTOQUENOW_API = "https://api.estoquenow.com.br/v1";
const SAMPLE_SIZE = 5;

type SourceRecord = Record<string, unknown>;

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function nullableText(value: unknown, maxLength = 255): string | null {
  const valueText = text(value).slice(0, maxLength);
  return valueText || null;
}

function digits(value: unknown): string {
  return text(value).replace(/\D/g, "");
}

function nullableBoolean(value: unknown): boolean | null {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;

  const normalized = text(value).toLowerCase();
  if (["1", "true", "sim", "yes"].includes(normalized)) return true;
  if (["0", "false", "nao", "não", "no"].includes(normalized)) return false;
  return null;
}

function decimalText(value: unknown): string | null {
  const raw = text(value).replace(/R\$/gi, "").replace(/\s/g, "");
  if (!raw) return null;

  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const parsed = Number(normalized.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed.toFixed(4) : null;
}

function parseDate(value: unknown): Date | null {
  const raw = text(value);
  if (!raw) return null;

  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) {
    return new Date(Date.UTC(Number(br[3]), Number(br[2]) - 1, Number(br[1]), 12));
  }

  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) {
    return new Date(
      Date.UTC(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]), 12),
    );
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function validEmail(value: unknown): string {
  const email = text(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Cliente", lastName: "EstoqueNow" };
  if (parts.length === 1) return { firstName: parts[0]!, lastName: "—" };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

function extractList(payload: unknown): SourceRecord[] {
  if (Array.isArray(payload)) return payload as SourceRecord[];
  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  const direct = [record.data, record.items, record.results, record.rows, record.records];
  for (const candidate of direct) {
    if (Array.isArray(candidate)) return candidate as SourceRecord[];
  }

  if (record.data && typeof record.data === "object" && !Array.isArray(record.data)) {
    const nested = record.data as Record<string, unknown>;
    if (Array.isArray(nested.data)) return nested.data as SourceRecord[];
    if (Array.isArray(nested.items)) return nested.items as SourceRecord[];
  }

  return [];
}

function safeTokenMatch(received: string, expected: string): boolean {
  const left = createHash("sha256").update(received).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

function stableCustomerId(storeId: string, legacyId: string): string {
  return createHash("sha256")
    .update(`locacamera:${storeId}:estoquenow:customer:${legacyId}`)
    .digest("base64url")
    .slice(0, 21);
}

async function getEstoqueNowToken(): Promise<string> {
  const clientId = text(process.env.ESTOQUENOW_CLIENT_ID);
  const clientSecret = text(process.env.ESTOQUENOW_CLIENT_SECRET);
  const baseUrl = text(process.env.ESTOQUENOW_BASE_URL || ESTOQUENOW_API).replace(/\/+$/, "");

  if (!clientId || !clientSecret) throw new Error("ESTOQUENOW_CREDENTIALS_MISSING");

  const response = await fetch(`${baseUrl}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const token = text(payload?.access_token ?? payload?.token);
  if (!response.ok || !token) throw new Error(`ESTOQUENOW_AUTH_${response.status}`);
  return token;
}

async function fetchCustomerSample(): Promise<SourceRecord[]> {
  const token = await getEstoqueNowToken();
  const baseUrl = text(process.env.ESTOQUENOW_BASE_URL || ESTOQUENOW_API).replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/client?page=1&per_page=${SAMPLE_SIZE}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) throw new Error(`ESTOQUENOW_CLIENTS_${response.status}`);

  const sample = extractList(payload).slice(0, SAMPLE_SIZE);
  if (sample.length !== SAMPLE_SIZE) throw new Error(`EXPECTED_5_GOT_${sample.length}`);
  return sample;
}

async function getLocaCameraStoreId(): Promise<string> {
  const availableStores = await db.select({ id: stores.id, name: stores.name }).from(stores);
  const matches = availableStores.filter((store) =>
    store.name.toLocaleLowerCase("pt-BR").includes("locacamera"),
  );

  if (matches.length === 1) return matches[0]!.id;
  if (availableStores.length === 1) return availableStores[0]!.id;
  throw new Error("STORE_AMBIGUOUS");
}

function sourceId(record: SourceRecord): string {
  return text(record.id ?? record.client_id ?? record.customer_id);
}

function sourceFullName(record: SourceRecord, legacyId: string): string {
  return (
    text(
      record.name ??
        record.client_name ??
        record.full_name ??
        record.corporate_name ??
        record.company_name,
    ) || `Cliente EstoqueNow ${legacyId}`
  );
}

export async function GET(request: NextRequest) {
  const expectedToken = text(process.env.MIGRATION_SAMPLE_TOKEN);
  const receivedToken = text(request.nextUrl.searchParams.get("token"));

  if (!expectedToken || !receivedToken || !safeTokenMatch(receivedToken, expectedToken)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const [sample, storeId] = await Promise.all([
      fetchCustomerSample(),
      getLocaCameraStoreId(),
    ]);

    const counters = await db.transaction(async (tx) => {
      let created = 0;
      let updated = 0;
      const legacyIds: string[] = [];

      for (const raw of sample) {
        const legacyId = sourceId(raw);
        if (!legacyId) throw new Error("SOURCE_ID_MISSING");

        const cpfCnpj = digits(
          raw.cpf_cnpj ?? raw.cnpj_cpf ?? raw.document ?? raw.cpf ?? raw.cnpj,
        ).slice(0, 32) || null;
        const fullName = sourceFullName(raw, legacyId);
        const { firstName, lastName } = splitName(fullName);
        const socialName = nullableText(raw.social_name);
        const isBusiness = cpfCnpj?.length === 14 || Boolean(text(raw.corporate_name ?? raw.company_name));
        const customerType = isBusiness ? "business" as const : "individual" as const;
        const originalEmail = validEmail(raw.email ?? raw.email_address ?? raw.mail);

        const [existingProfile] = await tx
          .select({ customerId: locacameraCustomerProfiles.customerId })
          .from(locacameraCustomerProfiles)
          .where(
            and(
              eq(locacameraCustomerProfiles.storeId, storeId),
              eq(locacameraCustomerProfiles.estoqueNowClientId, legacyId),
            ),
          )
          .limit(1);

        let customerId = existingProfile?.customerId ?? null;

        if (!customerId && originalEmail) {
          const [customerWithEmail] = await tx
            .select({ id: customers.id })
            .from(customers)
            .where(and(eq(customers.storeId, storeId), eq(customers.email, originalEmail)))
            .limit(1);

          if (customerWithEmail) {
            const [linkedProfile] = await tx
              .select({ estoqueNowClientId: locacameraCustomerProfiles.estoqueNowClientId })
              .from(locacameraCustomerProfiles)
              .where(eq(locacameraCustomerProfiles.customerId, customerWithEmail.id))
              .limit(1);

            if (!linkedProfile || linkedProfile.estoqueNowClientId === legacyId) {
              customerId = customerWithEmail.id;
            }
          }
        }

        customerId ??= stableCustomerId(storeId, legacyId);

        const [existingCustomer] = await tx
          .select({ id: customers.id })
          .from(customers)
          .where(and(eq(customers.id, customerId), eq(customers.storeId, storeId)))
          .limit(1);

        let email = originalEmail || `estoquenow-${legacyId.replace(/[^a-zA-Z0-9]/g, "-")}@migration.locacamera.invalid`;
        if (!existingCustomer) {
          const [emailCollision] = await tx
            .select({ id: customers.id })
            .from(customers)
            .where(and(eq(customers.storeId, storeId), eq(customers.email, email)))
            .limit(1);
          if (emailCollision && emailCollision.id !== customerId) {
            email = `estoquenow-${legacyId.replace(/[^a-zA-Z0-9]/g, "-")}@migration.locacamera.invalid`;
          }
        }

        const street = text(raw.address_street ?? raw.street);
        const addressNumber = text(raw.address_number ?? raw.number);
        const addressComplement = text(raw.address_complement ?? raw.complement);
        const neighborhood = text(raw.address_neighborhood ?? raw.neighborhood);
        const compactAddress = [street, addressNumber, addressComplement, neighborhood]
          .filter(Boolean)
          .join(", ") || null;
        const city = nullableText(raw.address_city_name ?? raw.city_name ?? raw.address_city ?? raw.city);
        const postalCode = digits(raw.address_zipcode ?? raw.zipcode ?? raw.zip_code).slice(0, 20) || null;
        const phone = nullableText(raw.phone ?? raw.cellphone ?? raw.cell_phone ?? raw.mobile ?? raw.telephone, 50);
        const registeredAt = parseDate(raw.created_at ?? raw.createdAt ?? raw.date_created);
        const notes = nullableText(raw.observations ?? raw.observation ?? raw.notes ?? raw.comments, 4_000);
        const now = new Date();

        if (existingCustomer) {
          await tx
            .update(customers)
            .set({
              customerType,
              email,
              firstName,
              lastName,
              companyName: isBusiness ? (socialName || fullName) : null,
              companyNumber: null,
              companyNumberScheme: null,
              vatNumber: null,
              phone,
              address: compactAddress,
              city,
              postalCode,
              country: "BR",
              notes,
              updatedAt: now,
            })
            .where(eq(customers.id, customerId));
          updated += 1;
        } else {
          await tx.insert(customers).values({
            id: customerId,
            storeId,
            customerType,
            email,
            firstName,
            lastName,
            companyName: isBusiness ? (socialName || fullName) : null,
            companyNumber: null,
            companyNumberScheme: null,
            vatNumber: null,
            phone,
            address: compactAddress,
            city,
            postalCode,
            country: "BR",
            notes,
            createdAt: registeredAt ?? now,
            updatedAt: now,
          });
          created += 1;
        }

        const profileValues = {
          storeId,
          estoqueNowClientId: legacyId,
          cpfCnpj,
          rgNumber: nullableText(raw.rg_number, 64),
          rgIssueAgency: nullableText(raw.rg_issue_agency, 64),
          socialName,
          stateRegistration: nullableText(raw.state_registration, 64),
          municipalRegistration: nullableText(raw.municipal_registration, 64),
          birthday: parseDate(raw.birthday ?? raw.birthdate ?? raw.birth_date),
          gender: nullableText(raw.gender ?? raw.gender_id ?? raw.sex, 32),
          genderName: nullableText(raw.gender_name ?? raw.sex_name, 64),
          isForeigner: nullableBoolean(raw.is_foreigner),
          phoneCountryCode: nullableText(raw.code_phone ?? raw.phone_country_code, 8),
          phone2: nullableText(raw.phone2, 50),
          phone2CountryCode: nullableText(raw.code_phone2 ?? raw.phone2_country_code, 8),
          phoneType: nullableText(raw.phone_type, 32),
          phone2Type: nullableText(raw.phone2_type, 32),
          addressType: nullableText(raw.address_type, 32),
          neighborhood: neighborhood || null,
          state: nullableText(raw.address_state ?? raw.state, 64),
          addressNumber: addressNumber || null,
          addressComplement: addressComplement || null,
          statusId: nullableText(raw.status_id, 64),
          statusName: nullableText(raw.status_name, 128),
          isEnabled: nullableBoolean(raw.is_enabled),
          isBlocked: nullableBoolean(raw.is_blocked),
          standardDiscount: decimalText(raw.standard_discount),
          customerProfile: nullableText(raw.profile, 255),
          customerProfileName: nullableText(raw.profile_name, 255),
          userContact: nullableText(raw.user_contact, 255),
          trafficSourceId: nullableText(raw.indicatortrafficsource_id, 64),
          typeName: nullableText(raw.type_name, 64),
          instagram: nullableText(raw.instagram_username ?? raw.instagram, 255)?.replace(/^@/, "") ?? null,
          acquisitionSource: nullableText(
            raw.indicatortrafficsource_name ?? raw.traffic_source_name ?? raw.acquisition_source ?? raw.origin,
            255,
          ),
          registeredAt,
          backupContact: nullableText(raw.phone2 ?? raw.user_contact, 255),
          legacyData: raw,
          updatedAt: now,
        };

        const [profileForCustomer] = await tx
          .select({ customerId: locacameraCustomerProfiles.customerId })
          .from(locacameraCustomerProfiles)
          .where(eq(locacameraCustomerProfiles.customerId, customerId))
          .limit(1);

        if (profileForCustomer) {
          await tx
            .update(locacameraCustomerProfiles)
            .set(profileValues)
            .where(eq(locacameraCustomerProfiles.customerId, customerId));
        } else {
          await tx.insert(locacameraCustomerProfiles).values({
            customerId,
            ...profileValues,
            createdAt: now,
          });
        }

        legacyIds.push(legacyId);
      }

      return { created, updated, legacyIds };
    });

    const linkedRows = await db
      .select({ customerId: locacameraCustomerProfiles.customerId })
      .from(locacameraCustomerProfiles)
      .innerJoin(customers, eq(customers.id, locacameraCustomerProfiles.customerId))
      .where(
        and(
          eq(locacameraCustomerProfiles.storeId, storeId),
          inArray(locacameraCustomerProfiles.estoqueNowClientId, counters.legacyIds),
        ),
      );

    if (linkedRows.length !== SAMPLE_SIZE) {
      return NextResponse.json(
        { ok: false, error: "VERIFICATION_FAILED", linked: linkedRows.length },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      fetched: SAMPLE_SIZE,
      created: counters.created,
      updated: counters.updated,
      linked: linkedRows.length,
      legacyPreserved: SAMPLE_SIZE,
      productsImported: 0,
      piiReturned: false,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message.replace(/[^A-Z0-9_]/gi, "_").slice(0, 80) : "IMPORT_FAILED";
    return NextResponse.json({ ok: false, error: code }, { status: 500 });
  }
}
