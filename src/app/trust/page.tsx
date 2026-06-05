import Link from "next/link";

export const metadata = {
  title: "Trust & Security · Construction OS",
  description: "Security posture, audit guarantees, data residency, and compliance status for the Construction OS platform.",
};

/**
 * Public-facing trust center. Removes the procurement-review
 * bottleneck by surfacing security posture, audit guarantees, and
 * compliance roadmap WITHOUT a sales call. Buyers can link this page
 * directly into their vendor-review checklist.
 *
 * No auth — anyone with the URL can read it. Configured to be
 * indexable by search engines (no noindex meta).
 */
export default function TrustPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-10">
        <div className="text-xs uppercase tracking-[0.24em] text-cyan-300">Trust & security</div>
        <h1 className="mt-2 text-3xl font-semibold text-white">Construction OS — security posture</h1>
        <p className="mt-3 max-w-2xl text-slate-300">
          What we do to keep your project data, financial records, and bid pipeline safe.
          Last updated 2026-05-02.
        </p>
      </header>

      <Section title="Authentication & access">
        <ul>
          <li>NextAuth.js credentials provider with bcryptjs password hashing (12 rounds).</li>
          <li>JWT session strategy with 4-hour maxAge — re-authentication required after expiry.</li>
          <li>Role-based access control with named templates: <code>ADMIN</code>, <code>EXECUTIVE</code>, <code>MANAGER</code>, <code>PROJECT_ENGINEER</code>, <code>SUPERINTENDENT</code>, <code>FOREMAN</code>, <code>CONTROLLER</code>, <code>SAFETY_MANAGER</code>, <code>QUALITY_MANAGER</code>, <code>VIEWER</code>.</li>
          <li>Super-admin role gated separately and only granted by the platform owner.</li>
          <li>Sliding-window rate limiter on <code>/api/auth/*</code> to throttle brute-force attempts.</li>
          <li>SSO/SAML/SCIM scaffolding present; production wiring on request.</li>
        </ul>
      </Section>

      <Section title="Tenant isolation">
        <ul>
          <li>Every query against the data layer is scoped by <code>tenantId</code>. <code>requireTenant()</code> enforces this at the route boundary.</li>
          <li>Cross-tenant data leakage paths blocked by Prisma WHERE clauses; static analysis catches missed scopes during code review.</li>
          <li>The audit log tables include <code>tenantId</code> so even compliance evidence can&apos;t leak across customers.</li>
        </ul>
      </Section>

      <Section title="Audit logging">
        <ul>
          <li>Every state-changing action (create, update, delete) emits an <code>AuditEvent</code> with actor, entity, before/after, IP, timestamp.</li>
          <li>Tenant admins see their own audit log at <code>/settings/audit</code>; super admins see platform-wide at <code>/admin/audit</code>.</li>
          <li>Export to CSV available; events retained 365 days by default (configurable).</li>
          <li>Audit-prune cron has a 50,000-row safety cap to prevent silent log-wiping by a leaked secret.</li>
        </ul>
      </Section>

      <Section title="Data at rest">
        <ul>
          <li>Per-tenant secrets (LLM API keys, portal credentials) encrypted with AES-256-GCM using a key derived from a per-tenant salt + master vault key.</li>
          <li>Cleartext secrets are never persisted; only ciphertext lives in the DB.</li>
          <li>Local SQLite host today; Postgres-promotable schema for production scale-up.</li>
          <li>Data residency: US (single-region host).</li>
        </ul>
      </Section>

      <Section title="Backups & recovery">
        <ul>
          <li>Per-tenant nightly JSON dump with integrity check (parse-back validation).</li>
          <li>Optional mirror to OneDrive / Google Drive sync folder per tenant.</li>
          <li>RPO target: 24 hours. RTO target: 1 hour for a single-tenant restore.</li>
          <li>Backup status visible to the customer at <code>/settings</code> and to the platform owner at <code>/admin/tenants</code>.</li>
        </ul>
      </Section>

      <Section title="CSRF & XSS">
        <ul>
          <li>Edge middleware enforces Origin/Host check on every non-GET API request.</li>
          <li>Per-tenant LLM keys form has additional defense-in-depth Origin check.</li>
          <li>React&apos;s automatic JSX escaping covers stored content; user input is parameterized via Prisma (no raw SQL).</li>
          <li>CSV exports defang formula-injection leaders (<code>=</code>, <code>+</code>, <code>-</code>, <code>@</code>, tab) per OWASP guidance.</li>
        </ul>
      </Section>

      <Section title="AI provider posture">
        <ul>
          <li>Tenants may configure their own OpenAI / Anthropic API keys so AI usage bills directly to the customer&apos;s provider account.</li>
          <li>Per-tenant rate limit (60 calls/min) caps runaway loops; over-limit calls fall back to deterministic mock and warn.</li>
          <li>AI prompts and responses are logged in <code>AiRunLog</code> with tenant scope; not shared cross-tenant.</li>
          <li>No customer data is sent to a model provider unless ENABLE_LLM_CALLS is true and a key is configured.</li>
        </ul>
      </Section>

      <Section title="Compliance roadmap">
        <ul>
          <li>SOC 2 Type II — in scoping; sub-processor list and DPA available on request.</li>
          <li>Data Processing Addendum (DPA) and Master Service Agreement (MSA) available before contract.</li>
          <li>Penetration testing — annual external test planned post-SOC2.</li>
        </ul>
      </Section>

      <Section title="Reporting a vulnerability">
        <p>
          Security issues should be reported to <a href="mailto:security@bcon.jahdev.com" className="text-cyan-300 hover:underline">security@bcon.jahdev.com</a>.
          We acknowledge within 1 business day; safe-harbor for good-faith research; no public disclosure without coordination.
        </p>
      </Section>

      <footer className="mt-12 border-t border-white/10 pt-6 text-xs text-slate-500">
        <p>Have a procurement question this page didn&apos;t answer? Email <a href="mailto:hello@bcon.jahdev.com" className="text-cyan-300 hover:underline">hello@bcon.jahdev.com</a>.</p>
        <p className="mt-2">Back to <Link href="/" className="text-cyan-300 hover:underline">Construction OS</Link>.</p>
      </footer>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10 rounded-2xl border border-white/10 bg-slate-950/40 p-6">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <div className="mt-3 text-sm leading-7 text-slate-300 [&_ul]:mt-2 [&_ul]:space-y-1 [&_ul]:list-disc [&_ul]:pl-5 [&_code]:rounded [&_code]:bg-white/5 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs">
        {children}
      </div>
    </section>
  );
}
