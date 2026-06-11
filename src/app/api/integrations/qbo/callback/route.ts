import { requireTenant } from "@/lib/tenant";
import { requireAdmin } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { exchangeQboCode, saveQboConnection, fetchQboCompanyName, QBO_STATE_COOKIE } from "@/lib/integrations/qbo";
import { publicRedirect } from "@/lib/redirect";
import { prisma } from "@/lib/prisma";

/**
 * Intuit OAuth2 callback — validates the CSRF state cookie set by
 * /authorize, exchanges the code for tokens (stored vault-encrypted),
 * records the realm, and bounces back to Settings → Integrations with a
 * relative redirect (tunnel rule: never build absolute URLs off req.url).
 */
export async function GET(req: Request) {
  const tenant = await requireTenant();
  const actor = await requireAdmin(tenant.id);

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const realmId = url.searchParams.get("realmId");
  const oauthError = url.searchParams.get("error");

  const cookieHeader = req.headers.get("cookie") ?? "";
  const stateCookie = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${QBO_STATE_COOKIE}=`))
    ?.slice(QBO_STATE_COOKIE.length + 1);

  const fail = (reason: string) => {
    const res = publicRedirect(req, `/settings/integrations?qbo=error&reason=${encodeURIComponent(reason)}`, 303);
    res.cookies.set(QBO_STATE_COOKIE, "", { path: "/api/integrations/qbo", maxAge: 0 });
    return res;
  };

  if (oauthError) return fail(oauthError);
  if (!code || !realmId) return fail("missing code/realmId");
  if (!state || !stateCookie || state !== stateCookie) return fail("state mismatch");

  try {
    const tokens = await exchangeQboCode(code);
    await saveQboConnection({ tenantId: tenant.id, realmId, tokens });
    const companyName = await fetchQboCompanyName(tenant.id);
    if (companyName) {
      await prisma.qboConnection.update({
        where: { tenantId: tenant.id },
        data: { organizationName: companyName },
      });
    }
    await recordAudit({
      tenantId: tenant.id,
      actorId: actor.userId,
      actorName: actor.userName,
      entityType: "QboConnection",
      entityId: tenant.id,
      action: "qbo.oauth.connected",
      after: { realmId, organizationName: companyName ?? "QuickBooks Online" },
      source: "settings/integrations",
    });
  } catch (err) {
    return fail(err instanceof Error ? err.message.slice(0, 200) : "token exchange failed");
  }

  const res = publicRedirect(req, "/settings/integrations?qbo=connected", 303);
  res.cookies.set(QBO_STATE_COOKIE, "", { path: "/api/integrations/qbo", maxAge: 0 });
  return res;
}
