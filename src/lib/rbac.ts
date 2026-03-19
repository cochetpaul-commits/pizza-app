export type Role = "group_admin" | "manager" | "cuisine" | "salle" | "plonge";

/** Routes and which roles can access them (prefix match) */
export const ROUTE_ACCESS: Record<string, Role[]> = {
  "/dashboard":    ["group_admin", "manager", "cuisine", "salle", "plonge"],
  "/groupe":       ["group_admin"],
  "/admin":        ["group_admin"],
  "/invoices":     ["group_admin"],
  "/fournisseurs": ["group_admin", "manager", "cuisine", "salle"],
  "/evenements":   ["group_admin"],
  "/pilotage":     ["group_admin"],
  "/mercuriale":   ["group_admin"],
  "/epicerie":     ["group_admin"],
  "/variations-prix": ["group_admin"],
  "/rh":           ["group_admin"],
  "/rh/pointage":  ["group_admin", "manager"],
  "/rh/conges":    ["group_admin", "manager"],
  "/rh/equipe":    ["group_admin", "manager"],
  "/plannings":    ["group_admin", "manager", "cuisine", "salle", "plonge"],
  "/recettes":     ["group_admin", "manager", "cuisine", "salle"],
  "/ingredients":  ["group_admin", "manager", "cuisine", "salle"],
  "/commandes":    ["group_admin", "manager", "cuisine", "salle"],
  "/finances":     ["group_admin"],
  "/achats":       ["group_admin"],
  "/stats-achats": ["group_admin"],
  "/inventaire":   ["group_admin", "manager"],
  "/clients":      ["group_admin"],
  "/devis":        ["group_admin"],
  "/session":      ["group_admin", "manager", "cuisine", "salle", "plonge"],
  "/settings":     ["group_admin"],
  // Hub routes
  "/bello-mio":    ["group_admin", "manager", "cuisine", "salle", "plonge"],
  "/piccola-mia":  ["group_admin", "manager", "cuisine", "salle", "plonge"],
  "/piccola-mia/evenements": ["group_admin", "manager", "cuisine", "salle", "plonge"],
};

/** Check if a role can access a given path (prefix match) */
export function canAccess(role: Role, path: string): boolean {
  // Find the most specific matching prefix
  let bestMatch = "";
  for (const prefix of Object.keys(ROUTE_ACCESS)) {
    if (path === prefix || path.startsWith(prefix + "/")) {
      if (prefix.length > bestMatch.length) bestMatch = prefix;
    }
  }
  if (!bestMatch) return true; // routes not listed are open
  return ROUTE_ACCESS[bestMatch].includes(role);
}

/** Can this role write (create/edit/delete)? */
export function canWrite(role: Role): boolean {
  return role === "group_admin" || role === "manager";
}
