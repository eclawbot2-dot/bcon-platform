/**
 * Transactional email transport. Pluggable: Resend, SendGrid, or SMTP
 * via Nodemailer-equivalent. Picks based on env vars.
 *
 *   EMAIL_TRANSPORT=resend  (RESEND_API_KEY, EMAIL_FROM)
 *   EMAIL_TRANSPORT=sendgrid (SENDGRID_API_KEY, EMAIL_FROM)
 *   EMAIL_TRANSPORT=m365    (MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET,
 *                            MS_SENDER_UPN — Microsoft Graph sendMail,
 *                            app-only; see src/lib/m365.ts)
 *   EMAIL_TRANSPORT=smtp    (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM)
 *   (default — log only, no actual send)
 *
 * sendEmail() never throws — failures log a warn + return ok=false so
 * callers can handle. For batched delivery (digests, notification
 * fan-out), call sendEmail in a loop; the transports are async and
 * tolerant.
 */

import { log } from "@/lib/log";

export type EmailMessage = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
};

/**
 * In production the default "log" transport silently DROPS every email —
 * password resets, guest/portal invites, alert notifications — while reporting
 * success. That is a data-loss / lockout class of bug. This module defends
 * against it on two layers:
 *   - boot/CI: src/lib/env-guard.ts `assertDeliveryTransports` throws if
 *     EMAIL_TRANSPORT is log (or unset) in production (runs at import, so a
 *     misconfigured prod build fails fast). env-guard owns boot enforcement so
 *     this module isn't pulled into the guard's import graph.
 *   - runtime: sendEmail() (below) returns ok:false for a log send in
 *     production so a caller (e.g. password reset) surfaces a real failure
 *     instead of pretending the mail went out.
 * Both are no-ops outside production so dev/CI keep their log-only default.
 */
export function isLogTransport(transport: string): boolean {
  return transport === "log";
}

export async function sendEmail(msg: EmailMessage): Promise<{ ok: boolean; transport: string; id?: string; error?: string }> {
  const transport = (process.env.EMAIL_TRANSPORT ?? "log").toLowerCase();
  const from = process.env.EMAIL_FROM ?? "no-reply@bcon.local";
  try {
    if (transport === "resend") return await sendViaResend(msg, from);
    if (transport === "sendgrid") return await sendViaSendgrid(msg, from);
    if (transport === "m365") return await sendViaM365(msg);
    if (transport === "smtp") return await sendViaSmtp(msg, from);
    // log-only transport (explicit "log" or any unrecognized value). In
    // production this is a misconfiguration — the email is NOT sent — so fail
    // loud (ok:false) rather than report a false success.
    if (!isLogTransport(transport)) {
      log.warn("unknown EMAIL_TRANSPORT; falling back to log behavior", { module: "email", transport });
    }
    if (process.env.NODE_ENV === "production") {
      log.error("email NOT sent: log-only transport in production", { module: "email", to: msg.to, subject: msg.subject });
      return { ok: false, transport: "log", error: "EMAIL_TRANSPORT=log drops mail in production; configure a real transport" };
    }
    log.info("email (log-only transport)", { module: "email", to: msg.to, subject: msg.subject });
    return { ok: true, transport: "log" };
  } catch (err) {
    log.warn("email send failed", { module: "email", transport, to: msg.to }, err);
    return { ok: false, transport, error: err instanceof Error ? err.message : String(err) };
  }
}

async function sendViaResend(msg: EmailMessage, from: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY missing");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from,
      to: arr(msg.to),
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
      cc: msg.cc ? arr(msg.cc) : undefined,
      bcc: msg.bcc ? arr(msg.bcc) : undefined,
      reply_to: msg.replyTo,
    }),
  });
  if (!res.ok) throw new Error(`resend ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { id?: string };
  return { ok: true, transport: "resend", id: json.id };
}

async function sendViaSendgrid(msg: EmailMessage, from: string) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) throw new Error("SENDGRID_API_KEY missing");
  const personalizations = [{ to: arr(msg.to).map((email) => ({ email })) }];
  const content: Array<{ type: string; value: string }> = [];
  if (msg.text) content.push({ type: "text/plain", value: msg.text });
  if (msg.html) content.push({ type: "text/html", value: msg.html });
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      personalizations,
      from: { email: from },
      subject: msg.subject,
      content,
    }),
  });
  if (!res.ok) throw new Error(`sendgrid ${res.status} ${await res.text()}`);
  return { ok: true, transport: "sendgrid", id: res.headers.get("x-message-id") ?? undefined };
}

async function sendViaM365(msg: EmailMessage): Promise<{ ok: boolean; transport: string; id?: string }> {
  // Microsoft Graph sendMail (app-only). The "from" address is the
  // configured MS_SENDER_UPN mailbox — EMAIL_FROM is not used here because
  // Graph app-only sends always originate from a real tenant mailbox.
  // Lazy import keeps the Graph client out of the bundle for deployments
  // that never enable this transport.
  const { m365SendMail } = await import("@/lib/m365");
  const result = await m365SendMail({
    to: arr(msg.to),
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
    cc: msg.cc ? arr(msg.cc) : undefined,
    bcc: msg.bcc ? arr(msg.bcc) : undefined,
    replyTo: msg.replyTo,
  });
  return { ok: true, transport: "m365", id: result.id };
}

async function sendViaSmtp(_msg: EmailMessage, _from: string): Promise<{ ok: boolean; transport: string; error?: string }> {
  // Native SMTP without nodemailer is non-trivial. Returning a
  // structured failure rather than throwing so callers don't crash
  // if EMAIL_TRANSPORT is misconfigured to "smtp" at runtime — they
  // get { ok: false } and can fall back. Wire nodemailer here when
  // an operator actually wants SMTP.
  return { ok: false, transport: "smtp", error: "smtp transport not wired; install nodemailer and replace this stub" };
}

function arr(v: string | string[]): string[] {
  return Array.isArray(v) ? v : [v];
}
