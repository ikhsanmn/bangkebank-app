import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { bankTransactions, DEMO_TENANT_ID, ledgerPostings } from "@/lib/db/schema";
import { findUnreconciledAccounts, getDashboardData } from "@/lib/server/banking";

import { adminDb, createSeededUser } from "./helpers";

describe("seeded workspace", () => {
  it("derives every balance from balanced ledger entries", async () => {
    const user = await createSeededUser("seed");
    const byName = Object.fromEntries(user.accounts.map((account) => [account.name, account]));

    // Opening deposits minus the seeded week of activity.
    expect(byName["Main Account"].currentBalance).toBe(18_500_000 - 87_500 - 200_000 - 45_000 - 349_000);
    expect(byName["Emergency Fund"].currentBalance).toBe(45_000_000 + 37_500);
    expect(byName["Business Wallet"].currentBalance).toBe(7_250_000 + 15_000_000 - 2_500_000);
    for (const account of user.accounts) {
      expect(account.availableBalance).toBe(account.currentBalance);
      expect(account.currency).toBe("IDR");
    }

    const unbalanced = await adminDb.execute(sql`
      select "entryId" from "ledgerPosting" group by "entryId" having sum("amount") <> 0
    `);
    expect(unbalanced.rows).toEqual([]);
    expect(await findUnreconciledAccounts(DEMO_TENANT_ID)).toEqual([]);
  });

  it("gives every statement line a ledger posting of the same signed amount", async () => {
    const user = await createSeededUser("lines");
    const lines = await adminDb
      .select({
        amount: bankTransactions.amount,
        direction: bankTransactions.direction,
        posted: ledgerPostings.amount
      })
      .from(bankTransactions)
      .innerJoin(
        ledgerPostings,
        sql`${ledgerPostings.entryId} = ${bankTransactions.entryId} and ${ledgerPostings.bankAccountId} = ${bankTransactions.bankAccountId}`
      )
      .where(eq(bankTransactions.userId, user.id));

    expect(lines).toHaveLength(10);
    for (const line of lines) {
      expect(line.posted).toBe(line.direction === "credit" ? line.amount : -line.amount);
    }
  });

  it("is idempotent", async () => {
    const user = await createSeededUser("again");
    const { seedUserWorkspace } = await import("@/lib/server/banking");
    await seedUserWorkspace(user.tenantId, user.id);
    const dashboard = await getDashboardData(user.tenantId, user.id);
    expect(dashboard.accounts).toHaveLength(3);
  });

  it("reports whole-rupiah dashboard figures", async () => {
    const user = await createSeededUser("dash");
    const dashboard = await getDashboardData(user.tenantId, user.id);
    const total = user.accounts.reduce((sum, account) => sum + account.currentBalance, 0);

    expect(dashboard.totals.totalBalance).toBe(total);
    expect(dashboard.dailyNetFlow).toHaveLength(7);
    expect(dashboard.categoryBreakdown[0]).toEqual({ label: "Housing", value: 2_500_000 });
    const weekNet = dashboard.dailyNetFlow.reduce((sum, day) => sum + day.value, 0);
    expect(weekNet).toBe(15_000_000 - 87_500 - 200_000 - 2_500_000 - 45_000 - 349_000);
  });
});
