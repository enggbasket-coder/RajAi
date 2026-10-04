# Deploying Trackwise to trackwise.plusbrains.ai

Target: one Linux VM (Ubuntu 22.04/24.04, 2 vCPU / 4 GB is plenty) with Docker Engine + Compose plugin.

## 1. DNS
Create an **A record** `trackwise.plusbrains.ai → <server public IP>` (and AAAA if IPv6). Open inbound **80** and **443** in the firewall / security group. Caddy needs port 80 reachable to obtain the certificate.

## 2. Server prerequisites
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker
```

## 3. Get the code
```bash
git clone https://github.com/enggbasket-coder/RajAi.git trackwise
cd trackwise && git checkout claude/trackwise-saas-build-oqz7es   # or main after merge
```

## 4. Configure
```bash
cp deploy/.env.production.example .env
openssl rand -base64 48   # run three times → POSTGRES_PASSWORD, AUTH_SECRET, ENCRYPTION_KEY
nano .env
```
Keep `SEED_DEMO=true` for the first start if you want the demo organization and accounts; set it to `false` afterwards. Leave the providers on `mock` until Meta / Telegram credentials are ready.

## 5. Launch
```bash
./deploy/deploy.sh
```
First build takes a few minutes. The web container applies Prisma migrations on every start, then serves on port 3000 behind Caddy, which issues the Let's Encrypt certificate for `trackwise.plusbrains.ai` automatically.

Open https://trackwise.plusbrains.ai → sign in with `owner@trackwise.demo / password123` (demo seed) or **Create an organization**. Change the demo passwords or delete the demo org before inviting real users.

## 6. Go live with real messaging
1. In Trackwise: *Messaging settings → WhatsApp → Configure* (phone number ID, WABA ID, access token, app secret, verify token, optional template). In `.env` set `WHATSAPP_PROVIDER=meta`, then `docker compose up -d web`.
2. In Meta → WhatsApp → Configuration: callback URL `https://trackwise.plusbrains.ai/api/webhooks/whatsapp`, your verify token, subscribe to `messages`.
3. In Trackwise: *Messaging settings → Telegram → Configure* with the BotFather token. Set `TELEGRAM_PROVIDER=telegram` in `.env` and restart `web`. Trackwise registers `https://trackwise.plusbrains.ai/api/webhooks/telegram/<connectionId>` itself.
4. Employees opt in to WhatsApp and link Telegram from *My messaging*.

## Operations
| Task | Command |
| --- | --- |
| Update to latest code | `./deploy/deploy.sh` |
| Logs | `docker compose logs -f web` |
| Restart web only | `docker compose restart web` |
| Database backup | `docker compose exec db pg_dump -U trackwise trackwise \| gzip > backup-$(date +%F).sql.gz` |
| Restore | `gunzip -c backup.sql.gz \| docker compose exec -T db psql -U trackwise trackwise` |
| Shell in web container | `docker compose exec web sh` |
| Re-run seed manually | `docker compose exec web sh -c "cd packages/database && npx tsx prisma/seed.ts"` |

## Using an existing reverse proxy or managed Postgres
- Already running nginx/Traefik on the host? Remove the `caddy` service, publish `web` on `127.0.0.1:3000:3000` and proxy to it; keep `APP_URL` as the public HTTPS URL.
- Managed Postgres (RDS, Supabase, Neon…)? Remove the `db` service and set `DATABASE_URL` directly in `.env` (remove the derived value from `docker-compose.yml`).
