import Link from "next/link";
import { notFound } from "next/navigation";
import { AppLayout } from "@/components/layout/app-layout";
import { StatusBadge } from "@/components/ui/status-badge";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatDate } from "@/lib/utils";

export default async function InspectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenant = await requireTenant();
  const insp = await prisma.inspection.findFirst({
    where: { id, project: { tenantId: tenant.id } },
    include: {
      project: { select: { id: true, name: true, code: true, address: true, businessUnit: { select: { name: true } } } },
      permit: true,
      attachments: true,
    },
  });
  if (!insp) notFound();

  const portalSlug = (insp.sourceSystem ?? "").replace(/^municipal:/, "");
  const pmMembership = await prisma.membership.findFirst({
    where: { tenantId: tenant.id, roleTemplate: "MANAGER" },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  const portal = portalSlug
    ? await prisma.jurisdictionPortal.findUnique({ where: { slug: portalSlug } })
    : null;

  const history = insp.permitId
    ? await prisma.inspection.findMany({
        where: { permitId: insp.permitId, id: { not: insp.id } },
        orderBy: { scheduledAt: "desc" },
        take: 25,
        select: { id: true, title: true, scheduledAt: true, result: true },
      })
    : [];

  return (
    <AppLayout
      eyebrow={`Inspection · ${insp.kind}`}
      title={insp.title}
      description={`Synced from ${portal?.name ?? portalSlug ?? "internal source"}.`}
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="panel p-5 lg:col-span-2 grid gap-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Scheduled">
              {insp.scheduledAt
                ? new Date(insp.scheduledAt).toLocaleString("en-US", { timeZone: "America/New_York" }) + " ET"
                : "unscheduled"}
            </Field>
            <Field label="Result"><StatusBadge status={insp.result} /></Field>
            <Field label="Inspector">{insp.inspector ?? "—"}</Field>
            <Field label="Address">{insp.location ?? insp.project.address ?? "—"}</Field>
            <Field label="Permit #">
              {insp.permit ? (
                <Link href={`/projects/${insp.project.id}/permits`} className="text-cyan-300 hover:underline">{insp.permit.permitNumber}</Link>
              ) : (
                "—"
              )}
            </Field>
            <Field label="Last synced">{formatDate(insp.syncedAt)}</Field>
          </div>
          {insp.followUpNotes ? (
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Notes</div>
              <p className="text-sm text-slate-300 mt-1 whitespace-pre-wrap">{insp.followUpNotes}</p>
            </div>
          ) : null}
        </section>

        <section className="grid gap-4">
          <div className="panel p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 mb-2">Project</div>
            <Link href={`/projects/${insp.project.id}`} className="block text-base font-semibold text-cyan-200 hover:underline">
              {insp.project.code} · {insp.project.name}
            </Link>
            <div className="text-xs text-slate-400 mt-1">{insp.project.businessUnit?.name ?? "—"}</div>
            <div className="text-xs text-slate-500 mt-1">{insp.project.address ?? ""}</div>
          </div>

          <div className="panel p-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 mb-2">Project Manager</div>
            {pmMembership?.user ? (
              <div>
                <div className="text-sm font-semibold text-slate-200">{pmMembership.user.name}</div>
                <a href={`mailto:${pmMembership.user.email}`} className="text-xs text-cyan-300 hover:underline">
                  {pmMembership.user.email}
                </a>
              </div>
            ) : (
              <div className="text-xs text-slate-500 italic">No MANAGER-role user assigned to this tenant.</div>
            )}
          </div>

          {portal ? (
            <div className="panel p-4">
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 mb-2">Source portal</div>
              <div className="text-sm font-semibold text-slate-200">{portal.name}</div>
              <div className="text-xs text-slate-400 mt-1">{portal.platformNote}</div>
              {portal.baseUrl ? (
                <a href={portal.baseUrl} target="_blank" rel="noreferrer" className="text-xs text-cyan-300 hover:underline block mt-1 truncate">
                  {portal.baseUrl}
                </a>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      {history.length > 0 ? (
        <section className="panel p-5 mt-6">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-400 mb-3">Permit inspection history</div>
          <ul className="divide-y divide-slate-800">
            {history.map((h) => (
              <li key={h.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  <Link href={`/inspections/${h.id}`} className="text-cyan-300 hover:underline">
                    {h.title.replace(/ — .*$/, "")}
                  </Link>
                  <span className="text-xs text-slate-500 ml-3">{h.scheduledAt ? formatDate(h.scheduledAt) : ""}</span>
                </span>
                <StatusBadge status={h.result} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AppLayout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="text-slate-200 mt-1">{children}</div>
    </div>
  );
}
