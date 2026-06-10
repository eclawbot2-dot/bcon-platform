import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { currentActor, isAdminRole } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils";
import { esignStatus } from "@/lib/esign";
import { ssoProviderStatus } from "@/lib/sso-providers";
import type { XeroConnection, QboConnection } from "@prisma/client";

/**
 * Accounting integrations (Xero / QuickBooks Online) — admin-only,
 * per-tenant settings.
 *
 * HONESTY: bcon's Xero/QBO connectors are a DEMO / SIMULATION. "Connect"
 * writes hardcoded placeholder tokens (see connectXeroDemo/connectQboDemo in
 * src/lib/{xero,qbo}-sync.ts) and "Sync" generates deterministic seed journal
 * rows + P&L snapshots locally — it never performs a real OAuth
 * authorization-code exchange and never calls the Xero or QBO API. This page
 * states that plainly so no one mistakes the demo for a live accounting feed.
 *
 * Gating: requireTenant() resolves the caller's OWN tenant; currentActor()
 * resolves their role IN that tenant. A non-admin (or a caller with no
 * membership) gets a 404 via notFound() — mirrors the workspace-transparency
 * mail feature gate. The underlying /api/{xero,qbo}/connect routes are left
 * intact (they gate at the manager level on POST).
 */
export const dynamic = "force-dynamic";

export default async function IntegrationsSettingsPage() {
  const tenant = await requireTenant();
  const actor = await currentActor(tenant.id);
  if (!isAdminRole(actor.role)) notFound();

  const [xero, qbo] = await Promise.all([
    prisma.xeroConnection.findUnique({ where: { tenantId: tenant.id } }),
    prisma.qboConnection.findUnique({ where: { tenantId: tenant.id } }),
  ]);

  return (
    <AppLayout
      eyebrow="Settings · Integrations"
      title="Accounting integrations"
      description="Per-tenant Xero & QuickBooks Online connectors. Admin-only. These are DEMO / simulation connectors today — they do not connect to a real accounting organization and do not sync real data (see notes below)."
    >
      <div className="grid gap-6">
        {/* Top-level honesty banner — applies to BOTH connectors. */}
        <section className="card border border-amber-500/40 bg-amber-500/5 p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-amber-300">Demo / simulation connector — read this first</div>
          <p className="mt-2 text-sm text-amber-100/90">
            bcon&apos;s Xero and QuickBooks Online connectors are a <strong>demo / simulation</strong>. They are
            <strong> not connected to a real Xero or QBO organization</strong>, and <strong>sync is not implemented</strong>.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-100/80">
            <li>&quot;Connect&quot; writes placeholder demo credentials for this tenant. It does <strong>not</strong> run an OAuth authorization-code flow and never authorizes a real organization.</li>
            <li>&quot;Sync&quot; generates deterministic <strong>seed</strong> journal entries and P&amp;L snapshots locally so downstream finance reports have something to render. <strong>No invoices, contacts, or ledger data are pulled from or pushed to Xero/QBO.</strong></li>
            <li>No tokens or secrets are displayed on this page (the demo tokens are placeholders regardless).</li>
          </ul>
          <p className="mt-3 text-xs text-amber-100/70">
            What a real integration would require: a registered Xero/Intuit app (client id + secret), a server-side
            OAuth 2.0 authorization-code flow with CSRF <code className="font-mono">state</code> validation, a callback that
            exchanges the code for tokens and stores them encrypted at rest (via the per-tenant vault in{" "}
            <code className="font-mono">src/lib/rfp-geo.ts</code>), automatic token refresh, and real API calls in{" "}
            <code className="font-mono">syncFromXero()</code> / <code className="font-mono">syncFromQbo()</code> (
            <code className="font-mono">src/lib/{`{xero,qbo}`}-sync.ts</code>) to replace the simulated seed data.
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

        <PlatformIntegrations />
      </div>
    </AppLayout>
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
      detail: "EMAIL_TRANSPORT=resend|sendgrid + provider API key + EMAIL_FROM",
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
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="py-2 pr-4">Integration</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2">How to enable / notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((r) => (
              <tr key={r.name}>
                <td className="py-2 pr-4 text-slate-200">{r.name}</td>
                <td className="py-2 pr-4">
                  <span className={`rounded-full border px-2 py-0.5 text-xs ${r.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/5 text-slate-400"}`}>
                    {r.state}
                  </span>
                </td>
                <td className="py-2 text-xs text-slate-400">{r.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
          <div className={`text-xs uppercase tracking-[0.2em] ${eyebrow}`}>{name}</div>
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
