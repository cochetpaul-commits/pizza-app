import type { Role } from "@/lib/rbac";

export type NavSection = {
  label: string;
  /** Icon key for section header (from Icons.tsx) */
  icon?: string;
  items: NavItem[];
  /** Only show this section for these roles. If omitted, shown to all. */
  roles?: Role[];
  /** Only show this section when current establishment slug contains this string */
  slugFilter?: string;
};

export type NavItem = {
  label: string;
  href: string;
  /** Icon key from Icons.tsx — only used for standalone items (no section label) */
  icon?: string;
  /** Only show for these roles */
  roles?: Role[];
};

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
      { label: "Achats", href: "/achats" },
      { label: "Variations & alertes", href: "/variations-prix" },
      { label: "Pilotage", href: "/pilotage" },
      { label: "Fournisseurs", href: "/fournisseurs" },
      { label: "Articles", href: "/ingredients" },
      { label: "Commandes", href: "/commandes" },
      { label: "Inventaire", href: "/inventaire" },
      { label: "Fiches techniques", href: "/recettes" },
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
  "/dashboard": "Tableau de bord",
  "/rh/equipe": "Salaries",
  "/plannings": "Planning",
  "/rh/pointage": "Pointage",
  "/rh/conges": "Conges",
  "/rh/emargement": "Emargement",
  "/rh/masse-salariale": "Simulation & Masse Salariale",
  "/rh/rapports": "Rapports RH",
  "/settings/planning": "Parametres RH",
  "/pilotage": "Pilotage",
  "/achats": "Achats",
  "/mercuriale": "Mercuriale",
  "/stats-achats": "Stats d'achats",
  "/variations-prix": "Variations & alertes",
  "/fournisseurs": "Fournisseurs",
  "/ingredients": "Articles",
  "/invoices": "Factures",
  "/commandes": "Commandes",
  "/inventaire": "Inventaire",
  "/recettes": "Fiches techniques",
  "/epicerie": "Articles en vente",
  "/finances": "Finances",
  "/evenements": "Evenements",
  "/clients": "Carnet clients",
  "/clients/factures": "Factures clients",
  "/devis/new": "Nouveau devis",
  "/admin/utilisateurs": "Utilisateurs",
  "/settings/account": "Mon compte",
  "/messagerie": "Messagerie",
  "/mes-shifts": "Mon planning",
  "/notifications": "Notifications",
  "/kezia": "Import Kezia",
  "/session": "Session",
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
  "/settings/planning": "Gestion du personnel",
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
  "/clients": "Gestion des clients",
  "/clients/factures": "Gestion des clients",
  "/devis": "Gestion des clients",
  "/evenements": "Gestion des clients",
  "/evenements/clients": "Gestion des clients",
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
