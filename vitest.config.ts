import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Integration tests run against a real Postgres: TEST_DATABASE_URL names a
// throwaway database that tests/global-setup.ts drops, recreates and migrates.
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://bangkebank:bangkebank@localhost:55432/bangkebank_test";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) }
  },
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    setupFiles: ["tests/setup.ts"],
    // One shared database; files run one after another.
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      TEST_DATABASE_URL: testDatabaseUrl,
      DATABASE_URL: testDatabaseUrl,
      DATABASE_SSL: "false",
      BETTER_AUTH_SECRET: "test-only-secret-0123456789abcdefghijklmnop",
      BETTER_AUTH_URL: "http://localhost:3000",
      PII_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      API_KEY_PEPPER: Buffer.alloc(32, 3).toString("base64")
    }
  }
});
