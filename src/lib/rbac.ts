export type Role = "group_admin" | "equipier";

// Legacy role aliases — map old roles to new ones
export function normalizeRole(role: string): Role {
  if (role === "group_admin" || role === "admin" || role === "direction") return "group_admin";
  return "equipier"; // manager, cuisine, salle, plonge, equipier → equipier
}

const ALL: Role[] = ["group_admin", "equipier"];

/** Routes and which roles can access them (prefix match) */
export const ROUTE_ACCESS: Record<string, Role[]> = {
  // Équipier: production, catalogue, inventaire, base produits, commandes, fournisseurs
  "/recettes":     ALL,
  "/catalogue":    ALL,
  "/ingredients":  ALL,
  "/commandes":    ALL,
  "/fournisseurs": ALL,
  "/inventaire":   ALL,
  "/plannings":    ALL,
  "/session":      ALL,
  "/settings/account": ALL,
  // Hub routes
  "/bello-mio":    ALL,
  "/piccola-mia":  ALL,
  "/dashboard":    ALL,
  // Group admin only
  "/groupe":       ["group_admin"],
  "/admin":        ["group_admin"],
  "/invoices":     ["group_admin"],
  "/evenements":   ALL,
  "/pilotage":     ["group_admin"],
  "/mercuriale":   ["group_admin"],
  "/epicerie":     ["group_admin"],
  "/variations-prix": ["group_admin"],
  "/rh":           ["group_admin"],
  "/personnel":    ["group_admin"],
  "/ventes":       ["group_admin"],
  "/finances":     ["group_admin"],
  "/achats":       ["group_admin"],
  "/stats-achats": ["group_admin"],
  "/clients":      ["group_admin"],
  "/devis":        ["group_admin"],
  "/tresorerie":   ["group_admin"],
  "/settings":     ["group_admin"],
};

// Routes accessible to anyone authenticated (no RBAC needed)
const PUBLIC_ROUTES = ["/", "/login", "/auth", "/settings/account", "/mes-shifts", "/notifications"];

/** Check if a role can access a given path (prefix match) */
export function canAccess(role: Role, path: string): boolean {
  // Public routes are always accessible
  if (PUBLIC_ROUTES.some(r => path === r || path.startsWith(r + "/"))) return true;

  let bestMatch = "";
  for (const prefix of Object.keys(ROUTE_ACCESS)) {
    if (path === prefix || path.startsWith(prefix + "/")) {
      if (prefix.length > bestMatch.length) bestMatch = prefix;
    }
  }
  // Deny access to unlisted routes (security: deny by default)
  if (!bestMatch) return role === "group_admin";
  return ROUTE_ACCESS[bestMatch].includes(role);
}

/** Can this role write (create/edit/delete)? */
export function canWrite(role: Role): boolean {
  return role === "group_admin";
}
