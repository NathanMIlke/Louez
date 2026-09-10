import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./postgres-schema";

const connectionString = process.env.SUPABASE_DATABASE_URL;

if (!connectionString) {
  throw new Error("SUPABASE_DATABASE_URL is required");
}

type PostgresClient = ReturnType<typeof postgres>;

const globalForPostgres = globalThis as unknown as {
  locaCameraPostgresClient: PostgresClient | undefined;
};

const client =
  globalForPostgres.locaCameraPostgresClient ??
  postgres(connectionString, {
    prepare: false,
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPostgres.locaCameraPostgresClient = client;
}

export const pgDb = drizzle({ client, schema });
export type PostgresDatabase = typeof pgDb;
export * from "./postgres-schema";
