/**
 * Microsoft 365 calendar wiring for bcon's dated obligations.
 *
 * First (and currently only) use: pay-application payment-due dates.
 * A manager clicks "Add due date to M365 calendar" on a pay app — we
 * create an event on the MS_SENDER_UPN mailbox calendar and remember the
 * Graph event id in M365CalendarEventLink keyed by (tenant, kind, recordId),
 * so repeating the action UPDATES the same event (period edits, amount
 * changes) instead of stacking duplicates. If the event was deleted in
 * Outlook, the stale link is replaced by a fresh create.
 *
 * Tenant-scoping: the pay app is loaded through project.tenantId, and the
 * link row carries tenantId — no cross-tenant reads or writes.
 */

import { prisma } from "@/lib/prisma";
import { m365Config, m365CreateEvent, m365UpdateEvent, type M365EventInput } from "@/lib/m365";
import { toNum } from "@/lib/money";

export const PAYAPP_DUE_KIND = "payapp-due";

/**
 * Compute the event content for a pay application's payment-due date
 * (pure — unit tested). The due date is the period end (`periodTo`):
 * that is the dated obligation bcon already models on the G702.
 */
export function buildPayAppDueEvent(app: {
  periodNumber: number;
  periodTo: Date;
  currentPaymentDue: { toNumber: () => number } | number;
  project: { code: string; name: string };
}): M365EventInput {
  const due = toNum(app.currentPaymentDue);
  // 09:00 UTC on the due date, 30 minutes — a visible reminder block
  // rather than a midnight all-day sliver.
  const start = new Date(Date.UTC(
    app.periodTo.getUTCFullYear(),
    app.periodTo.getUTCMonth(),
    app.periodTo.getUTCDate(),
    9, 0, 0,
  ));
  return {
    subject: `Pay app #${app.periodNumber} due — ${app.project.code}`,
    bodyText:
      `Pay application #${app.periodNumber} for ${app.project.name} (${app.project.code}).\n` +
      `Payment due: $${due.toFixed(2)}\n` +
      `Period ends ${app.periodTo.toISOString().slice(0, 10)}.\n` +
      `Created by bcon.`,
    start,
  };
}

export type CalendarSyncResult =
  | { ok: true; action: "created" | "updated"; eventId: string }
  | { ok: false; error: string };

/**
 * Create-or-update the M365 calendar event for one pay application.
 * Idempotent on (tenantId, "payapp-due", payAppId).
 */
export async function syncPayAppDueToCalendar(tenantId: string, payAppId: string): Promise<CalendarSyncResult> {
  const cfg = m365Config();
  if (!cfg) return { ok: false, error: "Microsoft 365 is not configured on this deployment." };

  const app = await prisma.payApplication.findFirst({
    where: { id: payAppId, project: { tenantId } },
    include: { project: { select: { code: true, name: true } } },
  });
  if (!app) return { ok: false, error: "Pay application not found." };

  const ev = buildPayAppDueEvent(app);

  const existing = await prisma.m365CalendarEventLink.findUnique({
    where: { tenantId_kind_recordId: { tenantId, kind: PAYAPP_DUE_KIND, recordId: payAppId } },
  });

  try {
    if (existing) {
      const updated = await m365UpdateEvent(existing.eventId, ev);
      if (updated) {
        await prisma.m365CalendarEventLink.update({
          where: { id: existing.id },
          data: { subject: ev.subject, startsAt: ev.start, calendarUpn: cfg.senderUpn },
        });
        return { ok: true, action: "updated", eventId: existing.eventId };
      }
      // Event was deleted out-of-band in Outlook — fall through to recreate.
    }
    const eventId = await m365CreateEvent(ev);
    await prisma.m365CalendarEventLink.upsert({
      where: { tenantId_kind_recordId: { tenantId, kind: PAYAPP_DUE_KIND, recordId: payAppId } },
      update: { eventId, subject: ev.subject, startsAt: ev.start, calendarUpn: cfg.senderUpn },
      create: {
        tenantId,
        kind: PAYAPP_DUE_KIND,
        recordId: payAppId,
        eventId,
        subject: ev.subject,
        startsAt: ev.start,
        calendarUpn: cfg.senderUpn,
      },
    });
    return { ok: true, action: existing ? "updated" : "created", eventId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Calendar link for one pay app (for the detail page indicator). */
export async function payAppCalendarLink(tenantId: string, payAppId: string) {
  return prisma.m365CalendarEventLink.findUnique({
    where: { tenantId_kind_recordId: { tenantId, kind: PAYAPP_DUE_KIND, recordId: payAppId } },
  });
}
