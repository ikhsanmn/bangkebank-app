const PLACEHOLDER_SECRET = "replace-with-a-long-random-secret";
const MIN_SECRET_LENGTH = 32;

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function requireAuthSecret() {
  const value = requireEnv("BETTER_AUTH_SECRET");

  if (value === PLACEHOLDER_SECRET || value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `BETTER_AUTH_SECRET must be a random value of at least ${MIN_SECRET_LENGTH} characters ` +
        "(generate one with: openssl rand -base64 32)."
    );
  }

  return value;
}

export const env = {
  DATABASE_URL: requireEnv("DATABASE_URL"),
  // "true" turns on TLS with certificate verification for the database connection.
  DATABASE_SSL: process.env.DATABASE_SSL === "true",
  BETTER_AUTH_SECRET: requireAuthSecret(),
  BETTER_AUTH_URL: requireEnv("BETTER_AUTH_URL"),
  NODE_ENV: process.env.NODE_ENV ?? "development"
};
