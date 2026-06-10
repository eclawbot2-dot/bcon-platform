import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant, listTenants } from "@/lib/tenant";
import { actorIsAdmin } from "@/lib/permissions";
import { ssoProviderStatus } from "@/lib/sso-providers";
import { formatDate, modeLabel, roleLabel } from "@/lib/utils";
import { ProjectMode } from "@prisma/client";
import { TestAiKeyButton } from "@/components/settings/test-ai-key-button";
import { AccessControlForm } from "./access-control-form";

const ROLE_TEMPLATES = ["ADMIN", "EXECUTIVE", "MANAGER", "PROJECT_ENGINEER", "SUPERINTENDENT", "FOREMAN", "CONTROLLER", "SAFETY_MANAGER", "QUALITY_MANAGER", "VIEWER"] as const;

const MODE_DESCRIPTIONS: Record<string, string> = {
  SIMPLE: "Simple Construction PM — remodels, custom homes, single-trade GCs. Job-thread-first UX, lightweight tasks, homeowner portal-ready.",
  VERTICAL: "Vertical Building — commercial, multifamily, institutional. Full RFI / submittal / OAC meeting / drawing-register workflows.",
  HEAVY_CIVIL: "Heavy Civil — utilities, roadway, earthwork. Quantity-earned-value, ticket reconciliation, production rates, location tagging.",
};

export default async function SettingsPage() {
  const tenant = await requireTenant();
  // Membership-aware: regular users only see tenants they belong to;
  // super-admins see every tenant. Listing the whole Tenant table here
  // leaked other companies' names/slugs to any signed-in member.
  const allTenants = await listTenants();
  const projectsByMode = await prisma.project.groupBy({
    by: ["mode"],
    where: { tenantId: tenant.id },
    _count: { _all: true },
  });
  const [memberships, businessUnits] = await Promise.all([
    prisma.membership.findMany({ where: { tenantId: tenant.id }, include: { user: true, businessUnit: true }, orderBy: { createdAt: "asc" } }),
    prisma.businessUnit.findMany({ where: { tenantId: tenant.id }, orderBy: { name: "asc" } }),
  ]);
  const enabled: string[] = (() => {
    try { return JSON.parse(tenant.enabledModes); } catch { return []; }
  })();
  const showMailLink = await actorIsAdmin(tenant.id);

  return (
    <AppLayout eyebrow="Tenant settings" title={`Configure ${tenant.name}`} description="Primary operating mode, enabled modes, and tenant identity. Changes here reshape the UI and workflow coverage for every project in this tenant.">
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-3">
          <StatTile label="Tenant" value={tenant.name} sub={`slug: ${tenant.slug}`} />
          <StatTile label="Primary mode" value={modeLabel(tenant.primaryMode)} sub={`${enabled.length} modes enabled`} />
          <StatTile label="Other tenants" value={allTenants.length - 1} sub="switch via header" />
        </section>

        {/* Quick-jump TOC — anchors to the section ids below. Sticky on
            desktop so the user can jump as they scroll the long page. */}
        <nav className="card p-3 lg:sticky lg:top-2 lg:z-10" aria-label="Settings sections">
          <ul className="flex flex-wrap gap-2 text-xs">
            <li><a href="#modes" className="rounded-lg border border-white/10 px-3 py-1.5 hover:border-cyan-500/40">Modes</a></li>
            <li><a href="#tenants" className="rounded-lg border border-white/10 px-3 py-1.5 hover:border-cyan-500/40">All tenants</a></li>
            <li><a href="#team" className="rounded-lg border border-white/10 px-3 py-1.5 hover:border-cyan-500/40">Team</a></li>
            <li><a href="#sso" className="rounded-lg border border-white/10 px-3 py-1.5 hover:border-cyan-500/40">SSO</a></li>
            {showMailLink ? <li><a href="#access-control" className="rounded-lg border border-white/10 px-3 py-1.5 hover:border-cyan-500/40">Access control</a></li> : null}
            <li><a href="#ai-keys" className="rounded-lg border border-white/10 px-3 py-1.5 hover:border-cyan-500/40">AI keys</a></li>
            <li><a href="#audit" className="rounded-lg border border-white/10 px-3 py-1.5 hover:border-cyan-500/40">Audit</a></li>
            <li><a href="#backup" className="rounded-lg border border-white/10 px-3 py-1.5 hover:border-cyan-500/40">Backup</a></li>
            <li><Link href="/settings/company" className="rounded-lg border border-white/10 px-3 py-1.5 hover:border-cyan-500/40">Company compliance →</Link></li>
            <li><Link href="/settings/cost-codes" className="rounded-lg border border-white/10 px-3 py-1.5 hover:border-cyan-500/40">Cost codes →</Link></li>
            <li><Link href="/settings/audit" className="rounded-lg border border-white/10 px-3 py-1.5 hover:border-cyan-500/40">Audit log →</Link></li>
            <li><Link href="/settings/api" className="rounded-lg border border-white/10 px-3 py-1.5 hover:border-cyan-500/40">API & webhooks →</Link></li>
            <li><Link href="/settings/guests" className="rounded-lg border border-white/10 px-3 py-1.5 hover:border-cyan-500/40">Guest accounts →</Link></li>
            <li><Link href="/settings/observability" className="rounded-lg border border-white/10 px-3 py-1.5 hover:border-cyan-500/40">Observability →</Link></li>
            {showMailLink ? <li><Link href="/settings/integrations" className="rounded-lg border border-white/10 px-3 py-1.5 hover:border-cyan-500/40">Accounting integrations →</Link></li> : null}
            {showMailLink ? <li><Link href="/settings/workspace-transparency" className="rounded-lg border border-white/10 px-3 py-1.5 hover:border-cyan-500/40">Workspace transparency →</Link></li> : null}
            {showMailLink ? <li><Link href="/settings/automations" className="rounded-lg border border-white/10 px-3 py-1.5 hover:border-cyan-500/40">Automations →</Link></li> : null}
          </ul>
        </nav>

        <section id="modes" className="card p-6 scroll-mt-20">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Operating modes</div>
          <p className="mt-1 text-sm text-slate-400">Companies typically grow across modes. Enable the ones this organization actually uses and pick the primary — most dashboards default to the primary mode&apos;s layout.</p>
          <form action="/api/tenant/config" method="post" className="mt-5 grid gap-6">
            <input type="hidden" name="redirect" value="/settings" />
            <div className="grid gap-4">
              {Object.values(ProjectMode).map((mode) => {
                const count = projectsByMode.find((r) => r.mode === mode)?._count._all ?? 0;
                const isEnabled = enabled.includes(mode);
                const isPrimary = tenant.primaryMode === mode;
                return (
                  <label key={mode} className={`flex flex-col gap-3 rounded-2xl border p-5 transition ${isPrimary ? "border-cyan-500/40 bg-cyan-500/5" : isEnabled ? "border-white/10 bg-white/5" : "border-white/5 bg-white/[0.02]"}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" name="enabledModes" value={mode} defaultChecked={isEnabled} className="h-4 w-4" />
                          <span className="text-lg font-semibold text-white">{modeLabel(mode)}</span>
                          {isPrimary ? <span className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200">Primary</span> : null}
                        </div>
                        <p className="mt-2 max-w-2xl text-sm text-slate-400">{MODE_DESCRIPTIONS[mode]}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Projects in this mode</div>
                        <div className="mt-1 text-2xl font-semibold text-white">{count}</div>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-[0.16em] text-slate-400">Primary mode</span>
                <select
                  name="primaryMode"
                  defaultValue={tenant.primaryMode}
                  className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
                >
                  {Object.values(ProjectMode).map((m) => (
                    <option key={m} value={m}>{modeLabel(m)}</option>
                  ))}
                </select>
              </label>
              <button type="submit" className="btn-primary">Save mode config</button>
            </div>
          </form>
        </section>

        <section id="tenants" className="card p-6 scroll-mt-20">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Tenants you can access</div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
            <SortableTable
              emptyMessage="No tenants."
              columns={[
                { header: "Name" },
                { header: "Slug" },
                { header: "Primary mode" },
                { header: "Enabled modes" },
                { header: "Created" },
              ]}
              rows={allTenants.map((t) => {
                let tEnabled: string[] = [];
                try { tEnabled = JSON.parse(t.enabledModes); } catch { tEnabled = []; }
                return {
                  key: t.id,
                  className: t.id === tenant.id ? "bg-cyan-500/5" : "",
                  cells: [
                    {
                      sort: t.name,
                      node: (
                        <>
                          <div className="font-medium text-white">{t.name}</div>
                          {t.id === tenant.id ? <div className="text-xs text-cyan-300">current</div> : null}
                        </>
                      ),
                    },
                    { sort: t.slug, node: t.slug, tdClassName: "font-mono text-xs text-slate-400" },
                    { sort: modeLabel(t.primaryMode), node: modeLabel(t.primaryMode) },
                    {
                      sort: tEnabled.join(","),
                      node: (
                        <div className="flex flex-wrap gap-1">
                          {tEnabled.map((m) => <span key={m} className="badge-gray text-[10px]">{modeLabel(m)}</span>)}
                        </div>
                      ),
                    },
                    { sort: t.createdAt ? new Date(t.createdAt).getTime() : undefined, node: formatDate(t.createdAt), tdClassName: "text-slate-400" },
                  ],
                };
              })}
            />
          </div>
          <p className="mt-3 text-xs text-slate-500">Use the tenant switcher in the header to jump between companies. Each tenant sees only its own projects, vendors, contracts, and financials.</p>
        </section>

        <section id="team" className="card p-6 scroll-mt-20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Team + role management</div>
              <p className="mt-1 text-sm text-slate-400">Invite teammates into this tenant and assign role templates. Only users with <span className="font-mono text-cyan-200">ADMIN</span> role in this tenant (or a platform super admin) can invite. Granting <span className="font-mono text-cyan-200">ADMIN</span> itself is super-admin-only.</p>
            </div>
            <Link href="/people" className="btn-outline text-xs">Open people directory</Link>
          </div>
          <form action="/api/users/invite" method="post" className="mt-4 grid gap-3 md:grid-cols-[2fr_2fr_1fr_1fr_auto]">
            <input name="name" required placeholder="Full name" className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500" />
            <input name="email" type="email" required placeholder="email@company.com" className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500" />
            <select name="role" defaultValue="PROJECT_ENGINEER" className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500">
              {ROLE_TEMPLATES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </select>
            <select name="businessUnitId" defaultValue="" className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500">
              <option value="">— no BU —</option>
              {businessUnits.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <button className="btn-primary">Invite / update</button>
          </form>
          <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
            <SortableTable
              emptyMessage="No memberships yet."
              columns={[
                { header: "Name" },
                { header: "Email" },
                { header: "Role" },
                { header: "Business unit" },
                { header: "Joined" },
              ]}
              rows={memberships.map((m) => ({
                key: m.id,
                className: "transition hover:bg-white/5",
                cells: [
                  { sort: m.user.name ?? "", node: <Link href={`/people/${m.user.id}`} className="text-cyan-300 hover:underline">{m.user.name}</Link> },
                  { sort: m.user.email ?? "", node: m.user.email, tdClassName: "text-slate-400" },
                  { sort: roleLabel(m.roleTemplate), node: roleLabel(m.roleTemplate) },
                  { sort: m.businessUnit?.name ?? "", node: m.businessUnit?.name ?? "—", tdClassName: "text-slate-400" },
                  { sort: m.createdAt ? new Date(m.createdAt).getTime() : undefined, node: formatDate(m.createdAt), tdClassName: "text-slate-400" },
                ],
              }))}
            />
          </div>
        </section>

        <section id="sso" className="card p-6 scroll-mt-20">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Identity provider (SSO)</div>
          <p className="mt-1 text-sm text-slate-400">bcon ships with local password auth. SSO providers activate platform-wide when their OAuth credentials are present in the server environment; active providers appear as &quot;Continue with…&quot; buttons on the login page. Only provisioned members can sign in via SSO — the same access policy as passwords.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {ssoProviderStatus().map((p) => (
              <div key={p.id} className="panel p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-white">{p.label}</div>
                  {p.active ? (
                    <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">Active</span>
                  ) : (
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-400">Not configured</span>
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  {p.active
                    ? <>Sign-in URL: <code className="text-cyan-300">/api/auth/signin/{p.id}</code></>
                    : <>Set <code className="text-cyan-300">{p.envVars.join(", ")}</code> in the server environment and restart to activate.</>}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] uppercase tracking-[0.18em] text-slate-500">Configuration is environment-level (applies to the whole deployment), not per-tenant.</p>
        </section>

        {showMailLink ? (
          <section id="access-control" className="card p-6 scroll-mt-20">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Access control</div>
            <p className="mt-1 text-sm text-slate-400">
              Controls who may sign in to this tenant. Locked to provisioned members by default.
            </p>
            <AccessControlForm initial={tenant.allowExternalEmailLogins} />
          </section>
        ) : null}

        <section id="ai-keys" className="card p-6 scroll-mt-20">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">AI provider keys</div>
          <p className="mt-1 text-sm text-slate-400">Plug in your own OpenAI or Anthropic API key to bill AI usage to your account. Keys are encrypted with a per-tenant salt before being persisted; the cleartext is never stored. Leave blank to use the platform default.</p>
          <form action="/api/tenant/llm-keys" method="post" className="mt-4 grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-[0.16em] text-slate-400">OpenAI API key</span>
                <div className="flex items-center gap-2">
                  <input
                    name="openaiKey"
                    type="password"
                    placeholder={tenant.openaiKeyEnc ? "••• key on file — leave blank to keep" : "sk-..."}
                    autoComplete="off"
                    className="form-input flex-1"
                  />
                  {tenant.openaiKeyEnc ? (
                    <label className="flex items-center gap-1 text-xs text-rose-300" title="Wipe the saved OpenAI key">
                      <input type="checkbox" name="clearOpenai" value="1" /> clear
                    </label>
                  ) : null}
                </div>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-[0.16em] text-slate-400">Anthropic API key</span>
                <div className="flex items-center gap-2">
                  <input
                    name="anthropicKey"
                    type="password"
                    placeholder={tenant.anthropicKeyEnc ? "••• key on file — leave blank to keep" : "sk-ant-..."}
                    autoComplete="off"
                    className="form-input flex-1"
                  />
                  {tenant.anthropicKeyEnc ? (
                    <label className="flex items-center gap-1 text-xs text-rose-300" title="Wipe the saved Anthropic key">
                      <input type="checkbox" name="clearAnthropic" value="1" /> clear
                    </label>
                  ) : null}
                </div>
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-[0.16em] text-slate-400">Preferred provider</span>
                <select name="preferredProvider" defaultValue={tenant.preferredProvider ?? "openai"} className="form-select">
                  <option value="openai">OpenAI (GPT)</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                </select>
              </label>
              <button className="btn-primary">Save AI keys</button>
            </div>
          </form>
          {tenant.openaiKeyEnc || tenant.anthropicKeyEnc ? (
            <div className="mt-4 border-t border-white/5 pt-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Verify your saved key</div>
              <div className="mt-2">
                <TestAiKeyButton />
              </div>
            </div>
          ) : null}
        </section>

        <section id="audit" className="card p-6 scroll-mt-20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Audit log</div>
              <p className="mt-1 text-sm text-slate-400">Every change inside this tenant is recorded with actor, action, entity, and timestamp. Use this for compliance evidence and security review.</p>
            </div>
            <Link href="/settings/audit" className="btn-outline text-xs">Open audit log</Link>
          </div>
        </section>

        <section id="backup" className="card p-6 scroll-mt-20">
          <div className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--accent, #67e8f9)" }}>Backup status</div>
          <p className="mt-2 text-sm" style={{ color: "var(--faint)" }}>
            Read-only view of this tenant&apos;s nightly backup. Configuration (enabled flag, external directory, run-now) lives on the super-admin tenant page.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2 text-sm">
            <div>
              <span className="text-xs uppercase tracking-[0.16em]" style={{ color: "var(--faint)" }}>Last backup</span>
              <div className="mt-1" style={{ color: "var(--heading)" }}>
                {tenant.lastBackupAt ? formatDate(tenant.lastBackupAt) : "never"}
                {tenant.lastBackupBytes ? <span className="ml-2 text-xs" style={{ color: "var(--faint)" }}>({Math.round(tenant.lastBackupBytes / 1024)} KB)</span> : null}
              </div>
            </div>
            <div>
              <span className="text-xs uppercase tracking-[0.16em]" style={{ color: "var(--faint)" }}>Status</span>
              <div className="mt-1">
                {tenant.lastBackupError ? (
                  <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-200">last error: {tenant.lastBackupError.slice(0, 80)}</span>
                ) : tenant.backupEnabled ? (
                  <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">enabled</span>
                ) : (
                  <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200">disabled</span>
                )}
              </div>
            </div>
            <div className="md:col-span-2">
              <span className="text-xs uppercase tracking-[0.16em]" style={{ color: "var(--faint)" }}>External directory</span>
              <div className="mt-1 font-mono text-xs" style={{ color: tenant.backupDirectory ? "var(--heading)" : "var(--faint)" }}>
                {tenant.backupDirectory ?? "(local only — ./uploads/backups/" + tenant.slug + "/)"}
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
