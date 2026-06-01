import { NextResponse } from "next/server";

/**
 * Build a 303-redirect response that works correctly behind a reverse proxy
 * (Cloudflare tunnel → localhost). `req.url` at the Next.js server reflects
 * the upstream origin, so a naive `new URL(path, req.url)` redirects the
 * browser to `localhost:3101` which the public client cannot resolve.
 *
 * Prefer X-Forwarded-Host / X-Forwarded-Proto (set by the tunnel), fall back
 * to the raw Host header, and finally to the origin of req.url.
 */
export function publicRedirect(req: Request, path: string, status: 302 | 303 | 307 | 308 = 303): NextResponse {
  const forwardedHost = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";
  const base = forwardedHost ? `${forwardedProto}://${forwardedHost}` : new URL(req.url).origin;
  const baseOrigin = new URL(base).origin;
  // Open-redirect guard. Several callers pass a user-controlled target
  // (the `referer` header, or a `redirect` form field). `new URL(path, base)`
  // happily resolves an absolute "https://evil.com" to that external origin,
  // so an attacker could craft a link/form that bounces an authenticated
  // user off-site. Resolve the target and, if it does not land on our own
  // origin, fall back to the site root.
  let location: string;
  try {
    const resolved = new URL(path, base);
    location = resolved.origin === baseOrigin ? resolved.toString() : `${baseOrigin}/`;
  } catch {
    location = `${baseOrigin}/`;
  }
  return NextResponse.redirect(location, { status });
}
