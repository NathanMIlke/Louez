import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { authorizeStaff } from "../_shared/authorize-staff.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });

  const body = await req.json().catch(() => ({}));
  const storeId = String(body?.storeId ?? "").trim();
  const start = body?.start ? new Date(body.start) : null;
  const end = body?.end ? new Date(body.end) : null;
  const search = String(body?.search ?? "").trim();
  const limit = Math.min(500, Math.max(1, Math.trunc(Number(body?.limit ?? 100))));

  if (!storeId) return Response.json({ error: "storeId_required" }, { status: 400 });

  const auth = await authorizeStaff(req, storeId);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  let query = auth.admin
    .from("products")
    .select("id,name,description,price,deposit,quantity,track_units,status,is_visible,is_featured,tags,legacy_estoquenow_id")
    .eq("store_id", storeId)
    .eq("status", "active")
    .order("is_featured", { ascending: false })
    .order("name", { ascending: true })
    .limit(limit);

  if (search) query = query.ilike("name", `%${search.replaceAll("%", "")}%`);

  const { data: products, error: productsError } = await query;
  if (productsError) return Response.json({ error: "catalog_failed" }, { status: 500 });

  let availability: Record<string, { total_units: number; busy_units: number; available_units: number }> = {};
  if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end > start && products?.length) {
    const { data: rows, error: availabilityError } = await auth.admin.rpc("get_products_availability", {
      p_product_ids: products.map((product) => product.id),
      p_start: start.toISOString(),
      p_end: end.toISOString(),
      p_turnover_buffer_minutes: 0,
    });
    if (availabilityError) return Response.json({ error: "availability_failed" }, { status: 500 });
    availability = Object.fromEntries((rows ?? []).map((row: any) => [row.product_id, {
      total_units: Number(row.total_units ?? 0),
      busy_units: Number(row.busy_units ?? 0),
      available_units: Number(row.available_units ?? 0),
    }]));
  }

  return Response.json({
    products: (products ?? []).map((product) => ({ ...product, availability: availability[product.id] ?? null })),
  });
});
