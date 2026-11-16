"use client";

import React, { useEffect, useRef, useState } from "react";

/**
 * Écran de commande sur téléphone : une seule barre fixe collée en bas (nombre d'articles
 * à gauche, gros bouton « Vérifier et envoyer » à droite) ; les actions secondaires
 * (supprimer le brouillon, aperçu PDF, pause…) passent dans le menu « … » en haut.
 * Pendant une commande, la barre Menu / Achats est masquée (classe body.commande-en-cours)
 * et la page réserve en bas la hauteur de cette barre (globals.css).
 */

/** Événement envoyé à l'écran de commande pour dérouler la liste des articles commandés */
export const VOIR_COMMANDE = "commande:voir-liste";

export function BarreCommande({ nbArticles, onEnvoyer, desactive, envoiAdmin }: {
  nbArticles: number;
  onEnvoyer: () => void;
  desactive?: boolean;
  /** Fournisseur sans envoi par un équipier : la commande est préparée, un admin ou un manager l'envoie */
  envoiAdmin?: boolean;
}) {
  const inactif = desactive || nbArticles === 0 || envoiAdmin;
  return (
    <div className="barre-commande">
      {/* Toucher le nombre d'articles déroule la liste de la commande, en haut de l'écran (16/11/2026) */}
      <button type="button" disabled={nbArticles === 0} onClick={() => window.dispatchEvent(new Event(VOIR_COMMANDE))} aria-label="Voir les articles de la commande"
        style={{ minWidth: 0, border: "none", background: "transparent", padding: "0 6px 0 0", textAlign: "left", fontFamily: "inherit", cursor: nbArticles === 0 ? "default" : "pointer", touchAction: "manipulation" }}>
        <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 22, fontWeight: 700, color: "#1a1a1a", lineHeight: 1 }}>
          {nbArticles}
        </div>
        <div style={{ fontSize: 12, color: "#8a8378", marginTop: 2, textDecoration: nbArticles > 0 ? "underline" : "none" }}>{nbArticles > 1 ? "articles" : "article"}</div>
      </button>
      <button type="button" onClick={onEnvoyer} disabled={inactif}
        style={{
          flex: 1, maxWidth: 320, height: 52, borderRadius: 14, border: "none",
          background: inactif ? "#e3dccf" : "#D4775A", color: inactif ? "#9a917f" : "#fff",
          fontSize: 16, fontWeight: 700, fontFamily: "inherit", cursor: inactif ? "default" : "pointer",
          boxShadow: inactif ? "none" : "0 4px 14px rgba(212,119,90,0.30)", touchAction: "manipulation",
        }}>
        {envoiAdmin ? "Envoyée par un admin" : "Vérifier et envoyer"}
      </button>
    </div>
  );
}

export type ActionMenu = { label: string; onClick: () => void; danger?: boolean; disabled?: boolean };

/** Bouton « … » et son menu (actions secondaires de la commande en cours) */
export function MenuCommande({ actions }: { actions: ActionMenu[] }) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!ouvert) return;
    const fermer = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOuvert(false); };
    document.addEventListener("pointerdown", fermer);
    return () => document.removeEventListener("pointerdown", fermer);
  }, [ouvert]);
  if (actions.length === 0) return null;
  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button type="button" aria-label="Autres actions" onClick={() => setOuvert((o) => !o)}
        style={{
          width: 48, height: 48, borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", background: "#fff",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, fontWeight: 700, color: "#1a1a1a", lineHeight: 1, paddingBottom: 8,
        }}>
        …
      </button>
      {ouvert && (
        <div style={{
          position: "absolute", right: 0, top: 54, zIndex: 120, minWidth: 220, background: "#fff", borderRadius: 14,
          boxShadow: "0 10px 30px rgba(0,0,0,0.16)", border: "1px solid #ece6db", padding: 6,
        }}>
          {actions.map((a) => (
            <button key={a.label} type="button" disabled={a.disabled}
              onClick={() => { setOuvert(false); a.onClick(); }}
              style={{
                display: "block", width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 10, border: "none",
                background: "transparent", fontSize: 15, fontWeight: 600, fontFamily: "inherit",
                color: a.danger ? "#DC2626" : "#1a1a1a", cursor: a.disabled ? "default" : "pointer", opacity: a.disabled ? 0.4 : 1,
              }}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
