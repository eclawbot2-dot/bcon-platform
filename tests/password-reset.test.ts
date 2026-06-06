/**
 * Self-service password-reset flow: request (found / not-found) +
 * confirm (valid / expired / reused). The lib uses the singleton prisma
 * client AND (via requestPasswordReset) the persistent rate-limiter.
 * DATABASE_URL is pointed at the dedicated Postgres test DB and the rate
 * limiter at an isolated temp sidecar, so neither the dev database nor the
 * shared rate-limit store is touched. A freshPrisma client seeds/reads.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import { useTempDevDb, freshPrisma } from "./_db";

// Isolate the rate-limiter sidecar so this run's request throttling can't be
// poisoned by (or poison) other runs. Set BEFORE importing the lib.
const tmpRateDb = path.join(os.tmpdir(), `bcon-test-pwreset-rl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`);
process.env.RATE_LIMIT_DB_FILE = tmpRateDb;

// Bind DATABASE_URL to the test DB before the lib's prisma singleton loads.
const { cleanupFile } = useTempDevDb("password-reset");

let requestPasswordReset: typeof import("@/lib/auth/password-reset").requestPasswordReset;
let confirmPasswordReset: typeof import("@/lib/auth/password-reset").confirmPasswordReset;
let prisma: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ requestPasswordReset, confirmPasswordReset } = await import("@/lib/auth/password-reset"));
  ({ prisma, cleanup } = freshPrisma("password-reset"));
});

afterAll(async () => {
  await cleanup?.();
  cleanupFile();
  for (const suffix of ["", "-wal", "-shm"]) {
    try { fs.unlinkSync(tmpRateDb + suffix); } catch { /* ignore */ }
  }
});

const EMAIL = "pwreset-test@example.test";
let userId = "";

beforeEach(async () => {
  const u = await prisma.user.create({
    data: {
      name: "PW Reset Test",
      email: EMAIL,
      password: bcrypt.hashSync("oldpassword1", 10),
      active: true,
      superAdmin: false,
    },
  });
  userId = u.id;
});

afterEach(async () => {
  await prisma.passwordResetToken.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
});

describe("requestPasswordReset", () => {
  it("returns 'sent' and stores a hashed token for a known active email", async () => {
    const res = await requestPasswordReset({ email: EMAIL, ip: "1.2.3.4" });
    expect(res.status).toBe("sent");
    const row = await prisma.passwordResetToken.findFirst({
      where: { userId },
      select: { tokenHash: true, consumedAt: true },
    });
    expect(row).toBeTruthy();
    expect(row!.tokenHash).toMatch(/^[0-9a-f]{64}$/); // sha256 hex, not the raw token
    expect(row!.consumedAt).toBeNull();
  });

  it("returns 'not_found' for an unknown email (explicit product choice)", async () => {
    const res = await requestPasswordReset({ email: "nobody-" + Date.now() + "@example.test", ip: "1.2.3.5" });
    expect(res.status).toBe("not_found");
  });

  it("returns 'not_found' for an inactive user", async () => {
    await prisma.user.update({ where: { id: userId }, data: { active: false } });
    const res = await requestPasswordReset({ email: EMAIL, ip: "1.2.3.6" });
    expect(res.status).toBe("not_found");
  });
});

describe("confirmPasswordReset", () => {
  /** Mint a token the way the lib does, returning nothing (raw is the arg). */
  async function mintRawToken(raw: string, opts?: { expiresInMs?: number; consumed?: boolean }) {
    const hash = createHash("sha256").update(raw).digest("hex");
    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hash,
        expiresAt: new Date(Date.now() + (opts?.expiresInMs ?? 60 * 60 * 1000)),
        consumedAt: opts?.consumed ? new Date() : null,
      },
    });
  }

  it("sets a new password, bumps sessionsRevokedAt, and consumes the token", async () => {
    const raw = "raw-token-abc-" + Date.now();
    await mintRawToken(raw);
    const res = await confirmPasswordReset({ token: raw, password: "brandnewpass1" });
    expect(res.ok).toBe(true);
    const u = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { password: true, sessionsRevokedAt: true },
    });
    const tok = await prisma.passwordResetToken.findFirst({
      where: { userId },
      select: { consumedAt: true },
    });
    expect(bcrypt.compareSync("brandnewpass1", u.password!)).toBe(true);
    expect(u.sessionsRevokedAt).not.toBeNull(); // sessions invalidated
    expect(tok!.consumedAt).not.toBeNull(); // single-use
  });

  it("rejects a reused (already consumed) token", async () => {
    const raw = "raw-token-used-" + Date.now();
    await mintRawToken(raw, { consumed: true });
    const res = await confirmPasswordReset({ token: raw, password: "brandnewpass1" });
    expect(res.ok).toBe(false);
  });

  it("rejects an expired token", async () => {
    const raw = "raw-token-exp-" + Date.now();
    await mintRawToken(raw, { expiresInMs: -1000 });
    const res = await confirmPasswordReset({ token: raw, password: "brandnewpass1" });
    expect(res.ok).toBe(false);
  });

  it("rejects a too-short password", async () => {
    const raw = "raw-token-short-" + Date.now();
    await mintRawToken(raw);
    const res = await confirmPasswordReset({ token: raw, password: "short" });
    expect(res.ok).toBe(false);
  });

  it("rejects an unknown token", async () => {
    const res = await confirmPasswordReset({ token: "does-not-exist", password: "brandnewpass1" });
    expect(res.ok).toBe(false);
  });
});
