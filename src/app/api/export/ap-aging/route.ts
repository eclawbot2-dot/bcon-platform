import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { requireManager } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { csvResponse, toCsv } from "@/lib/csv";

export async function GET() {
  const tenant = await requireTenant();
  // AP-aging exposes vendor payables across the company — manager-class only.
  const actor = await requireManager(tenant.id);
  const rows = await prisma.subInvoice.findMany({
    where: { project: { tenantId: tenant.id }, status: { notIn: ["PAID", "REJECTED"] } },
    include: { vendor: true, project: true },
    orderBy: [{ dueDate: "asc" }],
  });
  await recordAudit({
    tenantId: tenant.id,
    actorId: actor.userId,
    actorName: actor.userName,
    entityType: "ApAgingExport",
    entityId: "all",
    action: "EXPORT_CSV",
    after: { rowCount: rows.length },
    source: "api.export.ap-aging",
  });
  const today = Date.now();
  const out = rows.map((i) => {
    const due = i.dueDate ?? i.invoiceDate;
    const daysPast = Math.floor((today - new Date(due).getTime()) / (1000 * 60 * 60 * 24));
    return {
      project: i.project.code,
      vendor: i.vendor.name,
      invoiceNumber: i.invoiceNumber,
      invoiceDate: i.invoiceDate.toISOString().slice(0, 10),
      dueDate: i.dueDate ? i.dueDate.toISOString().slice(0, 10) : "",
      daysPastDue: daysPast,
      amount: i.amount,
      retainageHeld: i.retainageHeld,
      netDue: i.netDue,
      waiverReceived: i.waiverReceived,
      status: i.status,
    };
  });
  return csvResponse(`ap-aging-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(out));
}
