import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { bankAccounts, DEMO_TENANT_ID, tenants, users } from "@/lib/db/schema";
import { seedUserWorkspace } from "@/lib/server/banking";

// A user with the standard seeded workspace, created directly in the database
// (sign-up itself goes through better-auth and is covered end to end).
export async function createSeededUser(label = "user", tenantId = DEMO_TENANT_ID) {
  const id = crypto.randomUUID();
  const email = `${label}-${id.slice(0, 8)}@example.test`;
  await db.insert(users).values({ id, tenantId, name: `${label} test`, email });
  await seedUserWorkspace(id);
  const accounts = await db
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
  const [row] = await db
    .select({ current: bankAccounts.currentBalance, available: bankAccounts.availableBalance })
    .from(bankAccounts)
    .where(eq(bankAccounts.id, bankAccountId));
  return row;
}

export async function count(table: string, where = "true") {
  const result = await db.execute<{ n: string }>(
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
