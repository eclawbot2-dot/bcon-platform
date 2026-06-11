import Link from "next/link";
import { notFound } from "next/navigation";
import { DetailShell, DetailGrid, DetailField } from "@/components/layout/detail-shell";
import { StatTile } from "@/components/ui/stat-tile";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDate, formatDateTime } from "@/lib/utils";
import { toNum } from "@/lib/money";
import { CandidateStatus } from "@prisma/client";

const STATUSES: CandidateStatus[] = [
  "NEW", "SCREENING", "INTERVIEWING", "OFFER", "HIRED", "REJECTED", "WITHDRAWN", "ARCHIVED",
];

type SubmissionRow = { id: string; reqNumber: string; reqTitle: string; stage: string; submittedAt: Date; recruiterName: string | null; rateOffered: number | null };
type PlacementRow = { id: string; projectCode: string | null; contractRef: string | null; startDate: Date; endDate: Date | null; status: string; billRate: number | null; payRate: number | null };

export default async function CandidateDetailPage({ params }: { params: Promise<{ candidateId: string }> }) {
  const { candidateId } = await params;
  const tenant = await requireTenant();

  const candidate = await prisma.candidate.findFirst({
    where: { id: candidateId, tenantId: tenant.id },
    include: {
      submissions: {
        include: { req: { select: { reqNumber: true, title: true } } },
        orderBy: { submittedAt: "desc" },
      },
      placements: {
        include: { project: { select: { id: true, code: true } } },
        orderBy: { startDate: "desc" },
      },
    },
  });
  if (!candidate) notFound();

  const auditEvents = await prisma.auditEvent.findMany({
    where: { tenantId: tenant.id, entityType: "Candidate", entityId: candidate.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const submissionRows: SubmissionRow[] = candidate.submissions.map((s) => ({
    id: s.id,
    reqNumber: s.req.reqNumber,
    reqTitle: s.req.title,
    stage: s.stage,
    submittedAt: s.submittedAt,
    recruiterName: s.recruiterName,
    rateOffered: s.rateOffered == null ? null : toNum(s.rateOffered),
  }));

  const placementRows: PlacementRow[] = candidate.placements.map((p) => ({
    id: p.id,
    projectCode: p.project?.code ?? null,
    contractRef: p.contractRef,
    startDate: p.startDate,
    endDate: p.endDate,
    status: p.status,
    billRate: p.billRate == null ? null : toNum(p.billRate),
    payRate: p.payRate == null ? null : toNum(p.payRate),
  }));

  const submissionColumns: DataTableColumn<SubmissionRow>[] = [
    { key: "req", header: "Requisition", sortValue: (s) => `${s.reqNumber} · ${s.reqTitle}`, render: (s) => `${s.reqNumber} · ${s.reqTitle}` },
    { key: "stage", header: "Stage", render: (s) => s.stage.replace(/_/g, " ") },
    { key: "recruiter", header: "Recruiter", cellClassName: "text-xs", sortValue: (s) => s.recruiterName ?? "", render: (s) => s.recruiterName ?? "—" },
    { key: "rate", header: "Rate offered", cellClassName: "text-xs text-right", sortValue: (s) => s.rateOffered ?? null, render: (s) => (s.rateOffered ? `$${s.rateOffered}` : "—") },
    { key: "submitted", header: "Submitted", cellClassName: "text-xs text-slate-400", sortValue: (s) => s.submittedAt ?? null, render: (s) => formatDate(s.submittedAt) },
  ];

  const placementColumns: DataTableColumn<PlacementRow>[] = [
    { key: "project", header: "Project", sortValue: (p) => p.projectCode ?? "", render: (p) => p.projectCode ?? "—" },
    { key: "contract", header: "Contract", cellClassName: "text-xs", sortValue: (p) => p.contractRef ?? "", render: (p) => p.contractRef ?? "—" },
    { key: "start", header: "Start", cellClassName: "text-xs", sortValue: (p) => p.startDate ?? null, render: (p) => formatDate(p.startDate) },
    { key: "end", header: "End", cellClassName: "text-xs", sortValue: (p) => p.endDate ?? null, render: (p) => (p.endDate ? formatDate(p.endDate) : "open") },
    { key: "rates", header: "Bill / Pay", cellClassName: "text-xs text-right", sortValue: (p) => p.billRate ?? null, render: (p) => `$${p.billRate ?? "?"} / $${p.payRate ?? "?"}` },
    { key: "status", header: "Status", render: (p) => p.status.replace(/_/g, " ") },
  ];

  return (
    <DetailShell
      eyebrow={`People · ATS · ${candidate.status.replace("_", " ")}`}
      title={`${candidate.firstName} ${candidate.lastName}`}
      subtitle={candidate.email ?? candidate.phone ?? candidate.laborCategory ?? "Candidate"}
      crumbs={[
        { label: "People", href: "/people" },
        { label: "ATS", href: "/people/ats" },
        { label: `${candidate.firstName} ${candidate.lastName}` },
      ]}
    >
      <section className="grid gap-4 md:grid-cols-4">
        <StatTile label="Submissions" value={candidate.submissions.length} />
        <StatTile label="Placements" value={candidate.placements.length} />
        <StatTile label="Status" value={candidate.status.replace("_", " ")} />
        <StatTile label="Rate exp." value={candidate.rateExpectation ? `$${candidate.rateExpectation}` : "—"} />
      </section>

      <section className="card p-6">
        <div className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--accent, #67e8f9)" }}>Identity & contact</div>
        <form action={`/api/ats/candidates/${candidate.id}/edit`} method="post" className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="cd-first" className="form-label">First name</label>
            <input id="cd-first" name="firstName" defaultValue={candidate.firstName} required className="form-input" />
          </div>
          <div>
            <label htmlFor="cd-last" className="form-label">Last name</label>
            <input id="cd-last" name="lastName" defaultValue={candidate.lastName} required className="form-input" />
          </div>
          <div>
            <label htmlFor="cd-email" className="form-label">Email</label>
            <input id="cd-email" name="email" type="email" defaultValue={candidate.email ?? ""} className="form-input" />
          </div>
          <div>
            <label htmlFor="cd-phone" className="form-label">Phone</label>
            <input id="cd-phone" name="phone" defaultValue={candidate.phone ?? ""} className="form-input" />
          </div>
          <div>
            <label htmlFor="cd-city" className="form-label">City</label>
            <input id="cd-city" name="city" defaultValue={candidate.city ?? ""} className="form-input" />
          </div>
          <div>
            <label htmlFor="cd-state" className="form-label">State</label>
            <input id="cd-state" name="state" defaultValue={candidate.state ?? ""} className="form-input" />
          </div>
          <div>
            <label htmlFor="cd-cat" className="form-label">Labor category</label>
            <input id="cd-cat" name="laborCategory" defaultValue={candidate.laborCategory ?? ""} className="form-input" />
          </div>
          <div>
            <label htmlFor="cd-skill" className="form-label">Primary skill</label>
            <input id="cd-skill" name="primarySkill" defaultValue={candidate.primarySkill ?? ""} className="form-input" />
          </div>
          <div>
            <label htmlFor="cd-rate" className="form-label">Rate expectation ($/h)</label>
            <input id="cd-rate" name="rateExpectation" type="number" step="0.01" defaultValue={candidate.rateExpectation == null ? "" : toNum(candidate.rateExpectation)} className="form-input" />
          </div>
          <div>
            <label htmlFor="cd-status" className="form-label">Status</label>
            <select id="cd-status" name="status" defaultValue={candidate.status} className="form-select">
              {STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="cd-source" className="form-label">Source</label>
            <input id="cd-source" name="source" defaultValue={candidate.source ?? ""} className="form-input" />
          </div>
          <div>
            <label htmlFor="cd-resume" className="form-label">Resume URL</label>
            <input id="cd-resume" name="resumeUrl" type="url" defaultValue={candidate.resumeUrl ?? ""} className="form-input" />
          </div>
          <div>
            <label htmlFor="cd-li" className="form-label">LinkedIn URL</label>
            <input id="cd-li" name="linkedInUrl" type="url" defaultValue={candidate.linkedInUrl ?? ""} className="form-input" />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="cd-notes" className="form-label">Notes</label>
            <textarea id="cd-notes" name="notes" defaultValue={candidate.notes ?? ""} className="form-textarea" rows={3} />
          </div>
          <div className="md:col-span-2"><button className="btn-primary">Save</button></div>
        </form>
      </section>

      <section className="card p-6">
        <div className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--accent, #67e8f9)" }}>Pipeline · {candidate.submissions.length}</div>
        <div className="mt-4">
          {candidate.submissions.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--faint)" }}>No submissions yet. Submit this candidate to a requisition from <Link className="underline" href="/people/ats">the ATS list</Link>.</p>
          ) : (
            <DataTable columns={submissionColumns} rows={submissionRows} rowKey={(s) => s.id} />
          )}
        </div>
      </section>

      <section className="card p-6">
        <div className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--accent, #67e8f9)" }}>Placements · {candidate.placements.length}</div>
        <div className="mt-4">
          {candidate.placements.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--faint)" }}>No active placements.</p>
          ) : (
            <DataTable columns={placementColumns} rows={placementRows} rowKey={(p) => p.id} />
          )}
        </div>
      </section>

      <section className="card p-6">
        <div className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--accent, #67e8f9)" }}>Audit trail · {auditEvents.length}</div>
        <DetailGrid>
          <DetailField label="Candidate id"><span className="font-mono text-xs">{candidate.id}</span></DetailField>
          <DetailField label="Created">{formatDate(candidate.createdAt)}</DetailField>
          <DetailField label="Last updated">{formatDate(candidate.updatedAt)}</DetailField>
          <DetailField label="Owner">{candidate.ownerUserId ? candidate.ownerUserId : "—"}</DetailField>
        </DetailGrid>
        {auditEvents.length === 0 ? (
          <p className="mt-4 text-sm" style={{ color: "var(--faint)" }}>No audit history yet.</p>
        ) : (
          <ol className="mt-4 grid gap-2">
            {auditEvents.map((e) => (
              <li key={e.id} className="panel p-3">
                <div className="flex items-baseline justify-between gap-2 text-xs" style={{ color: "var(--faint)" }}>
                  <span className="font-mono">{e.action}</span>
                  <span>{formatDateTime(e.createdAt)}</span>
                </div>
                {e.afterJson ? (
                  <pre className="mt-1 overflow-x-auto text-xs" style={{ color: "var(--body)" }}>{e.afterJson}</pre>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </DetailShell>
  );
}
