import Link from "next/link";
import { notFound } from "next/navigation";
import { DetailShell, DetailField, DetailGrid } from "@/components/layout/detail-shell";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function ImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await requireTenant();
  const imp = await prisma.historicalImport.findFirst({
    where: { id, tenantId: tenant.id },
    include: { rows: { orderBy: { rowIndex: "asc" }, take: 500 }, project: true },
  });
  if (!imp) notFound();

  const flags: Array<{ severity: string; message: string }> = (() => { try { return JSON.parse(imp.aiFlagsJson); } catch { return []; } })();
  const columns: string[] = (() => { try { return JSON.parse(imp.columnsJson); } catch { return []; } })();
  const alertCount = flags.filter((f) => f.severity === "ALERT").length;
  const warnCount = flags.filter((f) => f.severity === "WARN").length;

  return (
    <DetailShell
      eyebrow="Historical import"
      title={imp.label}
      subtitle={`${imp.kind.replaceAll("_", " ")} · ${imp.filename} · ${imp.rowsDetected} rows`}
      crumbs={[{ label: "Imports", href: "/imports" }, { label: imp.label }]}
      actions={(
        <div className="flex items-center gap-2">
          <StatusBadge status={imp.status} />
          {imp.status !== "IMPORTED" ? (
            <form action={`/api/imports/${imp.id}/commit`} method="post">
              <button className="btn-primary text-xs">Commit clean rows</button>
            </form>
          ) : null}
        </div>
      )}
    >
      <section className="grid gap-4 md:grid-cols-4">
        <StatTile label="Rows detected" value={imp.rowsDetected.toLocaleString()} />
        <StatTile label="Rows imported" value={imp.rowsImported.toLocaleString()} tone="good" />
        <StatTile label="Blocking flags" value={alertCount} tone={alertCount > 0 ? "bad" : "good"} />
        <StatTile label="Warnings" value={warnCount} tone={warnCount > 0 ? "warn" : "good"} />
      </section>

      <section className="card p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">AI reviewer summary</div>
        <p className="mt-2 text-sm leading-6 text-slate-200">{imp.aiSummary ?? "AI review pending."}</p>
        <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-slate-500">Model: {imp.aiModel}</div>
        <DetailGrid>
          <DetailField label="Label">{imp.label}</DetailField>
          <DetailField label="Kind">{imp.kind.replaceAll("_", " ")}</DetailField>
          <DetailField label="Project scope">{imp.project ? <Link href={`/projects/${imp.project.id}`} className="text-cyan-300 hover:underline">{imp.project.code}</Link> : "Tenant-wide"}</DetailField>
          <DetailField label="File">{imp.filename} · {(imp.fileSize / 1024).toFixed(1)} KB</DetailField>
          <DetailField label="Columns detected">{columns.join(" · ")}</DetailField>
          <DetailField label="Total dollar value">{formatCurrency(imp.totalDollarValue)}</DetailField>
          <DetailField label="Uploaded">{formatDate(imp.createdAt)}</DetailField>
          <DetailField label="Updated">{formatDate(imp.updatedAt)}</DetailField>
        </DetailGrid>
      </section>

      {flags.length > 0 ? (
        <section className="card p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">AI flags</div>
          <ul className="mt-3 space-y-2">
            {flags.map((f, i) => (
              <li key={i} className={`rounded-xl border px-4 py-2 text-sm ${f.severity === "ALERT" ? "border-rose-500/40 bg-rose-500/10 text-rose-100" : "border-amber-500/40 bg-amber-500/10 text-amber-100"}`}>
                <span className="mr-2 text-[10px] uppercase tracking-[0.18em]">{f.severity}</span>
                {f.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card p-0 overflow-hidden">
        <div className="px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">Parsed rows (first 500)</div>
        <div className="overflow-x-auto">
          <SortableTable
            emptyMessage="No rows parsed."
            columns={[
              { header: "#" },
              { header: "Raw" },
              { header: "Extracted" },
              { header: "Confidence" },
              { header: "Issues" },
              { header: "Accepted" },
            ]}
            rows={imp.rows.map((r) => {
              let issues: string[] = [];
              try { issues = JSON.parse(r.issuesJson); } catch { issues = []; }
              let data: string[] = [];
              try { data = JSON.parse(r.dataJson); } catch { data = []; }
              let extracted: Record<string, unknown> = {};
              try { extracted = JSON.parse(r.extractedJson); } catch { extracted = {}; }
              return {
                key: r.id,
                cells: [
                  { sort: r.rowIndex + 1, node: r.rowIndex + 1, tdClassName: "font-mono text-xs text-slate-500" },
                  { sort: data.slice(0, 6).join(" · "), node: <span className="text-xs text-slate-400">{data.slice(0, 6).join(" · ")}</span>, tdClassName: "max-w-[260px]" },
                  {
                    sort: Object.entries(extracted).slice(0, 4).map(([k, v]) => `${k}:${String(v ?? "")}`).join(" "),
                    node: (
                      <div className="grid gap-1 text-xs">
                        {Object.entries(extracted).slice(0, 4).map(([k, v]) => (<div key={k}><span className="text-slate-500">{k}:</span> {String(v ?? "—")}</div>))}
                      </div>
                    ),
                    tdClassName: "max-w-[260px]",
                  },
                  { sort: r.confidence, node: `${r.confidence}%` },
                  {
                    sort: issues.length,
                    node: issues.length === 0 ? <span className="text-emerald-300">clean</span> : (
                      <ul className="text-xs text-rose-200">{issues.map((i, k) => <li key={k}>{i}</li>)}</ul>
                    ),
                  },
                  { sort: r.accepted ? "Imported" : "Pending", node: r.accepted ? <StatusBadge tone="good" label="Imported" /> : <StatusBadge tone="warn" label="Pending" /> },
                ],
              };
            })}
          />
        </div>
      </section>
    </DetailShell>
  );
}
