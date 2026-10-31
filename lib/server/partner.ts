import { and, desc, eq, inArray, lt, or } from "drizzle-orm";

import {
  bankAccounts,
  bankTransactions,
  ledgerEntries,
  ledgerPostings,
  transfers,
  users
} from "@/lib/db/schema";
import { type AuditContext, recordAudit } from "@/lib/server/audit";
import { createBankForUser, createTransferForUser, TransferError } from "@/lib/server/banking";
import { protectIdentity } from "@/lib/server/identity";
import { withTenant } from "@/lib/server/tenant";

// Service functions behind the partner API (/api/v1). Like banking.ts, each
// takes the tenant (from the caller's API key) and runs inside withTenant.
// Responses are explicit views: identity ciphertext and internal columns never
// leave the server.

export class PartnerError extends Error {
  constructor(
    readonly status: 404 | 409 | 422,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "PartnerError";
  }
}

export const MAX_LIST_LIMIT = 100;

type CustomerRow = typeof users.$inferSelect;
type AccountRow = typeof bankAccounts.$inferSelect;
type TransferRow = typeof transfers.$inferSelect;
type LineRow = typeof bankTransactions.$inferSelect;

function customerView(row: CustomerRow) {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    city: row.city,
    province: row.province,
    postalCode: row.postalCode,
    nikLast4: row.nikLast4,
    createdAt: row.createdAt
  };
}

function accountView(row: AccountRow) {
  return {
    id: row.id,
    customerId: row.userId,
    name: row.name,
    subtype: row.subtype,
    currency: row.currency,
    currentBalance: row.currentBalance,
    availableBalance: row.availableBalance,
    shareableId: row.shareableId,
    createdAt: row.createdAt
  };
}

export function transferView(row: TransferRow) {
  return {
    id: row.id,
    fromAccountId: row.senderBankAccountId,
    toAccountId: row.receiverBankAccountId,
    amount: row.amount,
    currency: "IDR",
    note: row.note,
    status: row.status,
    failureReason: row.failureReason,
    ledgerEntryId: row.entryId,
    createdAt: row.createdAt,
    completedAt: row.completedAt
  };
}

function lineView(row: LineRow) {
  return {
    id: row.id,
    name: row.name,
    amount: row.amount,
    direction: row.direction,
    channel: row.channel,
    category: row.category,
    ledgerEntryId: row.entryId,
    occurredAt: row.occurredAt
  };
}

// Opaque keyset cursor over (occurredAt desc, id desc).
type Cursor = { t: string; id: string };

export function encodeCursor(row: { occurredAt: Date; id: string }) {
  return Buffer.from(JSON.stringify({ t: row.occurredAt.toISOString(), id: row.id })).toString(
    "base64url"
  );
}

export function decodeCursor(value: string | null): Cursor | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor;
    if (typeof parsed.id === "string" && !Number.isNaN(Date.parse(parsed.t))) {
      return parsed;
    }
  } catch {
    // fall through
  }
  throw new PartnerError(422, "invalid_cursor", "The cursor is not valid.");
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const { code, constraint: name, cause } = error as {
    code?: string;
    constraint?: string;
    cause?: unknown;
  };
  return (code === "23505" && name === constraint) || isUniqueViolation(cause, constraint);
}

export type CustomerInput = {
  email: string;
  firstName: string;
  lastName: string;
  address1: string;
  city: string;
  province: string;
  postalCode: string;
  dateOfBirth: string;
  nik: string;
};

export async function createCustomer(tenantId: string, input: CustomerInput, context: AuditContext) {
  const identity = protectIdentity(input);
  if (!identity.ok) {
    throw new PartnerError(422, "invalid_identity", identity.error);
  }

  try {
    return await withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .insert(users)
        .values({
          ...identity.data,
          id: crypto.randomUUID(),
          tenantId,
          email: input.email.trim().toLowerCase(),
          name: `${input.firstName.trim()} ${input.lastName.trim()}`,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          city: input.city.trim()
        })
        .returning();
      await recordAudit(
        { ...context, tenantId },
        { action: "customer.created", outcome: "success", entityType: "user", entityId: row.id },
        tx
      );
      return customerView(row);
    });
  } catch (error) {
    if (isUniqueViolation(error, "user_tenant_email_key")) {
      throw new PartnerError(409, "customer_exists", "A customer with this email already exists.");
    }
    if (isUniqueViolation(error, "user_tenant_nik_key")) {
      throw new PartnerError(409, "customer_exists", "A customer with this NIK already exists.");
    }
    throw error;
  }
}

export async function getCustomer(tenantId: string, customerId: string) {
  const [row] = await withTenant(tenantId, (tx) =>
    tx.select().from(users).where(eq(users.id, customerId)).limit(1)
  );
  if (!row) {
    throw new PartnerError(404, "not_found", "Customer not found.");
  }
  return customerView(row);
}

export async function openAccount(
  tenantId: string,
  customerId: string,
  input: { name: string; subtype: string },
  context: AuditContext
) {
  await getCustomer(tenantId, customerId);
  const account = await createBankForUser(
    tenantId,
    customerId,
    {
      institution: "BangkeBank Sandbox",
      name: input.name,
      subtype: input.subtype,
      mask: String(Math.floor(Math.random() * 10_000)).padStart(4, "0"),
      routingHint: "Partner API account"
    },
    context
  );
  return accountView(account);
}

async function findAccount(tenantId: string, accountId: string) {
  const [row] = await withTenant(tenantId, (tx) =>
    tx.select().from(bankAccounts).where(eq(bankAccounts.id, accountId)).limit(1)
  );
  if (!row) {
    throw new PartnerError(404, "not_found", "Account not found.");
  }
  return row;
}

export async function getAccount(tenantId: string, accountId: string) {
  return accountView(await findAccount(tenantId, accountId));
}

export async function getStatement(
  tenantId: string,
  accountId: string,
  options: { cursor: Cursor | null; limit: number }
) {
  await findAccount(tenantId, accountId);
  const { cursor, limit } = options;
  const rows = await withTenant(tenantId, (tx) =>
    tx
      .select()
      .from(bankTransactions)
      .where(
        and(
          eq(bankTransactions.bankAccountId, accountId),
          cursor
            ? or(
                lt(bankTransactions.occurredAt, new Date(cursor.t)),
                and(eq(bankTransactions.occurredAt, new Date(cursor.t)), lt(bankTransactions.id, cursor.id))
              )
            : undefined
        )
      )
      .orderBy(desc(bankTransactions.occurredAt), desc(bankTransactions.id))
      .limit(limit + 1)
  );
  const page = rows.slice(0, limit);
  return {
    data: page.map(lineView),
    nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null
  };
}

export async function getTransfer(tenantId: string, transferId: string) {
  const [row] = await withTenant(tenantId, (tx) =>
    tx.select().from(transfers).where(eq(transfers.id, transferId)).limit(1)
  );
  if (!row) {
    throw new PartnerError(404, "not_found", "Transfer not found.");
  }
  return transferView(row);
}

export type PartnerTransferInput = {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  note?: string;
  idempotencyKey: string;
};

// Partners name both accounts by id; the web flow's recipient email check
// doesn't apply. Reuses createTransferForUser for locking, the ledger, failed
// attempts and idempotency (keyed per tenant, sending customer and key).
export async function createPartnerTransfer(
  tenantId: string,
  input: PartnerTransferInput,
  context: AuditContext
) {
  const accounts = await withTenant(tenantId, (tx) =>
    tx
      .select({ account: bankAccounts, ownerEmail: users.email })
      .from(bankAccounts)
      .innerJoin(users, eq(users.id, bankAccounts.userId))
      .where(inArray(bankAccounts.id, [input.fromAccountId, input.toAccountId]))
  );
  const from = accounts.find((row) => row.account.id === input.fromAccountId);
  const to = accounts.find((row) => row.account.id === input.toAccountId);
  if (!from || !to) {
    throw new PartnerError(404, "not_found", `${from ? "Destination" : "Source"} account not found.`);
  }

  try {
    const result = await createTransferForUser(
      tenantId,
      from.account.userId,
      {
        senderBankAccountId: from.account.id,
        recipientEmail: to.ownerEmail,
        recipientShareableId: to.account.shareableId,
        amount: input.amount,
        note: input.note,
        idempotencyKey: input.idempotencyKey
      },
      context
    );
    const original = result.transfer;
    // A reused key must describe the same transfer; anything else is a client bug.
    if (
      result.replayed &&
      (original.amount !== input.amount ||
        original.senderBankAccountId !== input.fromAccountId ||
        original.receiverBankAccountId !== input.toAccountId)
    ) {
      throw new PartnerError(
        422,
        "idempotency_key_reused",
        "This Idempotency-Key was already used for a different transfer."
      );
    }
    return { transfer: transferView(original), replayed: result.replayed };
  } catch (error) {
    if (error instanceof TransferError) {
      throw new PartnerError(error.status, error.status === 404 ? "not_found" : "invalid_transfer", error.message);
    }
    throw error;
  }
}

export async function listLedgerEntries(tenantId: string, options: { cursor: Cursor | null; limit: number }) {
  const { cursor, limit } = options;
  return withTenant(tenantId, async (tx) => {
    const entries = await tx
      .select()
      .from(ledgerEntries)
      .where(
        cursor
          ? or(
              lt(ledgerEntries.occurredAt, new Date(cursor.t)),
              and(eq(ledgerEntries.occurredAt, new Date(cursor.t)), lt(ledgerEntries.id, cursor.id))
            )
          : undefined
      )
      .orderBy(desc(ledgerEntries.occurredAt), desc(ledgerEntries.id))
      .limit(limit + 1);
    const page = entries.slice(0, limit);
    const postings = page.length
      ? await tx
          .select()
          .from(ledgerPostings)
          .where(inArray(ledgerPostings.entryId, page.map((entry) => entry.id)))
      : [];
    return {
      data: page.map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        description: entry.description,
        occurredAt: entry.occurredAt,
        postings: postings
          .filter((posting) => posting.entryId === entry.id)
          .map((posting) => ({
            accountId: posting.bankAccountId,
            systemAccount: posting.systemAccount,
            amount: posting.amount
          }))
      })),
      nextCursor: entries.length > limit ? encodeCursor(page[page.length - 1]) : null
    };
  });
}
