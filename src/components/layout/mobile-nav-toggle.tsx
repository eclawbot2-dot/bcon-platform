"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Hamburger toggle that opens the sidebar as a slide-in drawer on
 * mobile / narrow viewports. The sidebar itself is server-rendered;
 * this component just toggles a body attribute that CSS in
 * globals.css responds to.
 *
 * Auto-closes on route change so navigation feels normal. Pressing
 * Esc also closes.
 */
export function MobileNavToggle() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (open) document.body.setAttribute("data-mobile-nav", "open");
    else document.body.removeAttribute("data-mobile-nav");
    // Never strand the body attribute (and its scroll lock) if this
    // component unmounts while the drawer is open.
    return () => document.body.removeAttribute("data-mobile-nav");
  }, [open]);

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on Esc.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="lg:hidden inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] p-2 text-white"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {open ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <>
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          )}
        </svg>
      </button>
      {open ? (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/60"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}
