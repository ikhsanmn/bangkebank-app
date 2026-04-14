import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@/lib/env";
import { schema } from "@/lib/db/schema";

const globalForDb = globalThis as typeof globalThis & {
  bangkeBankPool?: Pool;
};

function createPool() {
  const useSsl =
    !env.DATABASE_URL.includes("localhost") &&
    !env.DATABASE_URL.includes("127.0.0.1");

  return new Pool({
    connectionString: env.DATABASE_URL,
    ssl: useSsl ? { rejectUnauthorized: false } : false
  });
}

export const pool = globalForDb.bangkeBankPool ?? createPool();

if (env.NODE_ENV !== "production") {
  globalForDb.bangkeBankPool = pool;
}

export const db = drizzle(pool, { schema });
