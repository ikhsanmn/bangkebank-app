import { auditEvents } from "@/lib/db/schema";
import { type TenantTx, withTenant } from "@/lib/server/tenant";

type Executor = Pick<TenantTx, "insert">;

export type AuditContext = {
  // Required to record: row-level security only accepts rows for the
  // transaction's tenant. Null is reserved for future platform-level events.
  tenantId?: string | null;
  actorUserId: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type AuditEvent = {
  action: string;
  outcome: "success" | "failure";
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
};

// The client address as reported by the proxy chain. It is recorded for
// investigation only and never used for authorization, since it can be forged.
export function auditContextFrom(
  request: Pick<Request, "headers">,
  actorUserId: string | null
): AuditContext {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    actorUserId,
    ipAddress: forwarded || request.headers.get("x-real-ip"),
    userAgent: request.headers.get("user-agent")
  };
}

// Pass a transaction as `executor` to make the event commit or roll back with
// the change it describes; without one, it commits in its own tenant transaction.
export async function recordAudit(
  context: AuditContext,
  event: AuditEvent,
  executor?: Executor
) {
  if (!executor) {
    const tenantId = context.tenantId;
    if (!tenantId) {
      throw new Error(`Audit event ${event.action} has no tenant.`);
    }
    await withTenant(tenantId, (tx) => recordAudit(context, event, tx));
    return;
  }
  await executor.insert(auditEvents).values({
    id: crypto.randomUUID(),
    tenantId: context.tenantId ?? null,
    actorUserId: context.actorUserId,
    action: event.action,
    outcome: event.outcome,
    entityType: event.entityType ?? null,
    entityId: event.entityId ?? null,
    ipAddress: context.ipAddress ?? null,
    userAgent: context.userAgent ?? null,
    metadata: event.metadata ?? {}
  });
}
