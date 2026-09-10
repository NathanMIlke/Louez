import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function createAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function authorizeStaff(req: Request, storeId: string) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return { ok: false as const, status: 401, error: "unauthorized" };

  const admin = createAdminClient();
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  const authUser = authData?.user;
  if (authError || !authUser?.email) {
    return { ok: false as const, status: 401, error: "unauthorized" };
  }

  const { data: internalUser } = await admin
    .from("users")
    .select("id,email")
    .eq("email", authUser.email)
    .maybeSingle();

  if (!internalUser) {
    return { ok: false as const, status: 403, error: "staff_not_authorized" };
  }

  const [{ data: membership }, { data: storeOwner }] = await Promise.all([
    admin
      .from("store_members")
      .select("role")
      .eq("store_id", storeId)
      .eq("user_id", internalUser.id)
      .maybeSingle(),
    admin.from("stores").select("user_id").eq("id", storeId).maybeSingle(),
  ]);

  if (!membership && storeOwner?.user_id !== internalUser.id) {
    return { ok: false as const, status: 403, error: "staff_not_authorized" };
  }

  return {
    ok: true as const,
    admin,
    authUser,
    internalUser,
    role: membership?.role ?? "owner",
  };
}
