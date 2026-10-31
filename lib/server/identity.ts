import { isPostalCode, isProvince, validateDateOfBirth, validateNik } from "@/lib/kyc";
import { encryptPii, hashNik } from "@/lib/server/pii";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

// Validates the Indonesian identity fields and swaps the sensitive ones for
// ciphertext before the row is written. Plaintext NIK never reaches the
// database. Shared by web sign-up (lib/auth.ts) and the partner API.
export function protectIdentity<T extends Record<string, unknown>>(
  user: T
): { ok: true; data: T & IdentityColumns } | { ok: false; error: string } {
  const nik = text(user.nik);
  const dateOfBirth = text(user.dateOfBirth);
  const address = text(user.address1);

  const error =
    validateDateOfBirth(dateOfBirth) ??
    validateNik(nik, dateOfBirth) ??
    (isProvince(text(user.province)) ? null : "Choose a province from the list.") ??
    (isPostalCode(text(user.postalCode)) ? null : "Postal code must be 5 digits.") ??
    (address.length >= 5 ? null : "Enter your street address.");
  if (error) {
    return { ok: false, error };
  }

  return {
    ok: true,
    data: {
      ...user,
      nik: encryptPii(nik),
      nikLast4: nik.slice(-4),
      nikHash: hashNik(nik),
      dateOfBirth: encryptPii(dateOfBirth),
      address1: encryptPii(address)
    }
  };
}

type IdentityColumns = {
  nik: string;
  nikLast4: string;
  nikHash: string;
  dateOfBirth: string;
  address1: string;
};
