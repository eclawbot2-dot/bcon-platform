import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireTenant } from "@/lib/tenant";
import { actorIsManager } from "@/lib/permissions";
import { auth } from "@/lib/auth";
import { issueApiToken } from "@/lib/api-token";
import { recordAudit } from "@/lib/audit";

/**
 * Issue a new API token. The full secret is shown EXACTLY ONCE on the
 * redirect target page. To avoid leaking it via URL (browser history,
 * server logs, referer headers), we stash it in a short-lived
 * HttpOnly cookie that the next render reads and clears. URL stays
 * clean.
 */
export async function POST(req: NextRequest) {
  const tenant = await requireTenant();
  if (!(await actorIsManager(tenant.id))) redirect("/settings/api?error=Manager+role+required");
  const form = await req.formData();
  const name = (form.get("name") as string | null)?.trim();
  if (!name) redirect("/settings/api?error=name+required");
  const scopes = ((form.get("scopes") as string | null) ?? "")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const session = await auth();
  const issued = await issueApiToken({ tenantId: tenant.id, name: name!, scopes, createdById: session?.userId });

  await recordAudit({
    tenantId: tenant.id,
    actorId: session?.userId ?? null,
    actorName: session?.user?.name ?? null,
    entityType: "ApiToken",
    entityId: issued.id,
    action: "API_TOKEN_ISSUED",
    after: { name: name!, prefix: issued.prefix, scopes },
    source: "settings/api",
  });

  const jar = await cookies();
  jar.set({
    name: "bcon-issued-token",
    value: issued.fullToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 5 * 60,
    path: "/settings/api",
  });

  redirect("/settings/api?ok=Token+issued");
}
