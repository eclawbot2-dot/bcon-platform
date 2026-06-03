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
    for (const k of ["alert-scan", "mail-ingest", "schedule-slip-predict", "cashflow-forecast", "margin-fade-warning", "late-payment-predict", "feedback-loop-close", "bid-benchmark", "automation-retention"]) {
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

describe("AutomationRun retention guardrail", () => {
  it("the per-tenant sweep prunes runs older than the 90d cutoff and keeps recent ones, tenant-scoped", async () => {
    const t = await freshTenant("retain");
    const other = await freshTenant("retain-other");
    const cfg = await prisma.automationConfig.create({ data: { tenantId: t.id, workflowKey: "automation-retention" } });
    const old = new Date(Date.now() - 100 * 86_400_000);
    const recent = new Date(Date.now() - 10 * 86_400_000);
    await prisma.automationRun.create({ data: { tenantId: t.id, configId: cfg.id, workflowKey: "feedback-loop-close", status: "SUCCESS", startedAt: old, finishedAt: old } });
    await prisma.automationRun.create({ data: { tenantId: t.id, configId: cfg.id, workflowKey: "feedback-loop-close", status: "SUCCESS", startedAt: recent, finishedAt: recent } });
    // Another tenant's old run must survive a per-tenant sweep.
    await prisma.automationRun.create({ data: { tenantId: other.id, workflowKey: "feedback-loop-close", status: "SUCCESS", startedAt: old, finishedAt: old } });

    const out = await engine.runWorkflowForTenant(t.id, "automation-retention", "manual:test");
    expect(out.status).toBe("SUCCESS");

    // The old row for t is gone; the recent row + this sweep's own run remain.
    const remaining = await prisma.automationRun.findMany({ where: { tenantId: t.id }, orderBy: { startedAt: "asc" } });
    expect(remaining.some((r) => r.startedAt.getTime() === old.getTime())).toBe(false);
    expect(remaining.some((r) => Math.abs(r.startedAt.getTime() - recent.getTime()) < 1000)).toBe(true);
    // Other tenant untouched.
    const otherRuns = await prisma.automationRun.count({ where: { tenantId: other.id } });
    expect(otherRuns).toBe(1);
  });

  it("the global dispatcher prune deletes old runs across ALL tenants", async () => {
    const a = await freshTenant("gp-a");
    const b = await freshTenant("gp-b");
    const old = new Date(Date.now() - 200 * 86_400_000);
    await prisma.automationRun.create({ data: { tenantId: a.id, workflowKey: "feedback-loop-close", status: "SUCCESS", startedAt: old, finishedAt: old } });
    await prisma.automationRun.create({ data: { tenantId: b.id, workflowKey: "feedback-loop-close", status: "SUCCESS", startedAt: old, finishedAt: old } });
    const recentA = await prisma.automationRun.create({ data: { tenantId: a.id, workflowKey: "feedback-loop-close", status: "SUCCESS", startedAt: new Date(), finishedAt: new Date() } });

    const pruned = await engine.pruneAutomationRuns();
    expect(pruned).toBeGreaterThanOrEqual(2);
    expect(await prisma.automationRun.findUnique({ where: { id: recentA.id } })).not.toBeNull();
    expect(await prisma.automationRun.count({ where: { tenantId: a.id, startedAt: { lt: new Date(Date.now() - 90 * 86_400_000) } } })).toBe(0);
    expect(await prisma.automationRun.count({ where: { tenantId: b.id, startedAt: { lt: new Date(Date.now() - 90 * 86_400_000) } } })).toBe(0);
  });
});

describe("bid-benchmark historical outlier detection", () => {
  it("benchmarkUnitCostHistorical: flags HIGH/LOW outliers vs the tenant's own band and reports NO_DATA below minSamples", async () => {
    const est = await import("@/lib/estimating-ai");
    // Tight history around ~100 → an entry at 1000 is a clear HIGH outlier.
    const history = [95, 98, 100, 102, 105, 99, 101];
    const high = est.benchmarkUnitCostHistorical("03-30-00", 1000, history);
    expect(high.verdict).toBe("HIGH");
    expect(high.samples).toBe(history.length);
    expect(high.entered).toBe(1000);
    expect(high.deltaPct).toBeGreaterThan(0);

    const low = est.benchmarkUnitCostHistorical("03-30-00", 5, history);
    expect(low.verdict).toBe("LOW");

    const normal = est.benchmarkUnitCostHistorical("03-30-00", 100, history);
    expect(normal.verdict).toBe("NORMAL");

    // Below minSamples → no judgement.
    expect(est.benchmarkUnitCostHistorical("03-30-00", 100, [100, 101]).verdict).toBe("NO_DATA");
  });

  it("the workflow raises an advisory alert for an outlier sub-bid line vs tenant history", async () => {
    const t = await freshTenant("bench");
    const proj = await makeProject(t.id, "BEN");
    const vendor = await prisma.vendor.create({ data: { tenantId: t.id, name: "Outlier Sub" } });

    // Build tenant history: several prior priced lines for cost code 03-30-00
    // clustered ~100/unit, in a SEPARATE (closed/awarded) package so it counts
    // as history (we only exclude the open packages being scored).
    const histPkg = await prisma.bidPackage.create({ data: { projectId: proj.id, name: "Hist Concrete", trade: "Concrete", status: "AWARDED" } });
    const histPrices = [98, 100, 102, 99, 101, 100];
    for (let i = 0; i < histPrices.length; i++) {
      const hv = await prisma.vendor.create({ data: { tenantId: t.id, name: `Hist Vendor ${i}` } });
      const hsb = await prisma.subBid.create({ data: { bidPackageId: histPkg.id, vendorId: hv.id, bidAmount: histPrices[i] * 10 } });
      await prisma.subBidLine.create({ data: { subBidId: hsb.id, scopeItemKey: "concrete", description: "CIP concrete", costCode: "03-30-00", quantity: 10, unitPrice: histPrices[i], amount: histPrices[i] * 10 } });
    }

    // Open package with an outlier sub-bid line (1000/unit vs ~100 history).
    const openPkg = await prisma.bidPackage.create({ data: { projectId: proj.id, name: "New Concrete", trade: "Concrete", status: "LEVELING" } });
    const sb = await prisma.subBid.create({ data: { bidPackageId: openPkg.id, vendorId: vendor.id, bidAmount: 10000 } });
    await prisma.subBidLine.create({ data: { subBidId: sb.id, scopeItemKey: "concrete", description: "CIP concrete", costCode: "03-30-00", quantity: 10, unitPrice: 1000, amount: 10000 } });

    const out = await engine.runWorkflowForTenant(t.id, "bid-benchmark", "manual:test");
    expect(out.status).toBe("SUCCESS");

    const alerts = await prisma.alertEvent.findMany({ where: { tenantId: t.id, entityType: "AutomationBidBenchmark" } });
    expect(alerts.length).toBe(1);
    expect(alerts[0].entityId).toBe(sb.id);
    expect(alerts[0].title).toContain("Outlier sub-bid line");
  });
});

describe("LLM workflows: skip-vs-generate branch", () => {
  it("narrative-drafting and nl-copilot-digest SKIP cleanly with no_llm_key when no key is configured", async () => {
    const prev = process.env.ENABLE_LLM_CALLS;
    process.env.ENABLE_LLM_CALLS = "false";
    const t = await freshTenant("llm-off");
    const nd = await engine.runWorkflowForTenant(t.id, "narrative-drafting", "manual:test");
    const dg = await engine.runWorkflowForTenant(t.id, "nl-copilot-digest", "manual:test");
    expect(nd.status).toBe("SKIPPED");
    expect(dg.status).toBe("SKIPPED");
    const ndRun = await prisma.automationRun.findFirst({ where: { tenantId: t.id, workflowKey: "narrative-drafting" }, orderBy: { startedAt: "desc" } });
    expect(ndRun?.usedLlm).toBe(false);
    if (prev === undefined) delete process.env.ENABLE_LLM_CALLS; else process.env.ENABLE_LLM_CALLS = prev;
  });

  it("nl-copilot-digest GENERATES + stores an advisory artifact when a key is present (aiCall mocked)", async () => {
    const prevEnable = process.env.ENABLE_LLM_CALLS;
    const prevKey = process.env.OPENAI_API_KEY;
    process.env.ENABLE_LLM_CALLS = "true";
    process.env.OPENAI_API_KEY = "sk-test-key";

    // Mock the actual outbound LLM call via global fetch so aiCall returns
    // our JSON without hitting the network.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ headline: "All systems nominal", bullets: ["Pipeline healthy", "No over-budget projects"] }) } }] }), { status: 200, headers: { "content-type": "application/json" } }),
    );

    const t = await freshTenant("llm-on");
    const out = await engine.runWorkflowForTenant(t.id, "nl-copilot-digest", "manual:test");
    fetchSpy.mockRestore();

    expect(out.status).toBe("SUCCESS");
    const run = await prisma.automationRun.findFirst({ where: { tenantId: t.id, workflowKey: "nl-copilot-digest" }, orderBy: { startedAt: "desc" } });
    expect(run?.usedLlm).toBe(true);
    const artifact = await prisma.aiRunLog.findFirst({ where: { tenantId: t.id, kind: "automation-copilot-digest" } });
    expect(artifact).not.toBeNull();
    expect(artifact!.outputJson).toContain("All systems nominal");

    if (prevEnable === undefined) delete process.env.ENABLE_LLM_CALLS; else process.env.ENABLE_LLM_CALLS = prevEnable;
    if (prevKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = prevKey;
  });
});
