import { notFound } from "next/navigation";
import { DetailShell, DetailGrid, DetailField } from "@/components/layout/detail-shell";
import { SortableTable } from "@/components/SortableTable";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { PrintButton } from "@/components/ui/print-button";
import { ApprovalSection, ActivityTrail } from "@/components/approval-section";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { currentActor } from "@/lib/permissions";
import { listComments } from "@/lib/approvals";
import { formatCurrency, formatDate, formatPercent } from "@/lib/utils";
import { sumMoney, subtractMoney, toNum } from "@/lib/money";

export default async function PayAppDetailPage({ params }: { params: Promise<{ projectId: string; appId: string }> }) {
  const { projectId, appId } = await params;
  const tenant = await requireTenant();
  const actor = await currentActor(tenant.id);
  const app = await prisma.payApplication.findFirst({
    where: { id: appId, project: { id: projectId, tenantId: tenant.id } },
    include: { project: true, contract: true, lines: { orderBy: { lineNumber: "asc" } } },
  });
  if (!app) notFound();
  const comments = await listComments(tenant.id, "PayApplication", app.id);

  const totalScheduled = sumMoney(app.lines.map((l) => l.scheduledValue));
  const totalCompleted = sumMoney(app.lines.map((l) => l.totalCompleted));
  const overallPct = totalScheduled > 0 ? (totalCompleted / totalScheduled) * 100 : 0;

  const actions: Array<{ name: string; label: string; tone: "primary" | "outline" | "danger"; requireReason?: boolean; formAction: string }> = [];
  if ((app.status === "DRAFT" || app.status === "REJECTED") && actor.canEdit) actions.push({ name: "submit", label: "Submit for approval", tone: "primary", formAction: `/api/pay-apps/${app.id}/submit` });
  if ((app.status === "SUBMITTED" || app.status === "PENDING_APPROVAL") && actor.isManager) {
    actions.push({ name: "approve", label: "Approve", tone: "primary", formAction: `/api/pay-apps/${app.id}/approve` });
    actions.push({ name: "reject", label: "Reject", tone: "danger", requireReason: true, formAction: `/api/pay-apps/${app.id}/reject` });
  }
  if (app.status === "APPROVED" && actor.isManager) actions.push({ name: "pay", label: "Mark paid", tone: "primary", formAction: `/api/pay-apps/${app.id}/pay` });

  return (
    <DetailShell
      eyebrow={`${app.project.code} · Pay app #${app.periodNumber}`}
      title={`AIA G702/G703 — ${formatDate(app.periodFrom)} → ${formatDate(app.periodTo)}`}
      subtitle={app.contract ? `Against ${app.contract.title}` : undefined}
      crumbs={[{ label: "Projects", href: "/projects" }, { label: app.project.code, href: `/projects/${app.project.id}` }, { label: "Pay apps", href: `/projects/${app.project.id}/pay-apps` }, { label: `#${app.periodNumber}` }]}
      actions={(
        <div className="flex items-center gap-2">
          <StatusBadge status={app.status} />
          <a
            href={`/api/pay-applications/${app.id}/g702`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-outline text-xs"
            title="Print-ready AIA G702/G703 document — use the browser print dialog to save as PDF"
          >
            G702/G703 document
          </a>
          <PrintButton label="Print G702/G703" />
        </div>
      )}
    >
      <section className="grid gap-4 md:grid-cols-4">
        <StatTile label="Original contract" value={formatCurrency(app.originalContractValue)} />
        <StatTile label="Change orders" value={formatCurrency(app.changeOrderValue)} tone={toNum(app.changeOrderValue) > 0 ? "warn" : "default"} />
        <StatTile label="Current contract" value={formatCurrency(app.totalContractValue)} />
        <StatTile label="Overall % complete" value={formatPercent(overallPct)} tone={overallPct >= 50 ? "good" : "warn"} />
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <StatTile label="Work completed" value={formatCurrency(app.workCompletedToDate)} tone="good" />
        <StatTile label="Materials stored" value={formatCurrency(app.materialsStoredToDate)} />
        <StatTile label="Retainage held" value={formatCurrency(app.retainageHeld)} sub={`${app.retainagePct}%`} tone="warn" />
        <StatTile label="Payment due now" value={formatCurrency(app.currentPaymentDue)} tone={toNum(app.currentPaymentDue) > 0 ? "good" : "default"} />
      </section>

      <section className="card p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Application detail</div>
        <DetailGrid>
          <DetailField label="Period">{formatDate(app.periodFrom)} → {formatDate(app.periodTo)}</DetailField>
          <DetailField label="Contract">{app.contract?.contractNumber ?? "—"}</DetailField>
          <DetailField label="Submitted">{formatDate(app.submittedAt)}{app.submittedBy ? ` by ${app.submittedBy}` : ""}</DetailField>
          <DetailField label="Approved">{formatDate(app.approvedAt)}{app.approvedBy ? ` by ${app.approvedBy}` : ""}</DetailField>
          <DetailField label="Rejected">{formatDate(app.rejectedAt)}{app.rejectedBy ? ` by ${app.rejectedBy}` : ""}</DetailField>
          <DetailField label="Paid">{formatDate(app.paidAt)}{app.paidBy ? ` by ${app.paidBy}` : ""}</DetailField>
          <DetailField label="Less previous payments">{formatCurrency(app.lessPreviousPayments)}</DetailField>
          <DetailField label="Notes">{app.notes ?? "—"}</DetailField>
          {app.approvalNote ? <DetailField label="Approval note">{app.approvalNote}</DetailField> : null}
          {app.rejectionReason ? <DetailField label="Rejection reason"><span className="text-rose-200">{app.rejectionReason}</span></DetailField> : null}
        </DetailGrid>
      </section>

      <ApprovalSection title="Actions" status={app.status} actions={actions} actorName={actor.userName} actorRole={actor.role} isManager={actor.isManager} />

      {actor.canEdit && (app.status === "DRAFT" || app.status === "REJECTED" || actor.isManager) ? (
        <section className="card p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Edit application</div>
          {(app.status === "APPROVED" || app.status === "PAID") ? <div className="mt-2 text-xs text-amber-300">Editing an {app.status.toLowerCase()} application reverts status to SUBMITTED.</div> : null}
          <form action={`/api/pay-apps/${app.id}/edit`} method="post" className="mt-4 grid gap-3 md:grid-cols-3">
            <div><label className="form-label">Work completed to date ($)</label><input name="workCompletedToDate" type="number" step="0.01" defaultValue={toNum(app.workCompletedToDate)} className="form-input" /></div>
            <div><label className="form-label">Materials stored ($)</label><input name="materialsStoredToDate" type="number" step="0.01" defaultValue={toNum(app.materialsStoredToDate)} className="form-input" /></div>
            <div><label className="form-label">Retainage held ($)</label><input name="retainageHeld" type="number" step="0.01" defaultValue={toNum(app.retainageHeld)} className="form-input" /></div>
            <div><label className="form-label">Current payment due ($)</label><input name="currentPaymentDue" type="number" step="0.01" defaultValue={toNum(app.currentPaymentDue)} className="form-input" /></div>
            <div className="md:col-span-2"><label className="form-label">Notes</label><input name="notes" defaultValue={app.notes ?? ""} className="form-input" /></div>
            <div className="md:col-span-3"><button className="btn-primary">Save changes</button></div>
          </form>
        </section>
      ) : null}

      <section className="card p-0 overflow-hidden">
        <div className="px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">Schedule of values (G703)</div>
        <div className="overflow-x-auto">
          <SortableTable
            className="min-w-full divide-y divide-white/10"
            columns={[
              { header: "Line" },
              { header: "Cost code" },
              { header: "Description" },
              { header: "Scheduled value" },
              { header: "Prior work" },
              { header: "This period" },
              { header: "Materials stored" },
              { header: "Total completed" },
              { header: "% complete" },
              { header: "Balance to finish" },
              { header: "Retainage" },
            ]}
            rows={app.lines.map((l) => ({
              key: l.id,
              className: "transition hover:bg-white/5",
              cells: [
                { sort: l.lineNumber, node: l.lineNumber, tdClassName: "font-mono text-xs text-slate-400" },
                { sort: l.costCode ?? "", node: l.costCode ?? "—", tdClassName: "font-mono text-xs text-slate-400" },
                { sort: l.description, node: l.description },
                { sort: toNum(l.scheduledValue), node: formatCurrency(l.scheduledValue) },
                { sort: toNum(l.workCompletedPrev), node: formatCurrency(l.workCompletedPrev), tdClassName: "text-slate-400" },
                { sort: toNum(l.workCompletedThis), node: formatCurrency(l.workCompletedThis), tdClassName: "font-medium text-white" },
                { sort: toNum(l.materialsStored), node: formatCurrency(l.materialsStored) },
                { sort: toNum(l.totalCompleted), node: formatCurrency(l.totalCompleted) },
                { sort: toNum(l.percentComplete), node: formatPercent(l.percentComplete) },
                { sort: toNum(l.balanceToFinish), node: formatCurrency(l.balanceToFinish), tdClassName: "text-slate-400" },
                { sort: toNum(l.retainage), node: formatCurrency(l.retainage) },
              ],
            }))}
          />
          {/* Non-record totals row preserved as a separate summary table below the sortable data. */}
          <table className="min-w-full divide-y divide-white/10">
            <tbody>
              <tr className="bg-white/5">
                <td className="table-cell" colSpan={3}><span className="text-slate-400">Total</span></td>
                <td className="table-cell font-semibold text-white">{formatCurrency(totalScheduled)}</td>
                <td colSpan={3} className="table-cell" />
                <td className="table-cell font-semibold text-white">{formatCurrency(totalCompleted)}</td>
                <td className="table-cell font-semibold text-white">{formatPercent(overallPct)}</td>
                <td className="table-cell font-semibold text-white">{formatCurrency(subtractMoney(totalScheduled, totalCompleted))}</td>
                <td className="table-cell font-semibold text-white">{formatCurrency(app.retainageHeld)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <ActivityTrail comments={comments} commentAction={`/api/records/PayApplication/${app.id}/comment`} />
    </DetailShell>
  );
}
