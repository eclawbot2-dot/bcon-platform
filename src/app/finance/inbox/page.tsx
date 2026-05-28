import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { StatTile } from "@/components/ui/stat-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatCurrency, formatDate } from "@/lib/utils";

export default async function InboxPage() {
  const tenant = await requireTenant();
  const [conn, messages] = await Promise.all([
    prisma.invoiceInboxConnection.findUnique({ where: { tenantId: tenant.id } }),
    prisma.invoiceInboxMessage.findMany({ where: { tenantId: tenant.id }, include: { projectGuess: true }, orderBy: { receivedAt: "desc" }, take: 200 }),
  ]);
  const matched = messages.filter((m) => m.status === "MATCHED").length;
  const suggested = messages.filter((m) => m.status === "SUGGESTED").length;
  const unmatched = messages.filter((m) => m.status === "UNMATCHED").length;

  return (
    <AppLayout eyebrow="CFO · Invoice inbox" title="Gmail invoice monitor" description="A Google Workspace mailbox is polled for incoming vendor invoices. Messages are parsed, matched to a project + cost code, and posted to the journal.">
      <div className="grid gap-6">
        <section className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Connection</div>
              <div className="mt-1 text-lg font-semibold text-white">{conn?.mailbox ?? "Not connected"}</div>
              <div className="text-xs text-slate-400">Provider: {conn?.provider ?? "—"} · Label: {conn?.labelFilter ?? "—"}</div>
              {conn?.lastPolledAt ? <div className="text-xs text-slate-500">Last poll {formatDate(conn.lastPolledAt)} · {conn.lastPollStatus}</div> : null}
            </div>
            <div className="flex gap-2">
              {conn?.status === "CONNECTED" ? (
                <>
                  <form action="/api/inbox/connect" method="post">
                    <input type="hidden" name="action" value="poll" />
                    <button className="btn-primary text-xs">Poll now</button>
                  </form>
                  <form action="/api/inbox/connect" method="post">
                    <input type="hidden" name="action" value="disconnect" />
                    <button className="btn-outline text-xs">Disconnect</button>
                  </form>
                </>
              ) : null}
            </div>
          </div>
          {conn?.status !== "CONNECTED" ? (
            <form action="/api/inbox/connect" method="post" className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
              <label className="block text-xs">
                <span className="mb-1 block uppercase tracking-[0.18em] text-slate-500">Mailbox (e.g. ap@company.com)</span>
                <input name="mailbox" required className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500" />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block uppercase tracking-[0.18em] text-slate-500">Label filter</span>
                <input name="labelFilter" defaultValue="Invoices" required className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500" />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block uppercase tracking-[0.18em] text-slate-500">Sender allowlist (comma-sep)</span>
                <input name="senderAllowlist" placeholder="billing@vendor.com, ap@*.example" className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500" />
              </label>
              <button className="btn-primary">Connect inbox</button>
            </form>
          ) : null}
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <StatTile label="Messages ingested" value={messages.length} />
          <StatTile label="Auto-matched → journal" value={matched} tone="good" />
          <StatTile label="Needs review" value={suggested} tone={suggested > 0 ? "warn" : "good"} />
          <StatTile label="Unmatched" value={unmatched} tone={unmatched > 0 ? "warn" : "good"} />
        </section>

        <section className="card p-0 overflow-hidden">
          <div className="px-5 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">Recent invoice emails</div>
          <div className="overflow-x-auto">
            <SortableTable
              emptyMessage="No messages yet. Connect + poll to ingest."
              columns={[
                { header: "Received" },
                { header: "From" },
                { header: "Subject" },
                { header: "Vendor" },
                { header: "Amount" },
                { header: "Project" },
                { header: "Confidence" },
                { header: "Status" },
              ]}
              rows={messages.map((m) => ({
                key: m.id,
                cells: [
                  { sort: new Date(m.receivedAt).getTime(), node: formatDate(m.receivedAt), tdClassName: "text-slate-400" },
                  { sort: m.fromAddress, node: m.fromAddress, tdClassName: "font-mono text-xs text-slate-400" },
                  { sort: m.subject, node: m.subject, tdClassName: "max-w-[320px]" },
                  { sort: m.vendorGuess ?? "", node: m.vendorGuess ?? "—" },
                  { sort: Number(m.amountGuess ?? 0), node: formatCurrency(m.amountGuess) },
                  { sort: m.projectGuess?.code ?? "", node: m.projectGuess ? <Link href={`/projects/${m.projectGuess.id}/financials`} className="text-cyan-300 hover:underline">{m.projectGuess.code}</Link> : <span className="text-slate-500">—</span> },
                  { sort: m.confidence, node: `${m.confidence}%` },
                  { sort: m.status, node: <StatusBadge status={m.status} /> },
                ],
              }))}
            />
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
