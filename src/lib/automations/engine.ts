/**
 * Autonomous-workflow engine.
 *
 * `dispatchDueWorkflows()` is the cron entry point: it selects enabled +
 * due AutomationConfig rows across ALL tenants (DB-indexed by
 * [enabled, nextDueAt]), runs each sequentially with per-tenant try/catch
 * isolation (mirroring runAlertScanAllTenants), records an AutomationRun,
 * and advances the schedule.
 *
 * `runWorkflowForTenant()` is the shared execution path used by both the
 * dispatcher and the admin "Run now" button. Manual runs bypass the due
 * check but still honor the RUNNING lock.
 */

import { prisma } from "@/lib/prisma";
import { isLlmEnabled, llmProvider } from "@/lib/ai";
import { getWorkflow, WORKFLOWS, effectiveIntervalMinutes } from "@/lib/automations/registry";
import type { WorkflowDef, WorkflowResult } from "@/lib/automations/types";

/** A run is considered stale (lock released) after this long in RUNNING. */
const STALE_LOCK_MS = 15 * 60 * 1000;

export type RunOutcome = {
  tenantId: string;
  workflowKey: string;
  status: WorkflowResult["status"] | "LOCKED";
  summary: string;
  runId?: string;
};

/**
 * Ensure a config row exists for (tenant, workflow) and return it. The row
 * defaults to OFF/advisory — calling this never enables anything.
 */
async function ensureConfig(tenantId: string, workflowKey: string) {
  return prisma.automationConfig.upsert({
    where: { tenantId_workflowKey: { tenantId, workflowKey } },
    create: { tenantId, workflowKey },
    update: {},
  });
}

/**
 * Execute one workflow for one tenant. Shared by the dispatcher (scheduled)
 * and the admin Run-now button (manual). Honors the RUNNING lock; on manual
 * runs the due check is the caller's responsibility (skipped).
 *
 * Enforces advisory-by-default: if the workflow cannot act
 * (def.trustGatable === false) OR the tenant has not flipped trustGated,
 * any actionCount the workflow reports is clamped to 0.
 */
export async function runWorkflowForTenant(
  tenantId: string,
  workflowKey: string,
  triggeredBy: string,
): Promise<RunOutcome> {
  const def = getWorkflow(workflowKey);
  if (!def) {
    return { tenantId, workflowKey, status: "ERROR", summary: "unknown workflow key" };
  }

  const config = await ensureConfig(tenantId, workflowKey);

  // RUNNING lock — refuse to start if a non-stale run is already in flight.
  if (config.lastStatus === "RUNNING" && config.lastRunAt) {
    const age = Date.now() - new Date(config.lastRunAt).getTime();
    if (age < STALE_LOCK_MS) {
      return { tenantId, workflowKey, status: "LOCKED", summary: "a run is already in progress" };
    }
  }

  const started = new Date();
  await prisma.automationConfig.update({
    where: { id: config.id },
    data: { lastStatus: "RUNNING", lastRunAt: started },
  });

  let result: WorkflowResult;
  try {
    result = await def.run({ tenantId, trustGated: config.trustGated, triggeredBy });
  } catch (err) {
    result = { status: "ERROR", summary: "workflow threw", error: err instanceof Error ? err.message : String(err), producedCount: 0, actionCount: 0 };
  }

  // Advisory-by-default enforcement: clamp actions unless explicitly trusted
  // AND the workflow is allowed to act. (All workflows ship trustGatable:false.)
  let actionCount = result.actionCount ?? 0;
  if (!def.trustGatable || !config.trustGated) actionCount = 0;

  const finished = new Date();
  const durationMs = finished.getTime() - started.getTime();
  const usedLlm = result.usedLlm ?? false;
  const llmModel = result.llmModel ?? (usedLlm ? llmProvider() : null);

  const run = await prisma.automationRun.create({
    data: {
      tenantId,
      configId: config.id,
      workflowKey,
      status: result.status,
      startedAt: started,
      finishedAt: finished,
      durationMs,
      summary: result.summary.slice(0, 1000),
      producedCount: result.producedCount ?? 0,
      actionCount,
      error: result.error?.slice(0, 1000) ?? null,
      usedLlm,
      llmModel: llmModel ?? null,
      triggeredBy,
    },
  });

  // Advance the schedule off the EFFECTIVE interval, regardless of outcome
  // (a SKIPPED/ERROR run still reschedules so a broken workflow retries on
  // its own cadence rather than every tick).
  const intervalMs = effectiveIntervalMinutes(def, config.intervalMinutesOverride) * 60_000;
  await prisma.automationConfig.update({
    where: { id: config.id },
    data: {
      lastStatus: result.status,
      lastRunAt: started,
      lastSummary: result.summary.slice(0, 1000),
      lastError: result.error?.slice(0, 1000) ?? null,
      nextDueAt: new Date(finished.getTime() + intervalMs),
    },
  });

  return { tenantId, workflowKey, status: result.status, summary: result.summary, runId: run.id };
}

export type DispatchSummary = {
  ok: boolean;
  considered: number;
  ran: number;
  errors: number;
  skipped: number;
  locked: number;
  outcomes: RunOutcome[];
};

/**
 * Cron entry point. Run every enabled + due workflow across all tenants.
 * Due = nextDueAt is null OR <= now. Per-(tenant,workflow) try/catch keeps
 * one failure from aborting the sweep. Stale registry keys (config row whose
 * key no longer exists in code) are skipped.
 */
export async function dispatchDueWorkflows(now: Date = new Date()): Promise<DispatchSummary> {
  const due = await prisma.automationConfig.findMany({
    where: {
      enabled: true,
      OR: [{ nextDueAt: null }, { nextDueAt: { lte: now } }],
    },
    select: { tenantId: true, workflowKey: true },
    orderBy: { nextDueAt: "asc" },
  });

  const outcomes: RunOutcome[] = [];
  let ran = 0;
  let errors = 0;
  let skipped = 0;
  let locked = 0;

  for (const c of due) {
    if (!getWorkflow(c.workflowKey)) continue; // stale registry key — ignore
    try {
      const o = await runWorkflowForTenant(c.tenantId, c.workflowKey, "cron");
      outcomes.push(o);
      if (o.status === "SUCCESS") ran += 1;
      else if (o.status === "ERROR") errors += 1;
      else if (o.status === "SKIPPED") skipped += 1;
      else if (o.status === "LOCKED") locked += 1;
    } catch (err) {
      errors += 1;
      outcomes.push({ tenantId: c.tenantId, workflowKey: c.workflowKey, status: "ERROR", summary: err instanceof Error ? err.message : String(err) });
    }
  }

  return { ok: errors === 0, considered: due.length, ran, errors, skipped, locked, outcomes };
}

/** Registry helpers re-exported for the admin UI / tests. */
export { WORKFLOWS, isLlmEnabled };
export type { WorkflowDef };
