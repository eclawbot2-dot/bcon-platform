import Link from "next/link";
import { notFound } from "next/navigation";
import { DetailShell } from "@/components/layout/detail-shell";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { ProjectMode } from "@prisma/client";
import { formatDate, modeLabel } from "@/lib/utils";

const ROLE_TEMPLATES = ["ADMIN", "EXECUTIVE", "MANAGER", "PROGRAM_MANAGER", "CONTROLLER", "SUPERINTENDENT", "PROJECT_ENGINEER", "FOREMAN", "SAFETY_MANAGER", "QUALITY_MANAGER", "COORDINATOR", "VIEWER"] as const;

export default async function AdminTenantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantId: string }>;
  searchParams: Promise<{ adminEmail?: string; adminTemp?: string }>;
}) {
  const { tenantId } = await params;
  const sp = await searchParams;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: {
      businessUnits: { orderBy: { name: "asc" } },
      memberships: { include: { user: true, businessUnit: true }, orderBy: { createdAt: "asc" } },
      _count: { select: { projects: true, opportunities: true, vendors: true, bidDrafts: true, journalEntries: true } },
    },
  });
  if (!tenant) notFound();
  const enabled: string[] = (() => { try { return JSON.parse(tenant.enabledModes); } catch { return []; } })();
  const featurePacks: string[] = (() => { try { return JSON.parse(tenant.featurePacks); } catch { return []; } })();
  const allUsers = await prisma.user.findMany({ orderBy: { name: "asc" } });

  return (
    <DetailShell
      eyebrow="Super admin · Tenant"
      title={tenant.name}
      subtitle={`slug: ${tenant.slug} · ${tenant._count.projects} projects · ${tenant.memberships.length} members`}
      crumbs={[{ label: "Admin", href: "/admin" }, { label: "Tenants", href: "/admin/tenants" }, { label: tenant.name }]}
      actions={<div className="flex gap-2"><form action={`/api/admin/tenants/${tenant.id}/switch`} method="post"><button className="btn-primary text-xs">Switch in</button></form></div>}
    >
      {sp.adminEmail && sp.adminTemp ? (
        <section className="card p-5" style={{ borderColor: "rgba(34, 211, 238, 0.4)" }}>
          <div className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--accent, #67e8f9)" }}>One-time admin credential</div>
          <p className="mt-2 text-sm" style={{ color: "var(--heading)" }}>
            New admin user just created. Copy this temp password and hand it to <code className="font-mono">{sp.adminEmail}</code> out-of-band — they'll change it on first login.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_auto]">
            <code className="rounded-lg p-2 font-mono text-sm" style={{ background: "var(--hover-bg)", color: "var(--heading)" }}>{sp.adminTemp}</code>
            <Link href={`/admin/tenants/${tenantId}`} className="btn-outline text-xs">I've copied it — dismiss</Link>
          </div>
          <p className="mt-2 text-xs" style={{ color: "var(--faint)" }}>
            This banner only renders while these query params are in the URL. Once you click dismiss, the password is gone — there's no way to retrieve it later. If you lose it, super-admins can reset it via the user's detail page.
          </p>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-5">
        <StatTile label="Projects" value={tenant._count.projects} />
        <StatTile label="Members" value={tenant.memberships.length} />
        <StatTile label="BUs" value={tenant.businessUnits.length} />
        <StatTile label="Opportunities" value={tenant._count.opportunities} />
        <StatTile label="Vendors" value={tenant._count.vendors} />
      </section>

      <section className="card p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Identity & modes</div>
        <form action={`/api/admin/tenants/${tenant.id}/edit`} method="post" className="mt-4 grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div><label className="form-label">Name</label><input name="name" defaultValue={tenant.name} required className="form-input" /></div>
            <div><label className="form-label">Slug</label><input name="slug" defaultValue={tenant.slug} required pattern="[a-z0-9-]+" className="form-input" /></div>
          </div>
          <div>
            <label className="form-label">Enabled modes</label>
            <div className="mt-2 grid gap-3 md:grid-cols-3">
              {Object.values(ProjectMode).map((m) => (
                <label key={m} className="panel p-3 flex items-center gap-2">
                  <input type="checkbox" name="enabledModes" value={m} defaultChecked={enabled.includes(m)} />
                  <span>{modeLabel(m)}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="form-label">Primary mode</label>
              <select name="primaryMode" defaultValue={tenant.primaryMode} className="form-select">
                {Object.values(ProjectMode).map((m) => <option key={m} value={m}>{modeLabel(m)}</option>)}
              </select>
            </div>
            <div><label className="form-label">Feature packs (comma-separated)</label><input name="featurePacks" defaultValue={featurePacks.join(",")} className="form-input" placeholder="heavy-civil, design-build, aia-g702" /></div>
          </div>
          <div><button className="btn-primary">Save changes</button></div>
        </form>
      </section>

      <section className="card p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Business units · {tenant.businessUnits.length}</div>
        <form action={`/api/admin/tenants/${tenant.id}/business-units/create`} method="post" className="mt-4 grid gap-3 md:grid-cols-4">
          <div><label className="form-label">Name</label><input name="name" required className="form-input" /></div>
          <div><label className="form-label">Code</label><input name="code" required className="form-input" placeholder="EAST" /></div>
          <div>
            <label className="form-label">Default mode</label>
            <select name="defaultMode" defaultValue={tenant.primaryMode} className="form-select">
              {Object.values(ProjectMode).map((m) => <option key={m} value={m}>{modeLabel(m)}</option>)}
            </select>
          </div>
          <div className="flex items-end"><button className="btn-primary w-full">+ Add</button></div>
          <div className="md:col-span-4"><label className="form-label">Region (optional)</label><input name="region" className="form-input" /></div>
        </form>
        <div className="mt-6">
          <SortableTable
            emptyMessage="No business units."
            columns={[
              { header: "Name" },
              { header: "Code" },
              { header: "Mode" },
              { header: "Region" },
              { header: "", sortable: false },
            ]}
            rows={tenant.businessUnits.map((b) => ({
              key: b.id,
              cells: [
                { sort: b.name, node: b.name },
                { sort: b.code, tdClassName: "font-mono text-xs", node: b.code },
                { sort: modeLabel(b.defaultMode), node: modeLabel(b.defaultMode) },
                { sort: b.region ?? "", tdClassName: "text-slate-400", node: b.region ?? "—" },
                {
                  node: (
                    <form action={`/api/admin/tenants/${tenant.id}/business-units/${b.id}/delete`} method="post">
                      <button className="btn-outline text-xs">Delete</button>
                    </form>
                  ),
                },
              ],
            }))}
          />
        </div>
      </section>

      <section className="card p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Memberships · {tenant.memberships.length}</div>
        <form action={`/api/admin/tenants/${tenant.id}/memberships/create`} method="post" className="mt-4 grid gap-3 md:grid-cols-4">
          <div>
            <label className="form-label">Existing user</label>
            <select name="userId" className="form-select"><option value="">— or enter email below —</option>
              {allUsers.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}
            </select>
          </div>
          <div><label className="form-label">New user name</label><input name="name" className="form-input" /></div>
          <div><label className="form-label">New user email</label><input name="email" type="email" className="form-input" /></div>
          <div>
            <label className="form-label">Role</label>
            <select name="role" defaultValue="MANAGER" className="form-select">
              {ROLE_TEMPLATES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Business unit</label>
            <select name="businessUnitId" className="form-select">
              <option value="">— none —</option>
              {tenant.businessUnits.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="md:col-span-4"><button className="btn-primary">Add member</button></div>
        </form>
        <div className="mt-6">
          <SortableTable
            emptyMessage="No members yet."
            columns={[
              { header: "User" },
              { header: "Email" },
              { header: "Role" },
              { header: "Business unit" },
              { header: "Joined" },
              { header: "", sortable: false },
            ]}
            rows={tenant.memberships.map((m) => ({
              key: m.id,
              cells: [
                {
                  sort: m.user.name ?? "",
                  node: (
                    <>
                      <Link href={`/admin/users/${m.userId}`} className="text-cyan-300 hover:underline">{m.user.name}</Link>
                      {m.user.superAdmin ? <span className="ml-2 rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-200">SUPER</span> : null}
                    </>
                  ),
                },
                { sort: m.user.email ?? "", tdClassName: "text-xs", node: m.user.email },
                {
                  sort: m.roleTemplate,
                  node: (
                    <form action={`/api/admin/tenants/${tenant.id}/memberships/${m.id}/role`} method="post" className="flex gap-1">
                      <select name="role" defaultValue={m.roleTemplate} className="form-select text-xs">
                        {ROLE_TEMPLATES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <button className="btn-outline text-xs">Save</button>
                    </form>
                  ),
                },
                { sort: m.businessUnit?.name ?? "", tdClassName: "text-xs", node: m.businessUnit?.name ?? "—" },
                { sort: new Date(m.createdAt).getTime(), tdClassName: "text-xs text-slate-400", node: formatDate(m.createdAt) },
                {
                  node: (
                    <form action={`/api/admin/tenants/${tenant.id}/memberships/${m.id}/delete`} method="post">
                      <button className="btn-outline text-xs">Remove</button>
                    </form>
                  ),
                },
              ],
            }))}
          />
        </div>
      </section>

      <section className="card p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Backups</div>
        <div className="mt-2 text-sm text-slate-400">
          Last run: {tenant.lastBackupAt ? formatDate(tenant.lastBackupAt) : "never"}
          {tenant.lastBackupBytes ? <span className="ml-2 text-xs text-slate-500">({Math.round(tenant.lastBackupBytes / 1024)} KB)</span> : null}
          {tenant.lastBackupError ? <span className="ml-2 rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-200">last error: {tenant.lastBackupError.slice(0, 60)}</span> : null}
        </div>
        <form action={`/api/admin/tenants/${tenant.id}/backup`} method="post" className="mt-4 grid gap-3">
          <input type="hidden" name="action" value="config" />
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" name="backupEnabled" defaultChecked={tenant.backupEnabled} /> Nightly backup enabled
          </label>
          <div>
            <label htmlFor="backup-dir" className="form-label">External backup directory</label>
            <input id="backup-dir" name="backupDirectory" defaultValue={tenant.backupDirectory ?? ""} placeholder={`C:/Users/bot/OneDrive/bcon-backups/${tenant.slug}`} className="form-input" />
            <p className="mt-1 text-xs text-slate-500">Optional. Local copy at <code>./uploads/backups/{tenant.slug}/</code> always runs. Point this at a OneDrive / Google Drive sync folder for off-machine retention.</p>
          </div>
          <div>
            <button className="btn-outline text-xs">Save settings</button>
          </div>
        </form>
        <form action={`/api/admin/tenants/${tenant.id}/backup`} method="post" className="mt-3">
          <input type="hidden" name="action" value="run" />
          <button className="btn-primary text-xs">Run backup now</button>
        </form>
      </section>

      <section className="card p-6 border-rose-500/30">
        <div className="text-xs uppercase tracking-[0.2em] text-rose-300">Danger zone</div>
        <p className="mt-2 text-sm text-slate-300">Deleting a tenant cascades to every project, membership, document, opportunity, vendor, and financial record under it. This cannot be undone.</p>
        <form action={`/api/admin/tenants/${tenant.id}/delete`} method="post" className="mt-4 flex gap-3">
          <input name="confirm" placeholder={`Type "${tenant.slug}" to confirm`} required className="form-input flex-1" />
          <button className="btn-danger">Delete tenant</button>
        </form>
      </section>
    </DetailShell>
  );
}
