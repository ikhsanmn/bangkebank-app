import type { bankAccounts, bankTransactions } from "@/lib/db/schema";

type BankRow = typeof bankAccounts.$inferSelect;
type TransactionRow = typeof bankTransactions.$inferSelect;

export type AccountView = {
  id: string;
  name: string;
  institution: string;
  subtype: string;
  mask: string;
  shareableId: string;
  balance: number;
  available: number;
  routingHint: string;
  tone: string;
};

export type TransactionView = {
  id: string;
  accountId: string;
  name: string;
  amount: number;
  date: string;
  status: string;
  channel: string;
  category: string;
  source: string;
  direction: "credit" | "debit";
};

const ACCOUNT_TONES = [
  "from-[#0b3b66] via-[#15507d] to-[#2a7a86]",
  "from-[#234a56] via-[#356f7f] to-[#78a7a5]",
  "from-[#5b3a2e] via-[#8a5a44] to-[#c5855f]"
];

export function toAccountView(row: BankRow, index: number): AccountView {
  return {
    id: row.id,
    name: row.name,
    institution: row.institution,
    subtype: row.subtype,
    mask: row.mask,
    shareableId: row.shareableId,
    balance: Number(row.currentBalance),
    available: Number(row.availableBalance),
    routingHint: row.routingHint,
    tone: ACCOUNT_TONES[index % ACCOUNT_TONES.length]
  };
}

export function toTransactionView(row: TransactionRow): TransactionView {
  return {
    id: row.id,
    accountId: row.bankAccountId,
    name: row.name,
    amount: Number(row.amount),
    date: new Date(row.occurredAt).toISOString(),
    status: row.status,
    channel: row.channel,
    category: row.category,
    source: row.source,
    direction: row.direction === "credit" ? "credit" : "debit"
  };
}
