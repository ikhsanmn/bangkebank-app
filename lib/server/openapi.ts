import { z } from "zod";

import { type ApiScope } from "@/lib/db/schema";
import { RATE_LIMIT_PER_MINUTE } from "@/lib/server/partner-api";
import {
  accountSchema,
  createCustomerSchema,
  createTransferSchema,
  customerSchema,
  depositResultSchema,
  depositSchema,
  errorSchema,
  ledgerEntrySchema,
  openAccountSchema,
  statementLineSchema,
  transferSchema
} from "@/lib/server/partner-schemas";

// OpenAPI 3.1 description of /api/v1, built from the same zod schemas the
// routes validate with. Served at /api/v1/openapi.json and rendered in the
// tenant console's API docs page.

type Operation = {
  operationId: string;
  method: "get" | "post";
  path: string;
  scope: ApiScope;
  summary: string;
  description?: string;
  request?: z.ZodType;
  idempotent?: boolean;
  paginated?: boolean;
  responses: Record<string, { description: string; schema?: z.ZodType }>;
};

const list = (item: z.ZodType) => z.object({ data: z.array(item), nextCursor: z.string().nullable() });

export const OPERATIONS: Operation[] = [
  {
    operationId: "createCustomer",
    method: "post",
    path: "/api/v1/customers",
    scope: "customers:write",
    summary: "Create a customer",
    description: "Runs the full Indonesian KYC check. The NIK, date of birth and address are stored encrypted and never returned.",
    request: createCustomerSchema,
    responses: {
      "201": { description: "Created.", schema: z.object({ customer: customerSchema }) },
      "409": { description: "A customer with this email or NIK already exists in your tenant." },
      "422": { description: "The identity failed validation (invalid_identity) or the body is malformed." }
    }
  },
  {
    operationId: "getCustomer",
    method: "get",
    path: "/api/v1/customers/{customerId}",
    scope: "customers:read",
    summary: "Get a customer",
    responses: {
      "200": { description: "The customer.", schema: z.object({ customer: customerSchema }) },
      "404": { description: "No such customer in your tenant." }
    }
  },
  {
    operationId: "openAccount",
    method: "post",
    path: "/api/v1/customers/{customerId}/accounts",
    scope: "accounts:write",
    summary: "Open an account",
    description: "Accounts open with a zero balance.",
    request: openAccountSchema,
    responses: {
      "201": { description: "Opened.", schema: z.object({ account: accountSchema }) },
      "404": { description: "No such customer in your tenant." }
    }
  },
  {
    operationId: "getAccount",
    method: "get",
    path: "/api/v1/accounts/{accountId}",
    scope: "accounts:read",
    summary: "Get an account",
    responses: {
      "200": { description: "The account with its balances.", schema: z.object({ account: accountSchema }) },
      "404": { description: "No such account in your tenant." }
    }
  },
  {
    operationId: "listStatement",
    method: "get",
    path: "/api/v1/accounts/{accountId}/statement",
    scope: "accounts:read",
    summary: "List an account's statement lines",
    description: "Newest first.",
    paginated: true,
    responses: {
      "200": { description: "One page.", schema: list(statementLineSchema) },
      "404": { description: "No such account in your tenant." }
    }
  },
  {
    operationId: "createSandboxDeposit",
    method: "post",
    path: "/api/v1/accounts/{accountId}/sandbox-deposits",
    scope: "accounts:write",
    summary: "Deposit sandbox money",
    description: "Sandbox only: credits play money so you can fund the customers you create. Not idempotent.",
    request: depositSchema,
    responses: {
      "201": { description: "Deposited.", schema: z.object({ deposit: depositResultSchema }) },
      "404": { description: "No such account in your tenant." }
    }
  },
  {
    operationId: "createTransfer",
    method: "post",
    path: "/api/v1/transfers",
    scope: "transfers:write",
    summary: "Transfer between two accounts",
    description:
      "Both accounts must belong to your tenant. Retrying with the same Idempotency-Key and payload returns the original transfer.",
    request: createTransferSchema,
    idempotent: true,
    responses: {
      "201": { description: "Settled.", schema: z.object({ transfer: transferSchema, replayed: z.literal(false) }) },
      "200": { description: "Replay of an earlier request.", schema: z.object({ transfer: transferSchema, replayed: z.literal(true) }) },
      "400": { description: "Missing or invalid Idempotency-Key (idempotency_key_required)." },
      "404": { description: "An account isn't in your tenant." },
      "422": {
        description:
          "insufficient_funds (the body also carries the failed transfer), idempotency_key_reused (same key, different payload), or a validation error."
      }
    }
  },
  {
    operationId: "getTransfer",
    method: "get",
    path: "/api/v1/transfers/{transferId}",
    scope: "transfers:read",
    summary: "Get a transfer",
    responses: {
      "200": { description: "The transfer.", schema: z.object({ transfer: transferSchema }) },
      "404": { description: "No such transfer in your tenant." }
    }
  },
  {
    operationId: "listLedgerEntries",
    method: "get",
    path: "/api/v1/ledger/entries",
    scope: "ledger:read",
    summary: "List ledger entries",
    description: "Your tenant's double-entry journal, newest first. Each entry's postings sum to zero.",
    paginated: true,
    responses: { "200": { description: "One page.", schema: list(ledgerEntrySchema) } }
  }
];

function jsonSchema(schema: z.ZodType) {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<
    string,
    unknown
  >;
  return rest;
}

const json = (schema: z.ZodType) => ({ "application/json": { schema: jsonSchema(schema) } });

export function buildOpenApiDocument(serverUrl: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const op of OPERATIONS) {
    const pathParams = [...op.path.matchAll(/\{(\w+)\}/g)].map(([, name]) => ({
      name,
      in: "path",
      required: true,
      schema: { type: "string" }
    }));
    const parameters = [
      ...pathParams,
      ...(op.idempotent
        ? [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 8, maxLength: 128 } }]
        : []),
      ...(op.paginated
        ? [
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 25 } },
            { name: "cursor", in: "query", schema: { type: "string" }, description: "nextCursor from the previous page." }
          ]
        : [])
    ];
    const responses: Record<string, unknown> = {};
    for (const [status, response] of Object.entries(op.responses)) {
      responses[status] = {
        description: response.description,
        content: json(response.schema ?? errorSchema)
      };
    }
    responses["401"] = { description: "Missing or invalid API key.", content: json(errorSchema) };
    responses["403"] = { description: `The key lacks the ${op.scope} scope.`, content: json(errorSchema) };
    responses["429"] = { description: `Over ${RATE_LIMIT_PER_MINUTE} requests per minute for this key.`, content: json(errorSchema) };

    paths[op.path] = {
      ...paths[op.path],
      [op.method]: {
        summary: op.summary,
        description: [op.description, `Requires the \`${op.scope}\` scope.`].filter(Boolean).join(" "),
        operationId: op.operationId,
        "x-scope": op.scope,
        ...(parameters.length > 0 ? { parameters } : {}),
        ...(op.request ? { requestBody: { required: true, content: json(op.request) } } : {}),
        responses
      }
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "BangkeBank partner API",
      version: "1.0.0",
      description:
        "Sandbox banking-as-a-service API for fintech tenants. Portfolio demo: no real money moves. Amounts are whole rupiah (IDR)."
    },
    servers: [{ url: serverUrl }],
    security: [{ apiKey: [] }],
    components: {
      securitySchemes: {
        apiKey: { type: "http", scheme: "bearer", description: "Authorization: Bearer bk_test_<prefix>_<secret>" }
      }
    },
    paths
  };
}
