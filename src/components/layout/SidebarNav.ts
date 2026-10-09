import type { Role } from "@/lib/rbac";

/**
 * Barre latérale bureau (refonte du 08/10/2026, calquée sur ComandR) :
 * un bouton d'établissement en haut, puis une liste À PLAT, une icône par
 * entrée. Seules les zones à plusieurs pages (Analyse, HACCP, Événementiel,
 * Paramètres) ont un chevron et se déploient sur place. Rien n'est caché
 * derrière un accordéon d'établissement : changer d'établissement garde la
 * page ouverte.
 *
 * La version mobile (MobileHeader, BottomTabBar) a sa propre navigation et
 * n'utilise pas ce fichier.
 */

/* ── Types ─────────────────────────────────────────────── */

export type NavItemV2 = {
  label: string;
  href: string;
  icon?: string;
  roles?: Role[];
  /** Clé de permission : entrée masquée si l'utilisateur ne l'a pas */
  permission?: string;
};

/** Entrée de la liste : une page, ou un groupe à chevron qui se déploie sur place */
export type NavEntry =
  | ({ kind: "page" } & NavItemV2)
  | { kind: "group"; label: string; icon?: string; roles?: Role[]; permission?: string; items: NavItemV2[] }
  | { kind: "divider"; label?: string };

/* ── Pages ─────────────────────────────────────────────── */

const MANAGERS: Role[] = ["group_admin", "manager"];

// ANALYSE (ex-Pilotage) : les pages chiffrées au-delà des ventes
export const ANALYSE_ITEMS: NavItemV2[] = [
  { label: "Produits", href: "/ventes/marges", icon: "wallet", permission: "performances.pilotage" },
  { label: "Rentabilité", href: "/rentabilite", icon: "calculator", permission: "performances.pilotage" },
  { label: "Masse salariale", href: "/rh/masse-salariale", icon: "trendingUp", permission: "performances.pilotage" },
  { label: "Factures & Stats", href: "/achats", icon: "fileText", permission: "achats.view" },
];

// HACCP (autocontrôles & conformité)
export const HACCP_ITEMS: NavItemV2[] = [
  { label: "Tableau HACCP", href: "/haccp",                icon: "clipboard" },
  { label: "Températures",  href: "/haccp/temperatures",   icon: "trendingUp" },
  { label: "Nettoyage",     href: "/haccp/cleaning",       icon: "clipboard" },
  { label: "Traçabilité",   href: "/haccp/tracability",    icon: "tag" },
  { label: "Réception",     href: "/haccp/reception",      icon: "package" },
  { label: "Étiqueteuse",   href: "/haccp/labels",         icon: "fileText" },
  { label: "Paramètres",    href: "/haccp/admin",          icon: "settings", roles: ["group_admin"] },
];

// ÉVÉNEMENTIEL (Piccola Mia uniquement)
export const EVENEMENTIEL_ITEMS: NavItemV2[] = [
  { label: "Événements", href: "/evenements", icon: "calendarEvent" },
  { label: "Carnet clients", href: "/clients", icon: "users" },
  { label: "Devis", href: "/devis", icon: "fileText" },
  { label: "Factures clients", href: "/clients/factures", icon: "fileText" },
];

// PARAMÈTRES (groupe « Configuration », en bas)
export const PARAMETRES_ITEMS: NavItemV2[] = [
  { label: "Établissements", href: "/settings/etablissements", icon: "building", roles: ["group_admin"] },
  { label: "Catégories", href: "/settings/categories", icon: "tag", roles: ["group_admin"] },
  { label: "Accès de l'équipe", href: "/settings/acces", icon: "users", roles: ["group_admin"] },
  { label: "Prix de vente", href: "/epicerie", icon: "tag", roles: MANAGERS },
  { label: "Mes congés", href: "/mes-conges", icon: "beach" },
  { label: "Mon compte", href: "/settings/account", icon: "settings" },
];

/* ── Listes ────────────────────────────────────────────── */

/** Managers et admins, dans un établissement. `accueil` = page d'accueil de l'établissement. */
export function navEtablissement(accueil: string, piccola: boolean): NavEntry[] {
  return [
    { kind: "page", label: "Accueil", href: accueil, icon: "dashboard" },
    { kind: "page", label: "Équipe", href: "/rh/equipe", icon: "users", roles: MANAGERS },
    { kind: "page", label: "Congés", href: "/rh/conges", icon: "beach", roles: MANAGERS },
    { kind: "page", label: "Carte", href: "/carte", icon: "book", permission: "operations.recettes" },
    { kind: "page", label: "Inventaire", href: "/inventaire", icon: "package", permission: "achats.inventaire" },
    { kind: "page", label: "Commandes", href: "/commandes", icon: "shoppingBag", permission: "achats.edit" },
    { kind: "page", label: "Base produits", href: "/ingredients", icon: "tag", permission: "achats.inventaire" },
    { kind: "page", label: "Stock", href: "/stock", icon: "box", permission: "achats.inventaire" },
    { kind: "page", label: "Fournisseurs", href: "/fournisseurs", icon: "truck", permission: "achats.edit" },
    { kind: "page", label: "Ventes", href: "/ventes", icon: "barChart", permission: "performances.view" },
    { kind: "group", label: "Analyse", icon: "trendingUp", items: ANALYSE_ITEMS },
    { kind: "group", label: "HACCP", icon: "clipboard", roles: MANAGERS, items: HACCP_ITEMS },
    ...(piccola ? [{ kind: "group", label: "Événementiel", icon: "calendarEvent", roles: MANAGERS, items: EVENEMENTIEL_ITEMS } as NavEntry] : []),
    { kind: "divider", label: "Configuration" },
    { kind: "group", label: "Paramètres", icon: "settings", items: PARAMETRES_ITEMS },
  ];
}

/** Équipiers : leur tableau, la production, les achats, et leurs pages perso */
export const NAV_EQUIPIER: NavEntry[] = [
  { kind: "page", label: "Mon tableau", href: "/mon-tableau", icon: "dashboard" },
  { kind: "page", label: "Carte", href: "/carte", icon: "book", permission: "operations.recettes" },
  { kind: "page", label: "Inventaire", href: "/inventaire", icon: "package", permission: "achats.inventaire" },
  { kind: "page", label: "Commandes", href: "/commandes", icon: "shoppingBag", permission: "achats.edit" },
  { kind: "page", label: "Fournisseurs", href: "/fournisseurs", icon: "truck", permission: "achats.edit" },
  { kind: "page", label: "Ventes", href: "/ventes", icon: "barChart", permission: "performances.view" },
  { kind: "group", label: "Analyse", icon: "trendingUp", items: ANALYSE_ITEMS },
  { kind: "divider", label: "Configuration" },
  { kind: "page", label: "Mes congés", href: "/mes-conges", icon: "beach" },
  { kind: "page", label: "Mon compte", href: "/settings/account", icon: "settings" },
];

/** Vue groupe (administrateurs) : le tableau de bord iFratelli et la configuration */
export const NAV_GROUPE: NavEntry[] = [
  { kind: "page", label: "Accueil", href: "/dashboard", icon: "dashboard" },
  { kind: "divider", label: "Configuration" },
  { kind: "group", label: "Paramètres", icon: "settings", items: PARAMETRES_ITEMS },
];
