-- Row-level security: every tenant-scoped row is visible only inside a
-- transaction that called set_config('app.tenant_id', <tenant>, true)
-- (lib/server/tenant.ts withTenant). With no tenant set, nothing matches, so a
-- forgotten scope fails closed.
--
-- The app runs as bangkebank_app (lib/db: SET ROLE on every new connection):
-- no superuser, no BYPASSRLS, not a table owner. FORCE makes the policies bind
-- the owner as well; only superusers bypass them. Roles are cluster-wide, so
-- creating it is idempotent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bangkebank_app') THEN
    CREATE ROLE bangkebank_app NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;
--> statement-breakpoint
GRANT bangkebank_app TO CURRENT_USER;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO bangkebank_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bangkebank_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bangkebank_app;
--> statement-breakpoint
CREATE FUNCTION bb_current_tenant() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')
$$;
--> statement-breakpoint
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "user" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "user"
  USING ("tenantId" = bb_current_tenant())
  WITH CHECK ("tenantId" = bb_current_tenant());
--> statement-breakpoint
ALTER TABLE "bankAccount" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "bankAccount" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "bankAccount"
  USING ("tenantId" = bb_current_tenant())
  WITH CHECK ("tenantId" = bb_current_tenant());
--> statement-breakpoint
ALTER TABLE "ledgerEntry" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ledgerEntry" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "ledgerEntry"
  USING ("tenantId" = bb_current_tenant())
  WITH CHECK ("tenantId" = bb_current_tenant());
--> statement-breakpoint
ALTER TABLE "ledgerPosting" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ledgerPosting" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "ledgerPosting"
  USING ("tenantId" = bb_current_tenant())
  WITH CHECK ("tenantId" = bb_current_tenant());
--> statement-breakpoint
ALTER TABLE "bankTransaction" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "bankTransaction" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "bankTransaction"
  USING ("tenantId" = bb_current_tenant())
  WITH CHECK ("tenantId" = bb_current_tenant());
--> statement-breakpoint
ALTER TABLE "transfer" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "transfer" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "transfer"
  USING ("tenantId" = bb_current_tenant())
  WITH CHECK ("tenantId" = bb_current_tenant());
--> statement-breakpoint
ALTER TABLE "auditEvent" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "auditEvent" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "auditEvent"
  USING ("tenantId" = bb_current_tenant())
  WITH CHECK ("tenantId" = bb_current_tenant());
