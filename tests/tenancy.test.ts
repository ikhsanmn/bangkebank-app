import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { auth } from "@/lib/auth";
import {
  auditEvents,
  bankTransactions,
  DEMO_TENANT_ID,
  ledgerEntries,
  ledgerPostings,
  transfers,
  users
} from "@/lib/db/schema";
import { createTransferForUser, TransferError } from "@/lib/server/banking";
import { hashNik } from "@/lib/server/pii";

// @ts-expect-error -- plain ESM script without type declarations
import { hashNikValue } from "../scripts/db/encrypt-legacy-pii.mjs";
import { adminDb, createSeededUser, createTenant, dbError } from "./helpers";

const EXAMPLE_NIK = "1971015708900001";

describe("tenancy", () => {
  it("writes every row of a user's workspace into the user's tenant", async () => {
    const tenantId = await createTenant("workspace");
    const user = await createSeededUser("workspace", tenantId);

    expect(user.accounts.every((account) => account.tenantId === tenantId)).toBe(true);
    const lines = await adminDb.select().from(bankTransactions).where(eq(bankTransactions.userId, user.id));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((line) => line.tenantId === tenantId)).toBe(true);
  });

  it("keeps each tenant's ledger balanced on its own", async () => {
    const tenantId = await createTenant("balanced");
    const alice = await createSeededUser("balanced-a", tenantId);
    const bob = await createSeededUser("balanced-b", tenantId);
    await createTransferForUser(alice.tenantId, alice.id, {
      senderBankAccountId: alice.accounts[0].id,
      recipientEmail: bob.email,
      recipientShareableId: bob.accounts[0].shareableId,
      amount: 125_000
    });

    const result = await adminDb.execute<{ tenantId: string; total: string }>(sql`
      select "tenantId", sum("amount")::text as total from "ledgerPosting" group by "tenantId"
    `);
    expect(result.rows.length).toBeGreaterThanOrEqual(2);
    expect(result.rows.every((row) => row.total === "0")).toBe(true);
  });

  it("treats another tenant's account as unknown when transferring", async () => {
    const tenantA = await createTenant("sender");
    const tenantB = await createTenant("receiver");
    const alice = await createSeededUser("cross-a", tenantA);
    const bob = await createSeededUser("cross-b", tenantB);

    const attempt = createTransferForUser(alice.tenantId, alice.id, {
      senderBankAccountId: alice.accounts[0].id,
      recipientEmail: bob.email,
      recipientShareableId: bob.accounts[0].shareableId,
      amount: 10_000
    });
    await expect(attempt).rejects.toThrow(TransferError);
    await expect(attempt).rejects.toThrow(/No account matches/);

    const rejected = await adminDb
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.entityId, alice.accounts[0].id));
    expect(rejected.some((event) => event.action === "transfer.rejected" && event.tenantId === tenantA)).toBe(true);
  });

  // These bypass the service layer: the composite foreign keys must refuse.
  it("refuses ledger rows that reference another tenant's account or entry", async () => {
    const tenantB = await createTenant("intruder");
    const victim = await createSeededUser("victim");
    const intruder = await createSeededUser("intruder", tenantB);

    const postToVictim = adminDb.transaction(async (tx) => {
      const entryId = crypto.randomUUID();
      await tx.insert(ledgerEntries).values({
        id: entryId,
        tenantId: tenantB,
        kind: "external_payment",
        description: "reach across",
        occurredAt: new Date()
      });
      await tx.insert(ledgerPostings).values([
        { id: crypto.randomUUID(), tenantId: tenantB, entryId, bankAccountId: victim.accounts[0].id, amount: -1 },
        { id: crypto.randomUUID(), tenantId: tenantB, entryId, bankAccountId: intruder.accounts[0].id, amount: 1 }
      ]);
    });
    expect(await dbError(postToVictim)).toMatch(/ledger_posting_bank_fk/);

    const [victimEntry] = await adminDb
      .select({ id: ledgerEntries.id })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.tenantId, DEMO_TENANT_ID))
      .limit(1);
    const attachToVictimEntry = adminDb.insert(ledgerPostings).values({
      id: crypto.randomUUID(),
      tenantId: tenantB,
      entryId: victimEntry.id,
      systemAccount: "EXTERNAL_CLEARING",
      amount: 1
    });
    expect(await dbError(attachToVictimEntry)).toMatch(/ledger_posting_entry_fk/);
  });

  it("refuses transfers and statement lines that mix tenants", async () => {
    const tenantB = await createTenant("mixed");
    const alice = await createSeededUser("mixed-a");
    const bob = await createSeededUser("mixed-b", tenantB);

    const crossTransfer = adminDb.insert(transfers).values({
      id: crypto.randomUUID(),
      tenantId: DEMO_TENANT_ID,
      senderUserId: alice.id,
      senderBankAccountId: alice.accounts[0].id,
      receiverUserId: bob.id,
      receiverBankAccountId: bob.accounts[0].id,
      recipientName: "Bob",
      recipientEmail: bob.email,
      recipientShareableId: bob.accounts[0].shareableId,
      amount: 1,
      status: "failed"
    });
    expect(await dbError(crossTransfer)).toMatch(/transfer_receiver_(user|bank)_fk/);

    const foreignLine = adminDb.insert(bankTransactions).values({
      id: crypto.randomUUID(),
      tenantId: tenantB,
      userId: bob.id,
      bankAccountId: alice.accounts[0].id,
      name: "Not yours",
      amount: 1,
      direction: "credit",
      status: "Completed",
      channel: "Test",
      category: "Test",
      source: "Test",
      occurredAt: new Date()
    });
    expect(await dbError(foreignLine)).toMatch(/bank_transaction_bank_fk/);
  });

  it("scopes email and NIK uniqueness to the tenant, exempting the demo tenant's NIKs", async () => {
    const tenantA = await createTenant("unique-a");
    const tenantB = await createTenant("unique-b");
    const email = `same-${crypto.randomUUID().slice(0, 8)}@example.test`;
    const nikHash = hashNik(EXAMPLE_NIK);
    const row = (tenantId: string, overrides: Partial<typeof users.$inferInsert> = {}) => ({
      id: crypto.randomUUID(),
      tenantId,
      name: "Same Person",
      email,
      nikHash,
      ...overrides
    });

    await adminDb.insert(users).values(row(tenantA));
    await adminDb.insert(users).values(row(tenantB));
    expect(await dbError(adminDb.insert(users).values(row(tenantA)))).toMatch(/user_tenant_email_key/);
    expect(
      await dbError(adminDb.insert(users).values(row(tenantA, { email: `other-${email}` })))
    ).toMatch(/user_tenant_nik_key/);

    await adminDb.insert(users).values(row(DEMO_TENANT_ID, { email: `demo1-${email}` }));
    await adminDb.insert(users).values(row(DEMO_TENANT_ID, { email: `demo2-${email}` }));
  });

  it("derives the NIK hash identically in the app and the backfill script", () => {
    expect(hashNikValue(EXAMPLE_NIK, process.env.PII_ENCRYPTION_KEY)).toBe(hashNik(EXAMPLE_NIK));
    expect(hashNik(EXAMPLE_NIK)).not.toBe(hashNik("1971015708900002"));
  });

  it("puts web sign-ups in the demo tenant and ignores a client-sent tenant", async () => {
    const email = `signup-${crypto.randomUUID().slice(0, 8)}@example.test`;
    const otherTenant = await createTenant("forged");
    await auth.api.signUpEmail({
      body: {
        email,
        password: "correct-horse-battery",
        name: "Sign Up",
        firstName: "Sign",
        lastName: "Up",
        address1: "Jl. Contoh No. 12",
        city: "Medan",
        province: "Sumatera Utara",
        postalCode: "20111",
        dateOfBirth: "1990-08-17",
        nik: EXAMPLE_NIK,
        tenantId: otherTenant
        // Not part of the typed body: a forged field the server must ignore.
      } as Record<string, unknown> as never
    });

    const [created] = await adminDb.select().from(users).where(eq(users.email, email));
    expect(created.tenantId).toBe(DEMO_TENANT_ID);
    expect(created.nikHash).toBe(hashNik(EXAMPLE_NIK));
    expect(created.nik).not.toContain(EXAMPLE_NIK);

    const [signedUp] = await adminDb
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.actorUserId, created.id));
    expect(signedUp.tenantId).toBe(DEMO_TENANT_ID);
  });
});
