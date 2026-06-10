import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { currentSuperAdmin } from "@/lib/permissions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await currentSuperAdmin();
  if (!admin) {
    return (
      <AppLayout eyebrow="Restricted" title="Super-admin required" description="This area is for platform-wide administrators.">
        <div className="card p-8">
          <div className="text-xs uppercase tracking-[0.2em] text-rose-300">Access denied</div>
          <p className="mt-3 text-sm text-slate-300">You must be a super admin to view this area. Ask a platform super admin to grant your account super-admin access from <span className="font-mono">/admin/users</span>.</p>
          <Link href="/" className="btn-outline text-xs mt-4 inline-flex">← back home</Link>
        </div>
      </AppLayout>
    );
  }
  return (
    <>
      <div className="super-admin-bar">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div><span className="label font-semibold uppercase tracking-[0.2em]">Super admin</span> · logged in as <span className="font-mono">{admin.email ?? admin.name}</span> · changes in this area affect all tenants</div>
          <div className="flex gap-3">
            <Link href="/admin">Admin home</Link>
            <Link href="/admin/tenants">Tenants</Link>
            <Link href="/admin/users">Users</Link>
            <Link href="/admin/portal-coverage">Portals</Link>
            <Link href="/admin/audit">Audit</Link>
            <Link href="/">← exit admin</Link>
          </div>
        </div>
      </div>
      {children}
    </>
  );
}
