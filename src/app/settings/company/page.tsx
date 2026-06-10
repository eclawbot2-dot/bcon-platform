import { AppLayout } from "@/components/layout/app-layout";
import { SortableTable } from "@/components/SortableTable";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toNum } from "@/lib/money";

/**
 * Company compliance dashboard — tenant-admin only repository for the
 * company's own licensing, insurance, bonding, certifications, and
 * safety record. Distinct from Vendor* records (those are subs).
 *
 * Counts expiring-within-60-days items at the top so admins see what
 * needs renewal. Per-project linkage via /projects/[id]/compliance
 * for which company records cover which job.
 */
export default async function CompanyCompliancePage() {
  const tenant = await requireTenant();
  const soon = new Date();
  soon.setDate(soon.getDate() + 60);

  const [profile, licenses, insurances, bonds, certifications, safetyMetrics] = await Promise.all([
    prisma.companyProfile.findUnique({ where: { tenantId: tenant.id } }),
    prisma.companyLicense.findMany({ where: { tenantId: tenant.id }, orderBy: [{ status: "asc" }, { expiresAt: "asc" }] }),
    prisma.companyInsurance.findMany({ where: { tenantId: tenant.id }, orderBy: [{ status: "asc" }, { expiresAt: "asc" }] }),
    prisma.companyBond.findMany({ where: { tenantId: tenant.id }, orderBy: [{ status: "asc" }, { expiresAt: "asc" }], include: { project: true } }),
    prisma.companyCertification.findMany({ where: { tenantId: tenant.id }, orderBy: [{ status: "asc" }, { expiresAt: "asc" }] }),
    prisma.companySafetyMetric.findMany({ where: { tenantId: tenant.id }, orderBy: { reportingYear: "desc" } }),
  ]);

  const expiringLicenses = licenses.filter((l) => l.expiresAt && l.expiresAt < soon).length;
  const expiringInsurance = insurances.filter((i) => i.expiresAt < soon).length;
  const expiringBonds = bonds.filter((b) => b.expiresAt && b.expiresAt < soon).length;
  const expiringCerts = certifications.filter((c) => c.expiresAt && c.expiresAt < soon).length;

  const aggregateBondCapacity = bonds.find((b) => b.bondNumber == null && b.bondType.includes("PAYMENT"))?.capacityAggregate ?? 0;
  const singleBondCapacity = bonds.find((b) => b.bondNumber == null && b.bondType.includes("PAYMENT"))?.capacitySingle ?? 0;
  const latestEmr = safetyMetrics[0]?.emrRate;
  const latestTrir = safetyMetrics[0]?.trirRate;

  return (
    <AppLayout
      eyebrow="Settings · Company"
      title="Company compliance"
      description="Your company's licensing, insurance, bonding, certifications, and safety record. Surfaced per-project under /projects/[id]/compliance."
    >
      <div className="grid gap-6">
        <section className="grid gap-4 md:grid-cols-4">
          <Tile label="Expiring soon (60d)" value={expiringLicenses + expiringInsurance + expiringBonds + expiringCerts} tone={(expiringLicenses + expiringInsurance + expiringBonds + expiringCerts) > 0 ? "warn" : "good"} sub="Licenses + COIs + Bonds + Certs" />
          <Tile label="Bonding capacity (agg)" value={formatCurrency(aggregateBondCapacity)} sub={`single project max: ${formatCurrency(singleBondCapacity)}`} />
          <Tile label="EMR (current year)" value={latestEmr != null ? latestEmr.toFixed(2) : "—"} tone={latestEmr != null && latestEmr > 1 ? "warn" : "good"} />
          <Tile label="TRIR" value={latestTrir != null ? latestTrir.toFixed(2) : "—"} sub="per 200k labor hours" />
        </section>

        {!profile ? (
          <section className="card p-6 border-amber-500/40 bg-amber-500/5">
            <div className="text-xs uppercase tracking-[0.2em] text-amber-300">Set up company profile</div>
            <p className="mt-2 text-sm text-slate-300">Your tenant has no CompanyProfile yet. Create one before subscribing to federal solicitations — SAM.gov, set-aside certs, and prequalification submissions need this data.</p>
            <form action="/api/tenant/company/profile" method="post" className="mt-4 grid gap-3 md:grid-cols-[2fr_2fr_1fr_auto]">
              <input name="legalName" required placeholder="Legal company name" className="form-input" />
              <input name="dbaName" placeholder="DBA (if different)" className="form-input" />
              <input name="ein" placeholder="EIN" className="form-input" />
              <button className="btn-primary">Create</button>
            </form>
          </section>
        ) : (
          <section className="card p-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Company profile</div>
                <h2 className="mt-1 text-xl font-semibold text-white">{profile.legalName}</h2>
                {profile.dbaName ? <div className="text-sm text-slate-400">DBA: {profile.dbaName}</div> : null}
                <div className="mt-2 grid gap-1 text-xs text-slate-400">
                  {profile.ein ? <div>EIN: <span className="font-mono">{profile.ein}</span></div> : null}
                  {profile.duns ? <div>DUNS: <span className="font-mono">{profile.duns}</span></div> : null}
                  {profile.cageCode ? <div>CAGE: <span className="font-mono">{profile.cageCode}</span></div> : null}
                  {profile.uei ? <div>SAM UEI: <span className="font-mono">{profile.uei}</span></div> : null}
                  {profile.entityType ? <div>Entity type: {profile.entityType}</div> : null}
                  {profile.yearFounded ? <div>Founded: {profile.yearFounded}</div> : null}
                </div>
              </div>
            </div>
            {profile.samStatus ? (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                SAM: {profile.samStatus}{profile.samExpiresAt ? ` · expires ${formatDate(profile.samExpiresAt)}` : ""}
              </div>
            ) : null}
            <details className="mt-4 rounded-2xl border border-white/10">
              <summary className="cursor-pointer select-none px-4 py-3 text-xs uppercase tracking-[0.18em] text-cyan-300 hover:bg-white/5">Edit profile</summary>
              <form action="/api/tenant/company/profile" method="post" className="grid gap-3 p-4 md:grid-cols-3">
                <label className="block md:col-span-2">
                  <span className="form-label">Legal name</span>
                  <input name="legalName" required defaultValue={profile.legalName} className="form-input" />
                </label>
                <label className="block">
                  <span className="form-label">DBA</span>
                  <input name="dbaName" defaultValue={profile.dbaName ?? ""} className="form-input" />
                </label>
                <label className="block">
                  <span className="form-label">EIN</span>
                  <input name="ein" defaultValue={profile.ein ?? ""} className="form-input" />
                </label>
                <label className="block">
                  <span className="form-label">DUNS</span>
                  <input name="duns" defaultValue={profile.duns ?? ""} className="form-input" />
                </label>
                <label className="block">
                  <span className="form-label">CAGE code</span>
                  <input name="cageCode" defaultValue={profile.cageCode ?? ""} className="form-input" />
                </label>
                <label className="block">
                  <span className="form-label">SAM UEI</span>
                  <input name="uei" defaultValue={profile.uei ?? ""} className="form-input" />
                </label>
                <label className="block">
                  <span className="form-label">Entity type</span>
                  <input name="entityType" defaultValue={profile.entityType ?? ""} placeholder="LLC / S-Corp / …" className="form-input" />
                </label>
                <label className="block">
                  <span className="form-label">Year founded</span>
                  <input name="yearFounded" type="number" min={1800} max={2100} defaultValue={profile.yearFounded ?? ""} className="form-input" />
                </label>
                <label className="block md:col-span-3">
                  <span className="form-label">Primary address</span>
                  <input name="primaryAddress" defaultValue={profile.primaryAddress ?? ""} className="form-input" />
                </label>
                <label className="block">
                  <span className="form-label">City</span>
                  <input name="city" defaultValue={profile.city ?? ""} className="form-input" />
                </label>
                <label className="block">
                  <span className="form-label">State</span>
                  <input name="state" defaultValue={profile.state ?? ""} className="form-input" />
                </label>
                <label className="block">
                  <span className="form-label">Postal code</span>
                  <input name="postalCode" defaultValue={profile.postalCode ?? ""} className="form-input" />
                </label>
                <label className="block">
                  <span className="form-label">SAM status</span>
                  <input name="samStatus" defaultValue={profile.samStatus ?? ""} placeholder="ACTIVE / EXPIRED" className="form-input" />
                </label>
                <label className="block">
                  <span className="form-label">SAM expires</span>
                  <input name="samExpiresAt" type="date" defaultValue={profile.samExpiresAt ? profile.samExpiresAt.toISOString().slice(0, 10) : ""} className="form-input" />
                </label>
                <div />
                <label className="block">
                  <span className="form-label">Primary contact name</span>
                  <input name="primaryContactName" defaultValue={profile.primaryContactName ?? ""} className="form-input" />
                </label>
                <label className="block">
                  <span className="form-label">Primary contact email</span>
                  <input name="primaryContactEmail" type="email" defaultValue={profile.primaryContactEmail ?? ""} className="form-input" />
                </label>
                <label className="block">
                  <span className="form-label">Primary contact phone</span>
                  <input name="primaryContactPhone" defaultValue={profile.primaryContactPhone ?? ""} className="form-input" />
                </label>
                <label className="block md:col-span-3">
                  <span className="form-label">Notes</span>
                  <textarea name="notes" rows={2} defaultValue={profile.notes ?? ""} className="form-textarea" />
                </label>
                <div className="md:col-span-3">
                  <button className="btn-primary text-xs">Save profile</button>
                </div>
              </form>
            </details>
          </section>
        )}

        <CompanySection
          id="licenses"
          title="Contractor licenses"
          description="State + jurisdiction licensing the company holds for legal work performance."
          createPath="/api/tenant/company/licenses/create"
          rows={licenses.map((l) => ({
            id: l.id,
            primary: l.licenseType,
            secondary: `${l.licenseNumber}${l.state ? ` · ${l.state}` : ""}${l.jurisdiction ? ` · ${l.jurisdiction}` : ""}`,
            expires: l.expiresAt,
            status: l.status,
            notes: l.scopeOfWork,
          }))}
          createFields={[
            { name: "licenseType", placeholder: "Type (e.g. GENERAL_CONTRACTOR)", required: true },
            { name: "licenseNumber", placeholder: "License number", required: true },
            { name: "state", placeholder: "State (e.g. SC)" },
            { name: "expiresAt", placeholder: "Expires (YYYY-MM-DD)", type: "date" },
          ]}
        />

        <CompanySection
          id="insurance"
          title="Insurance certificates"
          description="Active COIs the company maintains. Owners + GCs request these before contracts execute."
          createPath="/api/tenant/company/insurance/create"
          rows={insurances.map((i) => ({
            id: i.id,
            primary: i.policyType,
            secondary: `${i.carrier} · #${i.policyNumber}`,
            expires: i.expiresAt,
            status: i.status,
            notes: `Per-occ ${formatCurrency(i.perOccurrenceLimit)} / Agg ${formatCurrency(i.aggregateLimit)}`,
          }))}
          createFields={[
            { name: "policyType", placeholder: "Type (GENERAL_LIABILITY / WORKERS_COMP / ...)", required: true },
            { name: "carrier", placeholder: "Carrier", required: true },
            { name: "policyNumber", placeholder: "Policy #", required: true },
            { name: "effectiveDate", placeholder: "Effective", type: "date", required: true },
            { name: "expiresAt", placeholder: "Expires", type: "date", required: true },
          ]}
        />

        <CompanySection
          id="bonds"
          title="Bonding"
          description="Surety bonds in force. Aggregate + single-project capacity drive what jobs the company can pursue."
          createPath="/api/tenant/company/bonds/create"
          rows={bonds.map((b) => ({
            id: b.id,
            primary: b.bondType,
            secondary: `${b.surety}${b.bondNumber ? ` · #${b.bondNumber}` : ""}${b.project ? ` · ${b.project.name}` : ""}`,
            expires: b.expiresAt,
            status: b.status,
            notes: toNum(b.bondAmount) > 0 ? `Bond ${formatCurrency(b.bondAmount)}` : `Capacity ${formatCurrency(b.capacityAggregate)} agg / ${formatCurrency(b.capacitySingle)} single`,
          }))}
          createFields={[
            { name: "bondType", placeholder: "BID / PAYMENT / PERFORMANCE / ...", required: true },
            { name: "surety", placeholder: "Surety company", required: true },
            { name: "bondAmount", placeholder: "Bond amount $ (or blank for capacity)", type: "number" },
            { name: "expiresAt", placeholder: "Expires", type: "date" },
          ]}
        />

        <CompanySection
          id="certifications"
          title="Set-aside certifications"
          description="DBE / MWBE / SDVOSB / HUBZONE / 8(a) / Small Business / ESBE."
          createPath="/api/tenant/company/certifications/create"
          rows={certifications.map((c) => ({
            id: c.id,
            primary: c.certificationType,
            secondary: `${c.certifyingAgency}${c.certificateNumber ? ` · #${c.certificateNumber}` : ""}${c.state ? ` · ${c.state}` : ""}`,
            expires: c.expiresAt,
            status: c.status,
            notes: c.scope,
          }))}
          createFields={[
            { name: "certificationType", placeholder: "Type (DBE / MWBE / SDVOSB / ...)", required: true },
            { name: "certifyingAgency", placeholder: "Agency (SBA / DOT / State)", required: true },
            { name: "certificateNumber", placeholder: "Cert number" },
            { name: "expiresAt", placeholder: "Expires", type: "date" },
          ]}
        />

        <section id="safety" className="card p-6 scroll-mt-20">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Safety record</div>
              <p className="mt-1 text-xs text-slate-400">Annual EMR / TRIR / DART. Drives prequalification scoring + insurance underwriting.</p>
            </div>
          </div>
          <form action="/api/tenant/company/safety/create" method="post" className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]">
            <input name="reportingYear" type="number" required placeholder="Year" className="form-input" />
            <input name="emrRate" type="number" step="0.01" placeholder="EMR" className="form-input" />
            <input name="trirRate" type="number" step="0.01" placeholder="TRIR" className="form-input" />
            <input name="dartRate" type="number" step="0.01" placeholder="DART" className="form-input" />
            <input name="laborHours" type="number" placeholder="Labor hours" className="form-input" />
            <button className="btn-primary text-xs">Add year</button>
          </form>
          <SortableTable
            className="mt-4 min-w-full divide-y divide-white/10 text-sm"
            emptyMessage="No years recorded yet."
            columns={[
              { header: "Year", thClassName: "py-2 pr-4" },
              { header: "EMR", align: "right", thClassName: "py-2 pr-4" },
              { header: "TRIR", align: "right", thClassName: "py-2 pr-4" },
              { header: "DART", align: "right", thClassName: "py-2 pr-4" },
              { header: "Labor hrs", align: "right", thClassName: "py-2 pr-4" },
              { header: "Recordable", align: "right", thClassName: "py-2 pr-4" },
            ]}
            rows={safetyMetrics.map((s) => ({
              key: s.id,
              cells: [
                { sort: s.reportingYear, node: s.reportingYear, tdClassName: "py-2 pr-4 text-white" },
                { sort: s.emrRate ?? undefined, node: s.emrRate?.toFixed(2) ?? "—", tdClassName: "py-2 pr-4" },
                { sort: s.trirRate ?? undefined, node: s.trirRate?.toFixed(2) ?? "—", tdClassName: "py-2 pr-4" },
                { sort: s.dartRate ?? undefined, node: s.dartRate?.toFixed(2) ?? "—", tdClassName: "py-2 pr-4" },
                { sort: s.laborHours ?? undefined, node: s.laborHours?.toLocaleString() ?? "—", tdClassName: "py-2 pr-4" },
                { sort: s.recordableCount, node: s.recordableCount, tdClassName: "py-2 pr-4" },
              ],
            }))}
          />
        </section>
      </div>
    </AppLayout>
  );
}

type Field = { name: string; placeholder: string; required?: boolean; type?: string };
type Row = { id: string; primary: string; secondary: string; expires: Date | null; status: string; notes?: string | null };

function CompanySection({ id, title, description, rows, createPath, createFields }: { id: string; title: string; description: string; rows: Row[]; createPath: string; createFields: Field[] }) {
  const soon = new Date();
  soon.setDate(soon.getDate() + 60);
  return (
    <section id={id} className="card p-6 scroll-mt-20">
      <div>
        <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">{title}</div>
        <p className="mt-1 text-xs text-slate-400">{description}</p>
      </div>
      <form action={createPath} method="post" className="mt-3 flex flex-wrap gap-2">
        {createFields.map((f) => (
          <input
            key={f.name}
            name={f.name}
            type={f.type ?? "text"}
            required={f.required}
            placeholder={f.placeholder}
            className="form-input flex-1 min-w-[140px]"
          />
        ))}
        <button className="btn-primary text-xs">Add</button>
      </form>
      <SortableTable
        className="mt-4 min-w-full divide-y divide-white/10 text-sm"
        emptyMessage="No records yet — add above."
        columns={[
          { header: "Type", thClassName: "py-2 pr-4" },
          { header: "Detail", thClassName: "py-2 pr-4" },
          { header: "Expires", thClassName: "py-2 pr-4" },
          { header: "Status", thClassName: "py-2 pr-4" },
        ]}
        rows={rows.map((r) => {
          const expSoon = r.expires && r.expires < soon;
          return {
            key: r.id,
            cells: [
              { sort: r.primary, node: r.primary, tdClassName: "py-2 pr-4 text-white" },
              {
                sort: r.secondary,
                node: (
                  <>
                    <div>{r.secondary}</div>
                    {r.notes ? <div className="text-xs text-slate-500">{r.notes}</div> : null}
                  </>
                ),
                tdClassName: "py-2 pr-4 text-slate-300",
              },
              {
                sort: r.expires ? r.expires.getTime() : undefined,
                node: (
                  <>
                    {r.expires ? formatDate(r.expires) : "—"}
                    {expSoon ? <span className="ml-1">⚠</span> : null}
                  </>
                ),
                tdClassName: `py-2 pr-4 text-xs ${expSoon ? "text-amber-300" : "text-slate-400"}`,
              },
              { sort: r.status, node: r.status, tdClassName: "py-2 pr-4 text-xs" },
            ],
          };
        })}
      />
    </section>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: "good" | "warn" }) {
  const color = tone === "warn" ? "text-amber-300" : tone === "good" ? "text-emerald-300" : "text-white";
  return (
    <div className="card p-5">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${color}`}>{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}
