import { signOut } from "@/lib/auth";
import { publicRedirect } from "@/lib/redirect";

/**
 * Sign-out endpoint that also clears our app-specific cookies (cx.tenant,
 * cx.actor, cx.superAdmin) alongside the NextAuth session.
 *
 * Pass-8 audit: NextAuth's default sign-out only invalidates its own
 * session cookie. Our impersonation + active-tenant cookies persist,
 * which is harmless while the next user is unauthenticated (middleware
 * still redirects them to /login) but becomes wrong the moment a
 * different user signs in on the same browser — they inherit the
 * previous user's tenant context.
 */
export async function POST(req: Request) {
  await signOut({ redirect: false });

  // Behind the Cloudflare tunnel `req.url` reports the internal origin
  // (localhost:3101); a naive new URL("/login", req.url) would 303 the
  // browser to a host it can't resolve. publicRedirect rebuilds the
  // target against the forwarded public host.
  const res = publicRedirect(req, "/login", 303);
  res.cookies.delete("cx.tenant");
  res.cookies.delete("cx.actor");
  res.cookies.delete("cx.superAdmin");
  return res;
}
