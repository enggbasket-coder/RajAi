#!/usr/bin/env bash
# One-command deploy / update on the server. Run from the repository root.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ ! -f .env ]; then
  echo "No .env found. Run: cp deploy/.env.production.example .env  and fill in the secrets."; exit 1
fi
if [ -d .git ]; then git pull --ff-only; fi
docker compose build web
docker compose up -d
docker compose ps
echo
echo "Tailing web logs (Ctrl-C to stop)…"
docker compose logs -f --tail=50 web
