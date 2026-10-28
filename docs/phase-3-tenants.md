# Phase 3 plan: tenants and API keys for fintech clients

Status: **in progress**. Tasks 1–8 done (see [Progress](#progress)). Branch:
`phase-3-tenants` (from `phase-2-ledger`).

Phase 2 gave every rupiah a ledger, an audit trail and DB-enforced invariants.
Phase 3 turns the single-bank demo into banking-as-a-service: fintech clients
(tenants) integrate over an HTTP API with API keys and serve their own end
customers, and no tenant can ever see or move another tenant's money.

The product stays a clearly labelled sandbox (portfolio demo). There are only
test keys (`bk_test_…`) and no real money movement.

## Goals

1. **Tenants.** A `tenant` is a fintech client. End customers, bank accounts,
   ledger entries, transfers, statement lines and audit events all belong to
   exactly one tenant.
2. **Isolation enforced by Postgres**, not by remembering a `where` clause:
   row-level security on every tenant-scoped table, plus composite foreign keys
   so a row can't reference another tenant's row.
3. **API keys.** Tenant admins create, list and revoke keys with scopes. The
   secret is shown once and stored only as a hash.
4. **Partner API v1** (`/api/v1/*`): customers (with NIK KYC), accounts,
   transfers (with a required `Idempotency-Key`), statements, ledger.
5. **Tenant console.** A small UI where tenant admins manage keys and read
   their audit log and API usage.

## Non-goals (Phase 4 or later)

- Webhooks and event delivery (outbox table, retries, signing).
- Live keys, settlement with real banks, BI-FAST/SNAP BI connectivity.
- Transfers between tenants (rejected in Phase 3; see decisions).
- Billing and per-tenant pricing.
- Self-serve tenant sign-up (tenants are created by a platform admin script).

## Design

### Data model

New tables:

| Table | Key columns | Notes |
|---|---|---|
| `tenant` | `id`, `slug` (unique), `name`, `status` (`active`/`suspended`), `createdAt` | `slug` appears in logs and the console URL |
| `tenantMember` | `tenantId`, `userId`, `role` (`owner`/`admin`/`viewer`) | Console users; separate from end customers |
| `apiKey` | `id`, `tenantId`, `prefix` (`bk_test_<8 chars>`, unique), `secretHash`, `last4`, `name`, `scopes text[]`, `createdBy`, `lastUsedAt`, `expiresAt`, `revokedAt` | Never stores the secret |
| `apiRequest` | `id`, `tenantId`, `apiKeyId`, `method`, `route`, `status`, `durationMs`, `idempotencyKey`, `occurredAt` | Usage log and rate-limit source; append-only like the audit log |

Existing tables gain `tenantId text not null references tenant(id)`:
`user` (end customers), `bankAccount`, `ledgerEntry`, `ledgerPosting`,
`bankTransaction`, `transfer`, `auditEvent` (nullable there, for platform events).

- **Composite keys.** Add `unique (tenantId, id)` on `bankAccount` and `ledgerEntry`,
  then point child foreign keys at `(tenantId, id)`. A posting or transfer that
  names another tenant's account then fails the FK check, even if RLS is bypassed.
- **Per-tenant uniqueness.** Email and NIK become unique per tenant, not
  globally: the same person can be a customer of two fintechs. Store a keyed
  HMAC of the NIK (`nikHash`, key derived from `PII_ENCRYPTION_KEY` with HKDF)
  for the uniqueness check, because the AES-GCM ciphertext is randomised. The
  public demo tenant is exempt from the NIK rule, so every visitor can sign up
  with the example NIK from the README. `shareableId` stays globally unique
  (it is random), but lookups are scoped to the sender's tenant.
- **System accounts become per tenant.** `SANDBOX_FUNDING` and `EXTERNAL_CLEARING`
  postings carry `tenantId`, so each tenant's ledger sums to zero by itself.
  The reconciliation check runs per tenant.
- **Idempotency.** The transfer idempotency unique index becomes
  `(tenantId, senderUserId, idempotencyKey)`. For API calls the key comes from
  the `Idempotency-Key` header.

### Migration of existing data

Migration `0004` creates the demo tenant (`tnt_demo`, slug `demo`: the
first-party consumer web app) and moves every existing row into it. Each
`tenantId` column is added with `DEFAULT 'tnt_demo'`, which fills existing rows
without firing row triggers, and the default is dropped straight after. So the
append-only guards from `0003` never need disabling. The composite unique keys
are created before the foreign keys that reference them; Drizzle generated them
in the opposite order, so the file is hand-ordered. `nikHash` for existing users
is filled by `scripts/db/encrypt-legacy-pii.mjs`, which `npm run db:migrate`
runs after the SQL migrations (SQL can't compute the HMAC).

### Isolation: row-level security

- Every tenant-scoped table gets `ENABLE` and `FORCE ROW LEVEL SECURITY` with one
  policy: `tenantId = current_setting('app.tenant_id', true)`.
- The app connects as a new role, `bangkebank_app`, which is not the table owner
  and has no `BYPASSRLS`. Migrations keep running as the owner role.
- Every request runs its queries in a transaction that starts with
  `select set_config('app.tenant_id', $1, true)` (transaction-local, so a pooled
  connection can't leak a tenant to the next request). A helper
  `withTenant(tenantId, fn)` in `lib/server/tenant.ts` is the only way to get a
  tenant-scoped `tx`. Existing service functions take that `tx` instead of the global `db`.
- An unset `app.tenant_id` matches no rows, so a forgotten `withTenant` fails
  closed (empty results or failed inserts), never open.
- better-auth's own tables (`session`, `account`, `verification`) stay outside RLS.
  **Decided in task 2:** `user` stays under RLS. better-auth gets its own
  connection pool (`authPool`) whose connections are pinned to the demo tenant
  at startup, because better-auth only serves the web app, which *is* the demo
  tenant. Console staff will be demo-tenant users with `tenantMember` grants,
  so they sign in the same way. The main pool sets no tenant, so it still
  fails closed.
- `tenant` and `tenantMember` are outside RLS: the console looks up a user's
  memberships across tenants before it knows which tenant to scope to.

### API keys

- **Format:** `bk_test_<prefix>_<secret>`, where `prefix` is 8 random base62
  characters (used for lookup) and `secret` is 32 random bytes in base62.
- **Storage:** `secretHash = HMAC-SHA256(API_KEY_PEPPER, secret)`. The secret has
  high entropy, so a slow hash adds nothing. The pepper is a new env var, so a
  database dump alone can't verify keys.
- **Verification:** look up by prefix and compare in constant time
  (`crypto.timingSafeEqual`). Reject revoked, expired or suspended-tenant keys
  with the same 401 body.
- **Scopes:** `customers:read`, `customers:write`, `accounts:read`,
  `accounts:write`, `transfers:read`, `transfers:write`, `ledger:read`.
  A route declares its scope, and a missing scope returns 403.
- **Lifecycle:** create (secret shown once), list (prefix and last4 only), revoke
  (sets `revokedAt`, irreversible), and roll (create the new key, revoke the old
  one after a grace period). Every action is audited.
- `lastUsedAt` is updated at most once a minute per key to avoid a write per request.

### Partner API v1

All routes require `Authorization: Bearer bk_test_…`, return JSON errors in
one shape (`{ error: { code, message, requestId } }`) and log to `apiRequest`.

| Method | Path | Scope |
|---|---|---|
| POST | `/api/v1/customers` | `customers:write` (full NIK KYC from Phase 2) |
| GET | `/api/v1/customers/:id` | `customers:read` (NIK masked, last 4 only) |
| POST | `/api/v1/customers/:id/accounts` | `accounts:write` |
| GET | `/api/v1/accounts/:id` | `accounts:read` |
| GET | `/api/v1/accounts/:id/statement?cursor=` | `accounts:read` |
| POST | `/api/v1/transfers` (`Idempotency-Key` required) | `transfers:write` |
| GET | `/api/v1/transfers/:id` | `transfers:read` |
| GET | `/api/v1/ledger/entries?cursor=` | `ledger:read` |

- Lists use cursor pagination on `(occurredAt, id)`.
- Amounts are integers in rupiah, the same as Phase 2.
- **Rate limit:** a fixed window per key (default 120 requests/minute), counted
  from `apiRequest`, returning 429 with `Retry-After`. This replaces the
  XFF-based limiter for API traffic, which closes a Phase 2 known limit.
- An OpenAPI 3.1 document is generated from the zod schemas and served at
  `/api/v1/openapi.json`, with a docs page in the console.

### Tenant console

`/console/[tenantSlug]/…`: sign in with the existing better-auth flow, then
check membership in `tenantMember`. Pages: API keys (create, show once, revoke),
audit log (filterable), API usage (requests per day, error rate), and a
"Try it" curl snippet for the sandbox. Viewers can read; only admins and owners
manage keys.

### Decisions to confirm

1. **Cross-tenant transfers are rejected** in Phase 3, with the same 404 as an
   unknown account, so a tenant can't probe another tenant's account ids.
   Customers of one fintech pay customers of another through
   `EXTERNAL_CLEARING`, as if to an outside bank. Revisit when settlement
   between tenants is designed.
2. **Own `tenantMember` table rather than better-auth's organization plugin.** The
   plugin brings invitations and teams we don't need yet, and its tables would
   sit outside the RLS model.
3. **Webhooks wait for Phase 4**, because they need an outbox and a worker
   process, which is a deployment change of its own.

## Task breakdown

Each task ends with tests passing, lint and typecheck clean, and its own commit.

1. **Schema and migration 0004:** tenant tables, `tenantId` columns, `demo` backfill,
   composite keys, per-tenant uniqueness with `nikHash`. Rerun the Phase 2
   upgrade check.
2. **RLS spike:** app role, policies, `withTenant`, and the better-auth session
   lookup under RLS. Decide the `user` policy before going further.
3. **Thread tenants through services:** `banking.ts`, `audit.ts` and routes take a
   tenant-scoped `tx`; the web app uses the `demo` tenant. All 31 Phase 2 tests
   still pass.
4. **Isolation tests:** two tenants with identical seeded data; every read and write
   path is proven unable to cross tenants, both through the service layer and
   with raw SQL as the app role.
5. **API keys:** `lib/server/api-keys.ts` (create, verify, revoke, roll, scopes),
   the env var `API_KEY_PEPPER`, and tests (timing-safe compare, revoked,
   expired, suspended tenant, wrong scope).
6. **Partner API v1:** routes, error shape, request log, rate limit and
   idempotency header, with tests for each route.
7. **OpenAPI document and console:** keys, audit log, usage and the docs page.
8. **Platform admin script:** `scripts/tenant/create.mjs` creates a tenant and its
   owner and prints the first key.
9. **Docs and CI:** `docs/phase-3-tenants.md` becomes the as-built record. CI
   gains a step that fails if a tenant-scoped table lacks RLS
   (`pg_class.relrowsecurity`/`relforcerowsecurity`). The e2e script covers the
   API with two tenants.

## Risks

- **better-auth under RLS** (task 2). Fallback: keep `user` outside RLS and enforce
  tenancy on it in the service layer, with composite FKs keeping every money
  table safe.
- **Ledger triggers and RLS interplay:** `bb_apply_posting` updates `bankAccount`
  under the caller's tenant setting. The tests must cover it, and the trigger
  functions may need `SECURITY DEFINER` with a pinned `search_path`.
- **The app role is set per connection, not per login.** The pools connect with
  `DATABASE_URL`'s user and start each session as `bangkebank_app` (startup
  option `role`). Code running SQL could `RESET ROLE` back to that user. For a
  real deployment, give the app its own LOGIN role that is a member of
  `bangkebank_app` only, and keep the owner credentials for migrations.
- **FORCE RLS binds the table owner too.** Future data migrations that run as a
  non-superuser owner must `set_config('app.tenant_id', …)` per tenant, or they
  will see no rows. (Superusers, as in local dev and CI, bypass RLS.)

## Progress

### Task 1: schema and migration 0004 (done)

- New tables `tenant` and `tenantMember`; `tenantId` on `user`, `bankAccount`,
  `ledgerEntry`, `ledgerPosting`, `bankTransaction`, `transfer` and `auditEvent`
  (nullable there).
- Composite keys `(tenantId, id)` on `user`, `bankAccount` and `ledgerEntry`. Every
  child foreign key now includes `tenantId`, replacing the single-column ones.
  The receiver foreign keys on `transfer` use `ON DELETE SET NULL (column)`
  (Postgres 15+), so deleting a receiver can't null out `tenantId`.
- Email unique per tenant; NIK unique per tenant through `nikHash` (demo exempt);
  the idempotency key unique per `(tenantId, sender, key)`.
- The service layer writes the user's tenant on every row it creates, and the
  transfer receiver lookup only searches the sender's tenant. Web sign-ups land
  in the demo tenant; a client-sent `tenantId` is ignored. Audit events carry
  the tenant.
- `tests/tenancy.test.ts` (8 tests): workspace rows carry the tenant; each
  tenant's ledger sums to zero; cross-tenant transfers are 404 and audited;
  the database refuses cross-tenant postings, entries, transfers and statement
  lines; email/NIK uniqueness per tenant with the demo exemption; app and
  backfill derive the same NIK hash; sign-up ignores a forged tenant.
- **Verified at the time:** 39/39 tests, lint, typecheck, `next build`, and the Drizzle drift
  check. An upgrade check migrated a database holding Phase-2-shaped data
  (users with encrypted NIKs, a funded account, a settled transfer, an audit
  event) to `0004`. Everything landed in the demo tenant with no leftover
  column defaults, NIK hashes were backfilled, balances still reconcile, the
  per-tenant ledger sums to zero, no single-column foreign keys remain, and
  audit rows are still append-only.

### Tasks 2 and 3: row-level security, tenants through the services (done)

Tasks 2 and 3 merged: once RLS is enforced, every query without a tenant
returns nothing, so the spike couldn't land without threading tenants through
the service layer.

- `drizzle/0005_tenant_rls.sql`:
  - creates the `bangkebank_app` role idempotently (roles are cluster-wide):
    NOLOGIN, NOSUPERUSER, NOBYPASSRLS, granted to the migrating user;
  - grants table privileges, including default privileges for future tables;
  - adds `bb_current_tenant()`;
  - enables and forces RLS with a `tenant_isolation` policy (`USING` and
    `WITH CHECK`) on `user`, `bankAccount`, `ledgerEntry`, `ledgerPosting`,
    `bankTransaction`, `transfer` and `auditEvent`.
- `lib/db`: both pools connect with `-c role=bangkebank_app`; `authPool` also sets
  `app.tenant_id=tnt_demo`. Startup options rather than a `SET` on connect, so
  no query can run before they apply (and no reliance on pg's deprecated query
  queueing).
- `lib/server/tenant.ts`: `withTenant(tenantId, fn)` runs `fn` in a transaction
  with a transaction-local `app.tenant_id`.
- Every function in `lib/server/banking.ts` takes the tenant first and runs inside
  `withTenant`. `recordAudit` without a transaction opens its own tenant
  transaction and refuses an event with no tenant. Web routes and pages pass
  `WEB_TENANT_ID` (the demo tenant) from `lib/session.ts`.
- This closes the task 1 gap: better-auth's email lookup can no longer see
  another tenant's customer with the same email.
- Tests now call services as the app role (under RLS) and assert through
  `tests/admin-db.ts`, a separate observer connection.
- `tests/rls.test.ts` (7 tests):
  - the app runs as a role with no superuser and no BYPASSRLS;
  - RLS is enabled and forced on every table with a `tenantId` (tenantMember
    exempt by design);
  - with no tenant set, reads return nothing and writes are refused;
  - a tenant sees only its own rows, and a service call with the wrong tenant
    finds nothing;
  - writes into another tenant are refused, and updates to its rows touch 0 rows;
  - the setting doesn't leak to the next user of a pooled connection;
  - web sign-in finds the demo user even when a fintech customer has the same
    email.
- **Verified:** 46/46 tests (the ledger triggers, including the deferred balance
  check and the 40-way deadlock test, all work under RLS), lint, typecheck,
  `next build`, the drift check, and the Phase 2 end-to-end script against the
  production build (32/32, clean server log).

### Task 4: isolation tests (done)

`tests/isolation.test.ts` (20 tests) builds two tenants with identical data:
the same customer emails, the same seeded accounts, and one settled and one
failed transfer each. Then, acting from tenant A against tenant B:

- **Service layer:**
  - every read function (`listBanksForUser`, `getBankForUser`,
    `listTimelineForUser` including the `bankAccountId` filter,
    `listTransfersForUser`, `getUserProfile`, `getDashboardData`) finds nothing;
  - each tenant still gets exactly its own data, and its ledger reconciles;
  - a transfer can neither pay into B's account (same email, real shareable id)
    nor spend from it: both are 404, and B's balance is untouched;
  - creating an account or seeding a workspace for B's user fails without a
    trace in B;
  - A's audit events are invisible from B.
- **Raw SQL as the app role, for all 7 tenant-scoped tables:**
  - reads see exactly A's rows (none foreign; count matches the observer's
    count for A);
  - `UPDATE` and `DELETE` aimed at B's rows touch 0 rows. On the append-only
    tables, RLS filters the rows out before the immutability trigger could
    fire;
  - inserting a row into B, or moving one of A's rows into B, is refused;
  - clearing the setting mid-transaction hides everything (the policy reads the
    live value).
- **Mutation check:** with RLS removed from `bankAccount` in the migration, 11 of
  the 27 RLS and isolation tests fail, exactly the ones that touch that table.
  Restored afterwards.
- **Verified:** 66/66 tests, lint, typecheck.

### Task 5: API keys (done)

- **Table:** `apiKey` (`drizzle/0006_api_keys.sql`) holds the tenant, name, unique
  `prefix`, `secretHash`, `last4`, scopes (a check constraint limits them to the
  seven known scopes and requires at least one), `createdBy`, `lastUsedAt`,
  `expiresAt`, `revokedAt`. It is outside RLS because a key is matched before
  any tenant is known; every list, revoke and roll query filters by tenant
  explicitly, and the RLS coverage test pins the exemption.
- **Env:** new `API_KEY_PEPPER` (32 bytes, base64), required at startup. Added to
  `.env.example`, the test config, CI and the Docker build placeholders.
- **`lib/server/api-keys.ts`:**
  - `createApiKey` returns the token `bk_test_<8 base62>_<43 base62>` exactly
    once; only `HMAC-SHA256(pepper, secret)` is stored.
  - `verifyApiKey` returns `{ id, tenantId, scopes }` or `null`, identical for
    every failure (malformed, unknown prefix, wrong secret, revoked, expired,
    suspended tenant). It compares with `timingSafeEqual`, even when the prefix
    is unknown, and refreshes `lastUsedAt` at most once a minute.
  - Also: `hasScope`, `listApiKeys` (never returns the hash), `revokeApiKey`
    (irreversible, owner tenant only) and `rollApiKey` (replacement with the
    same name and scopes; the old key expires after a grace period, default 24
    hours).
  - Create, revoke and roll are audited in the key's tenant, in the same
    transaction.
- `tests/api-keys.test.ts` (9 tests) covers storage (no secret anywhere in the
  row), verification and scopes, the `lastUsedAt` throttle, every rejection
  case, cross-tenant revoke/roll/list refused, roll with grace and cut-over,
  scope and name validation, and the audit trail.
- **Verified:** 75/75 tests, lint, typecheck, `next build`, drift check.

### Task 6: partner API v1 (done)

**Endpoints** (all `Authorization: Bearer bk_test_…`):

| Method | Path | Scope | Notes |
|---|---|---|---|
| POST | `/api/v1/customers` | `customers:write` | Full NIK KYC (same rules and encryption as web sign-up); 409 `customer_exists` on a duplicate email or NIK within the tenant |
| GET | `/api/v1/customers/:customerId` | `customers:read` | Never returns NIK, date of birth or address; `nikLast4` only |
| POST | `/api/v1/customers/:customerId/accounts` | `accounts:write` | `Savings` or `Current`; opens at zero |
| GET | `/api/v1/accounts/:accountId` | `accounts:read` | |
| GET | `/api/v1/accounts/:accountId/statement` | `accounts:read` | `?limit=1..100&cursor=`; newest first |
| POST | `/api/v1/accounts/:accountId/sandbox-deposits` | `accounts:write` | Sandbox-only play money from `SANDBOX_FUNDING` (added during build: partners otherwise had no way to fund customers) |
| POST | `/api/v1/transfers` | `transfers:write` | `Idempotency-Key` required; 201 settled, 200 replay, 422 `insufficient_funds` (body includes the failed transfer), 422 `idempotency_key_reused` if the key comes back with a different payload |
| GET | `/api/v1/transfers/:transferId` | `transfers:read` | |
| GET | `/api/v1/ledger/entries` | `ledger:read` | Entries with their postings; same pagination |

**How it's built:**
- `lib/server/partner-api.ts` `partnerRoute()` wraps every route. It verifies
  the key (401 with `WWW-Authenticate: Bearer`), then applies the rate limit
  (429 with `Retry-After`), then checks the scope (403), then checks the
  idempotency header. It maps errors to
  `{ error: { code, message, requestId } }`, sets `X-Request-Id`, and logs
  every authenticated call to `apiRequest` under the route *template*.
- `apiRequest` (`drizzle/0007`) is tenant-scoped under RLS and append-only (the
  same trigger as the audit log).
- `lib/server/partner.ts` holds the service functions and the response views.
  Transfers reuse `createTransferForUser`, so locking, the ledger, failed
  attempts and idempotency behave exactly as in the web app.
- The KYC check moved from `lib/auth.ts` to `lib/server/identity.ts`, shared by
  web sign-up and the API.
- `middleware.ts` exempts `/api/v1/` from the same-origin POST gate: it
  authenticates with bearer keys only, never cookies, so cross-site request
  forgery doesn't apply there. The cookie API is still gated.

**Tests:** `tests/partner-api.test.ts` (14) calls the route handlers with real
`Request` objects:
- 401 is not logged; 403 is logged with the route template;
- a suspended tenant's key stops working;
- the per-key rate limit applies, and another key is unaffected;
- the middleware exemption covers `/api/v1` but not the cookie API;
- customer KYC: no identity data in responses, duplicates refused, invalid NIK
  and malformed JSON rejected;
- account opening and funding; statement pagination, including bad cursor and
  limit;
- transfer settle, replay, reused key, missing key, insufficient funds;
- the ledger with balanced postings;
- a second tenant gets 404 on every customer, account, statement, transfer,
  account-opening, deposit and transfer path against the first tenant, which
  keeps its money.

**Verified:**
- 89/89 tests, lint, typecheck, `next build`, drift check;
- an HTTP smoke test against the production server (12/12): no-key POST gets
  401 rather than the CSRF 403, the full customer → account → deposit →
  transfer → replay flow works, statement and ledger read correctly, every call
  is logged under its template, and the cookie API still returns 403;
- the Phase 2 end-to-end script still passes (32/32), so web sign-up is
  unaffected by the KYC move. Clean server log.

**Known limits:**
- The rate limit is a fixed one-minute window counted from the log, so a burst
  of concurrent calls can overshoot it slightly.
- Sandbox deposits are not idempotent.
- Transfer idempotency is scoped to (tenant, sending customer, key), not to the
  API key.
- There is no list-customers endpoint yet.
- Unauthenticated calls aren't logged (they have no tenant); they show only in
  server logs.

### Task 7: OpenAPI document and tenant console (done)

**OpenAPI:**
- `lib/server/partner-schemas.ts` now holds every request and response schema.
  The routes validate with them, and `lib/server/openapi.ts` turns them into
  an OpenAPI 3.1 document (zod 4 `toJSONSchema`), so the published rules are
  the enforced rules.
- The document is served publicly at `/api/v1/openapi.json`, with the bearer
  security scheme, per-operation scope (`x-scope`), the `Idempotency-Key`
  header, pagination parameters, and the shared 401/403/429 responses.

**Console** (`/console`):
- **Access:** staff sign in with ordinary web accounts (demo tenant). A
  `tenantMember` row gives them `owner`, `admin` or `viewer` in a tenant.
- **Pages** (`/console/[slug]/…`):
  - **API keys:** a masked list with status and last use, create (the token is
    shown once with a copy button), revoke with confirmation. Owners and admins
    only; viewers see the list.
  - **Audit log:** the tenant's events, newest first, filterable by action,
    keyset-paged.
  - **Usage:** requests and error rate over 14 days, requests per Jakarta day,
    per-endpoint totals, error rate and p95 latency.
  - **API docs:** endpoints from the same operation list, a sandbox curl
    walkthrough, and a link to the OpenAPI JSON.
- **Writes** go through `POST /api/console/[slug]/keys` and
  `/api/console/[slug]/keys/[keyId]/revoke`. They are cookie-authenticated, so
  the same-origin gate applies; 401 signed out, 404 non-member, 403 viewer; the
  token response is `Cache-Control: no-store`. Actions are audited with the
  staff member as actor.
- `lib/server/console.ts` covers memberships, the audit log and usage;
  `lib/console-session.ts` is the membership guard.

**Bug found by the HTTP check:** Next renders a layout and its page in parallel,
so the layout's `notFound()` didn't stop a page from running for a non-member.
The response was still 404, but the page threw on the missing membership. Every
console page now checks membership itself through `requireConsoleMembership`.

**Tests:** `tests/console.test.ts` (9):
- the OpenAPI document covers every operation, each with an existing route
  file; it publishes the enforced transfer rules; it is served publicly;
- memberships are listed only for the user;
- key creation is allowed for admins (audited with the actor), and refused for
  viewers (403), non-members and other tenants' admins (404), anonymous users
  (401) and unknown scopes (400);
- revoke works only on the tenant's own keys;
- the audit log pages and filters;
- the usage summary is per tenant;
- staff stay in the demo tenant.

**Verified:** 98/98 tests, lint, typecheck, `next build`, drift check, and an
HTTP check against the production server (20/20, clean server log):
- sign-up, `/console` and each page render; the index redirects to keys;
- an unknown tenant gives 404, and signed-out users are redirected to sign-in;
- a key created in the console is shown once and works on `/api/v1`; the keys
  page shows it masked, never the secret;
- a cross-site console POST gets 403;
- the audit and usage pages reflect the call;
- revoke makes the key fail with 401;
- a viewer gets 403 and sees no create form;
- the OpenAPI document is public.

**Not in the UI yet:** rolling a key (the library supports it) and inviting
members (`npm run tenant:add-member` does it; see task 8).

### Task 8: platform admin scripts (done)

```bash
npm run tenant:create -- --slug acme-pay --name "Acme Pay" --owner you@example.com [--scopes ledger:read,accounts:read]
npm run tenant:add-member -- --slug acme-pay --email teammate@example.com --role admin   # or viewer, owner
```

- `scripts/tenant/create.mjs` creates the tenant, makes an existing web-app user
  (demo tenant) its owner, and prints the first API key once, with the console
  URL. Default scopes: all seven.
- `scripts/tenant/add-member.mjs` adds a member or changes their role. It refuses
  to demote a tenant's only owner, and locks the owner rows so two demotions
  can't race past the check.
- `scripts/tenant/lib.mjs` is plain SQL over node-postgres, so it runs without
  the app build.
  - Each command is one transaction.
  - It sets `app.tenant_id` before touching tenant-scoped tables (the user
    lookup in the demo tenant, then audit rows in the new tenant), so it works
    for a non-superuser owner under FORCE RLS.
  - The key format and HMAC match `lib/server/api-keys.ts`.
  - Writes are audited (`tenant.created`, `tenant_member.added`,
    `api_key.created`) with `metadata.via = "platform-admin-cli"`.
- Errors (taken slug, bad slug, unknown owner, unknown scope or role, missing
  tenant, malformed arguments) print a one-line message and exit 1, leaving
  nothing behind.
- `tests/tenant-admin.test.ts` (4) runs the library *as the app role*:
  - a created tenant's key passes the app's `verifyApiKey`, the owner
    membership appears in the console, and the audit trail is written;
  - scopes can be narrowed;
  - bad input is refused with no rows left;
  - members can be added and their roles changed, with the last-owner guard.
- **Found during the CLI smoke run:** `add-member` could demote the only owner.
  The guard above was added and is tested.
- **Verified:** the CLIs against the dev database (create, duplicate, unknown
  owner, add-member, bad argument, with correct exit codes), plus the full
  suite, lint and typecheck.
