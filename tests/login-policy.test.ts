/**
 * canUserLogin — "provisioned accounts only" gate with per-tenant external
 * opt-out. Exercises the real lib against the dedicated Postgres test
 * database. The lib uses the singleton prisma client, so DATABASE_URL is
 * pointed at the test DB before the lib is imported, and a freshPrisma
 * client seeds/cleans uniquely-keyed rows for each test.
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { useTempDevDb, freshPrisma } from "./_db";

// Bind DATABASE_URL to the test DB BEFORE the lib (and its prisma singleton)
// is dynamically imported in beforeAll.
useTempDevDb("login-policy");

let canUserLogin: typeof import("@/lib/auth/login-policy").canUserLogin;
let prisma: PrismaClient;
let cleanup: () => Promise<void>;

let ids: { tenant: string; member: string; orphan: string; admin: string; membership: string };

beforeAll(async () => {
  ({ canUserLogin } = await import("@/lib/auth/login-policy"));
  ({ prisma, cleanup } = freshPrisma("login-policy"));
});

afterAll(async () => {
  await cleanup?.();
});

beforeEach(async () => {
  const ts = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  ids = {
    tenant: `lp-tenant-${ts}`,
    member: `lp-member-${ts}`,
    orphan: `lp-orphan-${ts}`,
    admin: `lp-admin-${ts}`,
    membership: `lp-m-${ts}`,
  };
  await prisma.tenant.create({
    data: {
      id: ids.tenant,
      name: "LP Tenant",
      slug: `lp-${ts}`,
      primaryMode: "VERTICAL",
      allowExternalEmailLogins: false,
    },
  });
  const pw = bcrypt.hashSync("password1", 10);
  for (const [id, su] of [[ids.member, false], [ids.orphan, false], [ids.admin, true]] as const) {
    await prisma.user.create({
      data: { id, name: id, email: `${id}@example.test`, password: pw, active: true, superAdmin: su },
    });
  }
  // member has a membership; orphan + admin do not
  await prisma.membership.create({
    data: { id: ids.membership, tenantId: ids.tenant, userId: ids.member, roleTemplate: "VIEWER" },
  });
});

afterEach(async () => {
  await prisma.membership.deleteMany({ where: { tenantId: ids.tenant } });
  await prisma.tenant.deleteMany({ where: { id: ids.tenant } });
  await prisma.user.deleteMany({ where: { id: { in: [ids.member, ids.orphan, ids.admin] } } });
});

describe("canUserLogin", () => {
  it("allows a super-admin even with no membership", async () => {
    expect(await canUserLogin(ids.admin, true)).toBe(true);
  });

  it("allows a provisioned member", async () => {
    expect(await canUserLogin(ids.member, false)).toBe(true);
  });

  it("denies an orphan (no membership) when no tenant allows external logins", async () => {
    expect(await canUserLogin(ids.orphan, false)).toBe(false);
  });

  it("allows an orphan once some tenant enables external logins", async () => {
    await prisma.tenant.update({ where: { id: ids.tenant }, data: { allowExternalEmailLogins: true } });
    expect(await canUserLogin(ids.orphan, false)).toBe(true);
  });
});
