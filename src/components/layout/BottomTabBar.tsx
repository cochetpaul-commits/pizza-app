"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";

/* ── Icons ────────────────────────────────────────── */

function IconMenu() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function IconCalendar({ active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconWallet({ active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="16" rx="2" />
      <path d="M2 10h20" />
      <path d="M16 15h2" />
    </svg>
  );
}

function IconShoppingBag({ active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

function IconBarChart({ active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.5" : "2"} strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  );
}

function IconPackage({ active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

/* ── Fixed 5 tabs matching sidebar hubs ──────────── */

type Tab = {
  label: string;
  href: string;
  /** Pathname prefixes that make this tab "active" */
  match: string[];
  icon: (active: boolean) => React.ReactNode;
};

const TABS: Tab[] = [
  {
    label: "Planning",
    href: "/rh/equipe",
    match: ["/plannings", "/rh/", "/mes-shifts"],
    icon: (a) => <IconCalendar active={a} />,
  },
  {
    label: "Finance",
    href: "/finances",
    match: ["/finances", "/kezia"],
    icon: (a) => <IconWallet active={a} />,
  },
  {
    label: "Achats",
    href: "/stats-achats",
    match: ["/stats-achats", "/achats", "/ingredients", "/invoices", "/fournisseurs", "/base-produits"],
    icon: (a) => <IconShoppingBag active={a} />,
  },
  {
    label: "Perf.",
    href: "/pilotage",
    match: ["/pilotage", "/variations-prix", "/alertes-prix"],
    icon: (a) => <IconBarChart active={a} />,
  },
  {
    label: "Ops",
    href: "/recettes",
    match: ["/catalogue", "/recettes", "/commandes", "/inventaire", "/epicerie", "/prep"],
    icon: (a) => <IconPackage active={a} />,
  },
];

const ACTIVE_COLOR = "#2D6A4F";
const INACTIVE_COLOR = "#999";

/* ── Component ────────────────────────────────────── */

type Props = {
  onMenuClick: () => void;
};

export function BottomTabBar({ onMenuClick }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { role } = useProfile();

  if (!role) return null;

  return (
    <nav className="bottom-tab-bar" style={{
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      display: "none", /* shown via CSS on mobile */
      background: "#fff",
      borderTop: "1px solid rgba(0,0,0,0.08)",
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-around",
        alignItems: "center",
        height: 56,
        maxWidth: 500,
        margin: "0 auto",
      }}>
        {/* Menu button — always first */}
        <button
          type="button"
          onClick={onMenuClick}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "4px 0",
            minWidth: 48,
            color: INACTIVE_COLOR,
          }}
        >
          <IconMenu />
          <span style={{ fontSize: 10, fontWeight: 500, lineHeight: 1.2, letterSpacing: 0.2 }}>
            Menu
          </span>
        </button>

        {/* 5 fixed tabs */}
        {TABS.map((tab) => {
          const isActive = tab.match.some(m =>
            pathname === m || pathname.startsWith(m) || pathname.startsWith(m + "/")
          );

          return (
            <button
              key={tab.label}
              type="button"
              onClick={() => router.push(tab.href)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "4px 0",
                minWidth: 48,
                color: isActive ? ACTIVE_COLOR : INACTIVE_COLOR,
                transition: "color 150ms ease",
              }}
            >
              {tab.icon(isActive)}
              <span style={{
                fontSize: 10,
                fontWeight: isActive ? 700 : 500,
                lineHeight: 1.2,
                letterSpacing: 0.2,
              }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
