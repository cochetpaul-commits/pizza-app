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
  { label: "Rapport", href: "/ventes", icon: "barChart" },
  { label: "Marges", href: "/ventes/marges", icon: "wallet" },
  { label: "Tresorerie", href: "/tresorerie", icon: "wallet" },
];

// PERSONNEL (RH)
export const PLANNING_ITEMS: NavItemV2[] = [
  { label: "Employes", href: "/rh/equipe", icon: "users" },
  { label: "Pointage", href: "/rh/pointage", icon: "clock" },
  { label: "Conges", href: "/rh/conges", icon: "beach" },
  { label: "Rapports de paie", href: "/rh/rapports", icon: "fileText" },
  { label: "Masse salariale", href: "/ventes/simulation", icon: "calculator" },
];

// PRODUCTION (fiches techniques, catalogue, articles de vente)
const PRODUCTION_ITEMS: NavItemV2[] = [
  { label: "Fiches techniques", href: "/recettes", icon: "fileText" },
  { label: "Inventaire", href: "/inventaire", icon: "package" },
];

const PRODUCTION_ITEMS_PICCOLA: NavItemV2[] = [
  { label: "Fiches techniques", href: "/recettes", icon: "fileText" },
  { label: "Prix de vente", href: "/epicerie", icon: "tag" },
  { label: "Inventaire", href: "/inventaire", icon: "package" },
];

// ACHATS (fournisseurs & stocks)
export const ACHATS_ITEMS: NavItemV2[] = [
  { label: "Base produits", href: "/ingredients", icon: "tag" },
  { label: "Commandes", href: "/commandes", icon: "shoppingBag" },
  { label: "Factures", href: "/achats", icon: "fileText" },
];

// EVENEMENTIEL (Piccola uniquement)
export const EVENEMENTIEL_ITEMS: NavItemV2[] = [
  { label: "Evenements", href: "/evenements", icon: "calendarEvent" },
  { label: "Carnet clients", href: "/clients", icon: "users" },
  { label: "Devis", href: "/devis", icon: "fileText" },
  { label: "Factures clients", href: "/clients/factures", icon: "fileText" },
];

// Legacy exports
export const PERSONNEL_ITEMS = PLANNING_ITEMS;
export const FINANCE_ITEMS = ACHATS_ITEMS;
export const CLIENTS_ITEMS = EVENEMENTIEL_ITEMS;
export const PERFORMANCES_ITEMS: NavItemV2[] = [];
export const OPERATIONS_ITEMS = PRODUCTION_ITEMS;

// Sections
export const PILOTAGE_SECTION: NavSubSection = { label: "Pilotage", icon: "barChart", href: "/ventes", roles: ["group_admin"], items: PILOTAGE_ITEMS };
export const PERSONNEL_SECTION: NavSubSection = { label: "Personnel", icon: "users", href: "/personnel", items: PLANNING_ITEMS };
export const PRODUCTION_SECTION: NavSubSection = { label: "Production", icon: "package", roles: ["group_admin"], items: PRODUCTION_ITEMS };
export const PRODUCTION_SECTION_PICCOLA: NavSubSection = { label: "Production", icon: "package", roles: ["group_admin"], items: PRODUCTION_ITEMS_PICCOLA };
export const ACHATS_SECTION: NavSubSection = { label: "Achats", icon: "shoppingBag", roles: ["group_admin"], items: ACHATS_ITEMS };
export const EVENEMENTIEL_SECTION: NavSubSection = { label: "Evenementiel", icon: "calendarEvent", roles: ["group_admin"], items: EVENEMENTIEL_ITEMS };

// Backward compat
export const VENTES_SECTION = PILOTAGE_SECTION;
export const OPERATIONS_SECTION = PRODUCTION_SECTION;
export const OPERATIONS_SECTION_PICCOLA = PRODUCTION_SECTION_PICCOLA;

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
      PILOTAGE_SECTION,
      PERSONNEL_SECTION,
      isPiccola ? PRODUCTION_SECTION_PICCOLA : PRODUCTION_SECTION,
      ACHATS_SECTION,
      ...(isPiccola ? [EVENEMENTIEL_SECTION] : []),
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
    label: "Paramètres",
    icon: "settings",
    roles: ["group_admin"],
    sections: [
      {
        label: "",
        items: [
          { label: "Établissement", href: "/settings/etablissements", icon: "building" },
          { label: "Employés", href: "/settings/employes", icon: "users" },
          { label: "Fournisseurs", href: "/fournisseurs", icon: "truck" },
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
  { kind: "item", label: "Ingrédients", href: "/ingredients", icon: "tag", roles: ["cuisine", "salle"] },
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
    label: "Personnel",
    icon: "users",
    roles: ["group_admin", "manager"],
    items: [
      { label: "Employés", href: "/rh/equipe" },
      { label: "Planning", href: "/plannings" },
      { label: "Pointage", href: "/rh/pointage" },
      { label: "Congés", href: "/rh/conges" },
      { label: "Feuille d'émargement", href: "/rh/emargement" },
      { label: "Simulation", href: "/ventes/simulation", roles: ["group_admin"] },
    ],
  },
  {
    label: "Production",
    icon: "wallet",
    roles: ["group_admin"],
    items: [
      { label: "Base ingrédients", href: "/ingredients" },
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
    label: "Evenementiel",
    icon: "calendarEvent",
    roles: ["group_admin"],
    slugFilter: "piccola",
    items: [
      { label: "Evenements", href: "/evenements" },
      { label: "Carnet clients", href: "/clients" },
      { label: "Devis", href: "/devis" },
      { label: "Factures", href: "/clients/factures" },
    ],
  },
  {
    label: "Paramètres",
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
  "/rh/equipe": "Personnel",
  "/personnel": "Personnel",
  "/ventes": "Pilotage",
  "/ventes/marges": "Pilotage",
  "/ventes/articles": "Production",
  "/ventes/insights": "Pilotage",
  "/tresorerie": "Pilotage",
  "/plannings": "Personnel",
  "/rh/pointage": "Personnel",
  "/rh/conges": "Personnel",
  "/rh/emargement": "Personnel",
  "/ventes/simulation": "Personnel",
  "/rh/rapports": "Personnel",
  "/settings/planning": "Gestion du planning",
  "/settings/etablissements": "Établissements",
  "/settings/finance": "Production",
  "/settings/pointeuse": "Pointeuse",
  "/settings/employes/contrat": "Contrat",
  "/settings/employes/acces": "Accès application",
  "/settings/employes/roles": "Rôle et permissions",
  "/settings/account": "Mon compte",
  "/achats": "Achats",
  "/fournisseurs": "Achats",
  "/ingredients": "Achats",
  "/invoices": "Achats",
  "/commandes": "Achats",
  "/inventaire": "Production",
  "/recettes": "Production",
  "/catalogue": "Production",
  "/epicerie": "Production",
  "/evenements": "Evenementiel",
  "/clients": "Evenementiel",
  "/clients/factures": "Evenementiel",
  "/devis": "Evenementiel",
  "/devis/new": "Evenementiel",
  "/admin/utilisateurs": "Utilisateurs",
  "/mes-shifts": "Mon planning",
  "/notifications": "Notifications",
  "/session": "Session",
  "/recettes/new/pizza": "Production",
  "/recettes/new/cuisine": "Production",
  "/recettes/new/cocktail": "Production",
  "/recettes/new/empatement": "Production",
  "/recettes/pizza": "Production",
  "/recettes/cuisine": "Production",
  "/recettes/cocktail": "Production",
  "/recettes/empatement": "Production",
  "/rh/employe": "Personnel",
  "/bello-mio": "Bello Mio",
  "/bello-mio/planning": "Planning Bello Mio",
  "/piccola-mia": "Piccola Mia",
  "/piccola-mia/planning": "Planning Piccola Mia",
  "/piccola-mia/evenements": "Événements Piccola Mia",
};

/** Section name map: pathname → parent section label for TopBar subtitle */
const PAGE_SECTIONS: Record<string, string> = {
  "/rh/equipe": "Personnel",
  "/plannings": "Personnel",
  "/rh/pointage": "Personnel",
  "/rh/conges": "Personnel",
  "/rh/emargement": "Personnel",
  "/ventes/simulation": "Personnel",
  "/ventes/marges": "Pilotage",
  "/rh/rapports": "Personnel",
  "/settings/planning": "Paramètres",
  "/settings/finance": "Paramètres",
  "/settings/pointeuse": "Paramètres",
  "/settings/employes/contrat": "Paramètres",
  "/settings/employes/acces": "Paramètres",
  "/settings/employes/roles": "Paramètres",
  "/settings/account": "Paramètres",
  "/fournisseurs": "Achats",
  "/ingredients": "Achats",
  "/invoices": "Achats",
  "/commandes": "Achats",
  "/inventaire": "Production",
  "/recettes": "Production",
  "/epicerie": "Production",
  "/clients": "Evenementiel",
  "/clients/factures": "Evenementiel",
  "/devis": "Evenementiel",
  "/evenements": "Evenementiel",
  "/recettes/new/pizza": "Production",
  "/recettes/new/cuisine": "Production",
  "/recettes/new/cocktail": "Production",
  "/recettes/new/empatement": "Production",
  "/recettes/pizza": "Production",
  "/recettes/cuisine": "Production",
  "/recettes/cocktail": "Production",
  "/recettes/empatement": "Production",
  "/achats": "Achats",
  "/rh/employe": "Personnel",
  "/piccola-mia/evenements": "Evenementiel",
  "/devis/new": "Evenementiel",
  "/tresorerie": "Pilotage",
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
