import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { prisma } from "@/lib/prisma";
import { currentSuperAdmin } from "@/lib/permissions";

export default async function NewUserPage() {
  // In-page gate — layout-only checks leak page data via the parallel-rendered
  // RSC payload. See admin/audit/page.tsx.
  if (!(await currentSuperAdmin())) return null;
  const tenants = await prisma.tenant.findMany({ orderBy: { name: "asc" } });
  return (
    <AppLayout eyebrow="Super admin" title="Create new user" description="Create a platform user. Optionally promote to super admin immediately, or grant membership into a tenant.">
      <section className="card p-6">
        <form action="/api/admin/users/create" method="post" className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div><label className="form-label">Name *</label><input name="name" required className="form-input" /></div>
            <div><label className="form-label">Email *</label><input name="email" type="email" required className="form-input" /></div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input type="checkbox" name="superAdmin" /> Promote to super admin
            </label>
          </div>
          <div className="border-t border-white/10 pt-4">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Optional — grant into a tenant</div>
            <div className="grid gap-3 md:grid-cols-3 mt-3">
              <div>
                <label className="form-label">Tenant</label>
                <select name="tenantId" className="form-select">
                  <option value="">— skip —</option>
                  {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Role</label>
                <select name="role" defaultValue="MANAGER" className="form-select">
                  {["ADMIN", "EXECUTIVE", "MANAGER", "PROGRAM_MANAGER", "CONTROLLER", "SUPERINTENDENT", "PROJECT_ENGINEER", "FOREMAN", "SAFETY_MANAGER", "QUALITY_MANAGER", "COORDINATOR", "VIEWER"].map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="flex gap-3"><button className="btn-primary">Create user</button><Link href="/admin/users" className="btn-outline">Cancel</Link></div>
        </form>
      </section>
    </AppLayout>
  );
}
