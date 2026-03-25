"use client";

import React, { useState, useCallback, useRef, useEffect, type CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import {
  SIDEBAR_NAV_SIMPLE,
  PERSONNEL_SECTION,
  VENTES_SECTION,
  ACHATS_SECTION,
  OPERATIONS_SECTION,
  EVENEMENTIEL_SECTION,
  type NavSubSection,
  type NavItemV2,
  type NavSettingsGroup,
  type SidebarEntry,
} from "./SidebarNav";
import {
  IconDashboard, IconUsers, IconCalendar, IconClock, IconBeach,
  IconClipboard, IconCalculator, IconSettings, IconWallet,
  IconShoppingBag, IconTruck, IconFileText, IconPackage,
  IconBarChart, IconTrendingUp, IconBook, IconTag,
  IconCalendarEvent, IconBox, IconChefHat,
  IconSwitch, IconBuilding, IconStore,
} from "./Icons";
import type { Role } from "@/lib/rbac";

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

const C = {
  bg: "#1a1512",
  bgItem: "rgba(255,255,255,0.04)",
  bgItemActive: "rgba(255,255,255,0.08)",
  textMuted: "rgba(255,255,255,0.45)",
  textNormal: "rgba(255,255,255,0.7)",
  textActive: "#fff",
  divider: "rgba(255,255,255,0.06)",
  ifratelli: "#b45f57",
  piccolaMia: "#efd199",
};

function isRoleAllowed(roles: Role[] | undefined, role: Role | null): boolean {
  if (!roles) return true;
  if (!role) return false;
  return roles.includes(role);
}

/* ═══════════════════════════════════════════════════════
   SIDEBAR CONTENT
   ═══════════════════════════════════════════════════════ */

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { role } = useProfile();
  const { current, setCurrent, etablissements, isGroupView, setGroupView } = useEtablissement();

  const [openHub, setOpenHub] = useState<string | null>(null);
  const [openSettingsSub, setOpenSettingsSub] = useState<string | null>(null);
  const [etabDropdownOpen, setEtabDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const toggleHub = useCallback((key: string) => {
    setOpenHub(prev => prev === key ? null : key);
  }, []);

  const toggleSettingsSub = useCallback((key: string) => {
    setOpenSettingsSub(prev => prev === key ? null : key);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setEtabDropdownOpen(false);
      }
    }
    if (etabDropdownOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [etabDropdownOpen]);

  const isAdmin = role === "group_admin" || role === "manager";
  const etabColor = isGroupView ? C.ifratelli : (current?.couleur ?? C.ifratelli);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const handleNav = () => { onNavigate?.(); };

  // Determine which sections to show based on context
  const isPiccola = current?.slug?.includes("piccola");
  const sections: NavSubSection[] = isAdmin
    ? isGroupView
      ? [VENTES_SECTION, ACHATS_SECTION]  // Groupe = piloter
      : [                                  // Établissement = agir
          PERSONNEL_SECTION,
          VENTES_SECTION,
          ACHATS_SECTION,
          OPERATIONS_SECTION,
          ...(isPiccola ? [EVENEMENTIEL_SECTION] : []),
        ]
    : [];

  /* ── Render nav item (level 3) ── */
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const renderItem = (item: NavItemV2) => {
    if (!isRoleAllowed(item.roles, role)) return null;
    const active = isActive(item.href);
    const itemKey = item.href;
    const hovered = hoveredItem === itemKey;

    return (
      <Link
        key={itemKey}
        href={item.href}
        onClick={handleNav}
        onMouseEnter={() => setHoveredItem(itemKey)}
        onMouseLeave={() => setHoveredItem(null)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "5px 16px 5px 44px",
          margin: "1px 8px", borderRadius: 6,
          textDecoration: "none",
          fontSize: 13, fontWeight: active ? 600 : 400,
          color: active ? C.textActive : hovered ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.5)",
          background: active ? `${etabColor}12` : hovered ? "rgba(255,255,255,0.04)" : "transparent",
          borderLeft: active ? `2px solid ${etabColor}60` : "2px solid transparent",
          transition: "background 0.12s, color 0.12s",
          whiteSpace: "nowrap", overflow: "hidden",
        }}
      >
        <span style={{ color: active ? etabColor : "rgba(255,255,255,0.3)", fontSize: 8, flexShrink: 0 }}>●</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</span>
      </Link>
    );
  };

  /* ── Render hub (level 2 — accordion section) ── */
  const [hoveredHub, setHoveredHub] = useState<string | null>(null);

  const renderHub = (sub: NavSubSection) => {
    if (!isRoleAllowed(sub.roles, role)) return null;
    const items = sub.items.filter(i => isRoleAllowed(i.roles, role));
    if (items.length === 0 && !sub.href) return null;

    const hubKey = sub.label;
    const isOpen = openHub === hubKey;
    const hovered = hoveredHub === hubKey;
    const SectionIcon = sub.icon ? ICON_MAP[sub.icon] : null;
    const hasActiveChild = items.some(it => isActive(it.href));

    const hubBtnStyle: CSSProperties = {
      display: "flex", alignItems: "center", gap: 8,
      width: "calc(100% - 16px)", padding: "8px 12px 8px 16px",
      margin: "1px 8px", borderRadius: 6,
      background: isOpen ? `${etabColor}14` : hovered ? "rgba(255,255,255,0.06)" : "transparent",
      border: "none", cursor: items.length > 0 ? "pointer" : "default",
      borderLeft: isOpen ? `2px solid ${etabColor}80` : "2px solid transparent",
      color: (isOpen || hasActiveChild) ? "rgba(255,255,255,0.9)" : hovered ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.5)",
      fontSize: 14, fontWeight: 700,
      whiteSpace: "nowrap", overflow: "hidden",
      transition: "background 0.15s, color 0.15s, border-color 0.15s",
    };

    return (
      <div key={hubKey} style={{ marginBottom: isOpen ? 4 : 2 }}>
        <button
          type="button"
          onClick={() => {
            if (items.length > 0) {
              toggleHub(hubKey);
              if (sub.href) router.push(sub.href);
            } else if (sub.href) {
              router.push(sub.href);
              onNavigate?.();
            }
          }}
          onMouseEnter={() => setHoveredHub(hubKey)}
          onMouseLeave={() => setHoveredHub(null)}
          style={hubBtnStyle}
        >
          {SectionIcon && <SectionIcon size={15} color={(isOpen || hasActiveChild) ? `${etabColor}CC` : hovered ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.35)"} />}
          <span style={{ flex: 1, textAlign: "left" }}>{sub.label}</span>
        </button>
        {isOpen && (
          <div style={{ marginBottom: 6 }}>
            {items.map(item => renderItem(item))}
          </div>
        )}
      </div>
    );
  };

  /* ── Render settings group ── */
  const [settingsOpen, setSettingsOpen] = useState(false);

  const settingsEntry: NavSettingsGroup = {
    kind: "settings",
    label: "Parametres",
    icon: "settings",
    roles: ["group_admin"],
    sections: [
      {
        label: "",
        items: [
          { label: "Etablissement", href: "/settings/etablissements", icon: "building" },
          { label: "Employes", href: "/settings/employes", icon: "users" },
          { label: "Fournisseurs", href: "/fournisseurs", icon: "truck" },
        ],
      },
      {
        label: "",
        items: [
          { label: "Mon compte", href: "/settings/account", icon: "settings" },
        ],
      },
    ],
  };

  const renderSettings = () => {
    if (!isRoleAllowed(settingsEntry.roles, role)) return null;
    const SettingsIcon = settingsEntry.icon ? ICON_MAP[settingsEntry.icon] : null;

    return (
      <div style={{ marginBottom: 2 }}>
        <button
          type="button"
          onClick={() => setSettingsOpen(prev => !prev)}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 16px", margin: "1px 8px", width: "calc(100% - 16px)",
            borderRadius: 6, border: "none", cursor: "pointer",
            borderLeft: settingsOpen ? `2px solid ${etabColor}80` : "2px solid transparent",
            fontSize: 14, fontWeight: 700, color: settingsOpen ? "rgba(255,255,255,0.9)" : C.textNormal,
            background: settingsOpen ? C.bgItemActive : "transparent",
            transition: "background 0.15s, color 0.15s",
          }}
        >
          {SettingsIcon && <SettingsIcon size={15} color={settingsOpen ? etabColor : C.textMuted} />}
          <span style={{ flex: 1, textAlign: "left" }}>{settingsEntry.label}</span>
        </button>
        {settingsOpen && settingsEntry.sections.map((sub, si) => {
          if (!isRoleAllowed(sub.roles, role)) return null;
          const items = sub.items.filter(i => isRoleAllowed(i.roles, role));
          if (items.length === 0) return null;

          if (!sub.label) {
            return items.map(item => {
              const active = isActive(item.href);
              const IconComp = item.icon ? ICON_MAP[item.icon] : null;
              return (
                <Link key={item.href} href={item.href} onClick={handleNav}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "7px 16px 7px 28px", margin: "1px 8px", borderRadius: 6,
                    textDecoration: "none", fontSize: 12, fontWeight: active ? 600 : 500,
                    color: active ? C.textActive : C.textNormal,
                    background: active ? C.bgItemActive : "transparent",
                  }}>
                  {IconComp && <IconComp size={14} color={active ? etabColor : C.textMuted} />}
                  <span>{item.label}</span>
                </Link>
              );
            });
          }

          const subKey = `settings:${sub.label}`;
          const isOpen = openSettingsSub === subKey;
          const SubIcon = sub.icon ? ICON_MAP[sub.icon] : null;

          return (
            <div key={subKey || `settings-sub-${si}`}>
              <button type="button" onClick={() => toggleSettingsSub(subKey)} style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "calc(100% - 16px)", padding: "8px 12px 8px 28px",
                margin: "1px 8px", borderRadius: 6,
                background: isOpen ? "rgba(255,255,255,0.04)" : "transparent",
                border: "none", cursor: "pointer",
                borderLeft: isOpen ? `2px solid ${etabColor}60` : "2px solid transparent",
                color: isOpen ? C.textActive : "rgba(255,255,255,0.5)",
                fontSize: 14, fontWeight: 700, whiteSpace: "nowrap",
                transition: "background 0.15s, color 0.15s",
              }}>
                {SubIcon && <SubIcon size={15} color={isOpen ? etabColor : "rgba(255,255,255,0.35)"} />}
                <span style={{ flex: 1, textAlign: "left" }}>{sub.label}</span>
              </button>
              {isOpen && items.map(item => {
                const active = isActive(item.href);
                return (
                  <Link key={item.href} href={item.href} onClick={handleNav}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "5px 16px 5px 44px", margin: "1px 8px", borderRadius: 6,
                      textDecoration: "none", fontSize: 13, fontWeight: active ? 600 : 400,
                      color: active ? C.textActive : "rgba(255,255,255,0.55)",
                      background: active ? C.bgItemActive : "transparent",
                    }}>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  /* ── Render standalone item ── */
  const renderStandaloneItem = (entry: SidebarEntry & { kind: "item" }) => {
    if (!isRoleAllowed(entry.roles, role)) return null;
    const active = isActive(entry.href);
    const IconComp = entry.icon ? ICON_MAP[entry.icon] : null;

    return (
      <Link key={entry.href} href={entry.href} onClick={handleNav}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 16px", margin: "1px 8px", borderRadius: 6,
          textDecoration: "none", fontSize: 13, fontWeight: active ? 600 : 500,
          color: active ? C.textActive : C.textNormal,
          background: active ? C.bgItemActive : "transparent",
          borderLeft: active ? `3px solid ${etabColor}` : "3px solid transparent",
          transition: "background 0.12s",
          whiteSpace: "nowrap", overflow: "hidden",
        }}>
        {IconComp && <IconComp size={16} color={active ? etabColor : C.textMuted} />}
        <span>{entry.label}</span>
      </Link>
    );
  };

  /* ── Etab selector label ── */
  const etabLabel = isGroupView ? "iFratelli Group" : (current?.nom ?? "Choisir...");

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      background: C.bg, color: C.textNormal,
      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      width: 240,
    }}>
      {/* Header */}
      <div style={{ padding: "20px 16px 12px", borderBottom: `1px solid ${C.divider}`, display: "flex", alignItems: "center", gap: 8 }}>
        <Image src="/logo-ifratelli.png" alt="iFratelli" width={32} height={32}
          style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 6, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: "var(--font-oswald), 'Oswald', sans-serif", fontSize: 15, fontWeight: 700, color: "#fff", letterSpacing: 0.5, lineHeight: 1 }}>
            iFratelli
          </span>
          {role && (
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: etabColor, textTransform: "uppercase", marginTop: 2 }}>
              {ROLE_LABELS[role] ?? role.toUpperCase()}
            </div>
          )}
        </div>
      </div>

      {/* Etablissement selector */}
      {isAdmin && etablissements.length > 0 && (
        <div ref={dropdownRef} style={{ padding: "10px 8px 4px", position: "relative" }}>
          <button
            type="button"
            onClick={() => setEtabDropdownOpen(prev => !prev)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              width: "100%", padding: "8px 12px",
              borderRadius: 8, border: `1.5px solid ${etabColor}80`,
              background: `${etabColor}20`, cursor: "pointer",
              transition: "border-color 0.15s, background 0.15s",
            }}
          >
            <IconStore size={15} color={etabColor} />
            <span style={{
              flex: 1, textAlign: "left", fontSize: 13, fontWeight: 600,
              color: C.textActive, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {etabLabel}
            </span>
            <span style={{ fontSize: 10, color: C.textMuted, transition: "transform 0.2s", transform: etabDropdownOpen ? "rotate(180deg)" : "rotate(0)" }}>
              ▼
            </span>
          </button>

          {/* Dropdown menu */}
          {etabDropdownOpen && (
            <div style={{
              position: "absolute", left: 8, right: 8, top: "100%",
              marginTop: 4, zIndex: 50,
              background: "#2a2420", border: `1px solid ${C.divider}`,
              borderRadius: 8, overflow: "hidden",
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}>
              {/* Vue Groupe option */}
              <button
                type="button"
                onClick={() => {
                  setGroupView(true);
                  setEtabDropdownOpen(false);
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", padding: "10px 12px",
                  border: "none", cursor: "pointer",
                  background: isGroupView ? `${C.ifratelli}18` : "transparent",
                  borderLeft: isGroupView ? `3px solid ${C.ifratelli}` : "3px solid transparent",
                  transition: "background 0.12s",
                }}
                onMouseEnter={e => { if (!isGroupView) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                onMouseLeave={e => { if (!isGroupView) e.currentTarget.style.background = "transparent"; }}
              >
                <IconBuilding size={14} color={isGroupView ? C.ifratelli : C.textMuted} />
                <span style={{ fontSize: 13, fontWeight: isGroupView ? 700 : 500, color: isGroupView ? C.textActive : C.textNormal }}>
                  Vue Groupe
                </span>
              </button>

              <div style={{ height: 1, background: C.divider, margin: "0 8px" }} />

              {/* Each establishment */}
              {etablissements.map(etab => {
                const isSelected = !isGroupView && current?.id === etab.id;
                const color = etab.couleur ?? C.ifratelli;
                return (
                  <button
                    key={etab.id}
                    type="button"
                    onClick={() => {
                      setGroupView(false);
                      setCurrent(etab);
                      setEtabDropdownOpen(false);
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      width: "100%", padding: "10px 12px",
                      border: "none", cursor: "pointer",
                      background: isSelected ? `${color}18` : "transparent",
                      borderLeft: isSelected ? `3px solid ${color}` : "3px solid transparent",
                      transition: "background 0.12s",
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isSelected ? `${color}18` : "transparent"; }}
                  >
                    <IconStore size={14} color={isSelected ? color : C.textMuted} />
                    <span style={{ fontSize: 13, fontWeight: isSelected ? 700 : 500, color: isSelected ? C.textActive : C.textNormal }}>
                      {etab.nom}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "8px 0" }}>
        {isAdmin ? (
          <>
            {/* Accueil */}
            {renderStandaloneItem({ kind: "item", label: "Accueil", href: "/dashboard", icon: "dashboard" })}

            <div style={{ height: 1, background: C.divider, margin: "8px 16px" }} />

            {/* Sections */}
            {sections.map(sub => renderHub(sub))}

            <div style={{ height: 1, background: C.divider, margin: "8px 16px" }} />

            {/* Settings */}
            {renderSettings()}
          </>
        ) : (
          /* Simple nav for employees */
          SIDEBAR_NAV_SIMPLE.map((entry, i) => {
            if (entry.kind === "divider") return <div key={`div-${i}`} style={{ height: 1, background: C.divider, margin: "8px 16px" }} />;
            if (entry.kind === "item") return renderStandaloneItem(entry);
            return null;
          })
        )}
      </nav>

      {/* Footer */}
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
        <Link href="/session" onClick={onNavigate}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, textDecoration: "none", fontSize: 12, color: C.textMuted }}>
          <IconSwitch size={14} color={C.textMuted} />
          <span>Changer de session</span>
        </Link>
      </div>
    </div>
  );
}

/* ── Exports ── */

export function Sidebar() {
  return (
    <aside className="sidebar-desktop" style={{ position: "fixed", top: 0, left: 0, bottom: 0, zIndex: 40, overflowY: "auto", overflowX: "hidden" }}>
      <SidebarContent />
    </aside>
  );
}

export function SidebarDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 260, overflowY: "auto", boxShadow: "4px 0 20px rgba(0,0,0,0.3)" }}
        onClick={e => e.stopPropagation()}>
        <SidebarContent onNavigate={onClose} />
      </div>
    </div>
  );
}
