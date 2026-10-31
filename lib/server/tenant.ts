import { sql } from "drizzle-orm";

import { db } from "@/lib/db";

export type TenantTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// The only way to read or write tenant data. Runs `fn` in a transaction whose
// app.tenant_id is `tenantId`; the row-level security policies (drizzle/0005)
// hide every other tenant's rows and refuse writes into them. The setting is
// transaction-local, so it can't leak to the next user of a pooled connection.
export async function withTenant<T>(tenantId: string, fn: (tx: TenantTx) => Promise<T>) {
  if (!tenantId) {
    throw new Error("withTenant needs a tenant id.");
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}
