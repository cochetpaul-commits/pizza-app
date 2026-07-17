export type Role = "group_admin" | "equipier";

// Legacy role aliases — map old roles to new ones
export function normalizeRole(role: string): Role {
  if (role === "group_admin" || role === "admin" || role === "direction") return "group_admin";
  return "equipier"; // manager, cuisine, salle, plonge, equipier → equipier
}

const ALL: Role[] = ["group_admin", "equipier"];

/** Routes and which roles can access them (prefix match) */
export const ROUTE_ACCESS: Record<string, Role[]> = {
  // Équipier: prod (recettes, catalogue, inventaire) + achats (ingredients, commandes)
  "/recettes":     ALL,
  "/catalogue":    ALL,
  "/ingredients":  ALL,
  "/commandes":    ALL,
  "/stock":        ALL,
  "/inventaire":   ALL,
  "/session":      ALL,
  "/settings/account": ALL,
  // Hub routes
  "/bello-mio":    ALL,
  "/piccola-mia":  ALL,
  "/dashboard":    ALL,
  "/haccp":        ALL,
  "/haccp/admin":  ["group_admin"],
  "/fournisseurs": ALL,
  "/rh/conges":    ALL,
  // Pages contrôlées par permissions granulaires (accessibles à tous, RequireRole vérifie la permission)
  "/plannings":       ALL,
  "/pilotage":        ALL,
  "/ventes":          ALL,
  "/finances":        ALL,
  "/variations-prix": ALL,
  "/rh":              ALL,
  "/personnel":       ALL,
  "/achats":          ALL,
  "/stats-achats":    ALL,
  "/tresorerie":      ALL,
  "/mercuriale":      ALL,
  // Group admin only (admin, settings, imports)
  "/groupe":       ["group_admin"],
  "/admin":        ["group_admin"],
  "/invoices":     ["group_admin"],
  "/evenements":   ["group_admin"],
  "/epicerie":     ["group_admin"],
  "/clients":      ["group_admin"],
  "/devis":        ["group_admin"],
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
