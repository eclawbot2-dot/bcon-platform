import { AppLayout } from "@/components/layout/app-layout";
import { getDashboardData } from "@/lib/dashboard";
import { formatCurrency, roleLabel } from "@/lib/utils";

export default async function CrmPage() {
  const data = await getDashboardData();

  return (
    <AppLayout
      eyebrow="Pass 5 — Shared services"
      title="CRM & Shared Services"
      description="Enterprise shared-service layer spanning CRM, workforce, workflow engine, compliance direction, historical intelligence, and future back-office modules."
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <section className="card p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">CRM and contact network</div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="panel p-4 min-w-0 overflow-hidden">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Companies</div>
              <div className="mt-2 min-w-0 truncate text-3xl font-semibold tabular-nums text-white">{data?.sharedServices.crm.companyCount ?? 0}</div>
            </div>
            <div className="panel p-4 min-w-0 overflow-hidden">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Contacts</div>
              <div className="mt-2 min-w-0 truncate text-3xl font-semibold tabular-nums text-white">{data?.sharedServices.crm.contactCount ?? 0}</div>
            </div>
            <div className="panel p-4 min-w-0 overflow-hidden">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Markets</div>
              <div className="mt-2 text-sm text-slate-200">{data?.sharedServices.crm.markets.join(" · ") || "No markets seeded"}</div>
            </div>
          </div>
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
            Planned shared-service modules from the PRD: ATS, placements, timesheets, invoicing, contracts, commissions, compliance tracking, federal proposal capture, onboarding pipeline, workflow engine, and audit logging.
          </div>
        </section>

        <section className="card p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Workforce and role templates</div>
          <div className="mt-4 space-y-3">
            {data?.tenant.members.map((member) => (
              <div key={`${member.email}-${member.role}`} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="font-medium text-white">{member.user}</div>
                <div className="mt-1 text-sm text-slate-400">{member.email}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="badge-blue">{roleLabel(member.role)}</span>
                  <span className="badge-gray">{member.businessUnit}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-6 xl:col-span-2">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Historical bid and estimating intelligence</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 text-sm text-slate-300">
            {data?.sharedServices.historicalEstimates.map((estimate) => (
              <div key={estimate.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="font-medium text-white">{estimate.title}</div>
                <div className="mt-1 text-xs text-slate-500">{estimate.mode} · {estimate.projectType} · {estimate.geography}</div>
                <div className="mt-2 text-xs text-cyan-200">Code: {estimate.lineItemCode}</div>
                <div className="mt-1 text-xs text-slate-400">Unit cost: {estimate.unitCost == null ? "—" : formatCurrency(estimate.unitCost)} · Production rate: {estimate.productionRate ?? "—"}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
