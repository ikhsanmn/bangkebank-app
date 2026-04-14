#!/usr/bin/env node

import { ensureLocalPostgres, runCommand } from "./shared.mjs";

async function main() {
  await ensureLocalPostgres();
  await runCommand("npx", ["--no-install", "drizzle-kit", "studio"]);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
