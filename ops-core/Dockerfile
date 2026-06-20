# ─────────────────────────────────────────────────────────────────────────────
# ops-core — PRODUCTION image (multi-stage).
#
# Build context is the REPO ROOT (not ops-core/), because the demo seed reads the
# shared space catalog at docs/03-data/spaces.catalog.json and bakes it to /docs.
#   docker build -f ops-core/Dockerfile -t ops-core .
#
# The runner stage keeps the FULL node_modules (not just prod deps) on purpose:
# `prisma` (migrate deploy) and `tsx` (db:seed) are needed at deploy time by
# scripts/deploy.sh. Image size is a non-issue on the 160GB VPS; reliability wins.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

# Prisma needs openssl.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Prisma 7's config resolves DATABASE_URL eagerly at `generate`/`tsc` time. No DB
# is contacted during the build — the real URL is injected at deploy (migrate).
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"

COPY ops-core/package.json ops-core/package-lock.json ./
RUN npm ci

COPY ops-core/prisma ./prisma
RUN npx prisma generate

COPY ops-core/ ./
RUN npm run build

# ── Runner ───────────────────────────────────────────────────────────────────
FROM node:20-slim AS runner

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production \
    PORT=4000

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
# Prisma 7 reads the datasource URL from prisma.config.ts at migrate/runtime — the
# schema only declares the provider. Without this, `migrate deploy` has no URL.
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

# The seed (tsx src/scripts/seed.ts) reads the catalog at /docs/03-data/...
COPY docs/03-data/spaces.catalog.json /docs/03-data/spaces.catalog.json

EXPOSE 4000
CMD ["node", "dist/index.js"]
