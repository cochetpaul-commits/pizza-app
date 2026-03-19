"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import { SIDEBAR_NAV, type NavSection } from "./SidebarNav";
import {
  IconDashboard, IconUsers, IconCalendar, IconClock, IconBeach,
  IconClipboard, IconCalculator, IconSettings, IconWallet,
  IconShoppingBag, IconTruck, IconFileText, IconPackage,
  IconBarChart, IconTrendingUp, IconBook, IconTag,
  IconCalendarEvent, IconChevronDown, IconBox, IconChefHat,
  IconSwitch,
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

function getEtabColor(slug?: string): string {
  if (slug === "piccola-mia" || slug === "piccola_mia") return C.piccolaMia;
  if (slug === "bello-mio" || slug === "bello_mia") return C.belloMio;
  return C.ifratelli;
}

function sectionVisible(section: NavSection, role: Role | null, etabSlug?: string): boolean {
  if (!section.roles) return true;
  if (!role) return false;
  if (!section.roles.includes(role)) return false;
  if (section.slugFilter && (!etabSlug || !etabSlug.includes(section.slugFilter))) return false;
  return true;
}

type SidebarContentProps = {
  onNavigate?: () => void;
};

function SidebarContent({ onNavigate }: SidebarContentProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { role } = useProfile();
  const { current, setCurrent, etablissements, isGroupView, setGroupView, isGroupAdmin } = useEtablissement();
  // Sections with a label start collapsed
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const s of SIDEBAR_NAV) {
      if (s.label.length > 0) init[s.label] = true;
    }
    return init;
  });
  const [etabOpen, setEtabOpen] = useState(false);

  const toggleSection = useCallback((label: string) => {
    setCollapsed(p => ({ ...p, [label]: !p[label] }));
  }, []);

  const etabColor = isGroupView
    ? C.ifratelli
    : (current?.couleur ?? getEtabColor(current?.slug));
  const etabLabel = isGroupView ? "iFratelli Group" : current?.nom ?? "Etablissement";

  // In group view, only show dashboard
  const visibleSections = isGroupView
    ? SIDEBAR_NAV.filter(s => s.label === "" && s.items.some(i => i.href === "/dashboard"))
    : SIDEBAR_NAV.filter(s => sectionVisible(s, role, current?.slug));

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      background: C.bg, color: C.textNormal,
      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
    }}>
      {/* Logo + Role + Etab selector */}
      <div style={{ padding: "20px 16px 12px", borderBottom: `1px solid ${C.divider}` }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Image
              src="/logo-ifratelli.png"
              alt="iFratelli"
              width={32}
              height={32}
              style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 6 }}
            />
            <span style={{
              fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
              fontSize: 15, fontWeight: 700, color: "#fff",
              letterSpacing: 0.5, lineHeight: 1,
            }}>
              iFratelli
            </span>
          </div>
          {role && (
            <div style={{
              marginTop: 4, marginLeft: 42,
              fontSize: 10, fontWeight: 700, letterSpacing: "0.15em",
              color: etabColor, textTransform: "uppercase",
            }}>
              {ROLE_LABELS[role] ?? role.toUpperCase()}
            </div>
          )}
        </div>

        {/* Establishment switch */}
        {etablissements.length > 0 && (
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setEtabOpen(o => !o)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", padding: "8px 10px",
                background: C.bgItem, border: `1px solid ${C.divider}`,
                borderRadius: 8, cursor: "pointer", color: C.textNormal,
              }}
            >
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: etabColor, flexShrink: 0,
              }} />
              <span style={{ flex: 1, textAlign: "left", fontSize: 13, fontWeight: 600 }}>
                {etabLabel}
              </span>
              <IconChevronDown size={14} color={C.textMuted} />
            </button>

            {etabOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                background: "#241e19", border: `1px solid ${C.divider}`,
                borderRadius: 8, padding: "4px 0", zIndex: 10,
              }}>
                {isGroupAdmin && (
                  <button
                    type="button"
                    onClick={() => { setGroupView(true); setEtabOpen(false); router.push("/dashboard"); }}
                    style={etabItemStyle(isGroupView)}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.ifratelli }} />
                    <span>iFratelli Group</span>
                  </button>
                )}
                {etablissements.map(e => {
                  const active = !isGroupView && current?.id === e.id;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => { setCurrent(e); setEtabOpen(false); }}
                      style={etabItemStyle(active)}
                    >
                      <span style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: e.couleur ?? getEtabColor(e.slug), flexShrink: 0,
                      }} />
                      <span>{e.nom}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {visibleSections.map((section, si) => {
          const isOpen = !collapsed[section.label];
          const hasLabel = section.label.length > 0;

          // Filter items by role
          const items = section.items.filter(item => {
            if (!item.roles) return true;
            if (!role) return false;
            return item.roles.includes(role);
          });
          if (items.length === 0) return null;

          return (
            <div key={si} style={{ marginBottom: 4 }}>
              {hasLabel && (() => {
                const SectionIcon = section.icon ? ICON_MAP[section.icon] : null;
                return (
                  <button
                    type="button"
                    onClick={() => toggleSection(section.label)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      width: "100%", padding: "10px 16px 6px",
                      background: "none", border: "none", cursor: "pointer",
                      color: C.textNormal, fontSize: 12, fontWeight: 700,
                      letterSpacing: "0.06em",
                    }}
                  >
                    {SectionIcon && <SectionIcon size={15} color={C.textMuted} />}
                    <span style={{ flex: 1, textAlign: "left" }}>{section.label}</span>
                    <span style={{
                      transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
                      transition: "transform 0.15s ease",
                      display: "flex",
                    }}>
                      <IconChevronDown size={12} color={C.textMuted} />
                    </span>
                  </button>
                );
              })()}

              {isOpen && items.map(item => {
                const active = pathname === item.href || pathname.startsWith(item.href + "/");
                const IconComp = item.icon ? ICON_MAP[item.icon] : null;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
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
                    }}
                  >
                    {IconComp && <IconComp size={16} color={active ? etabColor : C.textMuted} />}
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Bottom: session badge + changer de session */}
      <div style={{ padding: "12px 16px 16px", borderTop: `1px solid ${C.divider}` }}>
        {role && (
          <div style={{
            background: etabColor,
            color: etabColor === C.piccolaMia ? "#5a4a1a" : "#fff",
            borderRadius: 20, padding: "8px 16px",
            textAlign: "center", fontSize: 12, fontWeight: 700,
            letterSpacing: "0.04em", marginBottom: 10,
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

/** Desktop persistent sidebar */
export function Sidebar() {
  return (
    <aside className="sidebar-desktop" style={{
      position: "fixed", top: 0, left: 0, bottom: 0,
      width: 240, zIndex: 40,
      overflowY: "auto",
    }}>
      <SidebarContent />
    </aside>
  );
}

/** Mobile drawer sidebar */
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

function etabItemStyle(active: boolean): React.CSSProperties {
  return {
    display: "flex", alignItems: "center", gap: 8,
    width: "100%", padding: "8px 12px",
    background: active ? "rgba(255,255,255,0.06)" : "transparent",
    border: "none", cursor: "pointer",
    color: active ? "#fff" : "rgba(255,255,255,0.6)",
    fontSize: 13, fontWeight: active ? 600 : 500,
    textAlign: "left",
  };
}
