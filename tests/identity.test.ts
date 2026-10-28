import { describe, expect, it } from "vitest";

import { validateDateOfBirth, validateNik } from "@/lib/kyc";
import { decryptPii, encryptPii } from "@/lib/server/pii";

// @ts-expect-error -- plain ESM script without type declarations
import { encryptValue } from "../scripts/db/encrypt-legacy-pii.mjs";

const TODAY = new Date("2026-10-28T00:00:00Z");

describe("validateNik", () => {
  it("accepts a NIK whose birth segment matches the date of birth", () => {
    expect(validateNik("1971011708900001", "1990-08-17")).toBeNull();
  });

  it("accepts the +40 day offset used for women", () => {
    expect(validateNik("3174055708900002", "1990-08-17")).toBeNull();
  });

  it.each([
    ["too short", "197101170890001", "1990-08-17", /16 digits/],
    ["letters", "19710117089000AB", "1990-08-17", /16 digits/],
    ["unknown province", "9971011708900001", "1990-08-17", /province/],
    ["wrong birth date", "1971011808900001", "1990-08-17", /date of birth/],
    ["wrong year", "1971011708910001", "1990-08-17", /date of birth/],
    ["zero serial", "1971011708900000", "1990-08-17", /serial/]
  ])("rejects %s", (_label, nik, dob, message) => {
    expect(validateNik(nik, dob)).toMatch(message);
  });
});

describe("validateDateOfBirth", () => {
  it("requires a real date at least 17 years ago", () => {
    expect(validateDateOfBirth("2009-10-28", TODAY)).toBeNull();
    expect(validateDateOfBirth("2009-10-29", TODAY)).toMatch(/17/);
    expect(validateDateOfBirth("1990-02-30", TODAY)).toMatch(/valid/);
    expect(validateDateOfBirth("", TODAY)).toMatch(/date of birth/);
  });
});

describe("PII encryption", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const first = encryptPii("1971011708900001");
    const second = encryptPii("1971011708900001");
    expect(first).not.toBe(second);
    expect(first).not.toContain("1971011708900001");
    expect(decryptPii(first)).toBe("1971011708900001");
  });

  it("detects tampering", () => {
    const [version, iv, tag, ciphertext] = encryptPii("Jl. Contoh No. 12").split(".");
    const flipped = Buffer.from(ciphertext, "base64");
    flipped[0] ^= 1;
    expect(() => decryptPii([version, iv, tag, flipped.toString("base64")].join("."))).toThrow();
  });

  it("can read what the legacy migration script writes", () => {
    const value = encryptValue("1990-08-17", process.env.PII_ENCRYPTION_KEY);
    expect(decryptPii(value)).toBe("1990-08-17");
  });
});
