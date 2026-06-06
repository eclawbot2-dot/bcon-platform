import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticate, listEnvelope, objectEnvelope } from "../_helpers";
import { dispatchWebhook } from "@/lib/webhooks";

/**
 * GET /api/v1/rfis — list RFIs for the tenant's projects.
 * POST /api/v1/rfis — create an RFI (scope "write:rfis").
 *
 * Both endpoints scope by tenantId via the project relation.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticate(req, "read:rfis");
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const projectId = url.searchParams.get("project_id");
  const status = url.searchParams.get("status");
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "100") || 100, 1), 500);

  const where: Record<string, unknown> = { project: { tenantId: auth.tenantId } };
  if (projectId) where.projectId = projectId;
  if (status) where.status = status;

  const rfis = await prisma.rFI.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      projectId: true,
      number: true,
      subject: true,
      question: true,
      response: true,
      status: true,
      dueDate: true,
      ballInCourt: true,
      currentReviewerEmail: true,
      sentToReviewerAt: true,
      costImpactCents: true,
      scheduleImpactDays: true,
      submittedAt: true,
      respondedAt: true,
      approvedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return listEnvelope(rfis, { hasMore: rfis.length === limit });
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req, "write:rfis");
  if (auth instanceof NextResponse) return auth;

  let body: { project_id?: string; number?: string; subject?: string; question?: string; due_date?: string; ball_in_court?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_body", message: "Body must be JSON" }, { status: 400 }); }

  if (!body.project_id || !body.number || !body.subject) {
    return NextResponse.json({ error: "missing_fields", message: "project_id, number, subject required" }, { status: 422 });
  }

  // Validate an optional due_date up front — `new Date("garbage")` would
  // otherwise reach prisma.create as an Invalid Date and surface as a 500
  // instead of a clean 422 for the automation client.
  let dueDate: Date | null = null;
  if (body.due_date) {
    dueDate = new Date(body.due_date);
    if (Number.isNaN(dueDate.getTime())) {
      return NextResponse.json({ error: "invalid_due_date", message: "due_date must be an ISO-8601 date" }, { status: 422 });
    }
  }

  // Verify project belongs to the token's tenant.
  const project = await prisma.project.findFirst({ where: { id: body.project_id, tenantId: auth.tenantId } });
  if (!project) return NextResponse.json({ error: "project_not_found" }, { status: 404 });

  // RFI has @@unique([projectId, number]). An automation client that
  // retries (network blip, queue redelivery) or double-fires with the
  // same `number` would otherwise hit a raw Prisma P2002 → 500. Return
  // a clean 409 so the caller can treat the retry as a no-op rather than
  // a server error. (Mirrors the dedup pattern in src/lib/rfp-crawl.ts.)
  let rfi;
  try {
    rfi = await prisma.rFI.create({
      data: {
        projectId: body.project_id,
        number: body.number,
        subject: body.subject,
        question: body.question,
        ballInCourt: body.ball_in_court,
        dueDate,
      },
    });
  } catch (err) {
    const isUniqueConflict = err instanceof Error && /Unique constraint failed/i.test(err.message);
    if (isUniqueConflict) {
      return NextResponse.json(
        { error: "conflict", message: `An RFI with number "${body.number}" already exists on this project` },
        { status: 409 },
      );
    }
    throw err;
  }

  await dispatchWebhook(auth.tenantId, "rfi.created", { id: rfi.id, projectId: rfi.projectId, number: rfi.number, subject: rfi.subject });

  return objectEnvelope(rfi);
}
