import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDate } from "@/lib/utils";
import { toNum } from "@/lib/money";
import { Gavel } from "lucide-react";

type CaptureRow = Awaited<ReturnType<typeof loadCaptures>>[number];

async function loadCaptures(tenantId: string) {
  return prisma.captureRecord.findMany({
    where: { tenantId },
    orderBy: [{ stage: "asc" }, { proposalDueDate: "asc" }],
    take: 50,
    include: {
      _count: { select: { milestones: true, decisions: true, colorTeamReviews: true, teamingPartners: true } },
      decisions: { orderBy: { decisionAt: "desc" }, take: 1 },
    },
  });
}

const STAGES = ["IDENTIFIED", "QUALIFYING", "CAPTURE", "PROPOSAL", "EVALUATION", "AWARDED", "LOST", "WITHDRAWN"] as const;
const SET_ASIDES = ["NONE", "SMALL_BUSINESS", "WOSB", "EDWOSB", "HUBZONE", "EIGHT_A", "SDVOSB", "TOTAL_SMALL_BUSINESS", "PARTIAL_SMALL_BUSINESS"] as const;

export default async function CapturePage() {
  const tenant = await requireTenant();

  const [captures, totalActive, totalAwarded, totalValueRaw] = await Promise.all([
    loadCaptures(tenant.id),
    prisma.captureRecord.count({ where: { tenantId: tenant.id, stage: { in: ["QUALIFYING", "CAPTURE", "PROPOSAL", "EVALUATION"] } } }),
    prisma.captureRecord.count({ where: { tenantId: tenant.id, stage: "AWARDED" } }),
    prisma.captureRecord.aggregate({
      where: { tenantId: tenant.id, stage: { in: ["QUALIFYING", "CAPTURE", "PROPOSAL", "EVALUATION"] } },
      _sum: { estimatedValue: true },
    }),
  ]);
  const totalValue = toNum(totalValueRaw._sum.estimatedValue);

  const columns: DataTableColumn<CaptureRow>[] = [
    { key: "title", header: "Pursuit", render: (c) => c.title },
    { key: "agency", header: "Agency", cellClassName: "text-xs", sortValue: (c) => c.agency ?? "", render: (c) => c.agency ?? "—" },
    { key: "vehicle", header: "Vehicle", cellClassName: "text-xs", sortValue: (c) => c.contractVehicle ?? "", render: (c) => c.contractVehicle ?? "—" },
    { key: "naics", header: "NAICS", cellClassName: "text-xs font-mono", sortValue: (c) => c.naicsCode ?? "", render: (c) => c.naicsCode ?? "—" },
    { key: "setAside", header: "Set-aside", cellClassName: "text-xs", render: (c) => c.setAside.replace(/_/g, " ") },
    { key: "stage", header: "Stage", render: (c) => c.stage.replace(/_/g, " ") },
    {
      key: "value",
      header: "Est. value",
      cellClassName: "text-xs text-right",
      sortValue: (c) => (c.estimatedValue ? toNum(c.estimatedValue) : null),
      render: (c) => (c.estimatedValue ? `$${toNum(c.estimatedValue).toLocaleString()}` : "—"),
    },
    {
      key: "due",
      header: "Due",
      cellClassName: "text-xs",
      sortValue: (c) => c.proposalDueDate ?? null,
      render: (c) => (c.proposalDueDate ? formatDate(c.proposalDueDate) : "—"),
    },
    {
      key: "pwin",
      header: "pWin",
      cellClassName: "text-xs text-right",
      sortValue: (c) => c.pwinPercent ?? null,
      render: (c) => (c.pwinPercent != null ? `${c.pwinPercent}%` : "—"),
    },
    {
      key: "lastDecision",
      header: "Last decision",
      cellClassName: "text-xs",
      sortValue: (c) => c.decisions[0]?.decision ?? "",
      render: (c) => c.decisions[0]?.decision.replace(/_/g, " ") ?? "—",
    },
    { key: "milestones", header: "M / Reviews / Partners", cellClassName: "text-xs text-right",
      sortValue: (c) => c._count.milestones,
      render: (c) => `${c._count.milestones} / ${c._count.colorTeamReviews} / ${c._count.teamingPartners}` },
    {
      key: "decide",
      header: "Decide",
      render: (c) => (
        <form action={`/api/capture/records/${c.id}/decision`} method="post" className="flex items-center gap-1">
          <label htmlFor={`d-${c.id}`} className="sr-only">Decision</label>
          <select id={`d-${c.id}`} name="decision" defaultValue="GO" className="form-select py-1 text-xs">
            {["GO", "NO_GO", "CONDITIONAL_GO", "DEFERRED"].map((d) => (
              <option key={d} value={d}>{d.replace(/_/g, " ")}</option>
            ))}
          </select>
          <input name="rationale" required minLength={3} placeholder="Why?" className="form-input text-xs" />
          <button className="btn-outline text-xs">Log</button>
        </form>
      ),
    },
  ];

  return (
    <AppLayout
      eyebrow="Bids · Federal Capture"
      title="Federal proposal capture"
      description="Capture pipeline with go/no-go decisions, color teams, and teaming partners. Per req §7.1A."
    >
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-3">
          <StatTile label="Active pursuits" value={totalActive} />
          <StatTile label="Pipeline value" value={`$${(totalValue / 1_000_000).toFixed(1)}M`} />
          <StatTile label="Awarded" value={totalAwarded} tone="good" />
        </section>

        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--heading)" }}>+ Add a capture</h2>
          <form action="/api/capture/records/create" method="post" className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_auto_auto]">
            <input name="title" required placeholder="Pursuit title" className="form-input" />
            <input name="agency" placeholder="Agency / customer" className="form-input" />
            <input name="contractVehicle" placeholder="Vehicle (e.g. SEWP V)" className="form-input" />
            <input name="naicsCode" placeholder="NAICS" className="form-input" />
            <select name="setAside" defaultValue="NONE" className="form-select">
              {SET_ASIDES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </select>
            <button className="btn-primary">Create</button>
          </form>
          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] text-xs" style={{ color: "var(--faint)" }}>
            <em>Optional fields can be edited via the API or once a detail page lands; this form keeps the entry point lean.</em>
          </div>
        </section>

        {captures.length === 0 ? (
          <EmptyState
            icon={Gavel}
            title="No captures yet"
            description="Add a pursuit above. Each capture tracks its own milestones, color-team reviews, decisions, and teaming partners."
          />
        ) : (
          <DataTable columns={columns} rows={captures} rowKey={(c) => c.id} getRowHref={(c) => `/bids/capture/${c.id}`} />
        )}

        <p className="text-xs" style={{ color: "var(--faint)" }}>
          Decisions are append-only — a CONDITIONAL_GO followed by a NO_GO writes both rows so the rationale chain stays auditable. Use the inline &quot;Decide&quot; column above.
        </p>

        <div className="text-xs" style={{ color: "var(--faint)" }}>
          <Link href="/bids" className="underline">← back to Bid Hub</Link>
        </div>
      </div>
    </AppLayout>
  );
}
