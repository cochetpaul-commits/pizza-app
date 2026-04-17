"use client";

import React, { useRef, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";

/* ── Page order for swipe navigation ── */
const PILOTAGE_PAGES = [
  { href: "/ventes", label: "Ventes" },
  { href: "/ventes/marges", label: "Produits" },
  { href: "/rh/masse-salariale", label: "Masse sal." },
  { href: "/tresorerie", label: "Tresorerie" },
];

const SWIPE_THRESHOLD = 60;

type Props = {
  children: React.ReactNode;
  /** TTC/HT mode — only shown when provided */
  mode?: "ttc" | "ht";
  onModeChange?: (m: "ttc" | "ht") => void;
  /** Accent color for the toggle */
  accent?: string;
  /** Date range to preserve when navigating */
  dateFrom?: string;
  dateTo?: string;
};

export function PilotageSwipeWrapper({ children, mode, onModeChange, accent = "#D4775A", dateFrom, dateTo }: Props) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const startX = useRef(0);
  const startY = useRef(0);
  const swiping = useRef(false);

  const currentIndex = PILOTAGE_PAGES.findIndex(
    p => pathname === p.href || pathname.startsWith(p.href + "/")
  );

  const navigateTo = useCallback((idx: number) => {
    const target = PILOTAGE_PAGES[idx];
    if (!target) return;
    const params = new URLSearchParams();
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    const qs = params.toString();
    router.push(qs ? `${target.href}?${qs}` : target.href);
  }, [router, dateFrom, dateTo]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    swiping.current = true;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!swiping.current) return;
    swiping.current = false;
    const dx = e.changedTouches[0].clientX - startX.current;
    const dy = e.changedTouches[0].clientY - startY.current;
    // Only trigger if horizontal swipe is dominant
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0 && currentIndex < PILOTAGE_PAGES.length - 1) {
      navigateTo(currentIndex + 1);
    } else if (dx > 0 && currentIndex > 0) {
      navigateTo(currentIndex - 1);
    }
  }, [currentIndex, navigateTo]);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{ minHeight: "100dvh" }}
    >
      {children}

      {/* ── Floating bottom bar: dots + optional TTC/HT toggle ── */}
      <div className="pilotage-swipe-bar" style={{
        position: "fixed",
        bottom: "calc(130px + env(safe-area-inset-bottom, 0px))",
        left: 0, right: 0,
        zIndex: 99,
        display: "none", /* shown via CSS on mobile */
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        pointerEvents: "none",
      }}>
        {/* TTC/HT toggle */}
        {mode && onModeChange && (
          <div style={{
            display: "flex", gap: 0,
            background: "rgba(245,240,232,0.90)",
            backdropFilter: "blur(16px) saturate(180%)",
            WebkitBackdropFilter: "blur(16px) saturate(180%)",
            border: "1px solid rgba(0,0,0,0.06)",
            borderRadius: 999, padding: 2,
            boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
            pointerEvents: "auto",
          }}>
            <button type="button" onClick={() => onModeChange("ttc")} style={{
              padding: "5px 16px", borderRadius: 999, border: "none", cursor: "pointer",
              background: mode === "ttc" ? accent : "transparent",
              color: mode === "ttc" ? "#fff" : "#999",
              fontSize: 11, fontWeight: 700, letterSpacing: ".03em",
              transition: "all 0.2s",
            }}>TTC</button>
            <button type="button" onClick={() => onModeChange("ht")} style={{
              padding: "5px 16px", borderRadius: 999, border: "none", cursor: "pointer",
              background: mode === "ht" ? accent : "transparent",
              color: mode === "ht" ? "#fff" : "#999",
              fontSize: 11, fontWeight: 700, letterSpacing: ".03em",
              transition: "all 0.2s",
            }}>HT</button>
          </div>
        )}

      </div>
    </div>
  );
}
