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

/* ── Admin / Direction nav ─────────────────────────────── */

const PERSONNEL_ITEMS: NavItemV2[] = [
  { label: "Employes", href: "/rh/equipe", icon: "users" },
  { label: "Planning", href: "/plannings", icon: "calendar" },
  { label: "Pointage", href: "/rh/pointage", icon: "clock" },
  { label: "Conges", href: "/rh/conges", icon: "beach" },
  { label: "Emargement", href: "/rh/emargement", icon: "clipboard" },
  { label: "Simulation", href: "/rh/masse-salariale", icon: "calculator", roles: ["group_admin"] },
];

const FINANCE_ITEMS: NavItemV2[] = [
  { label: "Base ingredients", href: "/ingredients", icon: "tag" },
  { label: "Fiches techniques", href: "/recettes", icon: "book" },
  { label: "Commandes", href: "/commandes", icon: "shoppingBag" },
  { label: "Achats", href: "/achats", icon: "trendingUp" },
  { label: "Variations & alertes", href: "/variations-prix", icon: "barChart" },
  { label: "Pilotage", href: "/pilotage", icon: "barChart" },
  { label: "Inventaire", href: "/inventaire", icon: "package" },
  { label: "Articles en vente", href: "/epicerie", icon: "tag" },
];

const CLIENTS_ITEMS: NavItemV2[] = [
  { label: "Particuliers", href: "/evenements/clients", icon: "users" },
  { label: "Carnet clients", href: "/clients", icon: "book" },
  { label: "Creer devis", href: "/devis/new", icon: "fileText" },
  { label: "Factures", href: "/clients/factures", icon: "fileText" },
  { label: "Evenements", href: "/evenements", icon: "calendarEvent" },
  { label: "Import Kezia", href: "/kezia", icon: "fileText" },
];

export const SIDEBAR_NAV_V2: SidebarEntry[] = [
  {
    kind: "item",
    label: "Accueil",
    href: "/dashboard",
    icon: "dashboard",
  },

  { kind: "divider" },

  /* ── Bello Mio ── */
  {
    kind: "etab",
    etabSlug: "bello-mio",
    label: "Bello Mio",
    color: "#e27f57",
    roles: ["group_admin", "manager"],
    sections: [
      {
        label: "Gestion du personnel",
        icon: "users",
        items: PERSONNEL_ITEMS,
      },
      {
        label: "Gestion de la finance",
        icon: "wallet",
        roles: ["group_admin"],
        items: FINANCE_ITEMS,
      },
    ],
  },

  /* ── Piccola Mia ── */
  {
    kind: "etab",
    etabSlug: "piccola-mia",
    label: "Piccola Mia",
    color: "#5B8EAE",
    roles: ["group_admin", "manager"],
    sections: [
      {
        label: "Gestion du personnel",
        icon: "users",
        items: PERSONNEL_ITEMS,
      },
      {
        label: "Gestion de la finance",
        icon: "wallet",
        roles: ["group_admin"],
        items: FINANCE_ITEMS,
      },
      {
        label: "Gestion des clients",
        icon: "calendarEvent",
        roles: ["group_admin"],
        items: CLIENTS_ITEMS,
      },
    ],
  },

  { kind: "divider" },

  /* ── Parametres ── */
  {
    kind: "settings",
    label: "Parametres",
    icon: "settings",
    roles: ["group_admin"],
    sections: [
      {
        label: "Etablissement",
        icon: "box",
        items: [
          { label: "Gestion de la finance", href: "/settings/finance", icon: "wallet" },
          { label: "Gestion du planning", href: "/settings/planning", icon: "calendar" },
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
        label: "",
        items: [
          { label: "Mon compte", href: "/settings/account", icon: "settings" },
        ],
      },
    ],
  },
];

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
