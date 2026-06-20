#!/usr/bin/env bash
# Idempotent local Postgres provisioning for the ops-core test suite.
#
# Docker isn't available in the web/remote sandbox, but the Postgres 16 binaries are.
# This brings up a throwaway cluster on localhost:5432 with trust auth, a `pyramid`
# superuser, and the migrated `pyramid_test` database — matching DATABASE_URL in
# vitest.setup.ts. It also (re)creates the per-service clone DBs used to run the
# suite in parallel (one DB per agent/worker so their TRUNCATE resets don't collide).
#
# Usage:  bash ops-core/scripts/test-db.sh            # ensure DB up + migrated
#         bash ops-core/scripts/test-db.sh --clones   # also (re)create per-service clones
#
# Safe to re-run: every step checks before acting.
set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGDATA="${PGDATA:-/var/lib/postgresql/testdata}"
PGPORT="${PGPORT:-5432}"
DB_NAME="${DB_NAME:-pyramid_test}"
DB_USER="${DB_USER:-pyramid}"
DB_PASS="${DB_PASS:-pyramid}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"  # ops-core/

aspg() { sudo -u postgres "$@"; }

echo "==> ensuring cluster at $PGDATA"
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  install -d -o postgres -g postgres -m 700 "$PGDATA"
  aspg "$PGBIN/initdb" -D "$PGDATA" -U postgres \
    --auth-host=trust --auth-local=trust --encoding=UTF8 --locale=C >/tmp/initdb.log 2>&1
fi

if ! "$PGBIN/pg_isready" -h localhost -p "$PGPORT" >/dev/null 2>&1; then
  echo "==> starting cluster on :$PGPORT"
  aspg "$PGBIN/pg_ctl" -D "$PGDATA" \
    -o "-p $PGPORT -c timezone=UTC -c log_timezone=UTC -c listen_addresses=localhost" \
    -l "$PGDATA/server.log" -w -t 60 start
fi
"$PGBIN/pg_isready" -h localhost -p "$PGPORT"

echo "==> ensuring role $DB_USER + database $DB_NAME"
aspg "$PGBIN/psql" -p "$PGPORT" -v ON_ERROR_STOP=1 -c \
  "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='$DB_USER') THEN CREATE ROLE $DB_USER LOGIN SUPERUSER PASSWORD '$DB_PASS'; END IF; END \$\$;"
aspg "$PGBIN/psql" -p "$PGPORT" -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 \
  || aspg "$PGBIN/createdb" -p "$PGPORT" -O "$DB_USER" "$DB_NAME"

echo "==> applying migrations (prisma migrate deploy)"
( cd "$HERE" && DATABASE_URL="postgresql://$DB_USER:$DB_PASS@localhost:$PGPORT/$DB_NAME" npx prisma migrate deploy >/dev/null )

if [ "${1:-}" = "--clones" ]; then
  echo "==> (re)creating per-service clone DBs"
  for svc in auth spaces assets requests engine reservations quotes tasks approvals audit usersdash foundation; do
    db="${DB_NAME}_${svc}"
    aspg "$PGBIN/psql" -p "$PGPORT" -tAc "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$db'" >/dev/null 2>&1 || true
    aspg "$PGBIN/dropdb" -p "$PGPORT" --if-exists "$db"
    aspg "$PGBIN/createdb" -p "$PGPORT" -T "$DB_NAME" -O "$DB_USER" "$db"
    echo "    $db"
  done
fi

echo "==> ready: postgresql://$DB_USER:$DB_PASS@localhost:$PGPORT/$DB_NAME"
