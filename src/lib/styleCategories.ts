import type { CSSProperties } from "react";

/**
 * Trame graphique des catégories, partagée par le menu produits, l'inventaire et la commande :
 *  - barre de catégorie : fond en dégradé de la couleur de la catégorie, texte blanc ;
 *  - sous-catégorie : accordéon clair teinté de la même couleur, barre à gauche ;
 *  - sous-catégories : une seule orthographe par catégorie (pas de doublon « Eaux » / « eaux »).
 */

/** Éclaircit une couleur hex vers le blanc (pct entre 0 et 1) */
export function eclaircir(hex: string, pct: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  const c = [v >> 16, (v >> 8) & 255, v & 255].map((x) => Math.round(x + (255 - x) * pct));
  return `#${c.map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/** Assombrit une couleur hex vers le noir (pct entre 0 et 1) */
export function assombrir(hex: string, pct: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  const c = [v >> 16, (v >> 8) & 255, v & 255].map((x) => Math.round(x * (1 - pct)));
  return `#${c.map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/** Dégradé de la barre de catégorie : de la couleur (gauche) à une version un peu plus claire (droite) */
export const degradeCategorie = (couleur: string) => `linear-gradient(90deg, ${assombrir(couleur, 0.06)} 0%, ${couleur} 55%, ${eclaircir(couleur, 0.22)} 100%)`;

/** Barre de catégorie (bouton pleine largeur) */
export function styleBarreCategorie(couleur: string): CSSProperties {
  return {
    width: "100%", minHeight: 52, display: "flex", alignItems: "center", gap: 10, padding: "0 14px",
    background: degradeCategorie(couleur), border: "none", borderRadius: 14,
    cursor: "pointer", textAlign: "left", touchAction: "manipulation", fontFamily: "inherit",
    boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
  };
}
/** Titre dans la barre de catégorie */
export const styleTitreCategorie: CSSProperties = {
  flex: 1, fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, fontSize: 15, textTransform: "uppercase", letterSpacing: "0.04em", color: "#fff",
};
/** Pastille de compte dans la barre (fond blanc, texte à la couleur) */
export const stylePastilleBarre = (couleur: string): CSSProperties => ({ fontSize: 12, fontWeight: 700, color: couleur, background: "#fff", borderRadius: 10, padding: "3px 8px" });

/** Accordéon de sous-catégorie : clair teinté de la couleur quand ouvert, blanc fermé, barre à gauche */
export function styleSousCategorie(couleur: string, ouverte: boolean): CSSProperties {
  return {
    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, margin: "6px 0 4px",
    padding: "8px 12px", background: ouverte ? eclaircir(couleur, 0.88) : "#fff", border: `1.5px solid ${eclaircir(couleur, 0.7)}`, borderLeft: `3px solid ${couleur}`,
    borderRadius: 8, cursor: "pointer", fontSize: 10.5, fontWeight: 700, color: couleur, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "inherit", textAlign: "left",
  };
}

const cle = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Sous-catégorie saisie → orthographe unique : celle déjà utilisée dans la catégorie si elle existe
 * (même nom à la casse, aux accents ou aux espaces près), sinon la saisie nettoyée avec une majuscule initiale.
 * Vide → null.
 */
export function normaliserSousCategorie(saisie: string | null | undefined, existantes: string[]): string | null {
  const s = String(saisie ?? "").replace(/\s+/g, " ").trim();
  if (!s) return null;
  const k = cle(s);
  const deja = existantes.find((e) => cle(e) === k);
  if (deja) return deja;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
