export type Role = "group_admin" | "cuisine" | "salle";

/** Routes and which roles can access them (prefix match) */
export const ROUTE_ACCESS: Record<string, Role[]> = {
  "/groupe":       ["group_admin"],
  "/admin":        ["group_admin"],
  "/invoices":     ["group_admin"],
  "/fournisseurs": ["group_admin", "cuisine", "salle"],
  "/evenements":   ["group_admin"],
  "/pilotage":     ["group_admin"],
  "/mercuriale":   ["group_admin"],
  "/epicerie":     ["group_admin"],
  "/variations-prix": ["group_admin"],
  "/rh":           ["group_admin"],
  "/plannings":    ["group_admin", "cuisine", "salle"],
  "/recettes":     ["group_admin", "cuisine", "salle"],
  "/ingredients":  ["group_admin", "cuisine", "salle"],
  "/commandes":    ["group_admin", "cuisine", "salle"],
  "/finances":     ["group_admin"],
  "/settings":     ["group_admin"],
  // Hub routes
  "/bello-mio":    ["group_admin", "cuisine", "salle"],
  "/piccola-mia":  ["group_admin", "cuisine", "salle"],
  "/bello-mio/gestion":    ["group_admin"],
  "/piccola-mia/gestion":  ["group_admin"],
  "/piccola-mia/evenements": ["group_admin"],
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
  return role === "group_admin";
}
