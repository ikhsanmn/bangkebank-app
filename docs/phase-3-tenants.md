# Phase 3 plan: tenants and API keys for fintech clients

Status: **in progress**. Tasks 1–4 done (see [Progress](#progress)). Branch:
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
