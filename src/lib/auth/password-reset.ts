/**
 * Self-service password reset — core logic (transport-agnostic).
 *
 * Flow:
 *   1. requestPasswordReset({ email }) — if the email belongs to an
 *      active user, mint a single-use token (raw emailed, only the
 *      SHA-256 hash stored), invalidate any prior live tokens, and email
 *      a reset link. Returns { status: "sent" }. If no such user exists,
 *      returns { status: "not_found" } (the product chose an explicit
 *      "email not found" message over anti-enumeration silence).
 *   2. confirmPasswordReset({ token, password }) — validate the raw token
 *      against a live (unconsumed, unexpired) row, set the new bcrypt
 *      hash, consume the token, and bump sessionsRevokedAt so every
 *      existing JWT for that user is invalidated.
 *
 * Tokens: 32 random bytes, base64url. Stored as sha256(raw) hex.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { consumeRateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/log";

export const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
export const MIN_PASSWORD_LENGTH = 8;

export type RequestResult = { status: "sent" | "not_found" | "rate_limited" };
export type ConfirmResult = { ok: true } | { ok: false; error: string };

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Build the absolute reset URL. Prefer the configured app URL so the link
 * is correct behind the tunnel; fall back to the request origin.
 */
function resetUrl(rawToken: string, origin?: string): string {
  const base =
    process.env.AUTH_URL ??
    process.env.NEXTAUTH_URL ??
    process.env.APP_URL ??
    origin ??
    "";
  const u = `${base.replace(/\/$/, "")}/login/reset-password/confirm?token=${encodeURIComponent(rawToken)}`;
  return u;
}

export async function requestPasswordReset(input: {
  email: string;
  ip?: string;
  origin?: string;
}): Promise<RequestResult> {
  const email = normalizeEmail(input.email);
  if (!email) return { status: "not_found" };

  // Throttle by IP to bound abuse / enumeration scraping: 10 / 15 min.
  const rl = consumeRateLimit(`pwreset:${input.ip ?? "?"}`, { limit: 10, windowMs: 15 * 60 * 1000 });
  if (!rl.allowed) return { status: "rate_limited" };

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, active: true },
  });
  if (!user || !user.active) {
    return { status: "not_found" };
  }

  // Invalidate the user's prior live tokens, then mint a fresh one.
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt, requestIp: input.ip ?? null },
    }),
  ]);

  const link = resetUrl(rawToken, input.origin);
  const send = await sendEmail({
    to: user.email,
    subject: "Reset your password",
    text:
      `Hi ${user.name},\n\n` +
      `We received a request to reset your password. Use the link below within the next hour:\n\n` +
      `${link}\n\n` +
      `If you didn't request this, you can ignore this email — your password won't change.\n`,
    html:
      `<p>Hi ${escapeHtml(user.name)},</p>` +
      `<p>We received a request to reset your password. Use the link below within the next hour:</p>` +
      `<p><a href="${link}">Reset your password</a></p>` +
      `<p style="color:#64748b;font-size:12px">If you didn't request this, you can ignore this email — your password won't change.</p>`,
  });
  if (!send.ok) {
    log.warn("password-reset email failed to send", { module: "auth", transport: send.transport });
  }
  return { status: "sent" };
}

export async function confirmPasswordReset(input: {
  token: string;
  password: string;
}): Promise<ConfirmResult> {
  const raw = (input.token ?? "").trim();
  const password = input.password ?? "";
  if (!raw) return { ok: false, error: "Invalid or expired reset link." };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  const tokenHash = hashToken(raw);
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true, consumedAt: true, tokenHash: true },
  });
  // Constant-ish comparison guard (findUnique already matched the hash;
  // this defends against any future non-unique lookup path).
  const lookupOk =
    !!row && safeEqualHex(row.tokenHash, tokenHash) && !row.consumedAt && row.expiresAt.getTime() > Date.now();
  if (!row || !lookupOk) {
    return { ok: false, error: "Invalid or expired reset link." };
  }

  const hashed = await bcrypt.hash(password, 10);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      // Bumping sessionsRevokedAt invalidates every JWT issued before now
      // (enforced in src/lib/auth.ts jwt callback), forcing re-auth.
      data: { password: hashed, sessionsRevokedAt: new Date() },
    }),
    prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    }),
    // Belt-and-suspenders: consume any other live tokens for this user.
    prisma.passwordResetToken.updateMany({
      where: { userId: row.userId, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
  ]);
  log.info("password reset completed", { module: "auth", userId: row.userId });
  return { ok: true };
}

function safeEqualHex(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    return ab.length === bb.length && timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch,
  );
}
