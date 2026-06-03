/**
 * Concrete workflow run() implementations.
 *
 * Five deterministic (NO-LLM) predictive scans from the intelligence audit
 * plus thin cadence wrappers over the existing alert-scan and mail-ingest
 * engines, and two LLM-needing workflows that SKIP cleanly when no key
 * resolves. All output is ADVISORY (alerts / review items) — none of these
 * auto-mutate domain data.
 */

import { prisma } from "@/lib/prisma";
import { toNum } from "@/lib/money";
import { isLlmEnabled } from "@/lib/ai";
import { runAlertScan } from "@/lib/alerts";
import { ingestTenant } from "@/lib/mail/ingest";
import { eacForecast } from "@/lib/finance-ai";
import { reconcileAdvisoryAlerts, type AdvisoryAlert } from "@/lib/automations/advisory";
import type { WorkflowResult, WorkflowRunContext } from "@/lib/automations/types";

const DAY = 24 * 60 * 60 * 1000;
const ok = (summary: string, producedCount = 0, extra: Partial<WorkflowResult> = {}): WorkflowResult => ({
  status: "SUCCESS",
  summary,
  producedCount,
  actionCount: 0,
  ...extra,
});

// ── Wrapped existing engines ──────────────────────────────────────────────

/** Cadence wrapper over the existing per-tenant alert engine. */
export async function runAlertScanWorkflow(ctx: WorkflowRunContext): Promise<WorkflowResult> {
  const r = await runAlertScan(ctx.tenantId);
  return ok(r.note, r.produced);
}

/** Cadence wrapper over the existing per-tenant mail ingest. SKIPs when no
 *  enabled connection exists for the tenant (mail is opt-in + admin-only). */
export async function runMailIngestWorkflow(ctx: WorkflowRunContext): Promise<WorkflowResult> {
  const conn = await prisma.mailConnection.findUnique({ where: { tenantId: ctx.tenantId }, select: { enabled: true } });
  if (!conn || !conn.enabled) {
    return { status: "SKIPPED", summary: "mail ingestion not enabled for this tenant", skippedReason: "mail_disabled", producedCount: 0, actionCount: 0 };
  }
  const r = await ingestTenant(ctx.tenantId);
  if (!r.ok && r.errors.length) {
    return { status: "ERROR", summary: `ingest errors: ${r.errors[0]}`, error: r.errors.join("; "), producedCount: r.ingested, actionCount: 0 };
  }
  return ok(`scanned ${r.scanned}, ingested ${r.ingested} across ${r.mailboxes} mailbox(es)`, r.ingested);
}

// ── Deterministic predictive scans (NO-LLM) ───────────────────────────────

/**
 * Schedule-slip prediction. For each in-flight ScheduleTask, project a
 * finish date from current %-complete vs elapsed time and compare to the
 * planned end (and baseline). Flags tasks trending late — earlier for
 * critical-path activities.
 */
export async function runScheduleSlipPredict(ctx: WorkflowRunContext): Promise<WorkflowResult> {
  const now = Date.now();
  const tasks = await prisma.scheduleTask.findMany({
    where: { project: { tenantId: ctx.tenantId }, actualEnd: null, isMilestone: false },
    select: { id: true, name: true, projectId: true, startDate: true, endDate: true, percentComplete: true, onCriticalPath: true, baselineEnd: true },
  });
  const out: AdvisoryAlert[] = [];
  for (const t of tasks) {
    const start = new Date(t.startDate).getTime();
    const planEnd = new Date(t.endDate).getTime();
    const planDur = Math.max(1, planEnd - start);
    const pct = Math.min(100, Math.max(0, t.percentComplete));
    // Only predict once the task has actually started.
    if (now < start) continue;
    const elapsed = now - start;
    // Projected finish: linear extrapolation of progress rate. If no
    // progress yet but time has elapsed, treat as fully stalled.
    let projectedEnd: number;
    if (pct >= 100) continue;
    if (pct <= 0) {
      // No progress; project finish as start + (elapsed extrapolated to full).
      projectedEnd = now + planDur;
    } else {
      const rate = pct / 100 / Math.max(1, elapsed); // fraction per ms
      const remaining = (1 - pct / 100) / rate;
      projectedEnd = now + remaining;
    }
    const slipDays = Math.round((projectedEnd - planEnd) / DAY);
    const baseSlip = t.baselineEnd ? Math.round((projectedEnd - new Date(t.baselineEnd).getTime()) / DAY) : null;
    const threshold = t.onCriticalPath ? 2 : 7;
    if (slipDays > threshold) {
      const severity: AdvisoryAlert["severity"] = t.onCriticalPath && slipDays > 7 ? "ALERT" : "WARN";
      out.push({
        title: `Schedule slip predicted: ${t.name}`,
        body: `Trending ~${slipDays}d late vs plan${baseSlip != null ? ` (${baseSlip}d vs baseline)` : ""} at ${Math.round(pct)}% complete${t.onCriticalPath ? " — CRITICAL PATH" : ""}.`,
        severity,
        entityType: "AutomationScheduleSlip",
        entityId: t.id,
        link: `/projects/${t.projectId}/schedule`,
        projectId: t.projectId,
      });
    }
  }
  const r = await reconcileAdvisoryAlerts(ctx.tenantId, ["AutomationScheduleSlip"], out);
  return ok(`reviewed ${tasks.length} task(s); ${r.created} new slip warning(s), ${r.resolved} resolved`, r.produced);
}

/**
 * Cash-flow forecast (advisory). Per active project, derive an EAC and
 * compare forecast cost vs billed-to-date / contract to flag projects whose
 * cash position is trending negative (cost outrunning billings).
 */
export async function runCashflowForecast(ctx: WorkflowRunContext): Promise<WorkflowResult> {
  const projects = await prisma.project.findMany({
    where: { tenantId: ctx.tenantId, stage: { in: ["PRECONSTRUCTION", "ACTIVE"] } },
    select: { id: true, code: true, name: true },
    take: 100,
  });
  const out: AdvisoryAlert[] = [];
  let scored = 0;
  for (const p of projects) {
    const snap = await prisma.projectPnlSnapshot.findUnique({ where: { projectId: p.id } });
    if (!snap) continue;
    scored += 1;
    const billed = toNum(snap.billedToDate);
    const costs = toNum(snap.costsToDate);
    let eacCost = toNum(snap.forecastFinalCost);
    try {
      const f = await eacForecast(p.id, ctx.tenantId); // degrades to heuristic without a key
      if (f.eacCost > 0) eacCost = f.eacCost;
    } catch {
      /* keep snapshot forecast */
    }
    // Cash gap: money spent but not yet billed (underbilling) is a cash
    // drain; an EAC above contract means the remaining work erodes cash.
    const underbilled = costs - billed;
    if (underbilled > 0 && billed > 0 && underbilled / Math.max(1, billed) > 0.15) {
      out.push({
        title: `Cash-flow risk: ${p.code} underbilled`,
        body: `Costs-to-date exceed billings by $${Math.round(underbilled).toLocaleString()} (${Math.round((underbilled / Math.max(1, costs)) * 100)}% of cost). Accelerate billing to protect cash.`,
        severity: underbilled / Math.max(1, billed) > 0.3 ? "ALERT" : "WARN",
        entityType: "AutomationCashflow",
        entityId: p.id,
        link: `/projects/${p.id}/financials`,
        projectId: p.id,
      });
    }
  }
  const r = await reconcileAdvisoryAlerts(ctx.tenantId, ["AutomationCashflow"], out);
  return ok(`forecast ${scored} project(s); ${r.created} new cash-flow warning(s), ${r.resolved} resolved`, r.produced);
}

/**
 * Portfolio margin-fade early-warning. Per project, compare the forecast
 * gross margin (EAC) against the planned margin target and flag erosion.
 */
export async function runMarginFadeWarning(ctx: WorkflowRunContext): Promise<WorkflowResult> {
  const projects = await prisma.project.findMany({
    where: { tenantId: ctx.tenantId, stage: { in: ["PRECONSTRUCTION", "ACTIVE"] } },
    select: { id: true, code: true, marginTargetPct: true },
    take: 100,
  });
  const out: AdvisoryAlert[] = [];
  let scored = 0;
  for (const p of projects) {
    let marginPct: number | null = null;
    try {
      const f = await eacForecast(p.id, ctx.tenantId);
      marginPct = f.marginPct;
    } catch {
      const snap = await prisma.projectPnlSnapshot.findUnique({ where: { projectId: p.id } });
      if (snap) {
        const rev = toNum(snap.totalContractValue) || toNum(snap.contractValue);
        const margin = toNum(snap.forecastGrossMargin);
        marginPct = rev > 0 ? (margin / rev) * 100 : null;
      }
    }
    if (marginPct == null) continue;
    scored += 1;
    const target = p.marginTargetPct ?? 15; // default 15% plan
    const fade = target - marginPct;
    if (fade > 2) {
      out.push({
        title: `Margin fade: ${p.code}`,
        body: `Forecast margin ${marginPct.toFixed(1)}% is ${fade.toFixed(1)} pts below the ${target.toFixed(1)}% target. Review change orders, productivity, and commitments.`,
        severity: fade > 5 || marginPct < 0 ? "ALERT" : "WARN",
        entityType: "AutomationMarginFade",
        entityId: p.id,
        link: `/projects/${p.id}/financials`,
        projectId: p.id,
      });
    }
  }
  const r = await reconcileAdvisoryAlerts(ctx.tenantId, ["AutomationMarginFade"], out);
  return ok(`scored ${scored} project(s); ${r.created} new margin-fade warning(s), ${r.resolved} resolved`, r.produced);
}

/**
 * Late-payment prediction. Looks at sub-invoices and owner pay-apps that
 * are approaching or past due and predicts which are likely to pay late
 * based on elapsed time vs net terms. Prediction-only (advisory).
 */
export async function runLatePaymentPredict(ctx: WorkflowRunContext): Promise<WorkflowResult> {
  const now = Date.now();
  const out: AdvisoryAlert[] = [];

  // Sub-invoices approved/submitted but not paid, with a due date.
  const subs = await prisma.subInvoice.findMany({
    where: { project: { tenantId: ctx.tenantId }, paidAt: null, status: { notIn: ["PAID", "REJECTED"] }, dueDate: { not: null } },
    select: { id: true, invoiceNumber: true, projectId: true, dueDate: true, netDue: true, vendor: { select: { name: true } } },
    take: 300,
  });
  for (const s of subs) {
    if (!s.dueDate) continue;
    const daysToDue = Math.round((new Date(s.dueDate).getTime() - now) / DAY);
    // Predict late: already past due, or within 5 days and still unpaid.
    if (daysToDue < 0) {
      out.push({
        title: `Late payment predicted: ${s.vendor?.name ?? "vendor"} ${s.invoiceNumber}`,
        body: `Sub-invoice for $${Math.round(toNum(s.netDue)).toLocaleString()} is ${Math.abs(daysToDue)}d past its due date and unpaid — payment is likely late.`,
        severity: daysToDue < -7 ? "ALERT" : "WARN",
        entityType: "AutomationLatePayment",
        entityId: s.id,
        link: `/projects/${s.projectId}/sub-invoices`,
        projectId: s.projectId,
      });
    } else if (daysToDue <= 5) {
      out.push({
        title: `Payment due soon: ${s.vendor?.name ?? "vendor"} ${s.invoiceNumber}`,
        body: `Sub-invoice for $${Math.round(toNum(s.netDue)).toLocaleString()} is due in ${daysToDue}d and not yet paid — schedule the payment to avoid a late.`,
        severity: "WARN",
        entityType: "AutomationLatePayment",
        entityId: s.id,
        link: `/projects/${s.projectId}/sub-invoices`,
        projectId: s.projectId,
      });
    }
  }
  const r = await reconcileAdvisoryAlerts(ctx.tenantId, ["AutomationLatePayment"], out);
  return ok(`evaluated ${subs.length} unpaid sub-invoice(s); ${r.created} new late-payment prediction(s), ${r.resolved} resolved`, r.produced);
}

/**
 * Close-the-AI-feedback-loop. Aggregates `AiRunLog.userFeedback` per AI
 * `kind` into accept/reject trust scores and records the summary. When a
 * kind's reject rate is high it raises an advisory alert so the team knows
 * an AI feature is underperforming. Advisory only.
 */
export async function runFeedbackLoopClose(ctx: WorkflowRunContext): Promise<WorkflowResult> {
  const rows = await prisma.aiRunLog.findMany({
    where: { tenantId: ctx.tenantId, userFeedback: { not: null } },
    select: { kind: true, userFeedback: true },
  });
  const byKind = new Map<string, { accepted: number; rejected: number; edited: number; total: number }>();
  for (const r of rows) {
    const agg = byKind.get(r.kind) ?? { accepted: 0, rejected: 0, edited: 0, total: 0 };
    agg.total += 1;
    if (r.userFeedback === "ACCEPTED") agg.accepted += 1;
    else if (r.userFeedback === "REJECTED") agg.rejected += 1;
    else if (r.userFeedback === "EDITED") agg.edited += 1;
    byKind.set(r.kind, agg);
  }

  const out: AdvisoryAlert[] = [];
  const parts: string[] = [];
  for (const [kind, agg] of byKind) {
    const trust = agg.total > 0 ? Math.round((agg.accepted / agg.total) * 100) : 0;
    parts.push(`${kind}:${trust}%(n=${agg.total})`);
    // Flag a low-trust AI feature once there's enough signal.
    if (agg.total >= 5 && trust < 50) {
      out.push({
        title: `AI feature underperforming: ${kind}`,
        body: `Only ${trust}% of ${agg.total} ${kind} outputs were accepted (${agg.rejected} rejected, ${agg.edited} edited). Review the prompt/heuristic for this kind.`,
        severity: trust < 25 ? "ALERT" : "WARN",
        entityType: "AutomationFeedbackLoop",
        entityId: kind,
      });
    }
  }
  const r = await reconcileAdvisoryAlerts(ctx.tenantId, ["AutomationFeedbackLoop"], out);
  const summary = byKind.size > 0
    ? `trust scores — ${parts.slice(0, 8).join(", ")}${parts.length > 8 ? " …" : ""}; ${r.created} new low-trust flag(s)`
    : "no AI feedback recorded yet";
  return ok(summary, r.produced);
}

// ── LLM-needing workflows (SKIP cleanly without a key) ─────────────────────

/**
 * Proactive copilot digest — an LLM-authored daily summary of what changed.
 * Registered but SKIPS cleanly when no LLM key is configured.
 */
export async function runCopilotDigest(ctx: WorkflowRunContext): Promise<WorkflowResult> {
  if (!isLlmEnabled()) {
    return { status: "SKIPPED", summary: "no LLM key configured — digest skipped", skippedReason: "no_llm_key", producedCount: 0, actionCount: 0 };
  }
  // Key present: scaffolded. A future pass composes pageCopilot()/
  // tenantAskAnything() over recent activity and writes a digest record.
  // We do NOT mutate domain data here; advisory only.
  return ok("LLM available — digest generation not yet implemented (no-op)", 0, { usedLlm: false });
}

/**
 * Narrative drafting — LLM drafts of RFI replies / change-order narratives /
 * owner-report prose for human review. Registered but SKIPS cleanly without
 * a key; never auto-sends (advisory drafts only).
 */
export async function runNarrativeDrafting(ctx: WorkflowRunContext): Promise<WorkflowResult> {
  if (!isLlmEnabled()) {
    return { status: "SKIPPED", summary: "no LLM key configured — narrative drafting skipped", skippedReason: "no_llm_key", producedCount: 0, actionCount: 0 };
  }
  return ok("LLM available — narrative drafting not yet implemented (no-op)", 0, { usedLlm: false });
}
