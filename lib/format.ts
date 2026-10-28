// Rupiah are shown and entered as whole numbers; "Rp 1.500.000" style.
const currencyFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta"
});

// BI-FAST caps a single transfer at Rp 250 million; the sandbox mirrors it.
export const MAX_TRANSFER_RUPIAH = 250_000_000;

export function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

export function formatDate(value: string | Date) {
  return dateFormatter.format(typeof value === "string" ? new Date(value) : value);
}

// Accepts "1500000" or "1.500.000" and returns whole rupiah, or null.
export function parseRupiah(input: string) {
  const compact = input.trim().replace(/\./g, "");
  if (!/^\d{1,12}$/.test(compact)) {
    return null;
  }
  return Number(compact);
}
