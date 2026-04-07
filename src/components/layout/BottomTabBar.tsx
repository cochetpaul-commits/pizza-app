"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import type { Role } from "@/lib/rbac";
import { ChefHat, ShoppingBasket, Undo2 } from "lucide-react";

/* ── Icons ────────────────────────────────────────── */

function IconCalendar({ active: _active }: { active: boolean }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconWallet({ active: _active }: { active: boolean }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="16" rx="2" />
      <path d="M2 10h20" />
      <path d="M16 15h2" />
    </svg>
  );
}

function IconShoppingBag({ active: _active }: { active: boolean }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

function IconPackage({ active: _active }: { active: boolean }) {
  return <ChefHat size={24} strokeWidth={1.8} />;
}

function IconUsers({ active }: { active: boolean }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.2" : "1.8"} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconBeach({ active }: { active: boolean }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.2" : "1.8"} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="5" />
      <path d="M12 13v8" />
      <path d="M8 21h8" />
    </svg>
  );
}

function IconFileText({ active: _active }: { active: boolean }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function IconTrendingUp({ active }: { active: boolean }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.2" : "1.8"} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

function IconBook({ active: _active }: { active: boolean }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function IconTruck({ active }: { active: boolean }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.2" : "1.8"} strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" rx="1" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
}

function IconBox({ active: _active }: { active: boolean }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  );
}

function IconTag({ active: _active }: { active: boolean }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

function IconGrid({ active: _active }: { active: boolean }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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
  href: string;
  match: string[];
  icon: (active: boolean) => React.ReactNode;
  tabs: Tab[];
  roles?: Role[];
};

/* ── Sections with sub-tabs ──────────────────────── */

function IconHeart({ active: _active }: { active: boolean }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

const SECTION_MY_PLANNING: TabSection = {
  label: "Planning",
  href: "/mes-shifts",
  match: ["/mes-shifts"],
  icon: (a) => <IconCalendar active={a} />,
  roles: ["equipier"],
  tabs: [],
};

const SECTION_PERSONNEL: TabSection = {
  label: "Personnel",
  href: "/rh/equipe",
  match: ["/rh/", "/mes-shifts", "/plannings", "/personnel"],
  icon: (a) => <IconUsers active={a} />,
  roles: ["group_admin"],
  tabs: [
    { label: "Employes", href: "/rh/equipe", match: ["/rh/equipe", "/rh/employe"], icon: (a) => <IconUsers active={a} /> },
    { label: "Conges", href: "/rh/conges", match: ["/rh/conges"], icon: (a) => <IconBeach active={a} /> },
    { label: "Masse sal.", href: "/ventes/simulation", match: ["/ventes/simulation"], icon: (a) => <IconTrendingUp active={a} /> },
  ],
};

const SECTION_PILOTAGE: TabSection = {
  label: "Pilotage",
  href: "/ventes",
  match: ["/ventes", "/tresorerie"],
  icon: (a) => <IconWallet active={a} />,
  roles: ["group_admin"],
  tabs: [
    { label: "Ventes", href: "/ventes", match: ["/ventes"], icon: (a) => <IconWallet active={a} /> },
    { label: "Produits", href: "/ventes/marges", match: ["/ventes/marges"], icon: (a) => <IconTag active={a} /> },
    { label: "Tresorerie", href: "/tresorerie", match: ["/tresorerie"], icon: (a) => <IconTrendingUp active={a} /> },
  ],
};

const SECTION_ACHATS: TabSection = {
  label: "Achats",
  href: "/commandes",
  match: ["/achats", "/commandes", "/ingredients", "/invoices", "/fournisseurs", "/stats-achats"],
  icon: (a) => <IconShoppingBag active={a} />,
  roles: ["group_admin"],
  tabs: [
    { label: "Produits", href: "/ingredients", match: ["/ingredients"], icon: () => <ShoppingBasket size={24} strokeWidth={1.8} /> },
    { label: "Commandes", href: "/commandes", match: ["/commandes"], icon: (a) => <IconTruck active={a} /> },
    { label: "Factures", href: "/achats", match: ["/achats", "/invoices"], icon: (a) => <IconFileText active={a} /> },
  ],
};

const SECTION_PRODUCTION: TabSection = {
  label: "Prod.",
  href: "/recettes",
  match: ["/catalogue", "/recettes", "/inventaire", "/prep", "/ventes/articles"],
  icon: (a) => <IconPackage active={a} />,
  tabs: [
    { label: "Fiches", href: "/recettes", match: ["/recettes", "/prep"], icon: (a) => <IconBook active={a} /> },
    { label: "Catalogue", href: "/catalogue", match: ["/catalogue"], icon: (a) => <IconGrid active={a} /> },
    { label: "Articles", href: "/ventes/articles", match: ["/ventes/articles"], icon: (a) => <IconTag active={a} /> },
    { label: "Inventaire", href: "/inventaire", match: ["/inventaire"], icon: (a) => <IconBox active={a} /> },
  ],
};

const SECTION_PRODUCTION_PICCOLA: TabSection = {
  label: "Prod.",
  href: "/recettes",
  match: ["/catalogue", "/recettes", "/inventaire", "/epicerie", "/prep", "/ventes/articles"],
  icon: (a) => <IconPackage active={a} />,
  tabs: [
    { label: "Fiches", href: "/recettes", match: ["/recettes", "/prep"], icon: (a) => <IconBook active={a} /> },
    { label: "Catalogue", href: "/catalogue", match: ["/catalogue"], icon: (a) => <IconGrid active={a} /> },
    { label: "Articles", href: "/ventes/articles", match: ["/ventes/articles"], icon: (a) => <IconTag active={a} /> },
    { label: "Prix vente", href: "/epicerie", match: ["/epicerie"], icon: (a) => <IconTag active={a} /> },
    { label: "Inventaire", href: "/inventaire", match: ["/inventaire"], icon: (a) => <IconBox active={a} /> },
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

const SECTIONS_BELLO: TabSection[] = [SECTION_PILOTAGE, SECTION_PERSONNEL, SECTION_MY_PLANNING, SECTION_PRODUCTION, SECTION_ACHATS];
const SECTIONS_PICCOLA: TabSection[] = [SECTION_PILOTAGE, SECTION_PERSONNEL, SECTION_MY_PLANNING, SECTION_PRODUCTION_PICCOLA, SECTION_ACHATS, SECTION_EVENTS];


/* ── Helpers ──────────────────────────────────────── */

function pathMatches(pathname: string, patterns: string[]): boolean {
  return patterns.some(m => pathname === m || pathname.startsWith(m + "/") || (m.endsWith("/") && pathname.startsWith(m)));
}

function getActiveSection(pathname: string, sections: TabSection[]): TabSection | null {
  let best: TabSection | null = null;
  let bestLen = 0;
  for (const section of sections) {
    if (pathMatches(pathname, section.match)) {
      const maxMatch = Math.max(...section.match.map(m => (pathname === m || pathname.startsWith(m + "/") || pathname.startsWith(m)) ? m.length : 0));
      if (maxMatch > bestLen) { best = section; bestLen = maxMatch; }
    }
  }
  return best;
}

/* ── Component ────────────────────────────────────── */

export function BottomTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { role } = useProfile();
  const { current } = useEtablissement();

  // Hide entirely until an establishment is selected (no group view bar)
  if (!role || !current) return null;

  const isPiccola = current?.slug?.includes("piccola");
  const allSections = isPiccola ? SECTIONS_PICCOLA : SECTIONS_BELLO;
  const sections = allSections.filter(s => !s.roles || s.roles.includes(role));
  const activeSection = getActiveSection(pathname, sections);
  const etabColor = current?.couleur ?? "#b45f57";

  const etabHome = current?.slug?.includes("bello") ? "/bello-mio"
    : isPiccola ? "/piccola-mia"
    : null;

  // Hide entirely if there's no active section with tabs (e.g. on home page)
  if (!activeSection || activeSection.tabs.length === 0) return null;

  // Toggle pill style — active gets accent color background
  const toggleStyle = (isActive: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    cursor: "pointer", padding: "10px 16px",
    border: "none", borderRadius: 999,
    background: isActive ? etabColor : "transparent",
    color: isActive ? "#fff" : "#666",
    fontSize: 12, fontWeight: 700,
    fontFamily: "var(--font-oswald), Oswald, sans-serif",
    textTransform: "uppercase", letterSpacing: ".05em",
    transition: "all 0.2s cubic-bezier(.34,1.56,.64,1)",
    flexShrink: 0,
  });

  return (
    <nav className="bottom-tab-bar" style={{
      position: "fixed",
      bottom: "calc(14px + env(safe-area-inset-bottom, 0px))",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 100,
      display: "none",
      maxWidth: "calc(100vw - 24px)",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "5px 6px",
        borderRadius: 999,
        background: "rgba(245,240,232,0.85)",
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        border: "1px solid rgba(0,0,0,0.06)",
        boxShadow: "0 6px 24px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)",
        overflowX: "auto",
        scrollbarWidth: "none",
      }}>
        {/* Back chevron */}
        <button
          type="button"
          onClick={() => router.push(etabHome ?? "/dashboard")}
          style={{
            width: 38, height: 38, borderRadius: 999,
            border: "none", cursor: "pointer",
            background: "transparent",
            color: "#666",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            transition: "transform 0.12s",
          }}
          onTouchStart={e => { e.currentTarget.style.transform = "scale(0.88)"; }}
          onTouchEnd={e => { e.currentTarget.style.transform = "scale(1)"; }}
          aria-label="Retour"
        >
          <Undo2 size={20} strokeWidth={2.2} />
        </button>

        {/* Contextual section toggles */}
        {activeSection.tabs.map((tab) => {
          const isActive = pathMatches(pathname, tab.match);
          return (
            <button key={tab.href} type="button" onClick={() => router.push(tab.href)}
              style={toggleStyle(isActive)}
              onTouchStart={e => { e.currentTarget.style.transform = "scale(0.94)"; }}
              onTouchEnd={e => { e.currentTarget.style.transform = "scale(1)"; }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
