import { prisma } from "@/lib/prisma";
import { reportErrorNoWait } from "@/lib/report-error";

export type AuditEventInput = {
  tenantId: string;
  actorId?: string | null;
  actorName?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  source?: string;
};

/**
 * Centralized AuditEvent emission. Always returns void; never throws — the
 * caller's mutation has already succeeded by the time we record the event,
 * and a failed audit write must not roll back the user's action. Errors
 * are surfaced via console.error for log aggregation.
 *
 * For state-change mutations, pass `before` and `after` (any JSON-serializable
 * object). Stringification is centralized here so call sites stop carrying
 * `JSON.stringify(...)` boilerplate.
 *
 * `actorName` is captured into `afterJson` because the AuditEvent schema
 * does not have a dedicated name column — only `actorId`, which goes stale
 * if the user is renamed. Storing the snapshot name preserves the audit
 * record's readability after a rename.
 */
export async function recordAudit(input: AuditEventInput): Promise<void> {
  const { tenantId, actorId, actorName, entityType, entityId, action, before, after, source } = input;

  const beforeJson = before === undefined ? null : safeStringify(before);
  const afterJson =
    actorName || after !== undefined
      ? safeStringify({ ...(after && typeof after === "object" ? after : after !== undefined ? { value: after } : {}), ...(actorName ? { _actor: actorName } : {}) })
      : null;

  try {
    await prisma.auditEvent.create({
      data: {
        tenantId,
        actorId: actorId ?? null,
        entityType,
        entityId,
        action,
        beforeJson,
        afterJson,
        source: source ?? null,
      },
    });
  } catch (err) {
    // A dropped audit write is exactly the kind of silent failure the
    // error monitor exists to surface — it means a compliance-relevant
    // event went unrecorded. Fire-and-forget so we don't compound the
    // problem by throwing in a path the caller has already committed.
    reportErrorNoWait({
      scope: "audit.recordAudit",
      error: err,
      context: { entityType, entityId, action },
    });
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, v) => {
      if (typeof v === "bigint") return v.toString();
      if (v instanceof Date) return v.toISOString();
      return v;
    });
  } catch {
    return JSON.stringify({ _serialization_error: true });
  }
}

/**
 * Compute a minimal `before -> after` diff suitable for audit storage.
 * Strips entries that are equal between the two snapshots so the JSON
 * captures only what changed.
 */
export function diffSnapshot<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): { before: Partial<T>; after: Partial<T> } {
  const beforeOut: Partial<T> = {};
  const afterOut: Partial<T> = {};
  for (const key of Object.keys(after) as Array<keyof T>) {
    const a = before[key];
    const b = after[key];
    if (a === b) continue;
    beforeOut[key] = a;
    afterOut[key] = b as T[keyof T];
  }
  return { before: beforeOut, after: afterOut };
}
