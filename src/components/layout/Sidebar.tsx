"use client";

import React, { useState, useCallback, type CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import {
  buildDynamicNav,
  SIDEBAR_NAV_V2,
  SIDEBAR_NAV_SIMPLE,
  type SidebarEntry,
  type NavEtabGroup,
  type NavSettingsGroup,
  type NavSubSection,
  type NavItemV2,
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
   SIDEBAR CONTENT — always expanded on desktop
   ═══════════════════════════════════════════════════════ */

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { role } = useProfile();
  const { current, setCurrent, etablissements, isGroupView, setGroupView } = useEtablissement();

  // Only sub-menus of hubs toggle (accordion)
  const [openHub, setOpenHub] = useState<string | null>(null);
  // Settings sub-sections
  const [openSettingsSub, setOpenSettingsSub] = useState<string | null>(null);

  const toggleHub = useCallback((key: string) => {
    setOpenHub(prev => prev === key ? null : key);
  }, []);

  const toggleSettingsSub = useCallback((key: string) => {
    setOpenSettingsSub(prev => prev === key ? null : key);
  }, []);

  const isAdmin = role === "group_admin" || role === "manager";
  const entries: SidebarEntry[] = isAdmin
    ? (etablissements.length > 0
        ? buildDynamicNav(etablissements.map(e => ({ slug: e.slug, nom: e.nom, couleur: e.couleur })))
        : SIDEBAR_NAV_V2)
    : SIDEBAR_NAV_SIMPLE;

  const etabColor = isGroupView ? C.ifratelli : (current?.couleur ?? C.ifratelli);

  const switchEtab = useCallback((slug: string) => {
    const target = etablissements.find(e => e.slug === slug || e.slug?.replace("_", "-") === slug);
    if (target && current?.slug !== slug && current?.slug?.replace("_", "-") !== slug) {
      setGroupView(false);
      setCurrent(target);
    }
  }, [etablissements, current, setCurrent, setGroupView]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const handleNav = (etabSlug?: string) => {
    if (etabSlug) switchEtab(etabSlug);
    onNavigate?.();
  };

  /* ── Render nav item (level 3 — sub-menu items) ── */
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const renderItem = (item: NavItemV2, etabSlug?: string) => {
    if (!isRoleAllowed(item.roles, role)) return null;
    const active = isActive(item.href);
    const itemKey = `${etabSlug ?? "g"}-${item.href}`;
    const hovered = hoveredItem === itemKey;
    const accentColor = etabSlug
      ? entries.find((e): e is NavEtabGroup => e.kind === "etab" && e.etabSlug === etabSlug)?.color ?? etabColor
      : etabColor;

    return (
      <Link
        key={itemKey}
        href={item.href}
        onClick={() => handleNav(etabSlug)}
        onMouseEnter={() => setHoveredItem(itemKey)}
        onMouseLeave={() => setHoveredItem(null)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "5px 16px 5px 44px",
          margin: "1px 8px", borderRadius: 6,
          textDecoration: "none",
          fontSize: 13, fontWeight: active ? 600 : 400,
          color: active ? C.textActive : hovered ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.5)",
          background: active ? `${accentColor}12` : hovered ? "rgba(255,255,255,0.04)" : "transparent",
          borderLeft: active ? `2px solid ${accentColor}60` : "2px solid transparent",
          transition: "background 0.12s, color 0.12s",
          whiteSpace: "nowrap", overflow: "hidden",
        }}
      >
        <span style={{ color: active ? accentColor : "rgba(255,255,255,0.3)", fontSize: 8, flexShrink: 0 }}>●</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</span>
      </Link>
    );
  };

  /* ── Render a hub (level 2 — always visible, sub-items toggle) ── */
  const [hoveredHub, setHoveredHub] = useState<string | null>(null);

  const renderHub = (sub: NavSubSection, etabSlug: string, parentColor: string) => {
    if (!isRoleAllowed(sub.roles, role)) return null;
    const items = sub.items.filter(i => isRoleAllowed(i.roles, role));

    // No label = standalone item (Fournisseurs)
    if (!sub.label) {
      return items.map(item => {
        if (!isRoleAllowed(item.roles, role)) return null;
        const active = isActive(item.href);
        const soloKey = `${etabSlug}-${item.href}`;
        const hovered = hoveredHub === soloKey;
        const IconComp = item.icon ? ICON_MAP[item.icon] : null;
        return (
          <Link
            key={soloKey}
            href={item.href}
            onClick={() => handleNav(etabSlug)}
            onMouseEnter={() => setHoveredHub(soloKey)}
            onMouseLeave={() => setHoveredHub(null)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "7px 16px 7px 28px",
              margin: "1px 8px", borderRadius: 6,
              textDecoration: "none",
              fontSize: 12, fontWeight: active ? 600 : 500,
              color: active ? "rgba(255,255,255,0.85)" : hovered ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.5)",
              background: active ? C.bgItemActive : hovered ? "rgba(255,255,255,0.04)" : "transparent",
              transition: "background 0.12s, color 0.12s",
              whiteSpace: "nowrap", overflow: "hidden",
            }}
          >
            {IconComp && <IconComp size={14} color={active ? parentColor : hovered ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.35)"} />}
            <span>{item.label}</span>
          </Link>
        );
      });
    }

    const hubKey = `${etabSlug}:${sub.label}`;
    const isOpen = openHub === hubKey;
    const hovered = hoveredHub === hubKey;
    const SectionIcon = sub.icon ? ICON_MAP[sub.icon] : null;
    const hasActiveChild = items.some(it => isActive(it.href));

    const hubBtnStyle: CSSProperties = {
      display: "flex", alignItems: "center", gap: 8,
      width: "calc(100% - 16px)", padding: "8px 12px 8px 28px",
      margin: "1px 8px", borderRadius: 6,
      background: isOpen ? `${parentColor}14` : hovered ? "rgba(255,255,255,0.06)" : "transparent",
      border: "none", cursor: items.length > 0 ? "pointer" : "default",
      borderLeft: isOpen ? `2px solid ${parentColor}80` : "2px solid transparent",
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
              // Navigate to section href but don't close sidebar (so submenu stays visible)
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
          {SectionIcon && <SectionIcon size={15} color={(isOpen || hasActiveChild) ? `${parentColor}CC` : hovered ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.35)"} />}
          <span style={{ flex: 1, textAlign: "left" }}>{sub.label}</span>
        </button>
        {isOpen && (
          <div style={{ marginBottom: 6 }}>
            {items.map(item => renderItem(item, etabSlug))}
          </div>
        )}
      </div>
    );
  };

  /* ── Render etab group — always highlighted with its color ── */
  const renderEtabGroup = (entry: NavEtabGroup) => {
    if (!isRoleAllowed(entry.roles, role)) return null;

    return (
      <div key={entry.etabSlug} style={{ marginBottom: 2 }}>
        {/* Etab header — clickable, navigates to establishment dashboard */}
        <button
          type="button"
          onClick={() => {
            const routeSlug = entry.etabSlug.replace(/_/g, "-");
            router.push(`/${routeSlug}`);
            onNavigate?.();
          }}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 16px", margin: "1px 8px",
            width: "calc(100% - 16px)",
            borderRadius: 6, border: "none", cursor: "pointer",
            background: C.bgItemActive,
            borderLeft: `3px solid ${entry.color}`,
            whiteSpace: "nowrap", overflow: "hidden",
          }}
        >
          <IconStore size={16} color={entry.color} />
          <span style={{ fontSize: 13, fontWeight: 600, color: C.textActive, overflow: "hidden", textOverflow: "ellipsis" }}>
            {entry.label}
          </span>
        </button>

        {/* Hubs — always visible */}
        <div style={{ marginTop: 2 }}>
          {entry.sections.map(sub => renderHub(sub, entry.etabSlug, entry.color))}
        </div>
      </div>
    );
  };

  /* ── Render settings group — collapsible ── */
  const [settingsOpen, setSettingsOpen] = useState(false);

  const renderSettingsGroup = (entry: NavSettingsGroup) => {
    if (!isRoleAllowed(entry.roles, role)) return null;
    const SettingsIcon = entry.icon ? ICON_MAP[entry.icon] : null;

    return (
      <div key="settings" style={{ marginBottom: 2 }}>
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
          <span style={{ flex: 1, textAlign: "left" }}>{entry.label}</span>
        </button>
        {settingsOpen && entry.sections.map(sub => {
          if (!isRoleAllowed(sub.roles, role)) return null;
          const items = sub.items.filter(i => isRoleAllowed(i.roles, role));
          if (items.length === 0) return null;

          if (!sub.label) {
            return items.map(item => {
              const active = isActive(item.href);
              const IconComp = item.icon ? ICON_MAP[item.icon] : null;
              return (
                <Link key={item.href} href={item.href} onClick={() => handleNav()}
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
            <div key={subKey}>
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
                  <Link key={item.href} href={item.href} onClick={() => handleNav()}
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
      <Link key={entry.href} href={entry.href} onClick={() => handleNav()}
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

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "8px 0" }}>
        {entries.map((entry, i) => {
          if (entry.kind === "divider") return <div key={`div-${i}`} style={{ height: 1, background: C.divider, margin: "8px 16px" }} />;
          if (entry.kind === "item") return renderStandaloneItem(entry);
          if (entry.kind === "etab") return renderEtabGroup(entry);
          if (entry.kind === "settings") return renderSettingsGroup(entry);
          return null;
        })}
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
