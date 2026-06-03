import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import type { PrismaClient } from "@prisma/client";

/**
 * Autonomous-workflow engine tests. Exercise:
 *   - REGISTRY MERGE: code registry is the source of truth; config rows
 *     default OFF + advisory.
 *   - DISPATCHER DUE-CHECK: only enabled + due (nextDueAt null/<=now) configs
 *     run; future-due ones are skipped; the schedule advances after a run.
 *   - PER-TENANT ISOLATION: a throwing workflow for tenant A does not abort
 *     the sweep for tenant B.
 *   - DETERMINISTIC OUTPUT: late-payment prediction produces an advisory
 *     alert for a past-due unpaid sub-invoice (and tenant-scopes it).
 *   - TRUST-GATE DEFAULTS OFF: a fresh config has enabled/trustGated/autoApply
 *     all false, and the engine clamps actionCount to 0 for advisory workflows.
 *
 * Same temp-DB strategy as alerts.test.ts.
 */

const devDb = path.resolve(__dirname, "..", "prisma", "dev.db");
if (!fs.existsSync(devDb)) throw new Error("dev.db not found — run `npx prisma db push` first");
const tmpDbPath = path.join(os.tmpdir(), `bcon-test-automations-${Date.now()}.db`);
fs.copyFileSync(devDb, tmpDbPath);
process.env.DATABASE_URL = `file:${tmpDbPath}`;

vi.mock("@/lib/notify", () => ({ notifyForAlert: vi.fn(async () => 0) }));

let prisma: PrismaClient;
let engine: typeof import("@/lib/automations/engine");
let registry: typeof import("@/lib/automations/registry");

beforeAll(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  engine = await import("@/lib/automations/engine");
  registry = await import("@/lib/automations/registry");
});

afterAll(async () => {
  await prisma?.$disconnect();
  try { fs.unlinkSync(tmpDbPath); } catch { /* ignore */ }
});

async function freshTenant(label: string) {
  return prisma.tenant.create({
    data: { name: `auto-${label}`, slug: `auto-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, primaryMode: "SIMPLE" },
  });
}
async function makeProject(tenantId: string, code: string) {
  return prisma.project.create({
    data: { tenantId, name: `Proj ${code}`, code: `${code}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, mode: "VERTICAL" },
  });
}

describe("registry", () => {
  it("ships the five no-input deterministic workflows + wrapped engines, advisory-only", () => {
    const keys = registry.WORKFLOWS.map((w) => w.key);
    for (const k of ["alert-scan", "mail-ingest", "schedule-slip-predict", "cashflow-forecast", "margin-fade-warning", "late-payment-predict", "feedback-loop-close"]) {
      expect(keys).toContain(k);
    }
    // No workflow is trust-gatable at launch (all advisory).
    expect(registry.WORKFLOWS.every((w) => w.trustGatable === false)).toBe(true);
    // The two LLM-needing workflows are flagged requiresLlmKey.
    expect(registry.getWorkflow("narrative-drafting")?.requiresLlmKey).toBe(true);
    expect(registry.getWorkflow("nl-copilot-digest")?.requiresLlmKey).toBe(true);
    expect(registry.getWorkflow("schedule-slip-predict")?.requiresLlmKey).toBe(false);
  });

  it("effectiveIntervalMinutes honors an override and falls back to default", () => {
    const def = registry.getWorkflow("schedule-slip-predict")!;
    expect(registry.effectiveIntervalMinutes(def, null)).toBe(def.defaultIntervalMinutes);
    expect(registry.effectiveIntervalMinutes(def, 30)).toBe(30);
    expect(registry.effectiveIntervalMinutes(def, 0)).toBe(def.defaultIntervalMinutes);
  });
});

describe("config defaults (opt-in, advisory)", () => {
  it("a Run-now on a brand-new config leaves it enabled=false, trustGated=false, autoApply=false", async () => {
    const t = await freshTenant("defaults");
    await engine.runWorkflowForTenant(t.id, "feedback-loop-close", "manual:test");
    const cfg = await prisma.automationConfig.findUnique({ where: { tenantId_workflowKey: { tenantId: t.id, workflowKey: "feedback-loop-close" } } });
    expect(cfg).not.toBeNull();
    expect(cfg!.enabled).toBe(false);
    expect(cfg!.trustGated).toBe(false);
    expect(cfg!.autoApply).toBe(false);
  });
});

describe("dispatcher due-check", () => {
  it("runs an enabled workflow with null nextDueAt and advances the schedule; skips a future-due one", async () => {
    const t = await freshTenant("due");
    // Enabled, due immediately.
    await prisma.automationConfig.create({ data: { tenantId: t.id, workflowKey: "feedback-loop-close", enabled: true, nextDueAt: null } });
    // Enabled but not due until far in the future.
    await prisma.automationConfig.create({ data: { tenantId: t.id, workflowKey: "margin-fade-warning", enabled: true, nextDueAt: new Date(Date.now() + 86_400_000) } });
    // Disabled — never runs.
    await prisma.automationConfig.create({ data: { tenantId: t.id, workflowKey: "cashflow-forecast", enabled: false, nextDueAt: null } });

    const before = await prisma.automationRun.count({ where: { tenantId: t.id } });
    const summary = await engine.dispatchDueWorkflows();
    expect(summary.outcomes.some((o) => o.tenantId === t.id && o.workflowKey === "feedback-loop-close")).toBe(true);
    expect(summary.outcomes.some((o) => o.tenantId === t.id && o.workflowKey === "margin-fade-warning")).toBe(false);
    expect(summary.outcomes.some((o) => o.tenantId === t.id && o.workflowKey === "cashflow-forecast")).toBe(false);

    const after = await prisma.automationRun.count({ where: { tenantId: t.id } });
    expect(after).toBe(before + 1);

    const cfg = await prisma.automationConfig.findUnique({ where: { tenantId_workflowKey: { tenantId: t.id, workflowKey: "feedback-loop-close" } } });
    expect(cfg!.nextDueAt).not.toBeNull();
    expect(new Date(cfg!.nextDueAt!).getTime()).toBeGreaterThan(Date.now());
    expect(cfg!.lastStatus).toBe("SUCCESS");
  });
});

describe("per-tenant isolation", () => {
  it("a workflow that throws for one tenant does not abort the sweep for another", async () => {
    const bad = await freshTenant("iso-bad");
    const good = await freshTenant("iso-good");
    await prisma.automationConfig.create({ data: { tenantId: bad.id, workflowKey: "feedback-loop-close", enabled: true, nextDueAt: null } });
    await prisma.automationConfig.create({ data: { tenantId: good.id, workflowKey: "feedback-loop-close", enabled: true, nextDueAt: null } });

    // Force the bad tenant's run() to throw via a spy on the registry entry.
    const def = registry.getWorkflow("feedback-loop-close")!;
    const orig = def.run;
    const spy = vi.spyOn(def, "run").mockImplementation(async (ctx) => {
      if (ctx.tenantId === bad.id) throw new Error("boom");
      return orig(ctx);
    });

    const summary = await engine.dispatchDueWorkflows();
    spy.mockRestore();

    const badOutcome = summary.outcomes.find((o) => o.tenantId === bad.id);
    const goodOutcome = summary.outcomes.find((o) => o.tenantId === good.id);
    expect(badOutcome?.status).toBe("ERROR");
    expect(goodOutcome?.status).toBe("SUCCESS");
    // The thrown error is recorded fail-loud on the bad tenant's run + config.
    const badRun = await prisma.automationRun.findFirst({ where: { tenantId: bad.id, workflowKey: "feedback-loop-close" }, orderBy: { startedAt: "desc" } });
    expect(badRun?.status).toBe("ERROR");
    expect(badRun?.error).toContain("boom");
  });
});

describe("deterministic workflow output (late-payment prediction)", () => {
  it("flags a past-due unpaid sub-invoice and tenant-scopes the alert", async () => {
    const a = await freshTenant("lp-a");
    const b = await freshTenant("lp-b");
    const pa = await makeProject(a.id, "LPA");
    const pb = await makeProject(b.id, "LPB");
    const va = await prisma.vendor.create({ data: { tenantId: a.id, name: "Acme Sub A" } });
    const vb = await prisma.vendor.create({ data: { tenantId: b.id, name: "Acme Sub B" } });

    await prisma.subInvoice.create({
      data: { projectId: pa.id, vendorId: va.id, invoiceNumber: "INV-A-1", amount: 5000, netDue: 5000, status: "APPROVED", invoiceDate: new Date(Date.now() - 60 * 86_400_000), dueDate: new Date(Date.now() - 20 * 86_400_000), paidAt: null },
    });
    await prisma.subInvoice.create({
      data: { projectId: pb.id, vendorId: vb.id, invoiceNumber: "INV-B-1", amount: 5000, netDue: 5000, status: "APPROVED", invoiceDate: new Date(Date.now() - 60 * 86_400_000), dueDate: new Date(Date.now() - 20 * 86_400_000), paidAt: null },
    });

    const out = await engine.runWorkflowForTenant(a.id, "late-payment-predict", "manual:test");
    expect(out.status).toBe("SUCCESS");

    const aAlerts = await prisma.alertEvent.findMany({ where: { tenantId: a.id, entityType: "AutomationLatePayment" } });
    const bAlerts = await prisma.alertEvent.findMany({ where: { tenantId: b.id, entityType: "AutomationLatePayment" } });
    expect(aAlerts.length).toBe(1);
    expect(aAlerts[0].title).toContain("Late payment predicted");
    expect(bAlerts.length).toBe(0); // scan for A never touched B
  });
});

describe("advisory-by-default action clamp", () => {
  it("the engine records actionCount 0 even if a workflow reports actions, since no workflow is trust-gatable", async () => {
    const t = await freshTenant("clamp");
    const def = registry.getWorkflow("feedback-loop-close")!;
    const spy = vi.spyOn(def, "run").mockImplementation(async () => ({ status: "SUCCESS", summary: "tried to act", actionCount: 99, producedCount: 0 }));
    await engine.runWorkflowForTenant(t.id, "feedback-loop-close", "manual:test");
    spy.mockRestore();
    const run = await prisma.automationRun.findFirst({ where: { tenantId: t.id, workflowKey: "feedback-loop-close" }, orderBy: { startedAt: "desc" } });
    expect(run?.actionCount).toBe(0);
  });
});
