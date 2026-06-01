import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { currentActor } from "@/lib/permissions";

export async function POST(req: NextRequest, ctx: { params: Promise<{ projectId: string }> }) {
  const tenant = await requireTenant();
  const { projectId } = await ctx.params;
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId: tenant.id } });
  if (!project) redirect(`/projects/${projectId}/compliance?error=not+found`);
  // Linking compliance requirements to company credentials is a PM/office
  // action — require an edit-capable role (pure viewers are read-only).
  if (!(await currentActor(tenant.id)).canEdit) {
    redirect(`/projects/${projectId}/compliance?error=Editor+role+required`);
  }

  const form = await req.formData();
  const requirementType = (form.get("requirementType") as string | null) ?? "";
  const requirementText = (form.get("requirementText") as string | null)?.trim() || null;
  const companyLicenseId = (form.get("companyLicenseId") as string | null) || null;
  const companyInsuranceId = (form.get("companyInsuranceId") as string | null) || null;
  const companyBondId = (form.get("companyBondId") as string | null) || null;
  const companyCertificationId = (form.get("companyCertificationId") as string | null) || null;

  // Verify the company-side resource belongs to the same tenant before
  // linking — prevents a malicious cross-tenant link via spoofed id.
  if (companyLicenseId) {
    const ok = await prisma.companyLicense.findFirst({ where: { id: companyLicenseId, tenantId: tenant.id }, select: { id: true } });
    if (!ok) redirect(`/projects/${projectId}/compliance?error=license+not+found`);
  }
  if (companyInsuranceId) {
    const ok = await prisma.companyInsurance.findFirst({ where: { id: companyInsuranceId, tenantId: tenant.id }, select: { id: true } });
    if (!ok) redirect(`/projects/${projectId}/compliance?error=insurance+not+found`);
  }
  if (companyBondId) {
    const ok = await prisma.companyBond.findFirst({ where: { id: companyBondId, tenantId: tenant.id }, select: { id: true } });
    if (!ok) redirect(`/projects/${projectId}/compliance?error=bond+not+found`);
  }
  if (companyCertificationId) {
    const ok = await prisma.companyCertification.findFirst({ where: { id: companyCertificationId, tenantId: tenant.id }, select: { id: true } });
    if (!ok) redirect(`/projects/${projectId}/compliance?error=certification+not+found`);
  }

  await prisma.projectComplianceLink.create({
    data: {
      projectId,
      requirementType,
      requirementText,
      companyLicenseId,
      companyInsuranceId,
      companyBondId,
      companyCertificationId,
      satisfied: !!(companyLicenseId || companyInsuranceId || companyBondId || companyCertificationId),
    },
  });
  redirect(`/projects/${projectId}/compliance?ok=Linked`);
}
