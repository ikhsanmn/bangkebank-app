import { and, asc, desc, eq, gte, inArray, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { bankAccounts, bankTransactions, transfers, users } from "@/lib/db/schema";

function money(value: number) {
  return Number(value.toFixed(2));
}

function buildShareableId() {
  return `BB-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function seedUserWorkspace(userId: string) {
  const existing = await db
    .select({ id: bankAccounts.id })
    .from(bankAccounts)
    .where(eq(bankAccounts.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    return;
  }

  const now = new Date();
  const seededAccounts = [
    {
      id: crypto.randomUUID(),
      userId,
      institution: "Chase",
      name: "Primary Checking",
      subtype: "Checking",
      mask: "1842",
      shareableId: buildShareableId(),
      currentBalance: 12640.42,
      availableBalance: 12100.42,
      routingHint: "Funding source active"
    },
    {
      id: crypto.randomUUID(),
      userId,
      institution: "Capital One",
      name: "Rainy Day Reserve",
      subtype: "Savings",
      mask: "7721",
      shareableId: buildShareableId(),
      currentBalance: 28450.9,
      availableBalance: 28450.9,
      routingHint: "High-yield reserve"
    },
    {
      id: crypto.randomUUID(),
      userId,
      institution: "American Express",
      name: "Operations Wallet",
      subtype: "Checking",
      mask: "4209",
      shareableId: buildShareableId(),
      currentBalance: 4930.13,
      availableBalance: 4625.13,
      routingHint: "ACH transfers enabled"
    }
  ];

  await db.insert(bankAccounts).values(seededAccounts);

  const seededTransactions = [
    {
      id: crypto.randomUUID(),
      userId,
      bankAccountId: seededAccounts[0].id,
      name: "Whole Foods Market",
      amount: 82.45,
      direction: "debit",
      status: "Completed",
      channel: "In store",
      category: "Groceries",
      source: "Sandbox seed",
      occurredAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000)
    },
    {
      id: crypto.randomUUID(),
      userId,
      bankAccountId: seededAccounts[2].id,
      name: "Stripe Client Payout",
      amount: 3200,
      direction: "credit",
      status: "Completed",
      channel: "Bank deposit",
      category: "Income",
      source: "Sandbox seed",
      occurredAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
    },
    {
      id: crypto.randomUUID(),
      userId,
      bankAccountId: seededAccounts[0].id,
      name: "Figma",
      amount: 19,
      direction: "debit",
      status: "Completed",
      channel: "Card subscription",
      category: "Software",
      source: "Sandbox seed",
      occurredAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    },
    {
      id: crypto.randomUUID(),
      userId,
      bankAccountId: seededAccounts[2].id,
      name: "Rent Payment",
      amount: 1850,
      direction: "debit",
      status: "Completed",
      channel: "ACH",
      category: "Housing",
      source: "Sandbox seed",
      occurredAt: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000)
    },
    {
      id: crypto.randomUUID(),
      userId,
      bankAccountId: seededAccounts[0].id,
      name: "United Airlines",
      amount: 428.3,
      direction: "debit",
      status: "Completed",
      channel: "Online",
      category: "Travel",
      source: "Sandbox seed",
      occurredAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    },
    {
      id: crypto.randomUUID(),
      userId,
      bankAccountId: seededAccounts[1].id,
      name: "Interest payment",
      amount: 43.12,
      direction: "credit",
      status: "Completed",
      channel: "Bank deposit",
      category: "Interest",
      source: "Sandbox seed",
      occurredAt: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000)
    }
  ];

  await db.insert(bankTransactions).values(seededTransactions);
}

export async function listBanksForUser(userId: string) {
  return db
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.userId, userId))
    .orderBy(bankAccounts.createdAt);
}

export async function getBankForUser(userId: string, bankAccountId: string) {
  const [bank] = await db
    .select()
    .from(bankAccounts)
    .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.userId, userId)))
    .limit(1);

  return bank ?? null;
}

// New accounts always open empty. Balances only change through transfers, so a
// client can never declare money into existence.
export async function createBankForUser(
  userId: string,
  input: {
    institution: string;
    name: string;
    subtype: string;
    mask: string;
    routingHint?: string;
  }
) {
  const [bank] = await db
    .insert(bankAccounts)
    .values({
      id: crypto.randomUUID(),
      userId,
      institution: input.institution,
      name: input.name,
      subtype: input.subtype,
      mask: input.mask,
      shareableId: buildShareableId(),
      currentBalance: 0,
      availableBalance: 0,
      routingHint: input.routingHint ?? "Sandbox account"
    })
    .returning();

  return bank;
}

const MAX_PAGE_SIZE = 100;

export async function listTimelineForUser(
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

  return db
    .select()
    .from(bankTransactions)
    .where(where)
    .orderBy(desc(bankTransactions.occurredAt), desc(bankTransactions.id))
    .limit(pageSize + (options?.lookahead ?? 0))
    .offset(offset);
}

export async function listTransfersForUser(userId: string) {
  return db
    .select()
    .from(transfers)
    .where(or(eq(transfers.senderUserId, userId), eq(transfers.receiverUserId, userId)))
    .orderBy(desc(transfers.createdAt));
}

const DAY_MS = 24 * 60 * 60 * 1000;
const CATEGORY_WINDOW_DAYS = 30;
const FLOW_WINDOW_DAYS = 7;

export async function getDashboardData(userId: string) {
  const accountsForUser = await listBanksForUser(userId);
  const recent = await listTimelineForUser(userId, { pageSize: 8 });

  const totalBalance = accountsForUser.reduce(
    (sum, account) => sum + Number(account.currentBalance),
    0
  );
  const totalAvailable = accountsForUser.reduce(
    (sum, account) => sum + Number(account.availableBalance),
    0
  );

  const categoryRows = await db
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
    .limit(5);

  const categoryBreakdown = categoryRows.map((row) => ({
    label: row.label,
    value: money(Number(row.value))
  }));

  // Net money in minus money out per calendar day (UTC) for the last week.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const flowStart = new Date(today.getTime() - (FLOW_WINDOW_DAYS - 1) * DAY_MS);

  const flowRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${bankTransactions.occurredAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
      net: sql<string>`sum(case when ${bankTransactions.direction} = 'credit' then ${bankTransactions.amount} else -${bankTransactions.amount} end)`
    })
    .from(bankTransactions)
    .where(and(eq(bankTransactions.userId, userId), gte(bankTransactions.occurredAt, flowStart)))
    .groupBy(sql`1`);

  const netByDay = new Map(flowRows.map((row) => [row.day, Number(row.net)]));
  const dailyNetFlow = Array.from({ length: FLOW_WINDOW_DAYS }, (_, index) => {
    const date = new Date(flowStart.getTime() + index * DAY_MS);
    const key = date.toISOString().slice(0, 10);
    return {
      label: date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
      value: money(netByDay.get(key) ?? 0)
    };
  });

  return {
    totals: {
      totalBalance: money(totalBalance),
      totalAvailable: money(totalAvailable),
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

const UNIQUE_VIOLATION = "23505";

// Drizzle wraps driver errors, so the Postgres code may sit on `cause`.
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const { code, cause } = error as { code?: string; cause?: unknown };
  return code === UNIQUE_VIOLATION || isUniqueViolation(cause);
}

async function findTransferByIdempotencyKey(senderUserId: string, key: string) {
  const [existing] = await db
    .select()
    .from(transfers)
    .where(and(eq(transfers.senderUserId, senderUserId), eq(transfers.idempotencyKey, key)))
    .limit(1);

  return existing ?? null;
}

// Moves money between two accounts in one transaction. Both rows are locked in
// id order (so concurrent transfers can't deadlock), the debit is a conditional
// UPDATE that only succeeds while funds suffice, and all arithmetic happens in
// Postgres numeric rather than JS floats. A repeated Idempotency-Key returns the
// original transfer instead of moving money twice.
export async function createTransferForUser(
  senderUserId: string,
  input: {
    senderBankAccountId: string;
    recipientEmail: string;
    recipientShareableId: string;
    amount: number;
    note?: string;
    idempotencyKey?: string;
  }
) {
  const amount = money(input.amount);
  const idempotencyKey = input.idempotencyKey ?? null;

  if (idempotencyKey) {
    const existing = await findTransferByIdempotencyKey(senderUserId, idempotencyKey);
    if (existing) {
      return { transfer: existing, replayed: true };
    }
  }

  try {
    const transfer = await db.transaction(async (tx) => {
      const [receiverBank] = await tx
        .select()
        .from(bankAccounts)
        .where(eq(bankAccounts.shareableId, input.recipientShareableId))
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

      const locked = await tx
        .select()
        .from(bankAccounts)
        .where(inArray(bankAccounts.id, [input.senderBankAccountId, receiverBank.id]))
        .orderBy(asc(bankAccounts.id))
        .for("update");

      const senderBank = locked.find(
        (row) => row.id === input.senderBankAccountId && row.userId === senderUserId
      );

      if (!senderBank) {
        throw new TransferError("Sender bank account not found.", 404);
      }

      const now = new Date();
      const [debited] = await tx
        .update(bankAccounts)
        .set({
          currentBalance: sql`${bankAccounts.currentBalance} - ${amount}`,
          availableBalance: sql`${bankAccounts.availableBalance} - ${amount}`,
          updatedAt: now
        })
        .where(
          and(eq(bankAccounts.id, senderBank.id), gte(bankAccounts.availableBalance, amount))
        )
        .returning({ id: bankAccounts.id });

      if (!debited) {
        throw new TransferError("Insufficient available balance for this transfer.", 422);
      }

      await tx
        .update(bankAccounts)
        .set({
          currentBalance: sql`${bankAccounts.currentBalance} + ${amount}`,
          availableBalance: sql`${bankAccounts.availableBalance} + ${amount}`,
          updatedAt: now
        })
        .where(eq(bankAccounts.id, receiverBank.id));

      const [created] = await tx
        .insert(transfers)
        .values({
          id: crypto.randomUUID(),
          senderUserId,
          senderBankAccountId: senderBank.id,
          receiverUserId: receiverBank.userId,
          receiverBankAccountId: receiverBank.id,
          recipientName: receiverUser.name,
          recipientEmail: receiverUser.email,
          recipientShareableId: input.recipientShareableId,
          amount,
          note: input.note ?? "",
          status: "Completed",
          channel: "Sandbox transfer",
          idempotencyKey,
          completedAt: now
        })
        .returning();

      await tx.insert(bankTransactions).values([
        {
          id: crypto.randomUUID(),
          userId: senderUserId,
          bankAccountId: senderBank.id,
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
          userId: receiverBank.userId,
          bankAccountId: receiverBank.id,
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

      return created;
    });

    return { transfer, replayed: false };
  } catch (error) {
    // Two requests with the same key raced past the pre-check; the unique index
    // let exactly one commit, so hand back that one.
    if (idempotencyKey && isUniqueViolation(error)) {
      const existing = await findTransferByIdempotencyKey(senderUserId, idempotencyKey);
      if (existing) {
        return { transfer: existing, replayed: true };
      }
    }
    throw error;
  }
}

export async function getUserProfile(userId: string) {
  const [profile] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      city: users.city,
      state: users.state,
      postalCode: users.postalCode
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return profile ?? null;
}
