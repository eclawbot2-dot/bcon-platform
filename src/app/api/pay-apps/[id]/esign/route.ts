import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { requireManager } from "@/lib/permissions";
import { esignStatus, sendForSignature } from "@/lib/esign";
import { logComment } from "@/lib/approvals";
import { publicRedirect } from "@/lib/redirect";
import { formatCurrency, formatDate } from "@/lib/utils";

/**
 * POST /api/pay-apps/[id]/esign — send the G702 summary out for e-signature.
 *
 * Env-gated (ESIGN_PROVIDER=docusign + DOCUSIGN_* — see docs/integrations.md).
 * When unconfigured, returns 503 with the missing var names so the operator
 * knows exactly what to set; the UI renders a disabled state instead of the
 * button. Manager-gated and tenant-scoped: only the owning tenant's managers
 * can send, and a forged id from another tenant 404s.
 *
 * Body (form-encoded): signerName, signerEmail.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const tenant = await requireTenant();
  let actor;
  try {
    actor = await requireManager(tenant.id);
  } catch {
    return NextResponse.json({ error: "Manager-level role required to send for signature." }, { status: 403 });
  }

  const status = esignStatus();
  if (!status.configured) {
    return NextResponse.json(
      {
        error: "E-signature integration is not configured.",
        missing: status.missing,
        hint: "Set ESIGN_PROVIDER=docusign plus the DOCUSIGN_* env vars (docs/integrations.md) and restart.",
      },
      { status: 503 },
    );
  }

  const app = await prisma.payApplication.findFirst({
    where: { id, project: { tenantId: tenant.id } },
    include: { project: true, contract: true },
  });
  if (!app) return NextResponse.json({ error: "pay application not found" }, { status: 404 });
  if (app.status !== "SUBMITTED" && app.status !== "PENDING_APPROVAL" && app.status !== "APPROVED") {
    return NextResponse.json({ error: `Pay app must be SUBMITTED, PENDING_APPROVAL, or APPROVED to send for signature. Current: ${app.status}.` }, { status: 400 });
  }

  const form = await req.formData();
  const signerName = String(form.get("signerName") ?? "").trim();
  const signerEmail = String(form.get("signerEmail") ?? "").trim();
  if (!signerName || !signerEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(signerEmail)) {
    return publicRedirect(req, `/projects/${app.projectId}/pay-apps/${app.id}?error=${encodeURIComponent("Signer name and a valid email are required")}`, 303);
  }

  const documentHtml = `<!doctype html><html><body style="font-family:Georgia,serif;max-width:720px;margin:2em auto">
<h1 style="font-size:18px">Application and Certificate for Payment (AIA G702)</h1>
<p><strong>${escapeHtml(app.project.name)}</strong> (${escapeHtml(app.project.code)})</p>
<table style="width:100%;border-collapse:collapse" border="1" cellpadding="6">
<tr><td>Application #</td><td>${app.periodNumber}</td></tr>
<tr><td>Period</td><td>${formatDate(app.periodFrom)} → ${formatDate(app.periodTo)}</td></tr>
<tr><td>Contract</td><td>${escapeHtml(app.contract?.contractNumber ?? "—")}</td></tr>
<tr><td>Original contract value</td><td>${formatCurrency(app.originalContractValue)}</td></tr>
<tr><td>Change orders</td><td>${formatCurrency(app.changeOrderValue)}</td></tr>
<tr><td>Current contract value</td><td>${formatCurrency(app.totalContractValue)}</td></tr>
<tr><td>Work completed to date</td><td>${formatCurrency(app.workCompletedToDate)}</td></tr>
<tr><td>Materials stored</td><td>${formatCurrency(app.materialsStoredToDate)}</td></tr>
<tr><td>Retainage held (${app.retainagePct}%)</td><td>${formatCurrency(app.retainageHeld)}</td></tr>
<tr><td>Less previous payments</td><td>${formatCurrency(app.lessPreviousPayments)}</td></tr>
<tr><td><strong>Current payment due</strong></td><td><strong>${formatCurrency(app.currentPaymentDue)}</strong></td></tr>
</table>
<p style="margin-top:3em">The undersigned certifies that the work covered by this application
has been completed in accordance with the contract documents and that the current payment shown
is now due.</p>
<p style="margin-top:3em">Signature: /sign-here/</p>
<p>${escapeHtml(signerName)}</p>
</body></html>`;

  const result = await sendForSignature({
    subject: `Signature requested: ${app.project.code} pay application #${app.periodNumber}`,
    documentName: `${app.project.code} Pay Application #${app.periodNumber} (G702)`,
    documentHtml,
    signerName,
    signerEmail,
  });

  if (!result.ok) {
    const code = result.disabled ? 503 : 502;
    return NextResponse.json({ error: result.error }, { status: code });
  }

  await logComment({
    tenantId: tenant.id,
    entityType: "PayApplication",
    entityId: app.id,
    actorName: actor.userName,
    actorId: actor.userId,
    kind: "SUBMIT",
    body: `Sent for e-signature to ${signerName} <${signerEmail}> — DocuSign envelope ${result.envelopeId}.`,
    audit: { after: { envelopeId: result.envelopeId, signerEmail } },
  });

  return publicRedirect(req, `/projects/${app.projectId}/pay-apps/${app.id}?ok=${encodeURIComponent(`Sent for signature (envelope ${result.envelopeId})`)}`, 303);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
