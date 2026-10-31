#!/usr/bin/env node

// Creates a fintech tenant, makes an existing web-app user its owner, and
// prints its first API key (shown once).
//
//   npm run tenant:create -- --slug acme-pay --name "Acme Pay" --owner you@example.com [--scopes a,b]

import "dotenv/config";

import { API_SCOPES, createTenant, parseArgs, TenantAdminError, withClient } from "./lib.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pepper = process.env.API_KEY_PEPPER;
  if (!pepper || Buffer.from(pepper, "base64").length !== 32) {
    throw new TenantAdminError("API_KEY_PEPPER must be set to the same value the app uses.");
  }
  const scopes = args.scopes ? args.scopes.split(",").map((scope) => scope.trim()) : API_SCOPES;
  const result = await withClient((client) =>
    createTenant(client, { slug: args.slug, name: args.name, ownerEmail: args.owner, scopes, pepper })
  );

  console.log(`Created tenant ${result.slug} (${result.tenantId}); ${args.owner} is its owner.`);
  console.log(`Console: ${process.env.BETTER_AUTH_URL ?? ""}/console/${result.slug}/keys`);
  console.log(`\nInitial API key (scopes: ${result.scopes.join(", ")}). Store it now; it is not shown again:\n`);
  console.log(`  ${result.token}\n`);
}

main().catch((error) => {
  console.error(error instanceof TenantAdminError ? error.message : error);
  process.exit(1);
});
