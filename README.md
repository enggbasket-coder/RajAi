# Trackwise

Multi-tenant SaaS time tracking and task management where managers assign work from the **web app, WhatsApp or Telegram**, employees accept/reject from the channel they prefer, track time with a server-authoritative timer, submit timesheets, and managers approve and report.

```
Manager creates task → assigns → Trackwise sends via WhatsApp / Telegram → employee accepts/rejects
→ timer → timesheet → approval → reports
```

Trackwise is the single source of truth. WhatsApp and Telegram are interfaces into it: there is **one** business-logic layer (`packages/core`) and providers only deliver commands and notifications through the official **Meta WhatsApp Business Cloud API** and the official **Telegram Bot API**. No n8n/Zapier, no unofficial WhatsApp libraries, no QR sessions.

> The previous document-chat prototype that lived in this repository was moved to `legacy/doc-chat/` untouched.

---

## Contents

- [Repository structure](#repository-structure)
- [Local setup](#local-setup)
- [Database setup, migrations and seed](#database-setup-migrations-and-seed)
- [Development accounts](#development-accounts)
- [Running the tests](#running-the-tests)
- [Mock WhatsApp and Telegram](#mock-whatsapp-and-telegram)
- [Desktop agent (Electron)](#desktop-agent-electron)
- [Meta WhatsApp configuration](#meta-whatsapp-configuration)
- [Telegram bot setup](#telegram-bot-setup)
- [Production environment](#production-environment)
- [Architecture notes](#architecture-notes)
- [MVP scope and what is deliberately not built](#mvp-scope-and-what-is-deliberately-not-built)

---

## Repository structure

```
apps/
  web/        Next.js 15 (App Router, TypeScript, Tailwind) — UI + API routes + webhooks
  desktop/    Electron agent — login, tasks, timer, idle prompt, tray indicator
packages/
  shared/     Types, errors, E.164 phone normalization, timezone utils, deterministic
              date parser, assign-command parser, reply parser, crypto/signing
  database/   Prisma schema, migrations, seed, singleton client
  auth/       Password hashing (scrypt), sessions (HTTP-only cookie / Bearer), resets, actor resolution
  rbac/       Role → permission matrix (OWNER / ADMIN / MANAGER / EMPLOYEE)
  messaging/  Provider contract, normalized inbound events, message formatting, mock providers
  whatsapp/   WhatsAppMessagingProvider — Meta Cloud API adapter (send, template fallback,
              signature verification, payload normalization)
  telegram/   TelegramMessagingProvider — Bot API adapter (inline keyboards, callbacks,
              secret-token verification, setWebhook/getMe)
  timer/      TimerService — one active timer per user, transactional switch, manual time
  core/       All business services: organizations, members, invitations, clients, projects,
              tasks, assignments, MessagingService (deliveries, retries, status), inbound
              state machine (accept/reject/rejection reason/manager commands), notifications,
              timesheets, reports, dashboard, audit. Integration tests live here.
legacy/doc-chat/   previous prototype (unrelated)
```

Service boundaries: `OrganizationService`, `MemberService`, `InvitationService`, `ClientService`, `ProjectService`, `TaskService`, `AssignmentService`, `MessagingService`, `ConnectionService` (WhatsApp/Telegram config), `IdentityService`, `TimerService`, `TimesheetService`, `ReportService`, `DashboardService`, `AuditService`.

## Local setup

Requirements: Node 22+, pnpm 10, PostgreSQL 14+.

```bash
pnpm install
cp .env.example .env            # edit DATABASE_URL / AUTH_SECRET if needed
pnpm db:migrate                 # creates the schema (prisma migrate dev)
pnpm db:seed                    # Trackwise Demo organization
pnpm dev                        # http://localhost:3000
```

`.env.example` documents every variable. The important ones for local development:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection for the app |
| `TEST_DATABASE_URL` | Separate database used by the test suite |
| `AUTH_SECRET` | Signs callback references and derives the at-rest encryption key (set `ENCRYPTION_KEY` separately in production) |
| `APP_URL` | Public URL used in messages and webhook registration |
| `WHATSAPP_PROVIDER` | `mock` (default) or `meta` |
| `TELEGRAM_PROVIDER` | `mock` (default) or `telegram` |
| `ENABLE_DEV_TOOLS` | `true` enables the mock console at `/dev/messaging` and `/api/dev/*`. Never enable in production. |

## Database setup, migrations and seed

- Schema: `packages/database/prisma/schema.prisma` (18 models, every org-owned table carries `organizationId`, unique constraints on `(taskId,userId)`, `(taskAssignmentId,channel)`, `(provider,externalEventId)`, `(channel,direction,externalMessageId)`, and `active_timers.userId` is **unique** so the database itself forbids two running timers).
- `pnpm db:migrate` – create/apply migrations in development (`prisma migrate dev`).
- `pnpm db:deploy` – apply committed migrations in production (`prisma migrate deploy`).
- `pnpm db:reset` – drop, re-migrate and re-seed.
- `pnpm db:seed` – (re)creates **Trackwise Demo**: owner, manager, two employees, 2 clients, 3 projects, tasks delivered through WhatsApp / Telegram / both (one accepted through Telegram), a rejected task with reason, a week of billable, non-billable and manual time, one submitted and one approved timesheet.

## Development accounts

Password for all: `password123`

| Email | Role | Messaging identities (fake) |
| --- | --- | --- |
| owner@trackwise.demo | OWNER | — |
| manager@trackwise.demo | MANAGER | WhatsApp `+15550100003`, Telegram id `100000003` |
| akhil@trackwise.demo | EMPLOYEE | WhatsApp `+15550100001`, Telegram id `100000001` (prefers Telegram) |
| priya@trackwise.demo | EMPLOYEE | WhatsApp `+15550100002`, Telegram id `100000002` (prefers WhatsApp) |

The demo organization's timezone is `Asia/Kolkata`, default management channel WhatsApp, WhatsApp mock `phone_number_id` = `demo-phone-number-id`.

## Running the tests

```bash
createdb trackwise_test            # once; or set TEST_DATABASE_URL
pnpm test                          # vitest, integration tests against Postgres
pnpm typecheck                     # every package
pnpm build                         # Next.js production build
```

The 39 tests in `packages/core/test` cover exactly the MVP list: tenant isolation (read/write/assign/respond/timer/audit), WhatsApp acceptance (+ delivered/read statuses), Telegram acceptance (+ tampered callback), cross-channel acceptance in both directions, WhatsApp and Telegram rejection with reason, invalid WhatsApp reply prompted once, duplicate WhatsApp and Telegram webhooks, unauthorized manager command, unknown WhatsApp number, unknown Telegram user, cross-tenant identities, unknown connection, retry after max attempts without duplicate rows, no re-send of sent deliveries, opt-in enforcement, fallback only when allowed, web acceptance, one timer (switch, concurrency, stop), manual time rules, timesheet self-approval ban, lock after approval, reopen audit, CSV, manager commands on WhatsApp (YES/NO, ambiguous name, ambiguous date, unknown project) and Telegram (buttons, only the manager can confirm, cancel), Telegram linking codes, and the parsers.

## Mock WhatsApp and Telegram

With `WHATSAPP_PROVIDER=mock` and `TELEGRAM_PROVIDER=mock` no credentials are needed. Mock providers record outbound messages in memory and **re-use the real payload parsers**, so simulated events travel through the real webhook pipeline (dedupe → identity → conversation state → core services).

Open **Mock console** (sidebar, owner/admin, requires `ENABLE_DEV_TOOLS=true`) at `/dev/messaging` to:

- send any text as any member on WhatsApp or Telegram (`1`, `2`, `yes`, `assign Akhil | EdgeVerve Q2O | Finish Act 2 keyframes | due tomorrow 2pm`, `/start`, …) or from an **unknown sender**;
- press the Telegram **✅ Accept / ❌ Reject** buttons of any pending assignment (signed callback data);
- simulate WhatsApp `delivered` / `read` / `failed` status callbacks;
- inject provider failures (`temporary`, `permanent`, `fail next 3`) to exercise retries and the manager's **Retry** button on the task page.

You can also post raw provider-shaped payloads to the real webhook routes (`POST /api/webhooks/whatsapp`, `POST /api/webhooks/telegram/<connectionId>`); in mock mode signature checks are skipped, in real mode they are enforced.

Switching to production is only an environment change (`WHATSAPP_PROVIDER=meta`, `TELEGRAM_PROVIDER=telegram`); nothing else in the application changes.

## Desktop agent (Electron)

```bash
pnpm --filter @trackwise/desktop start      # builds TypeScript and launches Electron
```

(Electron's binary download was skipped in CI-like environments with `ELECTRON_SKIP_BINARY_DOWNLOAD=1`; run `pnpm install` normally on a workstation.)

Features: sign in (Bearer session, stored in the OS user-data folder), organization switch, pending assignments (accept), accepted tasks with **Start / Switch / Stop**, running clock synchronised with the server every 30 s, tray indicator while tracking, presence heartbeat, and **idle handling**: after `idle_timeout_minutes` without keyboard/mouse input (`powerMonitor.getSystemIdleTime()` — aggregate seconds only, nothing is captured) the agent asks *Keep idle time / Discard idle time*. Discarding stops the timer at `now − idle` on the server; nothing is removed automatically. On restart the agent re-fetches `/api/timer/current`, so a running timer is recovered rather than duplicated. Web and desktop share the same single server-side timer.

## Meta WhatsApp configuration

1. Create a Meta app with the WhatsApp product, a WhatsApp Business Account (WABA) and a phone number. Note the **Phone number ID**, **WABA ID**, generate a **permanent system-user access token** and copy the **App secret**.
2. In Trackwise: *Messaging settings → WhatsApp → Configure*. Enter phone number ID, WABA ID, access token, app secret, a verify token of your choice, and optionally an approved template name. Secrets are encrypted at rest (AES-256-GCM) and never returned to the browser. Set `WHATSAPP_PROVIDER=meta`.
3. **Webhook**: in Meta → WhatsApp → Configuration set the callback URL to `https://<APP_URL>/api/webhooks/whatsapp`, the verify token you entered, and subscribe to the `messages` field. Trackwise answers the `hub.challenge` handshake (`GET`) and verifies every `POST` with `X-Hub-Signature-256` against the app secret. Inbound events are matched to the organization by `metadata.phone_number_id`.
4. **Templates / 24-hour window**: inside an open customer-service window Trackwise sends plain session messages. When Meta rejects with error `131047` (re-engagement required) and a template name is configured, it re-sends using that approved template with body parameters *(task, project, due, estimate)*. Create and get the template approved in WhatsApp Manager first, e.g. `trackwise_task_assignment`. Validate the current window/template rules against Meta's documentation before launch.
5. **Opt-in**: Trackwise only messages numbers that belong to an active member, are verified and have `opted_in = true` (employee: *My messaging → Save & opt in*). Unknown numbers that message the bot are logged and never answered or auto-created.
6. Delivery states `sent → delivered → read / failed` arrive as status webhooks and are applied monotonically to `assignment_deliveries` and `communication_messages`.

## Telegram bot setup

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy the token.
2. In Trackwise: *Messaging settings → Telegram → Configure*. Paste the token and the bot username, save. Trackwise calls `setWebhook` with `https://<APP_URL>/api/webhooks/telegram/<connectionId>` and a random `secret_token`, and `getMe` to confirm the bot id. Set `TELEGRAM_PROVIDER=telegram`. `APP_URL` must be public HTTPS.
3. Every update is verified through the `X-Telegram-Bot-Api-Secret-Token` header before parsing.
4. **Employee linking** (identity is never inferred from a username): *My messaging → Connect Telegram* shows a code such as `TW-X7K92P` (15 minutes, single use, organization scoped). The employee opens the bot and sends `/start TW-X7K92P`; Trackwise links the Telegram user id + chat id to the member. A deep link `https://t.me/<bot>?start=TW-X7K92P` is offered too.
5. Assignments arrive with inline buttons **✅ Accept / ❌ Reject / 📋 Open Task**. Callback data is a signed opaque reference (`acc:<id>:<hmac>`); Trackwise validates organization, user and assignment before any transition and edits the message to *✅ Accepted* with an *▶ Open Timer* button.
6. Telegram does not report delivered/read, so Telegram deliveries stop at `SENT`; Trackwise does not invent states.

## Production environment

**One-command Docker deployment** (Postgres + web + Caddy with automatic HTTPS) is documented in [`deploy/README.md`](deploy/README.md): `cp deploy/.env.production.example .env`, fill in secrets, `./deploy/deploy.sh`. The notes below apply to any other hosting.

- Set `NODE_ENV=production`, `APP_URL=https://…`, a long random `AUTH_SECRET` and a separate `ENCRYPTION_KEY`, `ENABLE_DEV_TOOLS=false` (or unset), `WHATSAPP_PROVIDER=meta`, `TELEGRAM_PROVIDER=telegram`. Per-organization credentials entered in the UI take precedence; `META_*` / `TELEGRAM_*` env values act as defaults when a field is empty.
- `pnpm install --frozen-lockfile && pnpm db:deploy && pnpm build && pnpm start`.
- Terminate TLS in front of the app; cookies are `HttpOnly`, `SameSite=Lax`, `Secure` in production.
- Webhooks return quickly and are idempotent (`messaging_webhook_events` unique on provider + external id). Outbound sending retries up to 3 attempts in-process with backoff; for high volume move `MessagingService.sendAssignment` behind a queue worker (the service is already side-effect-safe to re-run).
- Email is not wired in the MVP: invitation links are shown to the inviter and password-reset links are logged server-side; plug an email provider into `InvitationService.create` / `createPasswordReset`.
- S3 variables are reserved for Phase 2 screenshots and unused.

## Architecture notes

- **Tenant isolation** is enforced server-side: every service method receives an `Actor` resolved from the session **and** an `organization_members` row; the browser never supplies org id or role. Every query is scoped by `organizationId`; cross-tenant ids resolve to 404.
- **Assignment model**: `tasks` → `task_assignments` (one per employee, `PENDING/ACCEPTED/REJECTED/CANCELLED`) → `assignment_deliveries` (one per channel, `QUEUED/SENT/DELIVERED/READ/FAILED`). "Both" channels means two deliveries and still **one** assignment; accepting on either channel is a single idempotent transition guarded by a row lock, and a later reply on the other channel gets *"This task has already been accepted."* Accepting via WhatsApp edits the Telegram message so both agree.
- **Conversation state** per messaging identity (`messaging_conversations`): `IDLE`, `AWAITING_REJECTION_REASON`, `AWAITING_ASSIGN_CONFIRMATION`, `AWAITING_ASSIGNEE_CHOICE`, `AWAITING_PROJECT_CHOICE`, `AWAITING_DUE_CLARIFICATION`.
- **Manager commands** (`assign <employee> | <project> | <task> | due <date>`, with or without `/`) are parsed by `DeterministicAssignmentCommandParser` behind the `AssignmentCommandParser` interface (an AI parser can be added later; it would only *suggest* values, confirmation is always required). Assignee resolution order: internal id → exact phone → exact email → exact display name → unique case-insensitive name; ambiguity asks (numbered reply on WhatsApp, buttons on Telegram) and never guesses. Same for projects (code → name → unique match). Dates resolve in the organization timezone; `12/10`, `tomorrow 5` and the like are rejected as ambiguous.
- **Timer**: `active_timers.userId` unique + advisory lock; `start` on another task closes the running one and opens the new one in one transaction with server timestamps.
- **Timesheets**: Monday-based weeks in the org timezone; submit locks entries, approve locks them further, reject reopens for editing, reopen is admin/manager only and audited. Nobody can approve their own timesheet.
- **Audit log** is append-only through `AuditService.log`; there is no update/delete path.
- **Secrets** (tokens, app secret, verify token, webhook secret) are encrypted with AES-256-GCM and only decrypted server-side when calling the provider.
- **Monitoring** (activity %, screenshots, app/URL tracking) is Phase 2, `monitoringEnabled` defaults to `false` and there is no UI to turn it on. Trackwise never records keystrokes, clipboard, webcam or audio.

## Appearance: colour themes and Liquid Glass

The header has a theme picker with eight complete colour themes (four light: Coral, Sage, Ocean, Slate; four dark: Midnight, Moss, Abyss, Graphite) and a "Liquid Glass finish" toggle that layers frosted, floating panels over whichever theme is active. Themes are pure CSS token sets in `apps/web/src/app/globals.css` (`:root[data-theme=…]` plus `.dark`), the glass finish is scoped to `:root[data-glass]`, and the choice is stored in `localStorage` (`tw-theme`, `tw-glass`) and applied by an inline script in the root layout before first paint. Status colours (red/amber/green) are never themed. After a deploy, hard-refresh once if styles look stale.

## MVP scope and what is deliberately not built

Built: Milestones 1–8 (foundation, work management, messaging framework, WhatsApp, Telegram, time tracking incl. Electron agent, timesheets, dashboard / live team / reports / CSV / audit).

Not built (by design): payroll, invoicing, payments, scheduling, AI/voice assignment, GPS/geofencing, screenshots or any monitoring, native mobile apps, email delivery.
