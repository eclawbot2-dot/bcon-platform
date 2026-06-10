import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { AddSheetForm } from "@/components/add-sheet-form";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { requireProjectForTenant } from "@/lib/project-guard";
import { formatDate } from "@/lib/utils";
import { FileStack } from "lucide-react";
import { DrawingDiscipline } from "@prisma/client";

const DISCIPLINES: DrawingDiscipline[] = [
  "ARCHITECTURAL",
  "STRUCTURAL",
  "MEP",
  "CIVIL",
  "LANDSCAPE",
  "ELECTRICAL",
  "PLUMBING",
  "MECHANICAL",
  "FIRE_PROTECTION",
  "OTHER",
];

type DrawingRow = Awaited<ReturnType<typeof loadDrawings>>[number];

async function loadDrawings(projectId: string) {
  return prisma.drawing.findMany({
    where: { projectId },
    include: { _count: { select: { sheets: true } } },
    orderBy: [{ archived: "asc" }, { createdAt: "desc" }],
  });
}

export default async function ProjectDrawingsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireTenant();
  const project = await requireProjectForTenant(projectId, {});

  const [drawings, specSections] = await Promise.all([
    loadDrawings(projectId),
    prisma.specSection.findMany({
      where: { projectId },
      orderBy: [{ csiDivision: "asc" }, { sectionCode: "asc" }],
    }),
  ]);

  const totalSheets = drawings.reduce((sum, d) => sum + d._count.sheets, 0);
  const activeSets = drawings.filter((d) => !d.archived);

  const drawingColumns: DataTableColumn<DrawingRow>[] = [
    { key: "setName", header: "Set", render: (d) => d.setName },
    { key: "discipline", header: "Discipline", render: (d) => d.discipline.replace("_", " ") },
    { key: "revisionNumber", header: "Rev", cellClassName: "text-xs text-slate-400", render: (d) => `#${d.revisionNumber}` },
    { key: "sheets", header: "Sheets", cellClassName: "text-xs", render: (d) => d._count.sheets },
    {
      key: "issuedDate",
      header: "Issued",
      cellClassName: "text-xs text-slate-400",
      render: (d) => (d.issuedDate ? formatDate(d.issuedDate) : "—"),
    },
    {
      key: "archived",
      header: "Status",
      render: (d) =>
        d.archived ? <span className="text-slate-500">archived</span> : <span className="text-emerald-300">current</span>,
    },
  ];

  return (
    <AppLayout
      eyebrow={`${project.code} · drawings`}
      title="Drawing register & spec library"
      description="Versioned drawing sets with sheet-level register, plus the CSI MasterFormat spec section index. Required for vertical mode (req §7.7)."
    >
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-3">
          <StatTile label="Drawing sets" value={drawings.length} />
          <StatTile label="Total sheets" value={totalSheets} />
          <StatTile label="Spec sections" value={specSections.length} />
        </section>

        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--heading)" }}>+ Add a drawing set</h2>
          <form action="/api/drawings/create" method="post" className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto_auto]">
            <input type="hidden" name="projectId" value={projectId} />
            <label className="sr-only" htmlFor="dwg-set">Set name</label>
            <input id="dwg-set" name="setName" required placeholder="Set name (e.g. 100% CDs, Addendum 1)" className="form-input" />
            <label className="sr-only" htmlFor="dwg-disc">Discipline</label>
            <select id="dwg-disc" name="discipline" defaultValue="ARCHITECTURAL" className="form-select">
              {DISCIPLINES.map((d) => (
                <option key={d} value={d}>{d.replace("_", " ")}</option>
              ))}
            </select>
            <label className="sr-only" htmlFor="dwg-rev">Revision</label>
            <input id="dwg-rev" name="revisionNumber" type="number" min={0} defaultValue={0} className="form-input w-20" placeholder="Rev" />
            <label className="sr-only" htmlFor="dwg-issued">Issued date</label>
            <input id="dwg-issued" name="issuedDate" type="date" className="form-input" />
            <button className="btn-primary">Add set</button>
          </form>
        </section>

        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--heading)" }}>AI-assisted ingest</h2>
          <p className="mb-3 text-xs" style={{ color: "var(--faint)" }}>
            Paste a drawing-index page (sheet numbers + titles, one per line). The ingester extracts sheets via the LLM if configured (OPENAI_API_KEY or ANTHROPIC_API_KEY) and falls back to a regex parser otherwise. Submitting creates a new drawing set + sheet rows in one step.
          </p>
          <form action="/api/ingest/drawings" method="post" className="grid gap-3">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="action" value="commit" />
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <input name="setName" required placeholder="Set name (e.g. Bid Set, Addendum 1)" aria-label="Set name" className="form-input" />
              <select name="discipline" defaultValue="ARCHITECTURAL" aria-label="Default discipline if a sheet number doesn't reveal one" className="form-select">
                {DISCIPLINES.map((d) => (
                  <option key={d} value={d}>{d.replace("_", " ")}</option>
                ))}
              </select>
              <input name="revisionNumber" type="number" min={0} defaultValue={0} placeholder="Rev" aria-label="Revision number" className="form-input w-20" />
            </div>
            <textarea name="text" required rows={6} placeholder={"A0.1   Cover Sheet\nA0.2   Code Analysis\nA1.1   Site Plan\nS2.1   Foundation Plan"} className="form-textarea font-mono text-xs" />
            <button className="btn-primary justify-self-start">Ingest sheets</button>
          </form>
        </section>

        {activeSets.length > 0 ? (
          <section className="card p-5">
            <h2 className="mb-1 text-sm font-semibold" style={{ color: "var(--heading)" }}>+ Add a sheet to a set</h2>
            <p className="mb-3 text-xs" style={{ color: "var(--faint)" }}>
              Registers a single sheet under an existing drawing set. Re-adding an existing sheet number updates its title and marks it current.
            </p>
            <AddSheetForm drawings={activeSets.map((d) => ({ id: d.id, setName: d.setName, revisionNumber: d.revisionNumber }))} />
          </section>
        ) : null}

        <div>
          <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--heading)" }}>Drawing sets</h2>
          {drawings.length === 0 ? (
            <EmptyState
              icon={FileStack}
              title="No drawing sets yet"
              description="Add a Bid Set or 100% CDs above; sheet register details can be filled in once the set exists."
            />
          ) : (
            <DataTable
              columns={drawingColumns}
              rows={drawings}
              rowKey={(d) => d.id}
              emptyMessage="No drawings."
            />
          )}
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--heading)" }}>Spec sections (CSI MasterFormat)</h2>
          {specSections.length === 0 ? (
            <EmptyState
              icon={FileStack}
              title="No spec sections recorded"
              description="Spec sections are typically seeded from project ingest. Add manually via API or wait for the AI ingest pipeline."
            />
          ) : (
            <ul className="grid gap-2 md:grid-cols-2">
              {specSections.map((s) => (
                <li key={s.id} className="panel p-3">
                  <div className="text-xs font-mono text-cyan-300">{s.sectionCode}</div>
                  <div className="text-sm font-medium" style={{ color: "var(--heading)" }}>{s.title}</div>
                  {s.notes ? <div className="mt-1 text-xs" style={{ color: "var(--faint)" }}>{s.notes}</div> : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="text-xs" style={{ color: "var(--faint)" }}>
          <Link href={`/projects/${projectId}`} className="underline">← back to project</Link>
        </div>
      </div>
    </AppLayout>
  );
}
