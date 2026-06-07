import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { publicRedirect } from "@/lib/redirect";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const slug = String(form.get("slug") ?? "").trim();
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  // Super-admins may switch to any tenant; everyone else must be a member.
  const tenant = session.superAdmin
    ? await prisma.tenant.findUnique({ where: { slug } })
    : await prisma.tenant.findFirst({
        where: { slug, memberships: { some: { userId: session.userId } } },
      });
  if (!tenant) return NextResponse.json({ error: "not found" }, { status: 404 });

  const redirectTo = String(form.get("redirect") ?? "/") || "/";

  // Running behind Cloudflare tunnel — req.url reports the upstream origin
  // (e.g. http://localhost:3101), so publicRedirect rebuilds the target
  // against the forwarded public host. It ALSO enforces the open-redirect
  // guard: `redirect` is a user-controlled form field, so an attacker could
  // otherwise pass an absolute "https://evil.com" and bounce a signed-in
  // user off-site after the cookie is set. publicRedirect falls back to the
  // site root for any cross-origin target.
  const res = publicRedirect(req, redirectTo, 303);
  res.cookies.set("cx.tenant", slug, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}
