# Phase 1 — Hardening

BangkeBank is a **portfolio demo** of banking-as-a-service for Indonesian fintechs.
It is not a bank, and no real money moves. Phase 1 made the existing app correct
and safe enough to show: the money path no longer loses or creates money, and the
obvious security gaps are closed.

## Bugs fixed

### Money path (`lib/server/banking.ts`)

| Bug in the original code | Effect | Fix |
|---|---|---|
| Balance read in JS, then written back | Two concurrent transfers could both pass the balance check (double-spend) | Both account rows are locked `FOR UPDATE` in id order; the debit is one conditional `UPDATE ... WHERE availableBalance >= amount` |
| Unknown receiver account id | Sender debited, nobody credited — money vanished | Receiver looked up first; unknown → 404, no debit |
| Sender = receiver | Debit and credit on the same row, plus a credit row — money created | Rejected with 422 |
| Receiver email never checked | Typo'd or wrong recipient still received money | Email must match the receiver account's owner (case-insensitive), else 422 |
| Arithmetic on JS floats | Rounding drift on cents | Arithmetic runs in SQL; amounts limited to 2 decimals |
| `POST /api/banks` accepted client-set balances | Any user could mint money | Balances are not accepted; new accounts open at 0 |
| No retry safety | A retried request sent twice | Optional `Idempotency-Key` header, unique per sender; a replay returns the original transfer with 200 |

The database enforces the same rules as a backstop (`drizzle/0001_phase1_hardening.sql`):
non-negative balances, positive amounts, valid direction, and `ON DELETE restrict`
on financial foreign keys so history can't be cascaded away.

### Pre-existing breakage

- **Sign-up always returned 500.** The better-auth Drizzle adapter looked for a
  `user` model but the schema exported `users`. Fixed by passing an explicit
  singular-key schema in `lib/auth.ts`.
- **`next build` failed** with a type error under `typedRoutes`. Fixed.
- **Schema was created at runtime** by `lib/db/bootstrap.ts` on every request,
  diverging from the Drizzle migrations. Removed; migrations are the only path.

### Security

- Next.js 14.2.26 → 14.2.35 (patches the middleware-authorization bypass advisory).
- `middleware.ts`: state-changing `/api/*` requests must come from the app's own
  Origin (CSRF); signed-out page requests redirect to `/sign-in`.
- Security headers in `next.config.mjs`: CSP, HSTS, X-Frame-Options, nosniff,
  Referrer-Policy, Permissions-Policy; `X-Powered-By` removed.
- better-auth: sign-in 5/min and sign-up 3/min rate limits, 12-character minimum
  password, 12-hour sessions, secure cookies in production, trusted origins.
- `lib/env.ts` refuses the placeholder `BETTER_AUTH_SECRET` or any secret under 32 chars.
- Database TLS is opt-in (`DATABASE_SSL=true`) and verifies the certificate.
- Postgres in `docker-compose.yml` binds to 127.0.0.1 only.
- `/api/me` no longer returns date of birth, address or ID digits.
- Pagination is clamped (page ≤ 10000, pageSize ≤ 100); malformed JSON → 400;
  another user's account id → 404 (no existence leak).
- Unexpected errors return a generic 500 and are logged server-side.

### UI

- `lib/mock-data.ts` deleted: every screen reads real data with empty states.
  The dashboard's category breakdown and 7-day net flow are computed in SQL.
- Transfer flow: details → review → receipt, nothing prefilled, one idempotency
  key per review, field-level errors with `role="alert"`.
- Transaction history: the account filter and pagination work.
- A "Portfolio demo · Sandbox balances only" banner on every page.
- Accessibility: nav landmarks, `aria-current`, screen-reader text, `autoComplete`.

## Verification

Run against a real Postgres 16 with the production build:

- `tsc --noEmit`, `next lint`, `next build` clean.
- End-to-end checks, 23/23 passing, including: 10 concurrent half-balance transfers
  → exactly 2 succeed and the balance ends at exactly 0; two concurrent requests
  with the same idempotency key → one transfer; unknown receiver → 404 with no
  debit; cross-origin POST → 403; sign-in rate limit → 429 after 5 attempts.

## Not in Phase 1

Email verification (needs an email provider), MFA, integer minor units and a
double-entry ledger, and the Indonesia reframe (IDR, NIK) — see Phase 2.
