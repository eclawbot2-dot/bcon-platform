import { notFound } from "next/navigation";
import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { currentActor, isAdminRole } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils";
import { GOOGLE_DWD_SCOPES } from "@/lib/mail/google";
import { M365_GRAPH_PERMISSIONS } from "@/lib/mail/m365";

/**
 * Workspace transparency — admin-only mail-ingestion settings.
 *
 * Gating: requireTenant() resolves the caller's OWN tenant; currentActor()
 * resolves their role IN that tenant. A non-admin (or a caller with no
 * membership) gets a 404 via notFound() — the page is invisible/inaccessible
 * unless the caller is the tenant ADMIN. The feature stays OFF until the admin
 * explicitly toggles `enabled`.
 */
export default async function WorkspaceTransparencyPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const tenant = await requireTenant();
  const actor = await currentActor(tenant.id);
  if (!isAdminRole(actor.role)) notFound();

  const sp = await searchParams;
  const conn = await prisma.mailConnection.findUnique({ where: { tenantId: tenant.id } });
  const mailboxCount = conn ? await prisma.mailbox.count({ where: { tenantId: tenant.id, active: true } }) : 0;
  const messageCount = conn ? await prisma.mailMessage.count({ where: { tenantId: tenant.id } }) : 0;

  const provider = conn?.provider ?? "google";

  return (
    <AppLayout
      eyebrow="Settings · Workspace transparency"
      title="Workspace transparency"
      description="Admin-only mail ingestion. Connect Google Workspace OR Microsoft 365 to read & triage your team's mail flow. Read-only — nothing is auto-actioned. OFF until you enable it."
    >
      <div className="grid gap-6">
        {sp.ok ? <Banner tone="good">{sp.ok.replace(/\+/g, " ")}</Banner> : null}
        {sp.error ? <Banner tone="bad">{sp.error.replace(/\+/g, " ")}</Banner> : null}

        <section className="card p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Status</div>
              <div className="mt-1 text-sm text-slate-300">
                {conn ? (
                  <>
                    Provider <span className="font-mono">{conn.provider}</span> ·{" "}
                    <span className={conn.enabled ? "text-emerald-300" : "text-amber-300"}>
                      {conn.enabled ? "ENABLED" : "DISABLED (opt-in OFF)"}
                    </span>{" "}
                    · {conn.status}
                    {conn.lastError ? <span className="text-rose-300"> · {conn.lastError}</span> : null}
                  </>
                ) : (
                  "No connection configured yet."
                )}
              </div>
              {conn ? (
                <div className="mt-2 text-xs text-slate-500">
                  {mailboxCount} mailbox(es) · {messageCount} message(s) ·{" "}
                  last sync {conn.lastSyncedAt ? formatDateTime(conn.lastSyncedAt) : "never"}
                </div>
              ) : null}
            </div>
            <div className="flex gap-2">
              {conn ? (
                <>
                  <form action="/api/tenant/mail/toggle" method="post">
                    <button className={conn.enabled ? "btn-outline text-xs text-rose-300" : "btn-primary text-xs"}>
                      {conn.enabled ? "Disable" : "Enable"}
                    </button>
                  </form>
                  <Link href="/settings/workspace-transparency/inbox" className="btn-outline text-xs">
                    Review inbox →
                  </Link>
                </>
              ) : null}
            </div>
          </div>
          {conn ? (
            <form action="/api/tenant/mail/sync" method="post" className="mt-4 flex flex-wrap gap-2">
              <button name="action" value="verify" className="btn-outline text-xs">Verify credentials</button>
              <button name="action" value="users" className="btn-outline text-xs">Discover mailboxes</button>
              <button name="action" value="ingest" className="btn-outline text-xs">Ingest now</button>
            </form>
          ) : null}
        </section>

        <section className="card p-5 min-w-0 overflow-hidden">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Connect a provider</div>
          <p className="mt-1 text-xs text-slate-400">
            Choose ONE provider for this tenant. Secrets are encrypted at rest (AES-256-GCM, per-tenant key) and
            never shown back. Leave a secret field blank when editing to keep the stored value.
          </p>

          {/* Google Workspace */}
          <form action="/api/tenant/mail/connect" method="post" className="mt-4 grid gap-3 border-t border-white/10 pt-4">
            <input type="hidden" name="provider" value="google" />
            <div className="text-xs uppercase tracking-[0.15em] text-slate-400">Google Workspace (domain-wide delegation)</div>
            <textarea
              name="googleServiceAccountJson"
              rows={4}
              placeholder={`Paste service-account JSON ({"type":"service_account","private_key":"…","client_email":"…"})`}
              className="form-input font-mono text-xs"
              defaultValue=""
            />
            <input
              name="googleAdminSubject"
              placeholder="Admin subject email (super-admin to impersonate for Directory)"
              className="form-input"
              defaultValue={provider === "google" ? (conn?.googleAdminSubject ?? "") : ""}
            />
            <input
              name="googlePubsubTopic"
              placeholder="Pub/Sub topic (optional — only for push)"
              className="form-input font-mono text-xs"
              defaultValue={provider === "google" ? (conn?.googlePubsubTopic ?? "") : ""}
            />
            <button className="btn-primary text-xs justify-self-start">Save Google connection</button>
          </form>

          {/* Microsoft 365 */}
          <form action="/api/tenant/mail/connect" method="post" className="mt-4 grid gap-3 border-t border-white/10 pt-4">
            <input type="hidden" name="provider" value="m365" />
            <div className="text-xs uppercase tracking-[0.15em] text-slate-400">Microsoft 365 (Graph app-only / client credentials)</div>
            <input
              name="m365TenantId"
              placeholder="Azure AD tenant (directory) id"
              className="form-input font-mono text-xs"
              defaultValue={provider === "m365" ? (conn?.m365TenantId ?? "") : ""}
            />
            <input
              name="m365ClientId"
              placeholder="Application (client) id"
              className="form-input font-mono text-xs"
              defaultValue={provider === "m365" ? (conn?.m365ClientId ?? "") : ""}
            />
            <input
              name="m365ClientSecret"
              type="password"
              placeholder="Client secret (leave blank to keep existing)"
              className="form-input font-mono text-xs"
              defaultValue=""
            />
            <button className="btn-primary text-xs justify-self-start">Save Microsoft 365 connection</button>
          </form>
        </section>

        <section className="card p-5 text-xs text-slate-400">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-500">What you must provide</div>
          <ul className="mt-2 list-disc pl-5 space-y-1">
            <li>
              <span className="text-slate-300">Google Workspace:</span> a service-account JSON key, with that
              service account granted domain-wide delegation in Admin Console (Security → API controls → Domain-wide
              delegation), plus a super-admin email as the impersonation subject. Authorize the EXACT scope string
              below on the service-account client id (Mail + Drive + Calendar transparency):
              <code className="mt-1 block whitespace-pre-wrap break-all font-mono text-[11px] text-slate-300">
                {GOOGLE_DWD_SCOPES}
              </code>
            </li>
            <li>
              <span className="text-slate-300">Microsoft 365:</span> an Azure app registration (tenant id, client id,
              client secret) with APPLICATION permissions{" "}
              {M365_GRAPH_PERMISSIONS.map((p, i) => (
                <span key={p}>
                  {i > 0 ? " + " : ""}
                  <code className="font-mono">{p}</code>
                </span>
              ))}{" "}
              and admin consent granted. All read-only (Mail + Files + Calendar transparency).
            </li>
          </ul>
        </section>
      </div>
    </AppLayout>
  );
}

function Banner({ tone, children }: { tone: "good" | "bad"; children: React.ReactNode }) {
  const cls = tone === "good" ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-200" : "border-rose-500/40 bg-rose-500/5 text-rose-200";
  return <div className={`card p-3 text-sm ${cls}`}>{children}</div>;
}
