import { afterAll } from "vitest";

import { authPool, pool } from "@/lib/db";

import { adminPool } from "./admin-db";

afterAll(async () => {
  await Promise.all([pool.end(), authPool.end(), adminPool.end()]);
});
