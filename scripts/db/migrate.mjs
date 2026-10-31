#!/usr/bin/env node

import { ensureLocalPostgres, runCommand } from "./shared.mjs";

async function main() {
  await ensureLocalPostgres();
  await runCommand("npx", ["--no-install", "drizzle-kit", "migrate"]);
  await runCommand("node", ["scripts/db/encrypt-legacy-pii.mjs"]);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
