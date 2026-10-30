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
import { capacitesParJour, parJour, parJourSemaine, type Capacites } from "@/components/analyse/parJour";
import { COULEUR_MIDI, COULEUR_SOIR, AMBRE, FAIBLE, MUTED, ROUGE, VERT, derniersJours, euros, jourCourt, nombre, pct } from "@/components/analyse/gabarit";
import { EtatVide } from "@/components/ui/EtatVide";
import { ResumeServices } from "@/components/analyse/ResumeServices";
import Link from "next/link";

/**
 * Analyse › Couverts (10/10/2026) : « Qui vient, quand ? »
 * Couverts par service et par jour avec la météo, taux de remplissage face aux places disponibles
 * (objectifs capacite_salle, plus capacite_jardin quand le jardin a servi), jours forts et faibles,
 * ce que rapportent les salles.
 */

export function Couverts() {
  useEtabAuto();
  const bureau = useBureau();
  const { current: etab } = useEtablissement();
  const [range, setRange] = usePilotageRange(() => derniersJours(30));
  const { stats, prec, meteo, chargement, erreur } = useStatsVentes(range, true);
  const [capacites, setCapacites] = useState<Capacites & { pour: string }>({ pour: "", salle: null, jardin: null });
  const etabId = etab?.id ?? "";
  useEffect(() => {
    if (!etabId) return;
    let annule = false;
    (async () => {
      const res = await fetchApi(`/api/pilotage/objectifs?etablissement_id=${etabId}`).catch(() => null);
      const j = res && res.ok ? await res.json().catch(() => null) : null;
      if (annule) return;
      const o = (j?.objectifs ?? {}) as Record<string, { valeur: number }>;
      setCapacites({ pour: etabId, salle: o.capacite_salle?.valeur ?? o.capacite_midi?.valeur ?? null, jardin: o.capacite_jardin?.valeur ?? null });
    })();
    return () => { annule = true; };
  }, [etabId]);
  const cap = useMemo<Capacites>(() => (capacites.pour === etabId ? { salle: capacites.salle, jardin: capacites.jardin } : { salle: null, jardin: null }), [capacites, etabId]);

  const jours = useMemo(() => parJour(stats), [stats]);
  const semaine = useMemo(() => parJourSemaine(jours), [jours]);
  const nMidi = jours.filter((j) => j.covMidi > 0).length, nSoir = jours.filter((j) => j.covSoir > 0).length;
  // Places disponibles : la salle à chaque service, le jardin en plus quand il a servi (zone Terrasse de la caisse)
  const capJour = useMemo(() => capacitesParJour(stats, cap), [stats, cap]);
  const places = useMemo(() => {
    let midi = 0, soir = 0, jardinMidi = 0, jardinSoir = 0;
    for (const j of jours) {
      const c = capJour.get(j.date);
      if (!c) continue;
      if (j.covMidi > 0) { midi += c.midi; if (c.jardinMidi) jardinMidi++; }
      if (j.covSoir > 0) { soir += c.soir; if (c.jardinSoir) jardinSoir++; }
    }
    return { midi, soir, jardinMidi, jardinSoir };
  }, [jours, capJour]);
  const remplissage = (cov: number, placesDispo: number) => (placesDispo > 0 ? (cov / placesDispo) * 100 : null);
  const rMidi = stats ? remplissage(stats.cov_midi, places.midi) : null;
  const rSoir = stats ? remplissage(stats.cov_soir, places.soir) : null;
  const rGlobal = stats ? remplissage(stats.cov_midi + stats.cov_soir, places.midi + places.soir) : null;
  const nbJardin = places.jardinMidi + places.jardinSoir;
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
              sous={cap.salle ? `midi ${rMidi != null ? pct(rMidi) : "—"} · soir ${rSoir != null ? pct(rSoir) : "—"} · ${cap.salle} places${cap.jardin ? `, +${cap.jardin} au jardin (ouvert ${nbJardin} service${nbJardin > 1 ? "s" : ""})` : ""}` : "capacités à renseigner dans Objectifs"} />
            <TuileVariation compacte={!bureau} icone="euro" libelle="Ticket moyen" valeur={euros(ticketMoyen(stats), 1)} actuel={ticketMoyen(stats)} precedent={prec ? ticketMoyen(prec) : null} sous="TTC par couvert sur place" />
          </div>

          {/* Midi, soir, à emporter en un coup d'œil (30/10/2026) */}
          <ResumeServices stats={stats} prec={prec} />

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
                      const joursDuNom = jours.filter((x) => x.jour.toLowerCase() === j.jour.toLowerCase());
                      const placesMidi = joursDuNom.reduce((t, x) => t + (x.covMidi > 0 ? capJour.get(x.date)?.midi ?? 0 : 0), 0);
                      const placesSoir = joursDuNom.reduce((t, x) => t + (x.covSoir > 0 ? capJour.get(x.date)?.soir ?? 0 : 0), 0);
                      const rm = remplissage(j.covMidi * j.n, placesMidi);
                      const rs = remplissage(j.covSoir * j.n, placesSoir);
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
                <Note>Remplissage = couverts ÷ places disponibles. Places : la salle à chaque service (clé capacite_salle, {cap.salle ?? "?"}), plus le jardin (capacite_jardin, {cap.jardin ?? "?"}) sur les services où la zone Terrasse de la caisse a servi. Réglage : <Link href="/settings/etablissements" style={{ color: "#D4775A" }}>Paramètres › Établissements</Link>. Vert ≥ 80 %, ambre ≥ 55 %.</Note>
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
          <div style={{ display: "grid", gridTemplateColumns: bureau ? "3fr 2fr" : "1fr", gap: 14, alignItems: "start" }}>
            <Cadre titre="Heures d'affluence" sous="CA TTC par heure d'ouverture des tickets, sur la période.">
              <GraphBarres format={(v) => euros(v)} etiquettes={Array.from({ length: 13 }, (_, i) => `${11 + i} h`)} libelleAxe="CA par heure"
                series={[{ libelle: "CA TTC", couleur: COULEUR_SOIR, valeurs: Array.from({ length: 13 }, (_, i) => stats.hourly_ttc?.[11 + i] ?? 0) }]} />
            </Cadre>
            <Cadre titre="Durée et rotation des tables" sous="Entre l'ouverture et la fermeture du ticket ; rotation : tickets par table et par service." sansMarge>
              <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 10 }}>
                <thead><tr><th style={{ ...TH, padding: 0, width: 6 }} /><th style={TH}>Zone</th><th style={{ ...TH, textAlign: "right" }}>Durée</th><th style={{ ...TH, textAlign: "right" }}>Rotation</th></tr></thead>
                <tbody>
                  {(stats.duration?.byZone ?? []).map((z) => {
                    const r = stats.duration?.rotByZone.find((x) => x.zone === z.zone);
                    return <tr key={z.zone}><td style={{ ...TD, width: 6, padding: 0, background: COULEUR_SOIR }} /><td style={{ ...TD, fontWeight: 600 }}>{z.zone}<div style={{ fontSize: 11.5, color: MUTED, fontWeight: 400 }}>{nombre(z.tables)} tables</div></td><td style={TDN}>{z.avgDur} min</td><td style={TDN}>{r ? `×${nombre(r.avgRotation, 1)}` : "—"}</td></tr>;
                  })}
                  {(stats.duration?.bySvc ?? []).map((s) => <tr key={s.svc}><td style={{ ...TD, width: 6, padding: 0 }} /><td style={{ ...TD, color: MUTED }}>{s.svc === "midi" ? "Midi" : "Soir"}</td><td style={{ ...TDN, color: MUTED }}>{s.avgDur} min</td><td style={TDN} /></tr>)}
                </tbody>
              </table>
              <div style={{ padding: "8px 16px 14px" }}><Note>En moyenne {stats.duration?.avgDurMin ?? 0} min par table, rotation ×{nombre(stats.duration?.avgRotation ?? 0, 1)} par service.</Note></div>
            </Cadre>
          </div>
        </>
      )}
      {chargement && !stats && <Chargement texte="Chargement des ventes…" />}
    </div>
  );
}
