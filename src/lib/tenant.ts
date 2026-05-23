import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

const COOKIE = "cx.tenant";

/** Read the active tenant slug from the cookie. */
export async function currentTenantSlug(): Promise<string | null> {
  try {
    const store = await cookies();
    return store.get(COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve the active tenant for the current request.
 *
 * Behaviour:
 * - Unauthenticated callers always receive `null` (no tenant defaulting).
 * - Super-admins may select any tenant via the `cx.tenant` cookie; if no
 *   cookie is set they fall back to the oldest tenant (pure convenience).
 * - Regular users may only select tenants where they have a membership.
 *   An invalid or stale cookie value silently falls back to the user's
 *   first membership, so revoking a membership does not strand the user.
 */
export async function getCurrentTenant() {
  const session = await auth();
  if (!session?.userId) return null;

  const slug = await currentTenantSlug();

  if (session.superAdmin) {
    if (slug) {
      const t = await prisma.tenant.findUnique({ where: { slug } });
      if (t) return t;
    }
    const defaultSlug = process.env.DEFAULT_TENANT_SLUG;
    if (defaultSlug) {
      const t = await prisma.tenant.findUnique({ where: { slug: defaultSlug } });
      if (t) return t;
    }
    return prisma.tenant.findFirst({ orderBy: { createdAt: "asc" } });
  }

  if (slug) {
    const t = await prisma.tenant.findFirst({
      where: {
        slug,
        memberships: { some: { userId: session.userId } },
      },
    });
    if (t) return t;
  }

  const m = await prisma.membership.findFirst({
    where: { userId: session.userId },
    include: { tenant: true },
    orderBy: { createdAt: "asc" },
  });
  return m?.tenant ?? null;
}

/** Shortcut that throws if no tenant is configured for the current caller. */
export async function requireTenant() {
  const tenant = await getCurrentTenant();
  if (!tenant) throw new Error("No tenant configured");
  return tenant;
}

/**
 * List tenants visible to the current user (memberships only). Super-admins
 * see every tenant. Used by the tenant switcher.
 */
export async function listTenants() {
  const session = await auth();
  if (!session?.userId) return [];

  if (session.superAdmin) {
    return prisma.tenant.findMany({ orderBy: { name: "asc" } });
  }

  return prisma.tenant.findMany({
    where: { memberships: { some: { userId: session.userId } } },
    orderBy: { name: "asc" },
  });
}
