/**
 * Permission system for iFratelli
 *
 * 3 roles (ascending access):
 *   employe → manager → admin
 *
 * Each permission: true (granted), false (denied), "toggle" (configurable per user)
 */

export type AppRole = "group_admin" | "manager" | "cuisine" | "salle" | "plonge";

export type PermRole = "employe" | "manager" | "admin";

export const PERM_ROLES: PermRole[] = ["employe", "manager", "admin"];

export const ROLE_INFO: Record<PermRole, { label: string; description: string; color: string; bg: string }> = {
  employe: {
    label: "Employe",
    description: "L'utilisateur avec un acces employe ne peut pas acceder au backoffice. Il peut badger a la pointeuse, consulter le planning, faire une demande de conge et recevoir un document.",
    color: "#2D6A4F", bg: "rgba(45,106,79,0.08)",
  },
  manager: {
    label: "Manager",
    description: "L'utilisateur avec un acces manager peut gerer les modules que l'administrateur lui a attribue (Planning, pointeuse, employe, rapport) sur le backoffice ou l'application mobile.",
    color: "#7B1FA2", bg: "rgba(123,31,162,0.06)",
  },
  admin: {
    label: "Administrateur",
    description: "L'utilisateur avec un acces administrateur peut tout faire !",
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
    label: "Planning",
    permissions: [
      { key: "planning.view_own", label: "Acces au planning publie de ses equipes/etablissements" },
      { key: "planning.view_draft", label: "Acces au planning non-publie (brouillon)" },
      { key: "planning.view_other", label: "Acces au planning publie des autres equipes/etablissements" },
      { key: "planning.view_alerts", label: "Visualisation des alertes et compteurs" },
      { key: "planning.edit", label: "Creation, modification et publication de planning" },
      { key: "planning.validate_shifts", label: "Peut modifier les plannings publies et valider les shifts de son etablissement" },
      { key: "planning.view_ratios", label: "Visualisation des ratios" },
    ],
  },
  {
    label: "Gestion des heures",
    permissions: [
      { key: "heures.register_own", label: "Enregistrer ses propres heures de travail" },
      { key: "heures.edit_team", label: "Saisir les heures reelles de son equipe/etablissement" },
      { key: "heures.validate_own", label: "Peut valider ses propres heures reelles" },
      { key: "heures.edit_all", label: "Saisir les heures reelles de toutes les equipes/etablissements" },
      { key: "heures.unvalidate", label: "Peut devalider les heures reelles" },
      { key: "heures.revalorize_absences", label: "Peut revaloriser des absences" },
    ],
  },
  {
    label: "Profil utilisateur",
    permissions: [
      { key: "profil.view_own", label: "Peut acceder a son profil utilisateur" },
      { key: "profil.edit_own", label: "Peut modifier son etat civil et ses informations de contact" },
      { key: "profil.view_feuilles", label: "Peut consulter ses propres feuilles de presence" },
      { key: "profil.view_team", label: "Acces au profil des employes de mon equipe ou etablissement" },
      { key: "profil.view_managers", label: "Acces au profil des managers de mon equipe ou etablissement" },
      { key: "profil.view_all", label: "Acces au profil de tous les salaries de tous les etablissements" },
      { key: "profil.delete", label: "Peut supprimer un profil employe ou manager" },
    ],
  },
  {
    label: "Gestion des absences",
    permissions: [
      { key: "absences.edit_cp", label: "Peut modifier manuellement les compteurs de conges payes" },
    ],
  },
  {
    label: "Gestion de la paie",
    permissions: [
      { key: "paie.manage", label: "Peut distribuer, consulter et supprimer les bulletins de paie de tous les employes" },
    ],
  },
  {
    label: "Achats & Stock",
    permissions: [
      { key: "achats.view", label: "Acces aux stats d'achats et factures fournisseurs" },
      { key: "achats.edit", label: "Peut creer et modifier des commandes fournisseurs" },
      { key: "achats.inventaire", label: "Acces a l'inventaire et gestion du stock" },
    ],
  },
  {
    label: "Operations",
    permissions: [
      { key: "operations.recettes", label: "Acces au catalogue recettes et fiches techniques" },
      { key: "operations.edit_recettes", label: "Peut creer et modifier les recettes" },
      { key: "operations.commandes", label: "Acces aux commandes" },
    ],
  },
  {
    label: "Performances",
    permissions: [
      { key: "performances.view", label: "Acces aux indicateurs cles et ratios" },
      { key: "performances.pilotage", label: "Acces au pilotage et marges" },
    ],
  },
  {
    label: "Parametres",
    permissions: [
      { key: "settings.etablissements", label: "Peut configurer les etablissements" },
      { key: "settings.employes", label: "Peut gerer les employes et invitations" },
      { key: "settings.roles", label: "Peut modifier les roles et permissions" },
    ],
  },
];

/** Default permission matrix per role */
export const DEFAULT_PERMS: Record<PermRole, Record<string, PermValue>> = {
  employe: {
    "planning.view_own": true, "planning.view_draft": false, "planning.view_other": false,
    "planning.view_alerts": false, "planning.edit": false, "planning.validate_shifts": false, "planning.view_ratios": false,
    "heures.register_own": true, "heures.edit_team": false, "heures.validate_own": false,
    "heures.edit_all": false, "heures.unvalidate": false, "heures.revalorize_absences": false,
    "profil.view_own": true, "profil.edit_own": true, "profil.view_feuilles": true,
    "profil.view_team": false, "profil.view_managers": false, "profil.view_all": false, "profil.delete": false,
    "absences.edit_cp": false, "paie.manage": false,
    "achats.view": false, "achats.edit": false, "achats.inventaire": false,
    "operations.recettes": false, "operations.edit_recettes": false, "operations.commandes": false,
    "performances.view": false, "performances.pilotage": false,
    "settings.etablissements": false, "settings.employes": false, "settings.roles": false,
  },
  manager: {
    "planning.view_own": true, "planning.view_draft": true, "planning.view_other": false,
    "planning.view_alerts": true, "planning.edit": true, "planning.validate_shifts": "toggle", "planning.view_ratios": true,
    "heures.register_own": true, "heures.edit_team": true, "heures.validate_own": "toggle",
    "heures.edit_all": false, "heures.unvalidate": "toggle", "heures.revalorize_absences": "toggle",
    "profil.view_own": true, "profil.edit_own": true, "profil.view_feuilles": true,
    "profil.view_team": true, "profil.view_managers": false, "profil.view_all": false, "profil.delete": false,
    "absences.edit_cp": "toggle", "paie.manage": false,
    "achats.view": "toggle", "achats.edit": false, "achats.inventaire": "toggle",
    "operations.recettes": true, "operations.edit_recettes": "toggle", "operations.commandes": true,
    "performances.view": "toggle", "performances.pilotage": false,
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
    "operations.recettes": true, "operations.edit_recettes": true, "operations.commandes": true,
    "performances.view": true, "performances.pilotage": true,
    "settings.etablissements": true, "settings.employes": true, "settings.roles": true,
  },
};

/** Legacy compat */
export const PERMISSIONS: Record<AppRole, string[]> = {
  group_admin: Object.keys(DEFAULT_PERMS.admin).filter(k => DEFAULT_PERMS.admin[k] === true),
  manager: Object.keys(DEFAULT_PERMS.manager).filter(k => DEFAULT_PERMS.manager[k] === true),
  cuisine: Object.keys(DEFAULT_PERMS.employe).filter(k => DEFAULT_PERMS.employe[k] === true),
  salle: Object.keys(DEFAULT_PERMS.employe).filter(k => DEFAULT_PERMS.employe[k] === true),
  plonge: Object.keys(DEFAULT_PERMS.employe).filter(k => DEFAULT_PERMS.employe[k] === true),
};

/** Map app roles to perm roles */
export function mapToPermRole(role: string): PermRole {
  if (role === "group_admin" || role === "admin" || role === "proprietaire" || role === "direction" || role === "directeur") return "admin";
  if (role === "manager") return "manager";
  return "employe";
}

/** Check if a user has a specific permission */
export function hasPermission(role: string, permKey: string, customPerms?: Record<string, boolean>): boolean {
  if (customPerms && permKey in customPerms) return customPerms[permKey];
  const permRole = mapToPermRole(role);
  const defaultVal = DEFAULT_PERMS[permRole]?.[permKey];
  if (defaultVal === "toggle") return false;
  return defaultVal === true;
}
