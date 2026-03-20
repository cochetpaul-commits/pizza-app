"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import {
  buildDynamicNav,
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
  IconSwitch, IconChevronLeft, IconBuilding, IconStore,
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
  store: IconStore,
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
};

/* ── Helpers ──────────────────────────────────────────── */

function isRoleAllowed(roles: Role[] | undefined, role: Role | null): boolean {
  if (!roles) return true;
  if (!role) return false;
  return roles.includes(role);
}

/* ── Burger Icon (matches Komia style) ────────────────── */

function BurgerIcon({ size = 32 }: { size?: number }) {
  return (
    <div style={{
      position: "relative",
      width: size, height: size,
      background: "rgba(255,255,255,0.08)",
      borderRadius: 8,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 3,
    }}>
      <span style={{ width: 14, height: 2, borderRadius: 1, background: "rgba(255,255,255,0.7)" }} />
      <span style={{ width: 14, height: 2, borderRadius: 1, background: "rgba(255,255,255,0.7)" }} />
      <span style={{ width: 14, height: 2, borderRadius: 1, background: "rgba(255,255,255,0.7)" }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   COLLAPSED VIEW — icons only (60px wide)
   ═══════════════════════════════════════════════════════ */

function CollapsedContent({ onExpand }: { onExpand: () => void }) {
  const pathname = usePathname();
  const { role } = useProfile();
  const { current, etablissements, isGroupView, setCurrent, setGroupView } = useEtablissement();
  const [expandedEtab, setExpandedEtab] = useState<string | null>(null);

  const isAdmin = role === "group_admin" || role === "manager";
  const entries: SidebarEntry[] = isAdmin
    ? buildDynamicNav(etablissements.map(e => ({ slug: e.slug, nom: e.nom, couleur: e.couleur })))
    : SIDEBAR_NAV_SIMPLE;

  const etabColor = isGroupView
    ? C.ifratelli
    : (current?.couleur ?? C.ifratelli);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const switchEtab = (slug: string) => {
    const target = etablissements.find(e => e.slug === slug || e.slug?.replace("_", "-") === slug);
    if (target) { setGroupView(false); setCurrent(target); }
  };

  const isEtabActive = (slug: string) =>
    !isGroupView && (current?.slug === slug || current?.slug?.replace("_", "-") === slug);

  /* Icon-only item — clicking expands the sidebar */
  const iconItem = (href: string, icon: string | undefined, active: boolean, color: string, key: string) => {
    const IconComp = icon ? ICON_MAP[icon] : null;
    if (!IconComp) return null;
    return (
      <button
        key={key}
        type="button"
        onClick={onExpand}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 36, height: 36, borderRadius: 8,
          background: active ? C.bgItemActive : "transparent",
          margin: "2px auto",
          transition: "background 0.12s",
          border: "none", cursor: "pointer",
        }}
      >
        <IconComp size={18} color={active ? color : C.textMuted} />
      </button>
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
      const slug = entry.etabSlug;
      const active = isEtabActive(slug);
      const isExpanded = expandedEtab === slug;
      const highlighted = active || isExpanded;

      // Store icon — click toggles accordion
      elements.push(
        <button
          key={`etab-${slug}`}
          type="button"
          onClick={() => {
            switchEtab(slug);
            setExpandedEtab(prev => prev === slug ? null : slug);
          }}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 40, height: 40, borderRadius: 8,
            background: highlighted ? `${entry.color}22` : "transparent",
            border: highlighted ? `1.5px solid ${entry.color}40` : "1.5px solid transparent",
            margin: "3px auto", cursor: "pointer",
            transition: "background 0.15s, border-color 0.15s",
          }}
        >
          <IconStore size={18} color={highlighted ? entry.color : C.textMuted} />
        </button>
      );

      // Accordion: show sub-section icons when expanded
      if (isExpanded) {
        for (const sub of entry.sections) {
          if (!isRoleAllowed(sub.roles, role)) continue;
          if (sub.icon) {
            const SubIcon = ICON_MAP[sub.icon];
            if (SubIcon) {
              const firstHref = sub.items.find(it => isRoleAllowed(it.roles, role))?.href;
              const subActive = sub.items.some(it => isRoleAllowed(it.roles, role) && isActive(it.href) && isEtabActive(slug));
              elements.push(
                <a
                  key={`${slug}-${sub.label}`}
                  href={firstHref ?? "#"}
                  onClick={() => { switchEtab(slug); }}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center",
                    width: 36, height: 36, borderRadius: 8,
                    background: subActive ? C.bgItemActive : "transparent",
                    margin: "1px auto",
                    transition: "background 0.12s",
                    textDecoration: "none",
                  }}
                >
                  <SubIcon size={16} color={subActive ? entry.color : C.textMuted} />
                </a>
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
        elements.push(
          <button
            key="settings-icon"
            type="button"
            onClick={onExpand}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 36, height: 36, borderRadius: 8,
              background: anyActive ? C.bgItemActive : "transparent",
              margin: "2px auto",
              transition: "background 0.12s",
              border: "none", cursor: "pointer",
            }}
          >
            <SettingsIcon size={18} color={anyActive ? etabColor : C.textMuted} />
          </button>
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
      {/* Burger at top */}
      <div style={{
        padding: "14px 0 10px",
        borderBottom: `1px solid ${C.divider}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <button
          type="button"
          onClick={onExpand}
          style={{
            background: "none", border: "none", cursor: "pointer", padding: 0,
          }}
          title="Ouvrir le menu"
        >
          <BurgerIcon size={36} />
        </button>
      </div>

      {/* Icon nav */}
      <nav style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "8px 0" }}>
        {elements}
      </nav>

      {/* Footer */}
      <div style={{
        padding: "12px 0 16px",
        borderTop: `1px solid ${C.divider}`,
        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
      }}>
        <button
          type="button"
          onClick={onExpand}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 36, height: 36, borderRadius: 8,
            background: "none", border: "none", cursor: "pointer",
          }}
        >
          <IconSwitch size={16} color={C.textMuted} />
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   EXPANDED VIEW — full sidebar (240px)
   Clicking a link auto-collapses back
   ═══════════════════════════════════════════════════════ */

type ExpandedContentProps = {
  onNavigate?: () => void;
  onCollapse?: () => void;
  showBurger?: boolean;
};

function ExpandedContent({ onNavigate, onCollapse, showBurger }: ExpandedContentProps) {
  const pathname = usePathname();
  const { role } = useProfile();
  const { current, setCurrent, etablissements, isGroupView, setGroupView } = useEtablissement();

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [openSubSections, setOpenSubSections] = useState<Record<string, boolean>>({});

  // Accordion: only one group open at a time
  const toggleGroup = useCallback((key: string) => {
    setOpenGroups(p => {
      const wasOpen = p[key];
      // Close all, then toggle this one
      const next: Record<string, boolean> = {};
      if (!wasOpen) next[key] = true;
      return next;
    });
    // Also close sub-sections when switching groups
    setOpenSubSections({});
  }, []);

  // Accordion: only one sub-section open at a time within parent
  const toggleSubSection = useCallback((key: string) => {
    setOpenSubSections(p => {
      const wasOpen = p[key];
      const next: Record<string, boolean> = {};
      if (!wasOpen) next[key] = true;
      return next;
    });
  }, []);

  const isAdmin = role === "group_admin" || role === "manager";
  const entries: SidebarEntry[] = isAdmin
    ? buildDynamicNav(etablissements.map(e => ({ slug: e.slug, nom: e.nom, couleur: e.couleur })))
    : SIDEBAR_NAV_SIMPLE;

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

  // When user clicks a link, collapse sidebar + trigger onNavigate (for mobile drawer)
  const handleLinkClick = (etabSlug?: string) => {
    if (etabSlug) switchEtab(etabSlug);
    onNavigate?.();
    onCollapse?.();
  };

  /* ── Render a single nav item (level 3 — smallest, most subtle) ── */
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
        onClick={() => handleLinkClick(etabSlug)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: indent ? "6px 16px 6px 34px" : "7px 16px",
          margin: "1px 8px",
          borderRadius: 6,
          textDecoration: "none",
          fontSize: 12, fontWeight: active ? 600 : 400,
          color: active ? C.textActive : "rgba(255,255,255,0.55)",
          background: active ? `${accentColor}12` : "transparent",
          borderLeft: active ? `2px solid ${accentColor}60` : "2px solid transparent",
          transition: "background 0.12s, color 0.12s",
          whiteSpace: "nowrap", overflow: "hidden",
        }}
      >
        {IconComp && <IconComp size={14} color={active ? accentColor : "rgba(255,255,255,0.35)"} />}
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
    // Get parent color for subtle tinting
    const parentEntry = entries.find((e): e is NavEtabGroup => e.kind === "etab" && e.etabSlug === parentKey);
    const parentColor = parentEntry?.color ?? etabColor;

    return (
      <div key={subKey}>
        <button
          type="button"
          onClick={() => toggleSubSection(subKey)}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            width: "calc(100% - 16px)", padding: "7px 12px 7px 22px",
            margin: "1px 8px",
            borderRadius: 6,
            background: isOpen ? `${parentColor}0A` : "transparent",
            border: "none", cursor: "pointer",
            color: isOpen ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.5)",
            fontSize: 12, fontWeight: 600,
            letterSpacing: "0.03em",
            whiteSpace: "nowrap", overflow: "hidden",
            transition: "background 0.12s, color 0.12s",
          }}
        >
          {SectionIcon && <SectionIcon size={14} color={isOpen ? `${parentColor}BB` : "rgba(255,255,255,0.35)"} />}
          <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis" }}>
            {sub.label}
          </span>
          <span style={{
            transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform 0.15s ease",
            display: "flex", flexShrink: 0,
          }}>
            <IconChevronDown size={10} color="rgba(255,255,255,0.3)" />
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
    // Active = either open (clicked) or current context matches
    const highlighted = isOpen || isEtabActive(entry.etabSlug);

    return (
      <div key={groupKey} style={{ marginBottom: 2 }}>
        <button
          type="button"
          onClick={() => toggleGroup(groupKey)}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 16px",
            margin: "1px 8px",
            width: "calc(100% - 16px)",
            borderRadius: 6,
            background: highlighted ? C.bgItemActive : "transparent",
            border: "none", cursor: "pointer",
            borderLeft: highlighted ? `3px solid ${entry.color}` : "3px solid transparent",
            color: highlighted ? C.textActive : C.textNormal,
            fontSize: 13, fontWeight: highlighted ? 600 : 500,
            whiteSpace: "nowrap", overflow: "hidden",
            transition: "background 0.12s, color 0.12s",
          }}
        >
          <IconStore size={16} color={highlighted ? entry.color : C.textMuted} />
          <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis" }}>
            {entry.label}
          </span>
          <span style={{
            transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform 0.15s ease",
            display: "flex", flexShrink: 0,
          }}>
            <IconChevronDown size={12} color={highlighted ? entry.color : C.textMuted} />
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
        onClick={() => handleLinkClick()}
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
        {showBurger ? (
          <button
            type="button"
            onClick={onCollapse}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}
            title="Reduire le menu"
          >
            <BurgerIcon size={36} />
          </button>
        ) : (
          <Image
            src="/logo-ifratelli.png"
            alt="iFratelli"
            width={32}
            height={32}
            style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 6, flexShrink: 0 }}
          />
        )}
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
        {!showBurger && onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
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
          onClick={() => handleLinkClick()}
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

type SidebarProps = {
  collapsed: boolean;
  onToggle: () => void;
  onExpand: () => void;
  onCollapse: () => void;
};

/** Desktop persistent sidebar */
export function Sidebar({ collapsed, onExpand, onCollapse }: SidebarProps) {
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
        ? <CollapsedContent onExpand={onExpand} />
        : <ExpandedContent onCollapse={onCollapse} showBurger />
      }
    </aside>
  );
}

/** Mobile drawer sidebar — always expanded, no burger, closes on nav */
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
