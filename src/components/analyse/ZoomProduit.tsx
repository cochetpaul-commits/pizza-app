"use client";

import { useEffect, useState } from "react";
import { VoletDroit } from "@/components/produits/BaseProduits";
import { fetchApi } from "@/lib/fetchApi";
import { GraphBarres } from "@/components/analyse/GraphBarres";
import { Cadre, TH, TD, TDN, TuileVariation } from "@/components/analyse/Blocs";
import { COULEUR_MIDI, COULEUR_SOIR, LIBELLE_VS, MUTED, euros, nombre, pct, periodeAnDernier, periodePrecedente } from "@/components/analyse/gabarit";
import { usePilotageComparaison } from "@/lib/pilotageRange";
import { getCategoryColor } from "@/lib/categoryColors";
import { stylePastilleBarre } from "@/lib/styleCategories";
import type { DateRange } from "@/components/ui/DateRangePicker";
import type { DetailProduit } from "@/lib/analyse/produitsPeriode";

/**
 * Zoom sur un produit (30/10/2026) : combien il s'est vendu, quand (jour, semaine ou mois selon la période),
 * à quel service, quel jour de la semaine. Ouvert d'un clic sur une ligne de Par produit.
 */
export function ZoomProduit({ nom, etabId, periode, bureau, onFermer }: { nom: string; etabId: string; periode: DateRange; bureau: boolean; onFermer: () => void }) {
  // État par clé (produit + période) : changer de produit n'affiche jamais le précédent
  // Comparaison : même réglage que les pages Pilotage (période juste avant, ou mêmes dates l'an dernier)
  const [mode] = usePilotageComparaison();
  const avant = mode === "an_dernier" ? periodeAnDernier(periode) : periodePrecedente(periode);
  const cle = `${nom}|${etabId}|${periode.from}|${periode.to}|${mode}`;
  const [etat, setEtatBrut] = useState<{ cle: string; d: DetailProduit | null; p: DetailProduit | null; erreur: string | null }>({ cle: "", d: null, p: null, erreur: null });
  const setEtat = (v: { d: DetailProduit | null; p: DetailProduit | null; erreur: string | null }) => setEtatBrut({ cle, ...v });
  useEffect(() => {
    let annule = false;
    const lire = (r: DateRange) => fetchApi(`/api/ventes/produits?etablissement_id=${etabId}&from=${r.from}&to=${r.to}&produit=${encodeURIComponent(nom)}`)
      .then(async (x) => ({ ok: x.ok, j: await x.json().catch(() => ({})) }));
    Promise.all([lire(periode), lire(avant).catch(() => ({ ok: false, j: {} }))]).then(([a, b]) => {
      if (annule) return;
      if (!a.ok) { setEtat({ d: null, p: null, erreur: a.j?.error ?? "Chargement impossible" }); return; }
      setEtat({ d: a.j.detail as DetailProduit, p: b.ok ? (b.j.detail as DetailProduit) : null, erreur: null });
    }).catch((e) => { if (!annule) setEtat({ d: null, p: null, erreur: e instanceof Error ? e.message : "Chargement impossible" }); });
    return () => { annule = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);
  const d = etat.cle === cle ? etat.d : null;
  const p = etat.cle === cle ? etat.p : null;
  const erreur = etat.cle === cle ? etat.erreur : null;
  // Produit absent de la période d'avant : comparé à zéro
  const prec = (f: (x: DetailProduit) => number) => (p ? f(p) : 0);
  const couleur = d ? getCategoryColor(d.cat) : "#1a1a1a";
  const partMidi = d && d.qty ? (d.midi_qty / d.qty) * 100 : 0;
  const pasLibelle = d ? (d.tendance.cles.length && d.tendance.cles[0].length === 7 ? "mois" : d.tendance.etiquettes[0]?.startsWith("sem.") ? "semaine" : "jour") : "jour";
  return (
    <VoletDroit titre={nom} sousTitre={d ? <span style={stylePastilleBarre(couleur)}>{d.cat}</span> : "Chargement…"} largeur={720} onFermer={onFermer}>
      {erreur && <div style={{ padding: 14, color: "#b4443a", fontSize: 13 }}>{erreur}</div>}
      {d && (
        <div style={{ display: "grid", gap: 14, padding: bureau ? 0 : "0 2px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <TuileVariation compacte icone="produit" couleur={couleur} libelle="Vendus" valeur={nombre(d.qty)} actuel={d.qty} precedent={prec((x) => x.qty)} sous={`${d.jours_vendu} j. sur ${d.jours_ouverts} ouverts · ${d.jours_ouverts ? nombre(d.qty / d.jours_ouverts, 1) : "—"} par jour`} />
            <TuileVariation compacte icone="euro" libelle="CA HT" valeur={euros(d.ht)} actuel={d.ht} precedent={prec((x) => x.ht)} sous={d.qty ? `${euros(d.ht / d.qty, 2)} HT l'unité` : ""} />
            <TuileVariation compacte icone="ticket" couleur={COULEUR_MIDI} libelle="Midi" valeur={nombre(d.midi_qty)} actuel={d.midi_qty} precedent={prec((x) => x.midi_qty)} sous={pct(partMidi)} />
            <TuileVariation compacte icone="ticket" couleur={COULEUR_SOIR} libelle="Soir" valeur={nombre(d.soir_qty)} actuel={d.soir_qty} precedent={prec((x) => x.soir_qty)} sous={pct(100 - partMidi)} />
          </div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: -6 }}>{LIBELLE_VS[mode]} ({new Date(avant.from + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} – {new Date(avant.to + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}){p ? ` : ${nombre(p.qty)} vendus, ${euros(p.ht)} HT` : " : pas de vente de ce produit"}</div>
          <Cadre titre="Dans le temps" sous={`Par ${pasLibelle}, midi et soir empilés.`}>
            <GraphBarres empile sansValeurs={d.tendance.cles.length > 12} format={(v) => nombre(v)} etiquettes={d.tendance.etiquettes} libelleAxe={`${nom} par ${pasLibelle}`}
              series={[
                { libelle: "Midi", couleur: COULEUR_MIDI, valeurs: d.tendance.midi },
                { libelle: "Soir", couleur: COULEUR_SOIR, valeurs: d.tendance.soir },
                // La période d'avant en courbe, point par point (même nombre de pas : la comparaison porte sur autant de jours)
                ...(p && p.tendance.cles.length === d.tendance.cles.length ? [{ libelle: mode === "an_dernier" ? "N−1" : "Avant", couleur: "#1a1a1a", courbe: true, valeurs: p.tendance.midi.map((v, i) => v + p.tendance.soir[i]) }] : []),
              ]} />
          </Cadre>
          <Cadre titre="Par jour de la semaine" sous="Sur toute la période choisie." sansMarge>
            <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 10 }}>
              <thead><tr><th style={TH}>Jour</th><th style={{ ...TH, textAlign: "right", color: COULEUR_MIDI }}>Midi</th><th style={{ ...TH, textAlign: "right", color: COULEUR_SOIR }}>Soir</th><th style={{ ...TH, textAlign: "right" }}>Total</th></tr></thead>
              <tbody>
                {d.semaine.map((j) => {
                  const t = j.midi + j.soir, max = Math.max(1, ...d.semaine.map((x) => x.midi + x.soir));
                  return (
                    <tr key={j.jour}>
                      <td style={{ ...TD, fontWeight: 600 }}>{j.jour}<div style={{ height: 4, borderRadius: 2, background: "#f0ebe3", marginTop: 4, overflow: "hidden", maxWidth: 220 }}><div style={{ width: `${(t / max) * 100}%`, height: "100%", background: couleur }} /></div></td>
                      <td style={{ ...TDN, color: t ? "#1a1a1a" : MUTED }}>{j.midi ? nombre(j.midi) : "—"}</td>
                      <td style={{ ...TDN, color: t ? "#1a1a1a" : MUTED }}>{j.soir ? nombre(j.soir) : "—"}</td>
                      <td style={{ ...TDN, fontWeight: 700 }}>{t ? nombre(t) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Cadre>
        </div>
      )}
    </VoletDroit>
  );
}
