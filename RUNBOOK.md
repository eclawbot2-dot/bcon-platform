# bcon (construction-project) — Operational Runbook

> Verified against the repo's deploy/CI/backup scripts and `process.env`
> usage. Anything not confirmed in-repo is marked **VERIFY**.

## 1. What it is

bcon is a multi-tenant construction management platform supporting three
operating modes (Simple PM, Vertical Building, Heavy Civil) from one codebase.

- **Tenancy:** multi-tenant (`Tenant → Business Unit → Project`). Super-admins
  with no tenant cookie land on `DEFAULT_TENANT_SLUG` if set, else the oldest
  tenant. SSO providers (Okta/Azure AD/Google/Auth0) optional per env.
- **Live URL:** https://bcon.jahdev.com (cloudflared tunnel). Public/canonical
  per `.env.example` comment is also `bcon.velocitychs.com` — **VERIFY** which
  hostname is canonical in prod. Local: http://localhost:3101.

## 2. Run / deploy

- **Services** (both registered by `scripts/install-services.ps1`, LocalSystem,
  auto-start, restart-on-failure):
  - `bcon-next` — NSSM-wrapped `node next start -p 3101`.
  - `Cloudflared` — the named-tunnel daemon for bcon.jahdev.com, installed via
    `cloudflared service install <token>` (token from `<repo>\.tunnel-token`,
    the `bcon-jahdev` CF tunnel).
- **Port:** 3101.

First-time host setup: ensure `.tunnel-token` + `.env` exist, `npm run build`
once, then `powershell -ExecutionPolicy Bypass -File scripts\install-services.ps1`.

Routine deploy/rebuild: `deploy-bcon.ps1` reinstalls deps, regenerates Prisma,
runs `prisma migrate deploy`, seeds, builds, restarts `bcon-next`, and
health-checks local + public. Flags: `-SkipBuild`, `-RestartTunnel`.

```powershell
powershell -ExecutionPolicy Bypass -File deploy-bcon.ps1
```

**Prisma engine DLL lock (Windows):** the running service locks Prisma /
native binaries (the local `prisma/rate-limit.db` sidecar). Stop the service
before regenerating:

```bash
net stop bcon-next
npm run db:generate
net start bcon-next
```

## 3. Environment variables

Values REDACTED. `src/lib/env-guard.ts` runs at `next build` (NODE_ENV=production)
and **refuses to boot** if required secrets are missing/placeholder/too-short.

**Required (production)**
- `AUTH_SECRET` — NextAuth. `openssl rand -hex 32`.
- `BCON_VAULT_KEY` — per-tenant secret-encryption (vault) key; encrypted-at-rest
  portal credentials depend on it (`lib/rfp-geo.ts`). Must not equal dev default.
- `CRON_SECRET` — Bearer gating `/api/cron/*` (incl. `/api/cron/backup`).

**Auth / URL**
- `AUTH_TRUST_HOST` (`true`), `AUTH_URL` (canonical, e.g.
  `https://bcon.jahdev.com`), `NEXTAUTH_URL`, `APP_URL` — reset/redirect links.
- `DEFAULT_TENANT_SLUG` — optional landing tenant for super-admins
  (e.g. `velocity-demo`).

**Database**
- `DATABASE_URL` — **required**; a `postgresql://` connection string. The app
  (`src/lib/prisma.ts`) and Prisma CLI (`prisma.config.ts`) both refuse a
  non-Postgres URL. Local dev/CI default: the `bcon` / `bcon_test` databases on
  `127.0.0.1:5432`.
- `TEST_DATABASE_URL` — Postgres URL the vitest suite runs against (defaults to
  a local `bcon_test` database; CI sets it to the disposable service DB).

**SSO providers** (all optional, enable per provider)
- Okta: `OKTA_CLIENT_ID`, `OKTA_CLIENT_SECRET`, `OKTA_ISSUER`
- Azure AD: `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID`
- Google: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- Auth0: `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_ISSUER`

**Email** (optional; unset = log-only)
- `EMAIL_TRANSPORT`, `EMAIL_FROM`, `RESEND_API_KEY`, `SENDGRID_API_KEY`,
  `NOTIFY_TRANSPORT`.

**Integrations / AI / portals** (optional)
- `SAM_GOV_API_KEY` — SAM.gov scraper.
- `ENABLE_LLM_CALLS`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `ANTHROPIC_API_KEY`,
  `ANTHROPIC_MODEL` — AI; deterministic mock fallback when unset.
- `QUEUE_TRANSPORT`, `STORAGE_TRANSPORT` (+ `STORAGE_S3_*` as in `lib/storage.ts`:
  `STORAGE_S3_BUCKET/REGION/ENDPOINT/ACCESS_KEY/SECRET_KEY/PUBLIC_URL`).

**Observability / backups**
- `ERROR_WEBHOOK_URL`, `ERROR_REPORT_SOURCE` (e.g. `bcon-prod`), `SENTRY_DSN`.
- `BACKUP_RETENTION_DAYS` — physical backup retention (default 14).

## 4. Database

- **Provider:** PostgreSQL 16 via `@prisma/adapter-pg`. `DATABASE_URL` is a
  `postgresql://` connection string (local: `bcon` on `127.0.0.1:5432`). The
  legacy `prisma/dev.db` SQLite file is retained only as a cold fallback and is
  no longer used by the app. (One exception: the brute-force rate limiter keeps
  a tiny *local* SQLite sidecar `prisma/rate-limit.db` for its synchronous
  hot-path counter — host-local throttling state, not application data.)
- **Schema management:** **Prisma migrations** (`prisma/migrations`).
  `deploy-bcon.ps1` runs `db:generate` + `db:migrate` (`prisma migrate deploy`);
  CI runs `prisma migrate deploy` against a `postgres:16` service. Create a new
  migration with `npx prisma migrate dev --name <change>`.
- **Audit triggers:** `scripts/install-audit-triggers.ts` installs Postgres
  append-only triggers on `AuditEvent` (UPDATE always blocked; DELETE blocked
  only when `BCON_AUDIT_IMMUTABLE=true`, else the prune cron may age out rows).
  Reinstall after a restore — not wired into `deploy-bcon.ps1`:
  `npx tsx scripts/install-audit-triggers.ts`.

**Backup** — `npx tsx scripts/db-backup.ts` (or Task Scheduler via
`scripts/register-db-backup-task.ps1`): `pg_dump --format=custom` to
`backups/db/<ts>.dump`, verified via `pg_restore --list`, prunes >
`BACKUP_RETENTION_DAYS`. Requires the Postgres client tools on PATH (set
`PG_BIN` to e.g. `C:\Program Files\PostgreSQL\16\bin` if not). A logical
per-tenant JSON export also exists (`src/lib/backup.ts`).

**Restore:**
```bash
net stop bcon-next
# Drop/recreate the target database, then restore the custom-format dump:
pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname "postgresql://bcon:bcon_dev@127.0.0.1:5432/bcon" backups/db/<ts>.dump
npx tsx scripts/install-audit-triggers.ts
net start bcon-next
```

## 5. CI

`.github/workflows/ci.yml` on push/PR to `main` (Node 22; a health-checked
`postgres:16` service; strong CI secrets so `env-guard` passes): `npm ci` →
`prisma generate` → `prisma migrate deploy` → **`tsc --noEmit`** →
**`vitest run`** → **`next build`** → seed-portals smoke. `DATABASE_URL` /
`TEST_DATABASE_URL` point at the service DB. `dependency-audit.yml` +
npm-audit/SBOM steps are advisory. The three bold steps must stay green.

## 6. Health / observability

- **Health:** `GET /api/health` — reports db, `QUEUE_TRANSPORT`,
  `STORAGE_TRANSPORT`, `NOTIFY_TRANSPORT`, NODE_ENV; elevated detail with
  `Authorization: Bearer <CRON_SECRET>`.
- **Error reporting:** `ERROR_WEBHOOK_URL` (+ `ERROR_REPORT_SOURCE`), `SENTRY_DSN`.
- **Watchdog:** none in-repo beyond NSSM restart-on-exit + SCM recovery actions
  (Cloudflared auto-restarts at 20s). `deploy-bcon.ps1` health-checks after restart.

## 7. Common ops

- **Logs:** `logs\bcon-next.out.log`, `logs\bcon-next.err.log` (NSSM, rotated
  at 5 MiB).
- **Rotate a secret:** edit `.env`, then `net stop bcon-next && net start
  bcon-next` (or re-run `install-services.ps1` to refresh `AppEnvironmentExtra`).
  Rotating `BCON_VAULT_KEY` invalidates all encrypted-at-rest portal creds —
  re-enter them after rotation.
- **Add a user / make an admin:** users/roles are managed in-app via tenant
  admin pages (`/api/tenant/*`, `/api/admin/tenants/*`); the seed
  (`prisma/seed.ts`) creates demo tenants + admins. **VERIFY** the seeded admin
  credentials for the target tenant.
- **Create a tenant:** super-admin via `/api/admin/tenants/create` (in-app).
- **Run a cron manually:** `curl -H "Authorization: Bearer <CRON_SECRET>"
  http://localhost:3101/api/cron/<name>`. Cron routes: `alert-scan`,
  `audit-prune`, `automations-dispatch`, `backup`, `inspections-sync`,
  `mail-ingest`, `rfp-sweep`, `verify-portals`, `weather-capture`. Schedules
  are registered by the `scripts/register-*-task.ps1` Task Scheduler scripts.
