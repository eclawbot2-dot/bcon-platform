import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import type { UserRoleTemplate } from "@prisma/client";

const ACTOR_COOKIE = "cx.actor";

export async function currentSuperAdmin(): Promise<{ userId: string; name: string; email: string | null } | null> {
  const session = await auth();
  if (!session?.userId || !session.superAdmin) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, superAdmin: true, active: true },
  });
  if (!user || !user.active || !user.superAdmin) return null;
  return { userId: user.id, name: user.name, email: user.email };
}

export async function requireSuperAdmin() {
  const admin = await currentSuperAdmin();
  if (!admin) throw new Error("Super-admin privileges required.");
  return admin;
}

/**
 * Role tiers used across approval flows.
 *
 * MANAGER_ROLES — may approve / reject submissions (timesheets, change
 *   orders, pay apps, RFIs, submittals, safety incidents, contracts).
 * EDIT_ROLES    — may edit a record regardless of the submitter.
 * VIEWER_ROLES  — read-only.
 */
export const MANAGER_ROLES: UserRoleTemplate[] = [
  "ADMIN",
  "EXECUTIVE",
  "MANAGER",
  "PROGRAM_MANAGER",
  "CONTROLLER",
  "SUPERINTENDENT",
  "SAFETY_MANAGER",
  "QUALITY_MANAGER",
];

export const EDIT_ROLES: UserRoleTemplate[] = [
  ...MANAGER_ROLES,
  "PROJECT_ENGINEER",
  "FOREMAN",
  "COORDINATOR",
];

export type CurrentActor = {
  userId: string | null;
  userName: string;
  email: string | null;
  role: UserRoleTemplate | null;
  isManager: boolean;
  canEdit: boolean;
};

const ANONYMOUS_ACTOR: CurrentActor = {
  userId: null,
  userName: "Unknown user",
  email: null,
  role: null,
  isManager: false,
  canEdit: false,
};

/**
 * Resolve the current acting user for the active tenant.
 *
 * Identity comes from the authenticated NextAuth session — there is no
 * fallback for unauthenticated callers. Super-admins may impersonate any
 * user in any tenant by setting the `cx.actor` cookie to the target user's
 * id or email; for non-super-admin callers the cookie is ignored.
 *
 * Returns the empty `ANONYMOUS_ACTOR` (role=null, isManager=false,
 * canEdit=false) when the caller is unauthenticated or has no membership in
 * the requested tenant. Callers that mutate state must check `isManager` /
 * `canEdit` and reject anonymous actors explicitly.
 */
export async function currentActor(tenantId: string): Promise<CurrentActor> {
  const session = await auth();
  if (!session?.userId) return ANONYMOUS_ACTOR;

  let actorUserId = session.userId;

  if (session.superAdmin) {
    const store = await cookies().catch(() => null);
    const impersonate = store?.get(ACTOR_COOKIE)?.value ?? null;
    if (impersonate) {
      const target = await prisma.user.findFirst({
        where: { active: true, OR: [{ id: impersonate }, { email: impersonate }] },
        select: { id: true },
      });
      if (target) actorUserId = target.id;
    }
  }

  const membership = await prisma.membership.findFirst({
    where: { tenantId, userId: actorUserId },
    include: { user: { select: { id: true, name: true, email: true, active: true } } },
  });

  if (membership && membership.user.active) {
    const role = membership.roleTemplate;
    return {
      userId: membership.user.id,
      userName: membership.user.name,
      email: membership.user.email,
      role,
      isManager: MANAGER_ROLES.includes(role),
      canEdit: EDIT_ROLES.includes(role),
    };
  }

  // Super-admins acting as themselves get implicit ADMIN-equivalent rights
  // in any tenant, even without a membership row.
  if (session.superAdmin && actorUserId === session.userId) {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, name: true, email: true, active: true },
    });
    if (user?.active) {
      return {
        userId: user.id,
        userName: user.name,
        email: user.email,
        role: "ADMIN",
        isManager: true,
        canEdit: true,
      };
    }
  }

  return ANONYMOUS_ACTOR;
}

export function isManagerRole(role: UserRoleTemplate | null | undefined): boolean {
  return !!role && MANAGER_ROLES.includes(role);
}

/**
 * Non-throwing manager check for redirect-style form-post handlers that
 * can't easily wrap a thrown error in a 403 response. Returns true when
 * the current actor holds a manager-class role in this tenant.
 */
export async function actorIsManager(tenantId: string): Promise<boolean> {
  const actor = await currentActor(tenantId);
  return actor.isManager;
}

export function canEditRole(role: UserRoleTemplate | null | undefined): boolean {
  return !!role && EDIT_ROLES.includes(role);
}

/**
 * Throw if the current actor cannot perform a manager-gated mutation.
 * Use as a one-liner at the top of any POST/PATCH/DELETE handler that
 * changes state requiring approval-class authority.
 */
export async function requireManager(tenantId: string): Promise<CurrentActor> {
  const actor = await currentActor(tenantId);
  if (!actor.isManager) throw new Error("Manager-level role required.");
  return actor;
}

/**
 * Throw if the current actor cannot edit records in this tenant.
 */
export async function requireEditor(tenantId: string): Promise<CurrentActor> {
  const actor = await currentActor(tenantId);
  if (!actor.canEdit) throw new Error("Editor-level role required.");
  return actor;
}

/**
 * Throw if there is no authenticated actor with a membership in this
 * tenant. Use for any mutation that should be unavailable to anonymous
 * callers regardless of role.
 */
export async function requireActor(tenantId: string): Promise<CurrentActor> {
  const actor = await currentActor(tenantId);
  if (!actor.userId) throw new Error("Authentication required.");
  return actor;
}

/**
 * True only for the tenant ADMIN role (or a super-admin acting as themselves,
 * which currentActor resolves to role="ADMIN"). Distinct from `isManager`,
 * which spans EXECUTIVE/CONTROLLER/SUPERINTENDENT/etc. — used to gate the
 * workspace-transparency mail feature, which reads employees' mail and must be
 * locked down to the tenant administrator alone.
 */
export function isAdminRole(role: UserRoleTemplate | null | undefined): boolean {
  return role === "ADMIN";
}

export async function actorIsAdmin(tenantId: string): Promise<boolean> {
  const actor = await currentActor(tenantId);
  return isAdminRole(actor.role);
}

/** Throw unless the current actor is the tenant ADMIN. */
export async function requireAdmin(tenantId: string): Promise<CurrentActor> {
  const actor = await currentActor(tenantId);
  if (!isAdminRole(actor.role)) throw new Error("Admin role required.");
  return actor;
}
