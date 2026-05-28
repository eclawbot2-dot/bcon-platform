import { notFound } from "next/navigation";
import { DetailShell, DetailGrid, DetailField } from "@/components/layout/detail-shell";
import { SortableTable } from "@/components/SortableTable";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApprovalSection, ActivityTrail } from "@/components/approval-section";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { currentActor } from "@/lib/permissions";
import { listComments } from "@/lib/approvals";
import { changeOrderKindLabel, formatCurrency, formatDate } from "@/lib/utils";
import { sumMoney, multiplyMoney, addMoney, toNum } from "@/lib/money";

export default async function ChangeOrderDetailPage({ params }: { params: Promise<{ projectId: string; coId: string }> }) {
  const { projectId, coId } = await params;
  const tenant = await requireTenant();
  const actor = await currentActor(tenant.id);
  const co = await prisma.changeOrder.findFirst({
    where: { id: coId, project: { id: projectId, tenantId: tenant.id } },
    include: { project: true, lines: { orderBy: { createdAt: "asc" } } },
  });
  if (!co) notFound();
  const comments = await listComments(tenant.id, "ChangeOrder", co.id);

  const subtotal = sumMoney(co.lines.map((l) => l.amount));
  const markup = multiplyMoney(subtotal, co.markupPct / 100);
  const calculated = addMoney(subtotal, markup);
  const byCategory = co.lines.reduce<Record<string, number>>((acc, l) => { acc[l.category] = addMoney(acc[l.category] ?? 0, l.amount); return acc; }, {});

  const actions: Array<{ name: string; label: string; tone: "primary" | "outline" | "danger"; requireReason?: boolean; formAction: string }> = [];
  if ((co.status === "DRAFT" || co.status === "REJECTED") && actor.canEdit) actions.push({ name: "submit", label: "Submit for approval", tone: "primary", formAction: `/api/change-orders/${co.id}/submit` });
  if (co.status === "PENDING" && actor.isManager) {
    actions.push({ name: "approve", label: "Approve", tone: "primary", formAction: `/api/change-orders/${co.id}/approve` });
    actions.push({ name: "reject", label: "Reject", tone: "danger", requireReason: true, formAction: `/api/change-orders/${co.id}/reject` });
  }

  return (
    <DetailShell
      eyebrow={`${co.project.code} · Change order`}
      title={`${co.coNumber} — ${co.title}`}
      subtitle={co.description ?? undefined}
      crumbs={[{ label: "Projects", href: "/projects" }, { label: co.project.code, href: `/projects/${co.project.id}` }, { label: "Change orders", href: `/projects/${co.project.id}/change-orders` }, { label: co.coNumber }]}
      actions={(
        <div className="flex items-center gap-2">
          <StatusBadge status={co.status} />
          {co.scheduleImpactDays > 0 && (co.status === "APPROVED" || co.status === "EXECUTED") ? (
            <form action={`/api/change-orders/${co.id}/apply-schedule`} method="post">
              <button className="btn-primary text-xs">Apply +{co.scheduleImpactDays}d to schedule</button>
            </form>
          ) : null}
        </div>
      )}
    >
      <section className="grid gap-4 md:grid-cols-4">
        <StatTile label="Kind" value={changeOrderKindLabel(co.kind)} />
        <StatTile label="Net amount" value={formatCurrency(co.amount)} tone="good" />
        <StatTile label="Schedule impact" value={co.scheduleImpactDays ? `${co.scheduleImpactDays}d` : "0d"} tone={co.scheduleImpactDays > 0 ? "warn" : "default"} />
        <StatTile label="Markup %" value={`${co.markupPct}%`} />
      </section>

      <section className="card p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Change order detail</div>
        <DetailGrid>
          <DetailField label="CO number">{co.coNumber}</DetailField>
          <DetailField label="Kind">{changeOrderKindLabel(co.kind)}</DetailField>
          <DetailField label="Reason">{co.reason ?? "—"}</DetailField>
          <DetailField label="Submitted">{formatDate(co.requestedAt)}{co.submittedBy ? ` by ${co.submittedBy}` : ""}</DetailField>
          <DetailField label="Approved">{formatDate(co.approvedAt)}{co.approvedBy ? ` by ${co.approvedBy}` : ""}</DetailField>
          <DetailField label="Rejected">{formatDate(co.rejectedAt)}{co.rejectedBy ? ` by ${co.rejectedBy}` : ""}</DetailField>
          <DetailField label="Executed">{formatDate(co.executedAt)}</DetailField>
          <DetailField label="Linked RFI">{co.linkedRfiId ?? "—"}</DetailField>
          <DetailField label="Linked submittal">{co.linkedSubmittalId ?? "—"}</DetailField>
          {co.approvalNote ? <DetailField label="Approval note">{co.approvalNote}</DetailField> : null}
          {co.rejectionReason ? <DetailField label="Rejection reason"><span className="text-rose-200">{co.rejectionReason}</span></DetailField> : null}
        </DetailGrid>
      </section>

      <ApprovalSection
        title="Actions"
        status={co.status}
        actions={actions}
        actorName={actor.userName}
        actorRole={actor.role}
        isManager={actor.isManager}
      />

      {actor.canEdit && (co.status === "DRAFT" || co.status === "REJECTED" || actor.isManager) ? (
        <section className="card p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Edit change order</div>
          {(co.status === "APPROVED" || co.status === "EXECUTED") ? <div className="mt-2 text-xs text-amber-300">Editing an {co.status.toLowerCase()} CO reverts it to PENDING for re-approval.</div> : null}
          <form action={`/api/change-orders/${co.id}/edit`} method="post" className="mt-4 grid gap-3 md:grid-cols-3">
            <div><label className="form-label">Title</label><input name="title" defaultValue={co.title} className="form-input" /></div>
            <div><label className="form-label">Amount ($)</label><input name="amount" type="number" step="0.01" defaultValue={toNum(co.amount)} className="form-input" /></div>
            <div><label className="form-label">Schedule impact (days)</label><input name="scheduleImpactDays" type="number" defaultValue={co.scheduleImpactDays} className="form-input" /></div>
            <div><label className="form-label">Markup %</label><input name="markupPct" type="number" step="0.01" defaultValue={co.markupPct} className="form-input" /></div>
            <div className="md:col-span-2"><label className="form-label">Reason</label><input name="reason" defaultValue={co.reason ?? ""} className="form-input" /></div>
            <div className="md:col-span-3"><label className="form-label">Description</label><textarea name="description" defaultValue={co.description ?? ""} rows={2} className="form-textarea" /></div>
            <div className="md:col-span-3"><button className="btn-primary">Save changes</button></div>
          </form>
        </section>
      ) : null}

      <section className="card p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Cost breakdown</div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {Object.entries(byCategory).map(([cat, amt]) => (
            <div key={cat} className="panel p-4">
              <div className="text-xs uppercase tracking-[0.16em] text-slate-400">{cat}</div>
              <div className="mt-2 text-xl font-semibold text-white">{formatCurrency(amt)}</div>
            </div>
          ))}
        </div>
        <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
          <SortableTable
            emptyMessage="No line items."
            columns={[
              { header: "Cost code" },
              { header: "Description" },
              { header: "Category" },
              { header: "Qty" },
              { header: "Unit" },
              { header: "Unit cost" },
              { header: "Amount" },
            ]}
            rows={co.lines.map((l) => ({
              key: l.id,
              cells: [
                { sort: l.costCode ?? "", node: l.costCode ?? "—", tdClassName: "font-mono text-xs text-slate-400" },
                { sort: l.description, node: l.description },
                { sort: l.category, node: l.category },
                { sort: l.quantity, node: l.quantity },
                { sort: l.unit ?? "", node: l.unit ?? "—", tdClassName: "text-slate-400" },
                { sort: toNum(l.unitCost), node: formatCurrency(l.unitCost) },
                { sort: toNum(l.amount), node: formatCurrency(l.amount), tdClassName: "font-medium text-white" },
              ],
            }))}
          />
          <table className="min-w-full divide-y divide-white/10">
            <tbody className="divide-y divide-white/10 bg-slate-950/40">
              <tr className="bg-white/5">
                <td className="table-cell" colSpan={6}><span className="text-slate-400">Subtotal</span></td>
                <td className="table-cell font-semibold text-white">{formatCurrency(subtotal)}</td>
              </tr>
              <tr className="bg-white/5">
                <td className="table-cell" colSpan={6}><span className="text-slate-400">Markup ({co.markupPct}%)</span></td>
                <td className="table-cell font-semibold text-white">{formatCurrency(markup)}</td>
              </tr>
              <tr className="bg-cyan-500/10">
                <td className="table-cell" colSpan={6}><span className="text-cyan-200">Calculated total</span></td>
                <td className="table-cell font-semibold text-cyan-100">{formatCurrency(calculated)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <ActivityTrail comments={comments} commentAction={`/api/records/ChangeOrder/${co.id}/comment`} />
    </DetailShell>
  );
}
