#!/bin/bash
set -euo pipefail

# =============================================================================
# Pyramid Backstage — VPS deploy. Run by GitHub Actions after images are pushed.
# Pulls GHCR images, migrates + seeds the DB, obtains/renews TLS, brings the
# stack up behind nginx, health-checks, and installs the cert-renewal cron.
# =============================================================================

APP_DIR="/opt/pyramid"
COMPOSE="docker compose -f $APP_DIR/docker-compose.prod.yml"
DOMAIN="pyramidsolvers.xyz"
CERT_PATH="$APP_DIR/certbot/conf/live/$DOMAIN/fullchain.pem"
SEED_MARKER="$APP_DIR/.seeded"

cd "$APP_DIR"

echo "=============================================="
echo "Deploying Pyramid Backstage — $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "=============================================="

if [ ! -f .env ]; then
    echo "ERROR: $APP_DIR/.env missing (CI writes it). Aborting."
    exit 1
fi
set -a; source .env; set +a

echo "[1/8] Pulling application images..."
$COMPOSE pull ops-core ai-orchestrator frontend

echo "[2/8] Starting backing services (db, nats, redis, chromadb)..."
$COMPOSE up -d db nats redis chromadb

echo "Waiting for Postgres..."
for i in {1..30}; do
    if $COMPOSE exec -T db pg_isready -U "${POSTGRES_USER:-pyramid}" -d "${POSTGRES_DB:-pyramid}" >/dev/null 2>&1; then
        echo "  Postgres ready."; break
    fi
    [ "$i" = 30 ] && { echo "ERROR: Postgres not ready"; $COMPOSE logs --tail=60 db; exit 1; }
    sleep 2
done

echo "Waiting for NATS..."
for i in {1..30}; do
    if $COMPOSE ps nats | grep -q "healthy"; then echo "  NATS ready."; break; fi
    [ "$i" = 30 ] && { echo "ERROR: NATS not healthy"; $COMPOSE logs --tail=60 nats; exit 1; }
    sleep 2
done

echo "[3/8] Running Prisma migrations..."
$COMPOSE run --rm ops-core sh -c "npx prisma migrate deploy" || {
    echo "ERROR: migration failed"; exit 1; }

# Reconcile the space catalog on EVERY deploy — NOT gated by the seed marker.
# Idempotent (upsert + prune of reservation-free, catalog-absent rows) and prod-safe
# (touches only Space rows, never users/events). This is what propagates catalog
# growth (new floors/halls) to an already-seeded prod; the one-time demo seed below
# is marker-gated and would otherwise skip every space added after the first deploy.
echo "[3b/8] Syncing space catalog (idempotent)..."
$COMPOSE run --rm ops-core sh -c "npm run db:seed:spaces" || {
    echo "  WARNING: space catalog sync failed — new spaces may be missing. Re-run:"
    echo "    cd $APP_DIR && $COMPOSE run --rm ops-core sh -c 'npm run db:seed:spaces'"; }

# Seed ONCE (first deploy). The seed refuses to create users under
# NODE_ENV=production, so this one-off overrides it; the live service stays prod.
if [ ! -f "$SEED_MARKER" ]; then
    echo "[4/8] Seeding demo data (first deploy)..."
    if $COMPOSE run --rm -e NODE_ENV=development ops-core sh -c "npm run db:seed"; then
        touch "$SEED_MARKER"
        echo "  Seed complete."
    else
        echo "  WARNING: seed failed — continuing. Re-run manually:"
        echo "    cd $APP_DIR && $COMPOSE run --rm -e NODE_ENV=development ops-core sh -c 'npm run db:seed' && touch $SEED_MARKER"
    fi
else
    echo "[4/8] Seed marker present — skipping seed."
fi

echo "[5/8] Starting app services (ops-core, ai-orchestrator)..."
$COMPOSE up -d ops-core ai-orchestrator

echo "Waiting for ops-core to become healthy..."
for i in {1..25}; do
    STATUS=$($COMPOSE ps ops-core --format "{{.Status}}" 2>/dev/null || echo unknown)
    echo "  ops-core: $STATUS ($i/25)"
    echo "$STATUS" | grep -qi "healthy" && ! echo "$STATUS" | grep -qi "unhealthy" && break
    if echo "$STATUS" | grep -qi "unhealthy\|exited\|dead"; then
        echo "ERROR: ops-core failed"; $COMPOSE logs --tail=100 ops-core; exit 1
    fi
    [ "$i" = 25 ] && { echo "WARNING: ops-core not healthy in time"; $COMPOSE logs --tail=80 ops-core; }
    sleep 4
done

echo "[6/8] Checking TLS certificate..."
chmod -R 755 "$APP_DIR/certbot/conf/live" "$APP_DIR/certbot/conf/archive" 2>/dev/null || true
if [ -f "$CERT_PATH" ]; then
    echo "  Certificate present."
else
    echo "  No certificate — requesting from Let's Encrypt (standalone)..."
    mkdir -p "$APP_DIR/certbot/conf" "$APP_DIR/certbot/www"
    : "${LETSENCRYPT_EMAIL:?LETSENCRYPT_EMAIL must be set in .env}"
    $COMPOSE stop nginx 2>/dev/null || true
    docker stop pyramid-nginx-prod 2>/dev/null || true
    if ! docker run --rm -p 80:80 \
        -v "$APP_DIR/certbot/conf:/etc/letsencrypt" \
        -v "$APP_DIR/certbot/www:/var/www/certbot" \
        certbot/certbot certonly --standalone \
        -d "$DOMAIN" -d "www.$DOMAIN" \
        --email "$LETSENCRYPT_EMAIL" --agree-tos --no-eff-email --non-interactive; then
        echo "ERROR: certificate request failed."
        echo "  Ensure A records for $DOMAIN and www.$DOMAIN point to $(hostname -I | awk '{print $1}')"
        echo "  and that ports 80/443 are open."
        exit 1
    fi
    chmod -R 755 "$APP_DIR/certbot/conf/live" "$APP_DIR/certbot/conf/archive" 2>/dev/null || true
    echo "  Certificate obtained."
fi

echo "[7/8] Starting frontend + nginx..."
$COMPOSE up -d
$COMPOSE exec -T nginx nginx -s reload 2>/dev/null && echo "  nginx reloaded." || echo "  nginx reload skipped (still starting)."

echo "[8/8] Health checks..."
sleep 5
OK=0
HTTP=$(curl -sf -o /dev/null -w "%{http_code}" "http://localhost/health" 2>/dev/null || echo 000)
[ "$HTTP" = "200" ] && echo "  nginx: healthy" || { echo "  nginx: UNHEALTHY ($HTTP)"; OK=1; $COMPOSE logs --tail=40 nginx; }
$COMPOSE exec -T ops-core node -e "require('http').get('http://localhost:4000/ready',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))" \
    && echo "  ops-core /ready: ok" || { echo "  ops-core /ready: UNHEALTHY"; OK=1; }

# Cert auto-renewal is handled by the `certbot-renewer` sidecar (see
# docker-compose.prod.yml) — a container-native 12h loop that renews + reloads
# nginx. No host cron dependency (minimal cloud images ship without it).

docker image prune -f >/dev/null 2>&1 || true

echo "----------------------------------------------"
$COMPOSE ps
if [ "$OK" -ne 0 ]; then
    echo "DEPLOY FINISHED WITH ERRORS"; exit 1
fi
echo "Deploy complete — https://$DOMAIN"
echo "----------------------------------------------"
