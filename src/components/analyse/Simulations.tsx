"use client";

import { useState } from "react";
import { useEtabAuto } from "@/lib/useEtabAuto";
import { useEtablissement } from "@/lib/EtablissementContext";
import { useBureau } from "@/hooks/useBureau";
import { SimulationContent } from "@/components/rh/SimulationContent";
import { CroisiereSimulateur } from "@/components/rh/CroisiereSimulateur";
import { MUTED, OSWALD } from "@/components/analyse/gabarit";

/**
 * Analyse › Simulations (10/10/2026) : le volet « et si » sorti de la page Masse salariale,
 * à part des chiffres réels. Statuts TNS, simulateur d'embauche, régime de croisière.
 */
type Onglet = "simulateur" | "tns" | "croisiere";
const ONGLETS: { cle: Onglet; libelle: string; sous: string }[] = [
  { cle: "simulateur", libelle: "Simulateur", sous: "Embauche, changement d'horaires : ce que ça coûte" },
  { cle: "tns", libelle: "Statuts TNS", sous: "Gérants : comparaison des statuts" },
  { cle: "croisiere", libelle: "Croisière", sous: "L'équipe et le CA à l'équilibre" },
];

export function Simulations() {
  useEtabAuto();
  const bureau = useBureau();
  const { current: etab } = useEtablissement();
  const [onglet, setOnglet] = useState<Onglet>("simulateur");
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: bureau ? "18px 28px 60px" : "12px 14px 60px", display: "grid", gap: 14, alignContent: "start" }}>
      <div>
        <h1 style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: bureau ? 28 : 22, textTransform: "uppercase", letterSpacing: ".02em", margin: 0, lineHeight: 1.05, color: "#1a1a1a" }}>Simulations</h1>
        <div style={{ color: MUTED, fontSize: 13, marginTop: 4 }}>Et si ? Les hypothèses à part des chiffres réels : embauches, statuts, équipe de croisière.</div>
      </div>
      <div style={{ display: "flex", gap: 4, padding: 4, background: "#ece4d4", borderRadius: 12, flexWrap: "wrap" }}>
        {ONGLETS.map((o) => (
          <button key={o.cle} type="button" onClick={() => setOnglet(o.cle)} aria-pressed={onglet === o.cle} style={{ flex: "1 1 160px", textAlign: "left", padding: "8px 12px", borderRadius: 9, border: "none", cursor: "pointer", fontFamily: "inherit", background: onglet === o.cle ? "#fff" : "transparent", boxShadow: onglet === o.cle ? "0 1px 4px rgba(0,0,0,0.08)" : "none" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: onglet === o.cle ? "#1a1a1a" : MUTED }}>{o.libelle}</div>
            <div style={{ fontSize: 11.5, color: MUTED }}>{o.sous}</div>
          </button>
        ))}
      </div>
      {onglet === "croisiere" ? (etab ? <CroisiereSimulateur etabId={etab.id} etabColor={etab.couleur ?? "#D4775A"} /> : null) : <SimulationContent activeTab={onglet} />}
    </div>
  );
}
