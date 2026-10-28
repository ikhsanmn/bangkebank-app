import { eq } from "drizzle-orm";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { APP_ROLE } from "@/lib/db";
import { auditEvents, DEMO_TENANT_ID, tenantMembers, tenants, users } from "@/lib/db/schema";
import { verifyApiKey } from "@/lib/server/api-keys";
import { getMembership } from "@/lib/server/console";
import { withTenant } from "@/lib/server/tenant";

// @ts-expect-error -- plain ESM script without type declarations
import { addMember, createTenant } from "../scripts/tenant/lib.mjs";
import { adminDb, adminPool } from "./admin-db";

const PEPPER = process.env.API_KEY_PEPPER;

// The CLI connects with DATABASE_URL's user. Running it as the app role here
// proves it works with row-level security enforced, not only as a superuser.
let client: PoolClient;

beforeAll(async () => {
  client = await adminPool.connect();
  await client.query(`set role ${APP_ROLE}`);
});

afterAll(async () => {
  await client.query("reset role");
  client.release();
});

async function webUser() {
  const id = crypto.randomUUID();
  const email = `owner-${id.slice(0, 8)}@example.test`;
  await withTenant(DEMO_TENANT_ID, (tx) =>
    tx.insert(users).values({ id, tenantId: DEMO_TENANT_ID, name: "Owner", email })
  );
  return { id, email };
}

const slug = () => `acme-${crypto.randomUUID().slice(0, 8)}`;

describe("tenant admin scripts", () => {
  it("creates a tenant with an owner and a working first key, all audited", async () => {
    const owner = await webUser();
    const result = await createTenant(client, { slug: slug(), name: "Acme Pay", ownerEmail: owner.email.toUpperCase(), pepper: PEPPER });

    expect(await verifyApiKey(result.token)).toMatchObject({ tenantId: result.tenantId });
    expect(await getMembership(owner.id, result.slug)).toMatchObject({ role: "owner", name: "Acme Pay" });

    const events = await adminDb.select().from(auditEvents).where(eq(auditEvents.tenantId, result.tenantId));
    expect(events.map((event) => event.action).sort()).toEqual(["api_key.created", "tenant.created", "tenant_member.added"]);
    expect(events.every((event) => (event.metadata as { via?: string }).via === "platform-admin-cli")).toBe(true);
  });

  it("honours a narrower scope list", async () => {
    const owner = await webUser();
    const result = await createTenant(client, {
      slug: slug(),
      name: "Read Only",
      ownerEmail: owner.email,
      scopes: ["ledger:read"],
      pepper: PEPPER
    });
    expect((await verifyApiKey(result.token))?.scopes).toEqual(["ledger:read"]);
  });

  it("refuses bad input and leaves nothing behind", async () => {
    const owner = await webUser();
    const taken = slug();
    await createTenant(client, { slug: taken, name: "First", ownerEmail: owner.email, pepper: PEPPER });

    const attempts = [
      [{ slug: taken, name: "Again", ownerEmail: owner.email }, /already exists/],
      [{ slug: "Bad Slug!", name: "x", ownerEmail: owner.email }, /slug/],
      [{ slug: slug(), name: "x", ownerEmail: "nobody@example.test" }, /No web-app user/],
      [{ slug: slug(), name: "x", ownerEmail: owner.email, scopes: ["root"] }, /Unknown scope/]
    ] as const;
    for (const [input, message] of attempts) {
      await expect(createTenant(client, { ...input, pepper: PEPPER })).rejects.toThrow(message);
    }
    const rows = await adminDb.select().from(tenants).where(eq(tenants.name, "Again"));
    expect(rows).toEqual([]);
  });

  it("adds a member or changes their role", async () => {
    const owner = await webUser();
    const teammate = await webUser();
    const { slug: tenantSlug, tenantId } = await createTenant(client, { slug: slug(), name: "Team", ownerEmail: owner.email, pepper: PEPPER });

    await addMember(client, { slug: tenantSlug, email: teammate.email, role: "viewer" });
    expect(await getMembership(teammate.id, tenantSlug)).toMatchObject({ role: "viewer" });
    await addMember(client, { slug: tenantSlug, email: teammate.email, role: "admin" });
    expect(await getMembership(teammate.id, tenantSlug)).toMatchObject({ role: "admin" });

    const members = await adminDb.select().from(tenantMembers).where(eq(tenantMembers.tenantId, tenantId));
    expect(members).toHaveLength(2);
    await expect(addMember(client, { slug: tenantSlug, email: teammate.email, role: "god" })).rejects.toThrow(/Role/);
    await expect(addMember(client, { slug: "no-such-tenant", email: teammate.email, role: "admin" })).rejects.toThrow(/No tenant/);

    // The only owner can't be demoted until someone else is owner.
    await expect(addMember(client, { slug: tenantSlug, email: owner.email, role: "admin" })).rejects.toThrow(/only owner/);
    await addMember(client, { slug: tenantSlug, email: teammate.email, role: "owner" });
    await addMember(client, { slug: tenantSlug, email: owner.email, role: "admin" });
    expect(await getMembership(owner.id, tenantSlug)).toMatchObject({ role: "admin" });
  });
});
