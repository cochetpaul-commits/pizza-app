/**
 * Permission system for iFratelli
 *
 * 3 roles (ascending access):
 *   employe → manager → admin
 *
 * Each permission: true (granted), false (denied), "toggle" (configurable per user)
 */

export type AppRole = "group_admin" | "manager" | "equipier";

export type PermRole = "equipier" | "manager" | "admin";

export const PERM_ROLES: PermRole[] = ["equipier", "manager", "admin"];

export const ROLE_INFO: Record<PermRole, { label: string; description: string; color: string; bg: string }> = {
  equipier: {
    label: "Equipier",
    description: "Acces production (fiches techniques, catalogue, recettes), inventaire, base produits, commandes et fournisseurs.",
    color: "#2D6A4F", bg: "rgba(45,106,79,0.08)",
  },
  manager: {
    label: "Manager",
    description: "Acces equipier + pilotage, ventes, validation commandes, gestion equipe, evenements.",
    color: "#2563EB", bg: "rgba(37,99,235,0.06)",
  },
  admin: {
    label: "Administrateur",
    description: "Acces complet a toutes les fonctionnalites.",
    color: "#DC2626", bg: "rgba(220,38,38,0.05)",
  },
};

export type PermValue = boolean | "toggle";

export type PermSection = {
  label: string;
  permissions: { key: string; label: string }[];
};

export const PERM_SECTIONS: PermSection[] = [
  {
    label: "Pilotage",
    permissions: [
      { key: "performances.view", label: "Ventes et indicateurs" },
      { key: "performances.pilotage", label: "Marges et pilotage" },
    ],
  },
  {
    label: "Personnel",
    permissions: [
      { key: "planning.view_own", label: "Voir le planning" },
      { key: "planning.edit", label: "Creer et modifier les plannings" },
      { key: "planning.validate_shifts", label: "Valider les shifts" },
      { key: "heures.register_own", label: "Saisir ses heures" },
      { key: "heures.edit_team", label: "Saisir les heures de l'equipe" },
      { key: "profil.view_team", label: "Voir les fiches employes" },
      { key: "profil.view_all", label: "Voir tous les employes (tous etabs)" },
      { key: "absences.edit_cp", label: "Modifier les compteurs de conges" },
      { key: "paie.manage", label: "Gestion de la paie" },
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
      { key: "achats.view", label: "Stats achats et factures" },
      { key: "achats.edit", label: "Creer et modifier des commandes" },
      { key: "commandes.valider", label: "Valider les commandes" },
      { key: "achats.inventaire", label: "Inventaire et stock" },
    ],
  },
  {
    label: "Parametres",
    permissions: [
      { key: "settings.etablissements", label: "Configurer les etablissements" },
      { key: "settings.employes", label: "Gerer les employes et invitations" },
      { key: "settings.roles", label: "Modifier les roles et permissions" },
    ],
  },
];

/** Default permission matrix per role */
export const DEFAULT_PERMS: Record<PermRole, Record<string, PermValue>> = {
  equipier: {
    "planning.view_own": false, "planning.view_draft": false, "planning.view_other": false,
    "planning.view_alerts": false, "planning.edit": false, "planning.validate_shifts": false, "planning.view_ratios": false,
    "heures.register_own": false, "heures.edit_team": false, "heures.validate_own": false,
    "heures.edit_all": false, "heures.unvalidate": false, "heures.revalorize_absences": false,
    "profil.view_own": true, "profil.edit_own": true, "profil.view_feuilles": true,
    "profil.view_team": false, "profil.view_managers": false, "profil.view_all": false, "profil.delete": false,
    "absences.edit_cp": false, "paie.manage": false,
    "achats.view": true, "achats.edit": true, "achats.inventaire": true,
    "operations.recettes": true, "operations.edit_recettes": false, "operations.commandes": true, "commandes.valider": false,
    "performances.view": false, "performances.pilotage": false,
    "settings.etablissements": false, "settings.employes": false, "settings.roles": false,
  },
  manager: {
    "planning.view_own": false, "planning.view_draft": false, "planning.view_other": false,
    "planning.view_alerts": false, "planning.edit": false, "planning.validate_shifts": false, "planning.view_ratios": false,
    "heures.register_own": false, "heures.edit_team": false, "heures.validate_own": false,
    "heures.edit_all": false, "heures.unvalidate": false, "heures.revalorize_absences": false,
    "profil.view_own": true, "profil.edit_own": true, "profil.view_feuilles": true,
    "profil.view_team": true, "profil.view_managers": true, "profil.view_all": false, "profil.delete": false,
    "absences.edit_cp": false, "paie.manage": false,
    "achats.view": true, "achats.edit": true, "achats.inventaire": true,
    "operations.recettes": true, "operations.edit_recettes": true, "operations.commandes": true, "commandes.valider": true,
    "performances.view": true, "performances.pilotage": true,
    "settings.etablissements": false, "settings.employes": false, "settings.roles": false,
  },
  admin: {
    "planning.view_own": true, "planning.view_draft": true, "planning.view_other": true,
    "planning.view_alerts": true, "planning.edit": true, "planning.validate_shifts": true, "planning.view_ratios": true,
    "heures.register_own": true, "heures.edit_team": true, "heures.validate_own": true,
    "heures.edit_all": true, "heures.unvalidate": true, "heures.revalorize_absences": true,
    "profil.view_own": true, "profil.edit_own": true, "profil.view_feuilles": true,
    "profil.view_team": true, "profil.view_managers": true, "profil.view_all": true, "profil.delete": true,
    "absences.edit_cp": true, "paie.manage": true,
    "achats.view": true, "achats.edit": true, "achats.inventaire": true,
    "operations.recettes": true, "operations.edit_recettes": true, "operations.commandes": true, "commandes.valider": true,
    "performances.view": true, "performances.pilotage": true,
    "settings.etablissements": true, "settings.employes": true, "settings.roles": true,
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
