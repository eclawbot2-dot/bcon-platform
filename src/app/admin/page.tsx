import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { prisma } from "@/lib/prisma";
import { currentSuperAdmin } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils";

export default async function AdminHomePage() {
  // In-page gate — layouts and pages render in parallel, so the layout's
  // access-denied shell does NOT stop this page's platform-wide queries from
  // running and shipping in the RSC payload. See admin/audit/page.tsx.
  if (!(await currentSuperAdmin())) return null;
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [
    tenants,
    users,
    superAdmins,
    projects,
    membershipsTotal,
    lastAudit,
    auditEvents24h,
    rfpListings,
    rfpAutodrafted,
    catalogTotal,
    catalogAuto,
    catalogVerifiedOk,
    backupStaleCount,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.user.count(),
    prisma.user.count({ where: { superAdmin: true } }),
    prisma.project.count(),
    prisma.membership.count(),
    prisma.auditEvent.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.auditEvent.count({ where: { createdAt: { gte: oneDayAgo } } }),
    prisma.rfpListing.count(),
    prisma.rfpListing.count({ where: { autoDrafted: true } }),
    prisma.solicitationPortalCatalog.count(),
    prisma.solicitationPortalCatalog.count({ where: { scraperKind: { in: ["API", "RSS", "HTML"] } } }),
    prisma.solicitationPortalCatalog.count({ where: { lastVerifiedOk: true } }),
    prisma.tenant.count({
      where: {
        backupEnabled: true,
        OR: [
          { lastBackupAt: null },
          { lastBackupAt: { lt: new Date(Date.now() - 25 * 60 * 60 * 1000) } },
        ],
      },
    }),
  ]);

  return (
    <AppLayout eyebrow="Super admin" title="Platform administration" description="Manage tenants, users, memberships, and platform-level settings across the entire install.">
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-5">
          <StatTile label="Tenants" value={tenants} href="/admin/tenants" />
          <StatTile label="Users" value={users} href="/admin/users" />
          <StatTile label="Super admins" value={superAdmins} tone={superAdmins > 0 ? "good" : "bad"} />
          <StatTile label="Memberships" value={membershipsTotal} />
          <StatTile label="Projects (all tenants)" value={projects} />
        </section>

        <section className="grid gap-4 md:grid-cols-5">
          <StatTile label="RFP listings" value={rfpListings} sub={`${rfpAutodrafted} auto-drafted`} />
          <StatTile label="Catalog portals" value={catalogTotal} href="/admin/portal-coverage" sub={`${catalogAuto} auto-scraped`} />
          <StatTile label="Verified working" value={catalogVerifiedOk} tone={catalogVerifiedOk > 0 ? "good" : "warn"} sub={`of ${catalogTotal}`} />
          <StatTile label="Stale backups" value={backupStaleCount} tone={backupStaleCount === 0 ? "good" : "warn"} sub="≥ 25h since last" />
          <StatTile label="Audit events 24h" value={auditEvents24h} href="/admin/audit" />
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Tile href="/admin/tenants" title="Tenant management" body="Create tenants, edit identity & modes, see per-tenant project counts, disable or delete." />
          <Tile href="/admin/users" title="User management" body="All users across the platform. Promote/demote super admin. Deactivate." />
          <Tile href="/admin/portal-coverage" title="Portal coverage" body="234 SE/federal procurement portals. Refresh telemetry, see which need scrapers next." />
          <Tile href="/admin/capital-programs" title="Capital programs" body="Multi-project umbrella for owner / agency capital plans (CIP, bond program, institutional)." />
          <Tile href="/admin/audit" title="Audit log" body="Platform-wide audit events. Filter by actor, tenant, entity type." />
          <Tile href="/admin/tenants/new" title="+ New tenant" body="Spin up a new tenant with a primary mode, enabled modes, and an ADMIN user." />
          <Tile href="/settings" title="← Back to my tenant" body="Return to tenant-scoped settings for whichever tenant you currently have active." />
        </section>

        <section className="card p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Last audit event</div>
          <div className="mt-2 text-sm">
            {lastAudit ? (
              <>
                <span className="font-semibold text-white">{lastAudit.action}</span>{" "}
                on <span className="font-mono text-cyan-200">{lastAudit.entityType}</span>{" "}
                · {formatDateTime(lastAudit.createdAt)}
              </>
            ) : <span className="text-slate-500">no audit events yet</span>}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}

function Tile({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link href={href} className="card p-6 transition hover:border-cyan-500/50">
      <div className="text-lg font-semibold text-white">{title}</div>
      <p className="mt-2 text-sm text-slate-400">{body}</p>
    </Link>
  );
}
