/**
 * Per-module approval actions for every record with a status lifecycle.
 *
 * Exported action names follow the pattern: `<verb><Module>` — e.g.
 * `approveChangeOrder`, `rejectPayApp`, `submitRfi`, `editSubmittal`.
 * All gate approve / reject on `actor.isManager`, log every action to
 * the polymorphic RecordComment table, and return `{ ok, error? }`.
 */

import { prisma } from "@/lib/prisma";
import { actorFor, logComment, changeSummary, type ActionResult } from "@/lib/approvals";
import { startWorkflowRun, recordWorkflowDecision, closeWorkflowRun } from "@/lib/workflow";
import { validateMoneyPatch } from "@/lib/money";

/**
 * Build a before/after snapshot limited to the given keys, coercing
 * Prisma Decimal columns to numbers so the audit JSON is portable. Used to
 * attach tamper-evident money/status diffs to logComment's AuditEvent.
 */
function snapshot(row: Record<string, unknown> | null | undefined, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!row) return out;
  for (const k of keys) {
    const v = row[k];
    out[k] = v != null && typeof v === "object" && typeof (v as { toNumber?: () => number }).toNumber === "function"
      ? (v as { toNumber: () => number }).toNumber()
      : v;
  }
  return out;
}

// ---------- CHANGE ORDERS ----------
export async function submitChangeOrder(id: string, tenantId: string, note?: string): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  const co = await prisma.changeOrder.findFirst({ where: { id, project: { tenantId } } });
  if (!co) return { ok: false, error: "Change order not found." };
  if (co.status !== "DRAFT" && co.status !== "REJECTED") return { ok: false, error: `Cannot submit while status is ${co.status}.` };
  const entity = await prisma.changeOrder.update({
    where: { id },
    data: { status: "PENDING", requestedAt: new Date(), submittedBy: actor.userName, rejectionReason: null },
  });
  await logComment({ tenantId, entityType: "ChangeOrder", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "SUBMIT", body: note ? `Submitted for approval. ${note}` : "Submitted for approval." });
  await startWorkflowRun({ tenantId, projectId: co.projectId, module: "change-orders", entityType: "ChangeOrder", entityId: id });
  return { ok: true, entity };
}
export async function approveChangeOrder(id: string, tenantId: string, note?: string): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  if (!actor.isManager) return { ok: false, error: "Only managers can approve change orders." };
  const co = await prisma.changeOrder.findFirst({ where: { id, project: { tenantId } } });
  if (!co) return { ok: false, error: "Change order not found." };
  if (co.status !== "PENDING") return { ok: false, error: `Cannot approve while status is ${co.status}. Must be PENDING.` };
  const entity = await prisma.changeOrder.update({
    where: { id },
    data: { status: "APPROVED", approvedAt: new Date(), approvedBy: actor.userName, approvalNote: note ?? null, rejectedAt: null, rejectedBy: null, rejectionReason: null },
  });
  const coFields = ["status", "amount"] as const;
  await logComment({ tenantId, entityType: "ChangeOrder", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "APPROVE", body: note ? `Approved — ${note}` : "Approved.", audit: { before: snapshot(co as unknown as Record<string, unknown>, coFields), after: snapshot(entity as unknown as Record<string, unknown>, coFields) } });
  await recordWorkflowDecision({ projectId: co.projectId, entityType: "ChangeOrder", entityId: id, actor, decision: "APPROVED" });
  return { ok: true, entity };
}
export async function rejectChangeOrder(id: string, tenantId: string, reason: string): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  if (!actor.isManager) return { ok: false, error: "Only managers can reject change orders." };
  if (!reason || reason.trim().length < 3) return { ok: false, error: "Rejection reason required." };
  const co = await prisma.changeOrder.findFirst({ where: { id, project: { tenantId } } });
  if (!co) return { ok: false, error: "Change order not found." };
  if (co.status !== "PENDING") return { ok: false, error: `Cannot reject while status is ${co.status}. Must be PENDING.` };
  const entity = await prisma.changeOrder.update({
    where: { id },
    data: { status: "REJECTED", rejectedAt: new Date(), rejectedBy: actor.userName, rejectionReason: reason.trim() },
  });
  await logComment({ tenantId, entityType: "ChangeOrder", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "REJECT", body: `Rejected: ${reason.trim()}` });
  await recordWorkflowDecision({ projectId: co.projectId, entityType: "ChangeOrder", entityId: id, actor, decision: "REJECTED" });
  return { ok: true, entity };
}
export async function editChangeOrder(id: string, tenantId: string, patch: { title?: string; description?: string; reason?: string; amount?: number; markupPct?: number; scheduleImpactDays?: number }): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  const co = await prisma.changeOrder.findFirst({ where: { id, project: { tenantId } } });
  if (!co) return { ok: false, error: "Change order not found." };
  const lockedStates = ["APPROVED", "EXECUTED", "VOID"];
  const canEdit = lockedStates.includes(co.status) ? actor.isManager : actor.canEdit;
  if (!canEdit) return { ok: false, error: `Cannot edit while status is ${co.status} without manager role.` };
  const valid = validateMoneyPatch(patch, { money: ["amount"], percent: ["markupPct"] });
  if (!valid.ok) return { ok: false, error: valid.error };
  const data: Record<string, unknown> = { ...patch };
  if (lockedStates.includes(co.status)) {
    data.status = "PENDING";
    data.approvedAt = null;
    data.approvedBy = null;
    data.approvalNote = null;
  }
  const fields = ["amount", "markupPct", "status"] as const;
  const summary = changeSummary(co as unknown as Record<string, unknown>, patch);
  const entity = await prisma.changeOrder.update({ where: { id }, data });
  await logComment({ tenantId, entityType: "ChangeOrder", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "EDIT", body: `Edited: ${summary || "(no visible changes)"}${lockedStates.includes(co.status) ? " — status reverted to PENDING for re-approval." : ""}`, audit: { before: snapshot(co as unknown as Record<string, unknown>, fields), after: snapshot(entity as unknown as Record<string, unknown>, fields) } });
  return { ok: true, entity };
}

// ---------- PAY APPLICATIONS ----------
export async function submitPayApp(id: string, tenantId: string, note?: string): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  const pa = await prisma.payApplication.findFirst({ where: { id, project: { tenantId } } });
  if (!pa) return { ok: false, error: "Pay application not found." };
  if (pa.status !== "DRAFT" && pa.status !== "REJECTED") return { ok: false, error: `Cannot submit while status is ${pa.status}.` };
  const entity = await prisma.payApplication.update({
    where: { id },
    data: { status: "SUBMITTED", submittedAt: new Date(), submittedBy: actor.userName, rejectionReason: null },
  });
  await logComment({ tenantId, entityType: "PayApplication", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "SUBMIT", body: note ? `Submitted. ${note}` : "Submitted." });
  await startWorkflowRun({ tenantId, projectId: pa.projectId, module: "pay-apps", entityType: "PayApplication", entityId: id });
  return { ok: true, entity };
}
export async function approvePayApp(id: string, tenantId: string, note?: string): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  if (!actor.isManager) return { ok: false, error: "Only managers can approve pay applications." };
  const pa = await prisma.payApplication.findFirst({ where: { id, project: { tenantId } } });
  if (!pa) return { ok: false, error: "Pay application not found." };
  if (pa.status !== "SUBMITTED" && pa.status !== "PENDING_APPROVAL") return { ok: false, error: `Must be SUBMITTED or PENDING_APPROVAL. Current: ${pa.status}.` };
  const entity = await prisma.payApplication.update({
    where: { id },
    data: { status: "APPROVED", approvedAt: new Date(), approvedBy: actor.userName, approvalNote: note ?? null },
  });
  const paFields = ["status", "currentPaymentDue"] as const;
  await logComment({ tenantId, entityType: "PayApplication", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "APPROVE", body: note ? `Approved — ${note}` : "Approved.", audit: { before: snapshot(pa as unknown as Record<string, unknown>, paFields), after: snapshot(entity as unknown as Record<string, unknown>, paFields) } });
  await recordWorkflowDecision({ projectId: pa.projectId, entityType: "PayApplication", entityId: id, actor, decision: "APPROVED" });
  return { ok: true, entity };
}
export async function rejectPayApp(id: string, tenantId: string, reason: string): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  if (!actor.isManager) return { ok: false, error: "Only managers can reject pay applications." };
  if (!reason || reason.trim().length < 3) return { ok: false, error: "Rejection reason required." };
  const pa = await prisma.payApplication.findFirst({ where: { id, project: { tenantId } } });
  if (!pa) return { ok: false, error: "Pay application not found." };
  if (pa.status !== "SUBMITTED" && pa.status !== "PENDING_APPROVAL") return { ok: false, error: `Must be SUBMITTED or PENDING_APPROVAL.` };
  const entity = await prisma.payApplication.update({
    where: { id },
    data: { status: "REJECTED", rejectedAt: new Date(), rejectedBy: actor.userName, rejectionReason: reason.trim() },
  });
  await logComment({ tenantId, entityType: "PayApplication", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "REJECT", body: `Rejected: ${reason.trim()}` });
  await recordWorkflowDecision({ projectId: pa.projectId, entityType: "PayApplication", entityId: id, actor, decision: "REJECTED" });
  return { ok: true, entity };
}
export async function markPayAppPaid(id: string, tenantId: string, note?: string): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  if (!actor.isManager) return { ok: false, error: "Only managers can mark paid." };
  const pa = await prisma.payApplication.findFirst({ where: { id, project: { tenantId } } });
  if (!pa) return { ok: false, error: "Pay application not found." };
  if (pa.status !== "APPROVED") return { ok: false, error: `Must be APPROVED before PAID.` };
  const entity = await prisma.payApplication.update({ where: { id }, data: { status: "PAID", paidAt: new Date(), paidBy: actor.userName } });
  const paidFields = ["status", "currentPaymentDue"] as const;
  await logComment({ tenantId, entityType: "PayApplication", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "PAY", body: note ? `Marked paid. ${note}` : "Marked paid.", audit: { before: snapshot(pa as unknown as Record<string, unknown>, paidFields), after: snapshot(entity as unknown as Record<string, unknown>, paidFields) } });
  await closeWorkflowRun({ projectId: pa.projectId, entityType: "PayApplication", entityId: id, status: "CLOSED" });
  return { ok: true, entity };
}
export async function editPayApp(id: string, tenantId: string, patch: { workCompletedToDate?: number; materialsStoredToDate?: number; retainageHeld?: number; currentPaymentDue?: number; notes?: string }): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  const pa = await prisma.payApplication.findFirst({ where: { id, project: { tenantId } } });
  if (!pa) return { ok: false, error: "Pay application not found." };
  const locked = pa.status === "APPROVED" || pa.status === "PAID";
  if (locked && !actor.isManager) return { ok: false, error: `Cannot edit an ${pa.status} pay app without manager role.` };
  if (!actor.canEdit) return { ok: false, error: "Insufficient role to edit." };
  const valid = validateMoneyPatch(patch, { money: ["workCompletedToDate", "materialsStoredToDate", "retainageHeld", "currentPaymentDue"] });
  if (!valid.ok) return { ok: false, error: valid.error };
  const data: Record<string, unknown> = { ...patch };
  if (locked) { data.status = "SUBMITTED"; data.approvedAt = null; data.approvedBy = null; }
  const fields = ["workCompletedToDate", "materialsStoredToDate", "retainageHeld", "currentPaymentDue", "status"] as const;
  const summary = changeSummary(pa as unknown as Record<string, unknown>, patch);
  const entity = await prisma.payApplication.update({ where: { id }, data });
  await logComment({ tenantId, entityType: "PayApplication", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "EDIT", body: `Edited: ${summary || "(no visible changes)"}${locked ? " — reverted to SUBMITTED for re-approval." : ""}`, audit: { before: snapshot(pa as unknown as Record<string, unknown>, fields), after: snapshot(entity as unknown as Record<string, unknown>, fields) } });
  return { ok: true, entity };
}

// ---------- RFIs ----------
export async function submitRfi(id: string, tenantId: string, question?: string): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  const r = await prisma.rFI.findFirst({ where: { id, project: { tenantId } } });
  if (!r) return { ok: false, error: "RFI not found." };
  if (r.status !== "DRAFT" && r.status !== "REJECTED") return { ok: false, error: `Cannot submit while status is ${r.status}.` };
  const entity = await prisma.rFI.update({
    where: { id },
    data: { status: "UNDER_REVIEW", submittedAt: new Date(), submittedBy: actor.userName, rejectionReason: null, question: question ?? r.question },
  });
  await logComment({ tenantId, entityType: "RFI", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "SUBMIT", body: question ? `Submitted. Q: ${question}` : "Submitted for response." });
  await startWorkflowRun({ tenantId, projectId: r.projectId, module: "rfis", entityType: "RFI", entityId: id });
  return { ok: true, entity };
}
export async function respondRfi(id: string, tenantId: string, response: string): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  if (!actor.canEdit) return { ok: false, error: "Insufficient role to respond." };
  if (!response || response.trim().length < 3) return { ok: false, error: "Response text required." };
  const r = await prisma.rFI.findFirst({ where: { id, project: { tenantId } } });
  if (!r) return { ok: false, error: "RFI not found." };
  if (r.status !== "UNDER_REVIEW") return { ok: false, error: `Must be UNDER_REVIEW to respond.` };
  const entity = await prisma.rFI.update({
    where: { id },
    data: { response: response.trim(), respondedAt: new Date(), respondedBy: actor.userName },
  });
  await logComment({ tenantId, entityType: "RFI", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "RESPOND", body: `Response: ${response.trim()}` });
  return { ok: true, entity };
}
export async function approveRfi(id: string, tenantId: string, note?: string): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  if (!actor.isManager) return { ok: false, error: "Only managers can close RFIs." };
  const r = await prisma.rFI.findFirst({ where: { id, project: { tenantId } } });
  if (!r) return { ok: false, error: "RFI not found." };
  if (!r.response) return { ok: false, error: "RFI must have a response before approval." };
  const entity = await prisma.rFI.update({
    where: { id },
    data: { status: "APPROVED", approvedAt: new Date(), approvedBy: actor.userName, approvalNote: note ?? null },
  });
  await logComment({ tenantId, entityType: "RFI", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "APPROVE", body: note ? `Approved — ${note}` : "Approved and closed." });
  await recordWorkflowDecision({ projectId: r.projectId, entityType: "RFI", entityId: id, actor, decision: "APPROVED" });
  return { ok: true, entity };
}
export async function rejectRfi(id: string, tenantId: string, reason: string): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  if (!actor.isManager) return { ok: false, error: "Only managers can reject." };
  if (!reason || reason.trim().length < 3) return { ok: false, error: "Reason required." };
  const entity = await prisma.rFI.update({
    where: { id, project: { tenantId } } as never,
    data: { status: "REJECTED", rejectedAt: new Date(), rejectedBy: actor.userName, rejectionReason: reason.trim() },
  });
  await logComment({ tenantId, entityType: "RFI", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "REJECT", body: `Rejected: ${reason.trim()}` });
  await recordWorkflowDecision({ projectId: entity.projectId, entityType: "RFI", entityId: id, actor, decision: "REJECTED" });
  return { ok: true, entity };
}
export async function editRfi(id: string, tenantId: string, patch: { subject?: string; question?: string; ballInCourt?: string; dueDate?: Date | null }): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  if (!actor.canEdit) return { ok: false, error: "Insufficient role to edit." };
  const r = await prisma.rFI.findFirst({ where: { id, project: { tenantId } } });
  if (!r) return { ok: false, error: "RFI not found." };
  if ((r.status === "APPROVED" || r.status === "CLOSED") && !actor.isManager) return { ok: false, error: `Cannot edit ${r.status} RFI without manager role.` };
  const data: Record<string, unknown> = { ...patch };
  const summary = changeSummary(r as unknown as Record<string, unknown>, patch);
  const entity = await prisma.rFI.update({ where: { id }, data });
  await logComment({ tenantId, entityType: "RFI", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "EDIT", body: `Edited: ${summary || "(no changes)"}` });
  return { ok: true, entity };
}

// ---------- SUBMITTALS ----------
export async function submitSubmittal(id: string, tenantId: string, note?: string): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  const s = await prisma.submittal.findFirst({ where: { id, project: { tenantId } } });
  if (!s) return { ok: false, error: "Submittal not found." };
  if (s.status !== "DRAFT" && s.status !== "REJECTED") return { ok: false, error: `Cannot submit while status is ${s.status}.` };
  const entity = await prisma.submittal.update({
    where: { id },
    data: { status: "UNDER_REVIEW", submittedAt: new Date(), submittedBy: actor.userName, rejectionReason: null },
  });
  await logComment({ tenantId, entityType: "Submittal", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "SUBMIT", body: note ? `Submitted. ${note}` : "Submitted for review." });
  await startWorkflowRun({ tenantId, projectId: s.projectId, module: "submittals", entityType: "Submittal", entityId: id });
  return { ok: true, entity };
}
export async function approveSubmittal(id: string, tenantId: string, note?: string): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  if (!actor.isManager) return { ok: false, error: "Only managers can approve submittals." };
  const s = await prisma.submittal.findFirst({ where: { id, project: { tenantId } } });
  if (!s) return { ok: false, error: "Submittal not found." };
  if (s.status !== "UNDER_REVIEW") return { ok: false, error: `Must be UNDER_REVIEW.` };
  const entity = await prisma.submittal.update({
    where: { id },
    data: { status: "APPROVED", approvedAt: new Date(), approvedBy: actor.userName, approvalNote: note ?? null },
  });
  await logComment({ tenantId, entityType: "Submittal", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "APPROVE", body: note ? `Approved — ${note}` : "Approved." });
  await recordWorkflowDecision({ projectId: s.projectId, entityType: "Submittal", entityId: id, actor, decision: "APPROVED" });
  return { ok: true, entity };
}
export async function rejectSubmittal(id: string, tenantId: string, reason: string): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  if (!actor.isManager) return { ok: false, error: "Only managers can reject." };
  if (!reason || reason.trim().length < 3) return { ok: false, error: "Rejection reason required." };
  const s = await prisma.submittal.findFirst({ where: { id, project: { tenantId } } });
  if (!s) return { ok: false, error: "Submittal not found." };
  if (s.status !== "UNDER_REVIEW") return { ok: false, error: `Must be UNDER_REVIEW.` };
  const entity = await prisma.submittal.update({
    where: { id },
    data: { status: "REJECTED", rejectedAt: new Date(), rejectedBy: actor.userName, rejectionReason: reason.trim() },
  });
  await logComment({ tenantId, entityType: "Submittal", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "REJECT", body: `Rejected: ${reason.trim()}` });
  await recordWorkflowDecision({ projectId: s.projectId, entityType: "Submittal", entityId: id, actor, decision: "REJECTED" });
  return { ok: true, entity };
}
export async function editSubmittal(id: string, tenantId: string, patch: { title?: string; specSection?: string; longLead?: boolean; notes?: string }): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  if (!actor.canEdit) return { ok: false, error: "Insufficient role." };
  const s = await prisma.submittal.findFirst({ where: { id, project: { tenantId } } });
  if (!s) return { ok: false, error: "Submittal not found." };
  if (s.status === "APPROVED" && !actor.isManager) return { ok: false, error: "Cannot edit APPROVED submittal without manager role." };
  const summary = changeSummary(s as unknown as Record<string, unknown>, patch);
  const entity = await prisma.submittal.update({ where: { id }, data: patch });
  await logComment({ tenantId, entityType: "Submittal", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "EDIT", body: `Edited: ${summary || "(no changes)"}` });
  return { ok: true, entity };
}

// ---------- SAFETY INCIDENTS ----------
export async function submitSafetyIncident(id: string, tenantId: string, note?: string): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  const entity = await prisma.safetyIncident.update({
    where: { id, project: { tenantId } } as never,
    data: { status: "UNDER_REVIEW", submittedAt: new Date(), submittedBy: actor.userName },
  });
  await logComment({ tenantId, entityType: "SafetyIncident", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "SUBMIT", body: note ?? "Submitted for review." });
  await startWorkflowRun({ tenantId, projectId: entity.projectId, module: "safety-incidents", entityType: "SafetyIncident", entityId: id });
  return { ok: true, entity };
}
export async function approveSafetyIncident(id: string, tenantId: string, note?: string): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  if (!actor.isManager) return { ok: false, error: "Only managers (typically Safety Manager) can close incidents." };
  const entity = await prisma.safetyIncident.update({
    where: { id, project: { tenantId } } as never,
    data: { status: "APPROVED", approvedAt: new Date(), approvedBy: actor.userName, approvalNote: note ?? null },
  });
  await logComment({ tenantId, entityType: "SafetyIncident", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "APPROVE", body: note ? `Closed. ${note}` : "Reviewed and closed." });
  await recordWorkflowDecision({ projectId: entity.projectId, entityType: "SafetyIncident", entityId: id, actor, decision: "APPROVED" });
  return { ok: true, entity };
}
export async function editSafetyIncident(id: string, tenantId: string, patch: { title?: string; severity?: string; description?: string; correctiveActions?: string }): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  if (!actor.canEdit) return { ok: false, error: "Insufficient role." };
  const before = await prisma.safetyIncident.findFirst({ where: { id, project: { tenantId } } });
  if (!before) return { ok: false, error: "Incident not found." };
  const summary = changeSummary(before as unknown as Record<string, unknown>, patch);
  const entity = await prisma.safetyIncident.update({ where: { id }, data: patch });
  await logComment({ tenantId, entityType: "SafetyIncident", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "EDIT", body: `Edited: ${summary || "(no changes)"}` });
  return { ok: true, entity };
}

// ---------- PUNCH ITEMS ----------
export async function submitPunch(id: string, tenantId: string, note?: string): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  const entity = await prisma.punchItem.update({
    where: { id, project: { tenantId } } as never,
    data: { status: "UNDER_REVIEW", submittedAt: new Date(), submittedBy: actor.userName },
  });
  await logComment({ tenantId, entityType: "PunchItem", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "SUBMIT", body: note ? `Ready for verification. ${note}` : "Marked ready for verification." });
  await startWorkflowRun({ tenantId, projectId: entity.projectId, module: "punch-items", entityType: "PunchItem", entityId: id });
  return { ok: true, entity };
}
export async function closePunch(id: string, tenantId: string, note?: string): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  if (!actor.isManager) return { ok: false, error: "Only managers can close punch items." };
  const entity = await prisma.punchItem.update({
    where: { id, project: { tenantId } } as never,
    data: { status: "CLOSED", closedAt: new Date(), closedBy: actor.userName, approvedAt: new Date(), approvedBy: actor.userName, approvalNote: note ?? null },
  });
  await logComment({ tenantId, entityType: "PunchItem", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "CLOSE", body: note ? `Closed. ${note}` : "Verified and closed." });
  await recordWorkflowDecision({ projectId: entity.projectId, entityType: "PunchItem", entityId: id, actor, decision: "APPROVED" });
  return { ok: true, entity };
}
export async function rejectPunch(id: string, tenantId: string, reason: string): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  if (!actor.isManager) return { ok: false, error: "Only managers can reject." };
  if (!reason || reason.trim().length < 3) return { ok: false, error: "Reason required." };
  const entity = await prisma.punchItem.update({
    where: { id, project: { tenantId } } as never,
    data: { status: "REJECTED", rejectedAt: new Date(), rejectedBy: actor.userName, rejectionReason: reason.trim() },
  });
  await logComment({ tenantId, entityType: "PunchItem", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "REJECT", body: `Rejected: ${reason.trim()}` });
  await recordWorkflowDecision({ projectId: entity.projectId, entityType: "PunchItem", entityId: id, actor, decision: "REJECTED" });
  return { ok: true, entity };
}
export async function editPunch(id: string, tenantId: string, patch: { title?: string; area?: string; description?: string; trade?: string; assignedTo?: string; dueDate?: Date | null }): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  if (!actor.canEdit) return { ok: false, error: "Insufficient role." };
  const before = await prisma.punchItem.findFirst({ where: { id, project: { tenantId } } });
  if (!before) return { ok: false, error: "Punch item not found." };
  const summary = changeSummary(before as unknown as Record<string, unknown>, patch);
  const entity = await prisma.punchItem.update({ where: { id }, data: patch });
  await logComment({ tenantId, entityType: "PunchItem", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "EDIT", body: `Edited: ${summary || "(no changes)"}` });
  return { ok: true, entity };
}

// ---------- SUB-INVOICES ----------
export async function approveSubInvoice(id: string, tenantId: string, note?: string): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  if (!actor.isManager) return { ok: false, error: "Only managers (Controller / PM) can approve." };
  const before = await prisma.subInvoice.findFirst({ where: { id, project: { tenantId } } });
  if (!before) return { ok: false, error: "Sub invoice not found." };
  const entity = await prisma.subInvoice.update({
    where: { id, project: { tenantId } } as never,
    data: { status: "APPROVED", approvedAt: new Date(), approvedBy: actor.userName, approvalNote: note ?? null },
  });
  const siFields = ["status", "amount", "netDue"] as const;
  await logComment({ tenantId, entityType: "SubInvoice", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "APPROVE", body: note ? `Approved — ${note}` : "Approved.", audit: { before: snapshot(before as unknown as Record<string, unknown>, siFields), after: snapshot(entity as unknown as Record<string, unknown>, siFields) } });
  await startWorkflowRun({ tenantId, projectId: entity.projectId, module: "sub-invoices", entityType: "SubInvoice", entityId: id });
  await recordWorkflowDecision({ projectId: entity.projectId, entityType: "SubInvoice", entityId: id, actor, decision: "APPROVED" });
  return { ok: true, entity };
}
export async function rejectSubInvoice(id: string, tenantId: string, reason: string): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  if (!actor.isManager) return { ok: false, error: "Only managers can reject." };
  if (!reason || reason.trim().length < 3) return { ok: false, error: "Reason required." };
  const entity = await prisma.subInvoice.update({
    where: { id, project: { tenantId } } as never,
    data: { status: "REJECTED", rejectedAt: new Date(), rejectedBy: actor.userName, rejectionReason: reason.trim() },
  });
  await logComment({ tenantId, entityType: "SubInvoice", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "REJECT", body: `Rejected: ${reason.trim()}` });
  await recordWorkflowDecision({ projectId: entity.projectId, entityType: "SubInvoice", entityId: id, actor, decision: "REJECTED" });
  return { ok: true, entity };
}
export async function markSubInvoicePaid(id: string, tenantId: string, note?: string): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  if (!actor.isManager) return { ok: false, error: "Only managers can mark paid." };
  const before = await prisma.subInvoice.findFirst({ where: { id, project: { tenantId } } });
  if (!before) return { ok: false, error: "Sub invoice not found." };
  const entity = await prisma.subInvoice.update({
    where: { id, project: { tenantId } } as never,
    data: { status: "PAID", paidAt: new Date(), paidBy: actor.userName },
  });
  const siFields = ["status", "amount", "netDue"] as const;
  await logComment({ tenantId, entityType: "SubInvoice", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "PAY", body: note ? `Paid. ${note}` : "Marked paid.", audit: { before: snapshot(before as unknown as Record<string, unknown>, siFields), after: snapshot(entity as unknown as Record<string, unknown>, siFields) } });
  await closeWorkflowRun({ projectId: entity.projectId, entityType: "SubInvoice", entityId: id, status: "CLOSED" });
  return { ok: true, entity };
}
export async function editSubInvoice(id: string, tenantId: string, patch: { amount?: number; retainageHeld?: number; netDue?: number; notes?: string }): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  if (!actor.canEdit) return { ok: false, error: "Insufficient role." };
  const before = await prisma.subInvoice.findFirst({ where: { id, project: { tenantId } } });
  if (!before) return { ok: false, error: "Sub invoice not found." };
  const valid = validateMoneyPatch(patch, { money: ["amount", "retainageHeld", "netDue"] });
  if (!valid.ok) return { ok: false, error: valid.error };
  const fields = ["amount", "retainageHeld", "netDue", "status"] as const;
  const summary = changeSummary(before as unknown as Record<string, unknown>, patch);
  const entity = await prisma.subInvoice.update({ where: { id }, data: patch });
  await logComment({ tenantId, entityType: "SubInvoice", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "EDIT", body: `Edited: ${summary || "(no changes)"}`, audit: { before: snapshot(before as unknown as Record<string, unknown>, fields), after: snapshot(entity as unknown as Record<string, unknown>, fields) } });
  return { ok: true, entity };
}

// ---------- PURCHASE ORDERS ----------
export async function approvePurchaseOrder(id: string, tenantId: string, note?: string): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  if (!actor.isManager) return { ok: false, error: "Only managers can approve." };
  const before = await prisma.purchaseOrder.findFirst({ where: { id, project: { tenantId } } });
  if (!before) return { ok: false, error: "PO not found." };
  const entity = await prisma.purchaseOrder.update({
    where: { id, project: { tenantId } } as never,
    data: { status: "APPROVED", approvedAt: new Date(), approvedBy: actor.userName, approvalNote: note ?? null },
  });
  const poFields = ["status", "amount"] as const;
  await logComment({ tenantId, entityType: "PurchaseOrder", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "APPROVE", body: note ? `Approved — ${note}` : "Approved.", audit: { before: snapshot(before as unknown as Record<string, unknown>, poFields), after: snapshot(entity as unknown as Record<string, unknown>, poFields) } });
  await startWorkflowRun({ tenantId, projectId: entity.projectId, module: "purchase-orders", entityType: "PurchaseOrder", entityId: id });
  await recordWorkflowDecision({ projectId: entity.projectId, entityType: "PurchaseOrder", entityId: id, actor, decision: "APPROVED" });
  return { ok: true, entity };
}
export async function closePurchaseOrder(id: string, tenantId: string, note?: string): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  if (!actor.isManager) return { ok: false, error: "Only managers can close." };
  const entity = await prisma.purchaseOrder.update({
    where: { id, project: { tenantId } } as never,
    data: { status: "CLOSED", closedAt: new Date(), closedBy: actor.userName },
  });
  await logComment({ tenantId, entityType: "PurchaseOrder", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "CLOSE", body: note ? `Closed. ${note}` : "Closed out." });
  await closeWorkflowRun({ projectId: entity.projectId, entityType: "PurchaseOrder", entityId: id, status: "CLOSED" });
  return { ok: true, entity };
}
export async function editPurchaseOrder(id: string, tenantId: string, patch: { description?: string; amount?: number; expectedDelivery?: Date | null; notes?: string }): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  if (!actor.canEdit) return { ok: false, error: "Insufficient role." };
  const before = await prisma.purchaseOrder.findFirst({ where: { id, project: { tenantId } } });
  if (!before) return { ok: false, error: "PO not found." };
  const valid = validateMoneyPatch(patch, { money: ["amount"] });
  if (!valid.ok) return { ok: false, error: valid.error };
  const fields = ["amount", "status"] as const;
  const summary = changeSummary(before as unknown as Record<string, unknown>, patch);
  const entity = await prisma.purchaseOrder.update({ where: { id }, data: patch });
  await logComment({ tenantId, entityType: "PurchaseOrder", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "EDIT", body: `Edited: ${summary || "(no changes)"}`, audit: { before: snapshot(before as unknown as Record<string, unknown>, fields), after: snapshot(entity as unknown as Record<string, unknown>, fields) } });
  return { ok: true, entity };
}

// ---------- CONTRACTS ----------
export async function executeContract(id: string, tenantId: string, note?: string): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  if (!actor.isManager) return { ok: false, error: "Only managers can execute contracts." };
  const before = await prisma.contract.findFirst({ where: { id, project: { tenantId } } });
  if (!before) return { ok: false, error: "Contract not found." };
  const entity = await prisma.contract.update({
    where: { id, project: { tenantId } } as never,
    data: { status: "EXECUTED", executedAt: new Date(), executedBy: actor.userName, approvedAt: new Date(), approvedBy: actor.userName, approvalNote: note ?? null },
  });
  const ctFields = ["status", "currentValue"] as const;
  await logComment({ tenantId, entityType: "Contract", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "APPROVE", body: note ? `Executed. ${note}` : "Executed.", audit: { before: snapshot(before as unknown as Record<string, unknown>, ctFields), after: snapshot(entity as unknown as Record<string, unknown>, ctFields) } });
  await startWorkflowRun({ tenantId, projectId: entity.projectId, module: "contracts", entityType: "Contract", entityId: id });
  await recordWorkflowDecision({ projectId: entity.projectId, entityType: "Contract", entityId: id, actor, decision: "APPROVED" });
  return { ok: true, entity };
}
export async function rejectContract(id: string, tenantId: string, reason: string): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  if (!actor.isManager) return { ok: false, error: "Only managers can reject." };
  if (!reason || reason.trim().length < 3) return { ok: false, error: "Reason required." };
  const entity = await prisma.contract.update({
    where: { id, project: { tenantId } } as never,
    data: { status: "TERMINATED", rejectedAt: new Date(), rejectedBy: actor.userName, rejectionReason: reason.trim() },
  });
  await logComment({ tenantId, entityType: "Contract", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "REJECT", body: `Terminated: ${reason.trim()}` });
  await recordWorkflowDecision({ projectId: entity.projectId, entityType: "Contract", entityId: id, actor, decision: "REJECTED" });
  return { ok: true, entity };
}
export async function editContract(id: string, tenantId: string, patch: { title?: string; currentValue?: number; retainagePct?: number; startDate?: Date | null; endDate?: Date | null; notes?: string }): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  if (!actor.canEdit) return { ok: false, error: "Insufficient role." };
  const before = await prisma.contract.findFirst({ where: { id, project: { tenantId } } });
  if (!before) return { ok: false, error: "Contract not found." };
  const valid = validateMoneyPatch(patch, { money: ["currentValue"], percent: ["retainagePct"] });
  if (!valid.ok) return { ok: false, error: valid.error };
  const fields = ["currentValue", "retainagePct", "status"] as const;
  const summary = changeSummary(before as unknown as Record<string, unknown>, patch);
  const entity = await prisma.contract.update({ where: { id }, data: patch });
  await logComment({ tenantId, entityType: "Contract", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "EDIT", body: `Edited: ${summary || "(no changes)"}`, audit: { before: snapshot(before as unknown as Record<string, unknown>, fields), after: snapshot(entity as unknown as Record<string, unknown>, fields) } });
  return { ok: true, entity };
}

// ---------- LIEN WAIVERS ----------
export async function approveLienWaiver(id: string, tenantId: string, note?: string): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  if (!actor.isManager) return { ok: false, error: "Only managers can accept lien waivers." };
  const before = await prisma.lienWaiver.findFirst({ where: { id, project: { tenantId } } });
  if (!before) return { ok: false, error: "Waiver not found." };
  const entity = await prisma.lienWaiver.update({
    where: { id, project: { tenantId } } as never,
    data: { status: "RECEIVED", receivedAt: new Date(), receivedBy: actor.userName, approvedAt: new Date(), approvedBy: actor.userName, approvalNote: note ?? null },
  });
  const lwFields = ["status", "amount"] as const;
  await logComment({ tenantId, entityType: "LienWaiver", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "APPROVE", body: note ? `Accepted. ${note}` : "Accepted.", audit: { before: snapshot(before as unknown as Record<string, unknown>, lwFields), after: snapshot(entity as unknown as Record<string, unknown>, lwFields) } });
  await startWorkflowRun({ tenantId, projectId: entity.projectId, module: "lien-waivers", entityType: "LienWaiver", entityId: id });
  await recordWorkflowDecision({ projectId: entity.projectId, entityType: "LienWaiver", entityId: id, actor, decision: "APPROVED" });
  return { ok: true, entity };
}
export async function rejectLienWaiver(id: string, tenantId: string, reason: string): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  if (!actor.isManager) return { ok: false, error: "Only managers can reject." };
  if (!reason || reason.trim().length < 3) return { ok: false, error: "Reason required." };
  const entity = await prisma.lienWaiver.update({
    where: { id, project: { tenantId } } as never,
    data: { status: "REJECTED", rejectedAt: new Date(), rejectedBy: actor.userName, rejectionReason: reason.trim() },
  });
  await logComment({ tenantId, entityType: "LienWaiver", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "REJECT", body: `Rejected: ${reason.trim()}` });
  await recordWorkflowDecision({ projectId: entity.projectId, entityType: "LienWaiver", entityId: id, actor, decision: "REJECTED" });
  return { ok: true, entity };
}
export async function editLienWaiver(id: string, tenantId: string, patch: { partyName?: string; amount?: number; throughDate?: Date; notes?: string }): Promise<ActionResult> {
  const actor = await actorFor(tenantId);
  if (!actor.canEdit) return { ok: false, error: "Insufficient role." };
  const before = await prisma.lienWaiver.findFirst({ where: { id, project: { tenantId } } });
  if (!before) return { ok: false, error: "Waiver not found." };
  const valid = validateMoneyPatch(patch, { money: ["amount"] });
  if (!valid.ok) return { ok: false, error: valid.error };
  const fields = ["amount", "status"] as const;
  const summary = changeSummary(before as unknown as Record<string, unknown>, patch);
  const entity = await prisma.lienWaiver.update({ where: { id }, data: patch });
  await logComment({ tenantId, entityType: "LienWaiver", entityId: id, actorName: actor.userName, actorId: actor.userId, kind: "EDIT", body: `Edited: ${summary || "(no changes)"}`, audit: { before: snapshot(before as unknown as Record<string, unknown>, fields), after: snapshot(entity as unknown as Record<string, unknown>, fields) } });
  return { ok: true, entity };
}
