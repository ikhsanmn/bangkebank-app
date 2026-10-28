import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { bankAccounts, users } from "@/lib/db/schema";
import { seedUserWorkspace } from "@/lib/server/banking";

// A user with the standard seeded workspace, created directly in the database
// (sign-up itself goes through better-auth and is covered end to end).
export async function createSeededUser(label = "user") {
  const id = crypto.randomUUID();
  const email = `${label}-${id.slice(0, 8)}@example.test`;
  await db.insert(users).values({ id, name: `${label} test`, email });
  await seedUserWorkspace(id);
  const accounts = await db
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.userId, id))
    .orderBy(bankAccounts.createdAt, bankAccounts.name);
  return { id, email, accounts };
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
