import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { auth } from "@/lib/auth";
import { APP_ROLE, db } from "@/lib/db";
import { bankAccounts, DEMO_TENANT_ID, users } from "@/lib/db/schema";
import { listBanksForUser } from "@/lib/server/banking";
import { withTenant } from "@/lib/server/tenant";

import { adminDb, count, createSeededUser, createTenant, dbError } from "./helpers";

const SIGN_UP_IDENTITY = {
  firstName: "Rls",
  lastName: "Test",
  address1: "Jl. Contoh No. 12",
  city: "Medan",
  province: "Sumatera Utara",
  postalCode: "20111",
  dateOfBirth: "1990-08-17",
  nik: "1971015708900001"
};

describe("row-level security", () => {
  it("runs the app as a role that can't bypass it", async () => {
    const result = await db.execute<{ role: string; rolsuper: boolean; rolbypassrls: boolean }>(sql`
      select current_user as role, rolsuper, rolbypassrls from pg_roles where rolname = current_user
    `);
    expect(result.rows).toEqual([{ role: APP_ROLE, rolsuper: false, rolbypassrls: false }]);
  });

  it("enables and forces it on every table that has a tenantId", async () => {
    const result = await adminDb.execute<{ table: string; enabled: boolean; forced: boolean }>(sql`
      select c.relname as table, c.relrowsecurity as enabled, c.relforcerowsecurity as forced
        from information_schema.columns col
        join pg_class c on c.relname = col.table_name
        join pg_namespace n on n.oid = c.relnamespace and n.nspname = col.table_schema
       where col.table_schema = 'public' and col.column_name = 'tenantId'
       order by 1
    `);
    // Deliberately outside RLS, because they are read before a tenant is known:
    // the console looks memberships up by user, and the partner API finds a key
    // (and so its tenant) by prefix. Both are always queried with explicit filters.
    const unscoped = ["apiKey", "tenantMember"];
    const scoped = result.rows.filter((row) => !unscoped.includes(row.table));
    expect(result.rows.filter((row) => unscoped.includes(row.table)).map((row) => row.table)).toEqual(unscoped);
    expect(scoped.map((row) => row.table)).toEqual([
      "auditEvent",
      "bankAccount",
      "bankTransaction",
      "ledgerEntry",
      "ledgerPosting",
      "transfer",
      "user"
    ]);
    for (const row of scoped) {
      expect(row, row.table).toMatchObject({ enabled: true, forced: true });
    }
  });

  it("fails closed when no tenant is set", async () => {
    await createSeededUser("closed");
    expect(await count("bankAccount")).toBeGreaterThan(0);

    expect(await db.select().from(bankAccounts)).toEqual([]);
    expect(await db.select().from(users)).toEqual([]);
    expect(
      await dbError(db.insert(users).values({ id: crypto.randomUUID(), tenantId: DEMO_TENANT_ID, name: "x", email: "x@x.test" }))
    ).toMatch(/row-level security/);
  });

  it("shows a tenant only its own rows", async () => {
    const tenantA = await createTenant("rls-a");
    const tenantB = await createTenant("rls-b");
    const alice = await createSeededUser("rls-alice", tenantA);
    await createSeededUser("rls-bob", tenantB);

    const visible = await withTenant(tenantA, (tx) => tx.select().from(bankAccounts));
    expect(visible.length).toBe(await count("bankAccount", `"tenantId" = '${tenantA}'`));
    expect(visible.every((row) => row.tenantId === tenantA)).toBe(true);

    // A service call with the wrong tenant finds nothing, even for a real user.
    expect(await listBanksForUser(tenantB, alice.id)).toEqual([]);
    expect(await listBanksForUser(tenantA, alice.id)).toHaveLength(3);
  });

  it("refuses writes into another tenant and can't touch its rows", async () => {
    const tenantA = await createTenant("write-a");
    const tenantB = await createTenant("write-b");
    const bob = await createSeededUser("write-bob", tenantB);

    expect(
      await dbError(
        withTenant(tenantA, (tx) =>
          tx.insert(users).values({ id: crypto.randomUUID(), tenantId: tenantB, name: "Mallory", email: "m@x.test" })
        )
      )
    ).toMatch(/row-level security/);

    const renamed = await withTenant(tenantA, (tx) =>
      tx.update(bankAccounts).set({ name: "Hijacked" }).where(eq(bankAccounts.id, bob.accounts[0].id)).returning()
    );
    expect(renamed).toEqual([]);
    const [after] = await adminDb.select().from(bankAccounts).where(eq(bankAccounts.id, bob.accounts[0].id));
    expect(after.name).toBe(bob.accounts[0].name);
  });

  it("doesn't leak the tenant setting to the next user of a pooled connection", async () => {
    const tenantId = await createTenant("leak");
    await Promise.all(Array.from({ length: 20 }, () => withTenant(tenantId, (tx) => tx.select().from(users))));

    const settings = await Promise.all(
      Array.from({ length: 20 }, () =>
        db.execute<{ tenant: string | null }>(sql`select nullif(current_setting('app.tenant_id', true), '') as tenant`)
      )
    );
    expect(settings.map((result) => result.rows[0].tenant)).toEqual(Array(20).fill(null));
  });

  it("lets web sign-in see only demo-tenant users, whatever other tenants hold", async () => {
    const email = `shared-${crypto.randomUUID().slice(0, 8)}@example.test`;
    const password = "correct-horse-battery";
    const fintech = await createTenant("same-email");
    // A fintech's customer with the same email exists first.
    await withTenant(fintech, (tx) =>
      tx.insert(users).values({ id: crypto.randomUUID(), tenantId: fintech, name: "Fintech Customer", email })
    );

    await auth.api.signUpEmail({ body: { email, password, name: "Web User", ...SIGN_UP_IDENTITY } });
    const signedIn = await auth.api.signInEmail({ body: { email, password } });

    const [webUser] = await adminDb
      .select()
      .from(users)
      .where(sql`${users.email} = ${email} and ${users.tenantId} = ${DEMO_TENANT_ID}`);
    expect(signedIn.user.id).toBe(webUser.id);
    expect(signedIn.user.name).toBe("Web User");
  });
});
