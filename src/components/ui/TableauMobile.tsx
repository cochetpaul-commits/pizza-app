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
