CREATE TABLE "apiRequest" (
	"id" text PRIMARY KEY NOT NULL,
	"tenantId" text NOT NULL,
	"apiKeyId" text NOT NULL,
	"method" text NOT NULL,
	"route" text NOT NULL,
	"status" integer NOT NULL,
	"durationMs" integer NOT NULL,
	"idempotencyKey" text,
	"occurredAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "apiRequest" ADD CONSTRAINT "apiRequest_tenantId_tenant_id_fk" FOREIGN KEY ("tenantId") REFERENCES "public"."tenant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apiRequest" ADD CONSTRAINT "apiRequest_apiKeyId_apiKey_id_fk" FOREIGN KEY ("apiKeyId") REFERENCES "public"."apiKey"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_request_key_idx" ON "apiRequest" USING btree ("apiKeyId","occurredAt");--> statement-breakpoint
CREATE INDEX "api_request_tenant_idx" ON "apiRequest" USING btree ("tenantId","occurredAt");--> statement-breakpoint
-- Tenant-scoped like the money tables (see 0005), and append-only like the
-- audit log (see 0003).
ALTER TABLE "apiRequest" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "apiRequest" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "apiRequest"
  USING ("tenantId" = bb_current_tenant())
  WITH CHECK ("tenantId" = bb_current_tenant());
--> statement-breakpoint
CREATE TRIGGER api_request_immutable BEFORE UPDATE OR DELETE ON "apiRequest"
  FOR EACH ROW EXECUTE FUNCTION bb_reject_change();
--> statement-breakpoint
CREATE TRIGGER api_request_no_truncate BEFORE TRUNCATE ON "apiRequest"
  FOR EACH STATEMENT EXECUTE FUNCTION bb_reject_change();
