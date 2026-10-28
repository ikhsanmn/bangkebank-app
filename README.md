# BangkeBank

A **portfolio demo** of banking-as-a-service for Indonesian fintechs, built with
Next.js 14, Drizzle ORM, Postgres and better-auth.

> BangkeBank is not a bank. Balances are sandbox values and no real money moves.

## Run locally

Requires Node 20+ and Docker.

```bash
npm install
cp .env.example .env
# put the output of `openssl rand -base64 32` in BETTER_AUTH_SECRET
npm run db:start     # Postgres 16 on 127.0.0.1:55432
npm run db:migrate
npm run dev          # http://localhost:3000
```

Sign up with made-up details; the account comes with sandbox balances.

## Docs

- [Phase 1 — Hardening](docs/phase-1-hardening.md): what was fixed and how it was verified.
