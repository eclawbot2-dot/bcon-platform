/**
 * Autonomous-workflow registry — the SOURCE OF TRUTH for which workflows
 * exist. Persisted AutomationConfig rows only carry per-tenant on/off +
 * tuning; the registry is merged in code so newly shipped workflows always
 * appear in the admin UI even before any config row exists.
 *
 * Ship-first set (requiresLlmKey:false) are pure deterministic scans that
 * work the moment an admin toggles them on. The two requiresLlmKey:true
 * workflows are registered but SKIP cleanly when no LLM key resolves.
 *
 * Every workflow launches ADVISORY (trustGatable:false / canAct == false):
 * they only ever produce alerts / review items, never auto-mutations.
 */

import type { WorkflowDef } from "@/lib/automations/types";
import {
  runAlertScanWorkflow,
  runMailIngestWorkflow,
  runScheduleSlipPredict,
  runCashflowForecast,
  runMarginFadeWarning,
  runLatePaymentPredict,
  runFeedbackLoopClose,
  runCopilotDigest,
  runNarrativeDrafting,
} from "@/lib/automations/workflows";

export const WORKFLOWS: WorkflowDef[] = [
  // ── Wrapped existing engines (deterministic, no LLM required) ──
  {
    key: "alert-scan",
    label: "Alert scan",
    description: "Permit/insurance/prequal expiry, overdue RFIs, budget & commitment over-runs, stale pay-apps, lien waivers, stalled submittals.",
    defaultIntervalMinutes: 24 * 60,
    requiresLlmKey: false,
    trustGatable: false,
    auditItem: "existing:alert-engine",
    run: runAlertScanWorkflow,
  },
  {
    key: "mail-ingest",
    label: "Mail ingest",
    description: "Poll the tenant's connected Google/M365 mailboxes and triage new mail. Skips unless workspace-transparency is enabled.",
    defaultIntervalMinutes: 60,
    requiresLlmKey: false,
    trustGatable: false,
    auditItem: "existing:mail-ingest",
    run: runMailIngestWorkflow,
  },
  // ── New deterministic predictive scans (NO-LLM) ──
  {
    key: "schedule-slip-predict",
    label: "Schedule-slip prediction",
    description: "Extrapolates each in-flight activity's finish date from progress vs elapsed time; flags tasks trending late (earlier for critical path).",
    defaultIntervalMinutes: 24 * 60,
    requiresLlmKey: false,
    trustGatable: false,
    auditItem: "intel:schedule-slip",
    run: runScheduleSlipPredict,
  },
  {
    key: "cashflow-forecast",
    label: "Cash-flow forecast",
    description: "Per project, compares EAC cost vs billings to flag underbilling and projects whose cash position is trending negative.",
    defaultIntervalMinutes: 24 * 60,
    requiresLlmKey: false,
    trustGatable: false,
    auditItem: "intel:cashflow-forecast",
    run: runCashflowForecast,
  },
  {
    key: "margin-fade-warning",
    label: "Portfolio margin-fade early-warning",
    description: "Compares each project's forecast gross margin (EAC) against its margin target and flags erosion before it lands.",
    defaultIntervalMinutes: 24 * 60,
    requiresLlmKey: false,
    trustGatable: false,
    auditItem: "intel:margin-fade",
    run: runMarginFadeWarning,
  },
  {
    key: "late-payment-predict",
    label: "Late-payment prediction",
    description: "Predicts which sub-invoices are likely to pay late based on net terms vs elapsed time. Prediction-only.",
    defaultIntervalMinutes: 24 * 60,
    requiresLlmKey: false,
    trustGatable: false,
    auditItem: "intel:late-payment",
    run: runLatePaymentPredict,
  },
  {
    key: "feedback-loop-close",
    label: "Close the AI feedback loop",
    description: "Aggregates AiRunLog.userFeedback into per-kind trust scores and flags AI features whose outputs are frequently rejected.",
    defaultIntervalMinutes: 7 * 24 * 60,
    requiresLlmKey: false,
    trustGatable: false,
    auditItem: "intel:feedback-loop",
    run: runFeedbackLoopClose,
  },
  // ── LLM-needing (SKIP cleanly without a key) ──
  {
    key: "narrative-drafting",
    label: "Narrative drafting",
    description: "LLM drafts of RFI replies / change-order narratives / owner-report prose for human review. Never auto-sends.",
    defaultIntervalMinutes: 24 * 60,
    requiresLlmKey: true,
    trustGatable: false,
    auditItem: "intel:narrative-drafting",
    run: runNarrativeDrafting,
  },
  {
    key: "nl-copilot-digest",
    label: "Proactive copilot digest",
    description: "An LLM-authored periodic digest of what changed across the tenant. Advisory only.",
    defaultIntervalMinutes: 24 * 60,
    requiresLlmKey: true,
    trustGatable: false,
    auditItem: "intel:copilot-digest",
    run: runCopilotDigest,
  },
];

const BY_KEY = new Map(WORKFLOWS.map((w) => [w.key, w] as const));

export function getWorkflow(key: string): WorkflowDef | undefined {
  return BY_KEY.get(key);
}

export function isValidWorkflowKey(key: string): boolean {
  return BY_KEY.has(key);
}

/** Effective cadence in minutes given an optional per-tenant override. */
export function effectiveIntervalMinutes(def: WorkflowDef, override: number | null | undefined): number {
  return override != null && override > 0 ? override : def.defaultIntervalMinutes;
}
