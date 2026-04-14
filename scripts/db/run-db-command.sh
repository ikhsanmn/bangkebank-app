#!/usr/bin/env bash

set -euo pipefail

command_name="${1:-}"

if [[ -z "$command_name" ]]; then
  echo "Missing db command name." >&2
  exit 1
fi

if [[ "${EUID}" -eq 0 ]] && [[ -n "${SUDO_USER:-}" ]]; then
  echo "Do not run 'npm run db:${command_name}' with sudo." >&2
  echo "Your normal shell uses nvm Node, but sudo switches to the system Node, which is too old for drizzle-kit." >&2
  echo "Run it without sudo:" >&2
  echo "  npm run db:${command_name}" >&2
  echo >&2
  echo "If Docker needs elevated access, start Postgres separately with:" >&2
  echo "  sudo docker compose up -d postgres" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed or not available on PATH." >&2
  exit 1
fi

node_version="$(node -p 'process.versions.node')"
node_major="${node_version%%.*}"

if [[ "${node_major}" -lt 18 ]]; then
  echo "Node.js 18 or newer is required, but the current shell is using Node ${node_version}." >&2
  echo "This usually means your shell is not using nvm, or npm is coming from the system installation." >&2
  echo "Run:" >&2
  echo "  nvm use" >&2
  echo "  node -v" >&2
  echo "  npm run db:${command_name}" >&2
  echo >&2
  echo "Current node path: $(command -v node)" >&2
  exit 1
fi

case "${command_name}" in
  start)
    exec node scripts/db/local-postgres.mjs up
    ;;
  stop)
    exec node scripts/db/local-postgres.mjs down
    ;;
  migrate)
    exec node scripts/db/migrate.mjs
    ;;
  studio)
    exec node scripts/db/studio.mjs
    ;;
  *)
    echo "Unsupported db command '${command_name}'." >&2
    exit 1
    ;;
esac
