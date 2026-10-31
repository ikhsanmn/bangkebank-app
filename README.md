# BangkeBank

A **portfolio demo** of banking-as-a-service for Indonesian fintechs, built with
Next.js 14, Drizzle ORM, Postgres and better-auth. Money is whole rupiah on a
double-entry ledger enforced by the database; identity data (NIK) is encrypted.
Fintech tenants integrate over a partner API with scoped API keys, and Postgres
row-level security keeps every tenant's data apart.

> BangkeBank is not a bank. Balances are sandbox values and no real money moves.

## Run locally

Requires Node 20+ and Docker.

```bash
npm install
cp .env.example .env
# put separate outputs of `openssl rand -base64 32` in
# BETTER_AUTH_SECRET, PII_ENCRYPTION_KEY and API_KEY_PEPPER
npm run db:start     # Postgres 16 on 127.0.0.1:55432
npm run db:migrate
npm run dev          # http://localhost:3000
```

Sign up with made-up details, never a real NIK. A valid-looking example for a
woman born 17 Aug 1990 in Bangka Belitung: `1971015708900001`. The account
comes with sandbox balances.

## Partner API and console

The web app above is the built-in `demo` tenant. To act as a fintech tenant:

```bash
# 1. Sign up in the web app (that account becomes the tenant's owner), then:
npm run tenant:create -- --slug acme-pay --name "Acme Pay" --owner you@example.com
#    prints the first API key once: bk_test_…
npm run tenant:add-member -- --slug acme-pay --email teammate@example.com --role admin

# 2. Call the API with the key
curl -s localhost:3000/api/v1/customers -H "Authorization: Bearer $BB_KEY" \
  -H "Content-Type: application/json" -d '{ …customer with NIK… }'
```

- The API reference is at `/api/v1/openapi.json` (OpenAPI 3.1) and on the
  console's API docs page.
- The console at `/console` (sign in with the owner's web account) manages API
  keys and shows the tenant's audit log and API usage.
- Endpoints cover customers (NIK KYC), accounts, statements, sandbox deposits,
  transfers (an `Idempotency-Key` header is required) and the ledger.

## Checks

```bash
npm run lint && npm run typecheck
npm test             # needs Postgres; uses (and resets) bangkebank_test
npm run db:check-rls # every tenant table has forced row-level security
npm run build
```

## Container

```bash
docker build --target migrate -t bangkebank-migrate .
docker build -t bangkebank .
docker run --env-file .env bangkebank-migrate
docker run --env-file .env -p 3000:3000 bangkebank
```

## Docs

- [Phase 1 — Hardening](docs/phase-1-hardening.md): what was fixed and how it was verified.
- [Phase 2 — Ledger, Indonesia, audit](docs/phase-2-ledger.md): rupiah, double-entry ledger, KYC, audit log, tests and CI.
- [Phase 3 — Tenants and API keys](docs/phase-3-tenants.md): tenants, row-level security, API keys, partner API, console.
