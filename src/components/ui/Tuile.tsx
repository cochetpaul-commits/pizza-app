"use client";

import React, { type ReactNode } from "react";
import { OSWALD } from "@/components/TuileProduit";

/**
 * Tuile d'indicateur commune (Accueil, Base produits, Commandes, Carte…), calée sur ComandR le 09/10/2026 :
 * fond légèrement teinté à la couleur de l'indicateur, pastille ronde avec icône en haut à droite,
 * libellé, grand chiffre Oswald, ligne de détail. Cliquable quand `onClick` est fourni (bordure sombre quand active).
 */

const BORD = "#ddd6c8";
const MUTED = "#6f6a61";

export type TuileIcone = "euro" | "couverts" | "ticket" | "facture" | "produit" | "alerte" | "sans" | "doublon" | "brouillon" | "attente" | "camion" | "recu" | "lien" | "foodcost" | "fiche";

function Icone({ nom, couleur }: { nom: TuileIcone; couleur: string }) {
  const p = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: couleur, strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (nom) {
    case "euro": return <svg {...p}><path d="M17 5.5A7 7 0 0 0 7.5 9M17 18.5A7 7 0 0 1 7.5 15M4 10.5h10M4 13.5h10" /></svg>;
    case "couverts": return <svg {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><circle cx="17" cy="9" r="2.5" /><path d="M16 15a5 5 0 0 1 5.5 5" /></svg>;
    case "ticket": return <svg {...p}><path d="M4 5h16v14l-2-1.5L16 19l-2-1.5L12 19l-2-1.5L8 19l-2-1.5L4 19z" /><path d="M8 9h8M8 12.5h5" /></svg>;
    case "facture": return <svg {...p}><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12h6M9 16h6" /></svg>;
    case "produit": return <svg {...p}><path d="M12 3 4 7v10l8 4 8-4V7z" /><path d="M4 7l8 4 8-4M12 11v10" /></svg>;
    case "alerte": return <svg {...p}><path d="M12 4 2.5 20h19z" /><path d="M12 10v4.5M12 17.5v.5" /></svg>;
    case "sans": return <svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M6 6l12 12" /></svg>;
    case "doublon": return <svg {...p}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></svg>;
    case "brouillon": return <svg {...p}><path d="M4 20h4l10-10-4-4L4 16z" /><path d="M12.5 7.5l4 4" /></svg>;
    case "attente": return <svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
    case "camion": return <svg {...p}><rect x="2" y="6" width="13" height="10" rx="1" /><path d="M15 9h4l3 3v4h-7z" /><circle cx="6.5" cy="18" r="1.8" /><circle cx="17.5" cy="18" r="1.8" /></svg>;
    case "recu": return <svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M8 12.5l2.5 2.5L16 9.5" /></svg>;
    case "lien": return <svg {...p}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>;
    case "foodcost": return <svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5V12l6 3.5" /></svg>;
    case "fiche": return <svg {...p}><path d="M5 4h14v16H5z" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>;
  }
}

/** Fond teinté : la couleur de l'indicateur à 10 %, fondue vers le blanc. */
function teinte(couleur: string): string {
  if (couleur === "#1a1a1a") return "linear-gradient(135deg, #f2ede4 0%, #f8f5ef 60%, #fff 100%)";
  return `linear-gradient(135deg, ${alpha(couleur, 0.13)} 0%, ${alpha(couleur, 0.04)} 60%, #fff 100%)`;
}

export function alpha(hex: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function Tuile({ libelle, valeur, sous, couleur = "#6f6a61", icone, droite, active, onClick, compacte, href }: {
  libelle: string;
  valeur: ReactNode;
  /** Ligne de détail sous le chiffre (masquée en mode compact) */
  sous?: ReactNode;
  /** Couleur de l'indicateur : teinte du fond, pastille et chiffre */
  couleur?: string;
  icone?: TuileIcone;
  /** À droite du libellé (badge de variation…) ; sinon la pastille d'icône */
  droite?: ReactNode;
  active?: boolean;
  onClick?: () => void;
  compacte?: boolean;
  href?: string;
}) {
  const sombre = couleur === "#1a1a1a";
  const style: React.CSSProperties = {
    position: "relative", background: active ? (sombre ? "#ece6db" : alpha(couleur, 0.16)) : teinte(couleur), border: `1px solid ${active ? couleur : BORD}`,
    boxShadow: active ? `0 0 0 2px ${alpha(couleur, 0.18)}` : "none",
    borderRadius: 14, padding: compacte ? "10px 12px" : "14px 16px", display: "grid", gap: compacte ? 2 : 4, alignContent: "start",
    textAlign: "left", cursor: onClick || href ? "pointer" : "default", fontFamily: "inherit", minWidth: 0, color: "#1a1a1a", textDecoration: "none", width: "100%", boxSizing: "border-box",
  };
  const contenu = (
    <>
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: compacte ? 0 : 28 }}>
        <span style={{ fontSize: 12.5, color: MUTED, fontWeight: 600, minWidth: 0, lineHeight: 1.25, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{libelle}</span>
        {droite ? <span style={{ flexShrink: 0, whiteSpace: "nowrap" }}>{droite}</span> : (icone && !compacte ? (
          <span style={{ width: 30, height: 30, borderRadius: "50%", background: sombre ? "rgba(26,26,26,0.07)" : alpha(couleur, 0.14), display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Icone nom={icone} couleur={sombre ? "#1a1a1a" : couleur} />
          </span>
        ) : null)}
      </span>
      <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: compacte ? 22 : 28, lineHeight: 1.05, color: sombre ? "#1a1a1a" : couleur, fontVariantNumeric: "tabular-nums" }}>{valeur}</span>
      {!compacte && sous != null && sous !== "" && <span style={{ fontSize: 12, color: MUTED, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{sous}</span>}
    </>
  );
  if (href) return <a href={href} style={style}>{contenu}</a>;
  if (onClick) return <button type="button" onClick={onClick} style={style}>{contenu}</button>;
  return <div style={style}>{contenu}</div>;
}
