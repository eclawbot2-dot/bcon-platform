/**
 * Self-service password-reset flow: request (found / not-found) +
 * confirm (valid / expired / reused) against the live dev SQLite file,
 * matching the convention used by the other DB-touching tests
 * (tenant-isolation.test.ts). The lib uses the singleton prisma client
 * which points at prisma/dev.db, so the test seeds/reads that same file
 * directly via better-sqlite3.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";

const dbFile = path.resolve(process.cwd(), "prisma", "dev.db");

// Import after env is settled.
import { requestPasswordReset, confirmPasswordReset } from "@/lib/auth/password-reset";

const EMAIL = "pwreset-test@example.test";
let userId = "";

function db() {
  const d = new Database(dbFile);
  d.pragma("foreign_keys = ON");
  return d;
}

beforeEach(async () => {
  const d = db();
  const id = "pwr-user-" + Date.now() + "-" + Math.floor(Math.random() * 1e6);
  const now = new Date().toISOString();
  d.prepare(
    "INSERT INTO User (id,name,email,password,active,superAdmin,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)",
  ).run(id, "PW Reset Test", EMAIL, bcrypt.hashSync("oldpassword1", 10), 1, 0, now, now);
  userId = id;
  d.close();
});

afterEach(() => {
  const d = db();
  d.prepare("DELETE FROM PasswordResetToken WHERE userId = ?").run(userId);
  d.prepare("DELETE FROM User WHERE id = ?").run(userId);
  d.close();
});

describe("requestPasswordReset", () => {
  it("returns 'sent' and stores a hashed token for a known active email", async () => {
    const res = await requestPasswordReset({ email: EMAIL, ip: "1.2.3.4" });
    expect(res.status).toBe("sent");
    const d = db();
    const row = d.prepare("SELECT tokenHash, consumedAt FROM PasswordResetToken WHERE userId = ?").get(userId) as
      | { tokenHash: string; consumedAt: string | null }
      | undefined;
    d.close();
    expect(row).toBeTruthy();
    expect(row!.tokenHash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex, not the raw token
    expect(row!.consumedAt).toBeNull();
  });

  it("returns 'not_found' for an unknown email (explicit product choice)", async () => {
    const res = await requestPasswordReset({ email: "nobody-" + Date.now() + "@example.test", ip: "1.2.3.5" });
    expect(res.status).toBe("not_found");
  });

  it("returns 'not_found' for an inactive user", async () => {
    const d = db();
    d.prepare("UPDATE User SET active = 0 WHERE id = ?").run(userId);
    d.close();
    const res = await requestPasswordReset({ email: EMAIL, ip: "1.2.3.6" });
    expect(res.status).toBe("not_found");
  });
});

describe("confirmPasswordReset", () => {
  /** Mint a token the way the lib does, returning nothing (raw is the arg). */
  function mintRawToken(raw: string, opts?: { expiresInMs?: number; consumed?: boolean }) {
    const d = db();
    const hash = createHash("sha256").update(raw).digest("hex");
    const exp = new Date(Date.now() + (opts?.expiresInMs ?? 60 * 60 * 1000)).toISOString();
    d.prepare(
      "INSERT INTO PasswordResetToken (id,userId,tokenHash,expiresAt,consumedAt,createdAt) VALUES (?,?,?,?,?,?)",
    ).run(
      "tok-" + Date.now() + "-" + Math.floor(Math.random() * 1e6),
      userId,
      hash,
      exp,
      opts?.consumed ? new Date().toISOString() : null,
      new Date().toISOString(),
    );
    d.close();
  }

  it("sets a new password, bumps sessionsRevokedAt, and consumes the token", async () => {
    const raw = "raw-token-abc-" + Date.now();
    mintRawToken(raw);
    const res = await confirmPasswordReset({ token: raw, password: "brandnewpass1" });
    expect(res.ok).toBe(true);
    const d = db();
    const u = d.prepare("SELECT password, sessionsRevokedAt FROM User WHERE id = ?").get(userId) as {
      password: string;
      sessionsRevokedAt: string | null;
    };
    const tok = d.prepare("SELECT consumedAt FROM PasswordResetToken WHERE userId = ?").get(userId) as {
      consumedAt: string | null;
    };
    d.close();
    expect(bcrypt.compareSync("brandnewpass1", u.password)).toBe(true);
    expect(u.sessionsRevokedAt).not.toBeNull(); // sessions invalidated
    expect(tok.consumedAt).not.toBeNull(); // single-use
  });

  it("rejects a reused (already consumed) token", async () => {
    const raw = "raw-token-used-" + Date.now();
    mintRawToken(raw, { consumed: true });
    const res = await confirmPasswordReset({ token: raw, password: "brandnewpass1" });
    expect(res.ok).toBe(false);
  });

  it("rejects an expired token", async () => {
    const raw = "raw-token-exp-" + Date.now();
    mintRawToken(raw, { expiresInMs: -1000 });
    const res = await confirmPasswordReset({ token: raw, password: "brandnewpass1" });
    expect(res.ok).toBe(false);
  });

  it("rejects a too-short password", async () => {
    const raw = "raw-token-short-" + Date.now();
    mintRawToken(raw);
    const res = await confirmPasswordReset({ token: raw, password: "short" });
    expect(res.ok).toBe(false);
  });

  it("rejects an unknown token", async () => {
    const res = await confirmPasswordReset({ token: "does-not-exist", password: "brandnewpass1" });
    expect(res.ok).toBe(false);
  });
});
