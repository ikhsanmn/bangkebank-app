#!/usr/bin/env node

// Fails (exit 1) if any table with a "tenantId" column lacks forced row-level
// security with at least one policy, unless it is on the allowlist below. Run
// in CI after migrating an empty database, so a new tenant table can't ship
// without isolation.

import "dotenv/config";

import pg from "pg";

// Read before a tenant is known; always queried with explicit tenant filters.
// See docs/phase-3-tenants.md before adding to this list.
const EXEMPT = new Set(["apiKey", "tenantMember"]);

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : false
});
await client.connect();
try {
  const { rows } = await client.query(`
    select c.relname as table,
           c.relrowsecurity as enabled,
           c.relforcerowsecurity as forced,
           (select count(*) from pg_policy p where p.polrelid = c.oid)::int as policies
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
     where c.relkind = 'r'
       and exists (select 1 from pg_attribute a
                    where a.attrelid = c.oid and a.attname = 'tenantId' and not a.attisdropped)
     order by 1
  `);
  const failures = rows.filter(
    (row) => !EXEMPT.has(row.table) && !(row.enabled && row.forced && row.policies > 0)
  );
  for (const row of rows) {
    const status = EXEMPT.has(row.table)
      ? "exempt"
      : `rls=${row.enabled} force=${row.forced} policies=${row.policies}`;
    console.log(`${failures.includes(row) ? "FAIL" : "ok  "}  ${row.table}  ${status}`);
  }
  if (rows.length === 0 || failures.length > 0) {
    console.error(
      rows.length === 0
        ? "No tenant tables found; did the migrations run?"
        : `${failures.length} tenant table(s) without forced row-level security.`
    );
    process.exitCode = 1;
  }
} finally {
  await client.end();
}
