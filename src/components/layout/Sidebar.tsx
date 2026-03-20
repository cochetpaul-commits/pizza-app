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
  IconSwitch, IconChevronLeft, IconBuilding,
  IconChevronRight,
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

/* ═══════════════════════════════════════════════════════
   COLLAPSED VIEW — icons only (60px wide)
   ═══════════════════════════════════════════════════════ */

function CollapsedContent({ onToggle }: { onToggle?: () => void }) {
  const pathname = usePathname();
  const { role } = useProfile();
  const { current, setCurrent, etablissements, isGroupView, setGroupView } = useEtablissement();

  const isAdmin = role === "group_admin" || role === "manager";
  const entries: SidebarEntry[] = isAdmin ? SIDEBAR_NAV_V2 : SIDEBAR_NAV_SIMPLE;

  const etabColor = isGroupView
    ? C.ifratelli
    : (current?.couleur ?? C.ifratelli);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const isEtabActive = (slug: string) =>
    !isGroupView && (current?.slug === slug || current?.slug?.replace("_", "-") === slug);

  const switchEtab = (slug: string) => {
    const target = etablissements.find(e => e.slug === slug || e.slug?.replace("_", "-") === slug);
    if (target && current?.slug !== slug && current?.slug?.replace("_", "-") !== slug) {
      setGroupView(false);
      setCurrent(target);
    }
  };

  /* Icon-only item */
  const iconItem = (href: string, icon: string | undefined, active: boolean, color: string, key: string, etabSlug?: string) => {
    const IconComp = icon ? ICON_MAP[icon] : null;
    if (!IconComp) return null;
    return (
      <Link
        key={key}
        href={href}
        onClick={() => { if (etabSlug) switchEtab(etabSlug); }}
        title=""
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 36, height: 36, borderRadius: 8,
          background: active ? C.bgItemActive : "transparent",
          margin: "2px auto",
          transition: "background 0.12s",
        }}
      >
        <IconComp size={18} color={active ? color : C.textMuted} />
      </Link>
    );
  };

  /* Collect all visible icons to render */
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    if (entry.kind === "divider") {
      elements.push(
        <div key={`d-${i}`} style={{ height: 1, background: C.divider, margin: "6px 12px" }} />
      );
      continue;
    }

    if (entry.kind === "item") {
      if (!isRoleAllowed(entry.roles, role)) continue;
      const active = isActive(entry.href);
      elements.push(iconItem(entry.href, entry.icon, active, etabColor, `i-${entry.href}`));
      continue;
    }

    if (entry.kind === "etab") {
      if (!isRoleAllowed(entry.roles, role)) continue;
      const active = isEtabActive(entry.etabSlug);
      // Colored dot for establishment
      elements.push(
        <div
          key={`etab-${entry.etabSlug}`}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 36, height: 36, borderRadius: 8,
            background: active ? C.bgItemActive : "transparent",
            margin: "2px auto", cursor: "default",
          }}
        >
          <span style={{
            width: 10, height: 10, borderRadius: "50%",
            background: entry.color,
            border: active ? "2px solid rgba(255,255,255,0.5)" : "2px solid transparent",
          }} />
        </div>
      );
      // Show sub-section icons
      for (const sub of entry.sections) {
        if (!isRoleAllowed(sub.roles, role)) continue;
        if (sub.icon) {
          const SubIcon = ICON_MAP[sub.icon];
          if (SubIcon) {
            // Check if any item in this sub-section is active
            const subActive = sub.items.some(it => isRoleAllowed(it.roles, role) && isActive(it.href) && isEtabActive(entry.etabSlug));
            const firstHref = sub.items.find(it => isRoleAllowed(it.roles, role))?.href;
            if (firstHref) {
              elements.push(
                <Link
                  key={`${entry.etabSlug}-${sub.label}`}
                  href={firstHref}
                  onClick={() => switchEtab(entry.etabSlug)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 36, height: 36, borderRadius: 8,
                    background: subActive ? C.bgItemActive : "transparent",
                    margin: "2px auto",
                    transition: "background 0.12s",
                  }}
                >
                  <SubIcon size={16} color={subActive ? entry.color : C.textMuted} />
                </Link>
              );
            }
          }
        }
      }
      continue;
    }

    if (entry.kind === "settings") {
      if (!isRoleAllowed(entry.roles, role)) continue;
      const SettingsIcon = entry.icon ? ICON_MAP[entry.icon] : null;
      const anyActive = entry.sections.some(sub =>
        sub.items.some(it => isRoleAllowed(it.roles, role) && isActive(it.href))
      );
      if (SettingsIcon) {
        const firstHref = entry.sections[0]?.items[0]?.href ?? "/settings/account";
        elements.push(
          <Link
            key="settings-icon"
            href={firstHref}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 36, height: 36, borderRadius: 8,
              background: anyActive ? C.bgItemActive : "transparent",
              margin: "2px auto",
              transition: "background 0.12s",
            }}
          >
            <SettingsIcon size={18} color={anyActive ? etabColor : C.textMuted} />
          </Link>
        );
      }
    }
  }

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      background: C.bg, color: C.textNormal,
      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      width: 60,
    }}>
      {/* Logo only */}
      <div style={{
        padding: "16px 0 12px",
        borderBottom: `1px solid ${C.divider}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Image
          src="/logo-ifratelli.png"
          alt="iFratelli"
          width={28}
          height={28}
          style={{ width: 28, height: 28, objectFit: "contain", borderRadius: 6 }}
        />
      </div>

      {/* Icon nav */}
      <nav style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "8px 0" }}>
        {elements}
      </nav>

      {/* Footer: expand button */}
      <div style={{
        padding: "12px 0 16px",
        borderTop: `1px solid ${C.divider}`,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
      }}>
        <Link
          href="/session"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 36, height: 36, borderRadius: 8,
            textDecoration: "none",
          }}
        >
          <IconSwitch size={16} color={C.textMuted} />
        </Link>
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 36, height: 36, borderRadius: 8,
              background: C.bgItem, border: `1px solid ${C.divider}`,
              cursor: "pointer",
            }}
            title="Ouvrir le menu"
          >
            <IconChevronRight size={16} color={C.textMuted} />
          </button>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   EXPANDED VIEW — full sidebar (240px)
   ═══════════════════════════════════════════════════════ */

type ExpandedContentProps = {
  onNavigate?: () => void;
  onToggle?: () => void;
};

function ExpandedContent({ onNavigate, onToggle }: ExpandedContentProps) {
  const pathname = usePathname();
  const { role } = useProfile();
  const { current, setCurrent, etablissements, isGroupView, setGroupView } = useEtablissement();

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [openSubSections, setOpenSubSections] = useState<Record<string, boolean>>({});

  const toggleGroup = useCallback((key: string) => {
    setOpenGroups(p => ({ ...p, [key]: !p[key] }));
  }, []);

  const toggleSubSection = useCallback((key: string) => {
    setOpenSubSections(p => ({ ...p, [key]: !p[key] }));
  }, []);

  const isAdmin = role === "group_admin" || role === "manager";
  const entries: SidebarEntry[] = isAdmin ? SIDEBAR_NAV_V2 : SIDEBAR_NAV_SIMPLE;

  const etabColor = isGroupView
    ? C.ifratelli
    : (current?.couleur ?? C.ifratelli);

  const switchEtab = useCallback((slug: string) => {
    const target = etablissements.find(e => e.slug === slug || e.slug?.replace("_", "-") === slug);
    if (target && current?.slug !== slug && current?.slug?.replace("_", "-") !== slug) {
      setGroupView(false);
      setCurrent(target);
    }
  }, [etablissements, current, setCurrent, setGroupView]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

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
          if (etabSlug) switchEtab(etabSlug);
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

  /* ── Render a sub-section ── */
  const renderSubSection = (sub: NavSubSection, parentKey: string, etabSlug?: string) => {
    if (!isRoleAllowed(sub.roles, role)) return null;
    const items = sub.items.filter(i => isRoleAllowed(i.roles, role));
    if (items.length === 0) return null;

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

  /* ── Render etab group ── */
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

  /* ── Render settings group ── */
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

  /* ── Render standalone item ── */
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

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      background: C.bg, color: C.textNormal,
      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
      width: 240,
    }}>
      {/* Header */}
      <div style={{
        padding: "20px 16px 12px",
        borderBottom: `1px solid ${C.divider}`,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <Image
          src="/logo-ifratelli.png"
          alt="iFratelli"
          width={32}
          height={32}
          style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 6, flexShrink: 0 }}
        />
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
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            style={{
              background: "none", border: "none", cursor: "pointer",
              padding: 4, display: "flex", alignItems: "center", justifyContent: "center",
              color: C.textMuted, flexShrink: 0,
            }}
            title="Reduire le menu"
          >
            <IconChevronLeft size={18} color={C.textMuted} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "8px 0" }}>
        {entries.map((entry, i) => {
          if (entry.kind === "divider") {
            return <div key={`div-${i}`} style={{ height: 1, background: C.divider, margin: "8px 16px" }} />;
          }
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
          <span>Changer de session</span>
        </Link>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   EXPORTS
   ═══════════════════════════════════════════════════════ */

/** Desktop persistent sidebar */
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
      {collapsed
        ? <CollapsedContent onToggle={onToggle} />
        : <ExpandedContent onToggle={onToggle} />
      }
    </aside>
  );
}

/** Mobile drawer sidebar — always expanded */
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
        <ExpandedContent onNavigate={onClose} />
      </div>
    </div>
  );
}
