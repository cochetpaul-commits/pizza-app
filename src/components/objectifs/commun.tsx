"use client";

import type { CSSProperties, ReactNode } from "react";
import { BORD, CHAMP, MUTED, pastille, BON, ATTENTION, MAUVAIS } from "@/components/ui/charte";
import type { Niveau } from "@/lib/objectifs";

/** Petits éléments partagés par les onglets Objectifs */
export const eur = (n: number, d = 0) => `${(Math.round(n * 10 ** d) / 10 ** d).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d })} €`;
export const pct = (n: number, d = 1) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d })} %`;
export const num = (n: number) => Math.round(n).toLocaleString("fr-FR");
export const libMois = (m: string) => new Date(m + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });

export const COULEUR_NIVEAU: Record<Niveau, string> = { bon: BON, attention: ATTENTION, mauvais: MAUVAIS, na: MUTED };
export function Pastille({ niveau, children }: { niveau: Niveau; children: ReactNode }) {
  return <span style={pastille(COULEUR_NIVEAU[niveau], niveau === "na" ? "rgba(0,0,0,0.06)" : undefined)}>{children}</span>;
}

const LAB: CSSProperties = { fontSize: 12, color: MUTED, lineHeight: 1.3, minHeight: "2.6em", display: "flex", alignItems: "flex-end" };
/** Champ numérique de simulateur ou de réglage : libellé fin au-dessus, source dessous */
export function Champ({ libelle, valeur, onChange, pas = 1, suffixe, source, min = 0 }: { libelle: string; valeur: number; onChange: (v: number) => void; pas?: number; suffixe?: string; source?: string; min?: number }) {
  return (
    <label style={{ display: "grid", gap: 4, alignContent: "start", minWidth: 0 }}>
      <span style={LAB}>{libelle}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <input type="number" inputMode="decimal" value={Number.isFinite(valeur) ? valeur : ""} step={pas} min={min} onChange={(e) => onChange(Number(e.target.value))} onFocus={(e) => e.target.select()}
          style={{ ...CHAMP, width: "100%", fontWeight: 600, fontVariantNumeric: "tabular-nums" }} />
        {suffixe && <span style={{ fontSize: 12, color: MUTED, whiteSpace: "nowrap" }}>{suffixe}</span>}
      </span>
      {source && <span style={{ fontSize: 11, color: "#a39d92", lineHeight: 1.3 }}>{source}</span>}
    </label>
  );
}

/** Barre réalisé / objectif (cumul) : piste claire, remplissage à la couleur de l'état, repère de l'objectif */
export function Barre({ libelle, valeur, objectif, echelle, texte, niveau }: { libelle: string; valeur: number; objectif: number; echelle: number; texte: string; niveau: Niveau }) {
  const l = (x: number) => `${Math.min(100, Math.max(0, (x / echelle) * 100))}%`;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(110px, 170px) 1fr auto", gap: 10, alignItems: "center", fontSize: 13.5, minWidth: 0 }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{libelle}</span>
      <span style={{ position: "relative", height: 12, background: "#f2ede4", borderRadius: 4, border: `1px solid ${BORD}`, overflow: "hidden" }}>
        <span style={{ position: "absolute", inset: "0 auto 0 0", width: l(valeur), background: COULEUR_NIVEAU[niveau], opacity: 0.75, borderRadius: 3 }} />
        <span style={{ position: "absolute", top: -2, bottom: -2, left: l(objectif), width: 2, background: "#1a1a1a" }} />
      </span>
      <span style={{ whiteSpace: "nowrap", display: "flex", gap: 6, alignItems: "center" }}><Pastille niveau={niveau}>{texte}</Pastille></span>
    </div>
  );
}
