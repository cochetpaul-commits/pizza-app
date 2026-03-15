export type AppRole = "group_admin" | "cuisine" | "salle" | "plonge";

export const PERMISSIONS: Record<AppRole, string[]> = {
  group_admin: [
    "dashboard", "groupe", "catalogue.edit",
    "ingredients.edit", "recettes.view", "recettes.edit",
    "commandes.view", "commandes.saisir", "commandes.valider",
    "fournisseurs.view", "fournisseurs.edit",
    "planning.view", "planning.edit",
    "pilotage", "finances", "evenements", "admin",
    "rh", "factures",
  ],
  cuisine: [
    "dashboard", "catalogue.view",
    "ingredients.view", "recettes.view", "recettes.edit",
    "commandes.saisir", "fournisseurs.view",
    "planning.view", "cocktails.edit", "evenements.view",
  ],
  salle: [
    "dashboard", "catalogue.view",
    "ingredients.view", "recettes.view",
    "commandes.saisir", "fournisseurs.view",
    "planning.view", "cocktails.edit", "evenements.view",
  ],
  plonge: [
    "dashboard", "catalogue.view",
    "ingredients.view", "recettes.view",
    "commandes.saisir", "fournisseurs.view",
    "planning.view", "evenements.view",
  ],
};

export function hasPermission(role: string | null, permission: string): boolean {
  if (!role) return false;
  return PERMISSIONS[role as AppRole]?.includes(permission) ?? false;
}
