"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import {
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
  IconCalendarEvent, IconChevronDown, IconBox, IconChefHat,
  IconSwitch, IconMenu, IconChevronLeft, IconBuilding,
} from "./Icons";
import type { Role } from "@/lib/rbac";

const ICON_MAP: Record<string, React.FC<{ size?: number; color?: string }>> = {
  dashboard: IconDashboard,
  users: IconUsers,
  calendar: IconCalendar,
  clock: IconClock,
  beach: IconBeach,
  clipboard: IconClipboard,
  calculator: IconCalculator,
  settings: IconSettings,
  wallet: IconWallet,
  shoppingBag: IconShoppingBag,
  truck: IconTruck,
  fileText: IconFileText,
  package: IconPackage,
  barChart: IconBarChart,
  trendingUp: IconTrendingUp,
  book: IconBook,
  tag: IconTag,
  calendarEvent: IconCalendarEvent,
  box: IconBox,
  chefHat: IconChefHat,
  building: IconBuilding,
};

const ROLE_LABELS: Record<string, string> = {
  group_admin: "DIRECTION",
  admin: "ADMIN",
  manager: "MANAGER",
  cuisine: "CUISINE",
  salle: "SALLE",
  plonge: "PLONGE",
};

const C = {
  bg: "#1a1512",
  bgItem: "rgba(255,255,255,0.04)",
  bgItemActive: "rgba(255,255,255,0.08)",
  textMuted: "rgba(255,255,255,0.45)",
  textNormal: "rgba(255,255,255,0.7)",
  textActive: "#fff",
  sectionLabel: "rgba(255,255,255,0.3)",
  divider: "rgba(255,255,255,0.06)",
  ifratelli: "#b45f57",
  belloMio: "#e27f57",
  piccolaMia: "#efd199",
  piccolaMiaText: "#a8893a",
};

/* ── Helpers ──────────────────────────────────────────── */

function isRoleAllowed(roles: Role[] | undefined, role: Role | null): boolean {
  if (!roles) return true;
  if (!role) return false;
  return roles.includes(role);
}

/* ── Sidebar Content ─────────────────────────────────── */

type SidebarContentProps = {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
};

function SidebarContent({ onNavigate, collapsed, onToggle }: SidebarContentProps) {
  const pathname = usePathname();
  const { role } = useProfile();
  const { current, setCurrent, etablissements, isGroupView, setGroupView } = useEtablissement();

  // Collapsed state for etab groups and settings sub-sections
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [openSubSections, setOpenSubSections] = useState<Record<string, boolean>>({});

  const toggleGroup = useCallback((key: string) => {
    setOpenGroups(p => ({ ...p, [key]: !p[key] }));
  }, []);

  const toggleSubSection = useCallback((key: string) => {
    setOpenSubSections(p => ({ ...p, [key]: !p[key] }));
  }, []);

  // Pick the right nav based on role
  const isAdmin = role === "group_admin" || role === "manager";
  const entries: SidebarEntry[] = isAdmin ? SIDEBAR_NAV_V2 : SIDEBAR_NAV_SIMPLE;

  // Determine the active establishment color
  const etabColor = isGroupView
    ? C.ifratelli
    : (current?.couleur ?? C.ifratelli);

  // Auto-switch establishment context
  const switchEtab = useCallback((slug: string) => {
    const target = etablissements.find(e => e.slug === slug || e.slug?.replace("_", "-") === slug);
    if (target && current?.slug !== slug && current?.slug?.replace("_", "-") !== slug) {
      setGroupView(false);
      setCurrent(target);
    }
  }, [etablissements, current, setCurrent, setGroupView]);

  // Check if a nav item is active
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  // Check if an etab group is the currently active one (for highlight)
  const isEtabActive = (slug: string) =>
    !isGroupView && (current?.slug === slug || current?.slug?.replace("_", "-") === slug);

  /* ── Render a single nav item ── */
  const renderItem = (item: NavItemV2, etabSlug?: string, indent = false) => {
    if (!isRoleAllowed(item.roles, role)) return null;
    const active = isActive(item.href) && (!etabSlug || isEtabActive(etabSlug));
    const IconComp = item.icon ? ICON_MAP[item.icon] : null;
    const accentColor = etabSlug
      ? entries.find((e): e is NavEtabGroup => e.kind === "etab" && e.etabSlug === etabSlug)?.color ?? etabColor
      : etabColor;

    return (
      <Link
        key={`${etabSlug ?? "g"}-${item.href}`}
        href={item.href}
        onClick={() => {
          if (etabSlug) {
            switchEtab(etabSlug);
          }
          onNavigate?.();
        }}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: indent ? "7px 16px 7px 28px" : "8px 16px",
          margin: "1px 8px",
          borderRadius: 6,
          textDecoration: "none",
          fontSize: 13, fontWeight: active ? 600 : 500,
          color: active ? C.textActive : C.textNormal,
          background: active ? C.bgItemActive : "transparent",
          borderLeft: active ? `3px solid ${accentColor}` : "3px solid transparent",
          transition: "background 0.12s, color 0.12s",
          whiteSpace: "nowrap", overflow: "hidden",
        }}
      >
        {IconComp && <IconComp size={16} color={active ? accentColor : C.textMuted} />}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</span>
      </Link>
    );
  };

  /* ── Render a sub-section (inside etab or settings group) ── */
  const renderSubSection = (sub: NavSubSection, parentKey: string, etabSlug?: string) => {
    if (!isRoleAllowed(sub.roles, role)) return null;
    const items = sub.items.filter(i => isRoleAllowed(i.roles, role));
    if (items.length === 0) return null;

    // No label = standalone items (like "Mon compte" in Parametres)
    if (!sub.label) {
      return (
        <div key={`${parentKey}-nolabel`}>
          {items.map(item => renderItem(item, etabSlug, false))}
        </div>
      );
    }

    const subKey = `${parentKey}:${sub.label}`;
    const isOpen = openSubSections[subKey] ?? false;
    const SectionIcon = sub.icon ? ICON_MAP[sub.icon] : null;

    return (
      <div key={subKey}>
        <button
          type="button"
          onClick={() => toggleSubSection(subKey)}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            width: "100%", padding: "8px 16px 4px 20px",
            background: "none", border: "none", cursor: "pointer",
            color: C.textMuted, fontSize: 11, fontWeight: 700,
            letterSpacing: "0.06em",
            whiteSpace: "nowrap", overflow: "hidden",
          }}
        >
          {SectionIcon && <SectionIcon size={13} color={C.textMuted} />}
          <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis" }}>
            {sub.label}
          </span>
          <span style={{
            transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform 0.15s ease",
            display: "flex", flexShrink: 0,
          }}>
            <IconChevronDown size={10} color={C.textMuted} />
          </span>
        </button>
        {isOpen && items.map(item => renderItem(item, etabSlug, true))}
      </div>
    );
  };

  /* ── Render an etab group ── */
  const renderEtabGroup = (entry: NavEtabGroup) => {
    if (!isRoleAllowed(entry.roles, role)) return null;
    const groupKey = entry.etabSlug;
    const isOpen = openGroups[groupKey] ?? false;
    const active = isEtabActive(entry.etabSlug);

    return (
      <div key={groupKey} style={{ marginBottom: 2 }}>
        <button
          type="button"
          onClick={() => toggleGroup(groupKey)}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            width: "100%", padding: "10px 16px 8px",
            background: "none", border: "none", cursor: "pointer",
            color: active ? C.textActive : C.textNormal,
            fontSize: 13, fontWeight: 700,
            whiteSpace: "nowrap", overflow: "hidden",
          }}
        >
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: entry.color, flexShrink: 0,
          }} />
          <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis" }}>
            {entry.label}
          </span>
          <span style={{
            transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform 0.15s ease",
            display: "flex", flexShrink: 0,
          }}>
            <IconChevronDown size={12} color={C.textMuted} />
          </span>
        </button>
        {isOpen && entry.sections.map(sub => renderSubSection(sub, groupKey, entry.etabSlug))}
      </div>
    );
  };

  /* ── Render a settings group ── */
  const renderSettingsGroup = (entry: NavSettingsGroup) => {
    if (!isRoleAllowed(entry.roles, role)) return null;
    const groupKey = "settings";
    const isOpen = openGroups[groupKey] ?? false;
    const SettingsIcon = entry.icon ? ICON_MAP[entry.icon] : null;

    return (
      <div key={groupKey} style={{ marginBottom: 2 }}>
        <button
          type="button"
          onClick={() => toggleGroup(groupKey)}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            width: "100%", padding: "10px 16px 8px",
            background: "none", border: "none", cursor: "pointer",
            color: C.textNormal, fontSize: 13, fontWeight: 700,
            whiteSpace: "nowrap", overflow: "hidden",
          }}
        >
          {SettingsIcon && <SettingsIcon size={15} color={C.textMuted} />}
          <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis" }}>
            {entry.label}
          </span>
          <span style={{
            transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform 0.15s ease",
            display: "flex", flexShrink: 0,
          }}>
            <IconChevronDown size={12} color={C.textMuted} />
          </span>
        </button>
        {isOpen && entry.sections.map(sub => renderSubSection(sub, groupKey))}
      </div>
    );
  };

  /* ── Render a standalone item ── */
  const renderStandaloneItem = (entry: SidebarEntry & { kind: "item" }) => {
    if (!isRoleAllowed(entry.roles, role)) return null;
    const active = isActive(entry.href);
    const IconComp = entry.icon ? ICON_MAP[entry.icon] : null;

    return (
      <Link
        key={entry.href}
        href={entry.href}
        onClick={onNavigate}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 16px",
          margin: "1px 8px",
          borderRadius: 6,
          textDecoration: "none",
          fontSize: 13, fontWeight: active ? 600 : 500,
          color: active ? C.textActive : C.textNormal,
          background: active ? C.bgItemActive : "transparent",
          borderLeft: active ? `3px solid ${etabColor}` : "3px solid transparent",
          transition: "background 0.12s, color 0.12s",
          whiteSpace: "nowrap", overflow: "hidden",
        }}
      >
        {IconComp && <IconComp size={16} color={active ? etabColor : C.textMuted} />}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{entry.label}</span>
      </Link>
    );
  };

  /* ── Main render ── */
  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      background: C.bg, color: C.textNormal,
      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      minWidth: collapsed ? 60 : 240,
    }}>
      {/* ── Header: Logo + toggle ── */}
      <div style={{
        padding: collapsed ? "16px 8px 12px" : "20px 16px 12px",
        borderBottom: `1px solid ${C.divider}`,
        display: "flex", alignItems: "center",
        gap: 8,
      }}>
        <Image
          src="/logo-ifratelli.png"
          alt="iFratelli"
          width={32}
          height={32}
          style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 6, flexShrink: 0 }}
        />
        {!collapsed && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{
              fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
              fontSize: 15, fontWeight: 700, color: "#fff",
              letterSpacing: 0.5, lineHeight: 1,
            }}>
              iFratelli
            </span>
            {role && (
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "0.15em",
                color: etabColor, textTransform: "uppercase", marginTop: 2,
              }}>
                {ROLE_LABELS[role] ?? role.toUpperCase()}
              </div>
            )}
          </div>
        )}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: 4, display: "flex", alignItems: "center", justifyContent: "center",
              color: C.textMuted, flexShrink: 0,
            }}
            title={collapsed ? "Ouvrir le menu" : "Reduire le menu"}
          >
            {collapsed ? <IconMenu size={18} color={C.textMuted} /> : <IconChevronLeft size={18} color={C.textMuted} />}
          </button>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "8px 0" }}>
        {entries.map((entry, i) => {
          if (entry.kind === "divider") {
            return (
              <div key={`div-${i}`} style={{
                height: 1, background: C.divider,
                margin: "8px 16px",
              }} />
            );
          }
          if (entry.kind === "item") {
            return renderStandaloneItem(entry);
          }
          if (entry.kind === "etab") {
            return renderEtabGroup(entry);
          }
          if (entry.kind === "settings") {
            return renderSettingsGroup(entry);
          }
          return null;
        })}
      </nav>

      {/* ── Footer: Session + changer ── */}
      <div style={{
        padding: collapsed ? "12px 8px 16px" : "12px 16px 16px",
        borderTop: `1px solid ${C.divider}`,
      }}>
        {role && !collapsed && (
          <div style={{
            background: etabColor,
            color: etabColor === C.piccolaMia ? "#5a4a1a" : "#fff",
            borderRadius: 20, padding: "8px 16px",
            textAlign: "center", fontSize: 12, fontWeight: 700,
            letterSpacing: "0.04em", marginBottom: 10,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            Session {ROLE_LABELS[role]?.toLowerCase() ?? role}
          </div>
        )}
        <Link
          href="/session"
          onClick={onNavigate}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            gap: 6, textDecoration: "none",
            fontSize: 12, color: C.textMuted,
          }}
        >
          <IconSwitch size={14} color={C.textMuted} />
          {!collapsed && <span>Changer de session</span>}
        </Link>
      </div>
    </div>
  );
}

/* ── Desktop persistent sidebar ── */

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      className={`sidebar-desktop${collapsed ? " collapsed" : ""}`}
      style={{
        position: "fixed", top: 0, left: 0, bottom: 0,
        zIndex: 40,
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      <SidebarContent collapsed={collapsed} onToggle={onToggle} />
    </aside>
  );
}

/* ── Mobile drawer sidebar ── */

export function SidebarDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.5)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: "absolute", top: 0, left: 0, bottom: 0,
          width: 260, overflowY: "auto",
          boxShadow: "4px 0 20px rgba(0,0,0,0.3)",
        }}
        onClick={e => e.stopPropagation()}
      >
        <SidebarContent onNavigate={onClose} />
      </div>
    </div>
  );
}
