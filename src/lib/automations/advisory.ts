/**
 * Shared advisory-alert reconciler for autonomous workflows.
 *
 * Deterministic workflows emit advisory `AlertEvent`s. To avoid a
 * notification storm once they run on a clock (the #1 risk moving from
 * manual to scheduled), they MUST reconcile by `(entityType, entityId,
 * title)` exactly like src/lib/alerts.ts: keep matching unacknowledged rows
 * untouched (refresh body/severity in place, no re-notify), create+notify
 * only genuinely new conditions, and resolve (delete) only rows whose
 * condition cleared.
 *
 * Critically, each workflow scopes its reconcile to ITS OWN entityTypes
 * (passed in `ownedEntityTypes`) so it never deletes another producer's
 * alerts. Every workflow uses an `Automation*` entityType prefix that the
 * core alert-scan explicitly excludes from its own resolve step.
 */

import { prisma } from "@/lib/prisma";
import { notifyForAlert } from "@/lib/notify";

export type AdvisoryAlert = {
  title: string;
  body?: string;
  severity: "INFO" | "WARN" | "ALERT";
  entityType: string;
  entityId: string;
  link?: string;
  projectId?: string;
};

const keyOf = (a: { entityType: string; entityId: string; title: string }) =>
  `${a.entityType} ${a.entityId} ${a.title}`;

/**
 * Reconcile a produced set of advisory alerts against the open (unacked)
 * alerts of the given entityTypes for one tenant. Returns counts.
 */
export async function reconcileAdvisoryAlerts(
  tenantId: string,
  ownedEntityTypes: string[],
  produced: AdvisoryAlert[],
): Promise<{ produced: number; created: number; notified: number; resolved: number }> {
  const owned = new Set(ownedEntityTypes);

  const existing = (
    await prisma.alertEvent.findMany({
      where: { tenantId, acknowledgedAt: null, entityType: { in: ownedEntityTypes } },
      select: { id: true, entityType: true, entityId: true, title: true, body: true, severity: true },
    })
  ).filter((e) => e.entityType != null && e.entityId != null);

  const existingByKey = new Map<string, (typeof existing)[number]>();
  for (const e of existing) {
    existingByKey.set(keyOf({ entityType: e.entityType!, entityId: e.entityId!, title: e.title }), e);
  }

  const producedKeys = new Set<string>();
  let created = 0;
  let notified = 0;
  for (const p of produced) {
    if (!owned.has(p.entityType)) continue; // defensive: never write outside our scope
    const k = keyOf(p);
    producedKeys.add(k);
    const prior = existingByKey.get(k);
    if (prior) {
      if (prior.body !== (p.body ?? null) || prior.severity !== p.severity) {
        await prisma.alertEvent.update({ where: { id: prior.id }, data: { body: p.body ?? null, severity: p.severity } });
      }
      continue;
    }
    const event = await prisma.alertEvent.create({ data: { tenantId, ...p } });
    created += 1;
    notified += await notifyForAlert(event);
  }

  const staleIds = existing
    .filter((e) => !producedKeys.has(keyOf({ entityType: e.entityType!, entityId: e.entityId!, title: e.title })))
    .map((e) => e.id);
  if (staleIds.length > 0) {
    await prisma.alertEvent.deleteMany({ where: { id: { in: staleIds }, tenantId, acknowledgedAt: null } });
  }

  return { produced: produced.length, created, notified, resolved: staleIds.length };
}
