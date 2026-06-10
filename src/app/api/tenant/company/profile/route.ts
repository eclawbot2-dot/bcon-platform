import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { requireTenant } from "@/lib/tenant";

/**
 * Create or update the tenant's CompanyProfile. One route serves both
 * the first-run "create" banner (legalName/dbaName/ein only) and the
 * full edit form on /settings/company — optional fields that the
 * submitting form omits entirely are left untouched, while fields the
 * form includes but the user cleared are nulled.
 */
export async function POST(req: NextRequest) {
  const tenant = await requireTenant();
  const form = await req.formData();
  const legalName = (form.get("legalName") as string | null)?.trim();
  if (!legalName) redirect("/settings/company?error=legal+name+required");

  const text = (name: string): string | null => {
    const v = (form.get(name) as string | null)?.trim();
    return v || null;
  };

  const update: Prisma.CompanyProfileUpdateInput = { legalName: legalName! };
  const create: Prisma.CompanyProfileUncheckedCreateInput = { tenantId: tenant.id, legalName: legalName! };

  const TEXT_FIELDS = [
    "dbaName", "ein", "duns", "cageCode", "uei", "entityType",
    "primaryAddress", "city", "state", "postalCode", "samStatus",
    "primaryContactName", "primaryContactEmail", "primaryContactPhone", "notes",
  ] as const;
  for (const f of TEXT_FIELDS) {
    // Only touch a column when the submitting form actually rendered the
    // field, so the minimal create banner can't wipe fields it omits.
    if (!form.has(f)) continue;
    const v = text(f);
    (update as Record<string, unknown>)[f] = v;
    (create as Record<string, unknown>)[f] = v;
  }

  if (form.has("yearFounded")) {
    const raw = text("yearFounded");
    const n = raw ? Number(raw) : NaN;
    const v = Number.isFinite(n) ? Math.trunc(n) : null;
    update.yearFounded = v;
    create.yearFounded = v;
  }
  if (form.has("samExpiresAt")) {
    const raw = text("samExpiresAt");
    const d = raw ? new Date(raw) : null;
    const v = d && !Number.isNaN(d.getTime()) ? d : null;
    update.samExpiresAt = v;
    create.samExpiresAt = v;
  }

  await prisma.companyProfile.upsert({
    where: { tenantId: tenant.id },
    create,
    update,
  });
  redirect("/settings/company?ok=Profile+saved");
}
