import { AppLayout } from "@/components/layout/app-layout";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDate } from "@/lib/utils";

async function load(tenantId: string) {
  const portals = await prisma.jurisdictionPortal.findMany({ orderBy: { name: "asc" } });
  const accounts = await prisma.tenantJurisdictionAccount.findMany({ where: { tenantId } });
  const byPortal = new Map(accounts.map((a) => [a.portalId, a]));
  return portals.map((p) => ({ portal: p, account: byPortal.get(p.id) ?? null }));
}

export default async function JurisdictionSettingsPage() {
  const tenant = await requireTenant();
  const rows = await load(tenant.id);

  return (
    <AppLayout
      eyebrow="Settings · Integrations"
      title="Charleston-area portal credentials"
      description="Per-portal login info for the inspections cron. Credentials are encrypted at rest with BCON_VAULT_KEY (AES-256-GCM, derived per tenant) and never displayed back in plaintext."
    >
      <div className="grid gap-4">
        {rows.map(({ portal, account }) => (
          <form key={portal.id} action="/api/jurisdictions/save" method="post" className="panel p-5 grid gap-3">
            <input type="hidden" name="portalId" value={portal.id} />
            <header className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-slate-100">{portal.name}</div>
                <div className="text-xs text-slate-400">{portal.platformNote}</div>
                {portal.baseUrl ? (
                  <a href={portal.baseUrl} target="_blank" rel="noreferrer" className="text-xs text-cyan-300 hover:underline truncate block max-w-md mt-1">
                    {portal.baseUrl}
                  </a>
                ) : null}
              </div>
              <div className="text-xs text-right">
                <div className="text-slate-400">
                  {account?.active ? <span className="text-emerald-300">● Active</span> : <span className="text-slate-500">○ Inactive</span>}
                </div>
                <div className="text-slate-500 mt-1">Last sync: {formatDate(account?.lastSyncedAt ?? null)}</div>
                {account?.lastSyncOk === false ? (
                  <div className="text-rose-300 mt-1 max-w-xs truncate">{account.lastSyncNote ?? "error"}</div>
                ) : null}
              </div>
            </header>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-xs uppercase tracking-[0.18em] text-slate-400">
                Username
                <input
                  type="text"
                  name="username"
                  defaultValue=""
                  placeholder={account?.usernameEnc ? "••••••• (set — overwrite by typing)" : "not set"}
                  className="form-input mt-1"
                  autoComplete="off"
                />
              </label>
              <label className="text-xs uppercase tracking-[0.18em] text-slate-400">
                Password
                <input
                  type="password"
                  name="password"
                  defaultValue=""
                  placeholder={account?.passwordEnc ? "••••••• (set — overwrite by typing)" : "not set"}
                  className="form-input mt-1"
                  autoComplete="new-password"
                />
              </label>
              <label className="text-xs uppercase tracking-[0.18em] text-slate-400">
                Account label
                <input type="text" name="accountLabel" defaultValue={account?.accountLabel ?? ""} className="form-input mt-1" />
              </label>
            </div>

            <div className="flex items-center justify-between gap-3">
              <label className="text-xs text-slate-400 flex items-center gap-2">
                <input type="checkbox" name="active" defaultChecked={account?.active ?? true} />
                Active (included in cron runs)
              </label>
              <button type="submit" className="btn-primary text-sm">Save</button>
            </div>
          </form>
        ))}
      </div>
    </AppLayout>
  );
}
