import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";

import { GET as getAccount } from "@/app/api/v1/accounts/[accountId]/route";
import { POST as deposit } from "@/app/api/v1/accounts/[accountId]/sandbox-deposits/route";
import { GET as getStatement } from "@/app/api/v1/accounts/[accountId]/statement/route";
import { POST as openAccount } from "@/app/api/v1/customers/[customerId]/accounts/route";
import { GET as getCustomer } from "@/app/api/v1/customers/[customerId]/route";
import { POST as createCustomer } from "@/app/api/v1/customers/route";
import { GET as listEntries } from "@/app/api/v1/ledger/entries/route";
import { GET as getTransfer } from "@/app/api/v1/transfers/[transferId]/route";
import { POST as createTransfer } from "@/app/api/v1/transfers/route";
import { API_SCOPES, apiRequests, tenants } from "@/lib/db/schema";
import { createApiKey } from "@/lib/server/api-keys";
import { RATE_LIMIT_PER_MINUTE } from "@/lib/server/partner-api";
import { middleware } from "@/middleware";

import { adminDb, createTenant } from "./helpers";

type Handler = (request: Request, context: { params: Record<string, string> }) => Promise<Response>;

const BASE = "http://localhost:3000";

async function call(
  handler: Handler,
  options: {
    token?: string;
    method?: string;
    path?: string;
    params?: Record<string, string>;
    body?: unknown;
    rawBody?: string;
    idempotencyKey?: string;
  } = {}
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.idempotencyKey) headers["idempotency-key"] = options.idempotencyKey;
  const request = new Request(`${BASE}${options.path ?? "/api/v1/test"}`, {
    method: options.method ?? (options.body !== undefined || options.rawBody ? "POST" : "GET"),
    headers,
    body: options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body))
  });
  const response = await handler(request, { params: options.params ?? {} });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: response.status, headers: response.headers, body: (await response.json()) as any };
}

let nikSerial = 1;
function customerBody(overrides: Record<string, unknown> = {}) {
  // 16-digit NIKs that pass validation: province 19, birth 17-08-1990 (+40, female), unique serial.
  const nik = `197101570890${String(nikSerial++).padStart(4, "0")}`;
  return {
    email: `cust-${crypto.randomUUID().slice(0, 8)}@example.test`,
    firstName: "Siti",
    lastName: "Rahma",
    address1: "Jl. Merdeka No. 1",
    city: "Pangkalpinang",
    province: "Kepulauan Bangka Belitung",
    postalCode: "33111",
    dateOfBirth: "1990-08-17",
    nik,
    ...overrides
  };
}

async function tenantWithKey(label: string, scopes: readonly string[] = API_SCOPES) {
  const tenantId = await createTenant(label);
  const { token, apiKey } = await createApiKey(tenantId, { name: label, scopes }, { actorUserId: null });
  return { tenantId, token, keyId: apiKey.id };
}

async function setUpCustomerWithAccount(token: string, funding = 0) {
  const customer = await call(createCustomer, { token, body: customerBody() });
  const account = await call(openAccount, {
    token,
    params: { customerId: customer.body.customer.id },
    body: { name: "Wallet", subtype: "Savings" }
  });
  if (funding) {
    await call(deposit, { token, params: { accountId: account.body.account.id }, body: { amount: funding } });
  }
  return { customer: customer.body.customer, account: account.body.account };
}

let fintech: Awaited<ReturnType<typeof tenantWithKey>>;

beforeAll(async () => {
  fintech = await tenantWithKey("api");
});

describe("partner API authentication", () => {
  it("rejects a missing or invalid key with 401 and logs nothing", async () => {
    for (const token of [undefined, "bk_test_nope"]) {
      const response = await call(getCustomer, { token, params: { customerId: "x" } });
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe("Bearer");
      expect(response.body.error.code).toBe("unauthorized");
      expect(response.body.error.requestId).toBe(response.headers.get("x-request-id"));
      const logged = await adminDb.select().from(apiRequests).where(eq(apiRequests.id, response.body.error.requestId));
      expect(logged).toEqual([]);
    }
  });

  it("returns 403 for a key without the route's scope, and logs it under the route template", async () => {
    const readOnly = await tenantWithKey("readonly", ["customers:read"]);
    const response = await call(createCustomer, { token: readOnly.token, body: customerBody() });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("insufficient_scope");

    const [logged] = await adminDb.select().from(apiRequests).where(eq(apiRequests.id, response.body.error.requestId));
    expect(logged).toMatchObject({ tenantId: readOnly.tenantId, apiKeyId: readOnly.keyId, method: "POST", route: "/api/v1/customers", status: 403 });
  });

  it("stops working when the tenant is suspended", async () => {
    const doomed = await tenantWithKey("suspended");
    const { customer } = await setUpCustomerWithAccount(doomed.token);
    await adminDb.update(tenants).set({ status: "suspended" }).where(eq(tenants.id, doomed.tenantId));
    expect((await call(getCustomer, { token: doomed.token, params: { customerId: customer.id } })).status).toBe(401);
  });

  it("rate-limits each key per minute with 429 and Retry-After", async () => {
    const busy = await tenantWithKey("busy");
    await adminDb.insert(apiRequests).values(
      Array.from({ length: RATE_LIMIT_PER_MINUTE }, () => ({
        id: crypto.randomUUID(),
        tenantId: busy.tenantId,
        apiKeyId: busy.keyId,
        method: "GET",
        route: "/api/v1/customers/:customerId",
        status: 200,
        durationMs: 1
      }))
    );
    const limited = await call(getCustomer, { token: busy.token, params: { customerId: "x" } });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("rate_limited");
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);

    // Another key is unaffected.
    const calm = await call(getCustomer, { token: fintech.token, params: { customerId: crypto.randomUUID() } });
    expect(calm.status).toBe(404);
  });

  it("is exempt from the browser same-origin gate; the cookie API is not", () => {
    const partner = middleware(new NextRequest(`${BASE}/api/v1/transfers`, { method: "POST" }));
    const web = middleware(new NextRequest(`${BASE}/api/transfers`, { method: "POST" }));
    expect(partner.status).toBe(200);
    expect(web.status).toBe(403);
  });
});

describe("partner API customers and accounts", () => {
  it("creates a customer from full KYC and never returns identity data", async () => {
    const body = customerBody();
    const created = await call(createCustomer, { token: fintech.token, body });
    expect(created.status).toBe(201);
    expect(created.body.customer).toMatchObject({ email: body.email, firstName: "Siti", nikLast4: body.nik.slice(-4) });
    const serialized = JSON.stringify(created.body);
    for (const secret of [body.nik, body.dateOfBirth, body.address1]) {
      expect(serialized).not.toContain(secret);
    }

    const fetched = await call(getCustomer, { token: fintech.token, params: { customerId: created.body.customer.id } });
    expect(fetched.body.customer).toEqual(created.body.customer);
  });

  it("refuses duplicate customers and invalid identities", async () => {
    const body = customerBody();
    await call(createCustomer, { token: fintech.token, body });

    const sameEmail = await call(createCustomer, { token: fintech.token, body: customerBody({ email: body.email }) });
    expect(sameEmail.status).toBe(409);
    expect(sameEmail.body.error.code).toBe("customer_exists");

    const sameNik = await call(createCustomer, { token: fintech.token, body: customerBody({ nik: body.nik }) });
    expect(sameNik.status).toBe(409);

    const badNik = await call(createCustomer, { token: fintech.token, body: customerBody({ nik: "1971010101900001" }) });
    expect(badNik.status).toBe(422);
    expect(badNik.body.error.code).toBe("invalid_identity");

    const notJson = await call(createCustomer, { token: fintech.token, rawBody: "{nope" });
    expect(notJson.status).toBe(400);
    expect(notJson.body.error.code).toBe("invalid_json");
  });

  it("opens a zero-balance account and funds it with a sandbox deposit", async () => {
    const { account } = await setUpCustomerWithAccount(fintech.token);
    expect(account).toMatchObject({ currency: "IDR", currentBalance: 0, availableBalance: 0 });

    const funded = await call(deposit, { token: fintech.token, params: { accountId: account.id }, body: { amount: 2_000_000 } });
    expect(funded.status).toBe(201);
    const after = await call(getAccount, { token: fintech.token, params: { accountId: account.id } });
    expect(after.body.account.currentBalance).toBe(2_000_000);

    const fractional = await call(deposit, { token: fintech.token, params: { accountId: account.id }, body: { amount: 1.5 } });
    expect(fractional.status).toBe(422);
    expect(fractional.body.error.code).toBe("validation_error");
  });

  it("pages through a statement with an opaque cursor", async () => {
    const { account } = await setUpCustomerWithAccount(fintech.token);
    for (const amount of [100_000, 200_000, 300_000]) {
      await call(deposit, { token: fintech.token, params: { accountId: account.id }, body: { amount } });
    }

    const seen: number[] = [];
    let cursor: string | null = null;
    do {
      const query: string = cursor ? `?limit=2&cursor=${cursor}` : "?limit=2";
      const page = await call(getStatement, { token: fintech.token, path: `/api/v1/accounts/x/statement${query}`, params: { accountId: account.id } });
      expect(page.status).toBe(200);
      seen.push(...page.body.data.map((line: { amount: number }) => line.amount));
      cursor = page.body.nextCursor;
    } while (cursor);
    expect(seen).toEqual([300_000, 200_000, 100_000]);

    const badCursor = await call(getStatement, { token: fintech.token, path: "/api/v1/accounts/x/statement?cursor=garbage", params: { accountId: account.id } });
    expect(badCursor.status).toBe(422);
    const badLimit = await call(getStatement, { token: fintech.token, path: "/api/v1/accounts/x/statement?limit=0", params: { accountId: account.id } });
    expect(badLimit.status).toBe(422);
  });
});

describe("partner API transfers", () => {
  it("settles a transfer, replays it, and refuses a reused key with a different payload", async () => {
    const sender = await setUpCustomerWithAccount(fintech.token, 1_000_000);
    const receiver = await setUpCustomerWithAccount(fintech.token);
    const body = { fromAccountId: sender.account.id, toAccountId: receiver.account.id, amount: 250_000 };
    const idempotencyKey = crypto.randomUUID();

    const created = await call(createTransfer, { token: fintech.token, body, idempotencyKey });
    expect(created.status).toBe(201);
    expect(created.body.transfer).toMatchObject({ status: "settled", amount: 250_000, currency: "IDR" });

    const replay = await call(createTransfer, { token: fintech.token, body, idempotencyKey });
    expect(replay.status).toBe(200);
    expect(replay.body.replayed).toBe(true);
    expect(replay.body.transfer.id).toBe(created.body.transfer.id);

    const reused = await call(createTransfer, { token: fintech.token, body: { ...body, amount: 1 }, idempotencyKey });
    expect(reused.status).toBe(422);
    expect(reused.body.error.code).toBe("idempotency_key_reused");

    const fetched = await call(getTransfer, { token: fintech.token, params: { transferId: created.body.transfer.id } });
    expect(fetched.body.transfer).toEqual(created.body.transfer);
    const balance = await call(getAccount, { token: fintech.token, params: { accountId: receiver.account.id } });
    expect(balance.body.account.currentBalance).toBe(250_000);
  });

  it("requires an Idempotency-Key", async () => {
    const response = await call(createTransfer, {
      token: fintech.token,
      body: { fromAccountId: crypto.randomUUID(), toAccountId: crypto.randomUUID(), amount: 1 }
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("idempotency_key_required");
  });

  it("returns 422 with the failed transfer when funds are short", async () => {
    const sender = await setUpCustomerWithAccount(fintech.token, 10_000);
    const receiver = await setUpCustomerWithAccount(fintech.token);
    const response = await call(createTransfer, {
      token: fintech.token,
      body: { fromAccountId: sender.account.id, toAccountId: receiver.account.id, amount: 10_001 },
      idempotencyKey: crypto.randomUUID()
    });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("insufficient_funds");
    expect(response.body.transfer.status).toBe("failed");
  });

  it("exposes the tenant's balanced ledger with postings", async () => {
    const ledgerTenant = await tenantWithKey("ledger");
    const sender = await setUpCustomerWithAccount(ledgerTenant.token, 500_000);
    const receiver = await setUpCustomerWithAccount(ledgerTenant.token);
    await call(createTransfer, {
      token: ledgerTenant.token,
      body: { fromAccountId: sender.account.id, toAccountId: receiver.account.id, amount: 125_000 },
      idempotencyKey: crypto.randomUUID()
    });

    const page = await call(listEntries, { token: ledgerTenant.token, path: "/api/v1/ledger/entries" });
    expect(page.status).toBe(200);
    expect(page.body.data.map((entry: { kind: string }) => entry.kind)).toEqual(["transfer", "sandbox_funding"]);
    for (const entry of page.body.data) {
      const total = entry.postings.reduce((sum: number, posting: { amount: number }) => sum + posting.amount, 0);
      expect(total).toBe(0);
    }
  });
});

describe("partner API tenant isolation", () => {
  it("treats another tenant's customers, accounts and transfers as not found", async () => {
    const sender = await setUpCustomerWithAccount(fintech.token, 100_000);
    const receiver = await setUpCustomerWithAccount(fintech.token);
    const transfer = await call(createTransfer, {
      token: fintech.token,
      body: { fromAccountId: sender.account.id, toAccountId: receiver.account.id, amount: 1_000 },
      idempotencyKey: crypto.randomUUID()
    });
    const rival = await tenantWithKey("rival");
    const rivalAccount = await setUpCustomerWithAccount(rival.token);

    expect((await call(getCustomer, { token: rival.token, params: { customerId: sender.customer.id } })).status).toBe(404);
    expect((await call(getAccount, { token: rival.token, params: { accountId: sender.account.id } })).status).toBe(404);
    expect((await call(getStatement, { token: rival.token, params: { accountId: sender.account.id } })).status).toBe(404);
    expect((await call(getTransfer, { token: rival.token, params: { transferId: transfer.body.transfer.id } })).status).toBe(404);
    expect(
      (await call(openAccount, { token: rival.token, params: { customerId: sender.customer.id }, body: { name: "x", subtype: "Savings" } })).status
    ).toBe(404);
    expect((await call(deposit, { token: rival.token, params: { accountId: sender.account.id }, body: { amount: 1 } })).status).toBe(404);

    const steal = await call(createTransfer, {
      token: rival.token,
      body: { fromAccountId: sender.account.id, toAccountId: rivalAccount.account.id, amount: 1_000 },
      idempotencyKey: crypto.randomUUID()
    });
    expect(steal.status).toBe(404);
    const after = await call(getAccount, { token: fintech.token, params: { accountId: sender.account.id } });
    expect(after.body.account.currentBalance).toBe(99_000);

    const rivalLedger = await call(listEntries, { token: rival.token, path: "/api/v1/ledger/entries?limit=100" });
    const ids = new Set(rivalLedger.body.data.map((entry: { id: string }) => entry.id));
    expect(ids.has(transfer.body.transfer.ledgerEntryId)).toBe(false);
  });
});
