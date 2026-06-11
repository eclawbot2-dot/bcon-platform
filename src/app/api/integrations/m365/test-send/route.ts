import { requireTenant } from "@/lib/tenant";
import { requireAdmin } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { m365Configured, m365SendMail } from "@/lib/m365";
import { publicRedirect } from "@/lib/redirect";

/**
 * Admin-only test send through the Microsoft 365 (Graph) transport.
 * Always exercises the m365 path directly (regardless of EMAIL_TRANSPORT)
 * so an operator can verify the Azure app registration before switching
 * the platform transport over. Result is surfaced via query params on the
 * settings page.
 */
export async function POST(req: Request) {
  const tenant = await requireTenant();
  const actor = await requireAdmin(tenant.id);
  if (!m365Configured()) {
    return publicRedirect(req, "/settings/integrations?m365=not-configured", 303);
  }

  const form = await req.formData();
  const toRaw = String(form.get("to") ?? "").trim();
  const to = toRaw || actor.email || "";
  if (!to || !to.includes("@")) {
    return publicRedirect(req, "/settings/integrations?m365=no-recipient", 303);
  }

  let outcome: string;
  try {
    await m365SendMail({
      to: [to],
      subject: `bcon · Microsoft 365 test send (${tenant.slug})`,
      text:
        `This is a test message from bcon's Microsoft 365 (Graph) mail transport.\n` +
        `Tenant: ${tenant.name}\nRequested by: ${actor.userName}\nIf you received this, MS_* env configuration works.`,
    });
    outcome = "sent";
  } catch (err) {
    outcome = `failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200);
  }

  await recordAudit({
    tenantId: tenant.id,
    actorId: actor.userId,
    actorName: actor.userName,
    entityType: "Integration",
    entityId: "m365",
    action: "m365.test-send",
    after: { to, outcome },
    source: "settings/integrations",
  });

  const ok = outcome === "sent";
  return publicRedirect(
    req,
    `/settings/integrations?m365=${ok ? "sent" : "send-failed"}&detail=${encodeURIComponent(ok ? to : outcome)}`,
    303,
  );
}
