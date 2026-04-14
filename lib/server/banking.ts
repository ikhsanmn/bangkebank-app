import { and, desc, eq, inArray, or } from "drizzle-orm";

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
      source: "Plaid Sync",
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
      source: "Plaid Sync",
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
      source: "Plaid Sync",
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
      source: "Plaid Sync",
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
      source: "Plaid Sync",
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
      source: "Plaid Sync",
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

export async function createBankForUser(
  userId: string,
  input: {
    institution: string;
    name: string;
    subtype: string;
    mask: string;
    currentBalance: number;
    availableBalance: number;
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
      currentBalance: money(input.currentBalance),
      availableBalance: money(input.availableBalance),
      routingHint: input.routingHint ?? "Funding source active"
    })
    .returning();

  return bank;
}

export async function listTimelineForUser(
  userId: string,
  options?: {
    bankAccountId?: string;
    page?: number;
    pageSize?: number;
  }
) {
  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? 20;
  const offset = (page - 1) * pageSize;
  const where = options?.bankAccountId
    ? and(
        eq(bankTransactions.userId, userId),
        eq(bankTransactions.bankAccountId, options.bankAccountId)
      )
    : eq(bankTransactions.userId, userId);

  const items = await db
    .select()
    .from(bankTransactions)
    .where(where)
    .orderBy(desc(bankTransactions.occurredAt))
    .limit(pageSize)
    .offset(offset);

  return items;
}

export async function listTransfersForUser(userId: string) {
  return db
    .select()
    .from(transfers)
    .where(or(eq(transfers.senderUserId, userId), eq(transfers.receiverUserId, userId)))
    .orderBy(desc(transfers.createdAt));
}

export async function getDashboardData(userId: string) {
  const accountsForUser = await listBanksForUser(userId);
  const accountIds = accountsForUser.map((account) => account.id);
  const recent = await listTimelineForUser(userId, { pageSize: 8 });

  const totalBalance = accountsForUser.reduce(
    (sum, account) => sum + Number(account.currentBalance),
    0
  );
  const totalAvailable = accountsForUser.reduce(
    (sum, account) => sum + Number(account.availableBalance),
    0
  );

  const categories = recent
    .filter((item) => item.direction === "debit")
    .reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = money((acc[item.category] ?? 0) + Number(item.amount));
      return acc;
    }, {});

  const categoryBreakdown = Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, value]) => ({ label, value }));

  const balancesByDay = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const label = date.toLocaleDateString("en-US", { weekday: "short" });

    return { label, value: 0 };
  });

  for (const entry of recent) {
    const label = new Date(entry.occurredAt).toLocaleDateString("en-US", {
      weekday: "short"
    });
    const day = balancesByDay.find((item) => item.label === label);

    if (day) {
      day.value += entry.direction === "credit" ? Number(entry.amount) : -Number(entry.amount);
    }
  }

  const largest = Math.max(...balancesByDay.map((item) => Math.abs(item.value)), 1);
  const weeklyBalances = balancesByDay.map((item) => ({
    label: item.label,
    value: Math.max(20, Math.round((Math.abs(item.value) / largest) * 100))
  }));

  return {
    totals: {
      totalBalance: money(totalBalance),
      totalAvailable: money(totalAvailable),
      linkedBanks: accountsForUser.length
    },
    accounts: accountsForUser,
    recentTransactions: recent,
    categoryBreakdown,
    weeklyBalances,
    accountIds
  };
}

export async function createTransferForUser(
  senderUserId: string,
  input: {
    senderBankAccountId: string;
    recipientEmail: string;
    recipientShareableId: string;
    amount: number;
    note?: string;
  }
) {
  const amount = money(input.amount);

  return db.transaction(async (tx) => {
    const [senderBank] = await tx
      .select()
      .from(bankAccounts)
      .where(
        and(
          eq(bankAccounts.id, input.senderBankAccountId),
          eq(bankAccounts.userId, senderUserId)
        )
      )
      .limit(1);

    if (!senderBank) {
      throw new Error("Sender bank account not found.");
    }

    if (Number(senderBank.availableBalance) < amount) {
      throw new Error("Insufficient available balance for this transfer.");
    }

    const [receiverBank] = await tx
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.shareableId, input.recipientShareableId))
      .limit(1);

    const [receiverUser] = receiverBank
      ? await tx
          .select({
            id: users.id,
            name: users.name,
            email: users.email
          })
          .from(users)
          .where(eq(users.id, receiverBank.userId))
          .limit(1)
      : [];

    const transferId = crypto.randomUUID();
    const completedAt = new Date();

    const [transfer] = await tx
      .insert(transfers)
      .values({
        id: transferId,
        senderUserId,
        senderBankAccountId: senderBank.id,
        receiverUserId: receiverBank?.userId ?? null,
        receiverBankAccountId: receiverBank?.id ?? null,
        recipientName: receiverUser?.name ?? "Recipient",
        recipientEmail: receiverUser?.email ?? input.recipientEmail,
        recipientShareableId: input.recipientShareableId,
        amount,
        note: input.note ?? "",
        status: "Completed",
        channel: "ACH",
        completedAt
      })
      .returning();

    await tx
      .update(bankAccounts)
      .set({
        currentBalance: money(Number(senderBank.currentBalance) - amount),
        availableBalance: money(Number(senderBank.availableBalance) - amount),
        updatedAt: completedAt
      })
      .where(eq(bankAccounts.id, senderBank.id));

    await tx.insert(bankTransactions).values({
      id: crypto.randomUUID(),
      userId: senderUserId,
      bankAccountId: senderBank.id,
      name: `ACH Transfer to ${receiverUser?.name ?? input.recipientEmail}`,
      amount,
      direction: "debit",
      status: "Completed",
      channel: "ACH",
      category: "Transfer",
      source: "Internal Transfer",
      occurredAt: completedAt
    });

    if (receiverBank) {
      await tx
        .update(bankAccounts)
        .set({
          currentBalance: money(Number(receiverBank.currentBalance) + amount),
          availableBalance: money(Number(receiverBank.availableBalance) + amount),
          updatedAt: completedAt
        })
        .where(eq(bankAccounts.id, receiverBank.id));

      await tx.insert(bankTransactions).values({
        id: crypto.randomUUID(),
        userId: receiverBank.userId,
        bankAccountId: receiverBank.id,
        name: `Inbound transfer from ${senderBank.name}`,
        amount,
        direction: "credit",
        status: "Completed",
        channel: "ACH",
        category: "Transfer",
        source: "Internal Transfer",
        occurredAt: completedAt
      });
    }

    return transfer;
  });
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

export async function listBanksByIds(ids: string[]) {
  if (ids.length === 0) {
    return [];
  }

  return db.select().from(bankAccounts).where(inArray(bankAccounts.id, ids));
}
