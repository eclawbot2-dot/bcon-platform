import { NextResponse } from "next/server";
import { requireTenant } from "@/lib/tenant";
import { requireAdmin } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { buildQboAuthorizeUrl, newOauthState, qboEnvConfigured, QBO_STATE_COOKIE } from "@/lib/integrations/qbo";
import { publicRedirect } from "@/lib/redirect";

/**
 * Kick off the Intuit OAuth2 authorization-code flow. Admin-only.
 * A random `state` is set as an HttpOnly cookie and must round-trip
 * through Intuit back to /api/integrations/qbo/callback (CSRF guard).
 * The redirect URI comes from APP_URL — never from req.url (tunnel rule).
 */
export async function POST(req: Request) {
  const tenant = await requireTenant();
  const actor = await requireAdmin(tenant.id);

  if (!qboEnvConfigured()) {
    return publicRedirect(req, "/settings/integrations?qbo=not-configured", 303);
  }
  const state = newOauthState();
  const authorizeUrl = buildQboAuthorizeUrl(state);
  if (!authorizeUrl) {
    return publicRedirect(req, "/settings/integrations?qbo=missing-app-url", 303);
  }

  await recordAudit({
    tenantId: tenant.id,
    actorId: actor.userId,
    actorName: actor.userName,
    entityType: "QboConnection",
    entityId: tenant.id,
    action: "qbo.oauth.start",
    source: "settings/integrations",
  });

  // External redirect to Intuit is intentional — publicRedirect's
  // same-origin guard would (correctly) block it, so build it directly.
  const res = NextResponse.redirect(authorizeUrl, { status: 303 });
  res.cookies.set(QBO_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/api/integrations/qbo",
    maxAge: 600,
  });
  return res;
}
