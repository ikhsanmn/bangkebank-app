# Security

BangkeBank is a portfolio demo, not a bank. Balances are sandbox values and no
real money moves. Don't run it with real customer data, and never enter a real
NIK.

## Reporting a vulnerability

Please report privately through
[GitHub private vulnerability reporting](https://github.com/ikhsanmn/bangkebank-app/security/advisories/new)
instead of opening a public issue.

## Secrets

Credentials and keys in this repository are local or CI placeholders:

- `.env.example` and `tests/` use the local `bangkebank` database login.
- `.github/workflows/ci.yml` and the `Dockerfile` build stage use throwaway
  values, including all-zero `PII_ENCRYPTION_KEY` and `API_KEY_PEPPER`.

Any real deployment must generate its own values with `openssl rand -base64 32`.
