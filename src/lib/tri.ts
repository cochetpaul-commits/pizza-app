/** Tri alphabétique français (charte 29/10/2026 : listes et menus déroulants toujours A → Z) */
export const triFr = (a: string, b: string) => a.localeCompare(b, "fr", { sensitivity: "base" });

/** Copie triée A → Z d'après le libellé affiché ; ne modifie pas la liste d'origine */
export function triParLibelle<T>(liste: readonly T[], libelle: (x: T) => string): T[] {
  return [...liste].sort((a, b) => triFr(libelle(a), libelle(b)));
}
