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
  /** Accent color */
  accent?: string;
  /** Date range to preserve when navigating */
  dateFrom?: string;
  dateTo?: string;
};

export function PilotageSwipeWrapper({ children, dateFrom, dateTo }: Props) {
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
    </div>
  );
}
