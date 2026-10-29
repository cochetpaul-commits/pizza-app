"use client";

import { useState } from "react";
import { Cadre, Note } from "@/components/analyse/Blocs";
import { ACCENT, BTN, CHAMP, MUTED, TD, TH, liseret } from "@/components/ui/charte";
import { useBureau } from "@/hooks/useBureau";
import { POSTES_BUDGET, plancherMensuelHt, type Reglages as TReglages } from "@/lib/objectifs";
import { Champ, eur } from "./commun";

/** Onglet Réglages : le plancher, les objectifs par poste, la TVA et les emprunts (remonté à chaque rechargement, clé) */
export function Reglages({ valeur, onEnregistrer }: { valeur: TReglages; onEnregistrer: (r: TReglages) => Promise<void> }) {
  const bureau = useBureau();
  const [r, setR] = useState<TReglages>(valeur);
  const [etat, setEtat] = useState<string | null>(null);
  const enregistrer = async () => { setEtat("Enregistrement…"); await onEnregistrer(r); setEtat("Réglages enregistrés"); setTimeout(() => setEtat(null), 1800); };
  const nb = (v: number) => (Number.isFinite(v) ? v : 0);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Cadre titre="Rythme de croisière" sous={`Le plancher : ${eur(plancherMensuelHt(r.plancher, r.ttcHt))} HT par mois.`}>
        <div style={{ display: "grid", gridTemplateColumns: bureau ? "repeat(3, 1fr)" : "1fr 1fr", gap: 12 }}>
          <Champ libelle="Couverts par service" valeur={r.plancher.couverts} onChange={(x) => setR({ ...r, plancher: { ...r.plancher, couverts: nb(x) } })} />
          <Champ libelle="Ticket moyen TTC" valeur={r.plancher.tm} onChange={(x) => setR({ ...r, plancher: { ...r.plancher, tm: nb(x) } })} suffixe="€" />
          <Champ libelle="Services par semaine" valeur={r.plancher.services} onChange={(x) => setR({ ...r, plancher: { ...r.plancher, services: nb(x) } })} />
        </div>
      </Cadre>
      <Cadre titre="Budget par poste" sous="Objectif en % du CA HT, ou en € par mois pour le loyer et la direction. La référence est la liasse du dernier exercice." sansMarge>
        <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 10 }}>
          <thead><tr><th style={{ ...TH, padding: 0, width: 6 }} /><th style={TH}>Poste</th><th style={{ ...TH, textAlign: "right" }}>Référence</th><th style={{ ...TH, textAlign: "right" }}>Objectif</th></tr></thead>
          <tbody>
            {POSTES_BUDGET.map((p) => (
              <tr key={p.cle}>
                <td style={liseret("transparent")} />
                <td style={{ ...TD, fontWeight: 600 }}>{bureau ? p.libelle : p.court}<div style={{ fontSize: 11.5, color: MUTED, fontWeight: 400 }}>{p.type === "pct" ? "% du CA HT" : "€ par mois"}</div></td>
                <td style={{ ...TD, textAlign: "right" }}><input type="number" inputMode="decimal" step={p.type === "pct" ? 0.1 : 50} value={r.references[p.cle] ?? 0} onChange={(e) => setR({ ...r, references: { ...r.references, [p.cle]: nb(Number(e.target.value)) } })} style={{ ...CHAMP, width: bureau ? 110 : 84, textAlign: "right", color: MUTED }} /></td>
                <td style={{ ...TD, textAlign: "right" }}><input type="number" inputMode="decimal" step={p.type === "pct" ? 0.1 : 50} value={r.objectifs[p.cle] ?? 0} onChange={(e) => setR({ ...r, objectifs: { ...r.objectifs, [p.cle]: nb(Number(e.target.value)) } })} style={{ ...CHAMP, width: bureau ? 110 : 84, textAlign: "right", fontWeight: 700 }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Cadre>
      <Cadre titre="Simulateur" sous="TVA, emprunts et impôt, pour l'EBE et la capacité d'investissement.">
        <div style={{ display: "grid", gridTemplateColumns: bureau ? "repeat(3, 1fr)" : "1fr 1fr", gap: 12 }}>
          <Champ libelle="Rapport TTC / HT des ventes" valeur={r.ttcHt} onChange={(x) => setR({ ...r, ttcHt: nb(x) })} pas={0.001} min={1} source="1,117 : 10 % sur place, 20 % sur les alcools" />
          <Champ libelle="Emprunts par mois" valeur={r.emprunts} onChange={(x) => setR({ ...r, emprunts: nb(x) })} pas={50} suffixe="€" source="intérêts et remboursement du capital" />
          <Champ libelle="Impôt sur les sociétés" valeur={r.tauxIs} onChange={(x) => setR({ ...r, tauxIs: nb(x) })} pas={1} suffixe="%" source="taux normal 25 %, réduit 15 % jusqu'à 42 500 €" />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 14 }}>
          <button type="button" onClick={() => void enregistrer()} style={{ ...BTN, background: ACCENT, borderColor: ACCENT, color: "#fff" }}>Enregistrer les réglages</button>
          {etat && <span style={{ fontSize: 12.5, color: MUTED }}>{etat}</span>}
        </div>
        <Note>Les objectifs achats et masse salariale sont aussi ceux de la page Marge.</Note>
      </Cadre>
    </div>
  );
}
