"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";

type Tab = {
  label: string;
  href: string;
  /** Match any pathname starting with these prefixes */
  match?: string[];
  icon: (active: boolean) => React.ReactNode;
  roles?: string[];
};

/* ── Icons (inline SVGs for minimal bundle) ───────── */

function IconHome({ active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      {!active && <polyline points="9 22 9 12 15 12 15 22" />}
    </svg>
  );
}

function IconCalendar({ active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconUsers({ active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.2" : "1.8"} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconChat({ active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function IconGear({ active }: { active: boolean }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? "2.2" : "1.8"} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.32 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/* ── Tab definitions ──────────────────────────────── */

const TABS: Tab[] = [
  {
    label: "Mes shifts",
    href: "/mes-shifts",
    match: ["/mes-shifts", "/dashboard"],
    icon: (a) => <IconHome active={a} />,
  },
  {
    label: "Planning",
    href: "/plannings",
    match: ["/plannings"],
    icon: (a) => <IconCalendar active={a} />,
  },
  {
    label: "Equipe",
    href: "/rh/equipe",
    match: ["/rh/equipe", "/rh/employe"],
    icon: (a) => <IconUsers active={a} />,
  },
  {
    label: "Messages",
    href: "/messagerie",
    match: ["/messagerie"],
    icon: (a) => <IconChat active={a} />,
  },
  {
    label: "Compte",
    href: "/settings/account",
    match: ["/settings/account"],
    icon: (a) => <IconGear active={a} />,
  },
];

const ACTIVE_COLOR = "#2D6A4F";
const INACTIVE_COLOR = "#999";

/* ── Component ────────────────────────────────────── */

export function BottomTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { role } = useProfile();

  // Only show for non-admin roles on mobile (CSS handles visibility)
  // Admin/direction roles still see it on mobile but have access to sidebar drawer too
  if (!role) return null;

  return (
    <nav className="bottom-tab-bar" style={{
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      display: "none", /* shown via CSS on mobile */
      background: "#fff",
      borderTop: "1px solid rgba(0,0,0,0.08)",
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-around",
        alignItems: "center",
        height: 56,
        maxWidth: 500,
        margin: "0 auto",
      }}>
        {TABS.map((tab) => {
          const isActive = tab.match
            ? tab.match.some(m => pathname === m || pathname.startsWith(m + "/"))
            : pathname === tab.href;

          return (
            <button
              key={tab.href}
              type="button"
              onClick={() => router.push(tab.href)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "4px 0",
                minWidth: 56,
                color: isActive ? ACTIVE_COLOR : INACTIVE_COLOR,
                transition: "color 150ms ease",
              }}
            >
              {tab.icon(isActive)}
              <span style={{
                fontSize: 10,
                fontWeight: isActive ? 700 : 500,
                lineHeight: 1.2,
                letterSpacing: 0.2,
              }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
