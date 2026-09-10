import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { authorizeStaff } from "../_shared/authorize-staff.ts";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });

  const body = await req.json().catch(() => ({}));
  const storeId = String(body?.storeId ?? "").trim();
  const limit = Math.min(200, Math.max(1, Math.trunc(Number(body?.limit ?? 50))));
  const from = body?.from ? new Date(body.from) : null;
  const to = body?.to ? new Date(body.to) : null;

  if (!storeId) return Response.json({ error: "storeId_required" }, { status: 400 });

  const auth = await authorizeStaff(req, storeId);
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

  let query = auth.admin
    .from("reservations")
    .select("id,number,status,payment_status,fiscal_status,start_date,end_date,total_amount,source,notes,pickup_at,returned_at,customer:customers(id,first_name,last_name,company_name,phone,email),items:reservation_items(id,quantity,unit_price,total_price,product:products(id,name),units:reservation_item_units(id,product_unit_id,identifier_snapshot))")
    .eq("store_id", storeId)
    .order("start_date", { ascending: true })
    .limit(limit);

  if (from && !Number.isNaN(from.getTime())) query = query.gte("end_date", from.toISOString());
  if (to && !Number.isNaN(to.getTime())) query = query.lte("start_date", to.toISOString());

  const { data, error } = await query;
  if (error) {
    console.error("management_reservations_query", error);
    return Response.json({ error: "reservations_failed" }, { status: 500 });
  }

  return Response.json({ reservations: data ?? [] });
});
