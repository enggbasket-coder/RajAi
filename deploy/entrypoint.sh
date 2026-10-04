#!/bin/sh
# Runs on every container start: apply migrations, optionally seed, then serve.
set -e
cd /app/packages/database
echo "[trackwise] applying migrations…"
npx prisma migrate deploy
if [ "$SEED_DEMO" = "true" ]; then
  echo "[trackwise] seeding demo organization (SEED_DEMO=true)…"
  npx tsx prisma/seed.ts || echo "[trackwise] seed failed (continuing)"
fi
cd /app
echo "[trackwise] starting web on :${PORT:-3000}"
exec pnpm --filter @trackwise/web start -- -p "${PORT:-3000}"
