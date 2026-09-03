import { hasPermission } from "@/lib/permissions";

export type Role = "group_admin" | "manager" | "equipier";

// Legacy role aliases — map old roles to new ones
export function normalizeRole(role: string): Role {
  if (role === "group_admin" || role === "admin" || role === "direction" || role === "proprietaire" || role === "directeur") return "group_admin";
  if (role === "manager" || role === "responsable" || role === "chef") return "manager";
  return "equipier"; // cuisine, salle, plonge, equipier → equipier
}

const ALL: Role[] = ["group_admin", "manager", "equipier"];
const MANAGERS: Role[] = ["group_admin", "manager"];

/**
 * Routes gouvernées par une permission (préfixe le plus long gagnant).
 * La permission tient compte des exceptions de la fiche employé — c'est
 * ce qui permet d'ouvrir « Créer et modifier les recettes » à un équipier
 * sans changer son rôle. Les routes absentes d'ici retombent sur
 * ROUTE_ACCESS (par rôle).
 */
export const ROUTE_PERMISSION: Record<string, string> = {
  // Production : consultation
  "/recettes":      "operations.recettes",
  "/fiche":         "operations.recettes",
  "/catalogue":     "operations.recettes",
  "/recipes":       "operations.recettes",
  "/kitchen":       "operations.recettes",
  "/pizzas":        "operations.recettes",
  "/cocktails":     "operations.recettes",
  "/prep":          "operations.recettes",
  // Production : création (les pages d'édition vérifient elles-mêmes edit_recettes)
  "/fiche/new":         "operations.edit_recettes",
  "/recettes/new":      "operations.edit_recettes",
  "/kitchen/new":       "operations.edit_recettes",
  "/pizzas/new":        "operations.edit_recettes",
  "/cocktails/new":     "operations.edit_recettes",
  // Achats
  "/ingredients":     "achats.inventaire",
  "/stock":           "achats.inventaire",
  "/inventaire":      "achats.inventaire",
  "/commandes":       "achats.edit",
  "/fournisseurs":    "achats.edit",
  "/achats":          "achats.view",
  "/variations-prix": "achats.view",
  "/mercuriale":      "achats.view",
  // Pilotage
  "/ventes":          "performances.view",
  "/ventes/marges":   "performances.pilotage",
  "/rentabilite":     "performances.pilotage",
  // Personnel
  "/rh/equipe":       "profil.view_team",
  "/rh/employe":      "profil.view_team",
  "/personnel":       "profil.view_team",
  "/rh/pointage":     "heures.edit_team",
  "/rh/emargement":   "heures.edit_team",
};

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
  "/variations-prix": MANAGERS,
  "/achats":          MANAGERS,
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
const PUBLIC_ROUTES = ["/", "/login", "/auth", "/installer", "/settings/account", "/mes-shifts", "/notifications"];

function longestPrefix(path: string, prefixes: string[]): string {
  let best = "";
  for (const prefix of prefixes) {
    if ((path === prefix || path.startsWith(prefix + "/")) && prefix.length > best.length) best = prefix;
  }
  return best;
}

/**
 * Check if a user can access a given path (prefix match).
 * `can` = vérificateur de permission de l'utilisateur (rôle + exceptions de
 * sa fiche) ; sans lui, seules les règles par rôle s'appliquent.
 */
export function canAccess(role: Role, path: string, can?: (permission: string) => boolean): boolean {
  // Public routes are always accessible
  if (PUBLIC_ROUTES.some(r => path === r || path.startsWith(r + "/"))) return true;
  if (role === "group_admin") return true;

  const permPrefix = longestPrefix(path, Object.keys(ROUTE_PERMISSION));
  const rolePrefix = longestPrefix(path, Object.keys(ROUTE_ACCESS));

  // La règle la plus précise gagne ; à égalité, la permission (plus fine) prime
  if (permPrefix && permPrefix.length >= rolePrefix.length) {
    const perm = ROUTE_PERMISSION[permPrefix];
    return can ? can(perm) : hasPermission(role, perm);
  }
  // Deny access to unlisted routes (security: deny by default)
  if (!rolePrefix) return false;
  return ROUTE_ACCESS[rolePrefix].includes(role);
}

/** Can this role write (create/edit/delete)? */
export function canWrite(role: Role): boolean {
  return role === "group_admin" || role === "manager";
}
