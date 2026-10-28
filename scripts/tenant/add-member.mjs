#!/usr/bin/env node

// Gives an existing web-app user a role in a tenant's console (or changes it).
//
//   npm run tenant:add-member -- --slug acme-pay --email teammate@example.com --role admin|viewer|owner

import "dotenv/config";

import { addMember, parseArgs, TenantAdminError, withClient } from "./lib.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await withClient((client) =>
    addMember(client, { slug: args.slug, email: args.email, role: args.role })
  );
  console.log(`${args.email} is now ${result.role} of ${args.slug}.`);
}

main().catch((error) => {
  console.error(error instanceof TenantAdminError ? error.message : error);
  process.exit(1);
});
