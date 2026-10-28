CREATE TABLE "auditEvent" (
	"id" text PRIMARY KEY NOT NULL,
	"actorUserId" text,
	"action" text NOT NULL,
	"outcome" text NOT NULL,
	"entityType" text,
	"entityId" text,
	"ipAddress" text,
	"userAgent" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurredAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_event_outcome_valid" CHECK ("auditEvent"."outcome" in ('success', 'failure'))
);
--> statement-breakpoint
CREATE TABLE "ledgerEntry" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"occurredAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entry_kind_valid" CHECK ("kind" in ('sandbox_funding', 'transfer', 'external_payment', 'external_receipt'))
);
--> statement-breakpoint
CREATE TABLE "ledgerPosting" (
	"id" text PRIMARY KEY NOT NULL,
	"entryId" text NOT NULL,
	"bankAccountId" text,
	"systemAccount" text,
	"amount" bigint NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_posting_amount_non_zero" CHECK ("ledgerPosting"."amount" <> 0),
	CONSTRAINT "ledger_posting_one_target" CHECK (("ledgerPosting"."bankAccountId" is null) <> ("ledgerPosting"."systemAccount" is null)),
	CONSTRAINT "ledger_posting_system_account_valid" CHECK ("systemAccount" is null or "systemAccount" in ('SANDBOX_FUNDING', 'EXTERNAL_CLEARING'))
);
--> statement-breakpoint
ALTER TABLE "bankAccount" ALTER COLUMN "currentBalance" SET DATA TYPE bigint USING round("currentBalance");--> statement-breakpoint
ALTER TABLE "bankAccount" ALTER COLUMN "availableBalance" SET DATA TYPE bigint USING round("availableBalance");--> statement-breakpoint
ALTER TABLE "bankTransaction" ALTER COLUMN "amount" SET DATA TYPE bigint USING greatest(round("amount"), 1);--> statement-breakpoint
ALTER TABLE "bankTransaction" ALTER COLUMN "amount" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "transfer" ALTER COLUMN "amount" SET DATA TYPE bigint USING greatest(round("amount"), 1);--> statement-breakpoint
ALTER TABLE "transfer" ALTER COLUMN "amount" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "transfer" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "bankAccount" ADD COLUMN "currency" text DEFAULT 'IDR' NOT NULL;--> statement-breakpoint
ALTER TABLE "bankTransaction" ADD COLUMN "entryId" text;--> statement-breakpoint
ALTER TABLE "transfer" ADD COLUMN "failureReason" text;--> statement-breakpoint
ALTER TABLE "transfer" ADD COLUMN "entryId" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "nik" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "nikLast4" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ledgerPosting" ADD CONSTRAINT "ledgerPosting_entryId_ledgerEntry_id_fk" FOREIGN KEY ("entryId") REFERENCES "public"."ledgerEntry"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledgerPosting" ADD CONSTRAINT "ledgerPosting_bankAccountId_bankAccount_id_fk" FOREIGN KEY ("bankAccountId") REFERENCES "public"."bankAccount"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_event_actor_idx" ON "auditEvent" USING btree ("actorUserId","occurredAt");--> statement-breakpoint
CREATE INDEX "audit_event_entity_idx" ON "auditEvent" USING btree ("entityType","entityId");--> statement-breakpoint
CREATE INDEX "ledger_posting_entry_idx" ON "ledgerPosting" USING btree ("entryId");--> statement-breakpoint
CREATE INDEX "ledger_posting_bank_idx" ON "ledgerPosting" USING btree ("bankAccountId");--> statement-breakpoint
ALTER TABLE "bankTransaction" ADD CONSTRAINT "bankTransaction_entryId_ledgerEntry_id_fk" FOREIGN KEY ("entryId") REFERENCES "public"."ledgerEntry"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_entryId_ledgerEntry_id_fk" FOREIGN KEY ("entryId") REFERENCES "public"."ledgerEntry"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" RENAME COLUMN "state" TO "province";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "ssnLast4";--> statement-breakpoint
-- Backfill: give existing data a ledger so every balance equals the sum of its
-- postings before the guard triggers (0003) start enforcing it.
UPDATE "transfer" SET "status" = CASE "status" WHEN 'Completed' THEN 'settled' WHEN 'Processing' THEN 'pending' ELSE 'failed' END;
--> statement-breakpoint
UPDATE "bankAccount" SET "availableBalance" = "currentBalance";
--> statement-breakpoint
CREATE TEMP TABLE "_legacy_transfer" AS
  SELECT "id" AS "transferId", gen_random_uuid()::text AS "entryId" FROM "transfer" WHERE "status" = 'settled';
--> statement-breakpoint
INSERT INTO "ledgerEntry" ("id", "kind", "description", "occurredAt")
  SELECT l."entryId", 'transfer', 'Transfer (migrated)', coalesce(t."completedAt", t."createdAt")
  FROM "_legacy_transfer" l JOIN "transfer" t ON t."id" = l."transferId";
--> statement-breakpoint
INSERT INTO "ledgerPosting" ("id", "entryId", "bankAccountId", "systemAccount", "amount")
  SELECT gen_random_uuid()::text, l."entryId", t."senderBankAccountId", NULL, -t."amount"
  FROM "_legacy_transfer" l JOIN "transfer" t ON t."id" = l."transferId"
  UNION ALL
  SELECT gen_random_uuid()::text, l."entryId", t."receiverBankAccountId",
    CASE WHEN t."receiverBankAccountId" IS NULL THEN 'EXTERNAL_CLEARING' END, t."amount"
  FROM "_legacy_transfer" l JOIN "transfer" t ON t."id" = l."transferId";
--> statement-breakpoint
UPDATE "transfer" t SET "entryId" = l."entryId" FROM "_legacy_transfer" l WHERE t."id" = l."transferId";
--> statement-breakpoint
DROP TABLE "_legacy_transfer";
--> statement-breakpoint
CREATE TEMP TABLE "_opening" AS
  SELECT a."id" AS "accountId", a."createdAt", gen_random_uuid()::text AS "entryId",
    a."currentBalance" - coalesce(sum(p."amount"), 0) AS "amount"
  FROM "bankAccount" a LEFT JOIN "ledgerPosting" p ON p."bankAccountId" = a."id"
  GROUP BY a."id";
--> statement-breakpoint
DELETE FROM "_opening" WHERE "amount" = 0;
--> statement-breakpoint
INSERT INTO "ledgerEntry" ("id", "kind", "description", "occurredAt")
  SELECT "entryId", 'sandbox_funding', 'Opening balance (migrated)', "createdAt" FROM "_opening";
--> statement-breakpoint
INSERT INTO "ledgerPosting" ("id", "entryId", "bankAccountId", "systemAccount", "amount")
  SELECT gen_random_uuid()::text, "entryId", "accountId", NULL, "amount" FROM "_opening"
  UNION ALL
  SELECT gen_random_uuid()::text, "entryId", NULL, 'SANDBOX_FUNDING', -"amount" FROM "_opening";
--> statement-breakpoint
DROP TABLE "_opening";
--> statement-breakpoint
ALTER TABLE "bankAccount" ADD CONSTRAINT "bank_account_currency_idr" CHECK ("bankAccount"."currency" = 'IDR');--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_status_valid" CHECK ("transfer"."status" in ('pending', 'settled', 'failed'));--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_settled_has_entry" CHECK (("transfer"."status" = 'settled') = ("transfer"."entryId" is not null));