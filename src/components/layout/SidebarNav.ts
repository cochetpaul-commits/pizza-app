import type { Role } from "@/lib/rbac";

/* ── Legacy types (kept for compatibility) ─────────────── */

export type NavSection = {
  label: string;
  icon?: string;
  items: NavItem[];
  roles?: Role[];
  slugFilter?: string;
};

export type NavItem = {
  label: string;
  href: string;
  icon?: string;
  roles?: Role[];
};

/* ── V2 types ──────────────────────────────────────────── */

export type NavItemV2 = {
  label: string;
  href: string;
  icon?: string;
  roles?: Role[];
};

export type NavSubSection = {
  label: string;
  icon?: string;
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

export const PLANNING_ITEMS: NavItemV2[] = [
  { label: "Employes", href: "/rh/equipe", icon: "users" },
  { label: "Pointage", href: "/rh/pointage", icon: "clock" },
  { label: "Conges", href: "/rh/conges", icon: "beach" },
  { label: "Emargement", href: "/rh/emargement", icon: "clipboard" },
  { label: "Rapport de paie", href: "/rh/rapports", icon: "fileText" },
  { label: "Simulation", href: "/rh/masse-salariale", icon: "calculator", roles: ["group_admin"] },
];

export const ACHATS_ITEMS: NavItemV2[] = [
  { label: "Stats d'achats", href: "/stats-achats", icon: "barChart" },
  { label: "Factures", href: "/achats", icon: "fileText" },
  { label: "Base produits", href: "/ingredients", icon: "tag" },
];

export const PERFORMANCES_ITEMS: NavItemV2[] = [
  { label: "Indicateurs cles", href: "/pilotage", icon: "barChart" },
  { label: "Variations & alertes", href: "/variations-prix", icon: "trendingUp" },
];

export const OPERATIONS_ITEMS: NavItemV2[] = [
  { label: "Catalogue recettes", href: "/recettes", icon: "book" },
  { label: "Fiches techniques", href: "/recettes", icon: "book" },
  { label: "Commandes", href: "/commandes", icon: "shoppingBag" },
  { label: "Inventaire", href: "/inventaire", icon: "package" },
];

export const EVENEMENTIEL_ITEMS: NavItemV2[] = [
  { label: "Particuliers", href: "/evenements/clients", icon: "users" },
  { label: "Entreprise", href: "/evenements", icon: "calendarEvent" },
  { label: "Creer devis", href: "/devis/new", icon: "fileText" },
  { label: "Factures", href: "/clients/factures", icon: "fileText" },
  { label: "Import Kezia", href: "/kezia", icon: "fileText" },
];

// Keep legacy exports for compatibility
export const PERSONNEL_ITEMS = PLANNING_ITEMS;
export const FINANCE_ITEMS = ACHATS_ITEMS;
export const CLIENTS_ITEMS = EVENEMENTIEL_ITEMS;

/** Base sections for every establishment */
const BASE_ETAB_SECTIONS: NavSubSection[] = [
  { label: "Planning", icon: "calendar", items: PLANNING_ITEMS },
  { label: "Finance", icon: "wallet", roles: ["group_admin"], items: [] }, // placeholder — Popina later
  { label: "Achats", icon: "shoppingBag", roles: ["group_admin"], items: ACHATS_ITEMS },
  { label: "Performances", icon: "barChart", roles: ["group_admin"], items: PERFORMANCES_ITEMS },
  { label: "Operations", icon: "package", roles: ["group_admin"], items: OPERATIONS_ITEMS },
];

/** Extra section for establishments with events (piccola-mia etc.) */
const EVENEMENTIEL_SECTION: NavSubSection = {
  label: "Evenementiel", icon: "calendarEvent", roles: ["group_admin"], items: EVENEMENTIEL_ITEMS,
};

/** Fournisseurs standalone item for each etab */
const FOURNISSEURS_ITEM: NavItemV2 = { label: "Fournisseurs", href: "/fournisseurs", icon: "truck" };

/** Build dynamic nav entries from a list of establishments */
export function buildDynamicNav(
  etabs: { slug: string; nom: string; couleur: string | null }[],
): SidebarEntry[] {
  const entries: SidebarEntry[] = [
    { kind: "item", label: "Accueil", href: "/dashboard", icon: "dashboard" },
    { kind: "divider" },
  ];

  for (const etab of etabs) {
    const isPiccola = etab.slug?.includes("piccola");
    const sections: NavSubSection[] = [
      ...BASE_ETAB_SECTIONS,
      ...(isPiccola ? [EVENEMENTIEL_SECTION] : []),
      // Fournisseurs as a flat section
      { label: "", items: [FOURNISSEURS_ITEM] },
    ];

    entries.push({
      kind: "etab",
      etabSlug: etab.slug,
      label: etab.nom,
      color: etab.couleur ?? "#D4775A",
      roles: ["group_admin", "manager"],
      sections,
    });
  }

  entries.push({ kind: "divider" });

  // Parametres
  entries.push({
    kind: "settings",
    label: "Parametres",
    icon: "settings",
    roles: ["group_admin"],
    sections: [
      {
        label: "Etablissement",
        icon: "box",
        items: [
          { label: "Configuration", href: "/settings/etablissements", icon: "building" },
          { label: "Planning", href: "/settings/planning", icon: "calendar" },
          { label: "Pointeuse", href: "/settings/pointeuse", icon: "clock" },
        ],
      },
      {
        label: "Employes",
        icon: "users",
        items: [
          { label: "Informations", href: "/admin/utilisateurs", icon: "users" },
          { label: "Contrat", href: "/settings/employes/contrat", icon: "fileText" },
          { label: "Acces application", href: "/settings/employes/acces", icon: "settings" },
          { label: "Role et permissions", href: "/settings/employes/roles", icon: "clipboard" },
        ],
      },
      {
        label: "Fournisseurs",
        icon: "truck",
        items: [
          { label: "Liste fournisseurs", href: "/fournisseurs", icon: "truck" },
        ],
      },
      {
        label: "",
        items: [
          { label: "Mon compte", href: "/settings/account", icon: "settings" },
        ],
      },
    ],
  });

  return entries;
}

/** Hardcoded fallback while context loads */
export const SIDEBAR_NAV_V2: SidebarEntry[] = buildDynamicNav([
  { slug: "bello-mio", nom: "Bello Mio", couleur: "#e27f57" },
  { slug: "piccola-mia", nom: "Piccola Mia", couleur: "#efd199" },
]);

/* ── Simplified nav for employee roles ─────────────────── */

export const SIDEBAR_NAV_SIMPLE: SidebarEntry[] = [
  { kind: "item", label: "Accueil", href: "/dashboard", icon: "dashboard" },
  { kind: "divider" },
  { kind: "item", label: "Mon planning", href: "/mes-shifts", icon: "calendar" },
  { kind: "item", label: "Recettes", href: "/recettes", icon: "book", roles: ["cuisine", "salle"] },
  { kind: "item", label: "Ingredients", href: "/ingredients", icon: "tag", roles: ["cuisine", "salle"] },
  { kind: "item", label: "Commandes", href: "/commandes", icon: "shoppingBag", roles: ["cuisine", "salle"] },
  { kind: "item", label: "Fournisseurs", href: "/fournisseurs", icon: "truck", roles: ["cuisine", "salle"] },
  { kind: "item", label: "Planning", href: "/plannings", icon: "calendar", roles: ["cuisine", "salle"] },
  { kind: "divider" },
  { kind: "item", label: "Mon compte", href: "/settings/account", icon: "settings" },
];

/* ── Legacy SIDEBAR_NAV (kept for TopBar compatibility) ── */

export const SIDEBAR_NAV: NavSection[] = [
  {
    label: "",
    items: [
      { label: "Tableau de bord", href: "/dashboard", icon: "dashboard" },
    ],
  },
  {
    label: "Gestion du personnel",
    icon: "users",
    roles: ["group_admin", "manager"],
    items: [
      { label: "Employes", href: "/rh/equipe" },
      { label: "Planning", href: "/plannings" },
      { label: "Pointage", href: "/rh/pointage" },
      { label: "Conges", href: "/rh/conges" },
      { label: "Feuille d'emargement", href: "/rh/emargement" },
      { label: "Simulation", href: "/rh/masse-salariale", roles: ["group_admin"] },
    ],
  },
  {
    label: "Gestion de la finance",
    icon: "wallet",
    roles: ["group_admin"],
    items: [
      { label: "Base ingredients", href: "/ingredients" },
      { label: "Recettes", href: "/recettes" },
      { label: "Commandes", href: "/commandes" },
      { label: "Achats", href: "/achats" },
      { label: "Variations & alertes", href: "/variations-prix" },
      { label: "Pilotage", href: "/pilotage" },
      { label: "Inventaire", href: "/inventaire" },
      { label: "Articles en vente", href: "/epicerie" },
    ],
  },
  {
    label: "Cuisine",
    icon: "chefHat",
    roles: ["cuisine", "salle"],
    items: [
      { label: "Recettes", href: "/recettes" },
      { label: "Ingredients", href: "/ingredients" },
      { label: "Commandes", href: "/commandes" },
      { label: "Fournisseurs", href: "/fournisseurs" },
      { label: "Planning", href: "/plannings" },
    ],
  },
  {
    label: "Gestion des clients",
    icon: "calendarEvent",
    roles: ["group_admin"],
    slugFilter: "piccola",
    items: [
      { label: "Particuliers", href: "/evenements/clients" },
      { label: "Carnet clients", href: "/clients" },
      { label: "Creer devis", href: "/devis/new" },
      { label: "Factures", href: "/clients/factures" },
      { label: "Evenements", href: "/evenements" },
      { label: "Import Kezia", href: "/kezia" },
    ],
  },
  {
    label: "Parametres",
    icon: "settings",
    roles: ["group_admin"],
    items: [
      { label: "Utilisateurs", href: "/admin/utilisateurs" },
      { label: "Mon compte", href: "/settings/account" },
    ],
  },
];

/** Title map: pathname → page title for TopBar */
export const PAGE_TITLES: Record<string, string> = {
  "/dashboard": "Accueil",
  "/rh/equipe": "Salaries",
  "/plannings": "Planning",
  "/rh/pointage": "Pointage",
  "/rh/conges": "Conges",
  "/rh/emargement": "Emargement",
  "/rh/masse-salariale": "Simulation & Masse Salariale",
  "/rh/rapports": "Rapports RH",
  "/settings/planning": "Gestion du planning",
  "/settings/etablissements": "Etablissements",
  "/settings/finance": "Gestion de la finance",
  "/settings/pointeuse": "Pointeuse",
  "/settings/employes/contrat": "Contrat",
  "/settings/employes/acces": "Acces application",
  "/settings/employes/roles": "Role et permissions",
  "/settings/account": "Mon compte",
  "/pilotage": "Pilotage",
  "/achats": "Achats",
  "/mercuriale": "Mercuriale",
  "/stats-achats": "Stats d'achats",
  "/variations-prix": "Variations & alertes",
  "/fournisseurs": "Fournisseurs",
  "/ingredients": "Base ingredients",
  "/invoices": "Factures",
  "/commandes": "Commandes",
  "/inventaire": "Inventaire",
  "/recettes": "Recettes",
  "/epicerie": "Articles en vente",
  "/finances": "Finances",
  "/evenements": "Evenements",
  "/clients": "Carnet clients",
  "/clients/factures": "Factures clients",
  "/devis/new": "Nouveau devis",
  "/admin/utilisateurs": "Utilisateurs",
  "/messagerie": "Messagerie",
  "/mes-shifts": "Mon planning",
  "/notifications": "Notifications",
  "/kezia": "Import Kezia",
  "/session": "Session",
  "/recettes/new/pizza": "Nouvelle pizza",
  "/recettes/new/cuisine": "Nouvelle recette cuisine",
  "/recettes/new/cocktail": "Nouveau cocktail",
  "/recettes/new/empatement": "Nouvel empatement",
  "/recettes/pizza": "Recette pizza",
  "/recettes/cuisine": "Recette cuisine",
  "/recettes/cocktail": "Recette cocktail",
  "/recettes/empatement": "Recette empatement",
  "/rh/employe": "Fiche employe",
  "/bello-mio": "Bello Mio",
  "/bello-mio/planning": "Planning Bello Mio",
  "/piccola-mia": "Piccola Mia",
  "/piccola-mia/planning": "Planning Piccola Mia",
  "/piccola-mia/evenements": "Evenements Piccola Mia",
};

/** Section name map: pathname → parent section label for TopBar subtitle */
const PAGE_SECTIONS: Record<string, string> = {
  "/rh/equipe": "Gestion du personnel",
  "/plannings": "Gestion du personnel",
  "/rh/pointage": "Gestion du personnel",
  "/rh/conges": "Gestion du personnel",
  "/rh/emargement": "Gestion du personnel",
  "/rh/masse-salariale": "Gestion du personnel",
  "/rh/rapports": "Gestion du personnel",
  "/settings/planning": "Parametres",
  "/settings/finance": "Parametres",
  "/settings/pointeuse": "Parametres",
  "/settings/employes/contrat": "Parametres",
  "/settings/employes/acces": "Parametres",
  "/settings/employes/roles": "Parametres",
  "/settings/account": "Parametres",
  "/pilotage": "Gestion de la finance",
  "/mercuriale": "Gestion de la finance",
  "/stats-achats": "Gestion de la finance",
  "/variations-prix": "Gestion de la finance",
  "/fournisseurs": "Gestion de la finance",
  "/ingredients": "Gestion de la finance",
  "/invoices": "Gestion de la finance",
  "/commandes": "Gestion de la finance",
  "/inventaire": "Gestion de la finance",
  "/recettes": "Gestion de la finance",
  "/epicerie": "Gestion de la finance",
  "/finances": "Gestion de la finance",
  "/kezia": "Gestion de la finance",
  "/clients": "Gestion des clients",
  "/clients/factures": "Gestion des clients",
  "/devis": "Gestion des clients",
  "/evenements": "Gestion des clients",
  "/evenements/clients": "Gestion des clients",
  "/recettes/new/pizza": "Gestion de la finance",
  "/recettes/new/cuisine": "Gestion de la finance",
  "/recettes/new/cocktail": "Gestion de la finance",
  "/recettes/new/empatement": "Gestion de la finance",
  "/recettes/pizza": "Gestion de la finance",
  "/recettes/cuisine": "Gestion de la finance",
  "/recettes/cocktail": "Gestion de la finance",
  "/recettes/empatement": "Gestion de la finance",
  "/achats": "Gestion de la finance",
  "/rh/employe": "Gestion du personnel",
  "/piccola-mia/evenements": "Gestion des clients",
  "/devis/new": "Gestion des clients",
};

export function getPageTitle(pathname: string): string {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  const keys = Object.keys(PAGE_TITLES).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (pathname.startsWith(key + "/")) return PAGE_TITLES[key];
  }
  return "";
}

export function getPageSection(pathname: string): string {
  if (PAGE_SECTIONS[pathname]) return PAGE_SECTIONS[pathname];
  const keys = Object.keys(PAGE_SECTIONS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (pathname.startsWith(key + "/")) return PAGE_SECTIONS[key];
  }
  return "";
}
