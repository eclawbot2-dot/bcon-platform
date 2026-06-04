import { NextRequest, NextResponse } from "next/server";
import { currentSuperAdmin } from "@/lib/permissions";
import { restoreTenant } from "@/lib/backup";
import { recordAudit } from "@/lib/audit";

/**
 * Super-admin tenant restore. POST a backup JSON payload (the contents of a
 * file written by backupTenant) and restore that tenant's data graph.
 *
 * Body: { payload: <string | object>, confirm?: boolean }
 *   - Without confirm (or confirm:false) → DRY RUN. Returns the planned row
 *     counts and writes nothing.
 *   - confirm:true → performs the restore in a transaction (FK order,
 *     idempotent — existing rows are skipped).
 *
 * Gated to super-admins only. This is destructive (writes a whole tenant
 * graph) so it is intentionally not exposed to tenant admins.
 */
export async function POST(req: NextRequest) {
  const admin = await currentSuperAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Super-admin privileges required." }, { status: 403 });
  }

  let body: { payload?: unknown; confirm?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  // Accept the payload as a raw string or as an already-parsed object.
  const payloadStr =
    typeof body.payload === "string"
      ? body.payload
      : body.payload && typeof body.payload === "object"
        ? JSON.stringify(body.payload)
        : null;
  if (!payloadStr) {
    return NextResponse.json({ error: "payload (string or object) required" }, { status: 422 });
  }

  const confirm = body.confirm === true;
  const result = await restoreTenant(payloadStr, {
    isSuperAdmin: true,
    dryRun: !confirm,
    confirm,
  });

  // Audit every real (non-dry-run) restore attempt — this is a high-impact
  // operation and the audit log should always carry it.
  if (confirm && result.tenantId) {
    await recordAudit({
      tenantId: result.tenantId,
      actorId: admin.userId,
      actorName: admin.name,
      entityType: "Tenant",
      entityId: result.tenantId,
      action: "RESTORE",
      after: { ok: result.ok, restored: result.restored, error: result.error },
      source: "api/admin/restore",
    });
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
