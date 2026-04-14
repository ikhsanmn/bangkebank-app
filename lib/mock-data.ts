export type BankAccount = {
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

export type Transaction = {
  id: string;
  accountId: string;
  name: string;
  amount: number;
  date: string;
  status: "Processing" | "Completed" | "Pending";
  channel: string;
  category: string;
  source: "Plaid Sync" | "Internal Transfer";
  direction: "credit" | "debit";
};

export const userProfile = {
  firstName: "Avery",
  fullName: "Avery Brooks",
  email: "avery@bangkebank.app",
  city: "Brooklyn",
  state: "NY"
};

export const bankAccounts: BankAccount[] = [
  {
    id: "acc-chase-checking",
    name: "Primary Checking",
    institution: "Chase",
    subtype: "Checking",
    mask: "1842",
    shareableId: "HZ-1842-NY-01",
    balance: 12640.42,
    available: 12100.42,
    routingHint: "Funding source active",
    tone: "from-[#0b3b66] via-[#15507d] to-[#2a7a86]"
  },
  {
    id: "acc-capital-one-savings",
    name: "Rainy Day Reserve",
    institution: "Capital One",
    subtype: "Savings",
    mask: "7721",
    shareableId: "HZ-7721-NY-08",
    balance: 28450.9,
    available: 28450.9,
    routingHint: "High-yield reserve",
    tone: "from-[#234a56] via-[#356f7f] to-[#78a7a5]"
  },
  {
    id: "acc-amex-checking",
    name: "Operations Wallet",
    institution: "American Express",
    subtype: "Checking",
    mask: "4209",
    shareableId: "HZ-4209-NY-22",
    balance: 4930.13,
    available: 4625.13,
    routingHint: "ACH transfers enabled",
    tone: "from-[#302448] via-[#4f3b68] to-[#9b7b87]"
  }
];

export const recentTransactions: Transaction[] = [
  {
    id: "txn-001",
    accountId: "acc-chase-checking",
    name: "Whole Foods Market",
    amount: -82.45,
    date: "2026-04-06",
    status: "Completed",
    channel: "In store",
    category: "Groceries",
    source: "Plaid Sync",
    direction: "debit"
  },
  {
    id: "txn-002",
    accountId: "acc-capital-one-savings",
    name: "ACH Transfer to Jordan Lee",
    amount: -450,
    date: "2026-04-05",
    status: "Processing",
    channel: "ACH",
    category: "Transfer",
    source: "Internal Transfer",
    direction: "debit"
  },
  {
    id: "txn-003",
    accountId: "acc-amex-checking",
    name: "Stripe Client Payout",
    amount: 3200,
    date: "2026-04-04",
    status: "Completed",
    channel: "Bank deposit",
    category: "Income",
    source: "Plaid Sync",
    direction: "credit"
  },
  {
    id: "txn-004",
    accountId: "acc-chase-checking",
    name: "Figma",
    amount: -19,
    date: "2026-04-03",
    status: "Completed",
    channel: "Card subscription",
    category: "Software",
    source: "Plaid Sync",
    direction: "debit"
  },
  {
    id: "txn-005",
    accountId: "acc-amex-checking",
    name: "Rent Payment",
    amount: -1850,
    date: "2026-04-02",
    status: "Completed",
    channel: "ACH",
    category: "Housing",
    source: "Plaid Sync",
    direction: "debit"
  },
  {
    id: "txn-006",
    accountId: "acc-capital-one-savings",
    name: "Inbound transfer from Mia Hart",
    amount: 600,
    date: "2026-04-01",
    status: "Pending",
    channel: "ACH",
    category: "Transfer",
    source: "Internal Transfer",
    direction: "credit"
  },
  {
    id: "txn-007",
    accountId: "acc-chase-checking",
    name: "United Airlines",
    amount: -428.3,
    date: "2026-03-30",
    status: "Completed",
    channel: "Online",
    category: "Travel",
    source: "Plaid Sync",
    direction: "debit"
  },
  {
    id: "txn-008",
    accountId: "acc-capital-one-savings",
    name: "Interest payment",
    amount: 43.12,
    date: "2026-03-29",
    status: "Completed",
    channel: "Bank deposit",
    category: "Interest",
    source: "Plaid Sync",
    direction: "credit"
  }
];

export const categoryBreakdown = [
  { label: "Housing", value: 1850, fill: "bg-chart-1" },
  { label: "Transfer", value: 1050, fill: "bg-chart-2" },
  { label: "Travel", value: 428.3, fill: "bg-chart-3" },
  { label: "Groceries", value: 82.45, fill: "bg-chart-4" },
  { label: "Software", value: 19, fill: "bg-chart-5" }
];

export const weeklyBalances = [
  { label: "Mon", value: 72 },
  { label: "Tue", value: 81 },
  { label: "Wed", value: 76 },
  { label: "Thu", value: 92 },
  { label: "Fri", value: 88 },
  { label: "Sat", value: 79 },
  { label: "Sun", value: 95 }
];

export const transferRecipients = [
  {
    name: "Jordan Lee",
    email: "jordan.lee@example.com",
    shareableId: "HZ-2049-CA-41",
    note: "Rent split"
  },
  {
    name: "Mia Hart",
    email: "mia.hart@example.com",
    shareableId: "HZ-8890-TX-17",
    note: "Savings club"
  }
];

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

export const totalBalance = bankAccounts.reduce(
  (sum, account) => sum + account.balance,
  0
);

export const totalAvailable = bankAccounts.reduce(
  (sum, account) => sum + account.available,
  0
);
