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
  PILOTAGE_SECTION,
  ACHATS_SECTION,
  PRODUCTION_SECTION, PRODUCTION_SECTION_PICCOLA,
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
  bg: "transparent",
  bgItem: "rgba(0,0,0,0.03)",
  bgItemActive: "rgba(0,0,0,0.06)",
  textMuted: "rgba(0,0,0,0.40)",
  textNormal: "rgba(0,0,0,0.65)",
  textActive: "#2c2c2c",
  divider: "rgba(0,0,0,0.06)",
  ifratelli: "#b45f57",
  piccolaMia: "#c4a24e",
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
  const _sections: NavSubSection[] = isAdmin
    ? isGroupView
      ? []  // Vue groupe = pas de sections, juste le dashboard
      : [   // Établissement = toutes les sections
          PILOTAGE_SECTION,
          PERSONNEL_SECTION,
          PRODUCTION_SECTION,
          ACHATS_SECTION,
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
          color: active ? C.textActive : hovered ? C.textNormal : C.textMuted,
          background: active ? `${etabColor}12` : hovered ? C.bgItem : "transparent",
          borderLeft: active ? `2px solid ${etabColor}60` : "2px solid transparent",
          transition: "background 0.12s, color 0.12s",
          whiteSpace: "nowrap", overflow: "hidden",
        }}
      >
        <span style={{ color: active ? etabColor : C.textMuted, fontSize: 8, flexShrink: 0 }}>●</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</span>
      </Link>
    );
  };

  /* ── Render hub (level 2 — accordion section) ── */
  const [hoveredHub, setHoveredHub] = useState<string | null>(null);

  const _renderHub = (sub: NavSubSection) => {
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
      background: isOpen ? `${etabColor}14` : hovered ? C.bgItem : "transparent",
      border: "none", cursor: items.length > 0 ? "pointer" : "default",
      borderLeft: isOpen ? `2px solid ${etabColor}80` : "2px solid transparent",
      color: (isOpen || hasActiveChild) ? C.textActive : hovered ? C.textNormal : C.textMuted,
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
          {SectionIcon && <SectionIcon size={15} color={(isOpen || hasActiveChild) ? `${etabColor}CC` : hovered ? C.textMuted : C.textMuted} />}
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
            fontSize: 14, fontWeight: 700, color: settingsOpen ? C.textActive : C.textNormal,
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
                background: isOpen ? C.bgItem : "transparent",
                border: "none", cursor: "pointer",
                borderLeft: isOpen ? `2px solid ${etabColor}60` : "2px solid transparent",
                color: isOpen ? C.textActive : C.textMuted,
                fontSize: 14, fontWeight: 700, whiteSpace: "nowrap",
                transition: "background 0.15s, color 0.15s",
              }}>
                {SubIcon && <SubIcon size={15} color={isOpen ? etabColor : C.textMuted} />}
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
                      color: active ? C.textActive : C.textMuted,
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
  const _etabLabel = isGroupView ? "iFratelli Group" : (current?.nom ?? "Choisir...");

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
          <span style={{ fontFamily: "var(--font-oswald), 'Oswald', sans-serif", fontSize: 15, fontWeight: 700, color: C.textActive, letterSpacing: 0.5, lineHeight: 1 }}>
            iFratelli
          </span>
          {role && (
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: etabColor, textTransform: "uppercase", marginTop: 2 }}>
              {ROLE_LABELS[role] ?? role.toUpperCase()}
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "8px 0" }}>
        {isAdmin ? (
          <>
            {/* iFratelli Group */}
            <Link
              href="/dashboard"
              onClick={() => { setGroupView(true); handleNav(); }}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                width: "calc(100% - 16px)", padding: "10px 14px",
                margin: "2px 8px", borderRadius: 10,
                textDecoration: "none", fontSize: 14, fontWeight: 700,
                color: C.textActive,
                background: isGroupView
                  ? `linear-gradient(135deg, ${C.ifratelli}50 0%, ${C.ifratelli}30 100%)`
                  : `linear-gradient(135deg, ${C.ifratelli}35 0%, ${C.ifratelli}18 100%)`,
                borderLeft: `4px solid ${isGroupView ? C.ifratelli : `${C.ifratelli}90`}`,
                boxShadow: isGroupView ? `0 2px 8px ${C.ifratelli}20` : "none",
                transition: "background 0.15s, border-color 0.15s",
                whiteSpace: "nowrap", overflow: "hidden",
              }}
            >
              <IconBuilding size={16} color={C.ifratelli} />
              <span style={{ flex: 1, letterSpacing: 0.3 }}>iFratelli Group</span>
            </Link>

            <div style={{ height: 1, background: C.divider, margin: "8px 16px" }} />

            {/* Establishments as accordion hubs */}
            {etablissements.map(etab => {
              const isEtabSelected = !isGroupView && current?.id === etab.id;
              const color = etab.couleur ?? C.ifratelli;
              const etabOpen = openHub?.startsWith(`etab:${etab.id}`);
              const isPiccolaEtab = etab.slug?.includes("piccola");

              const etabSections: NavSubSection[] = [
                PILOTAGE_SECTION,
                PERSONNEL_SECTION,
                isPiccolaEtab ? PRODUCTION_SECTION_PICCOLA : PRODUCTION_SECTION,
                ACHATS_SECTION,
                ...(isPiccolaEtab ? [EVENEMENTIEL_SECTION] : []),
              ];

              return (
                <div key={etab.id} style={{ marginBottom: 4 }}>
                  {/* Establishment header — card style */}
                  <button
                    type="button"
                    onClick={() => {
                      setGroupView(false);
                      setCurrent(etab);
                      const wasOpen = openHub === `etab:${etab.id}`;
                      setOpenHub(wasOpen ? null : `etab:${etab.id}`);
                      // Navigate to establishment hub page
                      if (!wasOpen) {
                        const slug = isPiccolaEtab ? "/piccola-mia" : "/bello-mio";
                        router.push(slug);
                      }
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      width: "calc(100% - 16px)", padding: "10px 14px",
                      margin: "2px 8px", borderRadius: 10,
                      background: isEtabSelected
                        ? `linear-gradient(135deg, ${color}50 0%, ${color}30 100%)`
                        : `linear-gradient(135deg, ${color}35 0%, ${color}18 100%)`,
                      border: "none", cursor: "pointer",
                      borderLeft: `4px solid ${isEtabSelected ? color : `${color}90`}`,
                      color: C.textActive,
                      fontSize: 14, fontWeight: 700,
                      whiteSpace: "nowrap", overflow: "hidden",
                      transition: "background 0.15s, border-color 0.15s",
                      boxShadow: isEtabSelected ? `0 2px 8px ${color}20` : "none",
                    }}
                  >
                    <IconStore size={16} color={color} />
                    <span style={{ flex: 1, textAlign: "left", letterSpacing: 0.3 }}>{etab.nom}</span>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"
                      style={{ transform: etabOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s", flexShrink: 0, opacity: 0.7 }}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {/* Sub-sections for this establishment */}
                  {etabOpen && (
                    <div style={{ marginBottom: 4 }}>
                      {etabSections.map(sub => {
                        if (!isRoleAllowed(sub.roles, role)) return null;
                        const items = sub.items.filter(i => isRoleAllowed(i.roles, role));
                        if (items.length === 0 && !sub.href) return null;

                        const subKey = `etab:${etab.id}:${sub.label}`;
                        const subOpen = openHub === subKey;
                        const SectionIcon = sub.icon ? ICON_MAP[sub.icon] : null;
                        const hasActiveChild = items.some(it => isActive(it.href));

                        return (
                          <div key={subKey} style={{ marginBottom: 2 }}>
                            <button
                              type="button"
                              onClick={() => {
                                setGroupView(false);
                                setCurrent(etab);
                                setOpenHub(prev => prev === subKey ? `etab:${etab.id}` : subKey);
                                if (sub.href) router.push(sub.href);
                              }}
                              style={{
                                display: "flex", alignItems: "center", gap: 8,
                                width: "calc(100% - 16px)", padding: "6px 12px 6px 28px",
                                margin: "1px 8px", borderRadius: 6,
                                background: subOpen ? `${color}10` : "transparent",
                                border: "none", cursor: "pointer",
                                borderLeft: subOpen ? `2px solid ${color}60` : "2px solid transparent",
                                color: (subOpen || hasActiveChild) ? C.textActive : C.textMuted,
                                fontSize: 13, fontWeight: 600,
                                whiteSpace: "nowrap", overflow: "hidden",
                                transition: "background 0.15s, color 0.15s",
                              }}
                            >
                              {SectionIcon && <SectionIcon size={14} color={(subOpen || hasActiveChild) ? `${color}CC` : C.textMuted} />}
                              <span style={{ flex: 1, textAlign: "left" }}>{sub.label}</span>
                              <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={(subOpen || hasActiveChild) ? `${color}CC` : C.textMuted} strokeWidth="2.5"
                                style={{ transform: subOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s", flexShrink: 0, opacity: 0.6 }}>
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </button>
                            {subOpen && (
                              <div style={{ marginBottom: 4 }}>
                                {items.map(item => renderItem(item))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

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
