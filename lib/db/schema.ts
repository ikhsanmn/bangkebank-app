import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("emailVerified").notNull().default(false),
    image: text("image"),
    firstName: text("firstName").notNull().default(""),
    lastName: text("lastName").notNull().default(""),
    // address1, dateOfBirth and nik hold AES-GCM ciphertext (lib/server/pii.ts).
    address1: text("address1").notNull().default(""),
    city: text("city").notNull().default(""),
    province: text("province").notNull().default(""),
    postalCode: text("postalCode").notNull().default(""),
    dateOfBirth: text("dateOfBirth").notNull().default(""),
    nik: text("nik").notNull().default(""),
    nikLast4: text("nikLast4").notNull().default(""),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    emailIdx: uniqueIndex("user_email_key").on(table.email)
  })
);

export const sessions = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    tokenIdx: uniqueIndex("session_token_key").on(table.token),
    userIdx: index("session_user_idx").on(table.userId)
  })
);

export const accounts = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("accountId").notNull(),
    providerId: text("providerId").notNull(),
    accessToken: text("accessToken"),
    refreshToken: text("refreshToken"),
    accessTokenExpiresAt: timestamp("accessTokenExpiresAt", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", { withTimezone: true }),
    scope: text("scope"),
    idToken: text("idToken"),
    password: text("password"),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userIdx: index("account_user_idx").on(table.userId),
    providerAccountIdx: uniqueIndex("account_provider_account_key").on(
      table.providerId,
      table.accountId
    )
  })
);

export const verifications = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    identifierIdx: index("verification_identifier_idx").on(table.identifier)
  })
);

export const bankAccounts = pgTable(
  "bankAccount",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    institution: text("institution").notNull(),
    name: text("name").notNull(),
    subtype: text("subtype").notNull(),
    mask: text("mask").notNull(),
    shareableId: text("shareableId").notNull(),
    // Whole rupiah. Maintained only by the ledger_posting trigger: a balance is
    // the sum of the account's postings.
    currency: text("currency").notNull().default("IDR"),
    currentBalance: bigint("currentBalance", { mode: "number" }).notNull().default(0),
    availableBalance: bigint("availableBalance", { mode: "number" }).notNull().default(0),
    routingHint: text("routingHint").notNull().default(""),
    fundingSourceUrl: text("fundingSourceUrl"),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userIdx: index("bank_account_user_idx").on(table.userId),
    shareableIdx: uniqueIndex("bank_account_shareable_key").on(table.shareableId),
    availableNonNegative: check(
      "bank_account_available_non_negative",
      sql`${table.availableBalance} >= 0`
    ),
    currencyIdr: check("bank_account_currency_idr", sql`${table.currency} = 'IDR'`)
  })
);

export const SYSTEM_ACCOUNTS = ["SANDBOX_FUNDING", "EXTERNAL_CLEARING"] as const;
export type SystemAccount = (typeof SYSTEM_ACCOUNTS)[number];

export const LEDGER_ENTRY_KINDS = [
  "sandbox_funding",
  "transfer",
  "external_payment",
  "external_receipt"
] as const;

// One balanced journal entry. Its postings must sum to zero (enforced by a
// deferred constraint trigger in drizzle/0003_ledger_guards.sql).
export const ledgerEntries = pgTable(
  "ledgerEntry",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    description: text("description").notNull(),
    occurredAt: timestamp("occurredAt", { withTimezone: true }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    kindValid: check(
      "ledger_entry_kind_valid",
      sql.raw(`"kind" in (${LEDGER_ENTRY_KINDS.map((kind) => `'${kind}'`).join(", ")})`)
    )
  })
);

// Signed amounts in whole rupiah: positive raises the account's balance.
// Each posting hits exactly one customer account or one system account.
export const ledgerPostings = pgTable(
  "ledgerPosting",
  {
    id: text("id").primaryKey(),
    entryId: text("entryId")
      .notNull()
      .references(() => ledgerEntries.id, { onDelete: "restrict" }),
    bankAccountId: text("bankAccountId").references(() => bankAccounts.id, {
      onDelete: "restrict"
    }),
    systemAccount: text("systemAccount"),
    amount: bigint("amount", { mode: "number" }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    entryIdx: index("ledger_posting_entry_idx").on(table.entryId),
    bankIdx: index("ledger_posting_bank_idx").on(table.bankAccountId),
    amountNonZero: check("ledger_posting_amount_non_zero", sql`${table.amount} <> 0`),
    oneTarget: check(
      "ledger_posting_one_target",
      sql`(${table.bankAccountId} is null) <> (${table.systemAccount} is null)`
    ),
    systemAccountValid: check(
      "ledger_posting_system_account_valid",
      sql.raw(
        `"systemAccount" is null or "systemAccount" in (${SYSTEM_ACCOUNTS.map((code) => `'${code}'`).join(", ")})`
      )
    )
  })
);

export const bankTransactions = pgTable(
  "bankTransaction",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    bankAccountId: text("bankAccountId")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "restrict" }),
    entryId: text("entryId").references(() => ledgerEntries.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    direction: text("direction").notNull(),
    status: text("status").notNull(),
    channel: text("channel").notNull(),
    category: text("category").notNull(),
    source: text("source").notNull(),
    occurredAt: timestamp("occurredAt", { withTimezone: true }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userIdx: index("bank_transaction_user_idx").on(table.userId),
    bankIdx: index("bank_transaction_bank_idx").on(table.bankAccountId),
    occurredIdx: index("bank_transaction_occurred_idx").on(table.occurredAt),
    amountPositive: check("bank_transaction_amount_positive", sql`${table.amount} > 0`),
    directionValid: check(
      "bank_transaction_direction_valid",
      sql`${table.direction} in ('credit', 'debit')`
    )
  })
);

export const transfers = pgTable(
  "transfer",
  {
    id: text("id").primaryKey(),
    senderUserId: text("senderUserId")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    senderBankAccountId: text("senderBankAccountId")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "restrict" }),
    receiverUserId: text("receiverUserId").references(() => users.id, {
      onDelete: "set null"
    }),
    receiverBankAccountId: text("receiverBankAccountId").references(
      () => bankAccounts.id,
      { onDelete: "set null" }
    ),
    recipientName: text("recipientName").notNull(),
    recipientEmail: text("recipientEmail").notNull(),
    recipientShareableId: text("recipientShareableId").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    note: text("note"),
    // pending -> settled | failed; transitions are enforced by a trigger.
    status: text("status").notNull().default("pending"),
    failureReason: text("failureReason"),
    entryId: text("entryId").references(() => ledgerEntries.id, { onDelete: "restrict" }),
    channel: text("channel").notNull().default("Sandbox transfer"),
    idempotencyKey: text("idempotencyKey"),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completedAt", { withTimezone: true })
  },
  (table) => ({
    senderIdx: index("transfer_sender_idx").on(table.senderUserId),
    receiverIdx: index("transfer_receiver_idx").on(table.receiverUserId),
    senderBankIdx: index("transfer_sender_bank_idx").on(table.senderBankAccountId),
    idempotencyIdx: uniqueIndex("transfer_sender_idempotency_key").on(
      table.senderUserId,
      table.idempotencyKey
    ),
    amountPositive: check("transfer_amount_positive", sql`${table.amount} > 0`),
    statusValid: check(
      "transfer_status_valid",
      sql`${table.status} in ('pending', 'settled', 'failed')`
    ),
    settledHasEntry: check(
      "transfer_settled_has_entry",
      sql`(${table.status} = 'settled') = (${table.entryId} is not null)`
    )
  })
);

// Append-only: a trigger rejects UPDATE and DELETE.
export const auditEvents = pgTable(
  "auditEvent",
  {
    id: text("id").primaryKey(),
    actorUserId: text("actorUserId"),
    action: text("action").notNull(),
    outcome: text("outcome").notNull(),
    entityType: text("entityType"),
    entityId: text("entityId"),
    ipAddress: text("ipAddress"),
    userAgent: text("userAgent"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurredAt", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    actorIdx: index("audit_event_actor_idx").on(table.actorUserId, table.occurredAt),
    entityIdx: index("audit_event_entity_idx").on(table.entityType, table.entityId),
    outcomeValid: check("audit_event_outcome_valid", sql`${table.outcome} in ('success', 'failure')`)
  })
);

export const schema = {
  users,
  sessions,
  accounts,
  verifications,
  bankAccounts,
  bankTransactions,
  transfers,
  ledgerEntries,
  ledgerPostings,
  auditEvents
};
