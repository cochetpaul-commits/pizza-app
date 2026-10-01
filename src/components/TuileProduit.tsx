"use client";

import React from "react";
import { couleurTexte } from "@/lib/styleCategories";

/**
 * Tuile produit commune (menu produits, inventaire, commande, stock, épicerie), validée le 01/10/2026 :
 *  1. nom sur toute la largeur, à la couleur de la catégorie (version lisible), crayon et croix au bout ;
 *  2. ligne d'infos : conditionnement de la fiche en gras doux, puis les infos propres à l'écran ;
 *  3. éventuellement une rangée propre à l'écran (compteurs de l'inventaire) ;
 *  4. ligne du bas : à gauche les pastilles (fournisseur, zone, statut…), à droite la valeur ou l'action.
 * Cadre : fond blanc, bordure 1 px, barre gauche 3 px à la couleur, coins 12 px, pas d'ombre ; bordure verte quand « fait ».
 */

export const ACCENT = "#D4775A";
export const OSWALD = "var(--font-oswald), Oswald, sans-serif";

export function cadreTuile(couleur: string, fait = false, selectionnee = false): React.CSSProperties {
  return {
    background: "#fff", borderRadius: 12, border: `1px solid ${selectionnee ? ACCENT : fait ? "#cfe3d6" : "#ece6db"}`, borderLeft: `3px solid ${couleur}`,
    padding: "8px 10px", marginBottom: 6, overflow: "hidden",
  };
}

export function TuileProduit({
  nom, couleur, inactive, fait, selectionnee, avant, actions, badges, infos, milieu, gauche, droite, onClick, cadre = true, children, style,
}: {
  nom: React.ReactNode;
  /** Couleur de la catégorie (barre et nom) */
  couleur: string;
  /** Fiche désactivée : nom en gris */
  inactive?: boolean;
  /** Ligne « faite » (comptée, commandée…) : bordure verte */
  fait?: boolean;
  /** Ligne sélectionnée (mode sélection) : bordure accent */
  selectionnee?: boolean;
  /** Avant le nom (case à cocher) */
  avant?: React.ReactNode;
  /** Au bout du nom (crayon, croix) */
  actions?: React.ReactNode;
  /** Petits badges après le nom (désactivée, dérivé, alerte prix) */
  badges?: React.ReactNode;
  /** Ligne d'infos (conditionnement, remarques) */
  infos?: React.ReactNode;
  /** Rangée propre à l'écran, entre les infos et la ligne du bas */
  milieu?: React.ReactNode;
  /** Ligne du bas, à gauche (pastilles) */
  gauche?: React.ReactNode;
  /** Ligne du bas, à droite (valeur, compteur, bouton) */
  droite?: React.ReactNode;
  onClick?: () => void;
  /** false : le parent fournit le cadre (ex. ligne produit avec son panneau d'édition) */
  cadre?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const contenu = (
    <>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
        {avant}
        <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, lineHeight: 1.2, color: inactive ? "#999" : couleurTexte(couleur), overflowWrap: "anywhere" }}>
          {nom}{badges}
        </span>
        {actions && <span style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "center" }}>{actions}</span>}
      </div>
      {infos && (
        <div style={{ fontSize: 11.5, color: "#8a8378", marginTop: 3, display: "flex", flexWrap: "wrap", gap: "3px 8px", alignItems: "center", lineHeight: 1.3 }}>{infos}</div>
      )}
      {milieu}
      {(gauche || droite) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", minWidth: 0 }}>{gauche}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>{droite}</span>
        </div>
      )}
      {children}
    </>
  );
  if (!cadre) return <div onClick={onClick} style={{ padding: "8px 10px", cursor: onClick ? "pointer" : undefined, ...style }}>{contenu}</div>;
  return <div onClick={onClick} style={{ ...cadreTuile(couleur, fait, selectionnee), cursor: onClick ? "pointer" : undefined, ...style }}>{contenu}</div>;
}

/** Conditionnement de la fiche, en gras doux, dans la ligne d'infos */
export const Conditionnement = ({ children }: { children: React.ReactNode }) => <strong style={{ color: "#6f6656" }}>{children}</strong>;

/** Crayon : ouvre la fiche (lien) ou l'édition (clic) */
export function BoutonCrayon({ href, onClick, title = "Modifier la fiche produit" }: { href?: string; onClick?: () => void; title?: string }) {
  const style: React.CSSProperties = {
    fontSize: 12, color: "#8a8378", textDecoration: "none", border: "1px solid #ddd6c8", borderRadius: 6, padding: "0 5px", lineHeight: "20px", height: 22,
    boxSizing: "border-box", flexShrink: 0, background: "#fff", cursor: "pointer", fontFamily: "inherit", display: "inline-block",
  };
  if (href) return <a href={href} title={title} onClick={(e) => e.stopPropagation()} style={style}>✎</a>;
  return <button type="button" title={title} onClick={(e) => { e.stopPropagation(); onClick?.(); }} style={style}>✎</button>;
}

/** Petite croix ronde rose (18 px) : retirer de la liste ou supprimer */
export function BoutonCroix({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} aria-label={title} title={title} style={{
      width: 18, height: 18, borderRadius: 9, border: "none", background: "#fde7e7", color: "#a12b2b", fontSize: 12, fontWeight: 700, lineHeight: 1,
      display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, padding: 0, fontFamily: "inherit", marginTop: 2,
    }}>×</button>
  );
}

/** Bouton rond − / + (40 px), le même partout */
export function BoutonRond({ signe, actif = true, onClick, taille = 40, aria }: { signe: "−" | "+"; actif?: boolean; onClick: () => void; taille?: number; aria?: string }) {
  return (
    <button type="button" aria-label={aria ?? (signe === "+" ? "Plus" : "Moins")} disabled={!actif} onClick={(e) => { e.stopPropagation(); onClick(); }} style={{
      width: taille, height: taille, borderRadius: taille / 2, border: "none", fontSize: Math.round(taille * 0.6), fontWeight: 700, lineHeight: 1, padding: 0,
      background: actif ? ACCENT : "#ece4d4", color: actif ? "#fff" : "#b8ad9a", cursor: actif ? "pointer" : "default",
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, touchAction: "manipulation", fontFamily: "inherit",
    }}>{signe}</button>
  );
}

/**
 * Compteur resserré « − chiffre + », chiffre Oswald sans cadre sur 34 px, « 0 » gris clair tant que rien n'est saisi.
 * Avec `onSaisie`, le chiffre est aussi un champ clavier (inventaire) ; sinon il n'est modifiable que par les boutons (commande).
 */
export function Compteur({ valeur, onMoins, onPlus, onSaisie, etiquette, desactive, moinsActif, onEntree }: {
  valeur: string; onMoins: () => void; onPlus: () => void; onSaisie?: (v: string) => void; etiquette?: string; desactive?: boolean;
  /** false : « − » grisé (rien à retirer) */
  moinsActif?: boolean; onEntree?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const vide = valeur.trim() === "";
  const chiffre: React.CSSProperties = { minWidth: 44, width: 44, textAlign: "center", fontFamily: OSWALD, fontSize: 22, fontWeight: 700, color: vide ? "#c4bcae" : "#1a1a1a", lineHeight: 1 };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <BoutonRond signe="−" actif={!desactive && (moinsActif ?? !vide)} onClick={onMoins} />
        {onSaisie ? (
          <input inputMode="decimal" value={valeur} disabled={desactive} placeholder="0" onChange={(e) => onSaisie(e.target.value)} onKeyDown={onEntree} onClick={(e) => e.stopPropagation()}
            style={{ ...chiffre, border: "none", background: "transparent", padding: 0, outline: "none", borderBottom: "2px solid transparent" }}
            onFocus={(e) => { e.currentTarget.style.borderBottomColor = ACCENT; }} onBlur={(e) => { e.currentTarget.style.borderBottomColor = "transparent"; }} />
        ) : <span style={chiffre}>{vide ? "0" : valeur}</span>}
        <BoutonRond signe="+" actif={!desactive} onClick={onPlus} />
      </div>
      {etiquette && <span style={{ fontSize: 10.5, color: "#8a8378" }}>{etiquette}</span>}
    </div>
  );
}
