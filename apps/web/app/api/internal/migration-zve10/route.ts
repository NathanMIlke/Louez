import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (host !== "healthcheck.railway.app") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const token = process.env.MIGRATION_ADMIN_TOKEN;
  const port = process.env.PORT || "3000";
  if (!token) {
    return NextResponse.json({ error: "MIGRATION_ADMIN_TOKEN_MISSING" }, { status: 503 });
  }

  const response = await fetch(
    `http://127.0.0.1:${port}/api/admin/migration/equipment?query=ZV-E10`,
    {
      headers: { "x-migration-token": token },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    },
  );

  const body = await response.text();
  console.log(`[migration-zve10] status=${response.status} body=${body}`);

  return new NextResponse(body, {
    status: response.status,
    headers: { "content-type": response.headers.get("content-type") || "application/json" },
  });
}
