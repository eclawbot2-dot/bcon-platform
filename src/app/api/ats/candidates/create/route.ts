import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { requireEditor } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { publicRedirect } from "@/lib/redirect";
import { parseNumberField } from "@/lib/form-input";

export async function POST(req: Request) {
  const tenant = await requireTenant();
  const actor = await requireEditor(tenant.id);
  const form = await req.formData();

  const firstName = String(form.get("firstName") ?? "").trim();
  const lastName = String(form.get("lastName") ?? "").trim();
  if (!firstName || !lastName) return NextResponse.json({ error: "firstName and lastName required" }, { status: 400 });

  const candidate = await prisma.candidate.create({
    data: {
      tenantId: tenant.id,
      firstName,
      lastName,
      email: form.get("email") ? String(form.get("email")) : null,
      phone: form.get("phone") ? String(form.get("phone")) : null,
      city: form.get("city") ? String(form.get("city")) : null,
      state: form.get("state") ? String(form.get("state")) : null,
      laborCategory: form.get("laborCategory") ? String(form.get("laborCategory")) : null,
      primarySkill: form.get("primarySkill") ? String(form.get("primarySkill")) : null,
      source: form.get("source") ? String(form.get("source")) : null,
      // parseNumberField: a non-numeric rate would otherwise be Number()->NaN
      // and throw a raw 500 on the Prisma Float write. Empty/garbage -> null.
      rateExpectation: parseNumberField(form.get("rateExpectation"), null, { min: 0 }),
      ownerUserId: actor.userId,
    },
  });

  await recordAudit({
    tenantId: tenant.id,
    actorId: actor.userId,
    actorName: actor.userName,
    entityType: "Candidate",
    entityId: candidate.id,
    action: "CREATE",
    after: { firstName, lastName },
    source: "ats/candidates/create",
  });

  return publicRedirect(req, `/people/ats`, 303);
}
