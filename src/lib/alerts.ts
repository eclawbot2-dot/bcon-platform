/**
 * Alert engine — scans the tenant for conditions and produces AlertEvents.
 *
 * Covers: permit expiry, insurance expiry, overdue RFIs, budget variance,
 * failed inspections without punch items, overdue approvals.
 */

import { prisma } from "@/lib/prisma";
import { notifyForAlert } from "@/lib/notify";
import { toNum } from "@/lib/money";

type Produced = { title: string; body?: string; severity: "INFO" | "WARN" | "ALERT"; entityType: string; entityId: string; link?: string; projectId?: string };

export async function runAlertScan(tenantId: string): Promise<{ ok: boolean; produced: number; note: string }> {
  const now = Date.now();
  const out: Produced[] = [];

  const permits = await prisma.permit.findMany({ where: { project: { tenantId } } });
  for (const p of permits) {
    if (!p.expiresAt) continue;
    const daysLeft = Math.round((new Date(p.expiresAt).getTime() - now) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0 && p.status !== "FINALED") {
      out.push({ title: `Permit expired: ${p.permitNumber}`, body: `${p.permitType} permit is ${Math.abs(daysLeft)} days past expiration`, severity: "ALERT", entityType: "Permit", entityId: p.id, link: `/projects/${p.projectId}/permits`, projectId: p.projectId });
    } else if (daysLeft < 14 && p.status === "ISSUED") {
      out.push({ title: `Permit expiring soon: ${p.permitNumber}`, body: `${p.permitType} permit expires in ${daysLeft} days`, severity: "WARN", entityType: "Permit", entityId: p.id, link: `/projects/${p.projectId}/permits`, projectId: p.projectId });
    }
  }

  const certs = await prisma.insuranceCert.findMany({ where: { vendor: { tenantId } }, include: { vendor: true } });
  for (const c of certs) {
    const daysLeft = Math.round((new Date(c.expirationDate).getTime() - now) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) {
      out.push({ title: `Vendor insurance expired: ${c.vendor.name}`, body: `${c.type} cert (${c.policyNumber}) expired ${Math.abs(daysLeft)}d ago`, severity: "ALERT", entityType: "InsuranceCert", entityId: c.id, link: `/vendors/${c.vendor.id}` });
    } else if (daysLeft < 30) {
      out.push({ title: `Vendor insurance expiring: ${c.vendor.name}`, body: `${c.type} cert (${c.policyNumber}) expires in ${daysLeft}d`, severity: "WARN", entityType: "InsuranceCert", entityId: c.id, link: `/vendors/${c.vendor.id}` });
    }
  }

  const rfis = await prisma.rFI.findMany({ where: { project: { tenantId }, status: { notIn: ["APPROVED", "CLOSED"] }, dueDate: { not: null } } });
  for (const r of rfis) {
    if (!r.dueDate) continue;
    const daysLate = Math.round((now - new Date(r.dueDate).getTime()) / (1000 * 60 * 60 * 24));
    if (daysLate > 0) {
      out.push({ title: `RFI overdue: ${r.number}`, body: `${r.subject} — ${daysLate}d past due, ball-in-court: ${r.ballInCourt ?? "—"}`, severity: daysLate > 7 ? "ALERT" : "WARN", entityType: "RFI", entityId: r.id, link: `/projects/${r.projectId}/rfis/${r.id}`, projectId: r.projectId });
    }
  }

  const commitments = await prisma.contractCommitment.findMany({ where: { contract: { project: { tenantId } } }, include: { contract: true } });
  for (const c of commitments) {
    const committed = toNum(c.committedAmount);
    if (committed === 0) continue;
    const pct = toNum(c.invoicedToDate) / committed;
    if (pct > 1.1) {
      out.push({ title: `Commitment over-run: ${c.description}`, body: `Invoiced ${Math.round(pct * 100)}% of commitment (${c.contract.contractNumber})`, severity: "ALERT", entityType: "ContractCommitment", entityId: c.id, link: `/projects/${c.contract.projectId}/contracts/${c.contract.id}`, projectId: c.contract.projectId });
    } else if (pct > 0.95) {
      out.push({ title: `Commitment near limit: ${c.description}`, body: `Invoiced ${Math.round(pct * 100)}% of commitment (${c.contract.contractNumber})`, severity: "WARN", entityType: "ContractCommitment", entityId: c.id, link: `/projects/${c.contract.projectId}/contracts/${c.contract.id}`, projectId: c.contract.projectId });
    }
  }

  const failedInsp = await prisma.inspection.findMany({ where: { project: { tenantId }, result: "FAIL" } });
  for (const i of failedInsp) {
    const hasFollowUp = i.followUpNotes?.includes("Punch item created") ?? false;
    if (!hasFollowUp) {
      out.push({ title: `Failed inspection without follow-up: ${i.title}`, body: `Create a punch item to close the loop`, severity: "WARN", entityType: "Inspection", entityId: i.id, link: `/projects/${i.projectId}/inspections/${i.id}`, projectId: i.projectId });
    }
  }

  // Vendor prequalification / bonding expiry — a prequal lapse means the
  // vendor can no longer be awarded new work until re-qualified. Tracked
  // on Vendor.prequalExpires; only flag vendors that were actually
  // qualified (an expiry date is set).
  const vendors = await prisma.vendor.findMany({ where: { tenantId, prequalExpires: { not: null } } });
  for (const v of vendors) {
    if (!v.prequalExpires) continue;
    const daysLeft = Math.round((new Date(v.prequalExpires).getTime() - now) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) {
      out.push({ title: `Vendor prequalification expired: ${v.name}`, body: `Prequal lapsed ${Math.abs(daysLeft)}d ago — vendor cannot be awarded new work until re-qualified`, severity: "ALERT", entityType: "Vendor", entityId: v.id, link: `/vendors/${v.id}` });
    } else if (daysLeft < 30) {
      out.push({ title: `Vendor prequalification expiring: ${v.name}`, body: `Prequal expires in ${daysLeft}d — start renewal now to avoid an award block`, severity: "WARN", entityType: "Vendor", entityId: v.id, link: `/vendors/${v.id}` });
    }
  }

  // Pay-app stuck awaiting approval — once submitted, AIA G702 pay apps
  // run an approval clock; sitting > 7d in SUBMITTED/PENDING_APPROVAL
  // delays the GC's draw and the downstream sub payment chain.
  const stalePayApps = await prisma.payApplication.findMany({
    where: { project: { tenantId }, status: { in: ["SUBMITTED", "PENDING_APPROVAL"] }, submittedAt: { not: null } },
    include: { project: true },
  });
  for (const pa of stalePayApps) {
    if (!pa.submittedAt) continue;
    const daysWaiting = Math.round((now - new Date(pa.submittedAt).getTime()) / (1000 * 60 * 60 * 24));
    if (daysWaiting > 7) {
      out.push({ title: `Pay app awaiting approval: ${pa.project.code} #${pa.periodNumber}`, body: `Submitted ${daysWaiting}d ago and still ${pa.status} — review to keep the draw on schedule`, severity: daysWaiting > 14 ? "ALERT" : "WARN", entityType: "PayApplication", entityId: pa.id, link: `/projects/${pa.projectId}/pay-applications/${pa.id}`, projectId: pa.projectId });
    }
  }

  // Outstanding lien waivers — a PENDING waiver past its through-date
  // (or already flagged EXPIRED) blocks conditional release of the
  // matching pay-app / sub-invoice; left unresolved it is a lien-risk.
  const openWaivers = await prisma.lienWaiver.findMany({
    where: { project: { tenantId }, status: { in: ["PENDING", "EXPIRED"] } },
    include: { project: true },
  });
  for (const w of openWaivers) {
    const daysPast = Math.round((now - new Date(w.throughDate).getTime()) / (1000 * 60 * 60 * 24));
    if (w.status === "EXPIRED" || daysPast > 14) {
      out.push({ title: `Lien waiver outstanding: ${w.partyName}`, body: `${w.waiverType} waiver on ${w.project.code} ${w.status === "EXPIRED" ? "is EXPIRED" : `is ${daysPast}d past its through-date`} — collect before releasing funds`, severity: "WARN", entityType: "LienWaiver", entityId: w.id, link: `/projects/${w.projectId}/lien-waivers`, projectId: w.projectId });
    }
  }

  // Submittals stalled in review — a submittal sitting in SUBMITTED /
  // IN_REVIEW past 14d consumes schedule float (esp. long-lead items)
  // and is a leading indicator of a procurement slip.
  const stalledSubmittals = await prisma.submittal.findMany({
    where: { project: { tenantId }, status: "UNDER_REVIEW", submittedAt: { not: null } },
  });
  for (const s of stalledSubmittals) {
    if (!s.submittedAt) continue;
    const daysInReview = Math.round((now - new Date(s.submittedAt).getTime()) / (1000 * 60 * 60 * 24));
    const threshold = s.longLead ? 7 : 14;
    if (daysInReview > threshold) {
      out.push({ title: `Submittal stalled in review: ${s.number}`, body: `${s.title} — ${daysInReview}d under review${s.longLead ? " (LONG-LEAD)" : ""}; review to protect the procurement schedule`, severity: s.longLead && daysInReview > 14 ? "ALERT" : "WARN", entityType: "Submittal", entityId: s.id, link: `/projects/${s.projectId}/submittals/${s.id}`, projectId: s.projectId });
    }
  }

  await prisma.alertEvent.deleteMany({ where: { tenantId, acknowledgedAt: null } });
  let notified = 0;
  for (const p of out) {
    const event = await prisma.alertEvent.create({ data: { tenantId, ...p } });
    notified += await notifyForAlert(event);
  }

  return {
    ok: true,
    produced: out.length,
    note: `produced ${out.length} alert${out.length === 1 ? "" : "s"}; dispatched ${notified} notification${notified === 1 ? "" : "s"}`,
  };
}

/**
 * Platform-wide alert sweep — runs runAlertScan() for every tenant.
 * Intended to be driven by the bearer-gated /api/cron/alert-scan route on
 * a daily schedule. A failure scanning one tenant is isolated so the rest
 * still get their alerts (and notifications). Scoping per tenant is the
 * existing runAlertScan contract — no cross-tenant leakage.
 */
export async function runAlertScanAllTenants(): Promise<{
  ok: boolean;
  tenantsScanned: number;
  produced: number;
  errors: number;
  runs: Array<{ tenantId: string; produced: number; error?: string }>;
}> {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  let produced = 0;
  let errors = 0;
  const runs: Array<{ tenantId: string; produced: number; error?: string }> = [];
  for (const t of tenants) {
    try {
      const r = await runAlertScan(t.id);
      produced += r.produced;
      runs.push({ tenantId: t.id, produced: r.produced });
    } catch (err) {
      errors += 1;
      runs.push({ tenantId: t.id, produced: 0, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { ok: errors === 0, tenantsScanned: tenants.length, produced, errors, runs };
}
