"use client";

import React, { type ReactNode } from "react";

/**
 * État vide commun (liste sans résultat, rien à afficher), calé sur ComandR le 09/10/2026 :
 * pastille ronde avec icône, titre en gras, phrase d'explication, bouton d'action facultatif.
 */
export function EtatVide({ titre, texte, action, icone = "liste", compact }: {
  titre: string;
  texte?: ReactNode;
  action?: ReactNode;
  icone?: "liste" | "recherche" | "produit" | "commande" | "equipe" | "ventes" | "camion";
  /** Moins de hauteur (dans une cellule de tableau, un volet) */
  compact?: boolean;
}) {
  const p = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "#6f6a61", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const svg = icone === "recherche" ? <svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
    : icone === "produit" ? <svg {...p}><path d="M12 3 4 7v10l8 4 8-4V7z" /><path d="M4 7l8 4 8-4M12 11v10" /></svg>
    : icone === "commande" ? <svg {...p}><path d="M3 4h2l2.5 11h11L21 7H6.5" /><circle cx="9" cy="19" r="1.5" /><circle cx="17" cy="19" r="1.5" /></svg>
    : icone === "camion" ? <svg {...p}><rect x="2" y="6" width="13" height="10" rx="1" /><path d="M15 9h4l3 3v4h-7z" /><circle cx="6.5" cy="18" r="1.8" /><circle cx="17.5" cy="18" r="1.8" /></svg>
    : icone === "equipe" ? <svg {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><circle cx="17" cy="9" r="2.5" /><path d="M16 15a5 5 0 0 1 5.5 5" /></svg>
    : icone === "ventes" ? <svg {...p}><path d="M4 5h16v14l-2-1.5L16 19l-2-1.5L12 19l-2-1.5L8 19l-2-1.5L4 19z" /><path d="M8 9h8M8 12.5h5" /></svg>
    : <svg {...p}><path d="M5 4h14v16H5z" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>;
  return (
    <div style={{ display: "grid", justifyItems: "center", textAlign: "center", gap: 6, padding: compact ? "22px 16px" : "44px 20px", color: "#6f6a61" }}>
      <span style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(26,26,26,0.05)", display: "grid", placeItems: "center", marginBottom: 4 }}>{svg}</span>
      <b style={{ fontSize: 15, color: "#1a1a1a" }}>{titre}</b>
      {texte && <span style={{ fontSize: 13, maxWidth: 420, lineHeight: 1.45 }}>{texte}</span>}
      {action && <span style={{ marginTop: 8 }}>{action}</span>}
    </div>
  );
}
