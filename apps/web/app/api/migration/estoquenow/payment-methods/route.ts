import { NextResponse } from "next/server";

import { getCurrentStore } from "@/lib/store-context";

const DEFAULT_ESTOQUENOW_BASE_URL = "https://api.estoquenow.com.br/v1";
const PAYMENT_METHOD_CACHE_MS = 10 * 60 * 1000;

type EstoqueNowPaymentMethod = {
  id: number | string;
  name: string;
  type?: string | null;
  application?: string | null;
  can_edit?: boolean | number | null;
  payment_service_id?: number | string | null;
};

let paymentMethodCache:
  | {
      expiresAt: number;
      methods: Array<{
        id: string;
        name: string;
        type: string | null;
        application: string | null;
        canEdit: boolean | null;
        paymentServiceId: string | null;
      }>;
    }
  | null = null;

function text(value: unknown): string {
  return String(value ?? "").trim();
}

async function getEstoqueNowToken(baseUrl: string) {
  const clientId = text(process.env.ESTOQUENOW_CLIENT_ID);
  const clientSecret = text(process.env.ESTOQUENOW_CLIENT_SECRET);

  if (!clientId || !clientSecret) {
    throw new Error("ESTOQUENOW_CREDENTIALS_MISSING");
  }

  const response = await fetch(`${baseUrl}/oauth2/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });

  const data = await response.json().catch(() => null);
  const token = text(data?.access_token ?? data?.token);

  if (!response.ok || !token) {
    throw new Error(`ESTOQUENOW_AUTH_FAILED_${response.status}`);
  }

  return token;
}

async function listPaymentMethods() {
  if (paymentMethodCache && paymentMethodCache.expiresAt > Date.now()) {
    return paymentMethodCache.methods;
  }

  const baseUrl = text(process.env.ESTOQUENOW_BASE_URL || DEFAULT_ESTOQUENOW_BASE_URL).replace(
    /\/+$/,
    "",
  );
  const token = await getEstoqueNowToken(baseUrl);

  const response = await fetch(`${baseUrl}/payment_method?per_page=all`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`ESTOQUENOW_PAYMENT_METHODS_FAILED_${response.status}`);
  }

  const rawMethods = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  const methods = (rawMethods as EstoqueNowPaymentMethod[])
    .map((method) => ({
      id: text(method.id),
      name: text(method.name),
      type: text(method.type) || null,
      application: text(method.application) || null,
      canEdit:
        method.can_edit === null || method.can_edit === undefined
          ? null
          : method.can_edit === true || method.can_edit === 1,
      paymentServiceId: text(method.payment_service_id) || null,
    }))
    .filter((method) => method.id && method.name);

  paymentMethodCache = {
    expiresAt: Date.now() + PAYMENT_METHOD_CACHE_MS,
    methods,
  };

  return methods;
}

export async function GET() {
  const store = await getCurrentStore();
  if (!store) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const methods = await listPaymentMethods();
    return NextResponse.json(
      { methods },
      {
        headers: {
          "Cache-Control": "private, max-age=300, stale-while-revalidate=900",
        },
      },
    );
  } catch (error) {
    console.error("[financeiro] Falha ao listar formas de pagamento do EstoqueNow", error);
    return NextResponse.json(
      { error: "Não foi possível carregar as formas de pagamento do EstoqueNow." },
      { status: 502 },
    );
  }
}
