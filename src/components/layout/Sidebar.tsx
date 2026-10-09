"use client";

import React, { useState, useRef, useEffect, useMemo, useSyncExternalStore, type CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import { navEtablissement, NAV_EQUIPIER, NAV_GROUPE, type NavEntry, type NavItemV2 } from "./SidebarNav";
import {
  IconDashboard, IconUsers, IconCalendar, IconClock, IconBeach,
  IconClipboard, IconCalculator, IconSettings, IconWallet,
  IconShoppingBag, IconTruck, IconFileText, IconPackage,
  IconBarChart, IconTrendingUp, IconBook, IconTag,
  IconCalendarEvent, IconBox, IconChefHat,
  IconSwitch, IconBuilding, IconStore,
} from "./Icons";
import type { Role } from "@/lib/rbac";

/**
 * Barre latérale bureau, calquée sur ComandR (08/10/2026) : logo, un bouton
 * d'établissement avec chevron, puis une liste à plat avec une icône par
 * entrée ; seules Analyse, HACCP, Événementiel et Paramètres se déploient.
 * Changer d'établissement garde la page ouverte. Le mobile (MobileHeader,
 * BottomTabBar) n'est pas concerné.
 */

const ICON_MAP: Record<string, React.FC<{ size?: number; color?: string }>> = {
  dashboard: IconDashboard, users: IconUsers, calendar: IconCalendar,
  clock: IconClock, beach: IconBeach, clipboard: IconClipboard,
  calculator: IconCalculator, settings: IconSettings, wallet: IconWallet,
  shoppingBag: IconShoppingBag, truck: IconTruck, fileText: IconFileText,
  package: IconPackage, barChart: IconBarChart, trendingUp: IconTrendingUp,
  book: IconBook, tag: IconTag, calendarEvent: IconCalendarEvent,
  box: IconBox, chefHat: IconChefHat, building: IconBuilding, store: IconStore,
};

const ROLE_LABELS: Record<string, string> = {
  group_admin: "DIRECTION", admin: "ADMIN", manager: "MANAGER",
  cuisine: "CUISINE", salle: "SALLE", plonge: "PLONGE",
};

const abonnerHash = (rappel: () => void) => {
  window.addEventListener("hashchange", rappel);
  window.addEventListener("popstate", rappel);
  return () => { window.removeEventListener("hashchange", rappel); window.removeEventListener("popstate", rappel); };
};
const lireHash = () => window.location.hash;

const C = {
  bgItem: "rgba(0,0,0,0.035)",
  bgItemActive: "rgba(0,0,0,0.06)",
  textMuted: "rgba(0,0,0,0.48)",
  textNormal: "rgba(0,0,0,0.72)",
  textActive: "#1a1a1a",
  divider: "rgba(0,0,0,0.06)",
  border: "rgba(0,0,0,0.10)",
  ifratelli: "#b45f57",
  piccolaMia: "#e6c428",
};

function isRoleAllowed(roles: Role[] | undefined, role: Role | null): boolean {
  if (!roles) return true;
  if (!role) return false;
  return roles.includes(role);
}

/* ═══════════════════════════════════════════════════════
   CONTENU
   ═══════════════════════════════════════════════════════ */

function SidebarContent() {
  const pathname = usePathname();
  const router = useRouter();
  const { role, can } = useProfile();
  const { current, setCurrent, etablissements, isGroupView, setGroupView } = useEtablissement();

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [etabOpen, setEtabOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!etabOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setEtabOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [etabOpen]);

  const isManager = role === "group_admin" || role === "manager";
  const isPiccola = !!current?.slug?.includes("piccola");
  const accueil = isPiccola ? "/piccola-mia" : "/bello-mio";
  const etabColor = isGroupView ? C.ifratelli : (current?.couleur ?? C.ifratelli);

  // Visibilité d'une page : rôle, puis permission (rôle + exceptions de la fiche employé)
  const visible = (item: { roles?: Role[]; permission?: string }) =>
    isRoleAllowed(item.roles, role) && (!item.permission || can(item.permission));

  const entries: NavEntry[] = useMemo(() => {
    const liste = !isManager ? NAV_EQUIPIER : isGroupView ? NAV_GROUPE : navEtablissement(accueil, isPiccola);
    return liste
      .map((e) => (e.kind === "group" ? { ...e, items: e.items.filter(visible) } : e))
      .filter((e) => (e.kind === "page" ? visible(e) : e.kind === "group" ? visible(e) && e.items.length > 0 : true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager, isGroupView, accueil, isPiccola, role, can]);

  const allHrefs = useMemo(
    () => entries.flatMap((e) => (e.kind === "page" ? [e.href] : e.kind === "group" ? e.items.map((i) => i.href) : [])),
    [entries],
  );

  // Ancre de l'URL (#couverts…) : les entrées « Chiffre d'affaires » et « Couverts » pointent la même page
  const hash = useSyncExternalStore(abonnerHash, lireHash, () => "");
  const isActive = (hrefComplet: string) => {
    const [href, ancre] = hrefComplet.split("#");
    if (ancre !== undefined) return pathname === href && hash === `#${ancre}`;
    if (pathname === href) return !allHrefs.some((h) => h.startsWith(href + "#") && hash === h.slice(href.length));
    if (!pathname.startsWith(href + "/")) return false;
    // /ventes ne doit pas s'allumer quand une page plus précise (/ventes/marges) est dans la liste
    return !allHrefs.some((h) => h !== href && h.startsWith(href + "/") && (pathname === h || pathname.startsWith(h + "/")));
  };

  /* ── Choix de l'établissement ── */
  const choisirEtab = (etab: (typeof etablissements)[number]) => {
    setEtabOpen(false);
    const depuisGroupe = isGroupView || pathname === "/dashboard" || pathname === "/groupe";
    setGroupView(false);
    setCurrent(etab);
    // On garde la page ouverte ; depuis la vue groupe, on ouvre l'accueil de l'établissement
    if (depuisGroupe) router.push(etab.slug?.includes("piccola") ? "/piccola-mia" : "/bello-mio");
  };
  const choisirGroupe = () => {
    setEtabOpen(false);
    setGroupView(true);
    router.push("/dashboard");
  };
  const etabLabel = isGroupView ? "iFratelli Group" : (current?.nom ?? "Choisir…");
  const etabChoixPossible = etablissements.length > 1 || role === "group_admin";

  /* ── Rendu d'une page ── */
  const renderPage = (item: NavItemV2, niveau: 0 | 1) => {
    const active = isActive(item.href);
    const hov = hovered === item.href;
    const IconComp = item.icon ? ICON_MAP[item.icon] : null;
    return (
      <Link
        key={item.href}
        href={item.href}
        onMouseEnter={() => setHovered(item.href)}
        onMouseLeave={() => setHovered(null)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: niveau === 0 ? "8px 12px" : "6px 12px 6px 38px",
          margin: "1px 10px", borderRadius: 9,
          textDecoration: "none",
          fontSize: niveau === 0 ? 13.5 : 12.5, fontWeight: active ? 700 : 500,
          color: active ? C.textActive : hov ? C.textNormal : niveau === 0 ? C.textNormal : C.textMuted,
          background: active ? C.bgItemActive : hov ? C.bgItem : "transparent",
          transition: "background 0.12s ease, color 0.12s ease",
          whiteSpace: "nowrap", overflow: "hidden",
        }}
      >
        {IconComp && <IconComp size={niveau === 0 ? 18 : 15} color={active ? etabColor : C.textMuted} />}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</span>
      </Link>
    );
  };

  /* ── Rendu d'un groupe à chevron (Analyse, HACCP, Événementiel, Paramètres) ── */
  const renderGroup = (group: Extract<NavEntry, { kind: "group" }>) => {
    const hasActiveChild = group.items.some((it) => isActive(it.href));
    const open = openGroups[group.label] ?? hasActiveChild;
    const hov = hovered === `group:${group.label}`;
    const IconComp = group.icon ? ICON_MAP[group.icon] : null;
    const btn: CSSProperties = {
      display: "flex", alignItems: "center", gap: 10,
      width: "calc(100% - 20px)", padding: "8px 12px", margin: "1px 10px", borderRadius: 9,
      background: hov ? C.bgItem : "transparent",
      border: "none", cursor: "pointer", textAlign: "left",
      color: hasActiveChild ? C.textActive : hov ? C.textNormal : C.textNormal,
      fontSize: 13.5, fontWeight: hasActiveChild ? 700 : 500,
      fontFamily: "inherit",
      whiteSpace: "nowrap", overflow: "hidden",
      transition: "background 0.12s ease, color 0.12s ease",
    };
    return (
      <div key={`group:${group.label}`}>
        <button
          type="button"
          onClick={() => setOpenGroups((prev) => ({ ...prev, [group.label]: !open }))}
          onMouseEnter={() => setHovered(`group:${group.label}`)}
          onMouseLeave={() => setHovered(null)}
          aria-expanded={open}
          style={btn}
        >
          {IconComp && <IconComp size={18} color={hasActiveChild ? etabColor : C.textMuted} />}
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{group.label}</span>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: open ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s", opacity: 0.55, flexShrink: 0 }}>
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </button>
        {open && <div style={{ marginBottom: 4 }}>{group.items.map((it) => renderPage(it, 1))}</div>}
      </div>
    );
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      color: C.textNormal,
      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      width: "100%",
    }}>
      {/* Logo */}
      <div style={{ padding: "18px 18px 10px", display: "flex", alignItems: "center", gap: 9 }}>
        <Image src="/logo-ifratelli.png" alt="iFratelli" width={30} height={30}
          style={{ width: 30, height: 30, objectFit: "contain", borderRadius: 8, flexShrink: 0 }} />
        <span style={{ fontFamily: "var(--font-oswald), 'Oswald', sans-serif", fontSize: 17, fontWeight: 700, color: C.textActive, letterSpacing: 0.6, lineHeight: 1 }}>
          iFratelli
        </span>
      </div>

      {/* Établissement */}
      <div ref={dropdownRef} style={{ position: "relative", padding: "0 10px 6px" }}>
        <button
          type="button"
          onClick={() => etabChoixPossible && setEtabOpen((o) => !o)}
          aria-haspopup={etabChoixPossible ? "listbox" : undefined}
          aria-expanded={etabChoixPossible ? etabOpen : undefined}
          style={{
            display: "flex", alignItems: "center", gap: 8, width: "100%",
            padding: "8px 10px", borderRadius: 10,
            border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.7)",
            cursor: etabChoixPossible ? "pointer" : "default", textAlign: "left",
            color: C.textActive, fontSize: 13, fontWeight: 600, fontFamily: "inherit",
            whiteSpace: "nowrap", overflow: "hidden",
          }}
        >
          {isGroupView ? <IconBuilding size={16} color={etabColor} /> : <IconStore size={16} color={etabColor} />}
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{etabLabel}</span>
          {etabChoixPossible && (
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
              style={{ opacity: 0.55, flexShrink: 0, transform: etabOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          )}
        </button>

        {etabOpen && (
          <div role="listbox" style={{
            position: "absolute", left: 10, right: 10, top: "calc(100% - 2px)", zIndex: 60,
            background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12,
            boxShadow: "0 10px 30px rgba(0,0,0,0.12)", padding: 6,
          }}>
            {etablissements.map((etab) => {
              const selected = !isGroupView && current?.id === etab.id;
              const color = etab.couleur ?? C.ifratelli;
              return (
                <button key={etab.id} type="button" role="option" aria-selected={selected} onClick={() => choisirEtab(etab)}
                  style={{
                    display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "8px 10px",
                    borderRadius: 8, border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                    background: selected ? C.bgItemActive : "transparent", color: C.textActive,
                    fontSize: 13, fontWeight: selected ? 700 : 500,
                  }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{etab.nom}</span>
                </button>
              );
            })}
            {role === "group_admin" && (
              <>
                <div style={{ height: 1, background: C.divider, margin: "4px 6px" }} />
                <button type="button" role="option" aria-selected={isGroupView} onClick={choisirGroupe}
                  style={{
                    display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "8px 10px",
                    borderRadius: 8, border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                    background: isGroupView ? C.bgItemActive : "transparent", color: C.textActive,
                    fontSize: 13, fontWeight: isGroupView ? 700 : 500,
                  }}>
                  <IconBuilding size={15} color={C.ifratelli} />
                  <span style={{ flex: 1 }}>iFratelli Group</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Liste */}
      <nav style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "4px 0 8px" }}>
        {!isManager || isGroupView || current ? entries.map((e, i) => {
          if (e.kind === "divider") {
            return (
              <div key={`div-${i}`} style={{ padding: "14px 22px 4px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textMuted }}>
                {e.label ?? ""}
              </div>
            );
          }
          if (e.kind === "group") return renderGroup(e);
          return renderPage(e, 0);
        }) : (
          <div style={{ padding: "14px 22px", fontSize: 12.5, color: C.textMuted }}>Choisissez un établissement.</div>
        )}
      </nav>

      {/* Pied */}
      <div style={{ padding: "12px 16px 16px", borderTop: `1px solid ${C.divider}` }}>
        {role && (
          <div style={{
            background: etabColor,
            color: etabColor === C.piccolaMia ? "#5a4a1a" : "#fff",
            borderRadius: 20, padding: "8px 16px",
            textAlign: "center", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", marginBottom: 10,
          }}>
            Session {ROLE_LABELS[role]?.toLowerCase() ?? role}
          </div>
        )}
        <Link href="/session"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, textDecoration: "none", fontSize: 12, color: C.textMuted }}>
          <IconSwitch size={18} color={C.textMuted} />
          <span>Changer de session</span>
        </Link>
      </div>
    </div>
  );
}

/* ── Exports ── */

export function Sidebar() {
  return (
    <>
      <aside className="sidebar-desktop" style={{ position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 40, overflowY: "auto", overflowX: "hidden" }}>
        <SidebarContent />
      </aside>
      <SidebarToggle />
    </>
  );
}

/** Bouton replier/déplier la sidebar (desktop + tablette), persisté */
function SidebarToggle() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed") === "1";
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(true);
      document.documentElement.classList.add("sidebar-collapsed");
    }
    return () => { document.documentElement.classList.remove("sidebar-collapsed"); };
  }, []);

  const toggle = () => {
    setCollapsed(c => {
      const next = !c;
      document.documentElement.classList.toggle("sidebar-collapsed", next);
      try { localStorage.setItem("sidebar-collapsed", next ? "1" : "0"); } catch { /* */ }
      return next;
    });
  };

  return (
    <button
      type="button"
      className="sidebar-toggle-btn"
      onClick={toggle}
      title={collapsed ? "Ouvrir le menu" : "Replier le menu"}
      aria-label={collapsed ? "Ouvrir le menu" : "Replier le menu"}
      style={{
        width: 34, height: 34, borderRadius: 10,
        border: "1px solid rgba(0,0,0,0.08)",
        background: collapsed ? "#fff" : "transparent",
        boxShadow: collapsed ? "0 2px 10px rgba(0,0,0,0.10)" : "none",
        color: "#8d8577", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <line x1="9" y1="4" x2="9" y2="20" />
      </svg>
    </button>
  );
}
