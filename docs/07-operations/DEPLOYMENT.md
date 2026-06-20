# Deployment — pyramidsolvers.xyz (Hetzner + GitHub Actions)

Push to `main` → GitHub Actions builds three images (ops-core, ai-orchestrator,
frontend), pushes them to GHCR, SCPs the infra files to the VPS, and runs
`deploy.sh` which migrates, seeds (once), obtains TLS, and brings the stack up
behind nginx. After the one-time setup below, **every deploy is just `git push`.**

```
Browser ──HTTPS──> nginx (edge, :443) ┬─ /api/  → ops-core:4000  (Express + Prisma + Postgres + NATS + Redis)
                                       ├─ /ai/   → ai-orchestrator:8000 (FastAPI + Claude + ChromaDB)
                                       └─ /      → frontend:8080 (static Vite SPA)
```

Everything is same-origin, so the SPA calls `/api/v1` and `/ai` with no CORS.

---

## What I need from you (one-time)

| # | Thing | Where it goes |
|---|-------|---------------|
| 1 | A **Hetzner Cloud** account | create the server (below) |
| 2 | The **GoDaddy** domain `pyramidsolvers.xyz` (you're buying it) | DNS A-records (below) |
| 3 | A **rotated** `ANTHROPIC_API_KEY` | GitHub secret `ANTHROPIC_API_KEY` |
| 4 | An **SSH key pair** for the deploy user | public → VPS, private → GitHub secret |

Rotate the Anthropic key first: console.anthropic.com → API keys → revoke the old
one (it sat in the repo's dev `.env`) → create a new one for production.

---

## Step 1 — Create the Hetzner server

Hetzner Cloud Console → **Add Server**:

| Field | Value |
|-------|-------|
| Location | **Nuremberg** or **Falkenstein** (EU; lowest latency to Albania) |
| Image | **Ubuntu 24.04** |
| Type | **Shared vCPU → CPX32** (4 vCPU AMD, 8 GB RAM, 160 GB NVMe, ~€14/mo) |
| Networking | IPv4 + IPv6 **on** |
| SSH key | paste your **public** key (so you can log in as `root`) |
| Firewall | skip (the setup script configures `ufw`) |
| Name | `pyramid-prod` |

Note the server's **public IPv4** — call it `<VPS_IP>`.

> Generate the deploy key if you don't have one:
> `ssh-keygen -t ed25519 -C "pyramid-deploy" -f ~/.ssh/pyramid_deploy`
> → `~/.ssh/pyramid_deploy` (private, for GitHub) and `.pub` (public, for the VPS).

## Step 2 — Point the domain at the server (GoDaddy)

GoDaddy → `pyramidsolvers.xyz` → **DNS → Manage Zones**. Create/replace:

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `@` | `<VPS_IP>` | 600 |
| A | `www` | `<VPS_IP>` | 600 |

Delete any GoDaddy "parked"/forwarding A or CNAME records on `@`/`www` first.
Verify (wait a few minutes for propagation):
`dig +short pyramidsolvers.xyz` → should print `<VPS_IP>`.

TLS won't issue until this resolves, so do it before the first deploy.

## Step 3 — Bootstrap the VPS (one-time)

```bash
ssh root@<VPS_IP>
# copy the setup script up (from your laptop, in the repo):
#   scp infrastructure/scripts/setup-vps.sh root@<VPS_IP>:/root/
bash /root/setup-vps.sh
# Add the deploy user's PUBLIC key:
echo 'ssh-ed25519 AAAA...your pyramid_deploy.pub...' >> /home/deploy/.ssh/authorized_keys
systemctl restart ssh
# Verify from your laptop:
ssh -i ~/.ssh/pyramid_deploy deploy@<VPS_IP> 'docker --version'
```

The script installs Docker, creates the `deploy` user, opens ports 22/80/443,
and hardens SSH (root login + passwords disabled) + fail2ban.

## Step 4 — GitHub repository secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|--------|-------|
| `VPS_HOST` | `<VPS_IP>` |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | the **private** key (`~/.ssh/pyramid_deploy`, full contents) |
| `DB_PASSWORD` | `openssl rand -hex 24` |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `OPS_CORE_SERVICE_TOKEN` | `openssl rand -hex 32` |
| `ANTHROPIC_API_KEY` | the **rotated** key |
| `LETSENCRYPT_EMAIL` | your email (cert expiry notices) |

`GITHUB_TOKEN` is automatic — no need to add it. Also create an **Environment**
named `production` (Settings → Environments) since the deploy job targets it.

> GHCR images are private by default; the VPS pulls them using `GITHUB_TOKEN`
> during the deploy. No extra config needed.

## Step 5 — Deploy

```bash
git push origin main          # or: Actions → "Build and Deploy" → Run workflow
```

Watch **Actions**. First run takes ~5–8 min (builds + first TLS issue). When green:

- https://pyramidsolvers.xyz → the command center (SPA)
- `curl -I https://pyramidsolvers.xyz/health` → `200`
- Log in with a seeded user (see `docs/07-operations/RUNBOOK.md` / seed output).

---

## How it works (so you can debug it)

- **Images** → `ghcr.io/elisbushaj/pyramid-backstage/{ops-core,ai-orchestrator,frontend}`.
- **`deploy.sh`** (on the VPS, `/opt/pyramid`): pull → start db/nats/redis/chromadb →
  `prisma migrate deploy` → seed once (marker `/opt/pyramid/.seeded`) → start
  ops-core + ai → obtain/verify TLS → start frontend + nginx → health-check →
  install the twice-daily cert-renewal cron.
- **Seeding** runs with `NODE_ENV=development` *for that one command only* (the seed
  refuses to create users under `production`); the live services stay `production`.
- **TLS**: first issue uses certbot **standalone** on :80 (nginx briefly stopped);
  renewals use **webroot** through the running nginx (cron at 03:00/15:00).

## Common operations

```bash
ssh deploy@<VPS_IP>
cd /opt/pyramid
C="docker compose -f docker-compose.prod.yml"
$C ps                       # status
$C logs -f ops-core         # tail a service
$C logs -f ai-orchestrator
$C restart nginx

# Re-seed from scratch (DESTRUCTIVE — wipes domain data):
$C run --rm -e NODE_ENV=development ops-core sh -c "npm run db:reset" && touch .seeded

# Re-issue TLS manually:
rm -rf certbot/conf/live && ./scripts/deploy.sh
```

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Deploy fails at "certificate request failed" | DNS A-records not pointing at `<VPS_IP>` yet, or ports 80/443 closed. Fix DNS, re-run the workflow. |
| `502` from nginx | ops-core/frontend not healthy yet — `$C logs ops-core`. |
| AI features stay "unavailable" in the UI | `ANTHROPIC_API_KEY` missing/invalid, or ai-orchestrator unhealthy — `$C logs ai-orchestrator`. The SPA degrades gracefully; the rest of the app still works. |
| Migrations fail | check `DATABASE_URL`/`DB_PASSWORD` secret; `$C logs db`. |
| Out of memory | `docker stats`; CPX32 has 8 GB — should be ~5 GB used. |

## Cost

Hetzner CPX32 ≈ **€14/mo**. Domain ≈ **$12/yr**. TLS is free (Let's Encrypt).
Anthropic API is usage-based (only when the AI intake/chat/plan endpoints run).
