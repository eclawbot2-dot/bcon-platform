import { notFound } from "next/navigation";
import { DetailShell, DetailGrid, DetailField } from "@/components/layout/detail-shell";
import { StatTile } from "@/components/ui/stat-tile";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDate, formatDateTime } from "@/lib/utils";
import { toNum } from "@/lib/money";
import { Gavel } from "lucide-react";

const STAGES = ["IDENTIFIED", "QUALIFYING", "CAPTURE", "PROPOSAL", "EVALUATION", "AWARDED", "LOST", "WITHDRAWN"] as const;
const SET_ASIDES = ["NONE", "SMALL_BUSINESS", "WOSB", "EDWOSB", "HUBZONE", "EIGHT_A", "SDVOSB", "TOTAL_SMALL_BUSINESS", "PARTIAL_SMALL_BUSINESS"] as const;
const PHASES = ["PINK", "RED", "GOLD", "WHITE", "BLACK", "GREEN"] as const;

type MilestoneRow = { id: string; label: string; dueAt: Date; completedAt: Date | null; ownerName: string | null };
type ReviewRow = { id: string; phase: string; scheduledAt: Date; facilitator: string | null; scoreOverall: number | null };
type DecisionRow = { id: string; decisionAt: Date; decision: string; decidedBy: string; rationale: string; pwinAtDecision: number | null };
type PartnerRow = { id: string; partnerName: string; role: string; workSharePct: number | null; taSignedAt: Date | null };

export default async function CaptureDetailPage({ params }: { params: Promise<{ captureId: string }> }) {
  const { captureId } = await params;
  const tenant = await requireTenant();

  const capture = await prisma.captureRecord.findFirst({
    where: { id: captureId, tenantId: tenant.id },
    include: {
      milestones: { orderBy: { dueAt: "asc" } },
      colorTeamReviews: { orderBy: { scheduledAt: "asc" } },
      decisions: { orderBy: { decisionAt: "desc" } },
      teamingPartners: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!capture) notFound();

  const milestoneRows: MilestoneRow[] = capture.milestones;
  const reviewRows: ReviewRow[] = capture.colorTeamReviews;
  const decisionRows: DecisionRow[] = capture.decisions;
  const partnerRows: PartnerRow[] = capture.teamingPartners;

  const milestoneColumns: DataTableColumn<MilestoneRow>[] = [
    { key: "label", header: "Milestone", render: (m) => m.label },
    { key: "dueAt", header: "Due", cellClassName: "text-xs", render: (m) => formatDate(m.dueAt) },
    {
      key: "completedAt",
      header: "Completed",
      cellClassName: "text-xs",
      render: (m) => (m.completedAt ? <span className="text-emerald-300">{formatDate(m.completedAt)}</span> : <span className="text-slate-500">pending</span>),
    },
    { key: "owner", header: "Owner", cellClassName: "text-xs", sortValue: (m) => m.ownerName ?? "", render: (m) => m.ownerName ?? "—" },
  ];

  const reviewColumns: DataTableColumn<ReviewRow>[] = [
    { key: "phase", header: "Phase", render: (r) => r.phase },
    { key: "scheduled", header: "Scheduled", cellClassName: "text-xs", sortValue: (r) => r.scheduledAt ?? null, render: (r) => formatDate(r.scheduledAt) },
    { key: "facilitator", header: "Facilitator", cellClassName: "text-xs", sortValue: (r) => r.facilitator ?? "", render: (r) => r.facilitator ?? "—" },
    { key: "score", header: "Score", cellClassName: "text-xs text-right", sortValue: (r) => r.scoreOverall ?? null, render: (r) => (r.scoreOverall != null ? `${r.scoreOverall}/100` : "—") },
  ];

  const decisionColumns: DataTableColumn<DecisionRow>[] = [
    { key: "when", header: "When", cellClassName: "text-xs", sortValue: (d) => d.decisionAt, render: (d) => formatDateTime(d.decisionAt) },
    { key: "decision", header: "Decision", render: (d) => d.decision.replace(/_/g, " ") },
    { key: "by", header: "By", cellClassName: "text-xs", sortValue: (d) => d.decidedBy, render: (d) => d.decidedBy },
    { key: "pwin", header: "pWin", cellClassName: "text-xs text-right", sortValue: (d) => d.pwinAtDecision ?? null, render: (d) => (d.pwinAtDecision != null ? `${d.pwinAtDecision}%` : "—") },
    { key: "rationale", header: "Rationale", cellClassName: "text-xs", render: (d) => d.rationale },
  ];

  const partnerColumns: DataTableColumn<PartnerRow>[] = [
    { key: "name", header: "Partner", sortValue: (p) => p.partnerName, render: (p) => p.partnerName },
    { key: "role", header: "Role", render: (p) => p.role },
    { key: "share", header: "Workshare", cellClassName: "text-xs text-right", sortValue: (p) => p.workSharePct ?? null, render: (p) => (p.workSharePct != null ? `${p.workSharePct}%` : "—") },
    { key: "ta", header: "TA signed", cellClassName: "text-xs", sortValue: (p) => p.taSignedAt ?? null, render: (p) => (p.taSignedAt ? formatDate(p.taSignedAt) : "—") },
  ];

  return (
    <DetailShell
      eyebrow={`Bids · Capture · ${capture.stage.replace(/_/g, " ")}`}
      title={capture.title}
      subtitle={[capture.agency, capture.contractVehicle, capture.solicitationNumber].filter(Boolean).join(" · ") || "Federal pursuit"}
      crumbs={[
        { label: "Bids", href: "/bids" },
        { label: "Capture", href: "/bids/capture" },
        { label: capture.title },
      ]}
    >
      <section className="grid gap-4 md:grid-cols-4">
        <StatTile label="Stage" value={capture.stage.replace(/_/g, " ")} />
        <StatTile label="Est. value" value={capture.estimatedValue ? `$${(toNum(capture.estimatedValue) / 1_000_000).toFixed(2)}M` : "—"} />
        <StatTile label="pWin" value={capture.pwinPercent != null ? `${capture.pwinPercent}%` : "—"} tone={capture.pwinPercent && capture.pwinPercent >= 30 ? "good" : "warn"} />
        <StatTile label="Proposal due" value={capture.proposalDueDate ? formatDate(capture.proposalDueDate) : "—"} />
      </section>

      <section className="card p-6">
        <div className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--accent, #67e8f9)" }}>Pursuit details</div>
        <form action={`/api/capture/records/${capture.id}/edit`} method="post" className="mt-4 grid gap-3 md:grid-cols-2">
          <div><label htmlFor="cap-title" className="form-label">Title</label><input id="cap-title" name="title" required defaultValue={capture.title} className="form-input" /></div>
          <div><label htmlFor="cap-stage" className="form-label">Stage</label><select id="cap-stage" name="stage" defaultValue={capture.stage} className="form-select">{STAGES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</select></div>
          <div><label htmlFor="cap-agency" className="form-label">Agency</label><input id="cap-agency" name="agency" defaultValue={capture.agency ?? ""} className="form-input" /></div>
          <div><label htmlFor="cap-sub" className="form-label">Sub-agency</label><input id="cap-sub" name="subAgency" defaultValue={capture.subAgency ?? ""} className="form-input" /></div>
          <div><label htmlFor="cap-veh" className="form-label">Contract vehicle</label><input id="cap-veh" name="contractVehicle" defaultValue={capture.contractVehicle ?? ""} className="form-input" /></div>
          <div><label htmlFor="cap-sol" className="form-label">Solicitation #</label><input id="cap-sol" name="solicitationNumber" defaultValue={capture.solicitationNumber ?? ""} className="form-input" /></div>
          <div><label htmlFor="cap-naics" className="form-label">NAICS</label><input id="cap-naics" name="naicsCode" defaultValue={capture.naicsCode ?? ""} className="form-input" /></div>
          <div><label htmlFor="cap-sa" className="form-label">Set-aside</label><select id="cap-sa" name="setAside" defaultValue={capture.setAside} className="form-select">{SET_ASIDES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</select></div>
          <div><label htmlFor="cap-val" className="form-label">Estimated value ($)</label><input id="cap-val" name="estimatedValue" type="number" step="1000" defaultValue={capture.estimatedValue == null ? "" : toNum(capture.estimatedValue)} className="form-input" /></div>
          <div><label htmlFor="cap-pwin" className="form-label">pWin (%)</label><input id="cap-pwin" name="pwinPercent" type="number" min={0} max={100} step="1" defaultValue={capture.pwinPercent ?? ""} className="form-input" /></div>
          <div><label htmlFor="cap-rfp" className="form-label">RFP release</label><input id="cap-rfp" name="rfpReleaseDate" type="date" defaultValue={capture.rfpReleaseDate?.toISOString().slice(0, 10) ?? ""} className="form-input" /></div>
          <div><label htmlFor="cap-due" className="form-label">Proposal due</label><input id="cap-due" name="proposalDueDate" type="date" defaultValue={capture.proposalDueDate?.toISOString().slice(0, 10) ?? ""} className="form-input" /></div>
          <div><label htmlFor="cap-cl" className="form-label">Capture lead</label><input id="cap-cl" name="captureLead" defaultValue={capture.captureLead ?? ""} className="form-input" /></div>
          <div><label htmlFor="cap-pl" className="form-label">Proposal lead</label><input id="cap-pl" name="proposalLead" defaultValue={capture.proposalLead ?? ""} className="form-input" /></div>
          <div className="md:col-span-2"><label htmlFor="cap-strat" className="form-label">Win strategy</label><textarea id="cap-strat" name="winStrategy" rows={2} defaultValue={capture.winStrategy ?? ""} className="form-textarea" /></div>
          <div className="md:col-span-2"><label htmlFor="cap-disc" className="form-label">Discriminators</label><textarea id="cap-disc" name="discriminators" rows={2} defaultValue={capture.discriminators ?? ""} className="form-textarea" /></div>
          <div className="md:col-span-2"><button className="btn-primary">Save</button></div>
        </form>
      </section>

      <section className="card p-6">
        <div className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--accent, #67e8f9)" }}>Milestones · {milestoneRows.length}</div>
        <form action={`/api/capture/records/${capture.id}/milestone`} method="post" className="mt-4 grid gap-3 md:grid-cols-[2fr_auto_1fr_auto]">
          <input name="label" required placeholder="Milestone label" aria-label="Milestone label" className="form-input" />
          <input name="dueAt" type="date" required aria-label="Due date" className="form-input" />
          <input name="ownerName" placeholder="Owner" aria-label="Owner" className="form-input" />
          <button className="btn-primary">Add milestone</button>
        </form>
        <div className="mt-4">
          {milestoneRows.length === 0 ? (
            <EmptyState icon={Gavel} title="No milestones yet" description="Pink team, red team, and submit are common starting points." />
          ) : (
            <DataTable columns={milestoneColumns} rows={milestoneRows} rowKey={(m) => m.id} />
          )}
        </div>
      </section>

      <section className="card p-6">
        <div className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--accent, #67e8f9)" }}>Color team reviews · {reviewRows.length}</div>
        <form action={`/api/capture/records/${capture.id}/color-team`} method="post" className="mt-4 grid gap-3 md:grid-cols-[auto_auto_1fr_auto_auto]">
          <select name="phase" defaultValue="PINK" aria-label="Color phase" className="form-select">
            {PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input name="scheduledAt" type="date" required aria-label="Scheduled date" className="form-input" />
          <input name="facilitator" placeholder="Facilitator" aria-label="Facilitator" className="form-input" />
          <input name="scoreOverall" type="number" min={0} max={100} placeholder="Score" aria-label="Overall score (0-100)" className="form-input w-24" />
          <button className="btn-primary">Schedule</button>
        </form>
        <div className="mt-4">
          {reviewRows.length === 0 ? (
            <EmptyState icon={Gavel} title="No color reviews scheduled" description="Schedule a pink/red/gold review to gate the proposal at each phase." />
          ) : (
            <DataTable columns={reviewColumns} rows={reviewRows} rowKey={(r) => r.id} />
          )}
        </div>
      </section>

      <section className="card p-6">
        <div className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--accent, #67e8f9)" }}>Teaming partners · {partnerRows.length}</div>
        <form action={`/api/capture/records/${capture.id}/partner`} method="post" className="mt-4 grid gap-3 md:grid-cols-[2fr_2fr_auto_auto_auto]">
          <input name="partnerName" required placeholder="Partner name" aria-label="Partner name" className="form-input" />
          <input name="role" required placeholder="Role (Prime / Sub / Specialty)" aria-label="Role" className="form-input" />
          <input name="workSharePct" type="number" min={0} max={100} placeholder="Share %" aria-label="Workshare percent" className="form-input w-24" />
          <input name="taSignedAt" type="date" placeholder="TA signed" aria-label="Teaming agreement signed date" className="form-input" />
          <button className="btn-primary">Add partner</button>
        </form>
        <div className="mt-4">
          {partnerRows.length === 0 ? (
            <EmptyState icon={Gavel} title="No teaming partners" description="Add primes, subs, or specialty partners with workshare and TA dates." />
          ) : (
            <DataTable columns={partnerColumns} rows={partnerRows} rowKey={(p) => p.id} />
          )}
        </div>
      </section>

      <section className="card p-6">
        <div className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--accent, #67e8f9)" }}>Decision log · {decisionRows.length}</div>
        <DetailGrid>
          <DetailField label="Capture id"><span className="font-mono text-xs">{capture.id}</span></DetailField>
          <DetailField label="Created">{formatDate(capture.createdAt)}</DetailField>
          <DetailField label="Last updated">{formatDate(capture.updatedAt)}</DetailField>
        </DetailGrid>
        <div className="mt-4">
          {decisionRows.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--faint)" }}>No decisions logged. Use the Decide column on the capture list to record GO / NO_GO / CONDITIONAL_GO / DEFERRED.</p>
          ) : (
            <DataTable columns={decisionColumns} rows={decisionRows} rowKey={(d) => d.id} />
          )}
        </div>
      </section>
    </DetailShell>
  );
}
