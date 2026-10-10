"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * Tableau du téléphone (10/10/2026), gabarit unique pour toutes les listes : cadre blanc (ou accroché
 * sous une barre de catégorie), liseré de couleur en première colonne, en-tête en petites capitales,
 * colonnes à largeur fixe (le nom prend le reste), chevron ou action en dernière colonne.
 * Modèle : le tableau des factures par fournisseur de la page Achats.
 */
export type ColonneMobile = { libelle?: ReactNode; largeur?: number | string; align?: "left" | "right" | "center" };

const BORD = "#ddd6c8";
export const TH_MOBILE: CSSProperties = { textAlign: "left", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "#a39d92", padding: "8px 10px", borderBottom: `1px solid ${BORD}`, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

export function TableauMobile({ colonnes, enSection, sansCadre, entete = true, children, pied }: {
  colonnes: ColonneMobile[];
  /** Accroché sous une barre de catégorie : coins du haut droits, pas de bord haut */
  enSection?: boolean;
  /** Le cadre blanc est déjà fourni par l'appelant (plusieurs tableaux dans un même cadre) */
  sansCadre?: boolean;
  entete?: boolean;
  children: ReactNode;
  pied?: ReactNode;
}) {
  const table = (
    <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed", fontSize: 13 }}>
      <colgroup>
        <col style={{ width: 4 }} />
        {colonnes.map((c, i) => <col key={i} style={c.largeur != null ? { width: c.largeur } : undefined} />)}
      </colgroup>
      {entete && (
        <thead>
          <tr>
            <th style={{ ...TH_MOBILE, padding: 0 }} />
            {colonnes.map((c, i) => <th key={i} style={{ ...TH_MOBILE, textAlign: c.align ?? "left", paddingLeft: i === 0 ? 10 : c.align === "right" ? 4 : 10, paddingRight: c.align === "right" ? 6 : 8 }}>{c.libelle ?? ""}</th>)}
          </tr>
        </thead>
      )}
      <tbody>{children}</tbody>
    </table>
  );
  if (sansCadre) return table;
  return (
    <div style={{ background: "#fff", border: `1px solid ${BORD}`, borderTop: enSection ? 0 : `1px solid ${BORD}`, borderRadius: enSection ? "0 0 14px 14px" : 14, overflow: "hidden" }}>
      {table}
      {pied}
    </div>
  );
}

/**
 * Cellule produit du téléphone (10/10/2026) : le nom prend toute la largeur de la ligne, et la
 * colonne de droite (prix, stock, compteur de quantité…) descend sous le titre, à droite des
 * détails. Remplace les deux colonnes « nom » et « valeur » : la cellule s'étend sur les deux
 * (colSpan), les colonnes de la grille restant celles de l'en-tête.
 */
export function CelluleProduit({ titre, droite, colSpan = 2, style, children }: {
  titre: ReactNode;
  /** Colonne de droite, sous le titre */
  droite?: ReactNode;
  colSpan?: number;
  style?: CSSProperties;
  /** Détails sous le titre, à gauche */
  children?: ReactNode;
}) {
  return (
    <td colSpan={colSpan} style={style}>
      <div style={{ fontWeight: 600, fontSize: 13.5, color: "#1a1a1a", lineHeight: 1.25 }}>{titre}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 3 }}>
        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
        {droite != null && <div style={{ flexShrink: 0, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{droite}</div>}
      </div>
    </td>
  );
}
