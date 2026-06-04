/**
 * Login access policy — "provisioned accounts only" with a per-tenant
 * opt-out.
 *
 * Rule (enforced at authentication time in src/lib/auth.ts):
 *   - Platform super-admins may always log in.
 *   - A user provisioned into the platform — i.e. holding a Membership in
 *     at least one tenant — may log in (they're what the platform is built
 *     for).
 *   - Any other authenticated email (a provisioned User row with NO tenant
 *     membership — an external/orphan account) is denied UNLESS at least
 *     one tenant has opted in via "Allow External Email Logins"
 *     (Tenant.allowExternalEmailLogins). That box is OFF by default, so the
 *     default posture is: only members + super-admins get in.
 *
 * This composes with the existing credentials check (an unknown email never
 * authenticates in the first place) to guarantee no non-provisioned email
 * reaches the app.
 */
import { prisma } from "@/lib/prisma";

export async function canUserLogin(userId: string, superAdmin: boolean): Promise<boolean> {
  if (superAdmin) return true;

  const membership = await prisma.membership.findFirst({
    where: { userId },
    select: { id: true },
  });
  if (membership) return true;

  // No membership: only allowed if some tenant explicitly permits external logins.
  const externalTenant = await prisma.tenant.findFirst({
    where: { allowExternalEmailLogins: true },
    select: { id: true },
  });
  return !!externalTenant;
}
