CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"accessTokenExpiresAt" timestamp with time zone,
	"refreshTokenExpiresAt" timestamp with time zone,
	"scope" text,
	"idToken" text,
	"password" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bankAccount" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"institution" text NOT NULL,
	"name" text NOT NULL,
	"subtype" text NOT NULL,
	"mask" text NOT NULL,
	"shareableId" text NOT NULL,
	"currentBalance" numeric(12, 2) DEFAULT 0 NOT NULL,
	"availableBalance" numeric(12, 2) DEFAULT 0 NOT NULL,
	"routingHint" text DEFAULT '' NOT NULL,
	"fundingSourceUrl" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bankTransaction" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"bankAccountId" text NOT NULL,
	"name" text NOT NULL,
	"amount" numeric(12, 2) DEFAULT 0 NOT NULL,
	"direction" text NOT NULL,
	"status" text NOT NULL,
	"channel" text NOT NULL,
	"category" text NOT NULL,
	"source" text NOT NULL,
	"occurredAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"token" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transfer" (
	"id" text PRIMARY KEY NOT NULL,
	"senderUserId" text NOT NULL,
	"senderBankAccountId" text NOT NULL,
	"receiverUserId" text,
	"receiverBankAccountId" text,
	"recipientName" text NOT NULL,
	"recipientEmail" text NOT NULL,
	"recipientShareableId" text NOT NULL,
	"amount" numeric(12, 2) DEFAULT 0 NOT NULL,
	"note" text,
	"status" text DEFAULT 'Processing' NOT NULL,
	"channel" text DEFAULT 'ACH' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"completedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"firstName" text DEFAULT '' NOT NULL,
	"lastName" text DEFAULT '' NOT NULL,
	"address1" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"state" text DEFAULT '' NOT NULL,
	"postalCode" text DEFAULT '' NOT NULL,
	"dateOfBirth" text DEFAULT '' NOT NULL,
	"ssnLast4" text DEFAULT '' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bankAccount" ADD CONSTRAINT "bankAccount_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bankTransaction" ADD CONSTRAINT "bankTransaction_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bankTransaction" ADD CONSTRAINT "bankTransaction_bankAccountId_bankAccount_id_fk" FOREIGN KEY ("bankAccountId") REFERENCES "public"."bankAccount"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_senderUserId_user_id_fk" FOREIGN KEY ("senderUserId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_senderBankAccountId_bankAccount_id_fk" FOREIGN KEY ("senderBankAccountId") REFERENCES "public"."bankAccount"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_receiverUserId_user_id_fk" FOREIGN KEY ("receiverUserId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer" ADD CONSTRAINT "transfer_receiverBankAccountId_bankAccount_id_fk" FOREIGN KEY ("receiverBankAccountId") REFERENCES "public"."bankAccount"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_account_key" ON "account" USING btree ("providerId","accountId");--> statement-breakpoint
CREATE INDEX "bank_account_user_idx" ON "bankAccount" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_account_shareable_key" ON "bankAccount" USING btree ("shareableId");--> statement-breakpoint
CREATE INDEX "bank_transaction_user_idx" ON "bankTransaction" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "bank_transaction_bank_idx" ON "bankTransaction" USING btree ("bankAccountId");--> statement-breakpoint
CREATE INDEX "bank_transaction_occurred_idx" ON "bankTransaction" USING btree ("occurredAt");--> statement-breakpoint
CREATE UNIQUE INDEX "session_token_key" ON "session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "transfer_sender_idx" ON "transfer" USING btree ("senderUserId");--> statement-breakpoint
CREATE INDEX "transfer_receiver_idx" ON "transfer" USING btree ("receiverUserId");--> statement-breakpoint
CREATE INDEX "transfer_sender_bank_idx" ON "transfer" USING btree ("senderBankAccountId");--> statement-breakpoint
CREATE UNIQUE INDEX "user_email_key" ON "user" USING btree ("email");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");