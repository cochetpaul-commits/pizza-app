"use client";

import React, { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import type { Role } from "@/lib/rbac";
import { ChefHat, ShoppingBasket } from "lucide-react";
import { useBottomBar, type BottomBarAction } from "@/lib/BottomBarContext";
import { BottomSheet } from "./BottomSheet";

/* ── Icon: Building ────────────────────────────────── */
/* Store icon for establishments */
function IconStore() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l1-4h16l1 4" />
      <path d="M3 9c0 1.1.9 2 2 2s2-.9 2-2 .9-2 2-2 2 .9 2 2-.9 2-2 2-2-.9-2-2 .9-2 2-2 2 .9 2 2-.9 2-2 2-2-.9-2-2" />
      <path d="M5 11v10h14V11" />
      <path d="M9 21V15h6v6" />
    </svg>
  );
}

/* Building icon for holding/group */
function IconBuilding() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22V12h6v10" />
      <path d="M8 6h.01" /><path d="M16 6h.01" />
      <path d="M8 10h.01" /><path d="M16 10h.01" />
    </svg>
  );
}

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

function IconClipboard({ active: _active }: { active: boolean }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="4" width="12" height="18" rx="2" />
      <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
      <path d="M9 11h6M9 15h4" />
    </svg>
  );
}

function IconThermometer({ active: _active }: { active: boolean }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 14.6V5a2 2 0 1 0-4 0v9.6a4 4 0 1 0 4 0z" />
    </svg>
  );
}

function IconBrush({ active: _active }: { active: boolean }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.07" />
      <path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z" />
    </svg>
  );
}

function IconBarcode({ active: _active }: { active: boolean }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5v14M7 5v14M11 5v14M15 5v9M19 5v14" />
    </svg>
  );
}

function IconPrinter({ active: _active }: { active: boolean }) {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9V3h12v6" />
      <rect x="3" y="9" width="18" height="9" rx="2" />
      <rect x="6" y="14" width="12" height="7" />
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
  permission?: string;
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
  roles: ["group_admin", "manager"],
  permission: "planning.view_own",
  tabs: [],
};

const _SECTION_PERSONNEL: TabSection = {
  label: "Personnel",
  href: "/rh/equipe",
  match: ["/rh/", "/mes-shifts", "/plannings", "/personnel"],
  icon: (a) => <IconUsers active={a} />,
  roles: ["group_admin"],
  tabs: [
    { label: "Employes", href: "/rh/equipe", match: ["/rh/equipe", "/rh/employe"], icon: (a) => <IconUsers active={a} /> },
    { label: "Conges", href: "/rh/conges", match: ["/rh/conges"], icon: (a) => <IconBeach active={a} /> },
  ],
};

const SECTION_PILOTAGE: TabSection = {
  label: "Pilotage",
  href: "/ventes",
  match: ["/ventes", "/tresorerie", "/rh/masse-salariale"],
  icon: (a) => <IconWallet active={a} />,
  roles: ["group_admin", "manager"],
  tabs: [
    { label: "Ventes", href: "/ventes", match: ["/ventes"], icon: (a) => <IconWallet active={a} /> },
    { label: "Produits", href: "/ventes/marges", match: ["/ventes/marges"], icon: (a) => <IconTag active={a} /> },
    { label: "Masse sal.", href: "/rh/masse-salariale", match: ["/rh/masse-salariale", "/ventes/simulation"], icon: (a) => <IconTrendingUp active={a} /> },
    { label: "Tresorerie", href: "/tresorerie", match: ["/tresorerie"], icon: (a) => <IconTrendingUp active={a} /> },
  ],
};

const SECTION_ACHATS: TabSection = {
  label: "Achats",
  href: "/commandes",
  match: ["/achats", "/commandes", "/ingredients", "/invoices", "/fournisseurs", "/stats-achats", "/variations-prix", "/admin/popina-catalogue", "/stock"],
  icon: (a) => <IconShoppingBag active={a} />,
  roles: ["group_admin", "manager", "equipier"],
  tabs: [
    { label: "Produits", href: "/ingredients", match: ["/ingredients"], icon: () => <ShoppingBasket size={24} strokeWidth={1.8} /> },
    { label: "Commandes", href: "/commandes", match: ["/commandes"], icon: (a) => <IconTruck active={a} /> },
    { label: "Stock", href: "/stock", match: ["/stock"], icon: (a) => <IconBox active={a} /> },
    { label: "Factures", href: "/achats", match: ["/achats", "/invoices"], icon: (a) => <IconFileText active={a} /> },
    { label: "Stats prix", href: "/variations-prix", match: ["/variations-prix"], icon: (a) => <IconTrendingUp active={a} /> },
    { label: "Catalogue Popina", href: "/admin/popina-catalogue", match: ["/admin/popina-catalogue"], icon: (a) => <IconTag active={a} /> },
  ],
};

const SECTION_PRODUCTION: TabSection = {
  label: "Prod.",
  href: "/recettes",
  match: ["/catalogue", "/recettes", "/inventaire", "/prep"],
  icon: (a) => <IconPackage active={a} />,
  tabs: [
    { label: "Fiches", href: "/recettes", match: ["/recettes", "/prep"], icon: (a) => <IconBook active={a} /> },
    { label: "Catalogue", href: "/catalogue", match: ["/catalogue"], icon: (a) => <IconGrid active={a} /> },

    { label: "Inventaire", href: "/inventaire", match: ["/inventaire"], icon: (a) => <IconBox active={a} /> },
  ],
};

const SECTION_PRODUCTION_PICCOLA: TabSection = {
  label: "Prod.",
  href: "/recettes",
  match: ["/catalogue", "/recettes", "/inventaire", "/epicerie", "/prep"],
  icon: (a) => <IconPackage active={a} />,
  tabs: [
    { label: "Fiches", href: "/recettes", match: ["/recettes", "/prep"], icon: (a) => <IconBook active={a} /> },
    { label: "Catalogue", href: "/catalogue", match: ["/catalogue"], icon: (a) => <IconGrid active={a} /> },

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

const SECTION_HACCP: TabSection = {
  label: "HACCP",
  href: "/haccp",
  match: ["/haccp"],
  icon: (a) => <IconClipboard active={a} />,
  roles: ["group_admin", "manager"],
  tabs: [
    { label: "Tableau",       href: "/haccp",                match: ["/haccp"],                icon: (a) => <IconClipboard active={a} /> },
    { label: "Températures",  href: "/haccp/temperatures",   match: ["/haccp/temperatures"],   icon: (a) => <IconThermometer active={a} /> },
    { label: "Nettoyage",     href: "/haccp/cleaning",       match: ["/haccp/cleaning"],       icon: (a) => <IconBrush active={a} /> },
    { label: "Traçabilité",   href: "/haccp/tracability",    match: ["/haccp/tracability"],    icon: (a) => <IconBarcode active={a} /> },
    { label: "Réception",     href: "/haccp/reception",      match: ["/haccp/reception"],      icon: (a) => <IconBox active={a} /> },
    { label: "Étiqueteuse",   href: "/haccp/labels",         match: ["/haccp/labels"],         icon: (a) => <IconPrinter active={a} /> }
  ]
};

const SECTIONS_BELLO: TabSection[] = [SECTION_PILOTAGE, SECTION_MY_PLANNING, SECTION_PRODUCTION, SECTION_ACHATS, SECTION_HACCP];
const SECTIONS_PICCOLA: TabSection[] = [SECTION_PILOTAGE, SECTION_MY_PLANNING, SECTION_PRODUCTION_PICCOLA, SECTION_ACHATS, SECTION_HACCP, SECTION_EVENTS];


/* ── Helpers ──────────────────────────────────────── */

function pathMatches(pathname: string, patterns: string[]): boolean {
  return patterns.some(m => pathname === m || pathname.startsWith(m + "/") || (m.endsWith("/") && pathname.startsWith(m)));
}

/** Length of the longest pattern in `match` that covers the pathname (or -1). */
function matchScore(pathname: string, patterns: string[]): number {
  let best = -1;
  for (const m of patterns) {
    if (pathname === m || pathname.startsWith(m + "/")) {
      if (m.length > best) best = m.length;
    }
  }
  return best;
}

/** Pick the single tab whose match pattern has the longest overlap. */
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

/* ── Short labels for sections in pill ──────────── */

const SECTION_SHORT_LABEL: Record<string, string> = {
  Pilotage: "Pilotage",
  Personnel: "Personnel",
  Planning: "Planning",
  "Prod.": "Prod.",
  Achats: "Achats",
  HACCP: "HACCP",
  Events: "Events",
};

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

/* ── Component ────────────────────────────────────── */

export function BottomTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { role, can } = useProfile();
  const { current, setCurrent, etablissements, isGroupView, setGroupView, isGroupAdmin } = useEtablissement();
  const [drawerSection, setDrawerSection] = useState<TabSection | null>(null);
  const [etabDrawerOpen, setEtabDrawerOpen] = useState(false);
  const [actionsFabOpen, setActionsFabOpen] = useState(false);
  const { actions: contextActions } = useBottomBar();
  const hasActions = contextActions.length > 0;

  // Listen for "open-etab-drawer" event from MobileHeader
  useEffect(() => {
    const handler = () => setEtabDrawerOpen(true);
    window.addEventListener("open-etab-drawer", handler);
    return () => window.removeEventListener("open-etab-drawer", handler);
  }, []);

  // Close FAB when context actions change (page navigation)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setActionsFabOpen(false); }, [contextActions]);

  // Hide until role is known; show even in group view (for etab FAB)
  if (!role) return null;

  // In group view (no current etab), show only the etab FAB
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
  const canSwitchEtab = isGroupAdmin || etablissements.length > 1;

  const handleSectionClick = (section: TabSection) => {
    if (section.tabs.length === 0) {
      // No sub-tabs → navigate directly to the section href
      router.push(section.href);
      return;
    }
    setDrawerSection(section);
  };

  const handleTabClick = (href: string) => {
    setDrawerSection(null);
    router.push(href);
  };

  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    cursor: "pointer", padding: "6px 12px 4px",
    border: "none", borderRadius: 12,
    background: isActive ? `${etabColor}18` : "transparent",
    color: isActive ? etabColor : "#999",
    fontSize: 9, fontWeight: 600,
    fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
    letterSpacing: ".02em",
    transition: "all 0.15s",
    flexShrink: 0,
    whiteSpace: "nowrap",
    gap: 2,
    minWidth: 48,
  });

  return (
    <>
      {/* ── Section drawer ── */}
      <BottomSheet
        open={!!drawerSection}
        onClose={() => setDrawerSection(null)}
        title={drawerSection?.label ?? ""}
      >
        {(() => {
          const activeDrawerTab = drawerSection ? findActiveTab(pathname, drawerSection.tabs) : null;
          return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {drawerSection?.tabs.map((tab) => {
            const isActive = tab === activeDrawerTab;
            return (
              <button
                key={tab.href}
                type="button"
                onClick={() => handleTabClick(tab.href)}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  width: "100%", padding: "16px 18px",
                  border: "none", cursor: "pointer",
                  borderRadius: 16,
                  background: isActive ? `${etabColor}15` : "rgba(255,255,255,0.55)",
                  borderLeft: isActive ? `4px solid ${etabColor}` : "4px solid transparent",
                  transition: "background 0.15s",
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: isActive ? `${etabColor}25` : "rgba(0,0,0,0.04)",
                  color: isActive ? etabColor : "#666",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  {tab.icon(isActive)}
                </div>
                <span style={{
                  fontSize: 15,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? etabColor : "#1a1a1a",
                  fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                }}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
          );
        })()}
      </BottomSheet>

      {/* ── Etab drawer ── */}
      <BottomSheet
        open={etabDrawerOpen}
        onClose={() => setEtabDrawerOpen(false)}
        title="Etablissement"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
              }}>
                iFratelli Group
              </span>
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
                }}>
                  {e.nom}
                </span>
              </button>
            );
          })}
        </div>
      </BottomSheet>

      {/* ── Floating bottom bar: nav pill (left) + context actions (right) ── */}
      <nav className="bottom-tab-bar" style={{
        position: "fixed",
        bottom: "calc(14px + env(safe-area-inset-bottom, 0px))",
        left: 0, right: 0,
        zIndex: 100,
        display: "none",
        padding: "0 12px",
      }}>
        <div style={{ display: "flex", alignItems: "stretch", justifyContent: "center", gap: 8 }}>
          {/* Nav pill */}
          <div style={{
            display: "flex", alignItems: "center", gap: 2,
            padding: "4px 8px",
            borderRadius: 22,
            background: "rgba(245,240,232,0.82)",
            backdropFilter: "blur(28px) saturate(200%)",
            WebkitBackdropFilter: "blur(28px) saturate(200%)",
            border: "1px solid rgba(255,255,255,0.5)",
            boxShadow: "0 4px 20px rgba(0,0,0,0.08), 0 0 1px rgba(0,0,0,0.06)",
          }}>
            {/* Etab button */}
            {canSwitchEtab && (
              <button
                type="button"
                onClick={() => setEtabDrawerOpen(true)}
                style={{
                  ...tabStyle(false),
                  color: etabColor,
                }}
                aria-label="Changer d'etablissement"
              >
                <IconStore />
                <span>Etab.</span>
              </button>
            )}
            {showNavPill && sections.map((section) => {
              const isActive = activeSection === section;
              const label = SECTION_SHORT_LABEL[section.label] ?? section.label;
              return (
                <button
                  key={section.label}
                  type="button"
                  onClick={() => handleSectionClick(section)}
                  style={tabStyle(isActive)}
                >
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22 }}>
                    {section.icon(isActive)}
                  </span>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {/* Context FAB — same glass style as navbar */}
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

      {/* Actions drawer — outside <nav> so it doesn't get hidden by bottom-sheet-open CSS */}
      {hasActions && (
        <BottomSheet open={actionsFabOpen} onClose={() => setActionsFabOpen(false)} title="Actions">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {contextActions.map((action: BottomBarAction) => (
              <ActionRow key={action.key} action={action} onDone={() => setActionsFabOpen(false)} etabColor={etabColor} />
            ))}
          </div>
        </BottomSheet>
      )}
    </>
  );
}
