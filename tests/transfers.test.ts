import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { auditEvents, DEMO_TENANT_ID, ledgerEntries, transfers } from "@/lib/db/schema";
import {
  TransferError,
  createTransferForUser,
  findUnreconciledAccounts,
  listTransfersForUser
} from "@/lib/server/banking";

import { adminDb, balanceOf, count, createSeededUser } from "./helpers";

function account(user: Awaited<ReturnType<typeof createSeededUser>>, name: string) {
  const found = user.accounts.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`no ${name}`);
  return found;
}

describe("createTransferForUser", () => {
  it("settles a transfer as one balanced ledger entry", async () => {
    const alice = await createSeededUser("alice");
    const bob = await createSeededUser("bob");
    const from = account(alice, "Main Account");
    const to = account(bob, "Main Account");

    const { transfer, replayed } = await createTransferForUser(alice.tenantId, alice.id, {
      senderBankAccountId: from.id,
      recipientEmail: bob.email.toUpperCase(),
      recipientShareableId: to.shareableId,
      amount: 1_250_000
    });

    expect(replayed).toBe(false);
    expect(transfer.status).toBe("settled");
    expect(transfer.entryId).not.toBeNull();
    expect(transfer.completedAt).not.toBeNull();
    expect((await balanceOf(from.id)).current).toBe(from.currentBalance - 1_250_000);
    expect((await balanceOf(to.id)).current).toBe(to.currentBalance + 1_250_000);

    const [entry] = await adminDb.select().from(ledgerEntries).where(eq(ledgerEntries.id, transfer.entryId!));
    expect(entry.kind).toBe("transfer");
    expect(await count("ledgerPosting", `"entryId" = '${transfer.entryId}'`)).toBe(2);
    expect(await count("auditEvent", `"entityId" = '${transfer.id}' and "action" = 'transfer.settled'`)).toBe(1);
    expect(await findUnreconciledAccounts(DEMO_TENANT_ID)).toEqual([]);
  });

  it("lets exactly the affordable share of concurrent transfers through", async () => {
    const alice = await createSeededUser("race");
    const bob = await createSeededUser("race-bob");
    const from = account(alice, "Business Wallet");
    const to = account(bob, "Main Account");
    const share = Math.floor(from.availableBalance * 0.4);

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        createTransferForUser(alice.tenantId, alice.id, {
          senderBankAccountId: from.id,
          recipientEmail: bob.email,
          recipientShareableId: to.shareableId,
          amount: share
        })
      )
    );

    const statuses = results.map((result) => result.transfer.status);
    expect(statuses.filter((status) => status === "settled")).toHaveLength(2);
    expect(statuses.filter((status) => status === "failed")).toHaveLength(8);
    expect((await balanceOf(from.id)).current).toBe(from.availableBalance - 2 * share);
    expect((await balanceOf(to.id)).current).toBe(to.currentBalance + 2 * share);
    expect(
      await count("auditEvent", `"actorUserId" = '${alice.id}' and "action" = 'transfer.failed'`)
    ).toBe(8);
    expect(await findUnreconciledAccounts(DEMO_TENANT_ID)).toEqual([]);
  });

  it("never deadlocks with transfers racing in both directions", async () => {
    const alice = await createSeededUser("both");
    const bob = await createSeededUser("both-bob");
    const a = account(alice, "Main Account");
    const b = account(bob, "Main Account");
    const total = a.currentBalance + b.currentBalance;

    // Alternate directions and mix affordable with unaffordable amounts, so
    // settling and failed-recording transactions contend for the same rows.
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, index) => {
        const [from, fromUser, to, toUser] = index % 2 ? [a, alice, b, bob] : [b, bob, a, alice];
        return createTransferForUser(fromUser.tenantId, fromUser.id, {
          senderBankAccountId: from.id,
          recipientEmail: toUser.email,
          recipientShareableId: to.shareableId,
          amount: index % 3 === 0 ? 900_000_000 : 1_000_000
        });
      })
    );

    expect(results).toHaveLength(40);
    expect(results.filter((result) => result.transfer.status === "failed").length).toBeGreaterThanOrEqual(14);
    expect((await balanceOf(a.id)).current + (await balanceOf(b.id)).current).toBe(total);
    expect(await findUnreconciledAccounts(DEMO_TENANT_ID)).toEqual([]);
  });

  it("records an unaffordable transfer as failed without moving money", async () => {
    const alice = await createSeededUser("broke");
    const bob = await createSeededUser("broke-bob");
    const from = account(alice, "Main Account");
    const to = account(bob, "Main Account");

    const { transfer } = await createTransferForUser(alice.tenantId, alice.id, {
      senderBankAccountId: from.id,
      recipientEmail: bob.email,
      recipientShareableId: to.shareableId,
      amount: from.availableBalance + 1
    });

    expect(transfer.status).toBe("failed");
    expect(transfer.entryId).toBeNull();
    expect(transfer.failureReason).toMatch(/insufficient/i);
    expect((await balanceOf(from.id)).current).toBe(from.currentBalance);
    // The sender sees the failed attempt; the recipient does not.
    expect((await listTransfersForUser(alice.tenantId, alice.id)).map((row) => row.id)).toContain(transfer.id);
    expect((await listTransfersForUser(bob.tenantId, bob.id)).map((row) => row.id)).not.toContain(transfer.id);
  });

  it("returns the original outcome for a repeated idempotency key, even under a race", async () => {
    const alice = await createSeededUser("idem");
    const bob = await createSeededUser("idem-bob");
    const from = account(alice, "Main Account");
    const to = account(bob, "Main Account");
    const input = {
      senderBankAccountId: from.id,
      recipientEmail: bob.email,
      recipientShareableId: to.shareableId,
      amount: 100_000,
      idempotencyKey: crypto.randomUUID()
    };

    const results = await Promise.all([
      createTransferForUser(alice.tenantId, alice.id, input),
      createTransferForUser(alice.tenantId, alice.id, input),
      createTransferForUser(alice.tenantId, alice.id, input)
    ]);
    const replay = await createTransferForUser(alice.tenantId, alice.id, input);

    expect(new Set([...results, replay].map((result) => result.transfer.id)).size).toBe(1);
    expect(replay.replayed).toBe(true);
    expect((await balanceOf(from.id)).current).toBe(from.currentBalance - 100_000);
    expect(
      await adminDb
        .select()
        .from(transfers)
        .where(and(eq(transfers.senderUserId, alice.id), eq(transfers.idempotencyKey, input.idempotencyKey)))
    ).toHaveLength(1);
  });

  it.each([
    ["an unknown shareable ID", 404, (t: Ctx) => ({ recipientShareableId: "BB-NOPE0000", recipientEmail: t.bob.email })],
    ["a mismatched email", 422, (t: Ctx) => ({ recipientShareableId: t.to.shareableId, recipientEmail: "someone@else.test" })],
    ["the same account", 422, (t: Ctx) => ({ recipientShareableId: t.from.shareableId, recipientEmail: t.alice.email })]
  ])("rejects %s with %i and moves nothing", async (_label, status, build) => {
    const alice = await createSeededUser("reject");
    const bob = await createSeededUser("reject-bob");
    const ctx = { alice, bob, from: account(alice, "Main Account"), to: account(bob, "Main Account") };

    const attempt = createTransferForUser(alice.tenantId, alice.id, {
      senderBankAccountId: ctx.from.id,
      amount: 10_000,
      ...build(ctx)
    });

    await expect(attempt).rejects.toBeInstanceOf(TransferError);
    await expect(attempt).rejects.toMatchObject({ status });
    expect((await balanceOf(ctx.from.id)).current).toBe(ctx.from.currentBalance);
    expect(await count("transfer", `"senderUserId" = '${alice.id}'`)).toBe(0);
    const rejected = await adminDb
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.actorUserId, alice.id), eq(auditEvents.action, "transfer.rejected")));
    expect(rejected).toHaveLength(1);
  });

  it("refuses to send from someone else's account", async () => {
    const alice = await createSeededUser("thief");
    const bob = await createSeededUser("victim");
    const attempt = createTransferForUser(alice.tenantId, alice.id, {
      senderBankAccountId: account(bob, "Main Account").id,
      recipientEmail: alice.email,
      recipientShareableId: account(alice, "Main Account").shareableId,
      amount: 10_000
    });
    await expect(attempt).rejects.toMatchObject({ status: 404 });
  });

  it("rejects fractional and non-positive amounts", async () => {
    const alice = await createSeededUser("frac");
    for (const amount of [0, -5, 10.5, Number.NaN]) {
      await expect(
        createTransferForUser(alice.tenantId, alice.id, {
          senderBankAccountId: account(alice, "Main Account").id,
          recipientEmail: alice.email,
          recipientShareableId: account(alice, "Emergency Fund").shareableId,
          amount
        })
      ).rejects.toMatchObject({ status: 422 });
    }
  });
});

type Ctx = {
  alice: Awaited<ReturnType<typeof createSeededUser>>;
  bob: Awaited<ReturnType<typeof createSeededUser>>;
  from: { shareableId: string };
  to: { shareableId: string };
};
