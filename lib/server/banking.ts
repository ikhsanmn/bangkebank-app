import { and, asc, desc, eq, gte, inArray, or, sql } from "drizzle-orm";

import {
  bankAccounts,
  bankTransactions,
  ledgerEntries,
  ledgerPostings,
  transfers,
  users,
  type LEDGER_ENTRY_KINDS,
  type SystemAccount
} from "@/lib/db/schema";
import { type AuditContext, recordAudit } from "@/lib/server/audit";
import { type TenantTx, withTenant } from "@/lib/server/tenant";

// All amounts are whole rupiah (IDR has no minor unit in everyday use).
//
// Every function takes the caller's tenant first and does all of its database
// work inside withTenant, so row-level security scopes each query to it.

type Transaction = TenantTx;

type Posting =
  | { bankAccountId: string; amount: number }
  | { systemAccount: SystemAccount; amount: number };

const DAY_MS = 24 * 60 * 60 * 1000;

function buildShareableId() {
  return `BB-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

// Writes one balanced journal entry. The database applies each posting to its
// account balance and rejects the commit if the postings don't sum to zero.
async function postEntry(
  tx: Transaction,
  entry: {
    tenantId: string;
    kind: (typeof LEDGER_ENTRY_KINDS)[number];
    description: string;
    occurredAt: Date;
    postings: Posting[];
  }
) {
  const total = entry.postings.reduce((sum, posting) => sum + posting.amount, 0);
  if (entry.postings.length < 2 || total !== 0) {
    throw new Error(`Unbalanced ledger entry "${entry.description}" (sum ${total}).`);
  }

  const entryId = crypto.randomUUID();
  await tx.insert(ledgerEntries).values({
    id: entryId,
    tenantId: entry.tenantId,
    kind: entry.kind,
    description: entry.description,
    occurredAt: entry.occurredAt
  });
  await tx.insert(ledgerPostings).values(
    entry.postings.map((posting) => ({
      id: crypto.randomUUID(),
      tenantId: entry.tenantId,
      entryId,
      amount: posting.amount,
      bankAccountId: "bankAccountId" in posting ? posting.bankAccountId : null,
      systemAccount: "systemAccount" in posting ? posting.systemAccount : null
    }))
  );
  return entryId;
}

type SeedLine = {
  daysAgo: number;
  account: number;
  name: string;
  amount: number;
  direction: "credit" | "debit";
  channel: string;
  category: string;
};

const SEED_ACCOUNTS = [
  { name: "Main Account", subtype: "Savings", mask: "1842", opening: 18_500_000 },
  { name: "Emergency Fund", subtype: "Savings", mask: "7721", opening: 45_000_000 },
  { name: "Business Wallet", subtype: "Current", mask: "4209", opening: 7_250_000 }
];

const SEED_OPENING_DAYS_AGO = 30;

const SEED_LINES: SeedLine[] = [
  { daysAgo: 1, account: 0, name: "Indomaret", amount: 87_500, direction: "debit", channel: "QRIS", category: "Groceries" },
  { daysAgo: 2, account: 2, name: "Payout from PT Contoh Digital", amount: 15_000_000, direction: "credit", channel: "BI-FAST", category: "Income" },
  { daysAgo: 3, account: 0, name: "PLN prepaid electricity", amount: 200_000, direction: "debit", channel: "Virtual account", category: "Utilities" },
  { daysAgo: 4, account: 2, name: "Monthly kos rent", amount: 2_500_000, direction: "debit", channel: "BI-FAST", category: "Housing" },
  { daysAgo: 5, account: 0, name: "Gojek", amount: 45_000, direction: "debit", channel: "QRIS", category: "Transport" },
  { daysAgo: 6, account: 0, name: "Tokopedia", amount: 349_000, direction: "debit", channel: "Virtual account", category: "Shopping" },
  { daysAgo: 8, account: 1, name: "Savings interest", amount: 37_500, direction: "credit", channel: "Book transfer", category: "Interest" }
];

// Opens three sandbox accounts funded from SANDBOX_FUNDING, then replays a
// week of card and transfer activity against EXTERNAL_CLEARING. Every
// statement line comes from a ledger entry, so balances reconcile exactly.
export async function seedUserWorkspace(tenantId: string, userId: string) {
  await withTenant(tenantId, async (tx) => {
    const existing = await tx
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(eq(bankAccounts.userId, userId))
      .limit(1);

    if (existing.length > 0) {
      return;
    }

    const now = Date.now();
    const accounts = SEED_ACCOUNTS.map((account) => ({
      id: crypto.randomUUID(),
      tenantId,
      userId,
      institution: "BangkeBank Sandbox",
      name: account.name,
      subtype: account.subtype,
      mask: account.mask,
      shareableId: buildShareableId(),
      routingHint: "Sandbox account"
    }));
    await tx.insert(bankAccounts).values(accounts);

    for (const [index, seed] of SEED_ACCOUNTS.entries()) {
      const occurredAt = new Date(now - SEED_OPENING_DAYS_AGO * DAY_MS);
      const entryId = await postEntry(tx, {
        tenantId,
        kind: "sandbox_funding",
        description: "Sandbox opening deposit",
        occurredAt,
        postings: [
          { bankAccountId: accounts[index].id, amount: seed.opening },
          { systemAccount: "SANDBOX_FUNDING", amount: -seed.opening }
        ]
      });
      await tx.insert(bankTransactions).values({
        id: crypto.randomUUID(),
        tenantId,
        userId,
        bankAccountId: accounts[index].id,
        entryId,
        name: "Sandbox opening deposit",
        amount: seed.opening,
        direction: "credit",
        status: "Completed",
        channel: "Book transfer",
        category: "Deposit",
        source: "Sandbox seed",
        occurredAt
      });
    }

    for (const line of SEED_LINES) {
      const accountId = accounts[line.account].id;
      const signed = line.direction === "credit" ? line.amount : -line.amount;
      const occurredAt = new Date(now - line.daysAgo * DAY_MS);
      const entryId = await postEntry(tx, {
        tenantId,
        kind: line.direction === "credit" ? "external_receipt" : "external_payment",
        description: line.name,
        occurredAt,
        postings: [
          { bankAccountId: accountId, amount: signed },
          { systemAccount: "EXTERNAL_CLEARING", amount: -signed }
        ]
      });
      await tx.insert(bankTransactions).values({
        id: crypto.randomUUID(),
        tenantId,
        userId,
        bankAccountId: accountId,
        entryId,
        name: line.name,
        amount: line.amount,
        direction: line.direction,
        status: "Completed",
        channel: line.channel,
        category: line.category,
        source: "Sandbox seed",
        occurredAt
      });
    }
  });
}

export async function listBanksForUser(tenantId: string, userId: string) {
  return withTenant(tenantId, (tx) =>
    tx
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.userId, userId))
      // Seeded accounts share a timestamp; the name keeps their order stable.
      .orderBy(bankAccounts.createdAt, bankAccounts.name, bankAccounts.id)
  );
}

export async function getBankForUser(tenantId: string, userId: string, bankAccountId: string) {
  const [bank] = await withTenant(tenantId, (tx) =>
    tx
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.userId, userId)))
      .limit(1)
  );

  return bank ?? null;
}

// New accounts always open empty; the database refuses any other opening
// balance. Money only arrives through ledger entries.
export async function createBankForUser(
  tenantId: string,
  userId: string,
  input: {
    institution: string;
    name: string;
    subtype: string;
    mask: string;
    routingHint?: string;
  },
  context: AuditContext = { actorUserId: userId }
) {
  return withTenant(tenantId, async (tx) => {
    const [bank] = await tx
      .insert(bankAccounts)
      .values({
        id: crypto.randomUUID(),
        tenantId,
        userId,
        institution: input.institution,
        name: input.name,
        subtype: input.subtype,
        mask: input.mask,
        shareableId: buildShareableId(),
        routingHint: input.routingHint ?? "Sandbox account"
      })
      .returning();

    await recordAudit(
      { ...context, tenantId },
      { action: "bank_account.created", outcome: "success", entityType: "bankAccount", entityId: bank.id },
      tx
    );
    return bank;
  });
}

// Sandbox-only: credits an account from SANDBOX_FUNDING so partner tenants can
// fund the customers they create. Returns the statement line.
export async function depositSandboxFunds(
  tenantId: string,
  bankAccountId: string,
  amount: number,
  context: AuditContext
) {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new TransferError("Amount must be a positive whole number of rupiah.", 422);
  }
  return withTenant(tenantId, async (tx) => {
    const [account] = await lockAccounts(tx, [bankAccountId], "update");
    if (!account) {
      throw new TransferError("Account not found.", 404);
    }
    const occurredAt = new Date();
    const entryId = await postEntry(tx, {
      tenantId,
      kind: "sandbox_funding",
      description: "Sandbox deposit",
      occurredAt,
      postings: [
        { bankAccountId, amount },
        { systemAccount: "SANDBOX_FUNDING", amount: -amount }
      ]
    });
    const [line] = await tx
      .insert(bankTransactions)
      .values({
        id: crypto.randomUUID(),
        tenantId,
        userId: account.userId,
        bankAccountId,
        entryId,
        name: "Sandbox deposit",
        amount,
        direction: "credit",
        status: "Completed",
        channel: "Book transfer",
        category: "Deposit",
        source: "Partner API",
        occurredAt
      })
      .returning();
    await recordAudit(
      { ...context, tenantId },
      {
        action: "sandbox.deposited",
        outcome: "success",
        entityType: "bankAccount",
        entityId: bankAccountId,
        metadata: { amount, entryId }
      },
      tx
    );
    return line;
  });
}

const MAX_PAGE_SIZE = 100;

export async function listTimelineForUser(
  tenantId: string,
  userId: string,
  options?: {
    bankAccountId?: string;
    page?: number;
    pageSize?: number;
    // Extra rows fetched past the page so callers can tell whether a next page exists.
    lookahead?: number;
  }
) {
  const page = Math.max(1, Math.floor(options?.page ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(options?.pageSize ?? 20)));
  const offset = (page - 1) * pageSize;
  const where = options?.bankAccountId
    ? and(
        eq(bankTransactions.userId, userId),
        eq(bankTransactions.bankAccountId, options.bankAccountId)
      )
    : eq(bankTransactions.userId, userId);

  return withTenant(tenantId, (tx) =>
    tx
      .select()
      .from(bankTransactions)
      .where(where)
      .orderBy(desc(bankTransactions.occurredAt), desc(bankTransactions.id))
      .limit(pageSize + (options?.lookahead ?? 0))
      .offset(offset)
  );
}

// Senders see all their attempts, including failed ones; recipients only see
// money that actually arrived.
export async function listTransfersForUser(tenantId: string, userId: string) {
  return withTenant(tenantId, (tx) =>
    tx
      .select()
      .from(transfers)
      .where(
        or(
          eq(transfers.senderUserId, userId),
          and(eq(transfers.receiverUserId, userId), eq(transfers.status, "settled"))
        )
      )
      .orderBy(desc(transfers.createdAt))
  );
}

const CATEGORY_WINDOW_DAYS = 30;
const FLOW_WINDOW_DAYS = 7;
// Asia/Jakarta (WIB) is UTC+7 all year; there is no daylight saving.
const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

export async function getDashboardData(tenantId: string, userId: string) {
  const accountsForUser = await listBanksForUser(tenantId, userId);
  const recent = await listTimelineForUser(tenantId, userId, { pageSize: 8 });

  const totalBalance = accountsForUser.reduce((sum, account) => sum + account.currentBalance, 0);
  const totalAvailable = accountsForUser.reduce(
    (sum, account) => sum + account.availableBalance,
    0
  );

  const categoryRows = await withTenant(tenantId, (tx) =>
    tx
      .select({
        label: bankTransactions.category,
        value: sql<string>`sum(${bankTransactions.amount})`
      })
      .from(bankTransactions)
      .where(
        and(
          eq(bankTransactions.userId, userId),
          eq(bankTransactions.direction, "debit"),
          gte(bankTransactions.occurredAt, new Date(Date.now() - CATEGORY_WINDOW_DAYS * DAY_MS))
        )
      )
      .groupBy(bankTransactions.category)
      .orderBy(desc(sql`sum(${bankTransactions.amount})`))
      .limit(5)
  );

  const categoryBreakdown = categoryRows.map((row) => ({
    label: row.label,
    value: Number(row.value)
  }));

  // Net money in minus money out per Jakarta calendar day for the last week.
  const jakartaToday = new Date(Date.now() + JAKARTA_OFFSET_MS);
  jakartaToday.setUTCHours(0, 0, 0, 0);
  const firstDay = new Date(jakartaToday.getTime() - (FLOW_WINDOW_DAYS - 1) * DAY_MS);
  const flowStart = new Date(firstDay.getTime() - JAKARTA_OFFSET_MS);

  const flowRows = await withTenant(tenantId, (tx) =>
    tx
      .select({
        day: sql<string>`to_char(${bankTransactions.occurredAt} at time zone 'Asia/Jakarta', 'YYYY-MM-DD')`,
        net: sql<string>`sum(case when ${bankTransactions.direction} = 'credit' then ${bankTransactions.amount} else -${bankTransactions.amount} end)`
      })
      .from(bankTransactions)
      .where(and(eq(bankTransactions.userId, userId), gte(bankTransactions.occurredAt, flowStart)))
      .groupBy(sql`1`)
  );

  const netByDay = new Map(flowRows.map((row) => [row.day, Number(row.net)]));
  const dailyNetFlow = Array.from({ length: FLOW_WINDOW_DAYS }, (_, index) => {
    const date = new Date(firstDay.getTime() + index * DAY_MS);
    const key = date.toISOString().slice(0, 10);
    return {
      label: date.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }),
      value: netByDay.get(key) ?? 0
    };
  });

  return {
    totals: {
      totalBalance,
      totalAvailable,
      linkedBanks: accountsForUser.length
    },
    accounts: accountsForUser,
    recentTransactions: recent,
    categoryBreakdown,
    dailyNetFlow
  };
}

export class TransferError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409 | 422
  ) {
    super(message);
    this.name = "TransferError";
  }
}

const INSUFFICIENT_FUNDS = "Insufficient available balance for this transfer.";

type Receiver = { userId: string; bankAccountId: string; name: string; email: string };

class InsufficientFunds extends Error {
  constructor(readonly receiver: Receiver) {
    super(INSUFFICIENT_FUNDS);
  }
}

const UNIQUE_VIOLATION = "23505";

// Drizzle wraps driver errors, so the Postgres code may sit on `cause`.
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const { code, cause } = error as { code?: string; cause?: unknown };
  return code === UNIQUE_VIOLATION || isUniqueViolation(cause);
}

// Every transaction that touches two accounts takes its row locks in id order,
// including the KEY SHARE locks that foreign-key checks would otherwise take in
// constraint order. One global order means concurrent transfers can't deadlock.
async function lockAccounts(tx: Transaction, ids: string[], strength: "update" | "key share") {
  return tx
    .select()
    .from(bankAccounts)
    .where(inArray(bankAccounts.id, ids))
    .orderBy(asc(bankAccounts.id))
    .for(strength);
}

async function findTransferByIdempotencyKey(tenantId: string, senderUserId: string, key: string) {
  const [existing] = await withTenant(tenantId, (tx) =>
    tx
      .select()
      .from(transfers)
      .where(
        and(
          eq(transfers.tenantId, tenantId),
          eq(transfers.senderUserId, senderUserId),
          eq(transfers.idempotencyKey, key)
        )
      )
      .limit(1)
  );

  return existing ?? null;
}

export type TransferInput = {
  senderBankAccountId: string;
  recipientEmail: string;
  recipientShareableId: string;
  amount: number;
  note?: string;
  idempotencyKey?: string;
};

// Moves money between two accounts as one balanced ledger entry.
//
// The transfer row starts `pending` and becomes `settled` in the same database
// transaction as its ledger entry, so no one ever observes a half-applied
// transfer. Both account rows are locked (see lockAccounts) before the
// balance check. An attempt that fails for lack of
// funds is kept as a `failed` transfer so the sender's history and the audit
// trail show it. A repeated Idempotency-Key returns the original outcome.
export async function createTransferForUser(
  tenantId: string,
  senderUserId: string,
  input: TransferInput,
  context: AuditContext = { actorUserId: senderUserId }
) {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new TransferError("Amount must be a positive whole number of rupiah.", 422);
  }

  const amount = input.amount;
  const idempotencyKey = input.idempotencyKey ?? null;
  context = { ...context, tenantId };

  if (idempotencyKey) {
    const existing = await findTransferByIdempotencyKey(tenantId, senderUserId, idempotencyKey);
    if (existing) {
      return { transfer: existing, replayed: true };
    }
  }

  try {
    const transfer = await withTenant(tenantId, async (tx) => {
      const [receiverBank] = await tx
        .select()
        .from(bankAccounts)
        // RLS already hides other tenants; the explicit filter documents it.
        // Another tenant's account is indistinguishable from a missing one.
        .where(
          and(
            eq(bankAccounts.tenantId, tenantId),
            eq(bankAccounts.shareableId, input.recipientShareableId)
          )
        )
        .limit(1);

      if (!receiverBank) {
        throw new TransferError("No account matches that shareable ID.", 404);
      }

      if (receiverBank.id === input.senderBankAccountId) {
        throw new TransferError("Choose a different account to receive the transfer.", 422);
      }

      const [receiverUser] = await tx
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, receiverBank.userId))
        .limit(1);

      if (
        !receiverUser ||
        receiverUser.email.toLowerCase() !== input.recipientEmail.trim().toLowerCase()
      ) {
        throw new TransferError(
          "The recipient email does not match the owner of that shareable ID.",
          422
        );
      }

      const locked = await lockAccounts(tx, [input.senderBankAccountId, receiverBank.id], "update");

      const senderBank = locked.find(
        (row) => row.id === input.senderBankAccountId && row.userId === senderUserId
      );

      if (!senderBank) {
        throw new TransferError("Sender bank account not found.", 404);
      }

      // The row lock makes this read authoritative until commit.
      if (senderBank.availableBalance < amount) {
        throw new InsufficientFunds({
          userId: receiverBank.userId,
          bankAccountId: receiverBank.id,
          name: receiverUser.name,
          email: receiverUser.email
        });
      }

      const transferId = crypto.randomUUID();
      await tx.insert(transfers).values({
        id: transferId,
        tenantId,
        senderUserId,
        senderBankAccountId: senderBank.id,
        receiverUserId: receiverBank.userId,
        receiverBankAccountId: receiverBank.id,
        recipientName: receiverUser.name,
        recipientEmail: receiverUser.email,
        recipientShareableId: input.recipientShareableId,
        amount,
        note: input.note ?? "",
        status: "pending",
        channel: "Sandbox transfer",
        idempotencyKey
      });

      const now = new Date();
      const entryId = await postEntry(tx, {
        tenantId,
        kind: "transfer",
        description: `Transfer ${transferId}`,
        occurredAt: now,
        postings: [
          { bankAccountId: senderBank.id, amount: -amount },
          { bankAccountId: receiverBank.id, amount }
        ]
      });

      await tx.insert(bankTransactions).values([
        {
          id: crypto.randomUUID(),
          tenantId,
          userId: senderUserId,
          bankAccountId: senderBank.id,
          entryId,
          name: `Transfer to ${receiverUser.name}`,
          amount,
          direction: "debit",
          status: "Completed",
          channel: "Sandbox transfer",
          category: "Transfer",
          source: "Internal Transfer",
          occurredAt: now
        },
        {
          id: crypto.randomUUID(),
          tenantId,
          userId: receiverBank.userId,
          bankAccountId: receiverBank.id,
          entryId,
          name: `Transfer from ${senderBank.name}`,
          amount,
          direction: "credit",
          status: "Completed",
          channel: "Sandbox transfer",
          category: "Transfer",
          source: "Internal Transfer",
          occurredAt: now
        }
      ]);

      const [settled] = await tx
        .update(transfers)
        .set({ status: "settled", entryId, completedAt: now })
        .where(eq(transfers.id, transferId))
        .returning();

      await recordAudit(
        context,
        {
          action: "transfer.settled",
          outcome: "success",
          entityType: "transfer",
          entityId: transferId,
          metadata: {
            amount,
            senderBankAccountId: senderBank.id,
            receiverBankAccountId: receiverBank.id
          }
        },
        tx
      );

      return settled;
    });

    return { transfer, replayed: false };
  } catch (error) {
    // Two requests with the same key raced past the pre-check; the unique index
    // let exactly one commit, so hand back that one.
    if (idempotencyKey && isUniqueViolation(error)) {
      const existing = await findTransferByIdempotencyKey(tenantId, senderUserId, idempotencyKey);
      if (existing) {
        return { transfer: existing, replayed: true };
      }
    }

    if (error instanceof InsufficientFunds) {
      return recordFailedTransfer(tenantId, senderUserId, input, error.receiver, context);
    }

    if (error instanceof TransferError) {
      await recordAudit(context, {
        action: "transfer.rejected",
        outcome: "failure",
        entityType: "bankAccount",
        entityId: input.senderBankAccountId,
        metadata: {
          amount,
          reason: error.message,
          recipientShareableId: input.recipientShareableId
        }
      });
    }
    throw error;
  }
}

async function recordFailedTransfer(
  tenantId: string,
  senderUserId: string,
  input: TransferInput,
  receiver: Receiver,
  context: AuditContext
) {
  const idempotencyKey = input.idempotencyKey ?? null;
  try {
    const transfer = await withTenant(tenantId, async (tx) => {
      await lockAccounts(tx, [input.senderBankAccountId, receiver.bankAccountId], "key share");
      const [failed] = await tx
        .insert(transfers)
        .values({
          id: crypto.randomUUID(),
          tenantId,
          senderUserId,
          senderBankAccountId: input.senderBankAccountId,
          receiverUserId: receiver.userId,
          receiverBankAccountId: receiver.bankAccountId,
          recipientName: receiver.name,
          recipientEmail: receiver.email,
          recipientShareableId: input.recipientShareableId,
          amount: input.amount,
          note: input.note ?? "",
          status: "failed",
          failureReason: INSUFFICIENT_FUNDS,
          channel: "Sandbox transfer",
          idempotencyKey
        })
        .returning();

      await recordAudit(
        context,
        {
          action: "transfer.failed",
          outcome: "failure",
          entityType: "transfer",
          entityId: failed.id,
          metadata: { amount: input.amount, reason: INSUFFICIENT_FUNDS }
        },
        tx
      );
      return failed;
    });
    return { transfer, replayed: false };
  } catch (error) {
    if (idempotencyKey && isUniqueViolation(error)) {
      const existing = await findTransferByIdempotencyKey(tenantId, senderUserId, idempotencyKey);
      if (existing) {
        return { transfer: existing, replayed: true };
      }
    }
    throw error;
  }
}

// A tenant's balances that disagree with the sum of their postings. Always
// empty unless the ledger guards were bypassed; exposed for tests and operators.
export async function findUnreconciledAccounts(tenantId: string) {
  const result = await withTenant(tenantId, (tx) =>
    tx.execute<{ id: string; balance: string; posted: string }>(sql`
      select a."id", a."currentBalance" as balance, coalesce(sum(p."amount"), 0) as posted
        from "bankAccount" a
        left join "ledgerPosting" p on p."bankAccountId" = a."id"
       group by a."id"
      having a."currentBalance" <> coalesce(sum(p."amount"), 0)
          or a."availableBalance" <> coalesce(sum(p."amount"), 0)
    `)
  );
  return result.rows;
}

export async function getUserProfile(tenantId: string, userId: string) {
  const [profile] = await withTenant(tenantId, (tx) =>
    tx
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        city: users.city,
        province: users.province,
        postalCode: users.postalCode,
        nikLast4: users.nikLast4
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
  );

  return profile ?? null;
}
