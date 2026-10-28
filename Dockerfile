# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
COPY . .
# lib/env.ts validates on import and `next build` imports the route modules,
# so the build needs placeholder values. They stay in this stage; the runner
# reads the real ones at startup. Only NEXT_PUBLIC_* would be inlined.
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT=standalone \
    DATABASE_URL=postgres://build:build@localhost:5432/build \
    BETTER_AUTH_SECRET=build-time-placeholder-never-used-at-runtime \
    BETTER_AUTH_URL=http://localhost:3000 \
    PII_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
RUN npm run build

# One-shot migration job: docker build --target migrate -t bangkebank-migrate .
FROM deps AS migrate
COPY drizzle ./drizzle
COPY drizzle.config.ts ./
COPY scripts/db ./scripts/db
CMD ["sh", "-c", "npx --no-install drizzle-kit migrate && node scripts/db/encrypt-legacy-pii.mjs"]

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
