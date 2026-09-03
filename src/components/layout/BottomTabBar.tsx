"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import type { Role } from "@/lib/rbac";
import { ChefHat, ShoppingBasket } from "lucide-react";
import { useBottomBar, type BottomBarAction } from "@/lib/BottomBarContext";

/* ── Icons ────────────────────────────────────────── */

function IconStore() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l1-4h16l1 4" />
      <path d="M3 9c0 1.1.9 2 2 2s2-.9 2-2 .9-2 2-2 2 .9 2 2-.9 2-2 2-2-.9-2-2 .9-2 2-2 2 .9 2 2-.9 2-2 2-2-.9-2-2" />
      <path d="M5 11v10h14V11" />
      <path d="M9 21V15h6v6" />
    </svg>
  );
}

function IconBuilding() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22V12h6v10" />
      <path d="M8 6h.01" /><path d="M16 6h.01" />
      <path d="M8 10h.01" /><path d="M16 10h.01" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconWallet() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="16" rx="2" />
      <path d="M2 10h20" />
      <path d="M16 15h2" />
    </svg>
  );
}

function IconShoppingBag() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

function IconPackage() {
  return <ChefHat size={24} strokeWidth={1.5} />;
}

function IconUsers() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconBeach() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="5" />
      <path d="M12 13v8" />
      <path d="M8 21h8" />
    </svg>
  );
}

function IconFileText() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function IconBarChart() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="6" y1="20" x2="6" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="18" y1="20" x2="18" y2="14" />
    </svg>
  );
}
function IconTrendingUp() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

function IconBook() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function IconTruck() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" rx="1" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
}

function IconBox() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    </svg>
  );
}

function IconTag() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

function IconClipboard() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="4" width="12" height="18" rx="2" />
      <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <path d="M9 11h6M9 15h4" />
    </svg>
  );
}

function IconThermometer() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 14.6V5a2 2 0 1 0-4 0v9.6a4 4 0 1 0 4 0z" />
    </svg>
  );
}

function IconBrush() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.07" />
      <path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z" />
    </svg>
  );
}

function IconBarcode() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5v14M7 5v14M11 5v14M15 5v9M19 5v14" />
    </svg>
  );
}

function IconPrinter() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9V3h12v6" />
      <rect x="3" y="9" width="18" height="9" rx="2" />
      <rect x="6" y="14" width="12" height="7" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  );
}

function IconHeart() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function IconChevronLeft() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function IconMenu() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

/* ── Tab types ────────────────────────────────────── */

type Tab = {
  label: string;
  href: string;
  match: string[];
  icon: () => React.ReactNode;
  /** Optional permission key — tab hidden if user lacks this permission */
  permission?: string;
  /** Optional role filter — tab hidden if user role not in the list */
  roles?: Role[];
};

type TabSection = {
  label: string;
  href: string;
  match: string[];
  icon: () => React.ReactNode;
  tabs: Tab[];
  roles?: Role[];
  permission?: string;
};

/* ── Sections with sub-tabs ──────────────────────── */

const SECTION_MY_PLANNING: TabSection = {
  label: "Personnel",
  href: "/mes-conges",
  match: ["/mes-conges", "/rh/conges", "/rh/equipe", "/rh/employe"],
  icon: () => <IconUsers />,
  // Ouvert a tous : les equipiers y trouvent "Mes conges"
  tabs: [
    { label: "Mes conges", href: "/mes-conges", match: ["/mes-conges"], icon: () => <IconBeach /> },
    { label: "Employes", href: "/rh/equipe", match: ["/rh/equipe", "/rh/employe"], icon: () => <IconUsers />, roles: ["group_admin", "manager"] },
    { label: "Conges equipe", href: "/rh/conges", match: ["/rh/conges"], icon: () => <IconBeach />, roles: ["group_admin", "manager"] },
  ],
};

const SECTION_PILOTAGE: TabSection = {
  label: "Pilotage",
  href: "/mon-tableau",
  match: ["/mon-tableau", "/pilotage", "/ventes", "/rentabilite", "/rh/masse-salariale"],
  icon: () => <IconWallet />,
  // Pas de permission : "Mon tableau" est ouvert a tous les employes
  tabs: [
    // Admins : vision globale via "Tableau", pas de tableau personnalise
    { label: "Mon tableau", href: "/mon-tableau", match: ["/mon-tableau"], icon: () => <IconBarChart />, roles: ["manager", "equipier"] },
    { label: "Ventes", href: "/ventes", match: ["/ventes"], icon: () => <IconWallet />, permission: "performances.view" },
    { label: "Rentabilite", href: "/rentabilite", match: ["/rentabilite"], icon: () => <IconTrendingUp />, permission: "performances.pilotage" },
    { label: "Produits", href: "/ventes/marges", match: ["/ventes/marges"], icon: () => <IconTag />, permission: "performances.pilotage" },
    { label: "Masse sal.", href: "/rh/masse-salariale", match: ["/rh/masse-salariale"], icon: () => <IconTrendingUp />, permission: "performances.pilotage" },
  ],
};

const SECTION_ACHATS: TabSection = {
  label: "Achats",
  href: "/commandes",
  match: ["/achats", "/commandes", "/ingredients", "/invoices", "/fournisseurs", "/variations-prix", "/admin/popina-catalogue", "/stock"],
  icon: () => <IconShoppingBag />,
  roles: ["group_admin", "manager", "equipier"],
  tabs: [
    { label: "Produits", href: "/ingredients", match: ["/ingredients"], icon: () => <ShoppingBasket size={24} strokeWidth={1.5} /> },
    { label: "Commandes", href: "/commandes", match: ["/commandes"], icon: () => <IconTruck /> },
    { label: "Stock", href: "/stock", match: ["/stock"], icon: () => <IconBox /> },
    { label: "Factures", href: "/achats", match: ["/achats", "/invoices", "/variations-prix"], icon: () => <IconFileText /> },
    { label: "Catalogue Popina", href: "/admin/popina-catalogue", match: ["/admin/popina-catalogue"], icon: () => <IconTag /> },
  ],
};

const SECTION_PRODUCTION: TabSection = {
  label: "Production",
  href: "/recettes",
  match: ["/catalogue", "/recettes", "/inventaire", "/prep"],
  roles: ["group_admin", "manager", "equipier"],
  icon: () => <IconPackage />,
  tabs: [
    { label: "Fiches tech.", href: "/recettes", match: ["/recettes", "/prep"], icon: () => <IconBook /> },
    { label: "Catalogue", href: "/catalogue", match: ["/catalogue"], icon: () => <IconGrid /> },
    { label: "Inventaire", href: "/inventaire", match: ["/inventaire"], icon: () => <IconBox /> },
  ],
};

const SECTION_PRODUCTION_PICCOLA: TabSection = {
  label: "Production",
  href: "/recettes",
  match: ["/catalogue", "/recettes", "/inventaire", "/epicerie", "/prep"],
  icon: () => <IconPackage />,
  tabs: [
    { label: "Fiches tech.", href: "/recettes", match: ["/recettes", "/prep"], icon: () => <IconBook /> },
    { label: "Catalogue", href: "/catalogue", match: ["/catalogue"], icon: () => <IconGrid /> },
    { label: "Prix vente", href: "/epicerie", match: ["/epicerie"], icon: () => <IconTag /> },
    { label: "Inventaire", href: "/inventaire", match: ["/inventaire"], icon: () => <IconBox /> },
  ],
};

const SECTION_EVENTS: TabSection = {
  label: "Events",
  href: "/evenements",
  match: ["/evenements", "/clients", "/devis"],
  roles: ["group_admin", "manager"],
  icon: () => <IconHeart />,
  tabs: [
    { label: "Evenements", href: "/evenements", match: ["/evenements"], icon: () => <IconCalendar /> },
    { label: "Clients", href: "/clients", match: ["/clients"], icon: () => <IconUsers /> },
    { label: "Devis", href: "/devis", match: ["/devis"], icon: () => <IconFileText /> },
    { label: "Factures", href: "/clients/factures", match: ["/clients/factures"], icon: () => <IconWallet /> },
  ],
};

const SECTION_HACCP: TabSection = {
  label: "HACCP",
  href: "/haccp",
  match: ["/haccp"],
  icon: () => <IconClipboard />,
  roles: ["group_admin", "manager"],
  tabs: [
    { label: "Tableau", href: "/haccp", match: ["/haccp"], icon: () => <IconClipboard /> },
    { label: "Temperatures", href: "/haccp/temperatures", match: ["/haccp/temperatures"], icon: () => <IconThermometer /> },
    { label: "Nettoyage", href: "/haccp/cleaning", match: ["/haccp/cleaning"], icon: () => <IconBrush /> },
    { label: "Tracabilite", href: "/haccp/tracability", match: ["/haccp/tracability"], icon: () => <IconBarcode /> },
    { label: "Reception", href: "/haccp/reception", match: ["/haccp/reception"], icon: () => <IconBox /> },
    { label: "Etiqueteuse", href: "/haccp/labels", match: ["/haccp/labels"], icon: () => <IconPrinter /> },
  ],
};

const SECTION_ACHATS_PICCOLA: TabSection = {
  ...SECTION_ACHATS,
  tabs: SECTION_ACHATS.tabs.filter(t => t.href !== "/admin/popina-catalogue"),
  match: SECTION_ACHATS.match.filter(m => m !== "/admin/popina-catalogue"),
};

function IconSettings() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

const SECTION_SETTINGS: TabSection = {
  label: "Parametres",
  href: "/settings/categories",
  match: ["/settings", "/fournisseurs"],
  icon: () => <IconSettings />,
  roles: ["group_admin"],
  tabs: [
    { label: "Categories", href: "/settings/categories", match: ["/settings/categories"], icon: () => <IconTag /> },
    { label: "Etablissement", href: "/settings/etablissements", match: ["/settings/etablissements"], icon: () => <IconStore /> },
    { label: "Fournisseurs", href: "/fournisseurs", match: ["/fournisseurs"], icon: () => <IconTruck /> },
    { label: "Mon compte", href: "/settings/account", match: ["/settings/account"], icon: () => <IconUsers /> },
  ],
};

const SECTIONS_BELLO: TabSection[] = [SECTION_PILOTAGE, SECTION_PRODUCTION, SECTION_ACHATS, SECTION_HACCP, SECTION_MY_PLANNING, SECTION_SETTINGS];
const SECTIONS_PICCOLA: TabSection[] = [SECTION_PILOTAGE, SECTION_PRODUCTION_PICCOLA, SECTION_ACHATS_PICCOLA, SECTION_HACCP, SECTION_EVENTS, SECTION_MY_PLANNING, SECTION_SETTINGS];

/* ── Helpers ──────────────────────────────────────── */

function pathMatches(pathname: string, patterns: string[]): boolean {
  return patterns.some(m => pathname === m || pathname.startsWith(m + "/") || (m.endsWith("/") && pathname.startsWith(m)));
}

function matchScore(pathname: string, patterns: string[]): number {
  let best = -1;
  for (const m of patterns) {
    if (pathname === m || pathname.startsWith(m + "/")) {
      if (m.length > best) best = m.length;
    }
  }
  return best;
}

function findActiveTab<T extends { match: string[] }>(pathname: string, tabs: T[]): T | null {
  let best: T | null = null;
  let bestLen = -1;
  for (const tab of tabs) {
    const s = matchScore(pathname, tab.match);
    if (s > bestLen) { bestLen = s; best = tab; }
  }
  return bestLen >= 0 ? best : null;
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

/* ── Action row for drawer ── */
function ActionRow({ action, onDone, etabColor }: { action: BottomBarAction; onDone: () => void; etabColor: string }) {
  const accent = action.accent || etabColor;
  if (action.fileAccept && action.onFileChange) {
    return (
      <label style={{
        display: "flex", alignItems: "center", gap: 14,
        padding: "14px 16px", borderRadius: 14, width: "100%",
        background: "rgba(255,255,255,0.55)",
        borderLeft: `4px solid ${accent}`, cursor: "pointer",
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: `${accent}15`, color: accent,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>{action.icon}</div>
        <span style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a" }}>{action.label}</span>
        <input type="file" accept={action.fileAccept} style={{ display: "none" }} onChange={e => {
          const f = e.target.files?.[0];
          if (f) action.onFileChange?.(f);
          e.target.value = "";
          onDone();
        }} />
      </label>
    );
  }
  return (
    <button type="button" onClick={() => { onDone(); action.onClick(); }} style={{
      display: "flex", alignItems: "center", gap: 14,
      padding: "14px 16px", borderRadius: 14, width: "100%",
      border: "none", background: "rgba(255,255,255,0.55)",
      borderLeft: `4px solid ${accent}`, cursor: "pointer", textAlign: "left",
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: `${accent}15`, color: accent,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>{action.icon}</div>
      <span style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a" }}>{action.label}</span>
    </button>
  );
}

/* ── iOS-style BottomSheet (internal) ─────────────── */

function Sheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentDelta = useRef(0);
  const dragging = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    currentDelta.current = 0;
    dragging.current = true;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging.current) return;
    const delta = e.touches[0].clientY - startY.current;
    currentDelta.current = Math.max(0, delta);
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${currentDelta.current}px)`;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    dragging.current = false;
    if (currentDelta.current > 80) {
      onClose();
    } else if (sheetRef.current) {
      sheetRef.current.style.transform = "translateY(0)";
    }
    currentDelta.current = 0;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      document.body.classList.add("bottom-sheet-open");
    }
    return () => {
      document.body.style.overflow = "";
      document.body.classList.remove("bottom-sheet-open");
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.25)",
        backdropFilter: "blur(12px) saturate(150%)",
        WebkitBackdropFilter: "blur(12px) saturate(150%)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          position: "fixed", bottom: 0, left: 8, right: 8,
          maxHeight: "82dvh",
          background: "rgba(245,240,232,0.92)",
          backdropFilter: "blur(40px) saturate(200%)",
          WebkitBackdropFilter: "blur(40px) saturate(200%)",
          borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.5)",
          boxShadow: "0 -2px 12px rgba(0,0,0,0.06), 0 -8px 40px rgba(0,0,0,0.10)",
          marginBottom: "calc(8px + env(safe-area-inset-bottom, 0px))",
          overflowY: "auto",
          transform: "translateY(0)",
          transition: "transform 0.25s ease",
          animation: "bottomSheetSlideUp 0.25s ease",
        }}
      >
        {/* Handle bar */}
        <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 2px" }}>
          <div style={{ width: 36, height: 5, borderRadius: 3, background: "rgba(0,0,0,0.12)" }} />
        </div>
        {children}
      </div>
      <style>{`
        @keyframes bottomSheetSlideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

/* ── Tile component (iOS-style rounded card) ──────── */

function Tile({
  icon,
  label,
  isActive,
  color,
  onClick,
  compact,
}: {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  color: string;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: compact ? 6 : 8,
        padding: compact ? "14px 8px" : "18px 8px",
        borderRadius: 16,
        border: "none",
        cursor: "pointer",
        background: isActive
          ? `linear-gradient(135deg, ${color}20 0%, ${color}10 100%)`
          : "rgba(255,255,255,0.65)",
        boxShadow: isActive
          ? `0 2px 8px ${color}18, 0 0 0 1.5px ${color}30`
          : "0 1px 4px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.04)",
        transition: "all 0.18s ease",
        minWidth: 0,
      }}
    >
      <div style={{
        width: compact ? 38 : 44,
        height: compact ? 38 : 44,
        borderRadius: 12,
        background: isActive ? `${color}22` : "rgba(0,0,0,0.03)",
        color: isActive ? color : "#666",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.18s ease",
      }}>
        {icon}
      </div>
      <span style={{
        fontSize: compact ? 11 : 12,
        fontWeight: isActive ? 700 : 600,
        color: isActive ? color : "#444",
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        letterSpacing: "0.01em",
        textAlign: "center",
        lineHeight: 1.2,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: "100%",
      }}>
        {label}
      </span>
    </button>
  );
}

/* ── Component ────────────────────────────────────── */

export function BottomTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { role, can } = useProfile();
  const { current, setCurrent, etablissements, isGroupView, setGroupView, isGroupAdmin } = useEtablissement();
  const { actions: contextActions } = useBottomBar();
  const hasActions = contextActions.length > 0;

  // Menu state: null = closed, "sections" = section grid, TabSection = sub-tab view
  const [menuState, setMenuState] = useState<null | "sections" | TabSection>(null);
  const [etabDrawerOpen, setEtabDrawerOpen] = useState(false);
  const [actionsFabOpen, setActionsFabOpen] = useState(false);

  // Listen for "open-etab-drawer" event from MobileHeader
  useEffect(() => {
    const handler = () => setEtabDrawerOpen(true);
    window.addEventListener("open-etab-drawer", handler);
    return () => window.removeEventListener("open-etab-drawer", handler);
  }, []);

  // Close FAB when context actions change (page navigation)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setActionsFabOpen(false); }, [contextActions]);

  if (!role) return null;

  const showNavPill = !!current;
  const isPiccola = current?.slug?.includes("piccola");
  const allSections = isPiccola ? SECTIONS_PICCOLA : SECTIONS_BELLO;
  const sections = allSections.filter(s => {
    if (s.roles && !s.roles.includes(role!)) return false;
    if (s.permission && !can(s.permission)) return false;
    return true;
  });
  const activeSection = getActiveSection(pathname, sections);
  const etabColor = current?.couleur ?? "#b45f57";

  const closeMenu = () => setMenuState(null);

  const handleSectionTap = (section: TabSection) => {
    // Ne proposer que les onglets permis a l'utilisateur
    const allowedTabs = section.tabs.filter(t =>
      (!t.permission || can(t.permission)) && (!t.roles || (role && t.roles.includes(role)))
    );
    if (allowedTabs.length === 0) {
      router.push(section.href);
      closeMenu();
      return;
    }
    if (allowedTabs.length === 1) {
      router.push(allowedTabs[0].href);
      closeMenu();
      return;
    }
    setMenuState({ ...section, tabs: allowedTabs });
  };

  const handleTabTap = (href: string) => {
    closeMenu();
    router.push(href);
  };

  const menuOpen = menuState !== null;

  return (
    <>
      {/* ── Main menu sheet (sections grid OR sub-tabs) ── */}
      <Sheet open={menuOpen} onClose={closeMenu}>
        {menuState === "sections" ? (
          <>
            {/* Header */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "6px 18px 12px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: `${etabColor}18`, color: etabColor,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <IconStore />
                </div>
                <span style={{
                  fontSize: 15, fontWeight: 700,
                  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                  textTransform: "uppercase", letterSpacing: 1, color: "#2c2c2c",
                }}>
                  {current?.nom ?? "Menu"}
                </span>
              </div>
              <button
                type="button"
                onClick={closeMenu}
                style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: "rgba(0,0,0,0.06)", border: "none",
                  color: "#999", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Le choix de l'entreprise se fait depuis le bandeau du haut (EtabPill) */}

            {/* Section tiles grid */}
            {showNavPill && (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 8,
                padding: "0 14px 14px",
              }}>
                {sections.length === 0 && (
                  <div style={{ gridColumn: "1 / -1", textAlign: "center", color: "#999", fontSize: 13, padding: "18px 0" }}>Chargement du menu…</div>
                )}
                {sections.map(section => (
                  <Tile
                    key={section.label}
                    icon={section.icon()}
                    label={section.label}
                    isActive={activeSection === section}
                    color={etabColor}
                    onClick={() => handleSectionTap(section)}
                  />
                ))}
              </div>
            )}
          </>
        ) : menuState ? (
          <>
            {/* Sub-section header with back button */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 14px 12px",
            }}>
              <button
                type="button"
                onClick={() => setMenuState("sections")}
                style={{
                  width: 32, height: 32, borderRadius: 10,
                  background: "rgba(0,0,0,0.05)", border: "none",
                  cursor: "pointer", color: "#666",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <IconChevronLeft />
              </button>
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                background: `${etabColor}18`, color: etabColor,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {menuState.icon()}
              </div>
              <span style={{
                fontSize: 15, fontWeight: 700,
                fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                textTransform: "uppercase", letterSpacing: 1, color: "#2c2c2c",
                flex: 1,
              }}>
                {menuState.label}
              </span>
              <button
                type="button"
                onClick={closeMenu}
                style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: "rgba(0,0,0,0.06)", border: "none",
                  color: "#999", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Sub-tabs grid */}
            <div style={{
              display: "grid",
              gridTemplateColumns: menuState.tabs.length <= 4 ? "repeat(2, 1fr)" : "repeat(3, 1fr)",
              gap: 8,
              padding: "0 14px 14px",
            }}>
              {menuState.tabs.map(tab => {
                const isActive = findActiveTab(pathname, menuState.tabs) === tab;
                return (
                  <Tile
                    key={tab.href}
                    icon={tab.icon()}
                    label={tab.label}
                    isActive={isActive}
                    color={etabColor}
                    onClick={() => handleTabTap(tab.href)}
                    compact={menuState.tabs.length > 4}
                  />
                );
              })}
            </div>
          </>
        ) : null}
      </Sheet>

      {/* ── Tiroir entreprise (ouvert par le sélecteur du bandeau du haut) ── */}
      <Sheet open={etabDrawerOpen} onClose={() => setEtabDrawerOpen(false)}>
        <div style={{ padding: "6px 18px 4px" }}>
          <span style={{
            fontSize: 15, fontWeight: 700,
            fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
            textTransform: "uppercase", letterSpacing: 1, color: "#2c2c2c",
          }}>Entreprise</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 14px 14px" }}>
          {isGroupAdmin && (
            <button type="button" onClick={() => {
              setGroupView(true); setCurrent(null); setEtabDrawerOpen(false);
              router.push("/groupe");
            }} style={{
              display: "flex", alignItems: "center", gap: 14,
              width: "100%", padding: "16px 18px",
              border: "none", cursor: "pointer", borderRadius: 16,
              background: isGroupView ? "rgba(180,95,87,0.10)" : "rgba(255,255,255,0.55)",
              borderLeft: isGroupView ? "4px solid #b45f57" : "4px solid transparent",
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: isGroupView ? "rgba(180,95,87,0.20)" : "rgba(0,0,0,0.04)",
                color: isGroupView ? "#b45f57" : "#666",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <IconBuilding />
              </div>
              <span style={{
                fontSize: 15, fontWeight: isGroupView ? 700 : 500,
                color: isGroupView ? "#b45f57" : "#1a1a1a",
                fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
              }}>iFratelli Group</span>
            </button>
          )}
          {etablissements.map(e => {
            const isSelected = !isGroupView && current?.id === e.id;
            const clr = e.couleur ?? "#b45f57";
            return (
              <button key={e.id} type="button" onClick={() => {
                setGroupView(false); setCurrent(e); setEtabDrawerOpen(false);
                const slug = e.slug?.includes("piccola") ? "/piccola-mia" : "/bello-mio";
                router.push(slug);
              }} style={{
                display: "flex", alignItems: "center", gap: 14,
                width: "100%", padding: "16px 18px",
                border: "none", cursor: "pointer", borderRadius: 16,
                background: isSelected ? `${clr}15` : "rgba(255,255,255,0.55)",
                borderLeft: isSelected ? `4px solid ${clr}` : "4px solid transparent",
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: isSelected ? `${clr}25` : "rgba(0,0,0,0.04)",
                  color: isSelected ? clr : "#666",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <IconStore />
                </div>
                <span style={{
                  fontSize: 15, fontWeight: isSelected ? 700 : 500,
                  color: isSelected ? clr : "#1a1a1a",
                  fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                }}>{e.nom}</span>
              </button>
            );
          })}
        </div>
      </Sheet>

      {/* ── Floating bottom bar ── */}
      <nav className="bottom-tab-bar" style={{
        position: "fixed",
        bottom: "calc(14px + env(safe-area-inset-bottom, 0px))",
        left: 0, right: 0,
        zIndex: 100,
        display: "none",
        padding: "0 12px",
      }}>
        <div style={{ display: "flex", alignItems: "stretch", justifyContent: "center", gap: 8 }}>
          {/* Menu pill */}
          <div style={{
            display: "flex", alignItems: "center", gap: 2,
            padding: "4px 6px",
            borderRadius: 22,
            background: "rgba(255,255,255,0.78)",
            backdropFilter: "blur(28px) saturate(200%)",
            WebkitBackdropFilter: "blur(28px) saturate(200%)",
            border: "1px solid rgba(255,255,255,0.6)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.06), 0 8px 32px rgba(0,0,0,0.08)",
          }}>
            {/* Menu button */}
            <button
              type="button"
              onClick={() => setMenuState("sections")}
              style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                cursor: "pointer", padding: "6px 14px 4px",
                border: "none", borderRadius: 10,
                background: "transparent",
                color: etabColor,
                fontSize: 9, fontWeight: 600,
                fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                gap: 2,
              }}
              aria-label="Menu"
            >
              <IconMenu />
              <span>Menu</span>
            </button>

            {/* Active section shortcut (quick re-open to sub-tabs) */}
            {showNavPill && activeSection && activeSection.tabs.length > 0 && (
              <button
                type="button"
                onClick={() => setMenuState(activeSection)}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", padding: "6px 14px 4px",
                  border: "none", borderRadius: 10,
                  background: `${etabColor}14`,
                  color: etabColor,
                  fontSize: 9, fontWeight: 700,
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                  gap: 2,
                  minWidth: 48,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22 }}>
                  {activeSection.icon()}
                </span>
                <span>{activeSection.label}</span>
              </button>
            )}
          </div>

          {/* Context FAB */}
          {hasActions && (
            <div className="bottom-bar-fab" style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              padding: "4px 8px",
              borderRadius: 22,
              background: "rgba(245,240,232,0.82)",
              backdropFilter: "blur(28px) saturate(200%)",
              WebkitBackdropFilter: "blur(28px) saturate(200%)",
              border: "1px solid rgba(255,255,255,0.5)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.08), 0 0 1px rgba(0,0,0,0.06)",
            }}>
              <button
                type="button"
                onClick={() => {
                  if (contextActions.length === 1 && !contextActions[0].fileAccept) {
                    contextActions[0].onClick();
                  } else {
                    setActionsFabOpen(v => !v);
                  }
                }}
                style={{
                  width: 46, height: 46, borderRadius: "50%",
                  border: "none", background: "transparent",
                  color: etabColor, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "color 0.15s",
                }}
              >
                {contextActions.length === 1 ? contextActions[0].icon : (
                  <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                )}
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Actions drawer */}
      {hasActions && (
        <Sheet open={actionsFabOpen} onClose={() => setActionsFabOpen(false)}>
          <div style={{ padding: "6px 18px 4px" }}>
            <span style={{
              fontSize: 15, fontWeight: 700,
              fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
              textTransform: "uppercase", letterSpacing: 1, color: "#2c2c2c",
            }}>Actions</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 14px 14px" }}>
            {contextActions.map((action: BottomBarAction) => (
              <ActionRow key={action.key} action={action} onDone={() => setActionsFabOpen(false)} etabColor={etabColor} />
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}
