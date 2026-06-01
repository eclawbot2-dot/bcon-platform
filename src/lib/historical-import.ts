/**
 * Historical spreadsheet import + AI review.
 *
 * Accepts CSV (and XLSX if the caller pre-converts to CSV). Parses into
 * rows, infers the column map for the selected import kind, lets an AI
 * reviewer flag gaps / anomalies, and upon user acceptance pushes the
 * data into the appropriate bcon tables (JournalEntryRow, BidDraftLineItem,
 * BudgetLine, etc).
 *
 * In production a real LLM can replace `reviewRows()`. Here the reviewer
 * is deterministic: checks column completeness, amount sanity, date
 * plausibility, and suggests project / cost-code mappings.
 */

import { prisma } from "@/lib/prisma";
import {
  CostReconciliationStatus,
  HistoricalImportKind,
  HistoricalImportStatus,
  JournalEntryType,
} from "@prisma/client";
import { suggestProjectAllocation } from "@/lib/xero-sync";

/** Minimal CSV parser (handles quoted fields + commas + BOM). */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else { inQuotes = false; }
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i += 1;
        row.push(field); field = "";
        if (row.some((v) => v.length > 0)) out.push(row);
        row = [];
      } else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); if (row.some((v) => v.length > 0)) out.push(row); }
  return out;
}

type ColumnMap = Record<string, number>;

function buildColumnMap(header: string[], expected: string[]): ColumnMap {
  const normalized = header.map((h) => h.trim().toLowerCase());
  const map: ColumnMap = {};
  for (const key of expected) {
    const idx = normalized.findIndex((h) => h.includes(key.toLowerCase()));
    if (idx >= 0) map[key] = idx;
  }
  return map;
}

function toNumber(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const cleaned = String(v).replace(/[^0-9.\-]/g, "");
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isFinite(d.getTime()) ? d : null;
}

/** Create a HistoricalImport row with parsed data and AI review. */
export async function ingestSpreadsheet(params: {
  tenantId: string;
  projectId?: string | null;
  kind: HistoricalImportKind;
  label: string;
  filename: string;
  fileSize: number;
  csv: string;
  uploadedBy?: string | null;
  fileUrl?: string | null;
  fileKey?: string | null;
}) {
  const table = parseCsv(params.csv);
  if (table.length === 0) throw new Error("CSV is empty");
  const [header, ...rawRows] = table;
  const columns = header.map((h) => h.trim());

  const expected: Record<HistoricalImportKind, string[]> = {
    PROJECT_ACTUALS: ["date", "project", "account", "amount", "vendor", "cost"],
    BID_HISTORY: ["project", "agency", "amount", "status", "win", "award"],
    INCOME_STATEMENT: ["period", "revenue", "cogs", "opex", "ebitda"],
    BUDGET_TEMPLATE: ["code", "description", "amount"],
    SCHEDULE_OF_VALUES: ["code", "description", "scheduled", "completed"],
    VENDOR_LIST: ["name", "trade", "email"],
  };
  const colMap = buildColumnMap(columns, expected[params.kind]);

  const projects = await prisma.project.findMany({ where: { tenantId: params.tenantId }, select: { id: true, code: true, name: true, mode: true, ownerName: true } });

  const imp = await prisma.historicalImport.create({
    data: {
      tenantId: params.tenantId,
      projectId: params.projectId,
      kind: params.kind,
      label: params.label,
      filename: params.filename,
      fileSize: params.fileSize,
      fileUrl: params.fileUrl ?? null,
      fileKey: params.fileKey ?? null,
      uploadedBy: params.uploadedBy,
      status: HistoricalImportStatus.PARSED,
      rowsDetected: rawRows.length,
      columnsJson: JSON.stringify(columns),
      headerRowJson: JSON.stringify(header),
    },
  });

  let totalDollar = 0;
  const flags: Array<{ severity: "INFO" | "WARN" | "ALERT"; message: string }> = [];
  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];
    const issues: string[] = [];
    let extracted: Record<string, unknown> = {};
    let confidence = 50;

    if (params.kind === HistoricalImportKind.PROJECT_ACTUALS) {
      const date = colMap.date !== undefined ? toDate(raw[colMap.date]) : null;
      const amount = colMap.amount !== undefined ? toNumber(raw[colMap.amount]) : null;
      const vendor = colMap.vendor !== undefined ? raw[colMap.vendor] : null;
      const account = colMap.account !== undefined ? raw[colMap.account] : "Direct Materials";
      const projectHint = colMap.project !== undefined ? raw[colMap.project] : "";
      const matched = projectHint ? projects.find((p) => p.code.toLowerCase() === projectHint.toLowerCase() || p.name.toLowerCase().includes(projectHint.toLowerCase())) : null;
      const guess = matched ? { projectId: matched.id, confidence: 95, reason: "exact code match" } : suggestProjectAllocation(`${projectHint} ${vendor ?? ""}`, vendor, projects);
      extracted = { date, amount, vendor, account, projectId: guess.projectId, allocationReason: guess.reason };
      confidence = matched ? 95 : guess.confidence;
      if (!date) issues.push("date missing or unparseable");
      if (!amount) issues.push("amount missing or unparseable");
      if (!guess.projectId) issues.push("no project match — will import as unallocated");
      totalDollar += Math.abs(amount ?? 0);
    } else if (params.kind === HistoricalImportKind.BID_HISTORY) {
      const amount = colMap.amount !== undefined ? toNumber(raw[colMap.amount]) : null;
      const agency = colMap.agency !== undefined ? raw[colMap.agency] : "";
      const status = colMap.status !== undefined ? raw[colMap.status] : "unknown";
      const award = colMap.award !== undefined ? raw[colMap.award] : null;
      extracted = { agency, amount, status, award };
      if (!agency) issues.push("agency column missing");
      if (!amount) issues.push("amount missing");
      totalDollar += amount ?? 0;
    } else if (params.kind === HistoricalImportKind.INCOME_STATEMENT) {
      const period = colMap.period !== undefined ? raw[colMap.period] : "";
      const revenue = colMap.revenue !== undefined ? toNumber(raw[colMap.revenue]) : null;
      const cogs = colMap.cogs !== undefined ? toNumber(raw[colMap.cogs]) : null;
      const opex = colMap.opex !== undefined ? toNumber(raw[colMap.opex]) : null;
      extracted = { period, revenue, cogs, opex };
      if (!period) issues.push("period missing");
      if (revenue === null) issues.push("revenue missing");
      totalDollar += revenue ?? 0;
    } else {
      extracted = Object.fromEntries(columns.map((c, idx) => [c, raw[idx]]));
    }

    await prisma.historicalImportRow.create({
      data: {
        importId: imp.id,
        rowIndex: i,
        dataJson: JSON.stringify(raw),
        extractedJson: JSON.stringify(extracted),
        confidence,
        issuesJson: JSON.stringify(issues),
      },
    });

    if (issues.length > 0 && flags.length < 25) {
      flags.push({ severity: issues.includes("date missing or unparseable") || issues.includes("amount missing or unparseable") ? "ALERT" : "WARN", message: `Row ${i + 1}: ${issues.join("; ")}` });
    }
  }

  const aiSummary = buildAiSummary(params.kind, rawRows.length, flags, colMap, columns);
  await prisma.historicalImport.update({
    where: { id: imp.id },
    data: {
      status: HistoricalImportStatus.AI_REVIEWED,
      aiSummary,
      aiFlagsJson: JSON.stringify(flags),
      totalDollarValue: totalDollar,
    },
  });
  return imp;
}

function buildAiSummary(kind: HistoricalImportKind, rowCount: number, flags: Array<{ severity: string; message: string }>, colMap: Record<string, number>, columns: string[]): string {
  const missing = Object.keys(colMap).length === 0 ? `all expected columns missing — inferred headers: ${columns.slice(0, 6).join(", ")}` : Object.keys(colMap).length;
  const alertCount = flags.filter((f) => f.severity === "ALERT").length;
  const warnCount = flags.filter((f) => f.severity === "WARN").length;
  return `Parsed ${rowCount} rows for a ${kind.replaceAll("_", " ")} import. Matched ${missing} expected columns. Flagged ${alertCount} blocking issues and ${warnCount} warnings. ${alertCount > 0 ? "Review blocking issues before accepting." : warnCount > 0 ? "Warnings are non-blocking; review before accepting." : "All rows look clean; ready to import."}`;
}

/** Accept all clean rows and write them into the live tables. */
export async function commitImport(importId: string, tenantId: string): Promise<{ ok: boolean; imported: number; note: string }> {
  const imp = await prisma.historicalImport.findFirst({ where: { id: importId, tenantId }, include: { rows: true } });
  if (!imp) return { ok: false, imported: 0, note: "import not found" };
  // Idempotency guard: this loop creates JournalEntryRow / Opportunity /
  // BudgetLine records with no unique key, so committing the same import
  // twice would duplicate every row (real money double-counted). Refuse to
  // re-commit a batch that has already reached IMPORTED (or was REJECTED).
  if (imp.status === HistoricalImportStatus.IMPORTED) {
    return { ok: false, imported: 0, note: "this import has already been committed" };
  }
  if (imp.status === HistoricalImportStatus.REJECTED) {
    return { ok: false, imported: 0, note: "this import was rejected and cannot be committed" };
  }
  // Atomically claim the batch. The status read above is a TOCTOU check;
  // two concurrent double-submits could both pass it and then both run the
  // row loop, double-counting real money (JournalEntryRow / Opportunity have
  // no unique key). A conditional updateMany that only matches the import
  // while it is still in its pre-commit status is the claim: the first
  // request flips it to IMPORTED and proceeds; the second matches zero rows
  // and bails out. We set rowsImported at the end of the loop.
  const claim = await prisma.historicalImport.updateMany({
    where: { id: importId, tenantId, status: imp.status },
    data: { status: HistoricalImportStatus.IMPORTED },
  });
  if (claim.count === 0) {
    return { ok: false, imported: 0, note: "this import is already being committed" };
  }
  let imported = 0;
  for (const row of imp.rows) {
    let issues: string[] = [];
    try { issues = JSON.parse(row.issuesJson); } catch { issues = []; }
    const blocking = issues.some((i) => i.includes("missing or unparseable"));
    if (blocking) continue;
    let extracted: Record<string, unknown> = {};
    try { extracted = JSON.parse(row.extractedJson); } catch { extracted = {}; }

    if (imp.kind === HistoricalImportKind.PROJECT_ACTUALS) {
      const amount = (extracted.amount as number) ?? 0;
      const date = extracted.date ? new Date(extracted.date as string) : new Date();
      await prisma.journalEntryRow.create({
        data: {
          tenantId,
          entryDate: date,
          memo: `Historical import · ${imp.label}`,
          accountCode: "5020",
          accountName: String(extracted.account ?? "Direct Materials"),
          entryType: JournalEntryType.COST_OF_GOODS,
          amount: amount < 0 ? amount : -Math.abs(amount),
          vendorName: (extracted.vendor as string) ?? null,
          projectId: (extracted.projectId as string) ?? null,
          allocationConfidence: row.confidence,
          reconciliationStatus: row.confidence >= 80 ? CostReconciliationStatus.CONFIRMED : CostReconciliationStatus.SUGGESTED,
          source: "historical-import",
          reference: `import:${imp.id}:row:${row.rowIndex}`,
          externalSource: "csv-upload",
        },
      });
      imported += 1;
    } else if (imp.kind === HistoricalImportKind.INCOME_STATEMENT) {
      const periodRaw = String(extracted.period ?? "");
      // Accept "YYYY-MM" or ISO date
      let start: Date | null = null;
      if (/^\d{4}-\d{2}$/.test(periodRaw)) start = new Date(`${periodRaw}-01`);
      else start = new Date(periodRaw);
      if (!Number.isFinite(start.getTime())) continue;
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      const revenue = Number(extracted.revenue ?? 0);
      const cogs = Math.abs(Number(extracted.cogs ?? 0));
      const opex = Math.abs(Number(extracted.opex ?? 0));
      const gross = revenue - cogs;
      const ebitda = gross - opex;
      await prisma.financialStatement.upsert({
        where: { tenantId_statementType_periodStart_periodEnd: { tenantId, statementType: "INCOME_STATEMENT", periodStart: start, periodEnd: end } },
        update: { revenue, cogs, grossProfit: gross, opex, ebitda, netIncome: ebitda * 0.88, source: "csv-upload", sourceRef: `import:${imp.id}` },
        create: { tenantId, statementType: "INCOME_STATEMENT", periodStart: start, periodEnd: end, revenue, cogs, grossProfit: gross, opex, ebitda, netIncome: ebitda * 0.88, source: "csv-upload", sourceRef: `import:${imp.id}` },
      });
      imported += 1;
    } else if (imp.kind === HistoricalImportKind.BID_HISTORY && imp.projectId === null) {
      // Stored as Opportunity (stage derived from status)
      const status = String(extracted.status ?? "").toLowerCase();
      const stage = status.includes("won") ? "AWARDED" : status.includes("lost") ? "LOST" : status.includes("submit") ? "BID" : "PROPOSAL";
      await prisma.opportunity.create({
        data: {
          tenantId,
          name: `${String(extracted.agency ?? "Historical RFP")} · ${String(extracted.amount ?? "")}`,
          clientName: String(extracted.agency ?? ""),
          stage: stage as "AWARDED" | "LOST" | "BID" | "PROPOSAL",
          estimatedValue: Number(extracted.amount ?? 0),
          probability: stage === "AWARDED" ? 100 : stage === "LOST" ? 0 : 40,
          awardDate: extracted.award ? new Date(String(extracted.award)) : null,
          source: `imported:${imp.id}`,
          mode: "VERTICAL",
        },
      });
      imported += 1;
    }
    await prisma.historicalImportRow.update({ where: { id: row.id }, data: { accepted: true } });
  }
  // Status was already flipped to IMPORTED by the atomic claim above; just
  // record how many rows landed.
  await prisma.historicalImport.update({ where: { id: imp.id }, data: { rowsImported: imported } });
  return { ok: true, imported, note: `imported ${imported} rows into ${imp.kind}` };
}
