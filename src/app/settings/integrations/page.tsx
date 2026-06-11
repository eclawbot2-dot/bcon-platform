import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { SortableTable } from "@/components/SortableTable";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { currentActor, isAdminRole } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils";
import { esignStatus } from "@/lib/esign";
import { ssoProviderStatus } from "@/lib/sso-providers";
import { m365Status, M365_REQUIRED_APP_PERMISSIONS } from "@/lib/m365";
import { qboStatusForSettings, readArAgingSnapshot } from "@/lib/integrations/qbo";
import { recentSyncJobs } from "@/lib/integrations/sync-job";
import type { XeroConnection, QboConnection } from "@prisma/client";

/**
 * Settings → Integrations — admin-only, per-tenant.
 *
 *  - Microsoft 365 (Graph, app-only): outbound mail transport
 *    (EMAIL_TRANSPORT=m365) + calendar events for pay-app due dates.
 *    Deployment-wide env config; this page shows status + setup steps and
 *    offers an admin test send.
 *  - QuickBooks Online: REAL OAuth2 connector (when QBO_CLIENT_ID/SECRET
 *    are set) — tokens encrypted at rest via the per-tenant vault; sync
 *    routines push APPROVED pay applications as QBO invoices, pull payment
 *    status + AR aging back, and link customers. Without env keys the
 *    legacy DEMO connector remains available (clearly labeled).
 *  - Xero: still the DEMO / simulation connector (clearly labeled).
 *
 * Gating: requireTenant() resolves the caller's OWN tenant; non-admins get
 * a 404 via notFound(). Mutation routes re-check admin/manager on POST.
 */
export const dynamic = "force-dynamic";

export default async function IntegrationsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const tenant = await requireTenant();
  const actor = await currentActor(tenant.id);
  if (!isAdminRole(actor.role)) notFound();
  const params = await searchParams;

  const [xero, qbo, qboJobs] = await Promise.all([
    prisma.xeroConnection.findUnique({ where: { tenantId: tenant.id } }),
    prisma.qboConnection.findUnique({ where: { tenantId: tenant.id } }),
    recentSyncJobs(tenant.id, "qbo", 15),
  ]);
  const m365 = m365Status();
  const qboEnv = qboStatusForSettings();
  const emailTransport = (process.env.EMAIL_TRANSPORT ?? "log").toLowerCase();

  return (
    <AppLayout
      eyebrow="Settings · Integrations"
      title="Integrations"
      description="Microsoft 365 (Graph mail + calendar), QuickBooks Online (real OAuth sync), and the legacy demo accounting connectors. Admin-only."
    >
      <div className="grid gap-6">
        <FeedbackBanner params={params} />

        <M365Section status={m365} emailTransport={emailTransport} />

        {qboEnv.configured ? (
          <QboRealSection env={qboEnv} conn={qbo} />
        ) : (
          <QboUnconfiguredSection env={qboEnv} />
        )}

        {(qboJobs.length > 0 || qboEnv.configured) ? <SyncHistorySection jobs={qboJobs} /> : null}

        {/* Demo connectors — honest labeling. QBO demo only shows when the
            real integration is not configured. */}
        <section className="card border border-amber-500/40 bg-amber-500/5 p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-amber-300">Demo / simulation connectors</div>
          <p className="mt-2 text-sm text-amber-100/90">
            The <strong>Xero</strong> connector below {qboEnv.configured ? "is" : <>and the <strong>QuickBooks Online demo</strong> connector are</>} a{" "}
            <strong>demo / simulation</strong> — &quot;Connect&quot; writes placeholder credentials and &quot;Sync&quot; generates deterministic seed
            journal entries + P&amp;L snapshots locally so downstream finance reports have data to render. No real accounting
            organization is contacted.
            {qboEnv.configured ? (
              <> The QuickBooks Online integration above is <strong>real</strong> (OAuth2 + API sync) and replaces the old QBO demo.</>
            ) : (
              <> To enable the REAL QuickBooks Online integration, configure the env keys shown in the QuickBooks section above.</>
            )}
          </p>
        </section>

        <ConnectorCard
          name="Xero"
          accent="cyan"
          connectAction="/api/xero/connect"
          org={xero?.organizationName ?? null}
          status={xero?.status ?? "DISCONNECTED"}
          orgIdLabel="Xero tenant id"
          orgId={xero?.xeroTenantId ?? null}
          connectedAt={xero?.connectedAt ?? null}
          lastSyncedAt={xero?.lastSyncedAt ?? null}
          lastSyncNote={xero?.lastSyncNote ?? null}
          conn={xero}
        />

        {!qboEnv.configured ? (
          <ConnectorCard
            name="QuickBooks Online"
            accent="emerald"
            connectAction="/api/qbo/connect"
            org={qbo?.organizationName ?? null}
            status={qbo?.status ?? "DISCONNECTED"}
            orgIdLabel="QBO realm id"
            orgId={qbo?.realmId ? `${qbo.realmId} · ${qbo.environment}` : null}
            connectedAt={qbo?.connectedAt ?? null}
            lastSyncedAt={qbo?.lastSyncedAt ?? null}
            lastSyncNote={qbo?.lastSyncNote ?? null}
            conn={qbo}
          />
        ) : null}

        <PlatformIntegrations />
      </div>
    </AppLayout>
  );
}

/** One-shot feedback from the OAuth callback / test-send redirects. */
function FeedbackBanner({ params }: { params: Record<string, string | string[] | undefined> }) {
  const qbo = typeof params.qbo === "string" ? params.qbo : null;
  const m365 = typeof params.m365 === "string" ? params.m365 : null;
  const detail = typeof params.detail === "string" ? params.detail : null;
  const reason = typeof params.reason === "string" ? params.reason : null;

  let text: string | null = null;
  let good = false;
  if (qbo === "connected") { text = "QuickBooks Online connected — tokens stored encrypted for this tenant."; good = true; }
  else if (qbo === "disconnected") text = "QuickBooks Online disconnected. Encrypted tokens were cleared.";
  else if (qbo === "error") text = `QuickBooks Online connection failed${reason ? `: ${reason}` : ""}.`;
  else if (qbo === "not-configured") text = "QuickBooks Online env keys are not configured on this deployment.";
  else if (qbo === "missing-app-url") text = "APP_URL is not set — cannot build the OAuth redirect URI.";
  else if (m365 === "sent") { text = `Microsoft 365 test message sent${detail ? ` to ${detail}` : ""}.`; good = true; }
  else if (m365 === "send-failed") text = `Microsoft 365 test send failed${detail ? `: ${detail}` : ""}.`;
  else if (m365 === "not-configured") text = "Microsoft 365 env vars are not configured on this deployment.";
  else if (m365 === "no-recipient") text = "No recipient — your account has no email address; enter one in the test-send field.";
  if (!text) return null;

  return (
    <div className={`card border p-4 text-sm ${good ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-rose-500/40 bg-rose-500/10 text-rose-200"}`}>
      {text}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Microsoft 365 (Graph)
// ---------------------------------------------------------------------------

function M365Section({
  status,
  emailTransport,
}: {
  status: ReturnType<typeof m365Status>;
  emailTransport: string;
}) {
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-sky-300">Microsoft 365 (Graph)</div>
          <div className="mt-1 text-lg font-semibold text-white">Outbound mail + calendar</div>
          <div className="mt-1 text-sm">
            Status:{" "}
            {status.configured ? (
              <span className="text-emerald-300">● Configured (app-only client credentials)</span>
            ) : (
              <span className="text-slate-400">○ Not configured</span>
            )}
          </div>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-[180px_1fr] gap-y-2 text-sm">
        <dt className="text-slate-500">Azure tenant id</dt>
        <dd className="font-mono text-xs text-slate-300">{status.tenantIdMasked}</dd>
        <dt className="text-slate-500">Client id</dt>
        <dd className="font-mono text-xs text-slate-300">{status.clientIdMasked}</dd>
        <dt className="text-slate-500">Sender mailbox</dt>
        <dd className="font-mono text-xs text-slate-300">{status.senderUpn ?? "—"}</dd>
        <dt className="text-slate-500">Email transport</dt>
        <dd className="text-slate-300">
          {emailTransport === "m365" ? (
            <span className="text-emerald-300">EMAIL_TRANSPORT=m365 — transactional email goes through Graph</span>
          ) : (
            <span className="text-slate-400">
              current transport is <span className="font-mono">{emailTransport}</span>
              {status.configured ? " — set EMAIL_TRANSPORT=m365 to switch sends to Graph" : ""}
            </span>
          )}
        </dd>
        <dt className="text-slate-500">Calendar use</dt>
        <dd className="text-slate-300">
          {status.configured
            ? <>Pay applications offer “Add due date to M365 calendar” (events on {status.senderUpn})</>
            : <span className="text-slate-400">unavailable until configured</span>}
        </dd>
      </dl>

      {status.configured ? (
        <form action="/api/integrations/m365/test-send" method="post" className="mt-4 flex flex-wrap items-end gap-2 border-t border-white/10 pt-4">
          <div>
            <label className="form-label">Test-send recipient (defaults to your account email)</label>
            <input name="to" type="email" placeholder="you@example.com" className="form-input" />
          </div>
          <button className="btn-primary text-xs">Send test email via Graph</button>
        </form>
      ) : (
        <div className="mt-4 border-t border-white/10 pt-4 text-xs text-slate-400">
          <div className="text-slate-300">Setup (one-time, Microsoft 365 admin):</div>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Entra admin center → App registrations → <em>New registration</em> (single-tenant).</li>
            <li>
              API permissions → Add → Microsoft Graph → <strong>Application</strong> permissions:{" "}
              {M365_REQUIRED_APP_PERMISSIONS.map((p) => <code key={p} className="font-mono mr-1">{p}</code>)}
              → <em>Grant admin consent</em>.
            </li>
            <li>Certificates &amp; secrets → New client secret → copy the secret <em>value</em>.</li>
            <li>
              Set env vars and restart:{" "}
              <code className="font-mono">MS_TENANT_ID</code>, <code className="font-mono">MS_CLIENT_ID</code>,{" "}
              <code className="font-mono">MS_CLIENT_SECRET</code>, <code className="font-mono">MS_SENDER_UPN</code>{" "}
              (a real licensed mailbox, e.g. <span className="font-mono">no-reply@yourdomain.com</span>).
            </li>
            <li>Optionally set <code className="font-mono">EMAIL_TRANSPORT=m365</code> to route all transactional email through Graph.</li>
          </ol>
          <div className="mt-2">
            Missing: <span className="font-mono text-amber-300">{status.missing.join(", ")}</span>. See{" "}
            <span className="font-mono">docs/integrations.md</span> · <span className="font-mono">.env.example</span>.
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// QuickBooks Online — REAL integration
// ---------------------------------------------------------------------------

function QboUnconfiguredSection({ env }: { env: ReturnType<typeof qboStatusForSettings> }) {
  return (
    <section className="card p-5">
      <div className="text-xs uppercase tracking-[0.2em] text-emerald-300">QuickBooks Online (real integration)</div>
      <div className="mt-1 text-lg font-semibold text-white">Not configured</div>
      <p className="mt-2 text-sm text-slate-400">
        With Intuit app keys configured, bcon connects to QuickBooks Online via OAuth2: customers are linked both ways,
        APPROVED pay applications are pushed as QBO invoices (with QBO-hosted online payment links), and payment status +
        AR aging are pulled back. Tokens are stored encrypted at rest with the per-tenant vault.
      </p>
      <div className="mt-4 border-t border-white/10 pt-4 text-xs text-slate-400">
        <div className="text-slate-300">Setup (one-time, platform operator):</div>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Create an app at <span className="font-mono">developer.intuit.com</span> (QuickBooks Online Accounting scope).</li>
          <li>
            Add the redirect URI exactly:{" "}
            <code className="font-mono text-sky-300">{env.redirectUri ?? "<set APP_URL first>"}</code>
          </li>
          <li>
            Set env vars and restart: <code className="font-mono">QBO_CLIENT_ID</code>,{" "}
            <code className="font-mono">QBO_CLIENT_SECRET</code>, <code className="font-mono">QBO_ENVIRONMENT</code>{" "}
            (<span className="font-mono">sandbox</span> or <span className="font-mono">production</span>), optional{" "}
            <code className="font-mono">QBO_ITEM_ID</code> (invoice line item, default 1).
          </li>
          <li>Return here and click <em>Connect QuickBooks Online</em>.</li>
        </ol>
        <div className="mt-2">
          Missing: <span className="font-mono text-amber-300">{env.missing.join(", ")}</span>. See{" "}
          <span className="font-mono">docs/integrations.md</span> · <span className="font-mono">.env.example</span>.
          Until configured, the legacy demo connector below remains available.
        </div>
      </div>
    </section>
  );
}

function QboRealSection({ env, conn }: { env: ReturnType<typeof qboStatusForSettings>; conn: QboConnection | null }) {
  const connected = conn?.status === "CONNECTED";
  const aging = readArAgingSnapshot(conn?.arAgingJson);

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-emerald-300">QuickBooks Online (real integration)</div>
          <div className="mt-1 text-lg font-semibold text-white">{conn?.organizationName ?? "Not connected"}</div>
          <div className="mt-1 text-sm">
            Status:{" "}
            {connected ? (
              <span className="text-emerald-300">● Connected</span>
            ) : conn?.status === "EXPIRED" ? (
              <span className="text-amber-300">○ Expired — reconnect required</span>
            ) : conn?.status === "ERROR" ? (
              <span className="text-rose-300">○ Error</span>
            ) : (
              <span className="text-slate-400">○ Not connected</span>
            )}
          </div>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-[180px_1fr] gap-y-2 text-sm">
        <dt className="text-slate-500">Intuit client id</dt>
        <dd className="font-mono text-xs text-slate-300">{env.clientIdMasked}</dd>
        <dt className="text-slate-500">Environment</dt>
        <dd className="font-mono text-xs text-slate-300">{env.environment}</dd>
        <dt className="text-slate-500">Realm id</dt>
        <dd className="font-mono text-xs break-all text-slate-300">{conn?.realmId ?? "—"}</dd>
        <dt className="text-slate-500">Redirect URI</dt>
        <dd className="font-mono text-xs break-all text-slate-300">{env.redirectUri ?? "— (set APP_URL)"}</dd>
        <dt className="text-slate-500">Connected at</dt>
        <dd className="text-slate-300">{conn?.connectedAt ? formatDateTime(conn.connectedAt) : "—"}</dd>
        <dt className="text-slate-500">Last sync</dt>
        <dd className="text-slate-300">{conn?.lastSyncedAt ? formatDateTime(conn.lastSyncedAt) : "—"}</dd>
        {conn?.lastSyncNote ? (
          <>
            <dt className="text-slate-500">Last note</dt>
            <dd className="text-slate-400 break-words">{conn.lastSyncNote}</dd>
          </>
        ) : null}
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
        <form action="/api/integrations/qbo/authorize" method="post" className="inline">
          <button className="btn-primary text-xs">{connected ? "Reconnect" : "Connect QuickBooks Online"}</button>
        </form>
        {connected ? (
          <>
            {([
              ["customers", "Sync customers"],
              ["invoices-push", "Push approved pay apps"],
              ["invoices-pull", "Pull payment status"],
              ["ar-aging", "Pull AR aging"],
              ["all", "Sync all"],
            ] as const).map(([kind, label]) => (
              <form key={kind} action="/api/integrations/qbo/sync" method="post" className="inline">
                <input type="hidden" name="kind" value={kind} />
                <button className="btn-outline text-xs">{label}</button>
              </form>
            ))}
            <ConfirmForm
              action="/api/integrations/qbo/disconnect"
              message="Disconnect QuickBooks Online for this tenant? The encrypted tokens are cleared; synced data and QBO invoice links on pay applications are left in place."
              className="inline"
            >
              <button className="btn-outline text-xs text-rose-300">Disconnect</button>
            </ConfirmForm>
          </>
        ) : null}
      </div>

      <p className="mt-3 text-[11px] text-slate-500">
        Push: APPROVED pay applications become QBO invoices (idempotent — each app stores its QBO invoice id; nothing is
        pushed twice). Pull: payment status maps back with guards — a QBO-paid invoice promotes only an APPROVED app to
        PAID, voided invoices never change workflow status, and a locally-PAID app is never downgraded. Payment links on
        pay apps are the QBO-hosted online invoice links (payments always run through the accounting system).
      </p>

      {aging ? (
        <div className="mt-4 border-t border-white/10 pt-4">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
            AR aging (from QBO{conn?.arAgingAt ? ` · pulled ${formatDateTime(conn.arAgingAt)}` : ""})
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {aging.buckets.map((b) => (
              <div key={b.label} className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="text-[11px] text-slate-400">{b.label}</div>
                <div className="mt-1 font-semibold text-white">${b.total.toLocaleString()}</div>
              </div>
            ))}
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
              <div className="text-[11px] text-emerald-300">Total AR</div>
              <div className="mt-1 font-semibold text-white">${aging.total.toLocaleString()}</div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SyncHistorySection({
  jobs,
}: {
  jobs: Array<{ id: string; kind: string; status: string; recordsRead: number; recordsWritten: number; error: string | null; startedAt: Date; completedAt: Date | null }>;
}) {
  return (
    <section className="card p-5">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">QuickBooks sync history</div>
      <div className="mt-3">
        <SortableTable
          className="min-w-full text-sm"
          emptyMessage="No sync runs yet — connect QuickBooks and run a sync."
          columns={[{ header: "Started" }, { header: "Kind" }, { header: "Status" }, { header: "Read" }, { header: "Written" }, { header: "Note / error" }]}
          rows={jobs.map((j) => ({
            key: j.id,
            cells: [
              { sort: j.startedAt.getTime(), node: formatDateTime(j.startedAt), tdClassName: "text-xs text-slate-400 whitespace-nowrap" },
              { sort: j.kind, node: <span className="font-mono text-xs">{j.kind}</span> },
              {
                sort: j.status,
                node: (
                  <span className={`rounded-full border px-2 py-0.5 text-xs ${
                    j.status === "OK" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : j.status === "FAILED" ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                    : j.status === "PARTIAL" ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                    : "border-white/10 bg-white/5 text-slate-400"
                  }`}>
                    {j.status}
                  </span>
                ),
              },
              { sort: j.recordsRead, node: j.recordsRead },
              { sort: j.recordsWritten, node: j.recordsWritten },
              { sort: j.error ?? "", node: j.error ?? "—", tdClassName: "text-xs text-slate-400 break-words" },
            ],
          }))}
        />
      </div>
    </section>
  );
}

/**
 * Deployment-level integration status — env-gated transports that apply to
 * every tenant on this host. Reports configured/disabled per integration
 * and which env vars activate it. Never shows secret values; the platform
 * operator (not the tenant admin) sets these in .env + restarts.
 */
function PlatformIntegrations() {
  const esign = esignStatus();
  const sso = ssoProviderStatus();
  const emailTransport = (process.env.EMAIL_TRANSPORT ?? "log").toLowerCase();
  const storageTransport = (process.env.STORAGE_TRANSPORT ?? "local").toLowerCase();
  const queueTransport = (process.env.QUEUE_TRANSPORT ?? "in-process").toLowerCase();
  const llmEnabled = process.env.ENABLE_LLM_CALLS === "true";

  const rows: Array<{ name: string; state: string; ok: boolean; detail: string }> = [
    {
      name: "Transactional email",
      state: emailTransport === "log" ? "log-only (no real sends)" : emailTransport,
      ok: emailTransport !== "log",
      detail: "EMAIL_TRANSPORT=resend|sendgrid|m365 + provider credentials (m365 uses the MS_* vars above)",
    },
    {
      name: "Object storage",
      state: storageTransport,
      ok: true,
      detail: storageTransport === "local" ? "Local disk (./uploads). For durable cloud storage: STORAGE_TRANSPORT=s3|r2 + STORAGE_S3_*" : "STORAGE_S3_* configured",
    },
    {
      name: "Background queue",
      state: queueTransport,
      ok: true,
      detail: queueTransport === "in-process" ? "Jobs run inline on this host (fine for single-instance)" : "External queue",
    },
    {
      name: "E-signature (pay apps)",
      state: esign.configured ? `active (${esign.provider})` : "disabled",
      ok: esign.configured,
      detail: esign.configured ? "DocuSign envelopes available on pay applications" : `Set ${esign.missing.slice(0, 3).join(", ")}${esign.missing.length > 3 ? ", …" : ""} (docs/integrations.md)`,
    },
    {
      name: "AI / LLM calls",
      state: llmEnabled ? "enabled" : "deterministic mocks",
      ok: llmEnabled,
      detail: "ENABLE_LLM_CALLS=true + OPENAI_API_KEY or ANTHROPIC_API_KEY (or per-tenant keys in Settings)",
    },
    ...sso.map((p) => ({
      name: `SSO · ${p.label}`,
      state: p.active ? "active" : "disabled",
      ok: p.active,
      detail: p.active ? `/api/auth/signin/${p.id}` : `Set ${p.envVars.join(", ")}`,
    })),
  ];

  return (
    <section className="card p-5">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Platform integrations (deployment-wide, env-gated)</div>
      <p className="mt-2 text-xs text-slate-500">
        These apply to every tenant on this deployment and are configured by the platform operator via environment
        variables (see <span className="font-mono">docs/integrations.md</span> and <span className="font-mono">.env.example</span>), then a service restart.
      </p>
      <div className="mt-4">
        <SortableTable
          className="min-w-full text-sm"
          emptyMessage="No integrations detected."
          columns={[
            { header: "Integration" },
            { header: "Status" },
            { header: "How to enable / notes" },
          ]}
          rows={rows.map((r) => ({
            key: r.name,
            cells: [
              { sort: r.name, node: r.name, tdClassName: "text-slate-200" },
              {
                // Configured integrations sort ahead of disabled ones, then by state label.
                sort: `${r.ok ? "0" : "1"} ${r.state}`,
                node: (
                  <span className={`rounded-full border px-2 py-0.5 text-xs ${r.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/5 text-slate-400"}`}>
                    {r.state}
                  </span>
                ),
              },
              { sort: r.detail, node: r.detail, tdClassName: "text-xs text-slate-400" },
            ],
          }))}
        />
      </div>
    </section>
  );
}

function ConnectorCard({
  name,
  accent,
  connectAction,
  org,
  status,
  orgIdLabel,
  orgId,
  connectedAt,
  lastSyncedAt,
  lastSyncNote,
  conn,
}: {
  name: string;
  accent: "cyan" | "emerald";
  connectAction: string;
  org: string | null;
  status: string;
  orgIdLabel: string;
  orgId: string | null;
  connectedAt: Date | null;
  lastSyncedAt: Date | null;
  lastSyncNote: string | null;
  conn: XeroConnection | QboConnection | null;
}) {
  const connected = status === "CONNECTED";
  const eyebrow = accent === "cyan" ? "text-cyan-300" : "text-emerald-300";

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className={`text-xs uppercase tracking-[0.2em] ${eyebrow}`}>{name} (demo)</div>
          <div className="mt-1 text-lg font-semibold text-white">{org ?? "Not connected (demo)"}</div>
          <div className="mt-1 text-sm">
            Status:{" "}
            {connected ? (
              <span className="text-emerald-300">● Connected (demo)</span>
            ) : status === "ERROR" ? (
              <span className="text-rose-300">○ Error</span>
            ) : status === "EXPIRED" ? (
              <span className="text-amber-300">○ Expired</span>
            ) : (
              <span className="text-slate-400">○ Not connected</span>
            )}
          </div>
        </div>
      </div>

      {/* Status detail */}
      <dl className="mt-4 grid grid-cols-[160px_1fr] gap-y-2 text-sm">
        <dt className="text-slate-500">{orgIdLabel}</dt>
        <dd className="font-mono text-xs break-all text-slate-300">{orgId ?? "—"}</dd>
        <dt className="text-slate-500">Connected at</dt>
        <dd className="text-slate-300">{connectedAt ? formatDateTime(connectedAt) : "—"}</dd>
        <dt className="text-slate-500">Last sync</dt>
        <dd className="text-slate-300">
          {lastSyncedAt ? (
            <>
              {formatDateTime(lastSyncedAt)}{" "}
              <span className="text-amber-300/80">(simulated seed data — not a real {name} sync)</span>
            </>
          ) : connected ? (
            "— never synced"
          ) : (
            "—"
          )}
        </dd>
        {lastSyncNote ? (
          <>
            <dt className="text-slate-500">Last note</dt>
            <dd className="text-slate-400 break-words">{lastSyncNote}</dd>
          </>
        ) : null}
      </dl>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
        {connected ? (
          <>
            <form action={connectAction} method="post" className="inline">
              <input type="hidden" name="action" value="sync" />
              <input type="hidden" name="redirect" value="/settings/integrations" />
              <button className="btn-outline text-xs">Run demo sync (seed data)</button>
            </form>
            <ConfirmForm
              action={connectAction}
              message={`Disconnect the ${name} demo connector for this tenant? This clears the placeholder connection; previously seeded finance data is left in place.`}
              className="inline"
            >
              <input type="hidden" name="action" value="disconnect" />
              <input type="hidden" name="redirect" value="/settings/integrations" />
              <button className="btn-outline text-xs text-rose-300">Disconnect</button>
            </ConfirmForm>
          </>
        ) : (
          <form action={connectAction} method="post" className="inline">
            <input type="hidden" name="action" value="connect" />
            <input type="hidden" name="redirect" value="/settings/integrations" />
            <button className="btn-primary text-xs">Connect {name} (demo)</button>
          </form>
        )}
      </div>

      {/* No "test connection" action: the stored token is a placeholder, so
          there is no live endpoint to test against. Saying so is more honest
          than rendering a button that can't do anything meaningful. */}
      <p className="mt-3 text-[11px] text-slate-500">
        No &quot;test connection&quot; action is offered: the stored {name} credential is a placeholder, so there is no
        live API to verify against. {conn ? "A connection row exists for this tenant." : "No connection row exists for this tenant yet."}
      </p>
    </section>
  );
}
