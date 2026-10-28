import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@/lib/env";
import { schema } from "@/lib/db/schema";

const globalForDb = globalThis as typeof globalThis & {
  bangkeBankPool?: Pool;
};

function createPool() {
  return new Pool({
    connectionString: env.DATABASE_URL,
    // TLS is opt-in via DATABASE_SSL and always verifies the server certificate.
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: true } : false,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000
  });
}

export const pool = globalForDb.bangkeBankPool ?? createPool();

if (env.NODE_ENV !== "production") {
  globalForDb.bangkeBankPool = pool;
}

export const db = drizzle(pool, { schema });
