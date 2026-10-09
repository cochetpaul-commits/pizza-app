"use client";

import type { CSSProperties, ReactNode } from "react";
import { PilotageRangeBar } from "@/components/ui/PilotageRangeBar";
import type { DateRange } from "@/components/ui/DateRangePicker";
import { Tuile, type TuileIcone } from "@/components/ui/Tuile";
import { useBureau } from "@/hooks/useBureau";
import { BORD, FAIBLE, MUTED, OSWALD, VERT, ROUGE, derniersJours, moisEnCours, nbJours, libellePeriode, texteVariation, variation } from "./gabarit";

/** En-tête d'une page Analyse : titre, la question à laquelle elle répond, période (raccourcis + sélecteur) */
export function EnteteAnalyse({ titre, question, range, onRange, droite }: { titre: string; question: string; range: DateRange; onRange: (r: DateRange) => void; droite?: ReactNode }) {
  const bureau = useBureau();
  const n = nbJours(range);
  const hier = derniersJours(1).to;
  const raccourcis: { libelle: string; r: DateRange }[] = [
    { libelle: "7 j", r: derniersJours(7) }, { libelle: "30 j", r: derniersJours(30) }, { libelle: "90 j", r: derniersJours(90) }, { libelle: "Ce mois", r: moisEnCours() },
  ];
  const actif = (r: DateRange) => r.from === range.from && r.to === range.to;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: bureau ? 28 : 22, textTransform: "uppercase", letterSpacing: ".02em", margin: 0, lineHeight: 1.05, color: "#1a1a1a" }}>{titre}</h1>
        <div style={{ color: MUTED, fontSize: 13, marginTop: 4 }}>{question}</div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        {droite}
        <span style={{ display: "inline-flex", background: "#ece4d4", borderRadius: 10, padding: 3, gap: 3 }}>
          {raccourcis.map((x) => (
            <button key={x.libelle} type="button" onClick={() => onRange(x.r)} aria-pressed={actif(x.r)} style={{
              border: "none", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
              background: actif(x.r) ? "#fff" : "transparent", color: actif(x.r) ? "#1a1a1a" : MUTED, boxShadow: actif(x.r) ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            }}>{x.libelle}</button>
          ))}
        </span>
        <PilotageRangeBar value={range} onChange={onRange} center={false} />
        <span style={{ fontSize: 12, color: FAIBLE, whiteSpace: "nowrap" }} title={libellePeriode(range)}>{n} jour{n > 1 ? "s" : ""} · comparé aux {n} jours d&apos;avant{range.to > hier ? " · journée en cours incluse" : ""}</span>
      </div>
    </div>
  );
}

/** Tuile avec variation par rapport à la période précédente (ou à un objectif) dans la ligne de détail */
export function TuileVariation({ libelle, valeur, actuel, precedent, icone, couleur, sous, inverse, compacte, active, onClick }: {
  libelle: string; valeur: ReactNode; actuel: number; precedent: number | null | undefined; icone?: TuileIcone; couleur?: string; sous?: string;
  /** Une baisse est une bonne nouvelle (coûts, ratios) */
  inverse?: boolean; compacte?: boolean; active?: boolean; onClick?: () => void;
}) {
  const v = variation(actuel, precedent);
  const bon = v == null ? null : inverse ? v <= 0 : v >= 0;
  const detail = v == null ? (sous ?? "pas de période de comparaison") : <><b style={{ color: bon ? VERT : ROUGE }}>{texteVariation(v)}</b> vs période précédente{sous ? ` · ${sous}` : ""}</>;
  return <Tuile libelle={libelle} valeur={valeur} icone={icone} couleur={couleur ?? "#1a1a1a"} sous={detail} compacte={compacte} active={active} onClick={onClick}
    droite={compacte && v != null ? <span style={{ fontSize: 11.5, fontWeight: 700, color: bon ? VERT : ROUGE, whiteSpace: "nowrap" }}>{texteVariation(v)}</span> : undefined} />;
}

/** Cadre blanc d'une section : titre, sous-titre, contenu */
export function Cadre({ titre, sous, droite, children, sansMarge }: { titre?: ReactNode; sous?: ReactNode; droite?: ReactNode; children: ReactNode; sansMarge?: boolean }) {
  return (
    <section style={{ background: "#fff", border: `1px solid ${BORD}`, borderRadius: 14, overflow: "hidden" }}>
      {(titre || droite) && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 8, padding: "14px 16px 0" }}>
          <div>
            {titre && <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", letterSpacing: ".04em", color: "#1a1a1a" }}>{titre}</div>}
            {sous && <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>{sous}</div>}
          </div>
          {droite}
        </div>
      )}
      <div style={sansMarge ? undefined : { padding: "12px 16px 16px" }}>{children}</div>
    </section>
  );
}

export const TH: CSSProperties = { textAlign: "left", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: FAIBLE, padding: "8px 12px", borderBottom: `1px solid ${BORD}`, fontWeight: 600, whiteSpace: "nowrap" };
export const TD: CSSProperties = { padding: "9px 12px", borderBottom: "1px solid #f0ebe2", verticalAlign: "middle", fontSize: 13 };
export const TDN: CSSProperties = { ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

/** Petit texte d'explication en bas d'une section (source, méthode) */
export function Note({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 11.5, color: FAIBLE, marginTop: 10, lineHeight: 1.4 }}>{children}</div>;
}

export function Chargement({ texte = "Calcul…" }: { texte?: string }) {
  return <div style={{ padding: 30, textAlign: "center", color: MUTED, fontSize: 13 }}>{texte}</div>;
}
