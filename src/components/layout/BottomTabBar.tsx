"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";

type Tab = {
  label: string;
  href: string;
  match?: string[];
  icon: (active: boolean) => React.ReactNode;
};

type TabSet = {
  /** Pathname prefixes that activate this tab set */
  when: string[];
  tabs: Tab[];
};

/* ── Icons ────────────────────────────────────────── */

function IconHome({ active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      {!active && <polyline points="9 22 9 12 15 12 15 22" />}
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

function IconUsers({ active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.2" : "1.8"} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconChat({ active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconBook({ active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
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

function IconTruck({ active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.2" : "1.8"} strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" rx="1" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
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

function IconClock({ active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.2" : "1.8"} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconCalendarEvent({ active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <path d="M8 14h.01" />
      <path d="M12 14h.01" />
    </svg>
  );
}

function IconUserCard({ active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.2" : "1.8"} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="18" rx="2" />
      <circle cx="9" cy="10" r="3" />
      <path d="M15 8h4" />
      <path d="M15 12h4" />
      <path d="M4 19c0-2.5 2-4 5-4s5 1.5 5 4" />
    </svg>
  );
}

function IconFileText({ active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function IconBox({ active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

/* ── Tab sets by section ──────────────────────────── */

const TAB_SETS: TabSet[] = [
  // ── RH / Personnel ──
  {
    when: ["/mes-shifts", "/plannings", "/rh/equipe", "/rh/employe", "/rh/pointage", "/rh/conges", "/rh/emargement", "/rh/masse-salariale", "/rh/rapports"],
    tabs: [
      { label: "Mes shifts", href: "/mes-shifts", match: ["/mes-shifts"], icon: (a) => <IconHome active={a} /> },
      { label: "Planning", href: "/plannings", match: ["/plannings"], icon: (a) => <IconCalendar active={a} /> },
      { label: "Equipe", href: "/rh/equipe", match: ["/rh/equipe", "/rh/employe"], icon: (a) => <IconUsers active={a} /> },
      { label: "Pointage", href: "/rh/pointage", match: ["/rh/pointage"], icon: (a) => <IconClock active={a} /> },
    ],
  },
  // ── Finance / Recettes ──
  {
    when: ["/recettes", "/ingredients", "/commandes", "/achats", "/variations-prix", "/pilotage", "/inventaire", "/epicerie", "/fournisseurs", "/invoices", "/mercuriale", "/stats-achats", "/alertes-prix"],
    tabs: [
      { label: "Recettes", href: "/recettes", match: ["/recettes"], icon: (a) => <IconBook active={a} /> },
      { label: "Ingredients", href: "/ingredients", match: ["/ingredients"], icon: (a) => <IconPackage active={a} /> },
      { label: "Commandes", href: "/commandes", match: ["/commandes"], icon: (a) => <IconTruck active={a} /> },
      { label: "Pilotage", href: "/pilotage", match: ["/pilotage"], icon: (a) => <IconBarChart active={a} /> },
    ],
  },
  // ── Clients / Evenements ──
  {
    when: ["/evenements", "/clients", "/devis", "/kezia"],
    tabs: [
      { label: "Evenements", href: "/evenements", match: ["/evenements"], icon: (a) => <IconCalendarEvent active={a} /> },
      { label: "Clients", href: "/clients", match: ["/clients"], icon: (a) => <IconUserCard active={a} /> },
      { label: "Devis", href: "/devis/new", match: ["/devis"], icon: (a) => <IconFileText active={a} /> },
      { label: "Kezia", href: "/kezia", match: ["/kezia"], icon: (a) => <IconBox active={a} /> },
    ],
  },
  // ── Messagerie ──
  {
    when: ["/messagerie"],
    tabs: [
      { label: "Messages", href: "/messagerie", match: ["/messagerie"], icon: (a) => <IconChat active={a} /> },
    ],
  },
  // ── Parametres ──
  {
    when: ["/settings", "/admin"],
    tabs: [
      { label: "Utilisateurs", href: "/admin/utilisateurs", match: ["/admin"], icon: (a) => <IconUsers active={a} /> },
      { label: "Mon compte", href: "/settings/account", match: ["/settings"], icon: (a) => <IconUserCard active={a} /> },
    ],
  },
];

// Default tabs (dashboard, notifications, etc.)
const DEFAULT_TABS: Tab[] = [
  { label: "Accueil", href: "/dashboard", match: ["/dashboard"], icon: (a) => <IconHome active={a} /> },
  { label: "Planning", href: "/plannings", match: ["/plannings"], icon: (a) => <IconCalendar active={a} /> },
  { label: "Recettes", href: "/recettes", match: ["/recettes"], icon: (a) => <IconBook active={a} /> },
  { label: "Equipe", href: "/rh/equipe", match: ["/rh/equipe", "/rh/employe"], icon: (a) => <IconUsers active={a} /> },
];

const ACTIVE_COLOR = "#2D6A4F";
const INACTIVE_COLOR = "#999";

/* ── Resolve which tabs to show ───────────────────── */

function getTabsForPath(pathname: string): Tab[] {
  for (const set of TAB_SETS) {
    if (set.when.some(w => pathname === w || pathname.startsWith(w + "/"))) {
      return set.tabs;
    }
  }
  return DEFAULT_TABS;
}

/* ── Component ────────────────────────────────────── */

type Props = {
  onMenuClick: () => void;
};

export function BottomTabBar({ onMenuClick }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { role } = useProfile();

  if (!role) return null;

  const tabs = getTabsForPath(pathname);

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
            minWidth: 56,
            color: INACTIVE_COLOR,
          }}
        >
          <IconMenu />
          <span style={{ fontSize: 10, fontWeight: 500, lineHeight: 1.2, letterSpacing: 0.2 }}>
            Menu
          </span>
        </button>

        {/* Contextual tabs */}
        {tabs.map((tab) => {
          const isActive = tab.match
            ? tab.match.some(m => pathname === m || pathname.startsWith(m + "/"))
            : pathname === tab.href;

          return (
            <button
              key={tab.href}
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
                minWidth: 56,
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
