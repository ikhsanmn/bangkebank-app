#!/usr/bin/env node

// Encrypts identity fields that rows created before Phase 2 stored as plaintext,
// and fills nikHash for rows created before Phase 3. Idempotent: encrypted
// values ("v1." prefix) and rows that already have a hash are skipped. Both
// formats must stay identical to lib/server/pii.ts (tests compare them).

import "dotenv/config";

import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

import pg from "pg";

const FIELDS = ["address1", "dateOfBirth"];

export function encryptValue(plaintext, keyBase64) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyBase64, "base64"), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(".");
}

export function decryptValue(value, keyBase64) {
  const [, iv, tag, ciphertext] = value.split(".");
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(keyBase64, "base64"), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
}

export function hashNikValue(nik, keyBase64) {
  const hmacKey = Buffer.from(
    hkdfSync("sha256", Buffer.from(keyBase64, "base64"), Buffer.alloc(0), "bangkebank nik-hash v1", 32)
  );
  return createHmac("sha256", hmacKey).update(nik).digest("base64url");
}

async function main() {
  const key = process.env.PII_ENCRYPTION_KEY;
  if (!key || Buffer.from(key, "base64").length !== 32) {
    throw new Error("PII_ENCRYPTION_KEY must be 32 random bytes, base64-encoded.");
  }

  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : false
  });
  await client.connect();
  try {
    let updated = 0;
    for (const field of FIELDS) {
      const { rows } = await client.query(
        `select "id", "${field}" as value from "user" where "${field}" <> '' and "${field}" not like 'v1.%'`
      );
      for (const row of rows) {
        await client.query(`update "user" set "${field}" = $1 where "id" = $2`, [
          encryptValue(row.value, key),
          row.id
        ]);
        updated += 1;
      }
    }
    console.log(`Encrypted ${updated} legacy identity value(s).`);

    const { rows } = await client.query(
      `select "id", "nik" from "user" where "nik" like 'v1.%' and "nikHash" = ''`
    );
    for (const row of rows) {
      await client.query(`update "user" set "nikHash" = $1 where "id" = $2`, [
        hashNikValue(decryptValue(row.nik, key), key),
        row.id
      ]);
    }
    console.log(`Hashed ${rows.length} NIK(s) for per-tenant uniqueness.`);
  } finally {
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
