import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { apiKeys, auditEvents, tenants } from "@/lib/db/schema";
import {
  ApiKeyError,
  createApiKey,
  hasScope,
  listApiKeys,
  revokeApiKey,
  rollApiKey,
  verifyApiKey
} from "@/lib/server/api-keys";

import { adminDb, createTenant } from "./helpers";

const TOKEN_SHAPE = /^bk_test_[0-9A-Za-z]{8}_[0-9A-Za-z]{43}$/;

async function newKey(scopes: string[] = ["accounts:read", "transfers:write"]) {
  const tenantId = await createTenant("keys");
  const created = await createApiKey(tenantId, { name: "Server", scopes }, { actorUserId: null });
  return { tenantId, ...created };
}

async function keyRow(id: string) {
  const [row] = await adminDb.select().from(apiKeys).where(eq(apiKeys.id, id));
  return row;
}

describe("API keys", () => {
  it("returns the token once and stores only a hash of the secret", async () => {
    const { token, apiKey } = await newKey();
    expect(token).toMatch(TOKEN_SHAPE);
    expect(apiKey).not.toHaveProperty("secretHash");

    const secret = token.split("_").pop()!;
    const row = await keyRow(apiKey.id);
    expect(row.prefix).toBe(token.slice("bk_test_".length, "bk_test_".length + 8));
    expect(row.last4).toBe(secret.slice(-4));
    expect(JSON.stringify(row)).not.toContain(secret);
    expect(row.secretHash).toHaveLength(43);
  });

  it("verifies a valid token to its tenant and scopes, and records use", async () => {
    const { token, tenantId, apiKey } = await newKey();
    const verified = await verifyApiKey(token);

    expect(verified).toEqual({ id: apiKey.id, tenantId, scopes: ["accounts:read", "transfers:write"] });
    expect(hasScope(verified!, "transfers:write")).toBe(true);
    expect(hasScope(verified!, "ledger:read")).toBe(false);
    expect((await keyRow(apiKey.id)).lastUsedAt).not.toBeNull();
  });

  it("refreshes lastUsedAt at most once a minute", async () => {
    const { token, apiKey } = await newKey();
    await verifyApiKey(token);
    const first = (await keyRow(apiKey.id)).lastUsedAt;
    await verifyApiKey(token);
    expect((await keyRow(apiKey.id)).lastUsedAt).toEqual(first);

    await adminDb.execute(sql`update "apiKey" set "lastUsedAt" = now() - interval '2 minutes' where "id" = ${apiKey.id}`);
    await verifyApiKey(token);
    expect((await keyRow(apiKey.id)).lastUsedAt!.getTime()).toBeGreaterThan(first!.getTime());
  });

  it("rejects malformed, unknown and wrong-secret tokens alike", async () => {
    const { token } = await newKey();
    const prefix = token.slice(0, "bk_test_".length + 8);
    const wrongSecret = `${prefix}_${"A".repeat(43)}`;
    const unknownPrefix = `bk_test_ZZZZZZZZ_${token.split("_").pop()}`;

    for (const attempt of ["", "Bearer x", token.slice(0, -1), `${token}x`, token.replace("bk_test_", "bk_live_"), wrongSecret, unknownPrefix]) {
      expect(await verifyApiKey(attempt), attempt).toBeNull();
    }
  });

  it("rejects revoked keys, expired keys and keys of suspended tenants", async () => {
    const revoked = await newKey();
    expect(await revokeApiKey(revoked.tenantId, revoked.apiKey.id, { actorUserId: null })).toBe(true);
    expect(await revokeApiKey(revoked.tenantId, revoked.apiKey.id, { actorUserId: null })).toBe(false);
    expect(await verifyApiKey(revoked.token)).toBeNull();

    const expired = await newKey();
    await adminDb.update(apiKeys).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(apiKeys.id, expired.apiKey.id));
    expect(await verifyApiKey(expired.token)).toBeNull();

    const suspended = await newKey();
    expect(await verifyApiKey(suspended.token)).not.toBeNull();
    await adminDb.update(tenants).set({ status: "suspended" }).where(eq(tenants.id, suspended.tenantId));
    expect(await verifyApiKey(suspended.token)).toBeNull();
  });

  it("only lets the owning tenant list or revoke a key", async () => {
    const victim = await newKey();
    const other = await createTenant("other");

    expect(await revokeApiKey(other, victim.apiKey.id, { actorUserId: null })).toBe(false);
    expect(await rollApiKey(other, victim.apiKey.id, { actorUserId: null })).toBeNull();
    expect(await verifyApiKey(victim.token)).not.toBeNull();

    expect(await listApiKeys(other)).toEqual([]);
    const listed = await listApiKeys(victim.tenantId);
    expect(listed.map((key) => key.id)).toEqual([victim.apiKey.id]);
    expect(listed[0]).not.toHaveProperty("secretHash");
  });

  it("rolls a key: the replacement works and the old one lasts only the grace period", async () => {
    const original = await newKey(["ledger:read"]);
    const rolled = await rollApiKey(original.tenantId, original.apiKey.id, { actorUserId: null }, 60_000);

    expect(rolled!.token).not.toBe(original.token);
    expect((await verifyApiKey(rolled!.token))?.scopes).toEqual(["ledger:read"]);
    expect(await verifyApiKey(original.token)).not.toBeNull();
    const oldExpiry = (await keyRow(original.apiKey.id)).expiresAt!;
    expect(oldExpiry.getTime()).toBeLessThanOrEqual(Date.now() + 60_000);

    const cutOver = await rollApiKey(original.tenantId, rolled!.apiKey.id, { actorUserId: null }, 0);
    expect(await verifyApiKey(rolled!.token)).toBeNull();
    expect(await verifyApiKey(cutOver!.token)).not.toBeNull();
  });

  it("refuses unknown or empty scopes and bad names", async () => {
    const tenantId = await createTenant("scopes");
    await expect(createApiKey(tenantId, { name: "x", scopes: ["admin:all"] }, { actorUserId: null })).rejects.toThrow(ApiKeyError);
    await expect(createApiKey(tenantId, { name: "x", scopes: [] }, { actorUserId: null })).rejects.toThrow(ApiKeyError);
    await expect(createApiKey(tenantId, { name: "  ", scopes: ["ledger:read"] }, { actorUserId: null })).rejects.toThrow(ApiKeyError);
    expect(await listApiKeys(tenantId)).toEqual([]);
  });

  it("audits create, revoke and roll in the key's tenant", async () => {
    const { tenantId, apiKey } = await newKey();
    await rollApiKey(tenantId, apiKey.id, { actorUserId: null });
    await revokeApiKey(tenantId, apiKey.id, { actorUserId: null });

    const events = await adminDb.select().from(auditEvents).where(eq(auditEvents.tenantId, tenantId));
    expect(events.map((event) => event.action).sort()).toEqual([
      "api_key.created",
      "api_key.created",
      "api_key.revoked",
      "api_key.rolled"
    ]);
  });
});
