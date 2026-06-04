/**
 * Pluggable error-monitoring sink.
 *
 * The platform had no error monitoring: a thrown server component logged
 * to the browser console (error.tsx) and a cron failure or a dropped
 * AuditEvent write went only to stderr on a single Windows box nobody
 * tails. This module is the single funnel for "something went wrong that
 * an operator should know about". It always logs to stderr, and — when
 * activated by env — forwards a compact JSON payload to a webhook
 * (Slack/Discord/Sentry-tunnel/whatever speaks JSON over POST).
 *
 * Activation:
 *   ERROR_WEBHOOK_URL=https://hooks.slack.com/services/...   (optional)
 *   ERROR_REPORT_SOURCE=bcon-prod                            (optional tag)
 *
 * Design:
 *   - Never throws. A monitoring sink that crashes the thing it monitors
 *     is worse than no sink. All failures are swallowed (after a stderr
 *     note).
 *   - Fire-and-forget webhook with a short timeout so it can't wedge a
 *     request/cron. Callers may await it but don't need to.
 *   - No PII beyond what the caller passes in `context`; callers should
 *     keep that to ids + counts, not record bodies.
 */

export type ReportErrorInput = {
  /** Short stable label for where this came from, e.g. "cron/backup". */
  scope: string;
  /** The error or a message. */
  error: unknown;
  /** Optional structured context — ids, counts, never secrets/PII bodies. */
  context?: Record<string, unknown>;
  /** Severity hint. Defaults to "error". */
  level?: "warn" | "error" | "fatal";
};

function toMessage(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) return { message: error.message, stack: error.stack };
  if (typeof error === "string") return { message: error };
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: String(error) };
  }
}

/**
 * Report an operational error. Always logs; optionally forwards to a
 * webhook when ERROR_WEBHOOK_URL is set. Returns a promise that resolves
 * once the (optional) webhook attempt settles; safe to ignore.
 */
export async function reportError(input: ReportErrorInput): Promise<void> {
  const { scope, error, context, level = "error" } = input;
  const { message, stack } = toMessage(error);

  // Always log to stderr for the local log aggregator.
  console.error(`[reportError:${level}] ${scope}: ${message}`, context ?? {});

  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;

  const payload = {
    source: process.env.ERROR_REPORT_SOURCE ?? "bcon",
    level,
    scope,
    message,
    stack: stack?.split("\n").slice(0, 8).join("\n"),
    context: context ?? {},
    at: new Date().toISOString(),
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).catch((err) => {
      console.error(`[reportError] webhook POST failed for ${scope}`, err);
    });
    clearTimeout(timer);
  } catch (err) {
    // Never let the monitor crash the monitored.
    console.error(`[reportError] unexpected failure dispatching ${scope}`, err);
  }
}

/**
 * Synchronous fire-and-forget convenience for hot paths (e.g. an audit
 * write failure) where the caller can't or shouldn't await. Swallows the
 * returned promise.
 */
export function reportErrorNoWait(input: ReportErrorInput): void {
  void reportError(input);
}
