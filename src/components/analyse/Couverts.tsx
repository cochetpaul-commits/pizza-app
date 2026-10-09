"use client";

import { useEffect, useMemo, useState } from "react";
import { useEtabAuto } from "@/lib/useEtabAuto";
import { useEtablissement } from "@/lib/EtablissementContext";
import { usePilotageRange } from "@/lib/pilotageRange";
import { useBureau } from "@/hooks/useBureau";
import { fetchApi } from "@/lib/fetchApi";
import { EnteteAnalyse, TuileVariation, Cadre, Note, Chargement, TH, TD, TDN } from "@/components/analyse/Blocs";
import { GraphBarres } from "@/components/analyse/GraphBarres";
import { ticketMoyen, totalZones, useStatsVentes } from "@/components/analyse/useStatsVentes";
import { parJour, parJourSemaine } from "@/components/analyse/parJour";
import { COULEUR_MIDI, COULEUR_SOIR, AMBRE, FAIBLE, MUTED, ROUGE, VERT, derniersJours, euros, jourCourt, nombre, pct } from "@/components/analyse/gabarit";
import { EtatVide } from "@/components/ui/EtatVide";
import Link from "next/link";

/**
 * Analyse › Couverts (10/10/2026) : « Qui vient, quand ? »
 * Couverts par service et par jour avec la météo, taux de remplissage face aux capacités
 * (objectifs capacite_midi / capacite_soir), jours forts et faibles, ce que rapportent les salles.
 */
type Capacites = { midi: number | null; soir: number | null };

export function Couverts() {
  useEtabAuto();
  const bureau = useBureau();
  const { current: etab } = useEtablissement();
  const [range, setRange] = usePilotageRange(() => derniersJours(30));
  const { stats, prec, meteo, chargement, erreur } = useStatsVentes(range, true);
  const [capacites, setCapacites] = useState<Capacites & { pour: string }>({ pour: "", midi: null, soir: null });
  const etabId = etab?.id ?? "";
  useEffect(() => {
    if (!etabId) return;
    let annule = false;
    (async () => {
      const res = await fetchApi(`/api/pilotage/objectifs?etablissement_id=${etabId}`).catch(() => null);
      const j = res && res.ok ? await res.json().catch(() => null) : null;
      if (annule) return;
      const o = (j?.objectifs ?? {}) as Record<string, { valeur: number }>;
      setCapacites({ pour: etabId, midi: o.capacite_midi?.valeur ?? null, soir: o.capacite_soir?.valeur ?? null });
    })();
    return () => { annule = true; };
  }, [etabId]);
  const cap = capacites.pour === etabId ? capacites : { midi: null, soir: null };

  const jours = useMemo(() => parJour(stats), [stats]);
  const semaine = useMemo(() => parJourSemaine(jours), [jours]);
  const nMidi = jours.filter((j) => j.covMidi > 0).length, nSoir = jours.filter((j) => j.covSoir > 0).length;
  const remplissage = (cov: number, n: number, capacite: number | null) => (capacite && n ? (cov / (n * capacite)) * 100 : null);
  const rMidi = stats ? remplissage(stats.cov_midi, nMidi, cap.midi) : null;
  const rSoir = stats ? remplissage(stats.cov_soir, nSoir, cap.soir) : null;
  const rGlobal = rMidi != null && rSoir != null ? (rMidi * nMidi + rSoir * nSoir) / Math.max(1, nMidi + nSoir) : rMidi ?? rSoir;
  const parService = useMemo(() => {
    const liste = semaine.flatMap((j) => [{ libelle: `${j.jour} midi`, cov: j.covMidi, n: j.nMidi }, { libelle: `${j.jour} soir`, cov: j.covSoir, n: j.nSoir }]).filter((s) => s.n > 0);
    liste.sort((a, b) => b.cov - a.cov);
    return liste;
  }, [semaine]);
  const salles = useMemo(() => {
    if (!stats) return [];
    const zones = totalZones(stats);
    const total = Object.values(zones).reduce((t, v) => t + v, 0);
    return Object.entries(zones).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([nom, ttc]) => ({ nom, ttc, part: total ? (ttc / total) * 100 : 0 }));
  }, [stats]);
  const couleurRemplissage = (r: number | null) => (r == null ? undefined : r >= 80 ? VERT : r >= 55 ? AMBRE : ROUGE);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: bureau ? "18px 28px 60px" : "12px 14px 60px", display: "grid", gap: 14, alignContent: "start" }}>
      <EnteteAnalyse titre="Couverts" question="Qui vient, quand ? La fréquentation par service et par jour, pour ajuster l'équipe et les commandes." range={range} onRange={setRange} />

      {erreur && <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(180,68,58,0.08)", color: ROUGE, fontSize: 13 }}>{erreur}</div>}
      {!erreur && !stats && !chargement && <Cadre><EtatVide icone="ventes" titre="Aucune vente sur cette période" texte="Les ventes Popina de la période ne sont pas encore importées." /></Cadre>}

      {stats && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: bureau ? "repeat(5, 1fr)" : "repeat(2, 1fr)", gap: bureau ? 10 : 8, opacity: chargement ? 0.6 : 1 }}>
            <TuileVariation compacte={!bureau} icone="couverts" libelle="Couverts" valeur={nombre(stats.couverts)} actuel={stats.couverts} precedent={prec?.couverts} sous={`${nombre(stats.tickets)} tickets`} />
            <TuileVariation compacte={!bureau} icone="couverts" couleur={COULEUR_MIDI} libelle="Midi" valeur={nombre(stats.cov_midi)} actuel={stats.cov_midi} precedent={prec?.cov_midi} sous={nMidi ? `${nombre(stats.cov_midi / nMidi)} par service` : undefined} />
            <TuileVariation compacte={!bureau} icone="couverts" couleur={COULEUR_SOIR} libelle="Soir" valeur={nombre(stats.cov_soir)} actuel={stats.cov_soir} precedent={prec?.cov_soir} sous={nSoir ? `${nombre(stats.cov_soir / nSoir)} par service` : undefined} />
            <TuileVariation compacte={!bureau} icone="produit" couleur={couleurRemplissage(rGlobal)} libelle="Remplissage" valeur={rGlobal != null ? pct(rGlobal) : "—"} actuel={rGlobal ?? 0} precedent={null}
              sous={cap.midi || cap.soir ? `midi ${rMidi != null ? pct(rMidi) : "—"} sur ${cap.midi ?? "?"} · soir ${rSoir != null ? pct(rSoir) : "—"} sur ${cap.soir ?? "?"}` : "capacités à renseigner dans Objectifs"} />
            <TuileVariation compacte={!bureau} icone="euro" libelle="Ticket moyen" valeur={euros(ticketMoyen(stats), 1)} actuel={ticketMoyen(stats)} precedent={prec ? ticketMoyen(prec) : null} sous="TTC par couvert sur place" />
          </div>

          <Cadre titre="Couverts par jour" sous="Midi et soir empilés ; la météo du service du soir sous chaque jour.">
            {chargement ? <Chargement /> : (
              <GraphBarres empile format={(v) => `${nombre(v)} couverts`} etiquettes={jours.map((j) => jourCourt(j.date))} libelleAxe="Couverts par jour"
                sousEtiquettes={jours.map((j) => meteo[`${j.date}:soir`]?.emoji ?? meteo[`${j.date}:midi`]?.emoji ?? null)}
                series={[{ libelle: "Midi", couleur: COULEUR_MIDI, valeurs: jours.map((j) => j.covMidi) }, { libelle: "Soir", couleur: COULEUR_SOIR, valeurs: jours.map((j) => j.covSoir) }]} />
            )}
          </Cadre>

          <div style={{ display: "grid", gridTemplateColumns: bureau ? "3fr 2fr" : "1fr", gap: 14 }}>
            <Cadre titre="Par jour de semaine" sous="Couverts moyens par service et remplissage face à la capacité." sansMarge>
              <div style={{ overflowX: "auto", marginTop: 10 }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead><tr><th style={TH}>Jour</th><th style={{ ...TH, textAlign: "right" }}>Midi</th><th style={{ ...TH, textAlign: "right" }}>Rempl.</th><th style={{ ...TH, textAlign: "right" }}>Soir</th><th style={{ ...TH, textAlign: "right" }}>Rempl.</th>{bureau && <th style={{ ...TH, textAlign: "right" }}>Jour</th>}</tr></thead>
                  <tbody>
                    {semaine.map((j) => {
                      const rm = cap.midi && j.nMidi ? (j.covMidi * j.n / j.nMidi / cap.midi) * 100 : null;
                      const rs = cap.soir && j.nSoir ? (j.covSoir * j.n / j.nSoir / cap.soir) * 100 : null;
                      return (
                        <tr key={j.jour}>
                          <td style={{ ...TD, fontWeight: 700 }}>{j.jour} <span style={{ color: FAIBLE, fontWeight: 500 }}>×{j.n}</span></td>
                          <td style={TDN}>{j.nMidi ? nombre(j.covMidi * j.n / j.nMidi) : "—"}</td>
                          <td style={{ ...TDN, color: couleurRemplissage(rm) ?? FAIBLE, fontWeight: 600 }}>{rm != null ? pct(rm) : "—"}</td>
                          <td style={TDN}>{j.nSoir ? nombre(j.covSoir * j.n / j.nSoir) : "—"}</td>
                          <td style={{ ...TDN, color: couleurRemplissage(rs) ?? FAIBLE, fontWeight: 600 }}>{rs != null ? pct(rs) : "—"}</td>
                          {bureau && <td style={{ ...TDN, fontWeight: 700 }}>{nombre(j.cov)}</td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: "10px 16px 14px" }}>
                {parService.length >= 2 && (
                  <div style={{ fontSize: 12.5, color: MUTED }}>
                    Service le plus fort : <b style={{ color: VERT }}>{parService[0].libelle}</b> ({nombre(parService[0].cov)} couverts en moyenne) · le plus faible : <b style={{ color: ROUGE }}>{parService[parService.length - 1].libelle}</b> ({nombre(parService[parService.length - 1].cov)}).
                  </div>
                )}
                <Note>Remplissage = couverts ÷ (capacité × nombre de services). Capacités : <Link href="/settings/etablissements" style={{ color: "#D4775A" }}>Paramètres › Établissements</Link>, clés capacite_midi et capacite_soir. Vert ≥ 80 %, ambre ≥ 55 %.</Note>
              </div>
            </Cadre>
            <Cadre titre="Ce que rapportent les salles" sous="CA TTC par zone de la caisse sur la période.">
              {salles.length === 0 ? <div style={{ color: FAIBLE, fontSize: 13 }}>Pas de zone renseignée dans les ventes.</div> : salles.map((s) => (
                <div key={s.nom} style={{ padding: "7px 0", borderBottom: "1px solid #f0ebe2" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ fontWeight: 600 }}>{s.nom}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{euros(s.ttc)} <span style={{ color: MUTED }}>· {pct(s.part)}</span></span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: "#f0ebe3", marginTop: 5, overflow: "hidden" }}><div style={{ width: `${s.part}%`, height: "100%", background: COULEUR_SOIR, borderRadius: 3 }} /></div>
                </div>
              ))}
              <Note>Une terrasse ou des pergolas à zéro un jour de pluie n&apos;est pas une anomalie de saisie.</Note>
            </Cadre>
          </div>
        </>
      )}
      {chargement && !stats && <Chargement texte="Chargement des ventes…" />}
    </div>
  );
}
