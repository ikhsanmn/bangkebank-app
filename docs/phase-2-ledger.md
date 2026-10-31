# Phase 2 — Ledger, Indonesia, audit

Phase 2 turns the sandbox into something shaped like a real core ledger for an
Indonesian banking-as-a-service demo: money is whole rupiah, every balance is
derived from double-entry postings, identity data is Indonesian and encrypted,
and every money movement leaves an audit trail. Tenants and API keys for
fintech clients are Phase 3.

## Money: whole rupiah

- All amounts are `bigint` whole rupiah (`IDR`); no floats, no decimals.
  Indonesian payment rails and PSPs settle in whole rupiah.
- The API takes `amount` as a JSON integer; strings like `"1.500"` are rejected
  so a thousands separator can never be misread as a decimal point.
- A single transfer is capped at Rp 250.000.000, mirroring the BI-FAST limit.
- The UI shows `Rp 1.500.000` (id-ID) and dates in Asia/Jakarta time; the
  dashboard's 7-day flow buckets by Jakarta calendar day.

## Double-entry ledger

| Table | Role |
|---|---|
| `ledgerEntry` | One journal entry: kind (`sandbox_funding`, `transfer`, `external_payment`, `external_receipt`), description, time |
| `ledgerPosting` | Signed amount against exactly one customer `bankAccount` or one system account (`SANDBOX_FUNDING`, `EXTERNAL_CLEARING`) |
| `bankTransaction` | Customer-facing statement line, linked to its entry |

Sandbox money is explicit: opening deposits come out of `SANDBOX_FUNDING`, and
seeded card and BI-FAST activity settles against `EXTERNAL_CLEARING`, so the
system accounts always hold the exact negative of what was created or spent.

### What the database guarantees (`drizzle/0003_ledger_guards.sql`)

These hold even if application code is wrong or someone writes SQL by hand:

- **Balances move only through postings.** A trigger applies each posting to
  its account. Direct `UPDATE`s of a balance, and accounts opened with a
  non-zero balance, are refused.
- **Entries balance.** A deferred constraint trigger refuses to commit any
  entry whose postings don't sum to zero, or that has fewer than two postings.
- **No overdraft.** A posting that would take an account below zero trips the
  `bank_account_available_non_negative` check.
- **Append-only history.** `ledgerEntry`, `ledgerPosting` and `auditEvent`
  reject `UPDATE`, `DELETE` and `TRUNCATE`.
- **Transfer state machine.** Transfers are inserted `pending` (or `failed`),
  and may only move `pending → settled | failed`. `settled` requires a ledger
  entry, and a ledger entry requires `settled`.

## Transfers

1. Idempotency pre-check (unchanged from Phase 1).
2. Validate receiver: unknown ID → 404, same account or wrong email → 422.
3. Lock both accounts in id order, check funds under the lock.
4. Insert the transfer `pending`, post the entry, write both statement lines,
   mark it `settled`, record `transfer.settled` — one database transaction.
5. Insufficient funds: the attempt is kept as a `failed` transfer with a reason
   and audited as `transfer.failed`; the API returns 422 with the transfer.
   Replaying its idempotency key returns the same failure. Recipients never
   see failed attempts.

## Indonesian identity (KYC)

- Sign-up asks for a 16-digit **NIK**, province (all 38), 5-digit postal code
  and date of birth. The SSN field is gone.
- The server (`lib/kyc.ts`, run in better-auth's `user.create.before` hook)
  checks the NIK structure: known province code, birth-date digits matching
  the date of birth (day + 40 for women), non-zero serial; and age ≥ 17.
- **NIK, date of birth and street address are encrypted** with AES-256-GCM
  (`lib/server/pii.ts`, key `PII_ENCRYPTION_KEY`, versioned `v1.` format).
  Only `nikLast4` is stored in clear; it is derived server-side and a
  client-supplied value is ignored.
- Identity fields are hidden from session responses and cannot be changed
  after sign-up (`user.update.before` rejects them).

## Audit log

`auditEvent` records actor, action, outcome, entity, IP and user agent, and a
JSON metadata blob. Recorded today: `user.signed_up`, `session.created`,
`bank_account.created`, `transfer.settled`, `transfer.failed`,
`transfer.rejected`. Success events commit in the same transaction as the
change they describe. The IP comes from `X-Forwarded-For` and is for
investigation only, never authorization.

## Migration from Phase 1 data

`0002_phase2_ledger.sql` upgrades an existing database in place:

- Balances and amounts become whole rupiah. **Old USD figures are rounded, not
  converted** — this is sandbox data. Reset the database for clean IDR seeds.
- Each settled legacy transfer gets a ledger entry, and each account gets a
  `sandbox_funding` opening entry for the remainder, so every balance
  reconciles before the guards switch on.
- `state` is renamed to `province`; the SSN column is dropped.
- `npm run db:migrate` then runs `scripts/db/encrypt-legacy-pii.mjs`, which
  encrypts plaintext DOB and address left by earlier sign-ups (idempotent).

## Tests, CI, container

- `npm test` runs Vitest against a real Postgres (`TEST_DATABASE_URL`, default
  `localhost:55432/bangkebank_test`; the setup drops and re-migrates it).
  31 tests: ledger reconciliation, concurrent transfers (including 40
  racing in both directions), idempotency races, every database guard, NIK
  rules, encryption.
- `.github/workflows/ci.yml`: lint, typecheck, schema-vs-migration drift,
  migrations on an empty database, tests, build, and Docker image builds.
- `Dockerfile`: standalone Next.js server as a non-root user with a health
  check, plus a `migrate` target for one-shot migrations.

## Verification

- `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` (31/31).
- The concurrency tests caught a deadlock: recording a failed transfer took
  foreign-key locks in constraint order while settling transfers locked in id
  order. All two-account transactions now lock in id order (`lockAccounts`).
  With the fix removed, the bidirectional race test deadlocks 5 runs out of 5;
  with it, 0 out of 10.
- Upgrade path: Phase 1 migrations + Phase-1-shaped data, then 0002/0003 —
  balances reconcile, settled transfer gets its entry, direct edits refused.
- End-to-end against the production build, 32/32: sign-up NIK validation and
  encryption, locked identity fields, audit context, rupiah API contract,
  failed-transfer replay, recipient visibility, whole-database reconciliation,
  every page rendering in rupiah.
- The standalone server bundle serves health, pages and static assets.
  The Docker image itself was **not** built locally (no Docker access); CI
  builds it.

## Known limits

- better-auth's rate limiter keys on `X-Forwarded-For`; run behind a proxy
  that overwrites it, or clients can rotate the header to dodge limits.
- No holds yet: `availableBalance` always equals `currentBalance`.
- Legacy `pending` transfers from before Phase 2 stay pending.
- Email verification, MFA, key rotation tooling, and `PRD_banking.md`
  (still describes the original US design) are open.
