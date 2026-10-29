import type { CSSProperties } from "react";

/**
 * Charte des pages « liste » (Base produits, Carte, 29/10/2026), partagée par la Cave, les
 * Empâtements et l'Inventaire : cadres blancs arrondis, en-têtes de colonne fins en capitales,
 * liseré de couleur à gauche de chaque ligne, pastilles pleines, titres Oswald.
 */
export const BORD = "#ddd6c8";
export const BORD_LIGNE = "#ece6db";
export const MUTED = "#6f6a61";
export const FAIBLE = "#a39d92";
export const FOND_SURVOL = "#f7f3ec";
export const ACCENT = "#D4775A";
export const BON = "#4a6741";
export const ATTENTION = "#b7791f";
export const MAUVAIS = "#b4443a";
export const INFO = "#2563EB";
export const SOMBRE = "#1a1a1a";
export const OSWALD = "var(--font-oswald), Oswald, sans-serif";

/** Cadre blanc d'un tableau ou d'une liste */
export const CADRE: CSSProperties = { background: "#fff", border: `1px solid ${BORD}`, borderRadius: 14, overflow: "hidden" };
/** En-tête de colonne */
export const TH: CSSProperties = { textAlign: "left", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: MUTED, padding: "10px 14px", borderBottom: `1px solid ${BORD}`, fontWeight: 700, whiteSpace: "nowrap" };
/** Cellule */
export const TD: CSSProperties = { padding: "9px 14px", borderBottom: `1px solid ${BORD_LIGNE}`, verticalAlign: "middle", fontSize: 13 };
/** Liseré de couleur à gauche d'une ligne (première cellule, largeur 6) */
export const liseret = (couleur: string): CSSProperties => ({ ...TD, width: 6, padding: 0, background: couleur });
/** Bouton pilule blanc */
export const BTN: CSSProperties = { border: `1px solid ${BORD}`, borderRadius: 20, background: "#fff", padding: "6px 12px", fontSize: 13, cursor: "pointer", color: "#1a1a1a", fontWeight: 600, fontFamily: "inherit", whiteSpace: "nowrap" };
/** Pilule de filtre : bord terracotta quand active */
export const filtre = (actif: boolean): CSSProperties => ({ ...BTN, borderColor: actif ? ACCENT : BORD, background: actif ? "#f5e9e2" : "#fff", fontWeight: actif ? 700 : 500 });
/** Pastille pleine : fond teinté, texte à la couleur */
export const pastille = (couleur: string, fond?: string): CSSProperties => ({ display: "inline-block", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 8, whiteSpace: "nowrap", background: fond ?? alpha(couleur, 0.12), color: couleur, lineHeight: 1.5 });
/** Titre de page (bureau 28, téléphone 22) */
export const h1 = (bureau: boolean): CSSProperties => ({ fontFamily: OSWALD, fontWeight: 700, fontSize: bureau ? 28 : 22, textTransform: "uppercase", letterSpacing: ".02em", margin: 0, lineHeight: 1.05, color: "#1a1a1a" });
/** Intertitre fin en capitales */
export const INTERTITRE: CSSProperties = { fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: MUTED, fontWeight: 700 };
/** Champ de saisie */
export const CHAMP: CSSProperties = { font: "inherit", fontSize: 14, padding: "7px 10px", border: `1px solid ${BORD}`, borderRadius: 10, background: "#fff", boxSizing: "border-box", height: 36 };

export function alpha(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
