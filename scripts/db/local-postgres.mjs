#!/usr/bin/env node

import { getComposeEnv, runCommand } from "./shared.mjs";

async function main() {
  const action = process.argv[2] ?? "up";

  if (action === "up") {
    await runCommand("docker", ["compose", "up", "-d", "postgres"], {
      env: getComposeEnv()
    });
    return;
  }

  if (action === "down") {
    await runCommand("docker", ["compose", "down"], {
      env: getComposeEnv()
    });
    return;
  }

  throw new Error(`Unsupported action '${action}'. Use 'up' or 'down'.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
