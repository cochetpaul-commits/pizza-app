"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";

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

function IconClock({ active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.2" : "1.8"} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconBeach({ active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.2" : "1.8"} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="5" />
      <path d="M12 13v8" />
      <path d="M8 21h8" />
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

function IconTrendingUp({ active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.2" : "1.8"} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
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

function IconBox({ active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  );
}

function IconTag({ active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

function IconGrid({ active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

/* ── Tab types ────────────────────────────────────── */

type Tab = {
  label: string;
  href: string;
  match: string[];
  icon: (active: boolean) => React.ReactNode;
};

type TabSection = {
  label: string;
  /** First item href — where hub click navigates */
  href: string;
  /** Pathnames that belong to this section */
  match: string[];
  icon: (active: boolean) => React.ReactNode;
  /** Sub-tabs shown when inside this section */
  tabs: Tab[];
};

/* ── Sections with sub-tabs ──────────────────────── */

function IconHeart({ active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

const SECTION_PLANNING: TabSection = {
  label: "Planning",
  href: "/plannings",
  match: ["/plannings", "/rh/", "/mes-shifts"],
  icon: (a) => <IconCalendar active={a} />,
  tabs: [
    { label: "Employes", href: "/rh/equipe", match: ["/rh/equipe", "/rh/employe"], icon: (a) => <IconUsers active={a} /> },
    { label: "Pointage", href: "/rh/pointage", match: ["/rh/pointage"], icon: (a) => <IconClock active={a} /> },
    { label: "Conges", href: "/rh/conges", match: ["/rh/conges"], icon: (a) => <IconBeach active={a} /> },
    { label: "Rapports", href: "/rh/rapports", match: ["/rh/rapports"], icon: (a) => <IconFileText active={a} /> },
  ],
};

const SECTION_FINANCE: TabSection = {
  label: "Finance",
  href: "/finances",
  match: ["/finances"],
  icon: (a) => <IconWallet active={a} />,
  tabs: [],
};

const SECTION_ACHATS: TabSection = {
  label: "Achats",
  href: "/stats-achats",
  match: ["/stats-achats", "/achats", "/ingredients", "/invoices", "/fournisseurs", "/base-produits"],
  icon: (a) => <IconShoppingBag active={a} />,
  tabs: [
    { label: "Stats", href: "/stats-achats", match: ["/stats-achats"], icon: (a) => <IconBarChart active={a} /> },
    { label: "Factures", href: "/achats", match: ["/achats", "/invoices"], icon: (a) => <IconFileText active={a} /> },
    { label: "Produits", href: "/ingredients", match: ["/ingredients"], icon: (a) => <IconTag active={a} /> },
  ],
};

const SECTION_PERF: TabSection = {
  label: "Perf.",
  href: "/pilotage",
  match: ["/pilotage", "/variations-prix", "/alertes-prix"],
  icon: (a) => <IconBarChart active={a} />,
  tabs: [
    { label: "Indicateurs", href: "/pilotage", match: ["/pilotage"], icon: (a) => <IconBarChart active={a} /> },
    { label: "Alertes", href: "/variations-prix", match: ["/variations-prix", "/alertes-prix"], icon: (a) => <IconTrendingUp active={a} /> },
  ],
};

const SECTION_PERF_PICCOLA: TabSection = {
  label: "Perf.",
  href: "/pilotage",
  match: ["/pilotage", "/variations-prix", "/alertes-prix", "/kezia"],
  icon: (a) => <IconBarChart active={a} />,
  tabs: [
    { label: "Indicateurs", href: "/pilotage", match: ["/pilotage"], icon: (a) => <IconBarChart active={a} /> },
    { label: "Alertes", href: "/variations-prix", match: ["/variations-prix", "/alertes-prix"], icon: (a) => <IconTrendingUp active={a} /> },
    { label: "Kezia", href: "/kezia", match: ["/kezia"], icon: (a) => <IconFileText active={a} /> },
  ],
};

const SECTION_OPS: TabSection = {
  label: "Ops",
  href: "/recettes",
  match: ["/catalogue", "/recettes", "/commandes", "/inventaire", "/epicerie", "/prep"],
  icon: (a) => <IconPackage active={a} />,
  tabs: [
    { label: "Catalogue", href: "/catalogue", match: ["/catalogue"], icon: (a) => <IconGrid active={a} /> },
    { label: "Fiches", href: "/recettes", match: ["/recettes", "/prep"], icon: (a) => <IconBook active={a} /> },
    { label: "Commandes", href: "/commandes", match: ["/commandes"], icon: (a) => <IconTruck active={a} /> },
    { label: "Inventaire", href: "/inventaire", match: ["/inventaire"], icon: (a) => <IconBox active={a} /> },
  ],
};

const SECTION_EVENTS: TabSection = {
  label: "Events",
  href: "/evenements",
  match: ["/evenements", "/clients", "/devis"],
  icon: (a) => <IconHeart active={a} />,
  tabs: [
    { label: "Entreprise", href: "/evenements", match: ["/evenements"], icon: (a) => <IconShoppingBag active={a} /> },
    { label: "Particuliers", href: "/evenements/clients", match: ["/evenements/clients"], icon: (a) => <IconUsers active={a} /> },
    { label: "Devis", href: "/devis/new", match: ["/devis"], icon: (a) => <IconFileText active={a} /> },
    { label: "Clients", href: "/clients", match: ["/clients"], icon: (a) => <IconBook active={a} /> },
  ],
};

const SECTIONS_BELLO: TabSection[] = [SECTION_PLANNING, SECTION_FINANCE, SECTION_ACHATS, SECTION_PERF, SECTION_OPS];
const SECTIONS_PICCOLA: TabSection[] = [SECTION_PLANNING, SECTION_ACHATS, SECTION_PERF_PICCOLA, SECTION_OPS, SECTION_EVENTS];

const ACTIVE_COLOR = "#2D6A4F";
const INACTIVE_COLOR = "#999";

/* ── Helpers ──────────────────────────────────────── */

function pathMatches(pathname: string, patterns: string[]): boolean {
  return patterns.some(m => pathname === m || pathname.startsWith(m + "/") || (m.endsWith("/") && pathname.startsWith(m)));
}

function getActiveSection(pathname: string, sections: TabSection[]): TabSection | null {
  for (const section of sections) {
    if (pathMatches(pathname, section.match)) return section;
  }
  return null;
}

/* ── Component ────────────────────────────────────── */

type Props = {
  onMenuClick: () => void;
};

export function BottomTabBar({ onMenuClick }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { role } = useProfile();
  const { current, isGroupView } = useEtablissement();

  if (!role) return null;

  const isPiccola = current?.slug?.includes("piccola");
  const sections = isPiccola ? SECTIONS_PICCOLA : SECTIONS_BELLO;
  const activeSection = getActiveSection(pathname, sections);

  // If inside a section with sub-tabs → show sub-tabs
  // Otherwise → show the 5 hub tabs (level 1)
  const showSubTabs = activeSection && activeSection.tabs.length > 0;

  // Determine establishment home route
  const etabHome = current?.slug?.includes("bello") ? "/bello-mio"
    : isPiccola ? "/piccola-mia"
    : null;

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
        {/* Menu button:
            - sub-tabs visible → back to level 1 hubs (go to dashboard or etab home)
            - level 1 + establishment selected → go to establishment dashboard
            - level 1 + group view → open sidebar */}
        <button
          type="button"
          onClick={() => {
            if (showSubTabs) {
              // Back to level 1: navigate to etab home or group dashboard
              router.push(etabHome ?? "/dashboard");
            } else if (etabHome && !isGroupView) {
              // At level 1 with an establishment selected → go to its dashboard
              router.push(etabHome);
            } else {
              // At level 1 in group view → open sidebar
              onMenuClick();
            }
          }}
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

        {showSubTabs ? (
          /* ── Level 2: sub-tabs of active section ── */
          activeSection.tabs.map((tab) => {
            const isActive = pathMatches(pathname, tab.match);
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
          })
        ) : (
          /* ── Level 1: hub tabs ── */
          sections.map((section) => {
            const isActive = activeSection === section;
            return (
              <button
                key={section.label}
                type="button"
                onClick={() => router.push(section.href)}
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
                {section.icon(isActive)}
                <span style={{
                  fontSize: 10,
                  fontWeight: isActive ? 700 : 500,
                  lineHeight: 1.2,
                  letterSpacing: 0.2,
                }}>
                  {section.label}
                </span>
              </button>
            );
          })
        )}
      </div>
    </nav>
  );
}
