import Link from "next/link";
import { Crown } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getTenantContext } from "@/lib/dashboard";
import { currentSuperAdmin } from "@/lib/permissions";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "./sign-out-button";
import { SidebarNav, type SerializableNavGroup } from "./sidebar-nav";

// Nav tree is fully serializable (icon = string key) so it can cross the
// server → client boundary into <SidebarNav>, where per-user reorder/hide
// personalization (localStorage) is applied. Icon keys resolve to lucide
// components via the ICONS map in sidebar-nav.tsx.
const navGroups: SerializableNavGroup[] = [
  {
    title: "Home",
    items: [
      { href: "/", label: "Dashboard", icon: "LayoutDashboard" },
      { href: "/assistant", label: "Assistant", icon: "Bot" },
      { href: "/alerts", label: "Alerts", icon: "Bell" },
    ],
  },
  {
    title: "Projects & field",
    items: [
      { href: "/projects", label: "Projects", icon: "Building2" },
      { href: "/operations", label: "Operations", icon: "HardHat" },
      { href: "/safety", label: "Safety", icon: "ShieldAlert" },
      { href: "/permits", label: "Permits", icon: "ShieldCheck" },
      { href: "/inspections", label: "Inspections", icon: "ClipboardCheck" },
      { href: "/inspections/calendar", label: "Inspection calendar", icon: "CalendarDays" },
      { href: "/workflows", label: "Workflows", icon: "ClipboardList" },
    ],
  },
  {
    title: "Bid pipeline",
    items: [
      { href: "/bids", label: "Bid hub", icon: "Gavel" },
      { href: "/bids/portfolio", label: "Pipeline", icon: "Gauge" },
      { href: "/bids/listings", label: "RFPs", icon: "FileStack" },
      { href: "/bids/sources", label: "Sources", icon: "Bell" },
      { href: "/bids/discover", label: "Discover portals", icon: "Search" },
      { href: "/bids/profile", label: "Bid criteria", icon: "Gauge" },
      { href: "/bids/capture", label: "Federal capture", icon: "Gavel" },
    ],
  },
  {
    title: "CRM & owner",
    items: [
      { href: "/crm", label: "CRM", icon: "BriefcaseBusiness" },
      { href: "/portal", label: "Owner portal", icon: "Users" },
    ],
  },
  {
    title: "Finance",
    items: [
      { href: "/finance", label: "Finance", icon: "Coins" },
      { href: "/finance/inbox", label: "Invoice ingest", icon: "Mail" },
      { href: "/finance/commissions", label: "Commissions", icon: "Coins" },
      { href: "/finance/ai", label: "Finance AI", icon: "Bot" },
      { href: "/reports", label: "Reports", icon: "Gauge" },
      { href: "/commercial", label: "Commercial", icon: "Gauge" },
      { href: "/imports", label: "Imports", icon: "Upload" },
    ],
  },
  {
    title: "People & resources",
    items: [
      { href: "/people", label: "Team", icon: "Users" },
      { href: "/people/ats", label: "ATS", icon: "Users" },
      { href: "/people/placements", label: "Placements", icon: "Briefcase" },
      { href: "/people/onboarding", label: "Onboarding", icon: "ClipboardList" },
      { href: "/timesheets", label: "Timesheets", icon: "Timer" },
      { href: "/vendors", label: "Vendors", icon: "Truck" },
      { href: "/documents", label: "Documents", icon: "FileStack" },
      { href: "/operations/ai", label: "Ops AI", icon: "Bot" },
    ],
  },
  {
    title: "Risk & audit",
    items: [
      { href: "/risk", label: "Risk", icon: "ShieldAlert" },
      { href: "/audit", label: "Audit", icon: "ShieldCheck" },
    ],
  },
];

export async function Sidebar() {
  const [session, tenantContext, superAdmin] = await Promise.all([
    auth(),
    getTenantContext(),
    currentSuperAdmin(),
  ]);

  const [alertCount, sessionUser] = await Promise.all([
    tenantContext
      ? prisma.alertEvent.count({ where: { tenantId: tenantContext.id, acknowledgedAt: null } })
      : Promise.resolve(0),
    session?.userId
      ? prisma.user.findUnique({ where: { id: session.userId }, select: { name: true, email: true } })
      : Promise.resolve(null),
  ]);

  return (
    <aside className="w-full border-r lg:w-72 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto" style={{ borderColor: "var(--border)", background: "var(--sidebar-bg)" }}>
      <div className="border-b px-5 py-5" style={{ borderColor: "var(--border)" }}>
        <div className="text-xs uppercase tracking-[0.24em] text-cyan-300">Construction OS</div>
        <div className="mt-2 text-xl font-semibold" style={{ color: "var(--heading)" }}>{tenantContext?.name ?? "Platform"}</div>
        <div className="mt-1 text-sm" style={{ color: "var(--faint)" }}>Multi-tenant OS for Simple, Vertical, and Heavy Civil workflows.</div>
      </div>

      {superAdmin ? (
        <Link href="/admin" className="super-admin-pill">
          <Crown className="h-4 w-4" />
          <span className="flex-1">Super Admin</span>
        </Link>
      ) : null}

      <SidebarNav groups={navGroups} alertCount={alertCount} />

      <div className="border-t px-5 py-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--faint)" }}>
        <div>Primary mode: <span className="font-medium" style={{ color: "var(--heading)" }}>{tenantContext?.primaryMode.replaceAll("_", " ") ?? "—"}</span></div>
        <div className="mt-2">Feature packs: <span className="font-medium" style={{ color: "var(--heading)" }}>{tenantContext?.featurePacks.length ?? 0}</span></div>
        <div className="mt-2">Business units: <span className="font-medium" style={{ color: "var(--heading)" }}>{tenantContext?.businessUnits.length ?? 0}</span></div>
        {sessionUser ? (
          <div className="mt-4 rounded-lg p-2.5" style={{ background: "var(--hover-bg)" }}>
            <div className="text-[11px] uppercase tracking-[0.18em]" style={{ color: "var(--faint)" }}>Signed in as</div>
            <div className="mt-0.5 truncate text-sm font-medium" style={{ color: "var(--heading)" }}>{sessionUser.name}</div>
            <div className="truncate text-[11px]" style={{ color: "var(--faint)" }}>{sessionUser.email}</div>
          </div>
        ) : null}
        <div className="mt-3"><ThemeToggle className="w-full justify-center" /></div>
        {sessionUser ? <div className="mt-2"><SignOutButton /></div> : null}
      </div>
    </aside>
  );
}
