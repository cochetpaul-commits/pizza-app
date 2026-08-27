import type { Role } from "@/lib/rbac";

/* ── Types ─────────────────────────────────────────────── */

export type NavItemV2 = {
  label: string;
  href: string;
  icon?: string;
  roles?: Role[];
  /** Optional permission key — item hidden if user lacks this permission */
  permission?: string;
};

export type NavSubSection = {
  label: string;
  icon?: string;
  /** Optional permission key — section hidden if user lacks this permission */
  permission?: string;
  /** Optional: navigate to this href when clicking the section header */
  href?: string;
  items: NavItemV2[];
  roles?: Role[];
};

export type NavEtabGroup = {
  kind: "etab";
  etabSlug: string;
  label: string;
  icon?: string;
  color: string;
  sections: NavSubSection[];
  roles?: Role[];
};

export type NavSettingsGroup = {
  kind: "settings";
  label: string;
  icon?: string;
  sections: NavSubSection[];
  roles?: Role[];
};

export type NavStandaloneItem = {
  kind: "item";
  label: string;
  href: string;
  icon?: string;
  roles?: Role[];
};

export type NavDivider = {
  kind: "divider";
};

export type SidebarEntry = NavEtabGroup | NavSettingsGroup | NavStandaloneItem | NavDivider;

/* ── Section item templates ─────────────────────────────── */

// PILOTAGE (analyse & performance)
const PILOTAGE_ITEMS: NavItemV2[] = [
  // "Mon tableau" : managers (vue equipe) et employes (vue perso par poste).
  // Les admins ont la vision globale via /pilotage — pas de tableau personnalise.
  { label: "Mon tableau", href: "/mon-tableau", icon: "dashboard", roles: ["manager", "equipier"] },
  { label: "Ventes", href: "/ventes", icon: "barChart", permission: "performances.view" },
  { label: "Produits", href: "/ventes/marges", icon: "wallet", permission: "performances.pilotage" },
  { label: "Rentabilité", href: "/rentabilite", icon: "calculator", permission: "performances.pilotage" },
  { label: "Masse salariale", href: "/rh/masse-salariale", icon: "calculator", permission: "performances.pilotage" },
];

// PERSONNEL (RH)
export const PLANNING_ITEMS: NavItemV2[] = [
  { label: "Employes", href: "/rh/equipe", icon: "users" },
  { label: "Conges", href: "/rh/conges", icon: "beach" },
  { label: "Mes congés", href: "/mes-conges", icon: "beach" },
];

// PRODUCTION (fiches techniques, catalogue, articles de vente)
const PRODUCTION_ITEMS: NavItemV2[] = [
  { label: "Fiches techniques", href: "/recettes", icon: "fileText" },
  { label: "Catalogue", href: "/catalogue", icon: "book" },
  { label: "Prix de vente", href: "/epicerie", icon: "tag" },
  { label: "Inventaire", href: "/inventaire", icon: "package" },
];
// Même arborescence dans les deux établissements (demande du 21/08/2026)
const PRODUCTION_ITEMS_PICCOLA: NavItemV2[] = PRODUCTION_ITEMS;

// ACHATS (fournisseurs & stocks)
export const ACHATS_ITEMS: NavItemV2[] = [
  { label: "Base produits", href: "/ingredients", icon: "tag" },
  { label: "Commandes", href: "/commandes", icon: "shoppingBag" },
  { label: "Stock", href: "/stock", icon: "package" },
  { label: "Factures & Stats", href: "/achats", icon: "fileText" },
  { label: "Catalogue Popina", href: "/admin/popina-catalogue", icon: "tag", roles: ["group_admin"] },
];

// HACCP (autocontrôles & conformité)
export const HACCP_ITEMS: NavItemV2[] = [
  { label: "Tableau HACCP", href: "/haccp",                icon: "clipboard" },
  { label: "Températures",  href: "/haccp/temperatures",   icon: "trendingUp" },
  { label: "Nettoyage",     href: "/haccp/cleaning",       icon: "clipboard" },
  { label: "Traçabilité",   href: "/haccp/tracability",    icon: "tag" },
  { label: "Réception",     href: "/haccp/reception",      icon: "package" },
  { label: "Étiqueteuse",   href: "/haccp/labels",         icon: "fileText" },
  { label: "Paramètres",    href: "/haccp/admin",          icon: "settings", roles: ["group_admin"] }
];

// EVENEMENTIEL (Piccola uniquement)
export const EVENEMENTIEL_ITEMS: NavItemV2[] = [
  { label: "Evenements", href: "/evenements", icon: "calendarEvent" },
  { label: "Carnet clients", href: "/clients", icon: "users" },
  { label: "Devis", href: "/devis", icon: "fileText" },
  { label: "Factures clients", href: "/clients/factures", icon: "fileText" },
];

// Sections
// Pas de permission au niveau section : "Mon tableau" est accessible a tous,
// les autres items restent filtres individuellement par permission.
export const PILOTAGE_SECTION: NavSubSection = { label: "Pilotage", icon: "barChart", href: "/mon-tableau", items: PILOTAGE_ITEMS };
export const PERSONNEL_SECTION: NavSubSection = { label: "Personnel", icon: "users", href: "/rh/equipe", roles: ["group_admin", "manager"], items: PLANNING_ITEMS };
export const PRODUCTION_SECTION: NavSubSection = { label: "Production", icon: "package", roles: ["group_admin", "manager", "equipier"], items: PRODUCTION_ITEMS };
export const PRODUCTION_SECTION_PICCOLA: NavSubSection = { label: "Production", icon: "package", roles: ["group_admin", "manager", "equipier"], items: PRODUCTION_ITEMS_PICCOLA };
const ACHATS_ITEMS_PICCOLA: NavItemV2[] = ACHATS_ITEMS.filter(i => i.href !== "/admin/popina-catalogue");
export const ACHATS_SECTION: NavSubSection = { label: "Achats", icon: "shoppingBag", roles: ["group_admin", "manager", "equipier"], items: ACHATS_ITEMS };
export const ACHATS_SECTION_PICCOLA: NavSubSection = { label: "Achats", icon: "shoppingBag", roles: ["group_admin", "manager", "equipier"], items: ACHATS_ITEMS_PICCOLA };
export const HACCP_SECTION: NavSubSection = { label: "HACCP", icon: "clipboard", roles: ["group_admin", "manager"], items: HACCP_ITEMS };
export const EVENEMENTIEL_SECTION: NavSubSection = { label: "Evenementiel", icon: "calendarEvent", items: EVENEMENTIEL_ITEMS };

/* ── Simplified nav for employee roles ─────────────────── */

export const SIDEBAR_NAV_SIMPLE: SidebarEntry[] = [
  { kind: "item", label: "Mes congés", href: "/mes-conges", icon: "beach" },
  { kind: "item", label: "Fiches techniques", href: "/recettes", icon: "fileText" },
  { kind: "item", label: "Catalogue", href: "/catalogue", icon: "book" },
  { kind: "item", label: "Inventaire", href: "/inventaire", icon: "clipboard" },
  { kind: "item", label: "Commandes", href: "/commandes", icon: "shoppingBag" },
  { kind: "item", label: "Fournisseurs", href: "/fournisseurs", icon: "truck" },
  { kind: "divider" },
  { kind: "item", label: "Mon compte", href: "/settings/account", icon: "settings" },
];
