# Customer onboarding checklist

Concrete steps to bring a real customer onto this deployment. Targets
the existing host (Windows + SQLite + Cloudflare tunnel at
`bcon.jahdev.com`); revisit for any future host migration.

---

## 0. Prereqs (one-time, before the first customer)

- [ ] `.env` populated with `AUTH_SECRET`, `AUTH_TRUST_HOST=true`, and
      `CRON_SECRET` (`scripts/register-backup-task.ps1` reads from here).
- [ ] (optional) `OPENAI_API_KEY` + `ENABLE_LLM_CALLS=true` — without this,
      AI features fall back to deterministic mocks. `ANTHROPIC_API_KEY`
      works too; OpenAI wins if both are set.
- [ ] Backup task registered:
      `powershell -ExecutionPolicy Bypass -File scripts\register-backup-task.ps1`
      Runs at 02:30 daily as SYSTEM, hits `/api/cron/backup`. Verify
      with: `Get-ScheduledTask -TaskName bcon-nightly-backup`.
- [ ] OneDrive / Google Drive desktop client installed and syncing the
      directory you'll point each tenant's `backupDirectory` at (default
      fallback writes to `./uploads/backups/<slug>/` regardless).
- [ ] `/api/health` is reachable: `curl https://bcon.jahdev.com/api/health`.
      Confirms db ok, auth configured, cron configured.

---

## 1. Provisioning the customer's tenant

Sign in as the super-admin (`trey@jahdev.com` until you change
it — see step 5 below) and:

1. **Create the tenant** at `/admin/tenants/new`. Set:
   - Name, slug (URL-safe — used in backup paths and tenant cookies)
   - Primary mode: SIMPLE / VERTICAL / HEAVY_CIVIL
   - Enabled modes (the customer can switch later)
   - At least one business unit
   - First admin user (their email + a temp password they change on
     first login)

2. **Configure the backup destination** for the new tenant:
   ```
   UPDATE Tenant SET backupDirectory = 'C:/Users/bot/OneDrive/bcon-backups/<customer-slug>'
                 WHERE slug = '<customer-slug>';
   ```
   Or via the Tenant admin UI once the surface lands. Without this set,
   nightly backups still write to `./uploads/backups/<slug>/`.

3. **Run a manual backup** to verify:
   ```
   curl -X POST -H "Authorization: Bearer <CRON_SECRET>" \
        https://bcon.jahdev.com/api/cron/backup
   ```
   The response lists per-tenant byte counts and external-copy paths.
   Open the OneDrive sync folder; confirm a `<yyyy-mm-dd>.json` is
   present.

4. **Switch into the tenant** from `/admin/tenants` to verify the tenant
   loads and demo seed data is NOT visible (each tenant only sees its
   own rows; the seed scripts only populate `jah-construction`).

---

## 2. Bringing the customer's users in

Three options, ordered by friction:

- **Invite via /admin/tenants/[id]/memberships/create**: super-admin
  picks an existing User row (or creates one) and adds them to the
  tenant with a role. The user gets a temp password to change on first
  login. Today there's no email-based invite flow — the password has
  to be communicated out of band.

- **Bulk import**: not yet a feature. If they need >20 users, write
  a one-off seed script that reads a CSV and creates User +
  Membership rows in a transaction.

- **Self-service**: not exposed. NextAuth credentials provider has no
  open registration by design.

Roles available (see `src/lib/permissions.ts`):
- `ADMIN`, `EXECUTIVE`, `MANAGER`, `PROGRAM_MANAGER`, `CONTROLLER`,
  `SUPERINTENDENT`, `SAFETY_MANAGER`, `QUALITY_MANAGER` — manager-tier
  (can approve change orders, pay apps, RFIs, submittals, etc).
- `PROJECT_ENGINEER`, `FOREMAN`, `COORDINATOR` — editor-tier (can
  edit but not approve manager-gated mutations).
- `RECRUITER`, `CAPTURE_MANAGER`, `ACCOUNT_EXECUTIVE`, `VIEWER` —
  read-or-niche roles.

---

## 3. Data migration (if they have existing systems)

The historical-import flow at `/imports` accepts CSVs for:
- Project actuals
- Bid history
- Income statements
- Budget templates
- Schedule of values
- Vendor lists

For anything else (existing RFIs, submittals, contracts, etc.), the
options are:
1. Export the CSV from their old system, write a one-off seed script
   that creates rows under the new tenant.
2. Use the API routes directly — every CRUD endpoint is documented
   in `src/app/api/`.

Their original CSV survives in `./uploads/<tenantId>/...` via the
storage adapter, plus the parsed rows live in `HistoricalImport` /
`HistoricalImportRow`. The `imports/[id]/commit` flow promotes
parsed rows into the live tables (e.g. journal entries) once a manager
reviews the AI flags.

---

## 4. Day-one usability gaps to know about

These are real product gaps the customer will hit. Plan around them:

- **No password reset flow.** Users who forget their password need a
  super-admin to reset it via `/api/admin/users/[userId]/reset-password`.
  Wiring email reset requires Resend / Postmark / SES creds + a
  configured sender domain — see `src/lib/notify.ts` Transport
  interface for the swap point.

- **No email notifications.** Watcher / NotificationRule rows are
  created but the dispatcher uses `ConsoleTransport` (logs to stderr).
  Same Resend dependency as above.

- **Currency arithmetic uses Float.** IEEE-754 rounding errors
  accumulate when summing many line items. Do not run a multi-day
  reconciliation against an ERP without first migrating the schema
  to `Decimal @db.Decimal(15, 2)` (deferred — see
  `docs/pass-audit-07.md` §1.2).

- **One Windows machine = single point of failure.** If the host's
  drive fails, the OneDrive-synced backups are the only restore path,
  and they're plain JSON exports — no point-in-time recovery,
  granularity is per-day. For higher RPO/RTO needs, plan a Postgres
  migration to a managed host.

- **No mobile app.** Site is responsive; field-team workflows (daily
  logs, ticket capture, photo upload) are desktop-grade.

---

## 5. Pre-launch hardening

- [ ] Change the seeded super-admin password from `hadleymaris` to
      something else BEFORE giving the customer access:
      `/api/admin/users/<trey-admin-id>/reset-password`.
- [ ] (Optional but recommended) Demote `trey@jahdev.com` from
      super-admin if you have a different super-admin user; the seeded
      one is meant for dev-only.
- [ ] Confirm the demo tenants (`velocity-demo`, `palmetto-civil`) are
      either deleted or clearly marked as demos so the customer doesn't
      wander into them. Default tenant cookie falls back to the first
      tenant alphabetically — set the customer's slug as default by
      switching into it before sharing the URL.
- [ ] Verify `/api/health` returns `ok: true` from the public URL.
- [ ] Verify `/api/cron/backup` runs cleanly:
      `& 'curl.exe' -H "Authorization: Bearer $env:CRON_SECRET" -X POST https://bcon.jahdev.com/api/cron/backup`
- [ ] Get the customer's OneDrive sync path right BEFORE day one — a
      mid-week change leaves a partial trail of backups in the wrong
      place.

---

## 6. After launch — what to monitor

- `/api/health` — hit it from anywhere on a 5-minute schedule. Failure
  flips `ok: false` and (with `?strict=1`) returns 503.
- `/admin/audit` — the platform-wide audit-event ledger. Filter to
  the customer's tenant to see every state change.
- `/admin/portal-coverage` — every catalog row with last-verified
  status. Click "Refresh now" weekly (or wire `/api/cron/verify-portals`
  to a Windows Task). Watch for newly-failing portals (URL drift) and
  for portals with high subscription counts that are still MANUAL —
  those are the next scrapers worth implementing.
- `/settings/audit` — the customer's own scoped audit log. Useful
  for compliance review without giving them super-admin access.
- `tenant.lastBackupAt` — should never be more than 25 hours stale.
  Render it on `/admin/tenants` (TODO: surface this column in the UI).
- `AlertEvent` rows — `runAlertScan()` populates these from cron;
  the customer's `/alerts` page surfaces what needs attention.

---

## 7. Pass-12+ flow — bid pipeline activation

The new federal/SE construction pipeline is opt-in per tenant. After
the basic tenant is provisioned, walk the customer through:

1. **Per-tenant LLM key** (pass-15): `/settings` → AI provider keys.
   Customer pastes their own OpenAI / Anthropic key; the cleartext is
   encrypted with a per-tenant salt before persistence. They get
   billed for their AI usage on their own provider account. Click
   "Test key" to verify before relying on it.

2. **Bid profile** (pass-11): `/bids/profile`. Customer fills in
   target NAICS codes (e.g. 236220 commercial building, 237310
   highway), qualified set-asides (8a, SDVOSB, HUBZONE, WOSB),
   target states + cities, value range, boost / block keywords.
   Without this, every listing scores neutral 50; with it, scores
   become actionable and the auto-draft pipeline can fire.

3. **Portal subscriptions**: `/bids/discover` browses 234 catalog
   entries. Customer subscribes to portals matching their geography
   + agency mix. Federal entries (USACE districts, NASA, VA, Air
   Force bases) auto-route to the SAM.gov scraper; KYTC has a
   working HTML scraper; others stay MANUAL.

4. **SAM.gov API key**: free key from
   https://open.gsa.gov/api/get-opportunities-public-api/ — paste
   into `.env` as `SAM_GOV_API_KEY`. Without it, all federal
   subscriptions fail with a clear "key not configured" error;
   with it, ~50 federal portals start auto-sweeping.

5. **First sweep**: `/bids/sources` → "Run sweep now". Watch the
   Last-checked column for green "auto · api" badges; expect
   listings to land on `/bids/listings` within a minute.

6. **Auto-draft policy**: per-source toggle on `/bids/sources`.
   Default threshold 70 means a listing has to score ≥70 to
   auto-draft a bid. Lower to 60 for aggressive pursuit; raise to
   80 for conservative.

The customer's first day measures success by: (a) ≥5 listings ingested,
(b) ≥1 listing scoring above 70, (c) at least one auto-drafted bid
they actually want to submit.
