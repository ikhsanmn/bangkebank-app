import { z } from "zod";

import { MAX_TRANSFER_RUPIAH } from "@/lib/format";

// Request and response shapes of the partner API. The routes validate with
// the request schemas and lib/server/openapi.ts publishes all of them, so the
// documentation can't drift from what the server accepts.

// Identity rules (NIK structure, date of birth, province, postal code) are
// enforced by lib/server/identity.ts; this only checks the shape.
export const createCustomerSchema = z.object({
  email: z.string().email().max(254),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  address1: z.string().max(200),
  city: z.string().trim().min(1).max(100),
  province: z.string().max(100).describe("One of Indonesia's 38 provinces, e.g. \"DKI Jakarta\"."),
  postalCode: z.string().max(10).describe("5 digits."),
  dateOfBirth: z.string().max(10).describe("YYYY-MM-DD; the customer must be at least 17."),
  nik: z.string().max(16).describe("16-digit NIK whose birth-date digits match dateOfBirth.")
});

export const openAccountSchema = z.object({
  name: z.string().trim().min(1).max(100),
  subtype: z.enum(["Savings", "Current"])
});

export const depositSchema = z.object({
  amount: z.number().int().positive().max(MAX_TRANSFER_RUPIAH).describe("Whole rupiah.")
});

export const createTransferSchema = z.object({
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
  amount: z
    .number()
    .int()
    .positive()
    .max(MAX_TRANSFER_RUPIAH)
    .describe("Whole rupiah, capped at the BI-FAST per-transfer limit."),
  note: z.string().max(280).optional()
});

const timestamp = z.string().describe("ISO 8601 timestamp.");

export const customerSchema = z.object({
  id: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  city: z.string(),
  province: z.string(),
  postalCode: z.string(),
  nikLast4: z.string().describe("The only part of the NIK ever returned."),
  createdAt: timestamp
});

export const accountSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  name: z.string(),
  subtype: z.string(),
  currency: z.literal("IDR"),
  currentBalance: z.number().int(),
  availableBalance: z.number().int(),
  shareableId: z.string(),
  createdAt: timestamp
});

export const transferSchema = z.object({
  id: z.string(),
  fromAccountId: z.string(),
  toAccountId: z.string().nullable(),
  amount: z.number().int(),
  currency: z.literal("IDR"),
  note: z.string().nullable(),
  status: z.enum(["pending", "settled", "failed"]),
  failureReason: z.string().nullable(),
  ledgerEntryId: z.string().nullable(),
  createdAt: timestamp,
  completedAt: timestamp.nullable()
});

export const statementLineSchema = z.object({
  id: z.string(),
  name: z.string(),
  amount: z.number().int().describe("Always positive; see direction."),
  direction: z.enum(["credit", "debit"]),
  channel: z.string(),
  category: z.string(),
  ledgerEntryId: z.string().nullable(),
  occurredAt: timestamp
});

export const depositResultSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  amount: z.number().int(),
  ledgerEntryId: z.string().nullable(),
  occurredAt: timestamp
});

export const ledgerEntrySchema = z.object({
  id: z.string(),
  kind: z.enum(["sandbox_funding", "transfer", "external_payment", "external_receipt"]),
  description: z.string(),
  occurredAt: timestamp,
  postings: z.array(
    z.object({
      accountId: z.string().nullable(),
      systemAccount: z.string().nullable(),
      amount: z.number().int().describe("Signed: positive raises the account's balance.")
    })
  )
});

export const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string()
  })
});
