"use client";

import { useEffect, useMemo, useState } from "react";
import { useEtabAuto } from "@/lib/useEtabAuto";
import { useEtablissement } from "@/lib/EtablissementContext";
import { usePilotageRange } from "@/lib/pilotageRange";
import { useBureau } from "@/hooks/useBureau";
import { fetchApi } from "@/lib/fetchApi";
import { EnteteAnalyse, TuileVariation, Cadre, Note, Chargement, TH, TD, TDN } from "@/components/analyse/Blocs";
import { GraphBarres } from "@/components/analyse/GraphBarres";
import { useStatsVentes } from "@/components/analyse/useStatsVentes";
import { parJour } from "@/components/analyse/parJour";
import { BLEU, FAIBLE, JOURS, MUTED, ROUGE, TERRACOTTA, VERT, derniersJours, euros, jourCourt, nombre, periodePrecedente, dateCourte } from "@/components/analyse/gabarit";
import type { HeuresJour } from "@/app/api/analyse/heures/route";
import { EtatVide } from "@/components/ui/EtatVide";

/**
 * Analyse › CA / personne (10/10/2026) : « L'équipe est-elle bien dimensionnée ? »
 * CA HT par heure planifiée (Combo), par jour, par jour de semaine et par équipe ; les journées
 * sur-staffées et sous-staffées. Sert à construire le planning de la semaine suivante.
 */
const COULEURS_EQUIPE: Record<string, string> = { Cuisine: "#D97706", Salle: "#5e8278", Bar: "#8a6b3e", Autre: "#b0a894" };

export function CaPersonne() {
  useEtabAuto();
  const bureau = useBureau();
  const { current: etab } = useEtablissement();
  const [range, setRange] = usePilotageRange(() => derniersJours(30));
  const { stats, prec, chargement: chargementVentes, erreur: erreurVentes } = useStatsVentes(range);
  const etabId = etab?.id ?? "";
  const [etat, setEtat] = useState<{ cle: string; jours: HeuresJour[]; joursPrec: HeuresJour[]; erreur: string | null }>({ cle: "", jours: [], joursPrec: [], erreur: null });
  const cle = `${etabId}|${range.from}|${range.to}`;
  useEffect(() => {
    if (!etabId) return;
    let annule = false;
    (async () => {
      const charge = async (from: string, to: string) => {
        const res = await fetchApi(`/api/analyse/heures?etablissement_id=${etabId}&from=${from}&to=${to}`);
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error ?? "Chargement impossible");
        return (j.jours ?? []) as HeuresJour[];
      };
      try {
        const p = periodePrecedente(range);
        const [jours, joursPrec] = await Promise.all([charge(range.from, range.to), charge(p.from, p.to).catch(() => [])]);
        if (!annule) setEtat({ cle, jours, joursPrec, erreur: null });
      } catch (e) { if (!annule) setEtat({ cle, jours: [], joursPrec: [], erreur: e instanceof Error ? e.message : "Chargement impossible" }); }
    })();
    return () => { annule = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);
  const chargement = chargementVentes || etat.cle !== cle;

  const ventes = useMemo(() => parJour(stats), [stats]);
  const ventesPrec = useMemo(() => parJour(prec), [prec]);
  // Une ligne par jour où il y a eu des ventes ou des heures
  const jours = useMemo(() => {
    const h = new Map(etat.jours.map((j) => [j.date, j]));
    const v = new Map(ventes.map((j) => [j.date, j]));
    const dates = [...new Set([...h.keys(), ...v.keys()])].sort();
    return dates.map((date) => {
      const hj = h.get(date), vj = v.get(date);
      const heures = hj?.heures ?? 0, ca = vj?.ht ?? 0, cov = vj?.cov ?? 0;
      return { date, jour: JOURS[(new Date(date + "T12:00:00").getDay() + 6) % 7], heures, ca, cov, personnes: hj?.personnes ?? 0, parEquipe: hj?.par_equipe ?? {}, caH: heures > 0 ? ca / heures : null, covH: heures > 0 ? cov / heures : null };
    });
  }, [etat.jours, ventes]);
  const total = (f: (j: (typeof jours)[number]) => number) => jours.reduce((t, j) => t + f(j), 0);
  const heures = total((j) => j.heures), ca = total((j) => j.ca), cov = total((j) => j.cov);
  const caH = heures > 0 ? ca / heures : 0;
  const heuresPrec = etat.joursPrec.reduce((t, j) => t + j.heures, 0), caPrec = ventesPrec.reduce((t, j) => t + j.ht, 0);
  const caHPrec = heuresPrec > 0 ? caPrec / heuresPrec : null;
  const joursOuverts = jours.filter((j) => j.ca > 0);
  const personnesJour = joursOuverts.length ? total((j) => j.personnes) / joursOuverts.length : 0;

  const semaine = useMemo(() => JOURS.map((nom) => {
    const liste = jours.filter((j) => j.jour === nom && (j.ca > 0 || j.heures > 0));
    const n = liste.length || 1;
    const h = liste.reduce((t, j) => t + j.heures, 0) / n, c = liste.reduce((t, j) => t + j.ca, 0) / n, cv = liste.reduce((t, j) => t + j.cov, 0) / n;
    return { jour: nom, n: liste.length, heures: h, ca: c, cov: cv, caH: h > 0 ? c / h : null, covH: h > 0 ? cv / h : null };
  }).filter((j) => j.n > 0), [jours]);
  const avecCaH = semaine.filter((j) => j.caH != null);
  const meilleur = avecCaH.length ? avecCaH.reduce((a, b) => ((b.caH ?? 0) > (a.caH ?? 0) ? b : a)) : null;
  const pire = avecCaH.length > 1 ? avecCaH.reduce((a, b) => ((b.caH ?? 0) < (a.caH ?? 0) ? b : a)) : null;

  const equipes = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of jours) for (const [e, h] of Object.entries(j.parEquipe)) m.set(e, (m.get(e) ?? 0) + h);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([equipe, h]) => ({ equipe, heures: h, part: heures ? (h / heures) * 100 : 0, caH: h > 0 ? ca / h : null }));
  }, [jours, heures, ca]);
  const journees = useMemo(() => jours.filter((j) => j.caH != null && j.ca > 0).sort((a, b) => (b.caH ?? 0) - (a.caH ?? 0)), [jours]);
  const couleurCaH = (v: number | null) => (v == null ? FAIBLE : caH && v >= caH * 1.1 ? VERT : caH && v <= caH * 0.85 ? ROUGE : "#1a1a1a");

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: bureau ? "18px 28px 60px" : "12px 14px 60px", display: "grid", gap: 14, alignContent: "start" }}>
      <EnteteAnalyse titre="CA / personne" question="L'équipe est-elle bien dimensionnée ? Le CA produit par heure planifiée, jour par jour, pour caler le prochain planning." range={range} onRange={setRange} />

      {(erreurVentes || etat.erreur) && <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(180,68,58,0.08)", color: ROUGE, fontSize: 13 }}>{erreurVentes ?? etat.erreur}</div>}
      {chargement && jours.length === 0 && <Chargement texte="Lecture du planning Combo et des ventes…" />}
      {!chargement && jours.length === 0 && !etat.erreur && <Cadre><EtatVide icone="equipe" titre="Aucune donnée sur cette période" texte="Il faut des ventes Popina et un planning Combo sur ces jours." /></Cadre>}

      {jours.length > 0 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: bureau ? "repeat(4, 1fr)" : "repeat(2, 1fr)", gap: bureau ? 10 : 8, opacity: chargement ? 0.6 : 1 }}>
            <TuileVariation compacte={!bureau} icone="euro" libelle="CA HT par heure" valeur={euros(caH, 0)} actuel={caH} precedent={caHPrec} sous="par heure planifiée, toutes équipes" />
            <TuileVariation compacte={!bureau} icone="couverts" couleur={BLEU} libelle="Heures planifiées" valeur={`${nombre(heures)} h`} actuel={heures} precedent={heuresPrec || null} inverse sous={`${nombre(personnesJour, 1)} personnes par jour ouvert`} />
            <TuileVariation compacte={!bureau} icone="ticket" libelle="Couverts par heure" valeur={heures ? nombre(cov / heures, 1) : "—"} actuel={heures ? cov / heures : 0} precedent={heuresPrec ? ventesPrec.reduce((t, j) => t + j.cov, 0) / heuresPrec : null} sous="couverts servis par heure de travail" />
            <TuileVariation compacte={!bureau} icone="produit" libelle="CA HT par jour" valeur={joursOuverts.length ? euros(ca / joursOuverts.length) : "—"} actuel={joursOuverts.length ? ca / joursOuverts.length : 0} precedent={ventesPrec.length ? caPrec / ventesPrec.length : null} sous={`${joursOuverts.length} jours ouverts`} />
          </div>

          <Cadre titre="CA par heure, jour par jour" sous="Barres : CA HT par heure planifiée. Courbe : heures planifiées. Une barre basse avec beaucoup d'heures, c'est un jour sur-staffé ; une barre haute, un jour tendu.">
            <GraphBarres format={(v) => nombre(v, 0)} etiquettes={jours.map((j) => jourCourt(j.date))} libelleAxe="CA HT par heure par jour"
              series={[{ libelle: "CA HT / heure (€)", couleur: TERRACOTTA, valeurs: jours.map((j) => j.caH ?? 0) }, { libelle: "Heures planifiées", couleur: BLEU, courbe: true, valeurs: jours.map((j) => j.heures) }]} />
          </Cadre>

          <div style={{ display: "grid", gridTemplateColumns: bureau ? "3fr 2fr" : "1fr", gap: 14 }}>
            <Cadre titre="Par jour de semaine" sous="Moyennes sur la période : combien d'heures pour combien de CA." sansMarge
              droite={meilleur && pire && meilleur !== pire ? <div style={{ fontSize: 12.5, color: MUTED }}>Plus productif <b style={{ color: VERT }}>{meilleur.jour}</b> · le moins <b style={{ color: ROUGE }}>{pire.jour}</b></div> : undefined}>
              <div style={{ overflowX: "auto", marginTop: 10 }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead><tr><th style={TH}>Jour</th><th style={{ ...TH, textAlign: "right" }}>CA HT</th><th style={{ ...TH, textAlign: "right" }}>Heures</th><th style={{ ...TH, textAlign: "right" }}>CA / h</th>{bureau && <th style={{ ...TH, textAlign: "right" }}>Couverts / h</th>}</tr></thead>
                  <tbody>
                    {semaine.map((j) => (
                      <tr key={j.jour}>
                        <td style={{ ...TD, fontWeight: 700 }}>{j.jour} <span style={{ color: FAIBLE, fontWeight: 500 }}>×{j.n}</span></td>
                        <td style={TDN}>{euros(j.ca)}</td>
                        <td style={TDN}>{nombre(j.heures, 0)} h</td>
                        <td style={{ ...TDN, fontWeight: 700, color: couleurCaH(j.caH) }}>{j.caH != null ? euros(j.caH) : "—"}</td>
                        {bureau && <td style={TDN}>{j.covH != null ? nombre(j.covH, 1) : "—"}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: "10px 16px 14px" }}><Note>Vert : au moins 10 % au-dessus de la moyenne de la période ({euros(caH)} / h) ; rouge : 15 % en dessous. Heures : planning Combo (planifié, pas pointé), pauses déduites.</Note></div>
            </Cadre>
            <Cadre titre="Par équipe" sous="Répartition des heures planifiées et CA produit par heure de chaque équipe.">
              {equipes.map((e) => (
                <div key={e.equipe} style={{ padding: "7px 0", borderBottom: "1px solid #f0ebe2" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ fontWeight: 600, color: COULEURS_EQUIPE[e.equipe] ?? "#1a1a1a" }}>{e.equipe}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{nombre(e.heures, 0)} h <span style={{ color: MUTED }}>· {nombre(e.part)} %</span>{e.caH != null && <span style={{ color: MUTED }}> · {euros(e.caH)} / h</span>}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: "#f0ebe3", marginTop: 5, overflow: "hidden" }}><div style={{ width: `${e.part}%`, height: "100%", background: COULEURS_EQUIPE[e.equipe] ?? "#b0a894", borderRadius: 3 }} /></div>
                </div>
              ))}
              {equipes.length === 0 && <div style={{ color: FAIBLE, fontSize: 13 }}>Pas d&apos;heures planifiées dans Combo sur la période.</div>}
            </Cadre>
          </div>

          {journees.length >= 4 && (
            <div style={{ display: "grid", gridTemplateColumns: bureau ? "1fr 1fr" : "1fr", gap: 14 }}>
              {[{ titre: "Journées les plus tendues", sous: "Beaucoup de CA par heure : peut-être renforcer.", liste: journees.slice(0, 5), couleur: VERT }, { titre: "Journées sur-staffées", sous: "Peu de CA par heure : alléger le planning ces jours-là.", liste: [...journees].reverse().slice(0, 5), couleur: ROUGE }].map((b) => (
                <Cadre key={b.titre} titre={b.titre} sous={b.sous}>
                  {b.liste.map((j) => (
                    <div key={j.date} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", borderBottom: "1px solid #f0ebe2", fontSize: 13 }}>
                      <span><b>{j.jour}</b> <span style={{ color: MUTED }}>{dateCourte(j.date)}</span></span>
                      <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{euros(j.ca)} · {nombre(j.heures, 0)} h · <b style={{ color: b.couleur }}>{euros(j.caH ?? 0)} / h</b></span>
                    </div>
                  ))}
                </Cadre>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
