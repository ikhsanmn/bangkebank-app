import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { bankAccounts, DEMO_TENANT_ID, tenants, users } from "@/lib/db/schema";
import { seedUserWorkspace } from "@/lib/server/banking";
import { withTenant } from "@/lib/server/tenant";

import { adminDb } from "./admin-db";

export { adminDb };

// A user with the standard seeded workspace, created directly in the database
// as the app role (sign-up itself goes through better-auth). Assertions read
// through adminDb, which sees every tenant.
export async function createSeededUser(
  label = "user",
  tenantId = DEMO_TENANT_ID,
  email = `${label}-${crypto.randomUUID().slice(0, 8)}@example.test`
) {
  const id = crypto.randomUUID();
  await withTenant(tenantId, (tx) =>
    tx.insert(users).values({ id, tenantId, name: `${label} test`, email })
  );
  await seedUserWorkspace(tenantId, id);
  const accounts = await adminDb
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.userId, id))
    .orderBy(bankAccounts.createdAt, bankAccounts.name);
  return { id, tenantId, email, accounts };
}

export async function createTenant(label = "fintech") {
  const id = `tnt_${crypto.randomUUID().slice(0, 8)}`;
  await db.insert(tenants).values({ id, slug: `${label}-${id.slice(4)}`, name: `${label} test` });
  return id;
}

export async function balanceOf(bankAccountId: string) {
  const [row] = await adminDb
    .select({ current: bankAccounts.currentBalance, available: bankAccounts.availableBalance })
    .from(bankAccounts)
    .where(eq(bankAccounts.id, bankAccountId));
  return row;
}

export async function count(table: string, where = "true") {
  const result = await adminDb.execute<{ n: string }>(
    sql.raw(`select count(*)::text as n from "${table}" where ${where}`)
  );
  return Number(result.rows[0].n);
}

// The Postgres message of a rejected query; Drizzle keeps it on `cause`.
export async function dbError(attempt: Promise<unknown>) {
  try {
    await attempt;
  } catch (error) {
    const { message, cause } = error as { message: string; cause?: { message?: string } };
    return cause?.message ?? message;
  }
  throw new Error("Expected the query to be rejected.");
}
