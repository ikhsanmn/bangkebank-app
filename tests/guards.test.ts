import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { auditEvents, bankAccounts, ledgerEntries, ledgerPostings, transfers } from "@/lib/db/schema";
import { createTransferForUser } from "@/lib/server/banking";

import { createSeededUser, dbError } from "./helpers";

// These bypass the service layer on purpose: the database itself must refuse.
describe("database guards", () => {
  it("refuses to commit an unbalanced ledger entry", async () => {
    const user = await createSeededUser("unbalanced");
    const attempt = db.transaction(async (tx) => {
      const entryId = crypto.randomUUID();
      await tx.insert(ledgerEntries).values({
        id: entryId,
        tenantId: user.tenantId,
        kind: "sandbox_funding",
        description: "free money",
        occurredAt: new Date()
      });
      await tx.insert(ledgerPostings).values({
        id: crypto.randomUUID(),
        tenantId: user.tenantId,
        entryId,
        bankAccountId: user.accounts[0].id,
        amount: 1_000_000
      });
    });

    expect(await dbError(attempt)).toMatch(/unbalanced/);
    const [after] = await db.select().from(bankAccounts).where(eq(bankAccounts.id, user.accounts[0].id));
    expect(after.currentBalance).toBe(user.accounts[0].currentBalance);
  });

  it("refuses direct balance edits and non-zero opening balances", async () => {
    const user = await createSeededUser("direct");
    const target = user.accounts[0];

    expect(
      await dbError(db.update(bankAccounts).set({ currentBalance: 1 }).where(eq(bankAccounts.id, target.id)))
    ).toMatch(/only through ledger postings/);
    expect(
      await dbError(
        db.insert(bankAccounts).values({
          id: crypto.randomUUID(),
          tenantId: user.tenantId,
          userId: user.id,
          institution: "X",
          name: "Minted",
          subtype: "Savings",
          mask: "0000",
          shareableId: `BB-${crypto.randomUUID().slice(0, 8)}`,
          currentBalance: 5,
          availableBalance: 5
        })
      )
    ).toMatch(/zero balance/);
    // Other columns stay editable.
    await db.update(bankAccounts).set({ name: "Renamed" }).where(eq(bankAccounts.id, target.id));
  });

  it("refuses an overdraft even when written straight to the ledger", async () => {
    const user = await createSeededUser("overdraft");
    const target = user.accounts[0];
    const attempt = db.transaction(async (tx) => {
      const entryId = crypto.randomUUID();
      await tx.insert(ledgerEntries).values({
        id: entryId,
        tenantId: user.tenantId,
        kind: "external_payment",
        description: "too much",
        occurredAt: new Date()
      });
      await tx.insert(ledgerPostings).values([
        { id: crypto.randomUUID(), tenantId: user.tenantId, entryId, bankAccountId: target.id, amount: -(target.currentBalance + 1) },
        { id: crypto.randomUUID(), tenantId: user.tenantId, entryId, systemAccount: "EXTERNAL_CLEARING", amount: target.currentBalance + 1 }
      ]);
    });

    expect(await dbError(attempt)).toMatch(/bank_account_available_non_negative/);
  });

  it("keeps ledger and audit rows append-only", async () => {
    await createSeededUser("immutable");
    await db.insert(auditEvents).values({ id: crypto.randomUUID(), action: "test", outcome: "success" });

    for (const attempt of [
      db.update(ledgerPostings).set({ amount: 1 }),
      db.delete(ledgerEntries),
      db.execute(sql`truncate "ledgerPosting" cascade`),
      db.update(auditEvents).set({ action: "edited" }),
      db.delete(auditEvents)
    ]) {
      expect(await dbError(attempt)).toMatch(/append-only/);
    }
  });

  it("only allows pending -> settled | failed transfer transitions", async () => {
    const alice = await createSeededUser("states");
    const bob = await createSeededUser("states-bob");
    const { transfer } = await createTransferForUser(alice.id, {
      senderBankAccountId: alice.accounts[0].id,
      recipientEmail: bob.email,
      recipientShareableId: bob.accounts[0].shareableId,
      amount: 5_000
    });
    expect(transfer.status).toBe("settled");

    const byId = eq(transfers.id, transfer.id);
    expect(await dbError(db.update(transfers).set({ status: "failed" }).where(byId))).toMatch(
      /illegal transfer status change settled -> failed/
    );
    expect(
      await dbError(db.update(transfers).set({ status: "pending", entryId: null }).where(byId))
    ).toMatch(/illegal transfer status change settled -> pending/);
    expect(
      await dbError(db.insert(transfers).values({ ...transfer, id: crypto.randomUUID(), idempotencyKey: null }))
    ).toMatch(/start pending/);
  });
});
