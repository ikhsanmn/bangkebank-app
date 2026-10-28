import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { recordAudit } from "@/lib/server/audit";
import {
  createBankForUser,
  createTransferForUser,
  findUnreconciledAccounts,
  getBankForUser,
  getDashboardData,
  getUserProfile,
  listBanksForUser,
  listTimelineForUser,
  listTransfersForUser,
  seedUserWorkspace
} from "@/lib/server/banking";
import { withTenant } from "@/lib/server/tenant";

import { adminDb, count, createSeededUser, createTenant, dbError } from "./helpers";

// Two tenants holding identical data: same customer emails, same seeded
// accounts, a settled and a failed transfer each. Every service function and
// every tenant-scoped table is then exercised from tenant A against tenant B.

type Seeded = Awaited<ReturnType<typeof createSeededUser>>;
type World = { tenantId: string; alice: Seeded; bob: Seeded; settledId: string; failedId: string };

const TENANT_TABLES = [
  "user",
  "bankAccount",
  "ledgerEntry",
  "ledgerPosting",
  "bankTransaction",
  "transfer",
  "auditEvent"
] as const;

let a: World;
let b: World;

async function buildWorld(label: string, run: string): Promise<World> {
  const tenantId = await createTenant(label);
  const alice = await createSeededUser("alice", tenantId, `alice-${run}@example.test`);
  const bob = await createSeededUser("bob", tenantId, `bob-${run}@example.test`);
  const send = (amount: number) =>
    createTransferForUser(tenantId, alice.id, {
      senderBankAccountId: alice.accounts[0].id,
      recipientEmail: bob.email,
      recipientShareableId: bob.accounts[0].shareableId,
      amount
    });
  const settled = await send(50_000);
  const failed = await send(999_000_000);
  return { tenantId, alice, bob, settledId: settled.transfer.id, failedId: failed.transfer.id };
}

beforeAll(async () => {
  const run = crypto.randomUUID().slice(0, 8);
  a = await buildWorld("iso-a", run);
  b = await buildWorld("iso-b", run);
  expect(a.alice.email).toBe(b.alice.email);
});

describe("tenant isolation through the service layer", () => {
  it("finds none of tenant B's data when asked from tenant A", async () => {
    const bBank = b.alice.accounts[0];

    expect(await listBanksForUser(a.tenantId, b.alice.id)).toEqual([]);
    expect(await getBankForUser(a.tenantId, b.alice.id, bBank.id)).toBeNull();
    expect(await getBankForUser(a.tenantId, a.alice.id, bBank.id)).toBeNull();
    expect(await listTimelineForUser(a.tenantId, b.alice.id)).toEqual([]);
    expect(await listTimelineForUser(a.tenantId, a.alice.id, { bankAccountId: bBank.id })).toEqual([]);
    expect(await listTransfersForUser(a.tenantId, b.alice.id)).toEqual([]);
    expect(await getUserProfile(a.tenantId, b.alice.id)).toBeNull();

    const dashboard = await getDashboardData(a.tenantId, b.alice.id);
    expect(dashboard.accounts).toEqual([]);
    expect(dashboard.totals.totalBalance).toBe(0);
    expect(dashboard.recentTransactions).toEqual([]);
    expect(dashboard.categoryBreakdown).toEqual([]);
  });

  it("returns each tenant exactly its own data", async () => {
    for (const world of [a, b]) {
      const banks = await listBanksForUser(world.tenantId, world.alice.id);
      expect(banks.map((bank) => bank.id).sort()).toEqual(world.alice.accounts.map((bank) => bank.id).sort());

      const transferIds = (await listTransfersForUser(world.tenantId, world.alice.id)).map((row) => row.id);
      expect(transferIds.sort()).toEqual([world.settledId, world.failedId].sort());

      const timeline = await listTimelineForUser(world.tenantId, world.alice.id, { pageSize: 100 });
      expect(timeline.every((line) => line.tenantId === world.tenantId)).toBe(true);
      expect(await findUnreconciledAccounts(world.tenantId)).toEqual([]);
    }
  });

  it("can't send from, or pay into, another tenant's account", async () => {
    // Identical email, real shareable id, but in tenant B: unknown from A.
    await expect(
      createTransferForUser(a.tenantId, a.alice.id, {
        senderBankAccountId: a.alice.accounts[0].id,
        recipientEmail: b.bob.email,
        recipientShareableId: b.bob.accounts[0].shareableId,
        amount: 1_000
      })
    ).rejects.toMatchObject({ status: 404 });

    // Spending from B's account while acting in A.
    await expect(
      createTransferForUser(a.tenantId, b.alice.id, {
        senderBankAccountId: b.alice.accounts[0].id,
        recipientEmail: a.bob.email,
        recipientShareableId: a.bob.accounts[0].shareableId,
        amount: 1_000
      })
    ).rejects.toMatchObject({ status: 404 });

    const [bAccount] = await adminDb.execute<{ currentBalance: string }>(
      sql`select "currentBalance" from "bankAccount" where "id" = ${b.alice.accounts[0].id}`
    ).then((result) => result.rows);
    expect(Number(bAccount.currentBalance)).toBe(b.alice.accounts[0].currentBalance - 50_000);
  });

  it("can't create accounts, seed workspaces or audit events in another tenant", async () => {
    const before = await count("bankAccount", `"tenantId" = '${b.tenantId}'`);

    expect(
      await dbError(
        createBankForUser(a.tenantId, b.alice.id, {
          institution: "X",
          name: "Planted",
          subtype: "Savings",
          mask: "0000"
        })
      )
    ).toMatch(/bank_account_user_fk|row-level security/);
    await expect(seedUserWorkspace(a.tenantId, b.alice.id)).rejects.toThrow();
    expect(await count("bankAccount", `"tenantId" = '${b.tenantId}'`)).toBe(before);

    await recordAudit({ tenantId: a.tenantId, actorUserId: a.alice.id }, { action: "iso.check", outcome: "success" });
    const seenFromB = await withTenant(b.tenantId, (tx) =>
      tx.execute<{ n: string }>(sql`select count(*)::text as n from "auditEvent" where "action" = 'iso.check'`)
    );
    expect(seenFromB.rows[0].n).toBe("0");
  });
});

describe("tenant isolation in raw SQL as the app role", () => {
  it.each(TENANT_TABLES)("%s: reads from A see exactly A's rows", async (table) => {
    const visible = await withTenant(a.tenantId, (tx) =>
      tx.execute<{ total: string; foreign: string }>(
        sql.raw(`
          select count(*)::text as total,
                 count(*) filter (where "tenantId" is distinct from '${a.tenantId}')::text as foreign
            from "${table}"
        `)
      )
    );
    expect(visible.rows[0].foreign).toBe("0");
    expect(Number(visible.rows[0].total)).toBe(await count(table, `"tenantId" = '${a.tenantId}'`));
    expect(await count(table, `"tenantId" = '${b.tenantId}'`)).toBeGreaterThan(0);
  });

  it.each(TENANT_TABLES)("%s: updates and deletes from A can't reach B's rows", async (table) => {
    const before = await count(table, `"tenantId" = '${b.tenantId}'`);
    const touched = await withTenant(a.tenantId, async (tx) => {
      // Ledger and audit rows are append-only: if a B row were visible, its
      // trigger would raise. RLS filters it out first, so nothing happens.
      const updated = await tx.execute(
        sql.raw(`update "${table}" set "tenantId" = "tenantId" where "tenantId" = '${b.tenantId}'`)
      );
      const deleted = await tx.execute(sql.raw(`delete from "${table}" where "tenantId" = '${b.tenantId}'`));
      return (updated.rowCount ?? 0) + (deleted.rowCount ?? 0);
    });
    expect(touched).toBe(0);
    expect(await count(table, `"tenantId" = '${b.tenantId}'`)).toBe(before);
  });

  it("refuses to insert a row into B or move one of A's rows into B", async () => {
    expect(
      await dbError(
        withTenant(a.tenantId, (tx) =>
          tx.execute(sql`
            insert into "user" ("id", "tenantId", "name", "email")
            values (${crypto.randomUUID()}, ${b.tenantId}, 'Mallory', 'mallory@example.test')
          `)
        )
      )
    ).toMatch(/row-level security/);

    expect(
      await dbError(
        withTenant(a.tenantId, (tx) =>
          tx.execute(sql`update "bankAccount" set "tenantId" = ${b.tenantId} where "id" = ${a.alice.accounts[1].id}`)
        )
      )
    ).toMatch(/row-level security|bank_account_user_fk|violates foreign key/);
  });

  it("re-reads the setting on every query, so clearing it mid-transaction hides everything", async () => {
    // The policy evaluates the live setting rather than a value captured when
    // the transaction began, so no stale scope can linger.
    const seen = await withTenant(a.tenantId, async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', '', true)`);
      return tx.execute<{ n: string }>(sql`select count(*)::text as n from "bankAccount"`);
    });
    expect(seen.rows[0].n).toBe("0");
  });
});
