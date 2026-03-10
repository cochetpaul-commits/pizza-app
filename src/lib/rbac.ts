export type Role = "admin" | "direction" | "cuisine";

/** Routes and which roles can access them (prefix match) */
export const ROUTE_ACCESS: Record<string, Role[]> = {
  "/admin":        ["admin"],
  "/invoices":     ["admin", "direction"],
  "/fournisseurs": ["admin", "direction"],
  "/evenements":   ["admin", "direction"],
  "/pilotage":     ["admin", "direction"],
  "/mercuriale":   ["admin", "direction"],
  "/epicerie":     ["admin", "direction"],
  "/variations-prix": ["admin", "direction"],
  "/recettes":     ["admin", "direction", "cuisine"],
  "/ingredients":  ["admin", "direction", "cuisine"],
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
  return role !== "cuisine";
}
