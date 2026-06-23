import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { requireManager } from "@/lib/permissions";
import { sumMoney, subtractMoney, addMoney, toNum, type MoneyLike } from "@/lib/money";

/**
 * AIA G702/G703 progress-billing document, generated server-side as
 * print-ready HTML. Browsers can print-to-PDF directly; this avoids a
 * heavy PDF dependency for the MVP. Future iteration: render via
 * @react-pdf/renderer to produce a proper PDF binary.
 *
 * The G702 is the cover sheet (contract sums, retainage, current
 * payment due). The G703 is the continuation sheet (line-by-line
 * schedule of values with work-completed-this-period).
 *
 * Returns text/html with print CSS; browsers offer Save-as-PDF in
 * their print dialog. Tenant-scoped; pay-application must belong to
 * a project the requesting tenant owns.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const tenant = await requireTenant();
  // The G702/G703 leaks full AIA progress-billing financials (contract sum,
  // change orders, completed/stored, retainage, current payment due, full
  // schedule of values) — manager-class authority required, not just any
  // tenant member.
  await requireManager(tenant.id);
  const { id } = await ctx.params;
  const payApp = await prisma.payApplication.findFirst({
    where: { id, project: { tenantId: tenant.id } },
    include: {
      project: { include: { tenant: true } },
      lines: { orderBy: { lineNumber: "asc" } },
    },
  });
  if (!payApp) return NextResponse.json({ error: "pay application not found" }, { status: 404 });

  const fmt = (n: MoneyLike) => toNum(n).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const today = new Date().toLocaleDateString("en-US");

  const totalScheduled = sumMoney(payApp.lines.map((l) => l.scheduledValue));
  const totalCompletedToDate = sumMoney(payApp.lines.map((l) => l.totalCompleted));
  const totalRetainage = sumMoney(payApp.lines.map((l) => l.retainage));

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>AIA G702/G703 — ${escapeHtml(payApp.project.name)} — Pay App ${payApp.periodNumber}</title>
<style>
  @page { size: letter portrait; margin: 0.5in; }
  @media print { .no-print { display: none; } }
  body { font: 10pt 'Helvetica Neue', Arial, sans-serif; color: #000; max-width: 7.5in; margin: 0 auto; padding: 0.25in; }
  h1 { font-size: 14pt; margin: 0 0 0.5em; text-transform: uppercase; letter-spacing: 1px; }
  h2 { font-size: 11pt; margin-top: 1.5em; border-bottom: 1px solid #000; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6pt; font-size: 9pt; }
  th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #eee; font-weight: 600; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5em 1em; margin-top: 1em; }
  .meta dt { font-weight: 600; color: #555; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.05em; }
  .meta dd { margin: 0 0 0.5em; }
  .totals td { font-weight: 700; background: #f5f5f5; }
  .toolbar { background: #f0f4f8; border: 1px solid #cbd5e1; padding: 8px 12px; margin-bottom: 1em; font-size: 9pt; }
</style>
</head>
<body>
  <div class="toolbar no-print">
    <strong>Print to PDF:</strong> use your browser's print dialog (Ctrl/Cmd+P) and select "Save as PDF" as the destination.
  </div>

  <h1>Application and Certificate for Payment</h1>
  <div class="meta">
    <div><dt>To Owner</dt><dd>${escapeHtml(payApp.project.ownerName ?? "—")}</dd></div>
    <div><dt>Project</dt><dd>${escapeHtml(payApp.project.name)} (${escapeHtml(payApp.project.code ?? "")})</dd></div>
    <div><dt>From Contractor</dt><dd>${escapeHtml(payApp.project.tenant.name)}</dd></div>
    <div><dt>Application No.</dt><dd>${payApp.periodNumber}</dd></div>
    <div><dt>Period From</dt><dd>${payApp.periodFrom?.toLocaleDateString("en-US") ?? "—"}</dd></div>
    <div><dt>Period To</dt><dd>${payApp.periodTo?.toLocaleDateString("en-US") ?? "—"}</dd></div>
    <div><dt>Date</dt><dd>${today}</dd></div>
    <div><dt>Contract Date</dt><dd>${payApp.project.startDate?.toLocaleDateString("en-US") ?? "—"}</dd></div>
  </div>

  <h2>G702 — Application Summary</h2>
  <table>
    <tr><td>1. Original Contract Sum</td><td class="num">${fmt(payApp.originalContractValue ?? 0)}</td></tr>
    <tr><td>2. Net Change by Change Orders</td><td class="num">${fmt(payApp.changeOrderValue ?? 0)}</td></tr>
    <tr><td>3. Contract Sum to Date (1+2)</td><td class="num">${fmt(payApp.totalContractValue ?? 0)}</td></tr>
    <tr><td>4. Total Completed and Stored to Date</td><td class="num">${fmt(payApp.workCompletedToDate ?? 0)}</td></tr>
    <tr><td>5. Retainage</td><td class="num">${fmt(payApp.retainageHeld ?? 0)}</td></tr>
    <tr><td>6. Total Earned Less Retainage (4-5)</td><td class="num">${fmt(subtractMoney(payApp.workCompletedToDate ?? 0, payApp.retainageHeld ?? 0))}</td></tr>
    <tr><td>7. Less Previous Certificates for Payment</td><td class="num">${fmt(payApp.lessPreviousPayments ?? 0)}</td></tr>
    <tr class="totals"><td>8. Current Payment Due</td><td class="num">${fmt(payApp.currentPaymentDue ?? 0)}</td></tr>
    <tr><td>9. Balance to Finish, Plus Retainage</td><td class="num">${fmt(addMoney(subtractMoney(payApp.totalContractValue, payApp.workCompletedToDate), payApp.retainageHeld))}</td></tr>
  </table>

  <h2>G703 — Continuation Sheet (Schedule of Values)</h2>
  <table>
    <thead>
      <tr>
        <th>A. Item</th>
        <th>B. Description</th>
        <th class="num">C. Scheduled Value</th>
        <th class="num">D. Prev Completed</th>
        <th class="num">E. This Period</th>
        <th class="num">F. Materials Stored</th>
        <th class="num">G. Total Completed (D+E+F)</th>
        <th class="num">% (G/C)</th>
        <th class="num">H. Balance</th>
        <th class="num">I. Retainage</th>
      </tr>
    </thead>
    <tbody>
      ${payApp.lines.map((l) => {
        const total = sumMoney([l.workCompletedPrev, l.workCompletedThis, l.materialsStored]);
        const sv = toNum(l.scheduledValue);
        const pct = sv > 0 ? total / sv : 0;
        return `
        <tr>
          <td>${l.lineNumber}</td>
          <td>${escapeHtml(l.description ?? "")}</td>
          <td class="num">${fmt(l.scheduledValue)}</td>
          <td class="num">${fmt(l.workCompletedPrev)}</td>
          <td class="num">${fmt(l.workCompletedThis)}</td>
          <td class="num">${fmt(l.materialsStored)}</td>
          <td class="num">${fmt(total)}</td>
          <td class="num">${fmtPct(pct)}</td>
          <td class="num">${fmt(subtractMoney(l.scheduledValue, total))}</td>
          <td class="num">${fmt(l.retainage)}</td>
        </tr>`;
      }).join("")}
      <tr class="totals">
        <td colspan="2">TOTALS</td>
        <td class="num">${fmt(totalScheduled)}</td>
        <td colspan="3"></td>
        <td class="num">${fmt(totalCompletedToDate)}</td>
        <td class="num">${fmtPct(totalScheduled > 0 ? totalCompletedToDate / totalScheduled : 0)}</td>
        <td class="num">${fmt(subtractMoney(totalScheduled, totalCompletedToDate))}</td>
        <td class="num">${fmt(totalRetainage)}</td>
      </tr>
    </tbody>
  </table>

  <p style="margin-top:2em;font-size:8pt;color:#555;">
    Generated by Construction OS on ${today}. Document modeled on AIA G702/G703 forms (form names are property of AIA;
    actual AIA forms must be procured and stamped from AIA Contract Documents).
  </p>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, max-age=60",
    },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
