import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { CORE_POSTGRES_TABLES, pgDb } from "@louez/db/postgres";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await pgDb.execute<{ count: number }>(sql`
      select count(*)::int as count
      from information_schema.tables
      where table_schema = 'public'
        and table_name in (${sql.join(
          CORE_POSTGRES_TABLES.map((table) => sql`${table}`),
          sql`, `,
        )})
    `);

    const count = Number(rows[0]?.count ?? 0);
    const expected = CORE_POSTGRES_TABLES.length;

    if (count !== expected) {
      return NextResponse.json(
        {
          status: "unhealthy",
          database: "supabase",
          reason: "core schema incomplete",
          tables: { found: count, expected },
          timestamp: new Date().toISOString(),
        },
        { status: 503 },
      );
    }

    return NextResponse.json({
      status: "healthy",
      database: "supabase",
      tables: { found: count, expected },
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      {
        status: "unhealthy",
        database: "supabase",
        reason: "database unreachable",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
