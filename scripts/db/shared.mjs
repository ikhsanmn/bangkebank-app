import "dotenv/config";

import net from "node:net";
import { spawn } from "node:child_process";

function exitCodeFromSignal(signal) {
  return typeof signal === "number" ? signal : 1;
}

export function getDatabaseConfig() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL in the environment.");
  }

  const url = new URL(databaseUrl);
  const port = Number(url.port || "5432");

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid database port in DATABASE_URL: ${url.port}`);
  }

  return {
    databaseUrl,
    host: url.hostname,
    port,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\/+/, "")
  };
}

export function isLocalDatabase(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function getComposeEnv() {
  const config = getDatabaseConfig();

  if (!isLocalDatabase(config.host)) {
    throw new Error(
      `Local Postgres helper only supports localhost URLs, received '${config.host}'.`
    );
  }

  if (!config.user || !config.password || !config.database) {
    throw new Error(
      "DATABASE_URL must include a username, password, and database name for local Docker setup."
    );
  }

  return {
    ...process.env,
    POSTGRES_USER: config.user,
    POSTGRES_PASSWORD: config.password,
    POSTGRES_DB: config.database,
    POSTGRES_PORT: String(config.port)
  };
}

export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      ...options
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} failed with code ${
            code === null ? exitCodeFromSignal(signal) : code
          }.`
        )
      );
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function waitForTcpConnection(host, port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastErrorCode = "UNKNOWN";

  while (Date.now() < deadline) {
    const result = await new Promise((resolve) => {
      const socket = net.createConnection({ host, port });

      socket.setTimeout(1500);
      socket.once("connect", () => {
        socket.end();
        resolve({ ok: true });
      });
      socket.once("timeout", () => {
        socket.destroy();
        resolve({ ok: false, errorCode: "TIMEOUT" });
      });
      socket.once("error", (error) => {
        resolve({
          ok: false,
          errorCode:
            typeof error.code === "string" && error.code.length > 0
              ? error.code
              : error.message
        });
      });
    });

    if (result.ok) {
      return;
    }

    lastErrorCode = result.errorCode;
    await sleep(1000);
  }

  throw new Error(
    `Timed out waiting for Postgres on ${host}:${port}. Last error: ${lastErrorCode}.`
  );
}

export async function ensureLocalPostgres() {
  const config = getDatabaseConfig();

  if (!isLocalDatabase(config.host)) {
    return config;
  }

  await runCommand("docker", ["compose", "up", "-d", "postgres"], {
    env: getComposeEnv()
  });
  await waitForTcpConnection(config.host, config.port);

  return config;
}
