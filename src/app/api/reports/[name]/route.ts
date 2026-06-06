import { NextRequest, NextResponse } from "next/server";
import { requireTenant } from "@/lib/tenant";
import { csvField } from "@/lib/csv";
import {
  wipReport,
  costToCompleteForecast,
  marginFadeTrend,
  winRateAnalytics,
  estimateAccuracyReport,
  resourceHeatmap,
  bondingCapacityReport,
} from "@/lib/reports";

/**
 * Tenant-scoped report endpoint. ?format=json (default) | csv.
 *
 *   GET /api/reports/wip
 *   GET /api/reports/cost-to-complete
 *   GET /api/reports/margin-fade?months=12
 *   GET /api/reports/win-rate
 *   GET /api/reports/estimate-accuracy
 *   GET /api/reports/resource-heatmap?weeks=8
 *   GET /api/reports/bonding-capacity
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ name: string }> }) {
  const tenant = await requireTenant();
  const { name } = await ctx.params;
  const url = new URL(req.url);
  const format = (url.searchParams.get("format") ?? "json").toLowerCase();

  const data = await runReport(name, tenant.id, url);
  if (data === null) return NextResponse.json({ error: "unknown report" }, { status: 404 });

  if (format === "csv") {
    const csv = toCsvFromArray(data);
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${name}-${tenant.slug}-${new Date().toISOString().slice(0,10)}.csv"`,
      },
    });
  }
  return NextResponse.json({ data });
}

/**
 * Parse a positive-integer query param with a default + hard clamp. A
 * non-numeric value (e.g. `?months=abc`) would otherwise become NaN and
 * flow into `Date.setMonth(getMonth() - NaN)` → Invalid Date → a malformed
 * Prisma range query. Clamp also caps an absurd `?weeks=999999` window.
 */
function clampedInt(raw: string | null, def: number, min: number, max: number): number {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
}

async function runReport(name: string, tenantId: string, url: URL): Promise<unknown> {
  switch (name) {
    case "wip": return wipReport(tenantId);
    case "cost-to-complete": return costToCompleteForecast(tenantId);
    case "margin-fade": return marginFadeTrend(tenantId, clampedInt(url.searchParams.get("months"), 12, 1, 120));
    case "win-rate": return winRateAnalytics(tenantId);
    case "estimate-accuracy": return estimateAccuracyReport(tenantId);
    case "resource-heatmap": return resourceHeatmap(tenantId, clampedInt(url.searchParams.get("weeks"), 8, 1, 104));
    case "bonding-capacity": return bondingCapacityReport(tenantId);
    default: return null;
  }
}

function toCsvFromArray(data: unknown): string {
  const arr = Array.isArray(data) ? data : (data && typeof data === "object" && "byOwner" in data ? (data as { byOwner: unknown[] }).byOwner : [data]);
  if (!Array.isArray(arr) || arr.length === 0) return "";
  const headers = Object.keys(arr[0] as Record<string, unknown>);
  const rows = (arr as Record<string, unknown>[]).map((r) =>
    headers.map((h) => {
      const v = r[h];
      if (v === null || v === undefined) return "";
      if (v instanceof Date) return v.toISOString();
      if (typeof v === "number") return String(v);
      return csvField(String(v));
    }).join(","),
  );
  return [headers.join(","), ...rows].join("\n");
}
