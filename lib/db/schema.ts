import {
  boolean,
  index,
  numeric,
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
    address1: text("address1").notNull().default(""),
    city: text("city").notNull().default(""),
    state: text("state").notNull().default(""),
    postalCode: text("postalCode").notNull().default(""),
    dateOfBirth: text("dateOfBirth").notNull().default(""),
    ssnLast4: text("ssnLast4").notNull().default(""),
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
    currentBalance: numeric("currentBalance", {
      precision: 12,
      scale: 2,
      mode: "number"
    })
      .notNull()
      .default(0),
    availableBalance: numeric("availableBalance", {
      precision: 12,
      scale: 2,
      mode: "number"
    })
      .notNull()
      .default(0),
    routingHint: text("routingHint").notNull().default(""),
    fundingSourceUrl: text("fundingSourceUrl"),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    userIdx: index("bank_account_user_idx").on(table.userId),
    shareableIdx: uniqueIndex("bank_account_shareable_key").on(table.shareableId)
  })
);

export const bankTransactions = pgTable(
  "bankTransaction",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bankAccountId: text("bankAccountId")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2, mode: "number" })
      .notNull()
      .default(0),
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
    occurredIdx: index("bank_transaction_occurred_idx").on(table.occurredAt)
  })
);

export const transfers = pgTable(
  "transfer",
  {
    id: text("id").primaryKey(),
    senderUserId: text("senderUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    senderBankAccountId: text("senderBankAccountId")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "cascade" }),
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
    amount: numeric("amount", { precision: 12, scale: 2, mode: "number" })
      .notNull()
      .default(0),
    note: text("note"),
    status: text("status").notNull().default("Processing"),
    channel: text("channel").notNull().default("ACH"),
    createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completedAt", { withTimezone: true })
  },
  (table) => ({
    senderIdx: index("transfer_sender_idx").on(table.senderUserId),
    receiverIdx: index("transfer_receiver_idx").on(table.receiverUserId),
    senderBankIdx: index("transfer_sender_bank_idx").on(table.senderBankAccountId)
  })
);

export const schema = {
  users,
  sessions,
  accounts,
  verifications,
  bankAccounts,
  bankTransactions,
  transfers
};
