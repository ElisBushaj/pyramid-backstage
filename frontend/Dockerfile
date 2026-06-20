# ─────────────────────────────────────────────────────────────────────────────
# frontend — PRODUCTION image. Build the Vite SPA, then serve the static `dist/`
# with a tiny nginx (port 8080). The edge nginx (infrastructure/nginx) terminates
# TLS and routes /api + /ai; this image only serves the built SPA with a history
# fallback.
#
# VITE_OPS_CORE_URL / VITE_AI_URL are baked at BUILD time (Vite inlines env). They
# default to same-origin paths so the SPA calls /api/v1 and /ai through the edge
# nginx — no CORS, no hardcoded host.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

ARG VITE_OPS_CORE_URL=/api/v1
ARG VITE_AI_URL=/ai
ENV VITE_OPS_CORE_URL=$VITE_OPS_CORE_URL \
    VITE_AI_URL=$VITE_AI_URL

RUN pnpm build

# ── Runner — static nginx ────────────────────────────────────────────────────
FROM nginx:1.29-alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.spa.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
