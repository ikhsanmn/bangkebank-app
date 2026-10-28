import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "@/lib/env";
import { DEMO_TENANT_ID, schema } from "@/lib/db/schema";

// Every connection runs as bangkebank_app, the role the row-level security
// policies in drizzle/0005 bind (no superuser, no BYPASSRLS). It is set in the
// connection's startup options, so no query can ever run before it applies.
export const APP_ROLE = "bangkebank_app";

const globalForDb = globalThis as typeof globalThis & {
  bangkeBankPool?: Pool;
  bangkeBankAuthPool?: Pool;
};

function createPool(settings: Record<string, string>) {
  return new Pool({
    connectionString: env.DATABASE_URL,
    options: Object.entries(settings)
      .map(([name, value]) => `-c ${name}=${value}`)
      .join(" "),
    // TLS is opt-in via DATABASE_SSL and always verifies the server certificate.
    ssl: env.DATABASE_SSL ? { rejectUnauthorized: true } : false,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000
  });
}

// The main pool sets no tenant: queries see tenant rows only inside
// withTenant (lib/server/tenant.ts), which sets it per transaction.
export const pool = globalForDb.bangkeBankPool ?? createPool({ role: APP_ROLE });

// better-auth's own pool. Sign-in, sign-up and session lookups serve the web
// app, which is the demo tenant, so this pool is pinned to it for the life of
// each connection. better-auth can't see other tenants' customers at all.
export const authPool =
  globalForDb.bangkeBankAuthPool ?? createPool({ role: APP_ROLE, "app.tenant_id": DEMO_TENANT_ID });

if (env.NODE_ENV !== "production") {
  globalForDb.bangkeBankPool = pool;
  globalForDb.bangkeBankAuthPool = authPool;
}

export const db = drizzle(pool, { schema });
export const authDb = drizzle(authPool, { schema });
