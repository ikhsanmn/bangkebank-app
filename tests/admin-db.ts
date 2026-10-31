import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import { schema } from "@/lib/db/schema";

// An observer connection for assertions. It never switches to the app role, so
// (as the test superuser) it sees every tenant's rows. Only the code under
// test goes through lib/db and row-level security.
export const adminPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
export const adminDb = drizzle(adminPool, { schema });
