ALTER TABLE "bankTransaction" DROP CONSTRAINT "bankTransaction_userId_user_id_fk";
--> statement-breakpoint
ALTER TABLE "bankTransaction" DROP CONSTRAINT "bankTransaction_bankAccountId_bankAccount_id_fk";
--> statement-breakpoint
ALTER TABLE "transfer" DROP CONSTRAINT "transfer_senderUserId_user_id_fk";
--> statement-breakpoint
ALTER TABLE "transfer" DROP CONSTRAINT "transfer_senderBankAccountId_bankAccount_id_fk";
--> statement-breakpoint
ALTER TABLE "transfer" ALTER COLUMN "channel" SET DEFAULT 'Sandbox transfer';--> statement-breakpoint
ALTER TABLE "transfer" ADD COLUMN "idempotencyKey" text;--> statement-breakpoint
ALTER TABLE "bankTransaction" ADD CONSTRAINT "bankTransaction_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bankTransaction" ADD CONSTRAINT "bankTransaction_bankAccountId_bankAccount_id_fk" FOREIGN KEY ("bankAccountId") REFERENCES "public"."bankAccount"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_senderUserId_user_id_fk" FOREIGN KEY ("senderUserId") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_senderBankAccountId_bankAccount_id_fk" FOREIGN KEY ("senderBankAccountId") REFERENCES "public"."bankAccount"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "transfer_sender_idempotency_key" ON "transfer" USING btree ("senderUserId","idempotencyKey");--> statement-breakpoint
ALTER TABLE "bankAccount" ADD CONSTRAINT "bank_account_available_non_negative" CHECK ("bankAccount"."availableBalance" >= 0);--> statement-breakpoint
ALTER TABLE "bankTransaction" ADD CONSTRAINT "bank_transaction_amount_positive" CHECK ("bankTransaction"."amount" > 0);--> statement-breakpoint
ALTER TABLE "bankTransaction" ADD CONSTRAINT "bank_transaction_direction_valid" CHECK ("bankTransaction"."direction" in ('credit', 'debit'));--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_amount_positive" CHECK ("transfer"."amount" > 0);