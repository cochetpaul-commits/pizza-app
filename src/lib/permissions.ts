/**
 * Systeme de permissions iFratelli
 *
 * 3 roles (acces croissant) : equipier → manager → admin
 * Le role donne les permissions par defaut ; la fiche employe peut porter
 * des exceptions (custom_permissions : { cle: true|false }).
 *
 * Purge du 15/08/2026 : les ~20 cles planning/heures/paie heritees du
 * chantier Combo (aucun ecran ne les lisait) ont ete supprimees. Il reste
 * les 11 cles reellement verifiees par l'application.
 */

export type AppRole = "group_admin" | "manager" | "equipier";

export type PermRole = "equipier" | "manager" | "admin";

export const PERM_ROLES: PermRole[] = ["equipier", "manager", "admin"];

export const ROLE_INFO: Record<PermRole, { label: string; description: string; color: string; bg: string }> = {
  equipier: {
    label: "Equipier",
    description: "Production (recettes, catalogue), inventaire, base produits, commandes, fournisseurs et son tableau de bord perso.",
    color: "#2D6A4F", bg: "rgba(45,106,79,0.08)",
  },
  manager: {
    label: "Manager",
    description: "Equipier + pilotage et ventes, validation des commandes, fiches de l'equipe, pointage, tableau de bord equipe.",
    color: "#2563EB", bg: "rgba(37,99,235,0.06)",
  },
  admin: {
    label: "Administrateur",
    description: "Acces complet, y compris parametres, factures et salaires.",
    color: "#DC2626", bg: "rgba(220,38,38,0.05)",
  },
};

export type PermValue = boolean | "toggle";

export type PermSection = {
  label: string;
  permissions: { key: string; label: string }[];
};

/** Les permissions affichees dans la grille d'exceptions — uniquement des
 *  cles reellement verifiees par un ecran. */
export const PERM_SECTIONS: PermSection[] = [
  {
    label: "Pilotage",
    permissions: [
      { key: "performances.view", label: "Ventes et indicateurs" },
      { key: "performances.pilotage", label: "Marges et pilotage" },
      { key: "performances.show_money", label: "Voir les valeurs monetaires (CA, marges, euros)" },
    ],
  },
  {
    label: "Production",
    permissions: [
      { key: "operations.recettes", label: "Catalogue recettes et fiches techniques" },
      { key: "operations.edit_recettes", label: "Creer et modifier les recettes" },
    ],
  },
  {
    label: "Achats",
    permissions: [
      { key: "achats.view", label: "Stats achats et variations de prix" },
      { key: "achats.edit", label: "Creer et modifier des commandes" },
      { key: "commandes.valider", label: "Valider les commandes" },
      { key: "achats.inventaire", label: "Inventaire et stock" },
    ],
  },
  {
    label: "Personnel",
    permissions: [
      { key: "profil.view_team", label: "Voir les fiches employes" },
      { key: "heures.edit_team", label: "Pointage de l'equipe" },
    ],
  },
];

/** Matrice des permissions par defaut de chaque role */
export const DEFAULT_PERMS: Record<PermRole, Record<string, PermValue>> = {
  equipier: {
    "performances.view": true, "performances.pilotage": false, "performances.show_money": false,
    "operations.recettes": true, "operations.edit_recettes": false,
    "achats.view": false, "achats.edit": true, "commandes.valider": false, "achats.inventaire": true,
    "profil.view_team": false, "heures.edit_team": false,
  },
  manager: {
    "performances.view": true, "performances.pilotage": true, "performances.show_money": true,
    "operations.recettes": true, "operations.edit_recettes": true,
    "achats.view": true, "achats.edit": true, "commandes.valider": true, "achats.inventaire": true,
    "profil.view_team": true, "heures.edit_team": true,
  },
  admin: {
    "performances.view": true, "performances.pilotage": true, "performances.show_money": true,
    "operations.recettes": true, "operations.edit_recettes": true,
    "achats.view": true, "achats.edit": true, "commandes.valider": true, "achats.inventaire": true,
    "profil.view_team": true, "heures.edit_team": true,
  },
};

/** Legacy compat */
export const PERMISSIONS: Record<AppRole, string[]> = {
  group_admin: Object.keys(DEFAULT_PERMS.admin).filter(k => DEFAULT_PERMS.admin[k] === true),
  manager: Object.keys(DEFAULT_PERMS.manager).filter(k => DEFAULT_PERMS.manager[k] === true),
  equipier: Object.keys(DEFAULT_PERMS.equipier).filter(k => DEFAULT_PERMS.equipier[k] === true),
};

/** Map app roles to perm roles */
export function mapToPermRole(role: string): PermRole {
  if (role === "group_admin" || role === "admin" || role === "proprietaire" || role === "direction" || role === "directeur") return "admin";
  if (role === "manager" || role === "responsable" || role === "chef") return "manager";
  return "equipier";
}

/** Check if a user has a specific permission */
export function hasPermission(role: string, permKey: string, customPerms?: Record<string, boolean>): boolean {
  if (customPerms && permKey in customPerms) return customPerms[permKey];
  const permRole = mapToPermRole(role);
  const defaultVal = DEFAULT_PERMS[permRole]?.[permKey];
  if (defaultVal === "toggle") return false;
  return defaultVal === true;
}
