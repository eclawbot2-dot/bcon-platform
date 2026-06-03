/**
 * Shared types for the autonomous-workflow engine.
 *
 * The registry (registry.ts) is the source of truth for which workflows
 * EXIST. Config (AutomationConfig) + history (AutomationRun) are the only
 * persisted state. See registry.ts for the concrete WorkflowDef list.
 */

/** Outcome of a single workflow run. */
export type WorkflowResult = {
  /** Terminal status. RUNNING is only ever written transiently by the engine. */
  status: "SUCCESS" | "ERROR" | "SKIPPED";
  /** Human-readable one-liner shown in the admin UI. */
  summary: string;
  /** How many advisory items the run produced (alerts / review items). */
  producedCount?: number;
  /** How many live mutations the run performed (0 unless trust-gated + canAct). */
  actionCount?: number;
  /** Set when status === "SKIPPED" — e.g. "no_llm_key". */
  skippedReason?: string;
  /** Set when status === "ERROR". */
  error?: string;
  /** Whether this run actually invoked an LLM (for cost auditing). */
  usedLlm?: boolean;
  llmModel?: string;
};

/**
 * Context passed to a workflow's run(). `trustGated` reflects the admin's
 * trust toggle for THIS tenant+workflow; a workflow may only mutate when
 * `def.canAct && ctx.trustGated`. All workflows launch advisory (canAct
 * false), so trustGated is currently informational.
 */
export type WorkflowRunContext = {
  tenantId: string;
  trustGated: boolean;
  triggeredBy: string;
};

export type WorkflowDef = {
  /** Stable key — matches AutomationConfig.workflowKey. Never change once shipped. */
  key: string;
  label: string;
  description: string;
  /** Dispatcher "due" cadence in minutes (admin can override per tenant). */
  defaultIntervalMinutes: number;
  /** True → the workflow needs an LLM key and SKIPS cleanly without one. */
  requiresLlmKey: boolean;
  /** True → a trust toggle is offered; the workflow MAY mutate when trusted. */
  trustGatable: boolean;
  /** Intelligence-audit mapping (provenance, shown in UI). */
  auditItem: string;
  run: (ctx: WorkflowRunContext) => Promise<WorkflowResult>;
};
