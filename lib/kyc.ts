// Indonesian identity rules shared by the sign-up form and the server.
// A NIK (Nomor Induk Kependudukan) is 16 digits: PP KK CC DDMMYY SSSS —
// province, regency, district, birth date (day + 40 for women) and a serial.

export const PROVINCES = [
  { code: "11", name: "Aceh" },
  { code: "12", name: "Sumatera Utara" },
  { code: "13", name: "Sumatera Barat" },
  { code: "14", name: "Riau" },
  { code: "15", name: "Jambi" },
  { code: "16", name: "Sumatera Selatan" },
  { code: "17", name: "Bengkulu" },
  { code: "18", name: "Lampung" },
  { code: "19", name: "Kepulauan Bangka Belitung" },
  { code: "21", name: "Kepulauan Riau" },
  { code: "31", name: "DKI Jakarta" },
  { code: "32", name: "Jawa Barat" },
  { code: "33", name: "Jawa Tengah" },
  { code: "34", name: "DI Yogyakarta" },
  { code: "35", name: "Jawa Timur" },
  { code: "36", name: "Banten" },
  { code: "51", name: "Bali" },
  { code: "52", name: "Nusa Tenggara Barat" },
  { code: "53", name: "Nusa Tenggara Timur" },
  { code: "61", name: "Kalimantan Barat" },
  { code: "62", name: "Kalimantan Tengah" },
  { code: "63", name: "Kalimantan Selatan" },
  { code: "64", name: "Kalimantan Timur" },
  { code: "65", name: "Kalimantan Utara" },
  { code: "71", name: "Sulawesi Utara" },
  { code: "72", name: "Sulawesi Tengah" },
  { code: "73", name: "Sulawesi Selatan" },
  { code: "74", name: "Sulawesi Tenggara" },
  { code: "75", name: "Gorontalo" },
  { code: "76", name: "Sulawesi Barat" },
  { code: "81", name: "Maluku" },
  { code: "82", name: "Maluku Utara" },
  { code: "91", name: "Papua" },
  { code: "92", name: "Papua Barat" },
  { code: "93", name: "Papua Selatan" },
  { code: "94", name: "Papua Tengah" },
  { code: "95", name: "Papua Pegunungan" },
  { code: "96", name: "Papua Barat Daya" }
] as const;

const PROVINCE_CODES = new Set<string>(PROVINCES.map((province) => province.code));
const PROVINCE_NAMES = new Set<string>(PROVINCES.map((province) => province.name));

const NIK_PATTERN = /^\d{16}$/;
const POSTAL_CODE_PATTERN = /^\d{5}$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const FEMALE_DAY_OFFSET = 40;
export const MIN_AGE_YEARS = 17;

export function isProvince(value: string) {
  return PROVINCE_NAMES.has(value);
}

export function isPostalCode(value: string) {
  return POSTAL_CODE_PATTERN.test(value);
}

function ageOn(dateOfBirth: Date, today: Date) {
  let age = today.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < dateOfBirth.getUTCMonth() ||
    (today.getUTCMonth() === dateOfBirth.getUTCMonth() &&
      today.getUTCDate() < dateOfBirth.getUTCDate());
  return beforeBirthday ? age - 1 : age;
}

// Returns an error message, or null when the date is a real past date old
// enough to hold a KTP.
export function validateDateOfBirth(value: string, today = new Date()): string | null {
  const match = DATE_PATTERN.exec(value);
  if (!match) {
    return "Enter your date of birth.";
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return "Enter a valid date of birth.";
  }
  if (ageOn(date, today) < MIN_AGE_YEARS) {
    return `You must be at least ${MIN_AGE_YEARS} years old.`;
  }
  return null;
}

// Structural NIK check: known province code, a birth date segment that matches
// the date of birth (day may carry the +40 female offset), and a non-zero serial.
export function validateNik(nik: string, dateOfBirth: string): string | null {
  if (!NIK_PATTERN.test(nik)) {
    return "NIK must be exactly 16 digits.";
  }
  if (!PROVINCE_CODES.has(nik.slice(0, 2))) {
    return "NIK does not start with a valid province code.";
  }
  const match = DATE_PATTERN.exec(dateOfBirth);
  if (!match) {
    return "Enter your date of birth before your NIK.";
  }
  const day = Number(nik.slice(6, 8));
  const month = nik.slice(8, 10);
  const year = nik.slice(10, 12);
  const birthDay = Number(match[3]);
  const dayMatches = day === birthDay || day === birthDay + FEMALE_DAY_OFFSET;
  if (!dayMatches || month !== match[2] || year !== match[1].slice(2)) {
    return "NIK birth date (digits 7-12) does not match your date of birth.";
  }
  if (nik.slice(12) === "0000") {
    return "NIK serial number cannot be 0000.";
  }
  return null;
}
