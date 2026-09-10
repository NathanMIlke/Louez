import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { authorizeStaff } from "../_shared/authorize-staff.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const body = await req.json().catch(() => ({}));
  const storeId = String(body?.storeId ?? "").trim();
  const customers = body?.customers;

  if (!storeId) return json({ error: "storeId_required" }, 400);
  if (!Array.isArray(customers)) return json({ error: "customers_must_be_array" }, 400);
  if (customers.length > 10000) return json({ error: "too_many_customers" }, 400);

  const auth = await authorizeStaff(req, storeId);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (auth.role !== "owner") return json({ error: "owner_required" }, 403);

  const { data, error } = await auth.admin.rpc("import_customers_snapshot", {
    p_store_id: storeId,
    p_customers: customers,
  });

  if (error) {
    console.error("migration_import_customers", error);
    return json({ error: "customer_import_failed" }, 500);
  }

  return json({ ok: true, ...(data ?? {}) });
});
