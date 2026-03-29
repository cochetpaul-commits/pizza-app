"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";

/* ── Icons ────────────────────────────────────────── */

function IconCalendar({ active: _active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconWallet({ active: _active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="16" rx="2" />
      <path d="M2 10h20" />
      <path d="M16 15h2" />
    </svg>
  );
}

function IconShoppingBag({ active: _active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

function _IconBarChart({ active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.5" : "2"} strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  );
}

function IconPackage({ active: _active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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

function IconFileText({ active: _active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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

function IconBook({ active: _active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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

function IconBox({ active: _active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  );
}

function IconTag({ active: _active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

function IconGrid({ active: _active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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

function IconHeart({ active: _active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

const SECTION_HOME: TabSection = {
  label: "Accueil",
  href: "/dashboard",
  match: ["/dashboard", "/bello-mio", "/piccola-mia", "/groupe"],
  icon: (a) => <IconGrid active={a} />,
  tabs: [],
};

const SECTION_PERSONNEL: TabSection = {
  label: "Personnel",
  href: "/rh/equipe",
  match: ["/rh/", "/mes-shifts", "/plannings", "/personnel"],
  icon: (a) => <IconUsers active={a} />,
  tabs: [
    { label: "Employes", href: "/rh/equipe", match: ["/rh/equipe", "/rh/employe"], icon: (a) => <IconUsers active={a} /> },
    { label: "Pointage", href: "/rh/pointage", match: ["/rh/pointage"], icon: (a) => <IconClock active={a} /> },
    { label: "Conges", href: "/rh/conges", match: ["/rh/conges"], icon: (a) => <IconBeach active={a} /> },
    { label: "Rapports", href: "/rh/rapports", match: ["/rh/rapports"], icon: (a) => <IconFileText active={a} /> },
    { label: "Simulation", href: "/ventes/simulation", match: ["/ventes/simulation"], icon: (a) => <IconTrendingUp active={a} /> },
  ],
};

const SECTION_VENTES: TabSection = {
  label: "Ventes",
  href: "/ventes",
  match: ["/ventes"],
  icon: (a) => <IconWallet active={a} />,
  tabs: [
    { label: "Marges", href: "/ventes/marges", match: ["/ventes/marges"], icon: (a) => <IconWallet active={a} /> },
    { label: "Insights", href: "/ventes/insights", match: ["/ventes/insights"], icon: (a) => <IconTrendingUp active={a} /> },
  ],
};

const SECTION_ACHATS: TabSection = {
  label: "Achats",
  href: "/commandes",
  match: ["/achats", "/commandes", "/ingredients", "/invoices", "/fournisseurs", "/stats-achats", "/factures-auto"],
  icon: (a) => <IconShoppingBag active={a} />,
  tabs: [
    { label: "Commandes", href: "/commandes", match: ["/commandes"], icon: (a) => <IconTruck active={a} /> },
    { label: "Factures", href: "/achats", match: ["/achats", "/invoices", "/factures-auto"], icon: (a) => <IconFileText active={a} /> },
    { label: "Produits", href: "/ingredients", match: ["/ingredients"], icon: (a) => <IconTag active={a} /> },
  ],
};

const SECTION_OPS: TabSection = {
  label: "Ops",
  href: "/recettes",
  match: ["/catalogue", "/recettes", "/inventaire", "/prep", "/ventes/articles"],
  icon: (a) => <IconPackage active={a} />,
  tabs: [
    { label: "Catalogue", href: "/catalogue", match: ["/catalogue"], icon: (a) => <IconGrid active={a} /> },
    { label: "Fiches", href: "/recettes", match: ["/recettes", "/prep"], icon: (a) => <IconBook active={a} /> },
    { label: "Inventaire", href: "/inventaire", match: ["/inventaire"], icon: (a) => <IconBox active={a} /> },
    { label: "Sim. prix", href: "/ventes/articles", match: ["/ventes/articles"], icon: (a) => <IconTag active={a} /> },
  ],
};

const SECTION_OPS_PICCOLA: TabSection = {
  label: "Ops",
  href: "/recettes",
  match: ["/catalogue", "/recettes", "/inventaire", "/epicerie", "/prep", "/ventes/articles"],
  icon: (a) => <IconPackage active={a} />,
  tabs: [
    { label: "Catalogue", href: "/catalogue", match: ["/catalogue"], icon: (a) => <IconGrid active={a} /> },
    { label: "Fiches", href: "/recettes", match: ["/recettes", "/prep"], icon: (a) => <IconBook active={a} /> },
    { label: "Prix vente", href: "/epicerie", match: ["/epicerie"], icon: (a) => <IconTag active={a} /> },
    { label: "Inventaire", href: "/inventaire", match: ["/inventaire"], icon: (a) => <IconBox active={a} /> },
    { label: "Sim. prix", href: "/ventes/articles", match: ["/ventes/articles"], icon: (a) => <IconTag active={a} /> },
  ],
};

const SECTION_EVENTS: TabSection = {
  label: "Events",
  href: "/evenements",
  match: ["/evenements", "/clients", "/devis"],
  icon: (a) => <IconHeart active={a} />,
  tabs: [
    { label: "Evenements", href: "/evenements", match: ["/evenements"], icon: (a) => <IconCalendar active={a} /> },
    { label: "Clients", href: "/clients", match: ["/clients"], icon: (a) => <IconUsers active={a} /> },
    { label: "Devis", href: "/devis", match: ["/devis"], icon: (a) => <IconFileText active={a} /> },
    { label: "Factures", href: "/clients/factures", match: ["/clients/factures"], icon: (a) => <IconWallet active={a} /> },
  ],
};

const SECTIONS_BELLO: TabSection[] = [SECTION_HOME, SECTION_PERSONNEL, SECTION_VENTES, SECTION_ACHATS, SECTION_OPS];
const SECTIONS_PICCOLA: TabSection[] = [SECTION_HOME, SECTION_PERSONNEL, SECTION_VENTES, SECTION_ACHATS, SECTION_OPS_PICCOLA, SECTION_EVENTS];

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

export function BottomTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { role } = useProfile();
  const { current, setCurrent, etablissements, isGroupView, setGroupView } = useEtablissement();
  const [etabMenuOpen, setEtabMenuOpen] = React.useState(false);
  const etabMenuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (etabMenuRef.current && !etabMenuRef.current.contains(e.target as Node)) {
        setEtabMenuOpen(false);
      }
    }
    if (etabMenuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [etabMenuOpen]);

  if (!role) return null;

  const isPiccola = current?.slug?.includes("piccola");
  const sections = isPiccola ? SECTIONS_PICCOLA : SECTIONS_BELLO;
  const activeSection = getActiveSection(pathname, sections);
  const showSubTabs = activeSection && activeSection.tabs.length > 0;
  const etabColor = isGroupView ? "#b45f57" : (current?.couleur ?? "#b45f57");

  const etabHome = current?.slug?.includes("bello") ? "/bello-mio"
    : isPiccola ? "/piccola-mia"
    : null;

  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: 2, cursor: "pointer", padding: "6px 4px", minWidth: 52, flex: 1,
    border: "none", borderRadius: 0,
    background: "transparent",
    color: isActive ? etabColor : INACTIVE_COLOR,
    transition: "color 0.15s",
  });

  return (
    <>
    {/* Floating establishment button — bottom right */}
    {/* Establishment button */}
    <div ref={etabMenuRef} className="etab-fab-wrap" style={{
      position: "fixed", bottom: "calc(76px + env(safe-area-inset-bottom, 0px))", right: 16, zIndex: 110, display: "none",
    }}>
      <button
        type="button"
        onClick={() => setEtabMenuOpen(prev => !prev)}
        className="etab-fab"
        style={{
          width: 50, height: 50,
          border: "none", cursor: "pointer",
          background: etabColor,
          boxShadow: `0 4px 14px ${etabColor}60, 0 2px 6px rgba(0,0,0,0.15)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "transform 0.15s, box-shadow 0.15s",
        }}
        onMouseDown={e => { e.currentTarget.style.transform = "scale(0.92)"; }}
        onMouseUp={e => { e.currentTarget.style.transform = "scale(1)"; }}
        onTouchStart={e => { e.currentTarget.style.transform = "scale(0.92)"; }}
        onTouchEnd={e => { e.currentTarget.style.transform = "scale(1)"; }}
      >
        {isGroupView ? (
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22V12h6v10" /><path d="M8 6h.01" /><path d="M16 6h.01" /><path d="M8 10h.01" /><path d="M16 10h.01" /></svg>
        ) : (
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" /><path d="M10 10h4" /></svg>
        )}
      </button>

      {/* Dropdown above button */}
      {etabMenuOpen && (
        <div style={{
          position: "absolute", right: 0, bottom: "calc(100% + 8px)",
          minWidth: 180,
          background: "rgba(255,255,255,0.96)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 14, overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,0.14)",
        }}>
          <button type="button" onClick={() => { setGroupView(true); setEtabMenuOpen(false); }} style={{
            display: "flex", alignItems: "center", gap: 10,
            width: "100%", padding: "12px 16px",
            border: "none", cursor: "pointer",
            background: isGroupView ? "rgba(180,95,87,0.08)" : "transparent",
            borderLeft: isGroupView ? "3px solid #b45f57" : "3px solid transparent",
          }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#b45f57" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22V12h6v10" /><path d="M8 6h.01" /><path d="M16 6h.01" /><path d="M8 10h.01" /><path d="M16 10h.01" /></svg>
            <span style={{ fontSize: 14, fontWeight: isGroupView ? 700 : 500, color: "#2c2c2c" }}>iFratelli Group</span>
          </button>
          <div style={{ height: 1, background: "rgba(0,0,0,0.06)", margin: "0 12px" }} />
          {etablissements.map(e => {
            const isSelected = !isGroupView && current?.id === e.id;
            const clr = e.couleur ?? "#b45f57";
            return (
              <button key={e.id} type="button" onClick={() => { setGroupView(false); setCurrent(e); setEtabMenuOpen(false); }} style={{
                display: "flex", alignItems: "center", gap: 10,
                width: "100%", padding: "12px 16px",
                border: "none", cursor: "pointer",
                background: isSelected ? `${clr}12` : "transparent",
                borderLeft: isSelected ? `3px solid ${clr}` : "3px solid transparent",
              }}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={clr} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" /><path d="M10 10h4" /></svg>
                <span style={{ fontSize: 14, fontWeight: isSelected ? 700 : 500, color: "#2c2c2c" }}>{e.nom}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>

    <nav className="bottom-tab-bar" style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
      display: "none",
      background: "rgba(245,245,247,0.85)",
      backdropFilter: "blur(20px) saturate(180%)",
      WebkitBackdropFilter: "blur(20px) saturate(180%)",
      borderTop: "1px solid rgba(0,0,0,0.06)",
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
    }}>
      <div style={{
        display: "flex", alignItems: "center",
        height: 60, maxWidth: 500, margin: "0 auto",
        padding: "4px 6px", gap: 2,
      }}>
        {showSubTabs ? (
          <>
            <button type="button" onClick={() => router.push(etabHome ?? "/dashboard")} style={tabStyle(false)}>
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
              <span style={{ fontSize: 9, fontWeight: 600, lineHeight: 1 }}>Retour</span>
            </button>
            {activeSection.tabs.map((tab) => {
              const isActive = pathMatches(pathname, tab.match);
              return (
                <button key={tab.href} type="button" onClick={() => router.push(tab.href)} style={tabStyle(isActive)}>
                  {tab.icon(isActive)}
                  <span style={{ fontSize: 9, fontWeight: isActive ? 700 : 500, lineHeight: 1 }}>{tab.label}</span>
                </button>
              );
            })}
          </>
        ) : (
          sections.map((section) => {
            const isActive = activeSection === section;
            return (
              <button key={section.label} type="button" onClick={() => router.push(section.href)} style={tabStyle(isActive)}>
                {section.icon(isActive)}
                <span style={{ fontSize: 9, fontWeight: isActive ? 700 : 500, lineHeight: 1 }}>{section.label}</span>
              </button>
            );
          })
        )}
      </div>
    </nav>
    </>
  );
}
