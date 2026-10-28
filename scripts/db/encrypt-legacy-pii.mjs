#!/usr/bin/env node

// Encrypts identity fields that rows created before Phase 2 stored as plaintext.
// Idempotent: values already carrying the "v1." prefix are skipped. The format
// must stay identical to lib/server/pii.ts (a test decrypts this output there).

import "dotenv/config";

import { createCipheriv, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

import pg from "pg";

const FIELDS = ["address1", "dateOfBirth"];

export function encryptValue(plaintext, keyBase64) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyBase64, "base64"), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ciphertext.toString("base64")].join(".");
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
