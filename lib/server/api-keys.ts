import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { API_SCOPES, apiKeys, type ApiScope, tenants } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { type AuditContext, recordAudit } from "@/lib/server/audit";
import { withTenant } from "@/lib/server/tenant";

// Partner API keys look like bk_test_<prefix>_<secret>. The 8-character prefix
// finds the row; the 43-character secret (~256 bits of base62) proves
// possession. Only an HMAC of the secret is stored, keyed by API_KEY_PEPPER.
// The secret has full entropy, so a slow password hash would add nothing.
//
// Only sandbox ("test") keys exist: BangkeBank is a demo and moves no real money.

const KEY_PREFIX = "bk_test_";
const PREFIX_LENGTH = 8;
const SECRET_LENGTH = 43;
const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const TOKEN_PATTERN = new RegExp(
  `^${KEY_PREFIX}([0-9A-Za-z]{${PREFIX_LENGTH}})_([0-9A-Za-z]{${SECRET_LENGTH}})$`
);
// lastUsedAt is refreshed at most this often, so verification isn't a write per request.
const LAST_USED_RESOLUTION = "1 minute";
const DEFAULT_ROLL_GRACE_MS = 24 * 60 * 60 * 1000;

export class ApiKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiKeyError";
  }
}

export type VerifiedApiKey = { id: string; tenantId: string; scopes: ApiScope[] };

// What callers may see of a key: never the hash.
const PUBLIC_COLUMNS = {
  id: apiKeys.id,
  tenantId: apiKeys.tenantId,
  name: apiKeys.name,
  prefix: apiKeys.prefix,
  last4: apiKeys.last4,
  scopes: apiKeys.scopes,
  createdBy: apiKeys.createdBy,
  lastUsedAt: apiKeys.lastUsedAt,
  expiresAt: apiKeys.expiresAt,
  revokedAt: apiKeys.revokedAt,
  createdAt: apiKeys.createdAt
};

function randomBase62(length: number) {
  return Array.from({ length }, () => BASE62[randomInt(BASE62.length)]).join("");
}

function hashSecret(secret: string) {
  return createHmac("sha256", Buffer.from(env.API_KEY_PEPPER, "base64"))
    .update(secret)
    .digest("base64url");
}

function validateScopes(scopes: readonly string[]): ApiScope[] {
  const unique = [...new Set(scopes)];
  const unknown = unique.filter((scope) => !(API_SCOPES as readonly string[]).includes(scope));
  if (unique.length === 0 || unknown.length > 0) {
    throw new ApiKeyError(
      unknown.length > 0 ? `Unknown scope: ${unknown.join(", ")}.` : "A key needs at least one scope."
    );
  }
  return unique as ApiScope[];
}

// Returns the full token exactly once; it can't be recovered afterwards.
export async function createApiKey(
  tenantId: string,
  input: { name: string; scopes: readonly string[]; expiresAt?: Date | null },
  context: AuditContext
) {
  const name = input.name.trim();
  if (name.length === 0 || name.length > 100) {
    throw new ApiKeyError("Give the key a name of 1 to 100 characters.");
  }
  const scopes = validateScopes(input.scopes);
  const prefix = randomBase62(PREFIX_LENGTH);
  const secret = randomBase62(SECRET_LENGTH);

  const apiKey = await withTenant(tenantId, async (tx) => {
    const [created] = await tx
      .insert(apiKeys)
      .values({
        id: crypto.randomUUID(),
        tenantId,
        name,
        prefix,
        secretHash: hashSecret(secret),
        last4: secret.slice(-4),
        scopes,
        createdBy: context.actorUserId,
        expiresAt: input.expiresAt ?? null
      })
      .returning(PUBLIC_COLUMNS);
    await recordAudit(
      { ...context, tenantId },
      {
        action: "api_key.created",
        outcome: "success",
        entityType: "apiKey",
        entityId: created.id,
        metadata: { name, scopes, prefix }
      },
      tx
    );
    return created;
  });

  return { apiKey, token: `${KEY_PREFIX}${prefix}_${secret}` };
}

// Resolves a bearer token to its tenant and scopes, or null. Every failure
// (malformed, unknown, wrong secret, revoked, expired, suspended tenant) looks
// the same to the caller, so a probe learns nothing about which part was wrong.
export async function verifyApiKey(token: string): Promise<VerifiedApiKey | null> {
  const match = TOKEN_PATTERN.exec(token);
  const presented = Buffer.from(hashSecret(match?.[2] ?? ""));
  if (!match) {
    return null;
  }

  const [row] = await db
    .select({
      id: apiKeys.id,
      tenantId: apiKeys.tenantId,
      scopes: apiKeys.scopes,
      secretHash: apiKeys.secretHash,
      revokedAt: apiKeys.revokedAt,
      expiresAt: apiKeys.expiresAt,
      tenantStatus: tenants.status
    })
    .from(apiKeys)
    .innerJoin(tenants, eq(tenants.id, apiKeys.tenantId))
    .where(eq(apiKeys.prefix, match[1]))
    .limit(1);

  // Compare even when no row matched, so response time doesn't reveal whether
  // a prefix exists. Both sides are base64url SHA-256 digests of equal length.
  const stored = Buffer.from(row?.secretHash ?? hashSecret(""));
  const secretMatches = timingSafeEqual(presented, stored) && row !== undefined;
  const now = new Date();
  if (
    !row ||
    !secretMatches ||
    row.revokedAt !== null ||
    (row.expiresAt !== null && row.expiresAt <= now) ||
    row.tenantStatus !== "active"
  ) {
    return null;
  }

  await db
    .update(apiKeys)
    .set({ lastUsedAt: now })
    .where(
      and(
        eq(apiKeys.id, row.id),
        sql`(${apiKeys.lastUsedAt} is null or ${apiKeys.lastUsedAt} < now() - interval '${sql.raw(LAST_USED_RESOLUTION)}')`
      )
    );

  return { id: row.id, tenantId: row.tenantId, scopes: row.scopes as ApiScope[] };
}

export function hasScope(key: VerifiedApiKey, scope: ApiScope) {
  return key.scopes.includes(scope);
}

export async function listApiKeys(tenantId: string) {
  return db
    .select(PUBLIC_COLUMNS)
    .from(apiKeys)
    .where(eq(apiKeys.tenantId, tenantId))
    .orderBy(desc(apiKeys.createdAt), desc(apiKeys.id));
}

// Irreversible. Returns false when the key isn't the tenant's or was already revoked.
export async function revokeApiKey(tenantId: string, keyId: string, context: AuditContext) {
  return withTenant(tenantId, async (tx) => {
    const [revoked] = await tx
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.tenantId, tenantId), isNull(apiKeys.revokedAt)))
      .returning({ id: apiKeys.id, prefix: apiKeys.prefix });
    if (!revoked) {
      return false;
    }
    await recordAudit(
      { ...context, tenantId },
      {
        action: "api_key.revoked",
        outcome: "success",
        entityType: "apiKey",
        entityId: revoked.id,
        metadata: { prefix: revoked.prefix }
      },
      tx
    );
    return true;
  });
}

// Issues a replacement with the same name and scopes and lets the old key keep
// working for `graceMs`, so a client can switch without downtime.
export async function rollApiKey(
  tenantId: string,
  keyId: string,
  context: AuditContext,
  graceMs = DEFAULT_ROLL_GRACE_MS
) {
  const [current] = await db
    .select(PUBLIC_COLUMNS)
    .from(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.tenantId, tenantId), isNull(apiKeys.revokedAt)))
    .limit(1);
  if (!current) {
    return null;
  }

  const replacement = await createApiKey(
    tenantId,
    { name: current.name, scopes: current.scopes, expiresAt: current.expiresAt },
    context
  );
  const graceEnds = new Date(Date.now() + graceMs);
  const oldExpiresAt =
    current.expiresAt && current.expiresAt < graceEnds ? current.expiresAt : graceEnds;

  await withTenant(tenantId, async (tx) => {
    await tx.update(apiKeys).set({ expiresAt: oldExpiresAt }).where(eq(apiKeys.id, current.id));
    await recordAudit(
      { ...context, tenantId },
      {
        action: "api_key.rolled",
        outcome: "success",
        entityType: "apiKey",
        entityId: current.id,
        metadata: { replacedBy: replacement.apiKey.id, oldKeyExpiresAt: oldExpiresAt.toISOString() }
      },
      tx
    );
  });

  return replacement;
}
