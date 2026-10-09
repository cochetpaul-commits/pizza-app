"use client";

import { useMemo } from "react";
import { useEtabAuto } from "@/lib/useEtabAuto";
import { usePilotageRange } from "@/lib/pilotageRange";
import { useBureau } from "@/hooks/useBureau";
import { EnteteAnalyse, TuileVariation, Cadre, Note, Chargement, TH, TD, TDN } from "@/components/analyse/Blocs";
import { GraphBarres } from "@/components/analyse/GraphBarres";
import { ticketMoyen, useStatsVentes } from "@/components/analyse/useStatsVentes";
import { parJour, parJourSemaine } from "@/components/analyse/parJour";
import { COULEUR_EMPORTER, COULEUR_MIDI, COULEUR_SOIR, FAIBLE, MUTED, ROUGE, VERT, derniersJours, euros, jourCourt, nombre, pct } from "@/components/analyse/gabarit";
import { EtatVide } from "@/components/ui/EtatVide";

/**
 * Analyse › Chiffre d'affaires (10/10/2026) : « Comment se porte le CA ? »
 * Tuiles avec variation, CA par jour (midi, soir, à emporter) face à la période précédente,
 * moyennes par jour de semaine, ventilation TTC / HT / TVA. Source : ventes Popina.
 */
export function ChiffreAffaires() {
  useEtabAuto();
  const bureau = useBureau();
  const [range, setRange] = usePilotageRange(() => derniersJours(30));
  const { stats, prec, chargement, erreur } = useStatsVentes(range);
  const jours = useMemo(() => parJour(stats), [stats]);
  const joursPrec = useMemo(() => parJour(prec), [prec]);
  const semaine = useMemo(() => parJourSemaine(jours), [jours]);

  const midi = jours.reduce((t, j) => t + j.midi, 0), soir = jours.reduce((t, j) => t + j.soir, 0);
  const midiPrec = joursPrec.reduce((t, j) => t + j.midi, 0), soirPrec = joursPrec.reduce((t, j) => t + j.soir, 0);
  const meilleur = semaine.length ? semaine.reduce((a, b) => (b.ht > a.ht ? b : a)) : null;
  const pire = semaine.length > 1 ? semaine.reduce((a, b) => (b.ht < a.ht ? b : a)) : null;
  const tva = stats ? stats.ca_ttc - stats.ca_ht : 0;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: bureau ? "18px 28px 60px" : "12px 14px 60px", display: "grid", gap: 14, alignContent: "start" }}>
      <EnteteAnalyse titre="Chiffre d'affaires" question="Comment se porte le CA ? Ce qui rentre, par service et par jour, face aux jours d'avant." range={range} onRange={setRange} />

      {erreur && <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(180,68,58,0.08)", color: ROUGE, fontSize: 13 }}>{erreur}</div>}
      {!erreur && !stats && !chargement && <Cadre><EtatVide icone="ventes" titre="Aucune vente sur cette période" texte="Les ventes Popina de la période ne sont pas encore importées." /></Cadre>}

      {stats && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: bureau ? "repeat(5, 1fr)" : "repeat(2, 1fr)", gap: bureau ? 10 : 8, opacity: chargement ? 0.6 : 1 }}>
            <TuileVariation compacte={!bureau} icone="euro" libelle="CA HT" valeur={euros(stats.ca_ht)} actuel={stats.ca_ht} precedent={prec?.ca_ht} sous={`${euros(stats.ca_ttc)} TTC`} />
            <TuileVariation compacte={!bureau} icone="ticket" couleur={COULEUR_MIDI} libelle="Midi" valeur={euros(midi)} actuel={midi} precedent={midiPrec} sous={stats.ca_ht ? `${pct((midi / stats.ca_ht) * 100)} du CA` : undefined} />
            <TuileVariation compacte={!bureau} icone="ticket" couleur={COULEUR_SOIR} libelle="Soir" valeur={euros(soir)} actuel={soir} precedent={soirPrec} sous={stats.ca_ht ? `${pct((soir / stats.ca_ht) * 100)} du CA` : undefined} />
            <TuileVariation compacte={!bureau} icone="camion" couleur={COULEUR_EMPORTER} libelle="À emporter" valeur={euros(stats.place_emp_ht)} actuel={stats.place_emp_ht} precedent={prec?.place_emp_ht} sous={stats.ca_ht ? `${pct((stats.place_emp_ht / stats.ca_ht) * 100)} du CA` : undefined} />
            <TuileVariation compacte={!bureau} icone="couverts" libelle="Ticket moyen" valeur={euros(ticketMoyen(stats), 1)} actuel={ticketMoyen(stats)} precedent={prec ? ticketMoyen(prec) : null} sous="TTC par couvert sur place" />
          </div>

          <Cadre titre="CA par jour" sous="Hors taxes : midi, soir et à emporter empilés ; la courbe grise est la période précédente, jour pour jour.">
            {chargement ? <Chargement /> : (
              <GraphBarres empile format={(v) => euros(v)} etiquettes={jours.map((j) => jourCourt(j.date))} libelleAxe="CA HT par jour"
                series={[
                  { libelle: "Midi", couleur: COULEUR_MIDI, valeurs: jours.map((j) => j.midi) },
                  { libelle: "Soir", couleur: COULEUR_SOIR, valeurs: jours.map((j) => j.soir) },
                  { libelle: "À emporter", couleur: COULEUR_EMPORTER, valeurs: jours.map((j) => j.emporter) },
                  ...(joursPrec.length ? [{ libelle: "Période précédente", couleur: "#b8b0a3", courbe: true, valeurs: jours.map((_, i) => joursPrec[i]?.ht ?? 0) }] : []),
                ]} />
            )}
          </Cadre>

          <Cadre titre="Par jour de semaine" sous="Moyenne par jour ouvert sur la période : où sont les jours forts et les jours faibles."
            droite={meilleur && pire && meilleur !== pire ? <div style={{ fontSize: 12.5, color: MUTED }}>Meilleur jour <b style={{ color: VERT }}>{meilleur.jour}</b> · plus faible <b style={{ color: ROUGE }}>{pire.jour}</b></div> : undefined} sansMarge>
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr><th style={TH}>Jour</th><th style={{ ...TH, textAlign: "right" }}>Jours</th><th style={{ ...TH, textAlign: "right" }}>Midi</th><th style={{ ...TH, textAlign: "right" }}>Soir</th>{bureau && <th style={{ ...TH, textAlign: "right" }}>À emporter</th>}<th style={{ ...TH, textAlign: "right" }}>CA HT / jour</th>{bureau && <th style={{ ...TH, textAlign: "right" }}>Couverts</th>}<th style={{ ...TH, textAlign: "right" }}>Part</th></tr></thead>
                <tbody>
                  {semaine.map((j) => {
                    const total = semaine.reduce((t, x) => t + x.ht * x.n, 0);
                    const couleur = j === meilleur ? VERT : j === pire ? ROUGE : "#1a1a1a";
                    return (
                      <tr key={j.jour}>
                        <td style={{ ...TD, fontWeight: 700, color: couleur }}>{j.jour}</td>
                        <td style={{ ...TDN, color: MUTED }}>{j.n}</td>
                        <td style={TDN}>{euros(j.midi)}</td>
                        <td style={TDN}>{euros(j.soir)}</td>
                        {bureau && <td style={TDN}>{euros(j.emporter)}</td>}
                        <td style={{ ...TDN, fontWeight: 700, color: couleur }}>{euros(j.ht)}</td>
                        {bureau && <td style={TDN}>{nombre(j.cov)}</td>}
                        <td style={{ ...TDN, color: MUTED }}>{total ? pct((j.ht * j.n / total) * 100) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Cadre>

          <div style={{ display: "grid", gridTemplateColumns: bureau ? "1fr 1fr" : "1fr", gap: 14 }}>
            <Cadre titre="Ventilation TTC, HT et TVA" sous="Seul le hors taxes est un revenu : c'est la base des ratios matière et masse salariale.">
              <Lignes lignes={[["Encaissé (TTC)", euros(stats.ca_ttc)], ["Chiffre d'affaires (HT)", euros(stats.ca_ht), true], ["TVA collectée", euros(tva)], ["Tickets", nombre(stats.tickets)], ["Panier moyen TTC par ticket", stats.tickets ? euros(stats.ca_ttc / stats.tickets, 1) : "—"]]} />
            </Cadre>
            <Cadre titre="Nourriture et boissons" sous="Répartition du CA HT, et ce que chaque couvert dépense.">
              <Lignes lignes={[["Nourriture (HT)", `${euros(stats.food_ht)} · ${stats.ca_ht ? pct((stats.food_ht / stats.ca_ht) * 100) : "—"}`], ["Boissons (HT)", `${euros(stats.drink_ht)} · ${stats.ca_ht ? pct((stats.drink_ht / stats.ca_ht) * 100) : "—"}`], ["Sur place (HT)", euros(stats.place_sur_ht), true], ["À emporter (HT)", euros(stats.place_emp_ht)], ["Dépense moyenne par couvert (HT)", stats.cov_sur ? euros(stats.place_sur_ht / stats.cov_sur, 1) : "—"]]} />
              <Note>Ventes Popina de la période, hors lignes annulées. Midi et soir : service de la caisse ; à emporter : ventes sans table.</Note>
            </Cadre>
          </div>
        </>
      )}
      {chargement && !stats && <Chargement texte="Chargement des ventes…" />}
    </div>
  );
}

function Lignes({ lignes }: { lignes: [string, string, boolean?][] }) {
  return (
    <div>
      {lignes.map(([l, v, fort]) => (
        <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", borderBottom: "1px solid #f0ebe2", fontSize: 13 }}>
          <span style={{ color: fort ? "#1a1a1a" : MUTED, fontWeight: fort ? 700 : 500 }}>{l}</span>
          <span style={{ fontWeight: fort ? 700 : 600, fontVariantNumeric: "tabular-nums", color: v === "—" ? FAIBLE : "#1a1a1a" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}
