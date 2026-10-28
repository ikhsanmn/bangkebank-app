import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

import { env } from "@/lib/env";

// Field-level encryption for identity data (NIK, date of birth, address).
// AES-256-GCM with a random 96-bit IV per value; the auth tag makes tampering
// detectable. The version prefix leaves room for key rotation.
const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_BYTES = 12;

function key() {
  return Buffer.from(env.PII_ENCRYPTION_KEY, "base64");
}

// A deterministic, keyed fingerprint of a NIK for uniqueness checks. The HMAC
// key is derived from the PII key, so a database dump alone can't brute-force
// the 16-digit space. scripts/db/encrypt-legacy-pii.mjs must derive it the same way.
const NIK_HASH_INFO = "bangkebank nik-hash v1";

export function hashNik(nik: string) {
  const hmacKey = Buffer.from(hkdfSync("sha256", key(), Buffer.alloc(0), NIK_HASH_INFO, 32));
  return createHmac("sha256", hmacKey).update(nik).digest("base64url");
}

export function encryptPii(plaintext: string) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(
    "."
  );
}

export function decryptPii(value: string) {
  const [version, iv, tag, ciphertext] = value.split(".");
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
    throw new Error("Unrecognized encrypted value.");
  }
  const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
}
