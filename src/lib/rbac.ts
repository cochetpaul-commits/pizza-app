export type Role = "group_admin" | "manager" | "equipier";

// Legacy role aliases — map old roles to new ones
export function normalizeRole(role: string): Role {
  if (role === "group_admin" || role === "admin" || role === "direction" || role === "proprietaire" || role === "directeur") return "group_admin";
  if (role === "manager" || role === "responsable" || role === "chef") return "manager";
  return "equipier"; // cuisine, salle, plonge, equipier → equipier
}

const ALL: Role[] = ["group_admin", "manager", "equipier"];
const MANAGERS: Role[] = ["group_admin", "manager"];

/** Routes and which roles can access them (prefix match) */
export const ROUTE_ACCESS: Record<string, Role[]> = {
  // Tous: production, achats, stock
  "/recettes":     ALL,
  "/catalogue":    ALL,
  "/ingredients":  MANAGERS,
  "/commandes":    ALL,
  "/stock":        ALL,
  "/inventaire":   ALL,
  "/session":      ALL,
  "/settings/account": ALL,
  "/bello-mio":    ALL,
  "/piccola-mia":  ALL,
  "/dashboard":    ALL,
  "/mon-tableau":  ALL,
  "/mes-conges":   ALL,
  "/haccp":        MANAGERS,
  "/fournisseurs": ALL,
  "/rh/conges":    MANAGERS,
  "/rh":           MANAGERS,
  "/personnel":    MANAGERS,
  // Manager + Admin: pilotage, ventes, RH, événements
  "/pilotage":        ALL, // redirection (page supprimee le 15/08)
  "/ventes":          MANAGERS,
  "/finances":        MANAGERS,
  "/variations-prix": MANAGERS,
  "/achats":          MANAGERS,
  "/stats-achats":    MANAGERS,
  "/tresorerie":      MANAGERS,
  "/rentabilite":     MANAGERS,
  "/mercuriale":      MANAGERS,
  "/evenements":      MANAGERS,
  "/clients":         MANAGERS,
  "/devis":           MANAGERS,
  "/epicerie":        MANAGERS,
  // Admin only: settings, imports, groupe, admin
  "/haccp/admin":  ["group_admin"],
  "/groupe":       ["group_admin"],
  "/admin":        ["group_admin"],
  "/invoices":     ["group_admin"],
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
  return role === "group_admin" || role === "manager";
}
