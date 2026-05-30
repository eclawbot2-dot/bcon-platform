import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { actorIsManager } from "@/lib/permissions";
import { auth } from "@/lib/auth";
import { encryptSecret } from "@/lib/rfp-geo";
import { recordAudit } from "@/lib/audit";

/**
 * Save tenant LLM keys. The form submits openaiKey / anthropicKey
 * cleartext — the values are immediately encrypted with the tenant's
 * key-derivation salt before being persisted. Empty submission for a
 * field clears it (so customers can rotate or revoke). The actual
 * cleartext is never stored.
 *
 * requireTenant enforces tenant membership; actorIsManager restricts
 * this credential-management change to manager-class roles (viewers /
 * field roles cannot rotate or clear billing keys).
 *
 * CSRF protection: handled at the middleware layer
 * (src/middleware.ts) — every non-GET API request gets an
 * Origin/Host check before reaching the route handler.
 */
export async function POST(req: NextRequest) {
  const tenant = await requireTenant();
  if (!(await actorIsManager(tenant.id))) redirect("/settings?error=Manager+role+required");
  const form = await req.formData();
  const openai = (form.get("openaiKey") as string | null)?.trim() ?? "";
  const anthropic = (form.get("anthropicKey") as string | null)?.trim() ?? "";
  const preferred = (form.get("preferredProvider") as string | null) ?? "openai";

  // Empty string explicitly clears the key. Non-empty encrypts.
  // Existing keys are preserved when the field is empty AND the
  // "clear" box is unchecked.
  const clearOpenai = form.get("clearOpenai") === "1";
  const clearAnthropic = form.get("clearAnthropic") === "1";

  const data: Record<string, unknown> = {
    preferredProvider: preferred === "anthropic" ? "anthropic" : "openai",
  };
  if (clearOpenai) {
    data.openaiKeyEnc = null;
  } else if (openai) {
    data.openaiKeyEnc = encryptSecret(tenant.id, openai);
  }
  if (clearAnthropic) {
    data.anthropicKeyEnc = null;
  } else if (anthropic) {
    data.anthropicKeyEnc = encryptSecret(tenant.id, anthropic);
  }

  await prisma.tenant.update({ where: { id: tenant.id }, data });
  const session = await auth();
  await recordAudit({
    tenantId: tenant.id,
    actorId: session?.userId ?? null,
    actorName: session?.user?.name ?? null,
    entityType: "Tenant",
    entityId: tenant.id,
    action: "TENANT_LLM_KEYS_UPDATED",
    after: {
      openaiSet: !!data.openaiKeyEnc,
      anthropicSet: !!data.anthropicKeyEnc,
      preferredProvider: data.preferredProvider,
    },
    source: "settings/llm-keys",
  });
  redirect("/settings?llmKeysUpdated=1");
}
