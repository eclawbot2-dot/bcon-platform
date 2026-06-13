import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { requireEditor } from "@/lib/permissions";
import { DailyLogType } from "@prisma/client";
import { publicRedirect } from "@/lib/redirect";

/**
 * Create a daily field log directly from the project's daily-logs page.
 *
 * Until now the ONLY writer of DailyLog rows was the weather-capture cron,
 * which meant superintendents in the field had no way to record manpower,
 * delays, or work performed — the page advertised "once the superintendent
 * starts logging" but offered no input. This closes that gap.
 *
 * Editor-gated (PM / superintendent / field role), tenant-scoped via the
 * owning project. Uses publicRedirect (not next/navigation redirect) so the
 * 303 Location resolves against the public host behind the Cloudflare tunnel.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await ctx.params;
  const tenant = await requireTenant();

  let actor;
  try {
    actor = await requireEditor(tenant.id);
  } catch {
    return publicRedirect(req, `/projects/${projectId}/daily-logs?error=${encodeURIComponent("Editor-level role required to log daily reports")}`, 303);
  }

  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: tenant.id } });
  if (!project) {
    return publicRedirect(req, `/projects?error=${encodeURIComponent("project not found")}`, 303);
  }

  const form = await req.formData();
  const text = (name: string): string | null => {
    const v = (form.get(name) as string | null)?.trim();
    return v || null;
  };

  const summary = text("summary");
  if (!summary) {
    return publicRedirect(req, `/projects/${projectId}/daily-logs?error=${encodeURIComponent("A work-performed summary is required")}`, 303);
  }

  // logDate: default to today (start of day) when omitted; reject garbage.
  const dateRaw = text("logDate");
  const logDate = dateRaw ? new Date(dateRaw) : new Date();
  if (Number.isNaN(logDate.getTime())) {
    return publicRedirect(req, `/projects/${projectId}/daily-logs?error=${encodeURIComponent("Invalid log date")}`, 303);
  }

  // logType — constrain to the enum; anything else falls back to GENERAL.
  const typeRaw = text("logType");
  const logType = typeRaw && (Object.values(DailyLogType) as string[]).includes(typeRaw)
    ? (typeRaw as DailyLogType)
    : DailyLogType.GENERAL;

  // manpower — non-negative integer head-count; blank/garbage → 0.
  const manpowerRaw = text("manpower");
  const manpowerParsed = manpowerRaw ? Number.parseInt(manpowerRaw, 10) : 0;
  const manpower = Number.isFinite(manpowerParsed) && manpowerParsed > 0 ? Math.floor(manpowerParsed) : 0;

  // Geotag (optional) — only persist coordinates when both parse cleanly and
  // sit in valid lat/lon ranges; a half-filled pair is dropped entirely.
  const latRaw = text("latitude");
  const lonRaw = text("longitude");
  const latNum = latRaw ? Number.parseFloat(latRaw) : null;
  const lonNum = lonRaw ? Number.parseFloat(lonRaw) : null;
  const geoOk =
    latNum !== null && lonNum !== null &&
    Number.isFinite(latNum) && Number.isFinite(lonNum) &&
    Math.abs(latNum) <= 90 && Math.abs(lonNum) <= 180;

  // Double-submit guard: a phone with a flaky connection re-POSTs the same
  // log. If an identical summary landed on this project in the last 30s,
  // treat it as the same submission and bounce to the list rather than
  // duplicating the day's report.
  const recentDuplicate = await prisma.dailyLog.findFirst({
    where: {
      projectId: project.id,
      summary,
      createdAt: { gte: new Date(Date.now() - 30_000) },
    },
    select: { id: true },
  });
  if (recentDuplicate) {
    return publicRedirect(req, `/projects/${projectId}/daily-logs?ok=${encodeURIComponent("Daily log saved")}`, 303);
  }

  const log = await prisma.dailyLog.create({
    data: {
      projectId: project.id,
      logDate,
      logType,
      weather: text("weather") ?? undefined,
      summary,
      manpower,
      notes: text("notes") ?? undefined,
      segment: text("segment") ?? undefined,
      station: text("station") ?? undefined,
      latitude: geoOk ? latNum! : undefined,
      longitude: geoOk ? lonNum! : undefined,
    },
  });

  await prisma.auditEvent.create({
    data: {
      tenantId: tenant.id,
      actorId: actor.userId,
      entityType: "DailyLog",
      entityId: log.id,
      action: "CREATED",
      afterJson: JSON.stringify({ logDate: log.logDate, logType: log.logType, manpower: log.manpower, actor: actor.userName }),
      source: "daily-logs/create",
    },
  });

  return publicRedirect(req, `/projects/${projectId}/daily-logs?ok=${encodeURIComponent("Daily log saved")}`, 303);
}
