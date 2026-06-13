# construction-project

Enterprise multi-tenant construction management platform MVP foundation.

## What this repo now contains

A serious starter implementation for a single-codebase construction platform that supports three operating modes:

- Simple Construction Project Management
- Vertical Building Construction
- Heavy Civil Construction

The app is built as a Next.js + TypeScript + Prisma baseline with seeded demo data that shows how tenant mode, business-unit mode, and project mode can drive different behavior from one shared architecture.

## Stack

- Next.js 16
- TypeScript
- Prisma ORM
- SQLite for local prototyping
- Postgres-oriented schema design for future production promotion
- Tailwind CSS 4

## MVP foundation included

### Shared enterprise core
- Multi-tenant data model
- Business units and tenant-level configuration
- Memberships and named role templates
- Project master data
- Workflow templates / workflow runs
- Audit events
- Document registry
- Job thread / communication hub
- Tasks
- Daily logs
- Budget and budget lines

### Vertical mode starter
- RFIs
- Submittals
- Meetings
- Drawing/spec-capable document classes
- Vertical-specific dashboard defaults

### Heavy civil mode starter
- Quantity budgets
- Production entries
- Ticket tracking
- Location/segment tagging support
- Heavy-civil-specific dashboard defaults

### Simple mode starter
- Job-thread-first UX
- Lightweight tasks and budget visibility
- Client-friendly operating model defaults

## Local setup

```bash
npm install
cp .env.example .env
# generate an AUTH_SECRET into .env:
node -e "require('fs').appendFileSync('.env', 'AUTH_SECRET=' + require('crypto').randomBytes(32).toString('hex') + '\n')"
npm run setup
npm run dev
```

App runs on http://localhost:3101 — you'll be redirected to `/login`.

### Required env vars

| Var | Purpose |
| --- | --- |
| `AUTH_SECRET` | NextAuth JWT signing — required |
| `AUTH_TRUST_HOST` | `true` for local Cloudflare tunnel; remove in strict prod |
| `BCON_VAULT_KEY` | Per-tenant secret encryption salt for credentials + LLM keys |
| `CRON_SECRET` | Bearer token for `/api/cron/*` endpoints |

### Optional env vars

| Var | Purpose |
| --- | --- |
| `OPENAI_API_KEY` + `ENABLE_LLM_CALLS=true` | Platform-wide AI fallback when a tenant hasn't set their own key |
| `ANTHROPIC_API_KEY` + `ENABLE_LLM_CALLS=true` | Same as above for Claude |
| `SAM_GOV_API_KEY` | Free key from open.gsa.gov; without it, all federal scraper subscriptions fail loudly with a clear message |

## Bid pipeline (pass-12+)

The platform watches federal + SE construction procurement portals and
auto-drafts bids on listings that match each tenant's bid profile.

- 234-portal catalog (`prisma/portal-catalog*.ts`) — federal +
  AL/AR/FL/GA/KY/LA/MS/NC/SC/TN/VA/WV state procurement, DOTs, top
  counties + cities, port + transit authorities, USACE districts,
  NAVFAC SE/Mid-Atl, NASA centers, VA VISNs, AF bases, Army posts.
- 4 working scrapers in `src/lib/scrapers/` (sam-gov, generic-html,
  generic-rss, defense-news). Catalog rows that don't have a real
  scraper are explicitly marked `MANUAL` — the system never
  fabricates listings.
- `/admin/portal-coverage` shows scraper status across all 234 rows;
  weekly `/api/cron/verify-portals` refreshes URL telemetry.
- `/bids/portfolio` for BD pipeline overview;
  `/bids/listings/[id]` for full detail with score breakdown bars.

## Cron endpoints (bearer `CRON_SECRET`)

| Endpoint | Cadence | Purpose |
| --- | --- | --- |
| `/api/cron/backup` | daily | Per-tenant JSON dump + integrity check + OneDrive sync |
| `/api/cron/rfp-sweep` | daily 6× | Sweep all RfpSources, score listings, fire auto-draft |
| `/api/cron/verify-portals` | weekly | Refresh portal-coverage telemetry |
| `/api/cron/audit-prune` | monthly | Delete AuditEvent rows >365 days old (50k circuit breaker) |
| `/api/cron/alert-scan` | hourly | Generate AlertEvent rows from current state |

Register on Windows via the PowerShell scripts in `scripts/`:
`register-backup-task.ps1`, `register-portal-verify-task.ps1`.

## Microsoft 365 + QuickBooks Online integrations (2026-06)

Both live on **Settings → Integrations** (admin-only) with full setup
instructions, graceful degrade when unconfigured, and audit events on every
mutation. Details: `docs/integrations.md`.

- **Microsoft 365 (Graph, app-only)** — `MS_TENANT_ID` / `MS_CLIENT_ID` /
  `MS_CLIENT_SECRET` / `MS_SENDER_UPN`. Adds `EMAIL_TRANSPORT=m365` (Graph
  `sendMail`) as a selectable transactional-email transport (existing
  transports unchanged) and an idempotent "Add due date to M365 calendar"
  action on pay applications (`M365CalendarEventLink` mapping). The Azure
  app registration needs application permissions `Mail.Send` +
  `Calendars.ReadWrite` with admin consent. Admin test-send button on the
  settings page.
- **QuickBooks Online (real OAuth2)** — `QBO_CLIENT_ID` / `QBO_CLIENT_SECRET`
  / `QBO_ENVIRONMENT`; redirect URI
  `https://bcon.jahdev.com/api/integrations/qbo/callback` (from `APP_URL`).
  Tokens encrypted at rest via the per-tenant vault. Sync: customers ↔ QBO
  Customers, APPROVED pay apps → QBO Invoices (idempotent by stored
  `qboInvoiceId`), payment status + AR aging pulled back with downgrade
  guards (VOIDED never flips workflow status; PAID is never downgraded).
  QBO-hosted online-payment links surface on synced pay apps — payments
  always run through the accounting system, never a direct in-app charge.
  Sync history (`IntegrationSyncJob`) renders on the settings page. The old
  demo connector remains only while env keys are unset (clearly labeled).

## Customer onboarding

`docs/onboarding-checklist.md` is the playbook. Section 7 covers the
pass-12+ flow (per-tenant LLM key, bid profile, portal subscriptions,
SAM.gov key, first sweep, auto-draft policy).

## Test gates

```bash
npx tsc --noEmit             # type checks (must be 0 errors)
npx vitest run               # unit + integration tests (82 passing)
npx tsx prisma/seed-portals.ts   # idempotent catalog refresh smoke check
```

GitHub Actions CI runs all three on push/PR (`.github/workflows/ci.yml`).

## What's new (2026-05 maturity sprint)

Construction depth:
- **Drawing register + revisions + markup** — DrawingRevision model
  with supersession + delta reasons; DrawingMarkup geometric
  annotations layer.
- **RFI routing chain** — sequential reviewer chain via RfiReviewer +
  full response history via RfiResponse + drawing-pin spatial
  context via RfiDrawingPin. Cost + schedule impact captured in
  the response.
- **Submittal workflow** — SubmittalReviewer + SubmittalCycle for
  proper resubmittal cycle audit.
- **Photo library** — ProjectPhoto with EXIF capture metadata,
  AI-tag JSON, ProjectPhotoAlbum + ProjectPhotoPin (link to drawing
  sheet). Mobile upload page with capture=environment.
- **Quality / NCR** — QualityChecklistTemplate per trade,
  NonConformanceReport with category/severity/disposition/root
  cause/auto-RFI link.
- **Safety expansion** — SafetyToolboxTalk, JobHazardAnalysis,
  SafetyObservation; SafetyIncident gains OSHA classification +
  case number + days-away/restricted counts.
- **Permit prerequisites** — PermitPrerequisite chain, ContractorLicense.
- **Closeout package** — CloseoutPackage with checklist completeness +
  warranty start/end + owner acceptance.
- **Document expiry + transmittals** — Document.expiresAt +
  DocumentTransmittal log.

Financial maturity:
- **3-way match** — PurchaseOrderLine + PurchaseOrderReceipt +
  PurchaseOrderReceiptLine + SubInvoiceLine + SubInvoice.matchStatus.
- **Sub CO carry-down** — ChangeOrder.parentChangeOrderId + vendorId,
  labor/material/equipment/sub/OHP split.
- **Period close** — AccountingPeriod state machine + AdjustingEntry
  for accruals/reversals.
- **Balance sheet snapshots** — BalanceSheetSnapshot with construction-
  specific lines (retainage receivable, costs/billings in excess).
- **Cash flow** — CashFlowForecast (rolling 13-week) +
  CashFlowStatement (period statement).
- **Cost codes** — CostCode hierarchical chart of accounts with
  CSI MasterFormat alignment; seed of 25 standard divisions.
- **Lien waiver depth** — sub-tier chain, statutory form state,
  notarization, conditional release tied to subInvoice.
- **Multi-BU consolidation** — BusinessUnit gains legal entity +
  fiscal year + base currency; ConsolidatedReport rollup.
- **Payroll + certified payroll** — Employee, PayrollRun,
  PayrollRunLine, CertifiedPayrollRecord (Davis-Bacon WH-347 shape).
- **Fleet** — FleetAsset + FleetAssignment + FleetMaintenance with
  internal rental rates for charge-back.
- **1099** — Vendor1099Record annual aggregate per vendor.
- **Vendor prequalification** — VendorPrequalification + VendorReference
  with scoring + qualified value range.

Reports + APIs:
- 7 reports (`/reports`): WIP, cost-to-complete, margin fade, win
  rate, estimate accuracy, resource heatmap, bonding capacity. CSV
  export at `/api/reports/[name]?format=csv`.
- Public REST API at `/api/v1/*` — projects, listings, RFIs (read +
  write). Token auth via `Authorization: Bearer bcon_…`.
- Outbound webhooks via WebhookEndpoint + dispatchWebhook with
  HMAC-SHA256 signatures.
- OpenAPI 3.1 spec at `/api/v1/openapi`.
- Bid leveling matrix at `/projects/[id]/bids/[pkgId]/leveling`.
- Capital programs admin at `/admin/capital-programs`.
- Pull-planning / look-ahead at `/projects/[id]/look-ahead`.

Auth + security:
- TOTP MFA (RFC 6238, no deps) — `src/lib/totp.ts`.
- SSO scaffold — Okta / Azure AD / Google / Auth0 via env-gated
  NextAuth providers (`src/lib/sso-providers.ts`).
- Session revocation — User.sessionsRevokedAt timestamp.

Infrastructure:
- S3 / R2 storage adapter with pure-fetch SigV4 (no AWS SDK).
- Email transport — Resend / SendGrid / SMTP.
- SSE real-time updates — `/api/sse?topic=…`.
- Structured logging via `src/lib/log.ts` with optional Sentry
  transport.
- Zod runtime validation for JSON columns (`src/lib/json-schema.ts`).
- Audit-event triggers — UPDATE blocked at the SQL level;
  BCON_AUDIT_IMMUTABLE=true also blocks DELETE.
- PWA manifest + service worker with offline-outbox queue for
  field crews on bad networks.
- Dependabot + npm audit + CycloneDX SBOM in CI.

Tenant operations:
- API tokens + webhooks UI at `/settings/api`.
- Guest accounts at `/settings/guests` (free magic-link seats for
  owner / architect / inspector / sub).
- Per-tenant currency + locale.

## Demo login users

- `trey@velocitychs.com` — Trey (super-admin, can switch tenants and access `/admin/*`) — password `hadleymaris`
- `e@braetr.com` — Eric Bowman (super-admin) — password `Braetr123!`
- `exec@construction.local` — Elena Executive — password `demo1234`
- `pm@construction.local` — Paula PM — password `demo1234`
- `super@construction.local` — Sam Superintendent — password `demo1234`

## Important files

- `prisma/schema.prisma` — core multi-tenant domain model
- `prisma/seed.ts` — demo tenant, projects, workflows, budgets, RFIs, production, tickets
- `src/lib/dashboard.ts` — aggregate data loader and mode-aware dashboard shaping
- `src/app/page.tsx` — enterprise dashboard UI with Simple / Vertical / Heavy Civil cards
- `docs/architecture.md` — implementation architecture
- `docs/data-model.md` — ERD-style model notes
- `docs/implementation-plan.md` — phased build plan

## Notes

- Local dev uses SQLite to make the repo immediately runnable.
- Production should migrate to Postgres and object storage. The header of
  `prisma/schema.prisma` and `src/lib/prisma.ts` document the required
  steps; `docs/pass-audit-07.md` §1.2 lists every Float currency field that
  must convert to Decimal in the same migration.
- This is intentionally a strong MVP foundation / vertical slice, not a
  fully complete Procore replacement in one commit.

## Audit history

`docs/pass-audit-01.md` through `pass-audit-07.md` contain the audit
trail for the platform. Pass 7 (2026-05-01) added the auth, middleware,
role guards, audit-emission, indexes, dashboard refactor, workflow
materialization, notification dispatcher, and UI theming work present
at HEAD. See pass-audit-07.md §7 for the prioritized PR sequence.
