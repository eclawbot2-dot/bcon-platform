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
import { isLlmEnabled, llmProvider, aiCall } from "@/lib/ai";
import { runAlertScan } from "@/lib/alerts";
import { ingestTenant } from "@/lib/mail/ingest";
import { eacForecast } from "@/lib/finance-ai";
import { tenantUnitCostHistory, benchmarkUnitCostHistorical } from "@/lib/estimating-ai";
import { tenantAskAnything } from "@/lib/copilot-ai";
import { reconcileAdvisoryAlerts, type AdvisoryAlert } from "@/lib/automations/advisory";
import type { WorkflowResult, WorkflowRunContext } from "@/lib/automations/types";

const DAY = 24 * 60 * 60 * 1000;
/** AutomationRun rows older than this are pruned by the retention sweep. */
export const RUN_RETENTION_DAYS = 90;
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
    const contract = toNum(snap.totalContractValue) || toNum(snap.contractValue);
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
    // EAC overrun: forecast cost-at-completion exceeding the contract value
    // means the remaining work is funded out of margin — a cash drain.
    if (eacCost > 0 && contract > 0 && eacCost / contract > 1.02) {
      const overrun = eacCost - contract;
      out.push({
        title: `Cash-flow risk: ${p.code} forecast overrun`,
        body: `Forecast cost at completion ($${Math.round(eacCost).toLocaleString()}) exceeds the contract value ($${Math.round(contract).toLocaleString()}) by $${Math.round(overrun).toLocaleString()} (${Math.round((overrun / contract) * 100)}%). The remaining work erodes margin and cash.`,
        severity: eacCost / contract > 1.08 ? "ALERT" : "WARN",
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
  // Owner pay-apps approved but not yet paid. There is no explicit dueDate on
  // PayApplication, so we predict late receivables off net terms from the
  // approval date (default net-30). An approved-but-unpaid pay-app drifting
  // past terms is incoming cash at risk.
  const OWNER_NET_DAYS = 30;
  const payApps = await prisma.payApplication.findMany({
    where: { project: { tenantId: ctx.tenantId }, status: "APPROVED", paidAt: null, approvedAt: { not: null } },
    select: { id: true, periodNumber: true, projectId: true, approvedAt: true, currentPaymentDue: true, project: { select: { code: true } } },
    take: 300,
  });
  let payAppsAtRisk = 0;
  for (const pa of payApps) {
    if (!pa.approvedAt) continue;
    const dueAt = new Date(pa.approvedAt).getTime() + OWNER_NET_DAYS * DAY;
    const daysToDue = Math.round((dueAt - now) / DAY);
    if (daysToDue < 0) {
      payAppsAtRisk += 1;
      out.push({
        title: `Owner payment overdue: ${pa.project.code} pay-app #${pa.periodNumber}`,
        body: `Approved pay-app for $${Math.round(toNum(pa.currentPaymentDue)).toLocaleString()} is ${Math.abs(daysToDue)}d past net-${OWNER_NET_DAYS} from approval and unpaid — owner receipt is likely late. Follow up on the receivable.`,
        severity: daysToDue < -15 ? "ALERT" : "WARN",
        entityType: "AutomationLatePayment",
        entityId: `payapp:${pa.id}`,
        link: `/projects/${pa.projectId}/pay-apps`,
        projectId: pa.projectId,
      });
    } else if (daysToDue <= 5) {
      out.push({
        title: `Owner payment due soon: ${pa.project.code} pay-app #${pa.periodNumber}`,
        body: `Approved pay-app for $${Math.round(toNum(pa.currentPaymentDue)).toLocaleString()} reaches net-${OWNER_NET_DAYS} in ${daysToDue}d and is unpaid — confirm the owner has it scheduled.`,
        severity: "WARN",
        entityType: "AutomationLatePayment",
        entityId: `payapp:${pa.id}`,
        link: `/projects/${pa.projectId}/pay-apps`,
        projectId: pa.projectId,
      });
    }
  }

  const r = await reconcileAdvisoryAlerts(ctx.tenantId, ["AutomationLatePayment"], out);
  return ok(`evaluated ${subs.length} unpaid sub-invoice(s) + ${payApps.length} approved pay-app(s) (${payAppsAtRisk} overdue); ${r.created} new late-payment prediction(s), ${r.resolved} resolved`, r.produced);
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

/**
 * Bid-leveling historical benchmark (intelligence-audit bcon #10, NO-LLM).
 * For every OPEN bid package, compares each priced SubBidLine unit price
 * against the tenant's OWN historical unit-cost distribution for that cost
 * code (Tukey-fence outlier detection over all prior priced sub-bid lines).
 * Flags statistical outliers so an estimator can sanity-check a sub's number
 * before award. Deterministic; advisory only.
 */
export async function runBidBenchmark(ctx: WorkflowRunContext): Promise<WorkflowResult> {
  // Active/open packages whose bids are still being leveled.
  const packages = await prisma.bidPackage.findMany({
    where: { project: { tenantId: ctx.tenantId }, status: { in: ["PLANNING", "INVITED", "COLLECTING", "LEVELING"] } },
    select: {
      id: true,
      name: true,
      project: { select: { id: true } },
      subBids: {
        where: { bidAmount: { not: null } },
        select: {
          id: true,
          vendor: { select: { name: true } },
          lines: { where: { costCode: { not: null }, unitPrice: { not: null }, quantity: { gt: 0 } }, select: { id: true, costCode: true, description: true, unitPrice: true, quantity: true } },
        },
      },
    },
    take: 100,
  });

  // Exclude the lines belonging to packages we're scoring so a package is
  // never benchmarked against its own (currently-open) bids.
  const excludeSubBidIds = new Set<string>();
  for (const pkg of packages) for (const sb of pkg.subBids) excludeSubBidIds.add(sb.id);
  const history = await tenantUnitCostHistory(ctx.tenantId, { excludeSubBidIds });

  const out: AdvisoryAlert[] = [];
  let evaluated = 0;
  for (const pkg of packages) {
    for (const sb of pkg.subBids) {
      // Worst (largest |delta|) outlier line per sub-bid drives a single
      // alert — avoids one mispriced sub producing a dozen notifications.
      let worst: { line: (typeof sb.lines)[number]; b: ReturnType<typeof benchmarkUnitCostHistorical> } | null = null;
      for (const line of sb.lines) {
        if (!line.costCode) continue;
        const samples = history.get(line.costCode);
        if (!samples) continue;
        evaluated += 1;
        const b = benchmarkUnitCostHistorical(line.costCode, toNum(line.unitPrice), samples);
        if (b.verdict === "NORMAL" || b.verdict === "NO_DATA") continue;
        if (!worst || Math.abs(b.deltaPct) > Math.abs(worst.b.deltaPct)) worst = { line, b };
      }
      if (worst) {
        const { line, b } = worst;
        const dir = b.verdict === "HIGH" ? "above" : "below";
        out.push({
          title: `Outlier sub-bid line: ${sb.vendor?.name ?? "vendor"} · ${line.costCode}`,
          body: `In package "${pkg.name}", ${sb.vendor?.name ?? "this sub"}'s unit price $${toNum(line.unitPrice).toLocaleString()} for ${line.costCode} (${line.description}) is ${Math.abs(Math.round(b.deltaPct))}% ${dir} your historical median of $${b.median.toLocaleString()} (normal band $${b.bandLow.toLocaleString()}–$${b.bandHigh.toLocaleString()}, n=${b.samples}). Verify scope/quantities before award.`,
          severity: Math.abs(b.deltaPct) > 50 ? "ALERT" : "WARN",
          entityType: "AutomationBidBenchmark",
          entityId: sb.id,
          link: `/projects/${pkg.project.id}/bids`,
          projectId: pkg.project.id,
        });
      }
    }
  }
  const r = await reconcileAdvisoryAlerts(ctx.tenantId, ["AutomationBidBenchmark"], out);
  return ok(`benchmarked ${evaluated} priced line(s) across ${packages.length} open package(s) vs tenant history; ${r.created} new outlier flag(s), ${r.resolved} resolved`, r.produced);
}

// ── Maintenance ────────────────────────────────────────────────────────────

/**
 * AutomationRun retention sweep (the spec's unbuilt guardrail). Prunes
 * AutomationRun rows older than RUN_RETENTION_DAYS for THIS tenant so run
 * history can't grow unbounded. Per-tenant + cadence-gated like every other
 * workflow; advisory/maintenance only (touches no domain data).
 */
export async function runRetentionSweep(ctx: WorkflowRunContext): Promise<WorkflowResult> {
  const cutoff = new Date(Date.now() - RUN_RETENTION_DAYS * DAY);
  const del = await prisma.automationRun.deleteMany({
    where: { tenantId: ctx.tenantId, startedAt: { lt: cutoff } },
  });
  return ok(`pruned ${del.count} AutomationRun row(s) older than ${RUN_RETENTION_DAYS}d`, 0);
}

// ── LLM-needing workflows (SKIP cleanly without a key) ─────────────────────

type DigestShape = { headline: string; bullets: string[] };

/**
 * Proactive copilot digest — an LLM-authored periodic summary of the tenant's
 * current state. When a key is present we ask the tenant copilot a fixed set
 * of analytics questions, then have the LLM weave the deterministic facts into
 * a short digest; the result is stored as an advisory AiRunLog artifact (which
 * also feeds the feedback-loop). SKIPS cleanly when no key resolves.
 */
export async function runCopilotDigest(ctx: WorkflowRunContext): Promise<WorkflowResult> {
  if (!isLlmEnabled()) {
    return { status: "SKIPPED", summary: "no LLM key configured — digest skipped", skippedReason: "no_llm_key", producedCount: 0, actionCount: 0 };
  }
  // Gather deterministic facts via the existing copilot (these never hit an
  // LLM here — tenantAskAnything's fallback runs the DB queries). We then ask
  // the model to summarize ONLY these facts (no fabrication).
  const questions = [
    "pipeline by stage",
    "projects over budget",
    "backlog",
    "open RFIs",
    "late schedule tasks",
  ];
  const facts: string[] = [];
  for (const q of questions) {
    try {
      const a = await tenantAskAnything(q, ctx.tenantId);
      if (a.answer) facts.push(`- ${q}: ${a.answer.replace(/\s+/g, " ").trim()}`);
    } catch { /* skip a question that errors */ }
  }
  const factBlock = facts.join("\n") || "- (no activity recorded yet)";

  const digest = await aiCall<DigestShape>({
    kind: "automation-copilot-digest",
    tenantId: ctx.tenantId,
    maxTokens: 700,
    system: "You are a construction-operations analyst. Summarize ONLY the supplied facts into a crisp executive digest. Never invent numbers or events not present in the facts. Return STRICT JSON: {\"headline\": string, \"bullets\": string[]} with 3-6 bullets.",
    prompt: `Tenant operations facts:\n${factBlock}\n\nWrite the digest.`,
    parse: (raw) => {
      const m = raw.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(m ? m[0] : raw) as Partial<DigestShape>;
      return { headline: String(parsed.headline ?? "Operations digest"), bullets: Array.isArray(parsed.bullets) ? parsed.bullets.map(String).slice(0, 6) : [] };
    },
    // Deterministic fallback never runs when a key is present (aiCall only
    // uses it on no-key / error / rate-limit) but keeps the type total.
    fallback: (): DigestShape => ({ headline: "Operations digest", bullets: facts.slice(0, 6).map((f) => f.replace(/^- /, "")) }),
  });

  const usedLlm = digest.bullets.length > 0 || !!digest.headline;
  const log = await prisma.aiRunLog.create({
    data: {
      tenantId: ctx.tenantId,
      kind: "automation-copilot-digest",
      inputHash: String(Date.now()),
      entityType: "AutomationCopilotDigest",
      outputJson: JSON.stringify(digest),
      source: `llm:${llmProvider()}`,
    },
  });
  return ok(`generated copilot digest "${digest.headline.slice(0, 80)}" (${digest.bullets.length} bullet(s)); stored as advisory artifact ${log.id}`, 1, { usedLlm: true, llmModel: llmProvider() });
}

type NarrativeShape = { title: string; narrative: string };

/**
 * Narrative drafting — LLM drafts an owner-report narrative summarizing the
 * status of each ACTIVE project for human review (the cleanest no-input use
 * of narrative generation: it needs no new operator input, only existing
 * project + financial state). Stored as an advisory AiRunLog draft; never
 * auto-sent. SKIPS cleanly without a key.
 */
export async function runNarrativeDrafting(ctx: WorkflowRunContext): Promise<WorkflowResult> {
  if (!isLlmEnabled()) {
    return { status: "SKIPPED", summary: "no LLM key configured — narrative drafting skipped", skippedReason: "no_llm_key", producedCount: 0, actionCount: 0 };
  }
  const projects = await prisma.project.findMany({
    where: { tenantId: ctx.tenantId, stage: "ACTIVE" },
    select: { id: true, code: true, name: true },
    take: 10,
  });
  if (projects.length === 0) {
    return ok("no active projects — nothing to draft", 0, { usedLlm: false });
  }

  let drafted = 0;
  for (const p of projects) {
    const snap = await prisma.projectPnlSnapshot.findUnique({ where: { projectId: p.id } });
    const openRfis = await prisma.rFI.count({ where: { projectId: p.id, status: { notIn: ["CLOSED", "APPROVED"] } } });
    const lateTasks = await prisma.scheduleTask.count({ where: { projectId: p.id, endDate: { lt: new Date() }, percentComplete: { lt: 100 } } });
    const facts = [
      `Project ${p.code} — ${p.name}`,
      snap ? `Contract $${toNum(snap.totalContractValue).toLocaleString()}, billed $${toNum(snap.billedToDate).toLocaleString()}, costs $${toNum(snap.costsToDate).toLocaleString()}, % complete ${toNum(snap.percentComplete).toFixed(0)}%, forecast final cost $${toNum(snap.forecastFinalCost).toLocaleString()}` : "No P&L snapshot available",
      `Open RFIs: ${openRfis}`,
      `Late/incomplete schedule tasks: ${lateTasks}`,
    ].join("\n");

    const draft = await aiCall<NarrativeShape>({
      kind: "automation-owner-report",
      tenantId: ctx.tenantId,
      maxTokens: 900,
      system: "You are a senior construction project manager drafting a monthly owner-report status narrative. Use ONLY the supplied facts; do not invent figures, dates, or events. Write a concise, professional 1-2 paragraph status narrative for the owner. Return STRICT JSON: {\"title\": string, \"narrative\": string}.",
      prompt: `Project facts:\n${facts}\n\nDraft the owner-report status narrative.`,
      parse: (raw) => {
        const m = raw.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(m ? m[0] : raw) as Partial<NarrativeShape>;
        return { title: String(parsed.title ?? `${p.code} status`), narrative: String(parsed.narrative ?? "") };
      },
      fallback: (): NarrativeShape => ({ title: `${p.code} status`, narrative: facts }),
    });
    if (!draft.narrative.trim()) continue;
    await prisma.aiRunLog.create({
      data: {
        tenantId: ctx.tenantId,
        kind: "automation-owner-report",
        inputHash: `${p.id}:${Date.now()}`,
        entityType: "AutomationOwnerReport",
        entityId: p.id,
        outputJson: JSON.stringify(draft),
        source: `llm:${llmProvider()}`,
      },
    });
    drafted += 1;
  }
  return ok(`drafted ${drafted} owner-report narrative(s) across ${projects.length} active project(s); stored as advisory drafts for review`, drafted, { usedLlm: drafted > 0, llmModel: drafted > 0 ? llmProvider() : undefined });
}
