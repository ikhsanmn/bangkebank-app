// Platform-admin operations on tenants, for the CLIs in this folder. Plain SQL
// over node-postgres so it runs without the app's build. The API key format
// and hash must stay identical to lib/server/api-keys.ts (a test verifies a
// key minted here with the app's verifyApiKey).
//
// Every write runs in one transaction. FORCE row-level security binds the
// table owner too, so the transaction sets app.tenant_id before touching
// tenant-scoped tables (user, auditEvent), exactly like withTenant.

import { createHmac, randomInt, randomUUID } from "node:crypto";

export const DEMO_TENANT_ID = "tnt_demo";
export const API_SCOPES = [
  "customers:read",
  "customers:write",
  "accounts:read",
  "accounts:write",
  "transfers:read",
  "transfers:write",
  "ledger:read"
];
export const TENANT_ROLES = ["owner", "admin", "viewer"];

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export class TenantAdminError extends Error {}

function randomBase62(length) {
  return Array.from({ length }, () => BASE62[randomInt(BASE62.length)]).join("");
}

export function mintApiKey(pepperBase64) {
  const prefix = randomBase62(8);
  const secret = randomBase62(43);
  const secretHash = createHmac("sha256", Buffer.from(pepperBase64, "base64")).update(secret).digest("base64url");
  return { token: `bk_test_${prefix}_${secret}`, prefix, secretHash, last4: secret.slice(-4) };
}

async function setTenant(client, tenantId) {
  await client.query(`select set_config('app.tenant_id', $1, true)`, [tenantId]);
}

async function audit(client, tenantId, event) {
  await client.query(
    `insert into "auditEvent" ("id", "tenantId", "actorUserId", "action", "outcome", "entityType", "entityId", "metadata")
     values ($1, $2, null, $3, 'success', $4, $5, $6)`,
    [randomUUID(), tenantId, event.action, event.entityType, event.entityId, { ...event.metadata, via: "platform-admin-cli" }]
  );
}

// Console staff are web-app users, i.e. members of the demo tenant.
async function findWebUser(client, email) {
  await setTenant(client, DEMO_TENANT_ID);
  const { rows } = await client.query(`select "id" from "user" where lower("email") = lower($1)`, [email]);
  if (rows.length === 0) {
    throw new TenantAdminError(`No web-app user with email ${email}. Ask them to sign up first.`);
  }
  return rows[0].id;
}

async function inTransaction(client, fn) {
  await client.query("begin");
  try {
    const result = await fn();
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

export async function createTenant(client, { slug, name, ownerEmail, scopes = API_SCOPES, pepper }) {
  if (!SLUG.test(slug ?? "")) {
    throw new TenantAdminError("The slug must be 3-40 lowercase letters, digits or hyphens, not starting or ending with a hyphen.");
  }
  if (!name?.trim()) {
    throw new TenantAdminError("Give the tenant a name.");
  }
  const unknown = scopes.filter((scope) => !API_SCOPES.includes(scope));
  if (scopes.length === 0 || unknown.length > 0) {
    throw new TenantAdminError(`Unknown scope(s): ${unknown.join(", ") || "(none given)"}.`);
  }

  return inTransaction(client, async () => {
    const ownerId = await findWebUser(client, ownerEmail ?? "");
    const tenantId = `tnt_${randomBase62(12)}`;
    try {
      await client.query(`insert into "tenant" ("id", "slug", "name") values ($1, $2, $3)`, [tenantId, slug, name.trim()]);
    } catch (error) {
      if (error.code === "23505") {
        throw new TenantAdminError(`A tenant with slug "${slug}" already exists.`);
      }
      throw error;
    }
    await client.query(`insert into "tenantMember" ("tenantId", "userId", "role") values ($1, $2, 'owner')`, [tenantId, ownerId]);

    const key = mintApiKey(pepper);
    const keyId = randomUUID();
    await client.query(
      `insert into "apiKey" ("id", "tenantId", "name", "prefix", "secretHash", "last4", "scopes", "createdBy")
       values ($1, $2, 'Initial key', $3, $4, $5, $6, $7)`,
      [keyId, tenantId, key.prefix, key.secretHash, key.last4, scopes, ownerId]
    );

    await setTenant(client, tenantId);
    await audit(client, tenantId, { action: "tenant.created", entityType: "tenant", entityId: tenantId, metadata: { slug } });
    await audit(client, tenantId, { action: "tenant_member.added", entityType: "user", entityId: ownerId, metadata: { role: "owner" } });
    await audit(client, tenantId, { action: "api_key.created", entityType: "apiKey", entityId: keyId, metadata: { name: "Initial key", scopes, prefix: key.prefix } });

    return { tenantId, slug, ownerId, apiKeyId: keyId, token: key.token, scopes };
  });
}

export async function addMember(client, { slug, email, role }) {
  if (!TENANT_ROLES.includes(role)) {
    throw new TenantAdminError(`Role must be one of: ${TENANT_ROLES.join(", ")}.`);
  }
  return inTransaction(client, async () => {
    const { rows } = await client.query(`select "id" from "tenant" where "slug" = $1`, [slug]);
    if (rows.length === 0) {
      throw new TenantAdminError(`No tenant with slug "${slug}".`);
    }
    const tenantId = rows[0].id;
    const userId = await findWebUser(client, email ?? "");
    if (role !== "owner") {
      // Lock the tenant's owner rows so two demotions can't race past the check.
      const owners = await client.query(
        `select "userId" from "tenantMember" where "tenantId" = $1 and "role" = 'owner' for update`,
        [tenantId]
      );
      if (owners.rows.length === 1 && owners.rows[0].userId === userId) {
        throw new TenantAdminError("That user is the tenant's only owner. Make someone else owner first.");
      }
    }
    await client.query(
      `insert into "tenantMember" ("tenantId", "userId", "role") values ($1, $2, $3)
       on conflict ("tenantId", "userId") do update set "role" = excluded."role"`,
      [tenantId, userId, role]
    );
    await setTenant(client, tenantId);
    await audit(client, tenantId, { action: "tenant_member.added", entityType: "user", entityId: userId, metadata: { role } });
    return { tenantId, userId, role };
  });
}

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(argv[i]);
    if (!match) {
      throw new TenantAdminError(`Unexpected argument: ${argv[i]}`);
    }
    args[match[1]] = match[2] ?? argv[++i];
  }
  return args;
}

export async function withClient(fn) {
  const pg = (await import("pg")).default;
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : false
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
