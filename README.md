# BangkeBank

A **portfolio demo** of banking-as-a-service for Indonesian fintechs, built with
Next.js 14, Drizzle ORM, Postgres and better-auth. Money is whole rupiah on a
double-entry ledger enforced by the database; identity data (NIK) is encrypted.

> BangkeBank is not a bank. Balances are sandbox values and no real money moves.

## Run locally

Requires Node 20+ and Docker.

```bash
npm install
cp .env.example .env
# put separate outputs of `openssl rand -base64 32` in
# BETTER_AUTH_SECRET and PII_ENCRYPTION_KEY
npm run db:start     # Postgres 16 on 127.0.0.1:55432
npm run db:migrate
npm run dev          # http://localhost:3000
```

Sign up with made-up details, never a real NIK. A valid-looking example for a
woman born 17 Aug 1990 in Bangka Belitung: `1971015708900001`. The account
comes with sandbox balances.

## Checks

```bash
npm run lint && npm run typecheck
npm test             # needs Postgres; uses (and resets) bangkebank_test
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
