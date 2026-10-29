"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useEtabAuto } from "@/lib/useEtabAuto";
import { useEtablissement } from "@/lib/EtablissementContext";
import { useBureau } from "@/hooks/useBureau";
import { fetchApi } from "@/lib/fetchApi";
import { MUTED, filtre, h1 } from "@/components/ui/charte";
import { Chargement } from "@/components/analyse/Blocs";
import { EtatVide } from "@/components/ui/EtatVide";
import type { ReponseObjectifs } from "@/app/api/objectifs/route";
import type { EntreesSimulateur, Reglages as TReglages } from "@/lib/objectifs";
import { Rythme } from "./Rythme";
import { Budget } from "./Budget";
import { EtSi } from "./EtSi";
import { Reglages } from "./Reglages";

/**
 * Pilotage › Objectifs (29/10/2026) : un rythme de croisière, un budget par poste aligné sur les
 * comptes de l'expert-comptable, un simulateur « Et si… » et les réglages. Chiffres réels : ventes
 * Popina, charges Pennylane, contrats RH.
 */
type Onglet = "rythme" | "budget" | "et-si" | "reglages";
const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: "rythme", libelle: "Rythme de croisière" }, { cle: "budget", libelle: "Budget par poste" }, { cle: "et-si", libelle: "Et si…" }, { cle: "reglages", libelle: "Réglages" },
];
const lireOnglet = (): Onglet => { const h = typeof window !== "undefined" ? window.location.hash.slice(1) : ""; return (ONGLETS.some((o) => o.cle === h) ? h : "rythme") as Onglet; };
// L'onglet vit dans l'ancre de l'adresse (#budget) : store externe, sans décalage à l'hydratation
const abonnerHash = (f: () => void) => { window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f); };

export function Objectifs() {
  useEtabAuto();
  const bureau = useBureau();
  const { current: etab } = useEtablissement();
  const etabId = etab?.id ?? "";
  const onglet = useSyncExternalStore(abonnerHash, lireOnglet, () => "rythme" as Onglet);
  const choisir = (o: Onglet) => { window.history.replaceState(null, "", `#${o}`); window.dispatchEvent(new HashChangeEvent("hashchange")); };
  const [d, setD] = useState<ReponseObjectifs | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!etabId) return;
    let annule = false;
    (async () => {
      try {
        const res = await fetchApi(`/api/objectifs?etablissement_id=${etabId}&mois=13`);
        const j = await res.json().catch(() => null);
        if (annule) return;
        if (!res.ok) setErreur(j?.error ?? `Erreur ${res.status}`); else setD(j as ReponseObjectifs);
      } catch (e) { if (!annule) setErreur(e instanceof Error ? e.message : "Chargement impossible"); }
    })();
    return () => { annule = true; };
  }, [etabId, version]);
  const enregistrer = useCallback(async (reglages: TReglages) => {
    const res = await fetchApi("/api/objectifs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ etablissement_id: etabId, reglages }) });
    if (res.ok) setVersion((v) => v + 1);
  }, [etabId]);
  const memoriser = useCallback(async (s: Partial<EntreesSimulateur>) => { if (d) await enregistrer({ ...d.reglages, simulateur: s }); }, [d, enregistrer]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: bureau ? "18px 28px 60px" : "12px 14px 60px", display: "grid", gap: 14, alignContent: "start" }}>
      <div>
        <h1 style={h1(bureau)}>Objectifs</h1>
        <div style={{ color: MUTED, fontSize: 13, marginTop: 4 }}>Un rythme de croisière, un budget par poste, et ce que donnerait un autre réglage.</div>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {ONGLETS.map((o) => <button key={o.cle} type="button" onClick={() => choisir(o.cle)} aria-pressed={onglet === o.cle} style={filtre(onglet === o.cle)}>{o.libelle}</button>)}
      </div>
      {erreur && <EtatVide titre="Chargement impossible" texte={erreur} />}
      {!d && !erreur && <Chargement texte="Ventes, charges et contrats…" />}
      {d && onglet === "rythme" && <Rythme d={d} />}
      {d && onglet === "budget" && <Budget d={d} />}
      {d && onglet === "et-si" && <EtSi key={version} d={d} onMemoriser={memoriser} />}
      {d && onglet === "reglages" && <Reglages key={version} valeur={d.reglages} onEnregistrer={enregistrer} />}
    </div>
  );
}
