import { existsSync } from "node:fs";
import path from "node:path";

import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { POST as revokeKey } from "@/app/api/console/[tenantSlug]/keys/[keyId]/revoke/route";
import { POST as createKey } from "@/app/api/console/[tenantSlug]/keys/route";
import { GET as openApiJson } from "@/app/api/v1/openapi.json/route";
import { auth } from "@/lib/auth";
import { apiRequests, auditEvents, tenants, users } from "@/lib/db/schema";
import { MAX_TRANSFER_RUPIAH } from "@/lib/format";
import { createApiKey, verifyApiKey } from "@/lib/server/api-keys";
import { recordAudit } from "@/lib/server/audit";
import {
  addMember,
  AUDIT_PAGE_SIZE,
  getMembership,
  getUsageSummary,
  listAuditEvents,
  listMemberships,
  type TenantRole
} from "@/lib/server/console";
import { buildOpenApiDocument, OPERATIONS } from "@/lib/server/openapi";

import { adminDb, createTenant } from "./helpers";

const BASE = "http://localhost:3000";
const PASSWORD = "correct-horse-battery";

// A web-app user (demo tenant) signed in through better-auth, with the session
// cookie a browser would send.
async function signedInStaff() {
  const email = `staff-${crypto.randomUUID().slice(0, 8)}@example.test`;
  await auth.api.signUpEmail({
    body: {
      email,
      password: PASSWORD,
      name: "Console Staff",
      firstName: "Console",
      lastName: "Staff",
      address1: "Jl. Contoh No. 12",
      city: "Medan",
      province: "Sumatera Utara",
      postalCode: "20111",
      dateOfBirth: "1990-08-17",
      nik: "1971015708900001"
    }
  });
  const { headers, response } = await auth.api.signInEmail({ body: { email, password: PASSWORD }, returnHeaders: true });
  const cookie = (headers.get("set-cookie") ?? "").split(";")[0];
  return { userId: response.user.id, cookie };
}

async function tenantWithMember(role: TenantRole | null) {
  const tenantId = await createTenant("console");
  const [{ slug }] = await adminDb.select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, tenantId));
  const staff = await signedInStaff();
  if (role) {
    await addMember(tenantId, staff.userId, role);
  }
  return { tenantId, slug, ...staff };
}

function consoleRequest(url: string, cookie: string | null, body?: unknown) {
  return new Request(`${BASE}${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

describe("OpenAPI document", () => {
  it("describes every partner route, with a matching route file", () => {
    const document = buildOpenApiDocument(BASE);
    expect(document.openapi).toBe("3.1.0");
    expect(Object.keys(document.paths)).toHaveLength(OPERATIONS.length);

    for (const op of OPERATIONS) {
      const dir = op.path.replace(/^\//, "app/").replace(/\{(\w+)\}/g, "[$1]");
      expect(existsSync(path.join(process.cwd(), dir, "route.ts")), dir).toBe(true);
      const operation = (document.paths[op.path] as Record<string, Record<string, unknown>>)[op.method];
      expect(Object.keys(operation.responses as object)).toEqual(expect.arrayContaining(["401", "403", "429"]));
      expect(operation["x-scope"]).toBe(op.scope);
    }
  });

  it("publishes the request rules the server enforces", () => {
    const document = buildOpenApiDocument(BASE);
    const transfer = (document.paths["/api/v1/transfers"] as Record<string, Record<string, unknown>>).post;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = (transfer.requestBody as any).content["application/json"].schema;
    expect(body.required).toEqual(expect.arrayContaining(["fromAccountId", "toAccountId", "amount"]));
    expect(body.properties.amount).toMatchObject({ type: "integer", maximum: MAX_TRANSFER_RUPIAH });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((transfer.parameters as any[]).find((p) => p.name === "Idempotency-Key")).toMatchObject({ in: "header", required: true });
  });

  it("is served publicly at /api/v1/openapi.json", async () => {
    const response = openApiJson();
    expect(response.status).toBe(200);
    const document = await response.json();
    expect(document.info.title).toBe("BangkeBank partner API");
  });
});

describe("tenant console", () => {
  it("lists only the tenants a user belongs to", async () => {
    const member = await tenantWithMember("viewer");
    const other = await createTenant("not-mine");
    const memberships = await listMemberships(member.userId);
    expect(memberships.map((m) => m.tenantId)).toEqual([member.tenantId]);
    expect(await getMembership(member.userId, member.slug)).toMatchObject({ role: "viewer" });
    expect(other).not.toBe(member.tenantId);
  });

  it("lets owners and admins create keys, but not viewers, non-members or anonymous users", async () => {
    const admin = await tenantWithMember("admin");
    const created = await createKey(
      consoleRequest(`/api/console/${admin.slug}/keys`, admin.cookie, { name: "Backend", scopes: ["accounts:read"] }),
      { params: { tenantSlug: admin.slug } }
    );
    expect(created.status).toBe(201);
    expect(created.headers.get("cache-control")).toBe("no-store");
    const { token, apiKey } = await created.json();
    expect(await verifyApiKey(token)).toMatchObject({ tenantId: admin.tenantId, scopes: ["accounts:read"] });
    expect(apiKey).not.toHaveProperty("secretHash");

    const [event] = await adminDb.select().from(auditEvents).where(eq(auditEvents.entityId, apiKey.id));
    expect(event).toMatchObject({ action: "api_key.created", tenantId: admin.tenantId, actorUserId: admin.userId });

    const body = { name: "Nope", scopes: ["accounts:read"] };
    const viewer = await tenantWithMember("viewer");
    const outsider = await tenantWithMember(null);
    const cases: Array<[string, string | null, string, number]> = [
      ["viewer", viewer.cookie, viewer.slug, 403],
      ["non-member", outsider.cookie, outsider.slug, 404],
      ["member of another tenant", admin.cookie, viewer.slug, 404],
      ["anonymous", null, admin.slug, 401]
    ];
    for (const [label, cookie, slug, status] of cases) {
      const response = await createKey(consoleRequest(`/api/console/${slug}/keys`, cookie, body), { params: { tenantSlug: slug } });
      expect(response.status, label).toBe(status);
    }

    const badScope = await createKey(
      consoleRequest(`/api/console/${admin.slug}/keys`, admin.cookie, { name: "x", scopes: ["root"] }),
      { params: { tenantSlug: admin.slug } }
    );
    expect(badScope.status).toBe(400);
  });

  it("revokes only the tenant's own keys", async () => {
    const owner = await tenantWithMember("owner");
    const mine = await createApiKey(owner.tenantId, { name: "Mine", scopes: ["ledger:read"] }, { actorUserId: null });
    const elsewhere = await createTenant("elsewhere");
    const theirs = await createApiKey(elsewhere, { name: "Theirs", scopes: ["ledger:read"] }, { actorUserId: null });

    const revoke = (keyId: string) =>
      revokeKey(consoleRequest(`/api/console/${owner.slug}/keys/${keyId}/revoke`, owner.cookie), {
        params: { tenantSlug: owner.slug, keyId }
      });

    expect((await revoke(theirs.apiKey.id)).status).toBe(404);
    expect(await verifyApiKey(theirs.token)).not.toBeNull();

    expect((await revoke(mine.apiKey.id)).status).toBe(200);
    expect(await verifyApiKey(mine.token)).toBeNull();
    expect((await revoke(mine.apiKey.id)).status).toBe(404);
  });

  it("pages and filters the tenant's audit log", async () => {
    const tenantId = await createTenant("audit");
    for (let i = 0; i < AUDIT_PAGE_SIZE + 5; i++) {
      await recordAudit({ tenantId, actorUserId: null }, { action: i % 2 ? "odd.event" : "even.event", outcome: "success" });
    }
    const first = await listAuditEvents(tenantId);
    expect(first.events).toHaveLength(AUDIT_PAGE_SIZE);
    expect(first.hasMore).toBe(true);
    const last = first.events[first.events.length - 1];
    const second = await listAuditEvents(tenantId, { before: { occurredAt: last.occurredAt, id: last.id } });
    expect(second.events).toHaveLength(5);
    expect(new Set([...first.events, ...second.events].map((e) => e.id)).size).toBe(AUDIT_PAGE_SIZE + 5);

    const odd = await listAuditEvents(tenantId, { action: "odd.event" });
    expect(odd.events.every((e) => e.action === "odd.event")).toBe(true);
    expect(odd.events).toHaveLength(Math.floor((AUDIT_PAGE_SIZE + 5) / 2));
  });

  it("summarises API usage by day and endpoint, for the tenant only", async () => {
    const tenantId = await createTenant("usage");
    const { apiKey } = await createApiKey(tenantId, { name: "u", scopes: ["ledger:read"] }, { actorUserId: null });
    const row = (route: string, status: number, durationMs: number) => ({
      id: crypto.randomUUID(),
      tenantId,
      apiKeyId: apiKey.id,
      method: "GET",
      route,
      status,
      durationMs
    });
    await adminDb.insert(apiRequests).values([
      row("/api/v1/ledger/entries", 200, 10),
      row("/api/v1/ledger/entries", 200, 30),
      row("/api/v1/ledger/entries", 500, 50),
      row("/api/v1/accounts/:accountId", 404, 5)
    ]);

    const usage = await getUsageSummary(tenantId);
    expect(usage.totals).toEqual({ total: 4, errors: 2 });
    expect(usage.byRoute[0]).toMatchObject({ route: "/api/v1/ledger/entries", total: 3, errors: 1 });
    expect((await getUsageSummary(await createTenant("quiet"))).totals).toEqual({ total: 0, errors: 0 });
  });

  it("keeps console staff in the demo tenant", async () => {
    const staff = await signedInStaff();
    const [row] = await adminDb.select().from(users).where(eq(users.id, staff.userId));
    expect(row.tenantId).toBe("tnt_demo");
  });
});
