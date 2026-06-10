# Integrations — configuration reference

Every external integration in bcon is **env-gated and fail-closed**: it is
disabled until the operator sets the required environment variables in `.env`
and restarts the `bcon-next` service. Nothing sends, signs, or syncs by
accident. Current status for a deployment is visible (to tenant admins) at
**Settings → Integrations → Platform integrations**.

| Integration | Gate | Code |
|---|---|---|
| SSO (Okta / Azure AD / Google / Auth0) | per-provider client id+secret | `src/lib/sso-providers.ts` |
| Object storage (S3 / R2) | `STORAGE_TRANSPORT` + `STORAGE_S3_*` | `src/lib/storage.ts` |
| Transactional email (Resend / SendGrid) | `EMAIL_TRANSPORT` + key | `src/lib/email.ts` |
| Background queue | `QUEUE_TRANSPORT` | `src/lib/queue.ts` |
| E-signature (DocuSign) | `ESIGN_PROVIDER` + `DOCUSIGN_*` | `src/lib/esign.ts` |
| Site maps (Google Embed) | `GOOGLE_MAPS_EMBED_API_KEY` (link works keyless) | `src/lib/maps.ts` |
| AI / LLM | `ENABLE_LLM_CALLS=true` + provider key (or per-tenant keys) | `src/lib/ai.ts` |
| Xero / QuickBooks | **demo/simulation only** — see below | `src/lib/{xero,qbo}-sync.ts` |

---

## SSO

Each provider activates independently when all of its vars are present.
Accounts are **never auto-created from SSO** — the identity's email must match
an existing, active, provisioned user (same access policy as password logins).
Sign-in buttons appear on `/login` automatically for active providers.

The OAuth callback URL for every provider is:
`https://bcon.jahdev.com/api/auth/callback/<provider-id>`

### Okta (`okta`)
- `OKTA_CLIENT_ID`, `OKTA_CLIENT_SECRET` — from an Okta "Web" OIDC app.
- `OKTA_ISSUER` — e.g. `https://<org>.okta.com/oauth2/default`.

### Azure AD / Entra ID (`azure-ad`)
- `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET` — App registration → Certificates & secrets.
- `AZURE_AD_TENANT_ID` — Directory (tenant) id. Issuer is derived:
  `https://login.microsoftonline.com/<tenant>/v2.0`.

### Google Workspace (`google`)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — GCP OAuth consent + Web client.

### Auth0 (`auth0`)
- `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_ISSUER` (`https://<tenant>.auth0.com`).

---

## Object storage (S3 / Cloudflare R2)

Default `STORAGE_TRANSPORT=local` writes to `./uploads/` (single-host
deployments). For durable cloud storage:

```
STORAGE_TRANSPORT=s3            # or r2
STORAGE_S3_BUCKET=bcon-artifacts
STORAGE_S3_REGION=us-east-1     # R2: auto
STORAGE_S3_ENDPOINT=            # R2: https://<account-id>.r2.cloudflarestorage.com
STORAGE_S3_ACCESS_KEY=...
STORAGE_S3_SECRET_KEY=...
STORAGE_S3_PUBLIC_URL=          # optional CDN host
```

No AWS SDK is required — a built-in SigV4 fetch client handles put/get/
delete/presign (`src/lib/sigv4.ts`, tested against AWS test vectors).

**Fail-closed:** in production, selecting `s3`/`r2` with missing vars refuses
to boot with an error naming the missing variables. The old behaviour
(silent local-disk fallback) hid a data-integrity hazard: artifacts looked
"stored" but lived on the app host's disk.

Credentials needed from the operator: an S3 bucket + IAM key pair (or an R2
bucket + API token) with object read/write on that bucket only.

---

## Transactional email

`EMAIL_TRANSPORT=log` (default) logs messages instead of sending — safe for
dev and for testing flows without spamming anyone. Real transports:

```
EMAIL_TRANSPORT=resend     # + RESEND_API_KEY
EMAIL_TRANSPORT=sendgrid   # + SENDGRID_API_KEY
EMAIL_FROM=no-reply@bcon.jahdev.com
```

- The sender domain must be verified with the provider before mail will leave.
- **Never send from `braetr.com`** — that domain belongs to a different app's
  Resend account. bcon needs its own verified domain (e.g. `bcon.jahdev.com`)
  before `EMAIL_TRANSPORT=resend` goes live.
- `sendEmail()` never throws; failures return `{ ok:false }` and log a warning.
- SMTP is stubbed (`{ ok:false }`) until someone actually needs it (requires
  nodemailer).

Credentials needed: a Resend (or SendGrid) API key + DNS records to verify a
bcon-owned sender domain.

---

## Background queue

`QUEUE_TRANSPORT=in-process` (default) runs jobs inline on this host — correct
for the current single-instance NSSM deployment. `bullmq`/`inngest` are
recognized but **not implemented**; selecting one in production fails the boot
with instructions rather than pretending jobs are durable. Implementing bullmq
requires `npm i bullmq ioredis` + a Redis instance.

---

## E-signature (DocuSign) — pay applications

Pay applications (AIA G702) and contracts need owner/architect signatures.
The pay-app detail page exposes **Send for signature** (manager-only, on
SUBMITTED / PENDING_APPROVAL / APPROVED apps). The envelope id is recorded on
the pay app's activity trail and audit log.

Disabled state: without configuration the page shows how to enable it and the
API returns `503` with the missing var names. Setup (JWT grant — server to
server, no per-user OAuth):

1. Create a DocuSign developer account → Apps & Keys → add an app.
2. Generate an RSA keypair for the app; keep the private key.
3. Grant one-time consent for the impersonated user (open
   `https://account-d.docusign.com/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=<integration-key>&redirect_uri=<any registered URI>`
   once and approve).
4. Set:

```
ESIGN_PROVIDER=docusign
DOCUSIGN_BASE_URL=https://demo.docusign.net/restapi   # prod: your na*.docusign.net base
DOCUSIGN_OAUTH_HOST=account-d.docusign.com            # prod: account.docusign.com
DOCUSIGN_ACCOUNT_ID=<API account id>
DOCUSIGN_INTEGRATION_KEY=<integration key>
DOCUSIGN_USER_ID=<impersonated user GUID>
DOCUSIGN_PRIVATE_KEY=<RSA private key PEM (\n-escaped one-liner is fine)>
```

Credentials needed: a DocuSign account (demo is free), integration key, RSA
private key, account + user GUIDs.

---

## Site maps

- **No key needed:** every project with an address gets a "Map ↗" link
  (opens Google Maps in a new tab; the user's browser resolves it — no
  server-side geocoding, no PII egress).
- **Optional embed:** set `GOOGLE_MAPS_EMBED_API_KEY` (Maps Embed API key,
  referrer-restricted, free tier) to render an inline site map on the project
  overview page.

---

## Accounting (Xero / QuickBooks Online) — DEMO ONLY

The connectors at Settings → Integrations are an honest **simulation**:
"Connect" writes placeholder tokens and "Sync" generates deterministic seed
journals/P&L locally. No real OAuth, no real API calls. The settings page
says this prominently.

**Future direction for invoicing/payments:** Xero is the accounting system of
record across this portfolio. When bcon grows owner-facing invoicing, the
path is a real Xero OAuth2 connection that surfaces **Xero invoice "Pay now"
links** — never a direct in-app charge (no Stripe charging from bcon). Pay
applications remain the construction-side billing artifact; cash collection
belongs to Xero.

---

## Jurisdiction portal scrapers

The permit-portal scrapers under `src/lib/scrapers/` produce clearly-labeled
demo data for portals that need authenticated sessions; HTML scrapers that can
run honestly do. Verification status per portal is on `/admin/portal-coverage`.
