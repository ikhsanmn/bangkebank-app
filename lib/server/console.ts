import { and, desc, eq, gte, lt, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { apiRequests, auditEvents, tenantMembers, tenants, TENANT_ROLES } from "@/lib/db/schema";
import { withTenant } from "@/lib/server/tenant";

// The tenant console: where a fintech's staff manage API keys and read their
// audit log and usage. Staff sign in with the web app's better-auth accounts
// (demo-tenant users); a tenantMember row grants them a role in a tenant.
// tenant and tenantMember sit outside RLS, so membership can be resolved
// before any tenant scope exists.

export type TenantRole = (typeof TENANT_ROLES)[number];
export type Membership = { tenantId: string; slug: string; name: string; status: string; role: TenantRole };

const MANAGERS: readonly TenantRole[] = ["owner", "admin"];

export function canManageKeys(role: TenantRole) {
  return MANAGERS.includes(role);
}

export async function listMemberships(userId: string): Promise<Membership[]> {
  const rows = await db
    .select({
      tenantId: tenants.id,
      slug: tenants.slug,
      name: tenants.name,
      status: tenants.status,
      role: tenantMembers.role
    })
    .from(tenantMembers)
    .innerJoin(tenants, eq(tenants.id, tenantMembers.tenantId))
    .where(eq(tenantMembers.userId, userId))
    .orderBy(tenants.name);
  return rows as Membership[];
}

// Null when the user isn't a member: callers answer 404, never 403, so the
// console doesn't confirm which tenant slugs exist.
export async function getMembership(userId: string, slug: string): Promise<Membership | null> {
  const memberships = await listMemberships(userId);
  return memberships.find((membership) => membership.slug === slug) ?? null;
}

export async function addMember(tenantId: string, userId: string, role: TenantRole) {
  await db.insert(tenantMembers).values({ tenantId, userId, role }).onConflictDoUpdate({
    target: [tenantMembers.tenantId, tenantMembers.userId],
    set: { role }
  });
}

export const AUDIT_PAGE_SIZE = 50;

export async function listAuditEvents(
  tenantId: string,
  options: { action?: string; before?: { occurredAt: Date; id: string } | null } = {}
) {
  const { action, before } = options;
  const rows = await withTenant(tenantId, (tx) =>
    tx
      .select()
      .from(auditEvents)
      .where(
        and(
          action ? eq(auditEvents.action, action) : undefined,
          before
            ? or(
                lt(auditEvents.occurredAt, before.occurredAt),
                and(eq(auditEvents.occurredAt, before.occurredAt), lt(auditEvents.id, before.id))
              )
            : undefined
        )
      )
      .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id))
      .limit(AUDIT_PAGE_SIZE + 1)
  );
  return { events: rows.slice(0, AUDIT_PAGE_SIZE), hasMore: rows.length > AUDIT_PAGE_SIZE };
}

export async function listAuditActions(tenantId: string) {
  const rows = await withTenant(tenantId, (tx) =>
    tx.selectDistinct({ action: auditEvents.action }).from(auditEvents).orderBy(auditEvents.action)
  );
  return rows.map((row) => row.action);
}

export const USAGE_WINDOW_DAYS = 14;

// Requests per Jakarta calendar day and per route over the last two weeks.
export async function getUsageSummary(tenantId: string) {
  const since = new Date(Date.now() - USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return withTenant(tenantId, async (tx) => {
    const day = sql<string>`to_char(${apiRequests.occurredAt} at time zone 'Asia/Jakarta', 'YYYY-MM-DD')`;
    const errors = sql<number>`count(*) filter (where ${apiRequests.status} >= 400)::int`;
    const total = sql<number>`count(*)::int`;
    const daily = await tx
      .select({ day, total, errors })
      .from(apiRequests)
      .where(gte(apiRequests.occurredAt, since))
      .groupBy(sql`1`)
      .orderBy(sql`1`);
    const byRoute = await tx
      .select({
        method: apiRequests.method,
        route: apiRequests.route,
        total,
        errors,
        p95Ms: sql<number>`(percentile_cont(0.95) within group (order by ${apiRequests.durationMs}))::int`
      })
      .from(apiRequests)
      .where(gte(apiRequests.occurredAt, since))
      .groupBy(apiRequests.method, apiRequests.route)
      .orderBy(desc(total));
    const totals = daily.reduce(
      (sum, row) => ({ total: sum.total + row.total, errors: sum.errors + row.errors }),
      { total: 0, errors: 0 }
    );
    return { daily, byRoute, totals };
  });
}
