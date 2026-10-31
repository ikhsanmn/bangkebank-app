CREATE TABLE "apiKey" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"secretHash" text NOT NULL,
	"last4" text NOT NULL,
	"scopes" text[] NOT NULL,
	"createdBy" text,
	"lastUsedAt" timestamp with time zone,
	"expiresAt" timestamp with time zone,
	"revokedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_key_scopes_valid" CHECK ("scopes" <@ array['customers:read', 'customers:write', 'accounts:read', 'accounts:write', 'transfers:read', 'transfers:write', 'ledger:read']::text[] and cardinality("scopes") > 0)
);
--> statement-breakpoint
ALTER TABLE "apiKey" ADD CONSTRAINT "apiKey_tenantId_tenant_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apiKey" ADD CONSTRAINT "apiKey_createdBy_user_id_fk" FOREIGN KEY ("createdBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_key_prefix_key" ON "apiKey" USING btree ("prefix");--> statement-breakpoint
CREATE INDEX "api_key_tenant_idx" ON "apiKey" USING btree ("tenantId","createdAt");