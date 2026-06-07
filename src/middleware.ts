import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { observeRequest, normalizePath } from "@/lib/metrics";
import { publicRedirect } from "@/lib/redirect";

/**
 * Edge-safe auth gate. Validates the NextAuth JWT cookie (session strategy:
 * "jwt") and either lets the request through, redirects to /login, or
 * returns 401 JSON for API routes.
 *
 * Per-tenant authorization, role checks, and AuditEvent emission still
 * happen inside individual route handlers — this middleware only guards
 * the trust boundary.
 */
export async function middleware(req: NextRequest) {
  const tStart = Date.now();
  // Only capture requests that middleware itself terminates (401/403/400).
  // Success-path requests pass through NextResponse.next() into the route
  // handler whose true status the middleware never sees — those get
  // captured by the per-handler withMetrics() wrapper instead.
  const finish = (res: NextResponse, captured: boolean = true): NextResponse => {
    if (captured) {
      const path = req.nextUrl.pathname;
      if (!path.startsWith("/_next") && !path.startsWith("/static")) {
        observeRequest({
          t: tStart,
          method: req.method,
          path: normalizePath(path),
          status: res.status,
          ms: Date.now() - tStart,
        });
      }
    }
    return res;
  };

  // Edge-level CSRF defense for state-mutating API routes. NextAuth's
  // session cookie defaults to SameSite=Lax which already blocks
  // most cross-site form posts, but a misconfigured cookie or proxy
  // could weaken that. Reject any non-GET/HEAD/OPTIONS API request
  // whose Origin header doesn't match Host. Origin missing is
  // allowed (some user-agents omit it on same-origin requests).
  // Cron routes are excluded by the matcher below — they use bearer
  // auth, not session cookies, and may be called from anywhere.
  if (req.nextUrl.pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("host");
    if (origin && host) {
      try {
        if (new URL(origin).host !== host) {
          return finish(withSecurityHeaders(NextResponse.json({ error: "cross-origin request blocked" }, { status: 403 })));
        }
      } catch {
        return finish(withSecurityHeaders(NextResponse.json({ error: "bad origin header" }, { status: 400 })));
      }
    }
  }

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    // `secureCookie` lets NextAuth pick the right cookie name (auto-prefixed
    // with `__Secure-` in production) and the matching encryption salt.
    // Pass-8 audit caught the prior version misusing `salt` (an encryption
    // salt) as a cookie-name override; the value happened to match the
    // default but the parameter was semantically wrong.
    secureCookie: process.env.NODE_ENV === "production",
  });

  if (token?.userId) {
    // Pass-through to the route handler. Don't record here — middleware
    // doesn't see the handler's final status. The handler records itself.
    return finish(withSecurityHeaders(NextResponse.next()), false);
  }

  const isApi = req.nextUrl.pathname.startsWith("/api/");
  if (isApi) {
    return finish(withSecurityHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 })));
  }

  // Build the login redirect against the PUBLIC host. Behind the Cloudflare
  // tunnel, deriving the target from `req.url` can resolve to the internal
  // origin (localhost:3101) which the browser can't reach — the same proxy
  // hazard the route handlers guard against. publicRedirect rebuilds against
  // the forwarded host (falling back to req.url origin in local dev). The
  // callbackUrl is a same-origin relative path; the login page re-validates
  // it with isSafeRedirect before honoring it.
  const callbackUrl = req.nextUrl.pathname + req.nextUrl.search;
  const loginPath = `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  return finish(withSecurityHeaders(publicRedirect(req, loginPath, 307)));
}

/**
 * Stamp baseline security response headers — applied to every
 * authenticated response that flows through middleware.
 *
 *   Strict-Transport-Security: 1y + subdomains. Browsers refuse
 *     downgrades to HTTP for the duration.
 *   X-Content-Type-Options: nosniff. Browsers won't override the
 *     server's content-type with a guessed one.
 *   X-Frame-Options: SAMEORIGIN. Click-jacking defense. (Modern
 *     equivalent CSP frame-ancestors is also fine; this works in
 *     more browsers + proxies.)
 *   Referrer-Policy: strict-origin-when-cross-origin. Doesn't leak
 *     query-string contents to outbound links / external resources.
 *   Permissions-Policy: minimal allowlist (camera, microphone,
 *     geolocation, etc. for the photo + dictation features).
 */
function withSecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  res.headers.set("x-content-type-options", "nosniff");
  res.headers.set("x-frame-options", "SAMEORIGIN");
  res.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  res.headers.set("permissions-policy", "camera=(self), microphone=(self), geolocation=(self)");
  return res;
}

export const config = {
  // Run on every path EXCEPT:
  //   /login                — the login page itself
  //   /api/auth/*           — NextAuth's own routes (sign in/out, callbacks)
  //   /api/cron/*           — cron handler does its own bearer-token check
  //   /_next/* and assets   — Next.js internals and static files
  //   /favicon.ico, /robots.txt, /sitemap.xml — public surface
  //   anything with a file extension — public/ assets like *.svg, *.png
  matcher: [
    "/((?!login|trust|api/auth|api/cron|api/health|api/v1|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.[a-zA-Z0-9]+$).*)",
  ],
};
