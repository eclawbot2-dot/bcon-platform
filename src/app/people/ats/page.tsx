import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDate } from "@/lib/utils";
import { toNum } from "@/lib/money";
import { Users } from "lucide-react";

type CandidateRow = Awaited<ReturnType<typeof loadCandidates>>[number];
type ReqRow = Awaited<ReturnType<typeof loadReqs>>[number];
type SubmissionRow = Awaited<ReturnType<typeof loadSubs>>[number];

async function loadCandidates(tenantId: string) {
  return prisma.candidate.findMany({
    where: { tenantId },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: { _count: { select: { submissions: true, placements: true } } },
  });
}

async function loadReqs(tenantId: string) {
  return prisma.jobRequisition.findMany({
    where: { tenantId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 50,
    include: {
      project: { select: { id: true, code: true, name: true } },
      _count: { select: { submissions: true } },
    },
  });
}

async function loadSubs(tenantId: string) {
  return prisma.submission.findMany({
    where: { tenantId },
    orderBy: [{ submittedAt: "desc" }],
    take: 50,
    include: {
      candidate: { select: { id: true, firstName: true, lastName: true } },
      req: { select: { id: true, reqNumber: true, title: true } },
    },
  });
}

export default async function AtsPage() {
  const tenant = await requireTenant();

  const [candidates, reqs, submissions, projects] = await Promise.all([
    loadCandidates(tenant.id),
    loadReqs(tenant.id),
    loadSubs(tenant.id),
    prisma.project.findMany({ where: { tenantId: tenant.id }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" }, take: 100 }),
  ]);

  const totalCandidates = await prisma.candidate.count({ where: { tenantId: tenant.id } });
  const openReqs = await prisma.jobRequisition.count({ where: { tenantId: tenant.id, status: "OPEN" } });
  const inPipeline = await prisma.submission.count({
    where: { tenantId: tenant.id, stage: { notIn: ["PLACED", "REJECTED", "WITHDRAWN", "OFFER_DECLINED"] } },
  });

  const candidateColumns: DataTableColumn<CandidateRow>[] = [
    { key: "name", header: "Name", sortValue: (c) => `${c.lastName} ${c.firstName}`, render: (c) => `${c.firstName} ${c.lastName}` },
    { key: "status", header: "Status", render: (c) => c.status },
    { key: "labor", header: "Category", cellClassName: "text-xs", sortValue: (c) => c.laborCategory ?? "", render: (c) => c.laborCategory ?? "—" },
    { key: "skill", header: "Skill", cellClassName: "text-xs", sortValue: (c) => c.primarySkill ?? "", render: (c) => c.primarySkill ?? "—" },
    { key: "loc", header: "Location", cellClassName: "text-xs text-slate-400", sortValue: (c) => [c.city, c.state].filter(Boolean).join(", "), render: (c) => [c.city, c.state].filter(Boolean).join(", ") || "—" },
    {
      key: "rate",
      header: "Rate exp.",
      cellClassName: "text-xs text-right",
      sortValue: (c) => (c.rateExpectation != null ? toNum(c.rateExpectation) : null),
      render: (c) => (c.rateExpectation ? `$${c.rateExpectation}` : "—"),
    },
    { key: "subs", header: "Subs", cellClassName: "text-xs text-right", sortValue: (c) => c._count.submissions, render: (c) => c._count.submissions },
    { key: "placed", header: "Placed", cellClassName: "text-xs text-right", sortValue: (c) => c._count.placements, render: (c) => c._count.placements },
    { key: "updated", header: "Updated", cellClassName: "text-xs text-slate-400", render: (c) => formatDate(c.updatedAt) },
  ];

  const reqColumns: DataTableColumn<ReqRow>[] = [
    { key: "reqNumber", header: "Req #", cellClassName: "font-mono text-xs", render: (r) => r.reqNumber },
    { key: "title", header: "Title", render: (r) => r.title },
    { key: "status", header: "Status", render: (r) => r.status },
    { key: "manager", header: "Hiring mgr", cellClassName: "text-xs", sortValue: (r) => r.hiringManager ?? "", render: (r) => r.hiringManager ?? "—" },
    {
      key: "project",
      header: "Project",
      cellClassName: "text-xs",
      sortValue: (r) => r.project?.code ?? "",
      render: (r) => (r.project ? `${r.project.code}` : "—"),
    },
    {
      key: "rate",
      header: "Rate range",
      cellClassName: "text-xs text-right",
      sortValue: (r) => (r.rateMin != null ? toNum(r.rateMin) : r.rateMax != null ? toNum(r.rateMax) : null),
      render: (r) =>
        r.rateMin || r.rateMax ? `$${r.rateMin ?? "?"} – $${r.rateMax ?? "?"}` : "—",
    },
    {
      key: "fill",
      header: "Fill",
      cellClassName: "text-xs text-right",
      sortValue: (r) => (r.openings > 0 ? r.filledCount / r.openings : 0),
      render: (r) => `${r.filledCount} / ${r.openings}`,
    },
    { key: "subs", header: "Subs", cellClassName: "text-xs text-right", sortValue: (r) => r._count.submissions, render: (r) => r._count.submissions },
  ];

  const subColumns: DataTableColumn<SubmissionRow>[] = [
    { key: "candidate", header: "Candidate", render: (s) => `${s.candidate.firstName} ${s.candidate.lastName}` },
    { key: "req", header: "Req", cellClassName: "text-xs", render: (s) => `${s.req.reqNumber} · ${s.req.title}` },
    { key: "stage", header: "Stage", render: (s) => s.stage },
    { key: "recruiter", header: "Recruiter", cellClassName: "text-xs", render: (s) => s.recruiterName ?? "—" },
    { key: "submittedAt", header: "Submitted", cellClassName: "text-xs text-slate-400", render: (s) => formatDate(s.submittedAt) },
    {
      key: "advance",
      header: "Advance",
      render: (s) => (
        <form action={`/api/ats/submissions/${s.id}/advance`} method="post" className="flex items-center gap-1">
          <label htmlFor={`stage-${s.id}`} className="sr-only">Stage</label>
          <select id={`stage-${s.id}`} name="stage" defaultValue={s.stage} className="form-select py-1 text-xs">
            {[
              "SUBMITTED", "RECRUITER_SCREEN", "TECH_SCREEN", "CLIENT_INTERVIEW",
              "REFERENCE_CHECK", "OFFER_EXTENDED", "OFFER_ACCEPTED", "OFFER_DECLINED",
              "PLACED", "REJECTED", "WITHDRAWN",
            ].map((stage) => (
              <option key={stage} value={stage}>{stage.replace(/_/g, " ")}</option>
            ))}
          </select>
          <button className="btn-outline text-xs">Save</button>
        </form>
      ),
    },
  ];

  return (
    <AppLayout
      eyebrow="People · ATS"
      title="Applicant tracking"
      description="Candidates, job requisitions, and submission pipeline. Per req §7.1A — staffing workflows for self-perform crews and corporate hires."
    >
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-4">
          <StatTile label="Candidates" value={totalCandidates} />
          <StatTile label="Open reqs" value={openReqs} />
          <StatTile label="In pipeline" value={inPipeline} />
          <StatTile label="Showing" value={candidates.length} />
        </section>

        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--heading)" }}>+ Add candidate</h2>
          <form action="/api/ats/candidates/create" method="post" className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
            <input name="firstName" placeholder="First name" required className="form-input" />
            <input name="lastName" placeholder="Last name" required className="form-input" />
            <input name="email" type="email" placeholder="Email" className="form-input" />
            <input name="laborCategory" placeholder="Labor category" className="form-input" />
            <button className="btn-primary">Add</button>
          </form>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--heading)" }}>+ Open a requisition</h2>
          <form action="/api/ats/reqs/create" method="post" className="grid gap-3 md:grid-cols-[auto_1fr_1fr_1fr_auto]">
            <input name="reqNumber" placeholder="Req #" required className="form-input w-32" />
            <input name="title" placeholder="Job title" required className="form-input" />
            <input name="hiringManager" placeholder="Hiring manager" className="form-input" />
            <select name="projectId" defaultValue="" className="form-select">
              <option value="">— no project —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.code} {p.name}</option>)}
            </select>
            <button className="btn-primary">Open</button>
          </form>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--heading)" }}>+ Submit a candidate to a req</h2>
          <form action="/api/ats/submissions/create" method="post" className="grid gap-3 md:grid-cols-[2fr_2fr_1fr_auto]">
            <select name="candidateId" required defaultValue="" className="form-select">
              <option value="">— pick candidate —</option>
              {candidates.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
            </select>
            <select name="reqId" required defaultValue="" className="form-select">
              <option value="">— pick requisition —</option>
              {reqs.filter((r) => r.status === "OPEN").map((r) => <option key={r.id} value={r.id}>{r.reqNumber} · {r.title}</option>)}
            </select>
            <input name="rateOffered" type="number" step="0.01" placeholder="Rate" className="form-input" />
            <button className="btn-primary">Submit</button>
          </form>
        </section>

        <div>
          <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--heading)" }}>Submissions in flight</h2>
          {submissions.length === 0 ? (
            <EmptyState icon={Users} title="No active submissions" description="Submit a candidate to an open requisition above." />
          ) : (
            <DataTable columns={subColumns} rows={submissions} rowKey={(s) => s.id} />
          )}
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--heading)" }}>Open requisitions</h2>
          {reqs.length === 0 ? (
            <EmptyState icon={Users} title="No requisitions yet" description="Open one above to start collecting candidates." />
          ) : (
            <DataTable columns={reqColumns} rows={reqs} rowKey={(r) => r.id} />
          )}
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--heading)" }}>Candidates</h2>
          {candidates.length === 0 ? (
            <EmptyState icon={Users} title="No candidates yet" description="Add one with the form above to start tracking." />
          ) : (
            <DataTable columns={candidateColumns} rows={candidates} rowKey={(c) => c.id} getRowHref={(c) => `/people/ats/${c.id}`} />
          )}
        </div>

        <div className="text-xs" style={{ color: "var(--faint)" }}>
          <Link href="/people/placements" className="underline">Placements →</Link>
        </div>
      </div>
    </AppLayout>
  );
}
