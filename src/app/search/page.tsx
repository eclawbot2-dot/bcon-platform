import Link from "next/link";
import { AppLayout } from "@/components/layout/app-layout";
import { prisma } from "@/lib/prisma";
import { requireTenant } from "@/lib/tenant";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const tenant = await requireTenant();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  if (!q) {
    return (
      <AppLayout eyebrow="Search" title="Global search" description="Find projects, vendors, contracts, RFIs, opportunities, permits — across the whole tenant.">
        <SearchForm initial={q} />
      </AppLayout>
    );
  }

  const like = q;
  const [projects, vendors, contracts, rfis, subs, opps, listings, permits, people] = await Promise.all([
    prisma.project.findMany({ where: { tenantId: tenant.id, OR: [{ name: { contains: like, mode: "insensitive" } }, { code: { contains: like, mode: "insensitive" } }, { ownerName: { contains: like, mode: "insensitive" } }] }, take: 20, select: { id: true, name: true, code: true, mode: true, ownerName: true } }),
    prisma.vendor.findMany({ where: { tenantId: tenant.id, OR: [{ name: { contains: like, mode: "insensitive" } }, { legalName: { contains: like, mode: "insensitive" } }, { trade: { contains: like, mode: "insensitive" } }] }, take: 20, select: { id: true, name: true, trade: true } }),
    prisma.contract.findMany({ where: { project: { tenantId: tenant.id }, OR: [{ title: { contains: like, mode: "insensitive" } }, { contractNumber: { contains: like, mode: "insensitive" } }, { counterparty: { contains: like, mode: "insensitive" } }] }, include: { project: true }, take: 15 }),
    prisma.rFI.findMany({ where: { project: { tenantId: tenant.id }, OR: [{ subject: { contains: like, mode: "insensitive" } }, { number: { contains: like, mode: "insensitive" } }] }, include: { project: true }, take: 15 }),
    prisma.submittal.findMany({ where: { project: { tenantId: tenant.id }, OR: [{ title: { contains: like, mode: "insensitive" } }, { number: { contains: like, mode: "insensitive" } }, { specSection: { contains: like, mode: "insensitive" } }] }, include: { project: true }, take: 15 }),
    prisma.opportunity.findMany({ where: { tenantId: tenant.id, OR: [{ name: { contains: like, mode: "insensitive" } }, { clientName: { contains: like, mode: "insensitive" } }] }, take: 15, select: { id: true, name: true, clientName: true, stage: true } }),
    prisma.rfpListing.findMany({ where: { tenantId: tenant.id, OR: [{ title: { contains: like, mode: "insensitive" } }, { agency: { contains: like, mode: "insensitive" } }, { solicitationNo: { contains: like, mode: "insensitive" } }] }, take: 15, select: { id: true, title: true, agency: true, solicitationNo: true } }),
    prisma.permit.findMany({ where: { project: { tenantId: tenant.id }, OR: [{ permitNumber: { contains: like, mode: "insensitive" } }, { permitType: { contains: like, mode: "insensitive" } }, { jurisdiction: { contains: like, mode: "insensitive" } }] }, include: { project: true }, take: 15 }),
    prisma.user.findMany({ where: { memberships: { some: { tenantId: tenant.id } }, OR: [{ name: { contains: like, mode: "insensitive" } }, { email: { contains: like, mode: "insensitive" } }] }, take: 15, select: { id: true, name: true, email: true } }),
  ]);

  return (
    <AppLayout eyebrow="Search" title={`"${q}"`} description={`${projects.length + vendors.length + contracts.length + rfis.length + subs.length + opps.length + listings.length + permits.length + people.length} matches`}>
      <div className="grid gap-6">
        <SearchForm initial={q} />
        {projects.length > 0 ? (
          <section className="card p-5 min-w-0 overflow-hidden">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Projects</div>
            <ul className="mt-3 grid gap-2 md:grid-cols-2">
              {projects.map((p) => (
                <li key={p.id}><Link href={`/projects/${p.id}`} className="block rounded-xl border border-white/10 bg-white/5 p-3 transition hover:border-cyan-500/40"><div className="font-medium text-white">{p.code} · {p.name}</div><div className="text-xs text-slate-400">{p.mode.replaceAll("_", " ")} · {p.ownerName ?? "—"}</div></Link></li>
              ))}
            </ul>
          </section>
        ) : null}
        {vendors.length > 0 ? (
          <section className="card p-5 min-w-0 overflow-hidden">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">Vendors</div>
            <ul className="mt-3 grid gap-2 md:grid-cols-2">
              {vendors.map((v) => (
                <li key={v.id}><Link href={`/vendors/${v.id}`} className="block rounded-xl border border-white/10 bg-white/5 p-3 transition hover:border-cyan-500/40"><div className="font-medium text-white">{v.name}</div><div className="text-xs text-slate-400">{v.trade ?? "—"}</div></Link></li>
              ))}
            </ul>
          </section>
        ) : null}
        {contracts.length > 0 ? <ResultSection title="Contracts" items={contracts.map((c) => ({ href: `/projects/${c.project.id}/contracts/${c.id}`, title: `${c.contractNumber} · ${c.title}`, sub: `${c.project.code} · ${c.counterparty}` }))} /> : null}
        {rfis.length > 0 ? <ResultSection title="RFIs" items={rfis.map((r) => ({ href: `/projects/${r.project.id}/rfis/${r.id}`, title: `${r.number} · ${r.subject}`, sub: r.project.code }))} /> : null}
        {subs.length > 0 ? <ResultSection title="Submittals" items={subs.map((s) => ({ href: `/projects/${s.project.id}/submittals/${s.id}`, title: `${s.number} · ${s.title}`, sub: `${s.project.code} · ${s.specSection ?? "—"}` }))} /> : null}
        {opps.length > 0 ? <ResultSection title="Opportunities" items={opps.map((o) => ({ href: `/opportunities/${o.id}`, title: o.name, sub: `${o.clientName ?? "—"} · ${o.stage}` }))} /> : null}
        {listings.length > 0 ? <ResultSection title="RFP listings" items={listings.map((l) => ({ href: `/bids/listings`, title: l.title, sub: `${l.agency} · ${l.solicitationNo ?? ""}` }))} /> : null}
        {permits.length > 0 ? <ResultSection title="Permits" items={permits.map((p) => ({ href: `/projects/${p.project.id}/permits`, title: `${p.permitNumber} · ${p.permitType}`, sub: `${p.project.code} · ${p.jurisdiction}` }))} /> : null}
        {people.length > 0 ? <ResultSection title="People" items={people.map((u) => ({ href: `/people/${u.id}`, title: u.name, sub: u.email }))} /> : null}
      </div>
    </AppLayout>
  );
}

function SearchForm({ initial }: { initial: string }) {
  return (
    <form className="card p-4" action="/search">
      <div className="flex gap-3">
        <input name="q" defaultValue={initial} placeholder="Search projects, vendors, contracts, RFIs, RFPs, permits, people…" className="flex-1 rounded-lg border border-white/10 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-cyan-500" autoFocus />
        <button className="btn-primary">Search</button>
      </div>
    </form>
  );
}

function ResultSection({ title, items }: { title: string; items: Array<{ href: string; title: string; sub: string }> }) {
  return (
    <section className="card p-5 min-w-0 overflow-hidden">
      <div className="text-xs uppercase tracking-[0.2em] text-cyan-300">{title}</div>
      <ul className="mt-3 grid gap-2 md:grid-cols-2">
        {items.map((item, i) => (
          <li key={i}><Link href={item.href} className="block rounded-xl border border-white/10 bg-white/5 p-3 transition hover:border-cyan-500/40"><div className="font-medium text-white">{item.title}</div><div className="text-xs text-slate-400">{item.sub}</div></Link></li>
        ))}
      </ul>
    </section>
  );
}
