#!/usr/bin/env bash
# SessionStart helper for Claude Code on the web — makes ops-core test-ready.
#
# Deliberately a NO-OP unless this looks like the cold remote sandbox: PG16
# binaries present but nothing listening on :5432. That way it never disturbs a
# developer's own Postgres or Docker stack on a laptop. Always exits 0.
set -uo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"   # repo root

[ -x "$PGBIN/initdb" ] || { echo "[web-setup] no local PG16 binaries — skipping"; exit 0; }
if "$PGBIN/pg_isready" -h localhost -p 5432 >/dev/null 2>&1; then
  echo "[web-setup] Postgres already up on :5432 — leaving it alone"; exit 0
fi

echo "[web-setup] cold sandbox detected — provisioning ops-core test environment"
cd "$ROOT/ops-core" || exit 0
[ -d node_modules ] || npm ci
npx prisma generate >/dev/null 2>&1 || true
bash "$ROOT/ops-core/scripts/test-db.sh" --clones || true
echo "[web-setup] done"
exit 0
