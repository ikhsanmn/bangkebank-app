import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

// Drops and recreates the test database, then applies every migration, so each
// run starts from exactly what `npm run db:migrate` produces.
export default async function setup() {
  const url = new URL(
    process.env.TEST_DATABASE_URL ??
      "postgres://bangkebank:bangkebank@localhost:55432/bangkebank_test"
  );
  const name = url.pathname.slice(1);
  if (!/^[a-z0-9_]*test[a-z0-9_]*$/.test(name)) {
    throw new Error(`Refusing to reset "${name}": the test database name must contain "test".`);
  }

  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  await admin.query(`drop database if exists "${name}" with (force)`);
  await admin.query(`create database "${name}"`);
  await admin.end();

  const pool = new pg.Pool({ connectionString: url.toString() });
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  await pool.end();
}
