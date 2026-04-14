import { pool } from "@/lib/db";

const bootstrapStatements = [
  `create table if not exists "user" (
    "id" text primary key,
    "name" text not null,
    "email" text not null unique,
    "emailVerified" boolean not null default false,
    "image" text,
    "firstName" text not null default '',
    "lastName" text not null default '',
    "address1" text not null default '',
    "city" text not null default '',
    "state" text not null default '',
    "postalCode" text not null default '',
    "dateOfBirth" text not null default '',
    "ssnLast4" text not null default '',
    "createdAt" timestamptz not null default now(),
    "updatedAt" timestamptz not null default now()
  )`,
  `create table if not exists "session" (
    "id" text primary key,
    "userId" text not null references "user"("id") on delete cascade,
    "token" text not null unique,
    "expiresAt" timestamptz not null,
    "ipAddress" text,
    "userAgent" text,
    "createdAt" timestamptz not null default now(),
    "updatedAt" timestamptz not null default now()
  )`,
  `create table if not exists "account" (
    "id" text primary key,
    "userId" text not null references "user"("id") on delete cascade,
    "accountId" text not null,
    "providerId" text not null,
    "accessToken" text,
    "refreshToken" text,
    "accessTokenExpiresAt" timestamptz,
    "refreshTokenExpiresAt" timestamptz,
    "scope" text,
    "idToken" text,
    "password" text,
    "createdAt" timestamptz not null default now(),
    "updatedAt" timestamptz not null default now()
  )`,
  `create unique index if not exists "account_provider_account_key" on "account" ("providerId", "accountId")`,
  `create table if not exists "verification" (
    "id" text primary key,
    "identifier" text not null,
    "value" text not null,
    "expiresAt" timestamptz not null,
    "createdAt" timestamptz not null default now(),
    "updatedAt" timestamptz not null default now()
  )`,
  `create table if not exists "bankAccount" (
    "id" text primary key,
    "userId" text not null references "user"("id") on delete cascade,
    "institution" text not null,
    "name" text not null,
    "subtype" text not null,
    "mask" text not null,
    "shareableId" text not null unique,
    "currentBalance" numeric(12, 2) not null default 0,
    "availableBalance" numeric(12, 2) not null default 0,
    "routingHint" text not null default '',
    "fundingSourceUrl" text,
    "createdAt" timestamptz not null default now(),
    "updatedAt" timestamptz not null default now()
  )`,
  `create table if not exists "bankTransaction" (
    "id" text primary key,
    "userId" text not null references "user"("id") on delete cascade,
    "bankAccountId" text not null references "bankAccount"("id") on delete cascade,
    "name" text not null,
    "amount" numeric(12, 2) not null default 0,
    "direction" text not null,
    "status" text not null,
    "channel" text not null,
    "category" text not null,
    "source" text not null,
    "occurredAt" timestamptz not null,
    "createdAt" timestamptz not null default now()
  )`,
  `create table if not exists "transfer" (
    "id" text primary key,
    "senderUserId" text not null references "user"("id") on delete cascade,
    "senderBankAccountId" text not null references "bankAccount"("id") on delete cascade,
    "receiverUserId" text references "user"("id") on delete set null,
    "receiverBankAccountId" text references "bankAccount"("id") on delete set null,
    "recipientName" text not null,
    "recipientEmail" text not null,
    "recipientShareableId" text not null,
    "amount" numeric(12, 2) not null default 0,
    "note" text,
    "status" text not null default 'Processing',
    "channel" text not null default 'ACH',
    "createdAt" timestamptz not null default now(),
    "completedAt" timestamptz
  )`,
  `create index if not exists "bank_account_user_idx" on "bankAccount" ("userId")`,
  `create index if not exists "bank_transaction_user_idx" on "bankTransaction" ("userId")`,
  `create index if not exists "bank_transaction_bank_idx" on "bankTransaction" ("bankAccountId")`,
  `create index if not exists "transfer_sender_idx" on "transfer" ("senderUserId")`,
  `create index if not exists "transfer_receiver_idx" on "transfer" ("receiverUserId")`
];

let bootstrapPromise: Promise<void> | null = null;

export function ensureDatabase() {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      for (const statement of bootstrapStatements) {
        await pool.query(statement);
      }
    })();
  }

  return bootstrapPromise;
}
