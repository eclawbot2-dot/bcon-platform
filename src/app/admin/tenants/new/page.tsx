import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { ProjectMode } from "@prisma/client";
import { currentSuperAdmin } from "@/lib/permissions";
import { modeLabel } from "@/lib/utils";

export default async function NewTenantPage() {
  // No data fetched here, but gate for consistency with every other /admin
  // page (layouts and pages render in parallel — see admin/audit/page.tsx).
  if (!(await currentSuperAdmin())) return null;
  return (
    <AppLayout eyebrow="Super admin" title="Create new tenant" description="Spin up a new company on the platform. This creates the tenant, a default business unit, and a first ADMIN user.">
      <div className="grid gap-6">
        <section className="card p-6">
          <form action="/api/admin/tenants/create" method="post" className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div><label className="form-label">Company name *</label><input name="name" required className="form-input" placeholder="Acme Construction Co." /></div>
              <div><label className="form-label">Slug * (URL-safe)</label><input name="slug" required pattern="[a-z0-9-]+" className="form-input" placeholder="acme-construction" /></div>
            </div>

            <div>
              <label className="form-label">Operating modes *</label>
              <div className="grid gap-3 md:grid-cols-3 mt-2">
                {Object.values(ProjectMode).map((m) => (
                  <label key={m} className="panel p-4 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" name="enabledModes" value={m} defaultChecked={m === "VERTICAL"} />
                      <span className="font-semibold text-white">{modeLabel(m)}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">{m === "SIMPLE" ? "Remodels, custom homes, single-trade GCs." : m === "VERTICAL" ? "Commercial, multifamily, institutional." : "Utilities, roadway, earthwork."}</p>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="form-label">Primary mode *</label>
                <select name="primaryMode" required defaultValue="VERTICAL" className="form-select">
                  {Object.values(ProjectMode).map((m) => <option key={m} value={m}>{modeLabel(m)}</option>)}
                </select>
              </div>
              <div><label className="form-label">Region (optional)</label><input name="region" className="form-input" placeholder="Southeast / Charleston / etc." /></div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div><label className="form-label">Business unit name</label><input name="businessUnitName" defaultValue="Main" className="form-input" /></div>
            </div>

            <div className="border-t border-white/10 pt-4">
              <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">First ADMIN user</div>
              <div className="grid gap-3 md:grid-cols-2 mt-3">
                <div><label className="form-label">Admin name</label><input name="adminName" className="form-input" placeholder="Jane Admin" /></div>
                <div><label className="form-label">Admin email</label><input name="adminEmail" type="email" className="form-input" placeholder="admin@acme.com" /></div>
              </div>
              <p className="mt-2 text-xs text-slate-500">A temporary random password is generated; the admin can reset it via standard flow.</p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" name="switchTo" defaultChecked />
                Switch into this tenant after creation
              </label>
            </div>

            <div className="flex gap-3 pt-2">
              <button type="submit" className="btn-primary">Create tenant</button>
              <Link href="/admin/tenants" className="btn-outline">Cancel</Link>
            </div>
          </form>
        </section>
      </div>
    </AppLayout>
  );
}
