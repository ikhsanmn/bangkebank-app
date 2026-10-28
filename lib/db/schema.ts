import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  primaryKey,
  timestamp,
  unique,
  uniqueIndex
} from "drizzle-orm/pg-core";

// The first-party consumer web app is itself a tenant; drizzle/0004 creates it
// and moved all pre-tenancy data into it.
export const DEMO_TENANT_ID = "tnt_demo";

export const TENANT_STATUSES = ["active", "suspended"] as const;
export const TENANT_ROLES = ["owner", "admin", "viewer"] as const;

function inList(column: string, values: readonly string[]) {
  return sql.raw(`"${column}" in (${values.map((value) => `'${value}'`).join(", ")})`);
}

// A fintech client. Every customer, account, ledger row, transfer and audit
// event belongs to exactly one tenant; composite foreign keys on (tenantId, id)
// make a cross-tenant reference impossible at the database level.
export const tenants = pgTable(
  "tenant",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    slugIdx: uniqueIndex("tenant_slug_key").on(table.slug),
    statusValid: check("tenant_status_valid", inList("status", TENANT_STATUSES))
  })
);

export const users = pgTable(
  "user",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenantId")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
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
    // Keyed HMAC of the NIK (lib/server/pii.ts hashNik): the ciphertext is
    // randomised, so uniqueness is checked on this instead.
    nikHash: text("nikHash").notNull().default(""),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    tenantIdKey: unique("user_tenant_id_key").on(table.tenantId, table.id),
    // The same person may be a customer of several fintechs.
    emailIdx: uniqueIndex("user_tenant_email_key").on(table.tenantId, table.email),
    // One customer per NIK per tenant. The public demo tenant is exempt so
    // visitors can all sign up with the example NIK from the README.
    nikIdx: uniqueIndex("user_tenant_nik_key")
      .on(table.tenantId, table.nikHash)
      .where(sql`"nikHash" <> '' and "tenantId" <> 'tnt_demo'`)
  })
);

// Console users of a tenant (its staff), as opposed to its end customers.
export const tenantMembers = pgTable(
  "tenantMember",
  {
    tenantId: text("tenantId")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    pk: primaryKey({ name: "tenant_member_pkey", columns: [table.tenantId, table.userId] }),
    userIdx: index("tenant_member_user_idx").on(table.userId),
    roleValid: check("tenant_member_role_valid", inList("role", TENANT_ROLES))
  })
);

export const API_SCOPES = [
  "customers:read",
  "customers:write",
  "accounts:read",
  "accounts:write",
  "transfers:read",
  "transfers:write",
  "ledger:read"
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

// Partner API credentials (lib/server/api-keys.ts). Outside row-level security
// on purpose: a request is matched to its key, and so to its tenant, by
// `prefix` before any tenant is known. The secret itself is never stored.
export const apiKeys = pgTable(
  "apiKey",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenantId")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    // HMAC-SHA256(API_KEY_PEPPER, secret), base64url.
    secretHash: text("secretHash").notNull(),
    last4: text("last4").notNull(),
    scopes: text("scopes").array().notNull(),
    createdBy: text("createdBy").references(() => users.id, { onDelete: "set null" }),
    lastUsedAt: timestamp("lastUsedAt", { withTimezone: true }),
    expiresAt: timestamp("expiresAt", { withTimezone: true }),
    revokedAt: timestamp("revokedAt", { withTimezone: true }),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    prefixIdx: uniqueIndex("api_key_prefix_key").on(table.prefix),
    tenantIdx: index("api_key_tenant_idx").on(table.tenantId, table.createdAt),
    scopesValid: check(
      "api_key_scopes_valid",
      sql.raw(`"scopes" <@ array[${API_SCOPES.map((scope) => `'${scope}'`).join(", ")}]::text[] and cardinality("scopes") > 0`)
    )
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
    tenantId: text("tenantId").notNull(),
    userId: text("userId").notNull(),
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
    tenantIdKey: unique("bank_account_tenant_id_key").on(table.tenantId, table.id),
    userFk: foreignKey({
      name: "bank_account_user_fk",
      columns: [table.tenantId, table.userId],
      foreignColumns: [users.tenantId, users.id]
    }).onDelete("cascade"),
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
    tenantId: text("tenantId")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    description: text("description").notNull(),
    occurredAt: timestamp("occurredAt", { withTimezone: true }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    tenantIdKey: unique("ledger_entry_tenant_id_key").on(table.tenantId, table.id),
    kindValid: check(
      "ledger_entry_kind_valid",
      sql.raw(`"kind" in (${LEDGER_ENTRY_KINDS.map((kind) => `'${kind}'`).join(", ")})`)
    )
  })
);

// Signed amounts in whole rupiah: positive raises the account's balance.
// Each posting hits exactly one customer account or one system account. System
// accounts are per tenant: each tenant's postings sum to zero on their own.
export const ledgerPostings = pgTable(
  "ledgerPosting",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenantId").notNull(),
    entryId: text("entryId").notNull(),
    bankAccountId: text("bankAccountId"),
    systemAccount: text("systemAccount"),
    amount: bigint("amount", { mode: "number" }).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    entryFk: foreignKey({
      name: "ledger_posting_entry_fk",
      columns: [table.tenantId, table.entryId],
      foreignColumns: [ledgerEntries.tenantId, ledgerEntries.id]
    }).onDelete("restrict"),
    bankFk: foreignKey({
      name: "ledger_posting_bank_fk",
      columns: [table.tenantId, table.bankAccountId],
      foreignColumns: [bankAccounts.tenantId, bankAccounts.id]
    }).onDelete("restrict"),
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
    tenantId: text("tenantId").notNull(),
    userId: text("userId").notNull(),
    bankAccountId: text("bankAccountId").notNull(),
    entryId: text("entryId"),
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
    userFk: foreignKey({
      name: "bank_transaction_user_fk",
      columns: [table.tenantId, table.userId],
      foreignColumns: [users.tenantId, users.id]
    }).onDelete("restrict"),
    bankFk: foreignKey({
      name: "bank_transaction_bank_fk",
      columns: [table.tenantId, table.bankAccountId],
      foreignColumns: [bankAccounts.tenantId, bankAccounts.id]
    }).onDelete("restrict"),
    entryFk: foreignKey({
      name: "bank_transaction_entry_fk",
      columns: [table.tenantId, table.entryId],
      foreignColumns: [ledgerEntries.tenantId, ledgerEntries.id]
    }).onDelete("restrict"),
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
    // Sender and receiver are always in the same tenant; transfers between
    // tenants are not supported (Phase 3).
    tenantId: text("tenantId").notNull(),
    senderUserId: text("senderUserId").notNull(),
    senderBankAccountId: text("senderBankAccountId").notNull(),
    receiverUserId: text("receiverUserId"),
    receiverBankAccountId: text("receiverBankAccountId"),
    recipientName: text("recipientName").notNull(),
    recipientEmail: text("recipientEmail").notNull(),
    recipientShareableId: text("recipientShareableId").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    note: text("note"),
    // pending -> settled | failed; transitions are enforced by a trigger.
    status: text("status").notNull().default("pending"),
    failureReason: text("failureReason"),
    entryId: text("entryId"),
    channel: text("channel").notNull().default("Sandbox transfer"),
    idempotencyKey: text("idempotencyKey"),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completedAt", { withTimezone: true })
  },
  (table) => ({
    senderUserFk: foreignKey({
      name: "transfer_sender_user_fk",
      columns: [table.tenantId, table.senderUserId],
      foreignColumns: [users.tenantId, users.id]
    }).onDelete("restrict"),
    senderBankFk: foreignKey({
      name: "transfer_sender_bank_fk",
      columns: [table.tenantId, table.senderBankAccountId],
      foreignColumns: [bankAccounts.tenantId, bankAccounts.id]
    }).onDelete("restrict"),
    // drizzle/0004 narrows these two to SET NULL ("receiver…") so a deleted
    // receiver doesn't null out tenantId; Drizzle can't express the column list.
    receiverUserFk: foreignKey({
      name: "transfer_receiver_user_fk",
      columns: [table.tenantId, table.receiverUserId],
      foreignColumns: [users.tenantId, users.id]
    }).onDelete("set null"),
    receiverBankFk: foreignKey({
      name: "transfer_receiver_bank_fk",
      columns: [table.tenantId, table.receiverBankAccountId],
      foreignColumns: [bankAccounts.tenantId, bankAccounts.id]
    }).onDelete("set null"),
    entryFk: foreignKey({
      name: "transfer_entry_fk",
      columns: [table.tenantId, table.entryId],
      foreignColumns: [ledgerEntries.tenantId, ledgerEntries.id]
    }).onDelete("restrict"),
    senderIdx: index("transfer_sender_idx").on(table.senderUserId),
    receiverIdx: index("transfer_receiver_idx").on(table.receiverUserId),
    senderBankIdx: index("transfer_sender_bank_idx").on(table.senderBankAccountId),
    idempotencyIdx: uniqueIndex("transfer_sender_idempotency_key").on(
      table.tenantId,
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
    // Null only for platform-level events that belong to no tenant.
    tenantId: text("tenantId").references(() => tenants.id, { onDelete: "restrict" }),
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
    tenantIdx: index("audit_event_tenant_idx").on(table.tenantId, table.occurredAt),
    actorIdx: index("audit_event_actor_idx").on(table.actorUserId, table.occurredAt),
    entityIdx: index("audit_event_entity_idx").on(table.entityType, table.entityId),
    outcomeValid: check("audit_event_outcome_valid", sql`${table.outcome} in ('success', 'failure')`)
  })
);

export const schema = {
  tenants,
  tenantMembers,
  apiKeys,
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
