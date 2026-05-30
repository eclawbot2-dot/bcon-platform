import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { actorIsManager } from "@/lib/permissions";
import { sendEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const tenant = await requireTenant();
  if (!(await actorIsManager(tenant.id))) redirect("/settings/guests?error=Manager+role+required");
  const form = await req.formData();
  const email = (form.get("email") as string | null)?.trim().toLowerCase();
  // Email validation tighter than .includes("@") to block SMTP
  // header injection. Strict regex disallows whitespace (newlines,
  // CR, tabs that could smuggle "BCC:" / "Subject:" headers).
  // Length cap 254 per RFC 5321.
  if (!email || email.length > 254 || !/^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(email)) {
    redirect("/settings/guests?error=valid+email+required");
  }
  const name = ((form.get("name") as string | null)?.trim() || null)?.replace(/[\r\n]+/g, " ") ?? null;
  const role = (form.get("role") as string | null) ?? "OWNER_REVIEWER";

  // Generate magic-link token (24-hour TTL).
  const tokenRaw = crypto.randomBytes(24).toString("base64url");
  const tokenHash = await bcrypt.hash(tokenRaw, 10);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await prisma.guestAccount.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: email! } },
    create: {
      tenantId: tenant.id,
      email: email!,
      name,
      role,
      magicTokenHash: tokenHash,
      magicTokenExpiresAt: expiresAt,
    },
    update: {
      name,
      role,
      magicTokenHash: tokenHash,
      magicTokenExpiresAt: expiresAt,
      active: true,
    },
  });

  // Best-effort send; the magic link contains the unhashed token.
  const magicUrl = `${process.env.AUTH_URL ?? "https://bcon.jahdev.com"}/guest/login?email=${encodeURIComponent(email!)}&token=${tokenRaw}`;
  await sendEmail({
    to: email!,
    subject: `${tenant.name} invited you to Construction OS`,
    text: `${tenant.name} has shared project information with you on Construction OS.\n\nClick to sign in (link valid 24 hours):\n${magicUrl}`,
  });

  redirect("/settings/guests?ok=Invite+sent");
}
