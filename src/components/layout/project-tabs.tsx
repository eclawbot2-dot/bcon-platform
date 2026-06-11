import Link from "next/link";
import type { ProjectMode } from "@prisma/client";

type Tab = { slug: string; label: string; modes?: ProjectMode[] };

const ALL_MODES: ProjectMode[] = ["SIMPLE", "VERTICAL", "HEAVY_CIVIL"];
const VERTICAL_OR_CIVIL: ProjectMode[] = ["VERTICAL", "HEAVY_CIVIL"];

export const PROJECT_TABS: Tab[] = [
  { slug: "", label: "Overview" },
  { slug: "schedule", label: "Schedule" },
  { slug: "look-ahead", label: "Look-ahead" },
  { slug: "photos", label: "Photos" },
  { slug: "tasks", label: "Tasks" },
  { slug: "daily-logs", label: "Daily Logs" },
  { slug: "rfis", label: "RFIs", modes: VERTICAL_OR_CIVIL },
  { slug: "submittals", label: "Submittals", modes: VERTICAL_OR_CIVIL },
  { slug: "change-orders", label: "Change Orders" },
  { slug: "contracts", label: "Contracts" },
  { slug: "bids", label: "Bids", modes: VERTICAL_OR_CIVIL },
  { slug: "pay-apps", label: "Pay Apps" },
  { slug: "sub-invoices", label: "Sub Invoices" },
  { slug: "lien-waivers", label: "Lien Waivers", modes: VERTICAL_OR_CIVIL },
  { slug: "purchase-orders", label: "POs" },
  { slug: "timesheets", label: "Timesheets" },
  { slug: "permits", label: "Permits" },
  { slug: "inspections", label: "Inspections" },
  { slug: "compliance", label: "Compliance" },
  { slug: "safety", label: "Safety", modes: VERTICAL_OR_CIVIL },
  { slug: "financials", label: "P&L" },
  { slug: "profit-audit", label: "Profit audit" },
  { slug: "punch-list", label: "Punch List" },
  { slug: "warranty", label: "Warranty" },
  { slug: "documents", label: "Documents" },
];

export function filteredTabsForMode(mode: ProjectMode): Tab[] {
  return PROJECT_TABS.filter((t) => !t.modes || t.modes.includes(mode));
}

export function ProjectTabs({ projectId, active, mode }: { projectId: string; active: string; mode?: ProjectMode }) {
  const tabs = mode ? filteredTabsForMode(mode) : PROJECT_TABS;
  return (
    <div className="card overflow-hidden p-0">
      <div className="no-scrollbar flex gap-1 overflow-x-auto px-3 py-2 text-sm">
        {tabs.map((tab) => {
          const href = tab.slug ? `/projects/${projectId}/${tab.slug}` : `/projects/${projectId}`;
          const isActive = active === (tab.slug || "overview");
          return (
            <Link
              key={tab.slug || "overview"}
              href={href}
              className={
                // min-h on mobile keeps the tab strip at the 44px tap floor;
                // desktop collapses back to the compact pill height.
                "inline-flex min-h-[44px] items-center rounded-full px-3 py-1.5 font-medium whitespace-nowrap transition md:min-h-0 " +
                (isActive ? "bg-cyan-500/20 text-cyan-100 border border-cyan-500/40" : "text-slate-400 hover:bg-white/5 hover:text-white")
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

void ALL_MODES;
