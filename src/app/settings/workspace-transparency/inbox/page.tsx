import { notFound } from "next/navigation";
import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { currentActor, isAdminRole } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils";

/**
 * Workspace transparency — ingested-mail review.
 *
 * ADMIN-only + tenant-scoped: every query filters by tenant.id, and a
 * non-admin gets 404. Read-only triage view; no action is taken on messages.
 */
export default async function WorkspaceInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string; mailbox?: string }>;
}) {
  const tenant = await requireTenant();
  const actor = await currentActor(tenant.id);
  if (!isAdminRole(actor.role)) notFound();

  const conn = await prisma.mailConnection.findUnique({ where: { tenantId: tenant.id } });
  if (!conn || !conn.enabled) {
    return (
      <AppLayout eyebrow="Settings · Workspace transparency" title="Ingested mail" description="Read-only triage of your team's mail flow.">
        <div className="card p-6 text-sm text-slate-300">
          Mail ingestion is {conn ? "disabled" : "not configured"}.{" "}
          <Link href="/settings/workspace-transparency" className="text-cyan-300 hover:underline">
            Open settings →
          </Link>
        </div>
      </AppLayout>
    );
  }

  const sp = await searchParams;
  const where: Record<string, unknown> = { tenantId: tenant.id };
  if (sp.class) where.classification = sp.class;
  if (sp.mailbox) where.mailboxId = sp.mailbox;

  const [messages, mailboxes, byClass] = await Promise.all([
    prisma.mailMessage.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      take: 200,
      include: { mailbox: { select: { email: true } } },
    }),
    prisma.mailbox.findMany({ where: { tenantId: tenant.id }, orderBy: { email: "asc" }, select: { id: true, email: true } }),
    prisma.mailMessage.groupBy({ by: ["classification"], where: { tenantId: tenant.id }, _count: true }),
  ]);

  return (
    <AppLayout
      eyebrow="Settings · Workspace transparency"
      title="Ingested mail"
      description="Read-only triage of your team's mail flow. Classification is advisory; nothing is auto-actioned."
    >
      <div className="grid gap-4">
        <section className="card p-4 flex flex-wrap items-center gap-2 text-xs">
          <Link href="/settings/workspace-transparency/inbox" className={`rounded-lg border px-3 py-1.5 ${!sp.class ? "border-cyan-500/60 text-cyan-200" : "border-white/10"}`}>
            All
          </Link>
          {byClass.map((c) => (
            <Link
              key={c.classification ?? "none"}
              href={`/settings/workspace-transparency/inbox?class=${encodeURIComponent(c.classification ?? "")}`}
              className={`rounded-lg border px-3 py-1.5 ${sp.class === c.classification ? "border-cyan-500/60 text-cyan-200" : "border-white/10"}`}
            >
              {c.classification ?? "—"} ({c._count})
            </Link>
          ))}
          <span className="ml-auto text-slate-500">{mailboxes.length} mailbox(es)</span>
        </section>

        <section className="card p-0 overflow-hidden">
          <SortableTable
            emptyMessage="No ingested messages yet — run 'Ingest now' from settings."
            columns={[
              { header: "Received" },
              { header: "Mailbox" },
              { header: "From" },
              { header: "Subject" },
              { header: "Class" },
            ]}
            rows={messages.map((m) => ({
              key: m.id,
              cells: [
                { sort: m.receivedAt.getTime(), node: formatDateTime(m.receivedAt), tdClassName: "py-2 pr-4 text-xs text-slate-400 whitespace-nowrap" },
                { sort: m.mailbox.email, node: m.mailbox.email, tdClassName: "py-2 pr-4 text-xs text-slate-300" },
                { sort: m.fromAddress, node: m.fromName ? `${m.fromName} <${m.fromAddress}>` : m.fromAddress, tdClassName: "py-2 pr-4 text-xs text-slate-300" },
                {
                  sort: m.subject ?? "",
                  node: (
                    <>
                      <div className="text-white">{m.subject || "(no subject)"}</div>
                      {m.snippet ? <div className="text-xs text-slate-500 truncate max-w-[420px]">{m.snippet}</div> : null}
                    </>
                  ),
                  tdClassName: "py-2 pr-4",
                },
                {
                  sort: m.classification ?? "",
                  node: (
                    <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-xs text-cyan-200">
                      {m.classification ?? "—"}
                      {m.confidence != null ? <span className="text-slate-500"> · {(m.confidence * 100).toFixed(0)}%</span> : null}
                    </span>
                  ),
                  tdClassName: "py-2 pr-4",
                },
              ],
            }))}
          />
        </section>
      </div>
    </AppLayout>
  );
}
