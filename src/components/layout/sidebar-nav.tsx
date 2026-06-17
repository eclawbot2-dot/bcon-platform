"use client";

/**
 * Client-side sidebar nav with per-user personalization.
 *
 * The server (Sidebar) passes a fully serializable nav tree — each item's
 * icon is a STRING key (lucide components are not serializable across the
 * server/client boundary), resolved back to a component via ICONS below.
 *
 * Personalization (reorder + hide of groups and items) is persisted in
 * localStorage only (see src/lib/nav-customization.ts). To stay
 * hydration-safe we render the DEFAULT order on SSR and the first client
 * render, then flip `ready` true in a mount effect and re-render with the
 * saved prefs applied. Left-click always navigates normally; only the
 * right-click (context) event is intercepted to open the move/hide menu.
 */

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Bell, Bot, Briefcase, Building2, BriefcaseBusiness, CalendarDays, ClipboardCheck,
  ClipboardList, Coins, FileStack, Gauge, Gavel, HardHat, LayoutDashboard, Mail, Search,
  ShieldAlert, ShieldCheck, Timer, Truck, Upload, Users,
} from "lucide-react";
import {
  ROOT_KEY, applyOrder, itemIdOf, readNavCustomization, writeNavCustomization,
  type NavCustomization,
} from "@/lib/nav-customization";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Bell, Bot, Briefcase, Building2, BriefcaseBusiness, CalendarDays, ClipboardCheck,
  ClipboardList, Coins, FileStack, Gauge, Gavel, HardHat, LayoutDashboard, Mail, Search,
  ShieldAlert, ShieldCheck, Timer, Truck, Upload, Users,
};

export type SerializableNavItem = { href: string; label: string; icon: string };
export type SerializableNavGroup = { title: string; items: SerializableNavItem[] };

type Menu = { x: number; y: number; kind: "group" | "item"; id: string; parentKey: string; label: string; siblings: string[] };

export function SidebarNav({ groups, alertCount }: { groups: SerializableNavGroup[]; alertCount: number }) {
  // Hydration-safe: default order on SSR + first paint, saved prefs after mount.
  const [ready, setReady] = useState(false);
  const [custom, setCustom] = useState<NavCustomization>({ order: {}, hidden: [] });
  const [menu, setMenu] = useState<Menu | null>(null);

  useEffect(() => {
    setCustom(readNavCustomization());
    setReady(true);
  }, []);

  // Close the context menu on any outside interaction.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  function persist(next: NavCustomization) {
    setCustom(next);
    writeNavCustomization(next);
  }

  function reorder(parentKey: string, order: string[]) {
    persist({ ...custom, order: { ...custom.order, [parentKey]: order } });
  }
  function hide(id: string) {
    if (custom.hidden.includes(id)) return;
    persist({ ...custom, hidden: [...custom.hidden, id] });
  }
  function unhide(id: string) {
    persist({ ...custom, hidden: custom.hidden.filter((x) => x !== id) });
  }
  function reset() {
    persist({ order: {}, hidden: [] });
  }
  function move(m: Menu, dir: -1 | 1) {
    const idx = m.siblings.indexOf(m.id);
    if (idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= m.siblings.length) return;
    const next = [...m.siblings];
    [next[idx], next[j]] = [next[j], next[idx]];
    reorder(m.parentKey, next);
    setMenu(null);
  }

  // Effective customization: empty until mounted, so SSR + first render use
  // the default order/visibility and hydrate cleanly.
  const eff = ready ? custom : { order: {}, hidden: [] };

  // Apply order + hide to groups.
  const renderGroups = applyOrder(groups, (g) => g.title, eff.order[ROOT_KEY]).filter((g) => !eff.hidden.includes(g.title));
  const groupSiblings = renderGroups.map((g) => g.title);

  // Registry of every node (pre-hide) so the restore panel can label ids.
  const hiddenNodes = useMemo(() => {
    const reg: { id: string; label: string; kind: string }[] = [];
    for (const g of groups) {
      reg.push({ id: g.title, label: g.title, kind: "Group" });
      for (const it of g.items) reg.push({ id: itemIdOf(g.title, it.href), label: `${g.title} › ${it.label}`, kind: "Item" });
    }
    return reg.filter((r) => eff.hidden.includes(r.id));
  }, [groups, eff.hidden]);

  function openMenu(e: React.MouseEvent, m: Omit<Menu, "x" | "y">) {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ ...m, x: e.clientX, y: e.clientY });
  }

  return (
    <>
      <nav aria-label="Primary" className="px-3 py-3 space-y-4">
        {renderGroups.map((group) => {
          const orderedItems = applyOrder(group.items, (it) => itemIdOf(group.title, it.href), eff.order[group.title]).filter(
            (it) => !eff.hidden.includes(itemIdOf(group.title, it.href)),
          );
          const itemSiblings = orderedItems.map((it) => itemIdOf(group.title, it.href));
          return (
            <div
              key={group.title}
              onContextMenu={(e) =>
                openMenu(e, { kind: "group", id: group.title, parentKey: ROOT_KEY, label: group.title, siblings: groupSiblings })
              }
            >
              <div className="px-3 pb-1 pt-1 text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: "var(--heading)" }}>{group.title}</div>
              <div className="space-y-0.5">
                {orderedItems.map((item) => {
                  const Icon = ICONS[item.icon] ?? LayoutDashboard;
                  const iid = itemIdOf(group.title, item.href);
                  const badge = item.href === "/alerts" && alertCount > 0 ? alertCount : null;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onContextMenu={(e) =>
                        openMenu(e, { kind: "item", id: iid, parentKey: group.title, label: item.label, siblings: itemSiblings })
                      }
                      className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition hover:bg-white/5"
                      style={{ color: "var(--body)" }}
                    >
                      <Icon className="h-4 w-4 text-cyan-300" />
                      <span className="flex-1">{item.label}</span>
                      {badge ? <span aria-label={`${badge} unacknowledged alerts`} className="rounded-full border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-200">{badge}</span> : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <NavRestore hidden={hiddenNodes} onRestore={unhide} onReset={reset} />

      {menu && ready
        ? createPortal(
            <div
              className="fixed z-[200] min-w-48 rounded-lg border border-white/10 bg-[#0b0f16] p-1 shadow-2xl"
              style={{ left: Math.min(menu.x, window.innerWidth - 210), top: Math.min(menu.y, window.innerHeight - 140) }}
              onClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
              role="menu"
            >
              {(() => {
                const idx = menu.siblings.indexOf(menu.id);
                const canUp = idx > 0;
                const canDown = idx >= 0 && idx < menu.siblings.length - 1;
                const itemCls = "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-slate-200 hover:bg-white/10 disabled:opacity-35 disabled:hover:bg-transparent";
                return (
                  <>
                    <div className="truncate px-2 py-1 text-[10px] uppercase tracking-wide text-slate-500">{menu.kind === "group" ? "Group" : "Item"}: {menu.label}</div>
                    <button type="button" className={itemCls} disabled={!canUp} onClick={() => move(menu, -1)}>↑ Move up</button>
                    <button type="button" className={itemCls} disabled={!canDown} onClick={() => move(menu, 1)}>↓ Move down</button>
                    <div className="my-1 border-t border-white/5" />
                    <button type="button" className={`${itemCls} text-rose-300 hover:bg-rose-500/10`} onClick={() => { hide(menu.id); setMenu(null); }}>⊘ Hide this {menu.kind}</button>
                  </>
                );
              })()}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function NavRestore({
  hidden,
  onRestore,
  onReset,
}: {
  hidden: { id: string; label: string; kind: string }[];
  onRestore: (id: string) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);

  if (hidden.length === 0) {
    return (
      <div className="px-3 pb-2 text-[10px] leading-relaxed" style={{ color: "var(--faint)" }}>
        Tip: right-click any group or item to move it up/down or hide it.
      </div>
    );
  }

  return (
    <div className="px-3 pb-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.14em] hover:bg-white/5"
        style={{ color: "var(--faint)" }}
      >
        <span>{open ? "▾" : "▸"}</span>
        <span className="flex-1">Hidden nav ({hidden.length})</span>
      </button>
      {open ? (
        <div className="mt-1 space-y-0.5">
          {hidden.map((h) => (
            <div key={h.id} className="flex items-center justify-between gap-2 rounded px-2 py-1 text-[11px]" style={{ color: "var(--faint)" }}>
              <span className="min-w-0 truncate">
                <span className="opacity-70">{h.kind}</span> · {h.label}
              </span>
              <button type="button" onClick={() => onRestore(h.id)} className="shrink-0 text-cyan-300 hover:text-cyan-200">restore</button>
            </div>
          ))}
          <button
            type="button"
            onClick={onReset}
            className="mt-1 w-full rounded border border-white/10 px-2 py-1 text-[11px] hover:bg-white/5"
            style={{ color: "var(--faint)" }}
          >
            Reset nav to default
          </button>
        </div>
      ) : null}
    </div>
  );
}
