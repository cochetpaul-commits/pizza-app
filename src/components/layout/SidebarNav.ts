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

// ANALYSE : un indicateur par entrée, dans la logique ComandR (10/10/2026).
// Les ancres (#couverts, #productivite) ouvrent la page sur la section voulue.
// Pilotage par question (27/10/2026, à la ComandR) : quatre groupes courts, repliés par défaut.
export const VENTES_ITEMS: NavItemV2[] = [
  { label: "Chiffre d'affaires", href: "/analyse/chiffre-affaires", icon: "barChart", permission: "performances.view" },
  { label: "Couverts", href: "/analyse/couverts", icon: "users", permission: "performances.view" },
  { label: "Par produit", href: "/ventes", icon: "tag", permission: "performances.view" },
];
export const RENTABILITE_ITEMS: NavItemV2[] = [
  // 30/10/2026 : Résultat et Marge fusionnés (une seule page, du CA à l'EBE) ; Simulations accessible depuis Objectifs › Et si…
  { label: "Résultat", href: "/analyse/marge", icon: "wallet", permission: "performances.pilotage" },
  { label: "Rentabilité des plats", href: "/analyse/plats", icon: "book", permission: "performances.pilotage" },
  { label: "Objectifs", href: "/objectifs", icon: "dashboard", permission: "performances.pilotage" },
];
export const ACHATS_ITEMS: NavItemV2[] = [
  { label: "Suivi des achats", href: "/achats", icon: "fileText", permission: "achats.view" },
  { label: "Variations de prix", href: "/variations-prix", icon: "trendingUp", permission: "achats.view" },
];
export const EQUIPE_COUT_ITEMS: NavItemV2[] = [
  { label: "Masse salariale", href: "/analyse/masse-salariale", icon: "wallet", permission: "performances.pilotage" },
  { label: "CA par personne", href: "/analyse/ca-personne", icon: "clock", permission: "performances.pilotage" },
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
  { label: "Stock et doses", href: "/settings/stock", icon: "box", roles: MANAGERS },
  { label: "Mes congés", href: "/mes-conges", icon: "beach" },
  { label: "Mon compte", href: "/settings/account", icon: "settings" },
];

/* ── Listes ────────────────────────────────────────────── */

/** Managers et admins, dans un établissement. `accueil` = page d'accueil de l'établissement. */
export function navEtablissement(accueil: string, piccola: boolean): NavEntry[] {
  // Ordre validé le 10/10/2026 : le quotidien d'abord (du plus fréquent au plus rare), les référentiels ensuite,
  // puis l'équipe, puis le bloc direction (ventes, achats, analyse), la configuration en bas.
  return [
    { kind: "page", label: "Accueil", href: accueil, icon: "dashboard" },
    // Exploitation scindée en trois (29/10/2026) : la salle, la cuisine, les achats et le stock
    { kind: "divider", label: "Service" },
    { kind: "page", label: "Carte", href: "/carte", icon: "book", permission: "operations.recettes" },
    ...(piccola ? [] : [{ kind: "page", label: "Cave", href: "/cave", icon: "tag", permission: "operations.recettes" } as NavEntry]),
    // Clôture de caisse : Bello Mio seulement pour l'instant (Popina + TPE Flatpay)
    ...(piccola ? [] : [{ kind: "page", label: "Clôture", href: "/cloture", icon: "calculator", permission: "caisse.cloture" } as NavEntry]),
    ...(piccola ? [{ kind: "group", label: "Événementiel", icon: "calendarEvent", roles: MANAGERS, items: EVENEMENTIEL_ITEMS } as NavEntry] : []),
    { kind: "divider", label: "Cuisine" },
    // Les pâtons et la focaccia de tous les jours (28/10) : un geste au lieu de Carte > Préparations > Empâtements > fiche
    { kind: "page", label: "Empâtements", href: "/empatements", icon: "chefHat", permission: "operations.recettes" },
    { kind: "group", label: "HACCP", icon: "clipboard", roles: MANAGERS, items: HACCP_ITEMS },
    { kind: "divider", label: "Achats et stock" },
    { kind: "page", label: "Commandes", href: "/commandes", icon: "shoppingBag", permission: "achats.edit" },
    // Le stock vit dans la Base produits depuis le 10/10/2026 ; l'inventaire le remet à niveau
    { kind: "page", label: "Base produits", href: "/ingredients", icon: "tag", permission: "achats.inventaire" },
    { kind: "page", label: "Inventaire", href: "/inventaire", icon: "package", permission: "achats.inventaire" },
    { kind: "page", label: "Fournisseurs", href: "/fournisseurs", icon: "truck", permission: "achats.edit" },
    { kind: "divider", label: "Équipe" },
    { kind: "page", label: "Équipe", href: "/rh/equipe", icon: "users", roles: MANAGERS },
    { kind: "page", label: "Congés", href: "/rh/conges", icon: "beach", roles: MANAGERS },
    ...(piccola ? [] : [{ kind: "page", label: "Pourboires", href: "/rh/pourboires", icon: "wallet", permission: "heures.edit_team" } as NavEntry]),
    // Dans l'ordre du compte de résultat (29/10/2026) : ventes, achats, équipe, puis ce qu'il reste
    { kind: "divider", label: "Pilotage" },
    { kind: "group", label: "Ventes", icon: "barChart", items: VENTES_ITEMS },
    { kind: "group", label: "Achats", icon: "fileText", items: ACHATS_ITEMS },
    { kind: "group", label: "Coût de l'équipe", icon: "users", items: EQUIPE_COUT_ITEMS },
    { kind: "group", label: "Rentabilité", icon: "wallet", items: RENTABILITE_ITEMS },
    { kind: "divider", label: "Configuration" },
    { kind: "group", label: "Paramètres", icon: "settings", items: PARAMETRES_ITEMS },
  ];
}

/** Équipiers : leur tableau, la production, les achats, et leurs pages perso */
export const NAV_EQUIPIER: NavEntry[] = [
  { kind: "page", label: "Mon tableau", href: "/mon-tableau", icon: "dashboard" },
  { kind: "divider", label: "Service" },
  { kind: "page", label: "Carte", href: "/carte", icon: "book", permission: "operations.recettes" },
  { kind: "page", label: "Cave", href: "/cave", icon: "tag", permission: "operations.recettes" },
  { kind: "page", label: "Clôture", href: "/cloture", icon: "calculator", permission: "caisse.cloture" },
  { kind: "divider", label: "Cuisine" },
  { kind: "page", label: "Empâtements", href: "/empatements", icon: "chefHat", permission: "operations.recettes" },
  { kind: "divider", label: "Achats et stock" },
  { kind: "page", label: "Commandes", href: "/commandes", icon: "shoppingBag", permission: "achats.edit" },
  { kind: "page", label: "Inventaire", href: "/inventaire", icon: "package", permission: "achats.inventaire" },
  { kind: "page", label: "Fournisseurs", href: "/fournisseurs", icon: "truck", permission: "achats.edit" },
  { kind: "divider", label: "Pilotage" },
  { kind: "group", label: "Ventes", icon: "barChart", items: VENTES_ITEMS },
  { kind: "group", label: "Coût de l'équipe", icon: "users", items: EQUIPE_COUT_ITEMS },
  { kind: "group", label: "Rentabilité", icon: "wallet", items: RENTABILITE_ITEMS },
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
