# Trackwise web — production image (Next.js + Prisma). Build context: repository root.
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH ELECTRON_SKIP_BINARY_DOWNLOAD=1 NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* && corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

# 1. Install dependencies (layer cached until a manifest changes)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/desktop/package.json apps/desktop/
COPY packages/shared/package.json packages/shared/
COPY packages/database/package.json packages/database/
COPY packages/auth/package.json packages/auth/
COPY packages/rbac/package.json packages/rbac/
COPY packages/messaging/package.json packages/messaging/
COPY packages/whatsapp/package.json packages/whatsapp/
COPY packages/telegram/package.json packages/telegram/
COPY packages/timer/package.json packages/timer/
COPY packages/core/package.json packages/core/
RUN pnpm install --frozen-lockfile --filter '!@trackwise/desktop'

# 2. Build
COPY . .
RUN pnpm --filter @trackwise/database generate \
  && DATABASE_URL="postgresql://build:build@localhost:5432/build" AUTH_SECRET="build-time-placeholder-secret" \
     pnpm --filter @trackwise/web build

ENV NODE_ENV=production PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://localhost:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "deploy/entrypoint.sh"]
