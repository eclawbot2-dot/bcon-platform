/**
 * Background job queue — pluggable backend.
 *
 * Background (audit Pass 7 §3.1): no queue exists. Heavy work runs inline
 * on the request thread — historical imports, alert scans, AI runs, AlertEvent
 * delivery — and a single big import can tie up the page render for tens
 * of seconds. There's also no retry, no scheduling, no visibility.
 *
 * This module gives callers a single Queue interface with two backends:
 *
 *   QUEUE_TRANSPORT=in-process   (default — runs jobs immediately, sync,
 *                                 ignoring delay/cron. Good for dev and
 *                                 single-instance deploys.)
 *   QUEUE_TRANSPORT=bullmq       (NOT IMPLEMENTED — needs `npm install
 *                                 bullmq ioredis` plus a Redis URL.)
 *
 * Usage:
 *   const q = getQueue();
 *   q.register("alerts.scan", async (data) => runAlertScan(data.tenantId));
 *   await q.enqueue("alerts.scan", { tenantId });            // ASAP
 *   await q.enqueue("alerts.scan", { tenantId }, { delayMs: 60_000 });  // delayed
 *
 * Design choices:
 *   - Handler registration is idempotent — re-registering replaces the
 *     handler. Lets dev hot-reload work without the queue choking.
 *   - Errors in handlers are caught and console.error'd. The default
 *     in-process backend doesn't retry; cloud backends should retry per
 *     their own config.
 *   - Job names use dotted module.action notation by convention. Keep them
 *     stable — once a queued job exists with name X, renaming X loses
 *     everything in flight.
 */

export type JobOptions = {
  /** Delay execution by N milliseconds. Ignored by the in-process backend. */
  delayMs?: number;
  /** Idempotency key. If a job with the same key is already queued, no-op. */
  jobId?: string;
  /** Maximum retry count for cloud backends. Ignored by in-process. */
  attempts?: number;
};

export type Handler<T = unknown> = (data: T) => Promise<void>;

export interface Queue {
  name: string;
  register<T>(jobName: string, handler: Handler<T>): void;
  enqueue<T>(jobName: string, data: T, opts?: JobOptions): Promise<void>;
  /** Stop accepting new jobs and drain in-flight ones. */
  shutdown?(): Promise<void>;
}

class InProcessQueue implements Queue {
  name = "in-process";
  private handlers = new Map<string, Handler<unknown>>();

  register<T>(jobName: string, handler: Handler<T>): void {
    this.handlers.set(jobName, handler as Handler<unknown>);
  }

  async enqueue<T>(jobName: string, data: T, opts?: JobOptions): Promise<void> {
    const handler = this.handlers.get(jobName);
    if (!handler) {
      console.warn(`[queue:${this.name}] no handler registered for "${jobName}" — discarding job`);
      return;
    }
    // The in-process backend honours delayMs in dev so callers can prove
    // their flows work end-to-end. Production shouldn't run on this backend.
    const fire = async () => {
      try {
        await handler(data);
      } catch (err) {
        console.error(`[queue:${this.name}] handler "${jobName}" threw`, err);
      }
    };
    if (opts?.delayMs && opts.delayMs > 0) {
      setTimeout(() => {
        void fire();
      }, opts.delayMs);
    } else {
      // Don't await — let the caller continue and the job run after the
      // current microtask drains, mimicking real queue behaviour.
      void fire();
    }
  }
}

/**
 * Pure transport resolver — exported for tests. The bullmq/inngest
 * transports are intentionally not implemented yet (no Redis on this
 * deployment), so requesting one is a misconfiguration:
 *
 *   - production → throw an actionable error at boot. Silently running
 *     in-process when the operator asked for a durable distributed queue
 *     means jobs vanish on restart while everyone believes they're queued.
 *   - dev/CI → warn + in-process so local work stays ergonomic.
 */
export function resolveQueueFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): Queue {
  const choice = (env.QUEUE_TRANSPORT ?? "in-process").toLowerCase();
  if (choice === "bullmq" || choice === "inngest") {
    const hint =
      `[queue] QUEUE_TRANSPORT=${choice} is not implemented in this build. ` +
      `Install the adapter (bullmq + ioredis, plus a REDIS_URL) and wire it in src/lib/queue.ts, ` +
      `or set QUEUE_TRANSPORT=in-process.`;
    if (nodeEnv === "production") throw new Error(hint);
    console.warn(`${hint} Falling back to in-process (non-production only).`);
  }
  return new InProcessQueue();
}

let active: Queue = resolveQueueFromEnv();

export function getQueue(): Queue {
  return active;
}

export function setQueue(q: Queue): void {
  active = q;
}
