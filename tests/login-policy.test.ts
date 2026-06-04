/**
 * canUserLogin — "provisioned accounts only" gate with per-tenant external
 * opt-out. Exercises the real lib against the dev SQLite file (matching the
 * convention used by the other DB-touching tests — password-reset.test.ts,
 * tenant-isolation.test.ts). The lib uses the singleton prisma client which
 * points at prisma/dev.db, so the test seeds/reads that same file directly
 * via better-sqlite3.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";

import { canUserLogin } from "@/lib/auth/login-policy";

const dbFile = path.resolve(process.cwd(), "prisma", "dev.db");

function db() {
  const d = new Database(dbFile);
  d.pragma("foreign_keys = ON");
  return d;
}

const ts = Date.now();
const ids = {
  tenant: `lp-tenant-${ts}`,
  member: `lp-member-${ts}`,
  orphan: `lp-orphan-${ts}`,
  admin: `lp-admin-${ts}`,
  membership: `lp-m-${ts}`,
};

beforeEach(() => {
  const d = db();
  const now = new Date().toISOString();
  d.prepare(
    "INSERT INTO Tenant (id,name,slug,primaryMode,allowExternalEmailLogins,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)",
  ).run(ids.tenant, "LP Tenant", `lp-${ts}`, "VERTICAL", 0, now, now);
  const pw = bcrypt.hashSync("password1", 10);
  for (const [id, su] of [[ids.member, 0], [ids.orphan, 0], [ids.admin, 1]] as const) {
    d.prepare(
      "INSERT INTO User (id,name,email,password,active,superAdmin,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)",
    ).run(id, id, `${id}@example.test`, pw, 1, su, now, now);
  }
  // member has a membership; orphan + admin do not
  d.prepare(
    "INSERT INTO Membership (id,tenantId,userId,roleTemplate,createdAt) VALUES (?,?,?,?,?)",
  ).run(ids.membership, ids.tenant, ids.member, "VIEWER", now);
  d.close();
});

afterEach(() => {
  const d = db();
  d.prepare("DELETE FROM Membership WHERE tenantId = ?").run(ids.tenant);
  d.prepare("DELETE FROM Tenant WHERE id = ?").run(ids.tenant);
  for (const id of [ids.member, ids.orphan, ids.admin]) d.prepare("DELETE FROM User WHERE id = ?").run(id);
  d.close();
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
    const d = db();
    d.prepare("UPDATE Tenant SET allowExternalEmailLogins = 1 WHERE id = ?").run(ids.tenant);
    d.close();
    expect(await canUserLogin(ids.orphan, false)).toBe(true);
  });
});
