-- Phase 3: tenants. Existing rows join the demo tenant (the first-party web
-- app). ADD COLUMN with a constant default fills existing rows without firing
-- row triggers, so the append-only guards from 0003 stay enabled throughout.
CREATE TABLE "tenant" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_status_valid" CHECK ("status" in ('active', 'suspended'))
);
--> statement-breakpoint
INSERT INTO "tenant" ("id", "slug", "name") VALUES ('tnt_demo', 'demo', 'BangkeBank Demo');
--> statement-breakpoint
CREATE TABLE "tenantMember" (
	"tenantId" text NOT NULL,
	"userId" text NOT NULL,
	"role" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_member_pkey" PRIMARY KEY("tenantId","userId"),
	CONSTRAINT "tenant_member_role_valid" CHECK ("role" in ('owner', 'admin', 'viewer'))
);
--> statement-breakpoint
ALTER TABLE "bankAccount" DROP CONSTRAINT "bankAccount_userId_user_id_fk";
--> statement-breakpoint
ALTER TABLE "bankTransaction" DROP CONSTRAINT "bankTransaction_userId_user_id_fk";
--> statement-breakpoint
ALTER TABLE "bankTransaction" DROP CONSTRAINT "bankTransaction_bankAccountId_bankAccount_id_fk";
--> statement-breakpoint
ALTER TABLE "bankTransaction" DROP CONSTRAINT "bankTransaction_entryId_ledgerEntry_id_fk";
--> statement-breakpoint
ALTER TABLE "ledgerPosting" DROP CONSTRAINT "ledgerPosting_entryId_ledgerEntry_id_fk";
--> statement-breakpoint
ALTER TABLE "ledgerPosting" DROP CONSTRAINT "ledgerPosting_bankAccountId_bankAccount_id_fk";
--> statement-breakpoint
ALTER TABLE "transfer" DROP CONSTRAINT "transfer_senderUserId_user_id_fk";
--> statement-breakpoint
ALTER TABLE "transfer" DROP CONSTRAINT "transfer_senderBankAccountId_bankAccount_id_fk";
--> statement-breakpoint
ALTER TABLE "transfer" DROP CONSTRAINT "transfer_receiverUserId_user_id_fk";
--> statement-breakpoint
ALTER TABLE "transfer" DROP CONSTRAINT "transfer_receiverBankAccountId_bankAccount_id_fk";
--> statement-breakpoint
ALTER TABLE "transfer" DROP CONSTRAINT "transfer_entryId_ledgerEntry_id_fk";
--> statement-breakpoint
DROP INDEX "user_email_key";
--> statement-breakpoint
DROP INDEX "transfer_sender_idempotency_key";
--> statement-breakpoint
ALTER TABLE "auditEvent" ADD COLUMN "tenantId" text DEFAULT 'tnt_demo';
--> statement-breakpoint
ALTER TABLE "auditEvent" ALTER COLUMN "tenantId" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "bankAccount" ADD COLUMN "tenantId" text DEFAULT 'tnt_demo' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bankAccount" ALTER COLUMN "tenantId" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "bankTransaction" ADD COLUMN "tenantId" text DEFAULT 'tnt_demo' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bankTransaction" ALTER COLUMN "tenantId" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "ledgerEntry" ADD COLUMN "tenantId" text DEFAULT 'tnt_demo' NOT NULL;
--> statement-breakpoint
ALTER TABLE "ledgerEntry" ALTER COLUMN "tenantId" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "ledgerPosting" ADD COLUMN "tenantId" text DEFAULT 'tnt_demo' NOT NULL;
--> statement-breakpoint
ALTER TABLE "ledgerPosting" ALTER COLUMN "tenantId" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "transfer" ADD COLUMN "tenantId" text DEFAULT 'tnt_demo' NOT NULL;
--> statement-breakpoint
ALTER TABLE "transfer" ALTER COLUMN "tenantId" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "tenantId" text DEFAULT 'tnt_demo' NOT NULL;
--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "tenantId" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "nikHash" text DEFAULT '' NOT NULL;
--> statement-breakpoint
-- Composite keys first: the (tenantId, id) foreign keys below reference them.
ALTER TABLE "bankAccount" ADD CONSTRAINT "bank_account_tenant_id_key" UNIQUE("tenantId","id");
--> statement-breakpoint
ALTER TABLE "ledgerEntry" ADD CONSTRAINT "ledger_entry_tenant_id_key" UNIQUE("tenantId","id");
--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_tenant_id_key" UNIQUE("tenantId","id");
--> statement-breakpoint
ALTER TABLE "tenantMember" ADD CONSTRAINT "tenantMember_tenantId_tenant_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tenantMember" ADD CONSTRAINT "tenantMember_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "auditEvent" ADD CONSTRAINT "auditEvent_tenantId_tenant_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bankAccount" ADD CONSTRAINT "bank_account_user_fk" FOREIGN KEY ("tenantId","userId") REFERENCES "public"."user"("tenantId","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bankTransaction" ADD CONSTRAINT "bank_transaction_user_fk" FOREIGN KEY ("tenantId","userId") REFERENCES "public"."user"("tenantId","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bankTransaction" ADD CONSTRAINT "bank_transaction_bank_fk" FOREIGN KEY ("tenantId","bankAccountId") REFERENCES "public"."bankAccount"("tenantId","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bankTransaction" ADD CONSTRAINT "bank_transaction_entry_fk" FOREIGN KEY ("tenantId","entryId") REFERENCES "public"."ledgerEntry"("tenantId","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ledgerEntry" ADD CONSTRAINT "ledgerEntry_tenantId_tenant_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ledgerPosting" ADD CONSTRAINT "ledger_posting_entry_fk" FOREIGN KEY ("tenantId","entryId") REFERENCES "public"."ledgerEntry"("tenantId","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ledgerPosting" ADD CONSTRAINT "ledger_posting_bank_fk" FOREIGN KEY ("tenantId","bankAccountId") REFERENCES "public"."bankAccount"("tenantId","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_sender_user_fk" FOREIGN KEY ("tenantId","senderUserId") REFERENCES "public"."user"("tenantId","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_sender_bank_fk" FOREIGN KEY ("tenantId","senderBankAccountId") REFERENCES "public"."bankAccount"("tenantId","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
-- A deleted receiver nulls only the receiver column, never tenantId (PG 15+).
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_receiver_user_fk" FOREIGN KEY ("tenantId","receiverUserId") REFERENCES "public"."user"("tenantId","id") ON DELETE SET NULL ("receiverUserId") ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_receiver_bank_fk" FOREIGN KEY ("tenantId","receiverBankAccountId") REFERENCES "public"."bankAccount"("tenantId","id") ON DELETE SET NULL ("receiverBankAccountId") ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_entry_fk" FOREIGN KEY ("tenantId","entryId") REFERENCES "public"."ledgerEntry"("tenantId","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_tenantId_tenant_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "tenant_member_user_idx" ON "tenantMember" USING btree ("userId");
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_slug_key" ON "tenant" USING btree ("slug");
--> statement-breakpoint
CREATE INDEX "audit_event_tenant_idx" ON "auditEvent" USING btree ("tenantId","occurredAt");
--> statement-breakpoint
CREATE UNIQUE INDEX "user_tenant_email_key" ON "user" USING btree ("tenantId","email");
--> statement-breakpoint
CREATE UNIQUE INDEX "user_tenant_nik_key" ON "user" USING btree ("tenantId","nikHash") WHERE "nikHash" <> '' and "tenantId" <> 'tnt_demo';
--> statement-breakpoint
CREATE UNIQUE INDEX "transfer_sender_idempotency_key" ON "transfer" USING btree ("tenantId","senderUserId","idempotencyKey");
