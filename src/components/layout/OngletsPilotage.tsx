"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";
import { useBureau } from "@/hooks/useBureau";
import { ACCENT, BORD, MUTED } from "@/components/ui/charte";
import type { Role } from "@/lib/rbac";
import { ACHATS_ITEMS, EQUIPE_COUT_ITEMS, RENTABILITE_ITEMS, VENTES_ITEMS, type NavItemV2 } from "./SidebarNav";

/**
 * Onglets des pages Pilotage (04/11/2026, demande de Paul) : en haut de chaque page d'un groupe du menu
 * (Ventes, Achats, Coût de l'équipe, Rentabilité), les autres pages du même groupe, pour passer de
 * « Chiffre d'affaires » à « Couverts » ou « Par produit » sans rouvrir le menu.
 * Mêmes droits que le menu : une page que la personne ne peut pas ouvrir n'a pas d'onglet.
 */
const GROUPES: NavItemV2[][] = [VENTES_ITEMS, ACHATS_ITEMS, EQUIPE_COUT_ITEMS, RENTABILITE_ITEMS];

const sur = (pathname: string, href: string) => {
  const h = href.split("#")[0];
  return pathname === h || pathname.startsWith(h + "/");
};

export function OngletsPilotage() {
  const pathname = usePathname();
  const { role, can } = useProfile();
  const bureau = useBureau();
  const visible = (i: NavItemV2) => (!i.roles || (role != null && (i.roles as Role[]).includes(role))) && (!i.permission || can(i.permission));
  const groupe = GROUPES.find((g) => g.some((i) => sur(pathname, i.href)));
  if (!groupe) return null;
  const items = groupe.filter(visible);
  if (items.length < 2) return null;
  // La page la plus précise l'emporte (/ventes ne s'allume pas sur une sous-page d'un autre onglet)
  const actif = items.filter((i) => sur(pathname, i.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav aria-label="Pages du groupe" style={{ maxWidth: 1100, margin: "0 auto", padding: bureau ? "14px 28px 0" : "10px 12px 0" }}>
      <div style={{ display: "flex", gap: bureau ? 22 : 16, borderBottom: `1px solid ${BORD}`, overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
        {items.map((i) => {
          const on = i.href === actif;
          return (
            <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined} style={{
              padding: "8px 0 9px", fontSize: 14, fontWeight: on ? 700 : 500, whiteSpace: "nowrap", textDecoration: "none",
              color: on ? "#1a1a1a" : MUTED, borderBottom: `2px solid ${on ? ACCENT : "transparent"}`, marginBottom: -1, flexShrink: 0,
            }}>{i.label}</Link>
          );
        })}
      </div>
    </nav>
  );
}
