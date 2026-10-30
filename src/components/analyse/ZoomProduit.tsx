"use client";

import { useEffect, useState } from "react";
import { VoletDroit } from "@/components/produits/BaseProduits";
import { fetchApi } from "@/lib/fetchApi";
import { GraphBarres } from "@/components/analyse/GraphBarres";
import { Cadre, TH, TD, TDN } from "@/components/analyse/Blocs";
import { Tuile } from "@/components/ui/Tuile";
import { COULEUR_MIDI, COULEUR_SOIR, MUTED, euros, nombre, pct } from "@/components/analyse/gabarit";
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
  const cle = `${nom}|${etabId}|${periode.from}|${periode.to}`;
  const [etat, setEtatBrut] = useState<{ cle: string; d: DetailProduit | null; erreur: string | null }>({ cle: "", d: null, erreur: null });
  const setEtat = (v: { d: DetailProduit | null; erreur: string | null }) => setEtatBrut({ cle, ...v });
  useEffect(() => {
    let annule = false;
    fetchApi(`/api/ventes/produits?etablissement_id=${etabId}&from=${periode.from}&to=${periode.to}&produit=${encodeURIComponent(nom)}`).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (annule) return;
      if (!r.ok) { setEtat({ d: null, erreur: j?.error ?? "Chargement impossible" }); return; }
      setEtat({ d: j.detail as DetailProduit, erreur: null });
    }).catch((e) => { if (!annule) setEtat({ d: null, erreur: e instanceof Error ? e.message : "Chargement impossible" }); });
    return () => { annule = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);
  const d = etat.cle === cle ? etat.d : null;
  const erreur = etat.cle === cle ? etat.erreur : null;
  const couleur = d ? getCategoryColor(d.cat) : "#1a1a1a";
  const partMidi = d && d.qty ? (d.midi_qty / d.qty) * 100 : 0;
  const pasLibelle = d ? (d.tendance.cles.length && d.tendance.cles[0].length === 7 ? "mois" : d.tendance.etiquettes[0]?.startsWith("sem.") ? "semaine" : "jour") : "jour";
  return (
    <VoletDroit titre={nom} sousTitre={d ? <span style={stylePastilleBarre(couleur)}>{d.cat}</span> : "Chargement…"} largeur={720} onFermer={onFermer}>
      {erreur && <div style={{ padding: 14, color: "#b4443a", fontSize: 13 }}>{erreur}</div>}
      {d && (
        <div style={{ display: "grid", gap: 14, padding: bureau ? 0 : "0 2px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Tuile compacte icone="produit" couleur={couleur} libelle="Vendus" valeur={nombre(d.qty)} sous={`${d.jours_vendu} jour${d.jours_vendu > 1 ? "s" : ""} sur ${d.jours_ouverts} ouvert${d.jours_ouverts > 1 ? "s" : ""} · ${d.jours_ouverts ? nombre(d.qty / d.jours_ouverts, 1) : "—"} par jour`} />
            <Tuile compacte icone="euro" libelle="CA HT" valeur={euros(d.ht)} sous={d.qty ? `${euros(d.ht / d.qty, 2)} HT l'unité` : ""} />
            <Tuile compacte icone="ticket" couleur={COULEUR_MIDI} libelle="Midi" valeur={nombre(d.midi_qty)} sous={pct(partMidi)} />
            <Tuile compacte icone="ticket" couleur={COULEUR_SOIR} libelle="Soir" valeur={nombre(d.soir_qty)} sous={pct(100 - partMidi)} />
          </div>
          <Cadre titre="Dans le temps" sous={`Par ${pasLibelle}, midi et soir empilés.`}>
            <GraphBarres empile sansValeurs={d.tendance.cles.length > 12} format={(v) => nombre(v)} etiquettes={d.tendance.etiquettes} libelleAxe={`${nom} par ${pasLibelle}`}
              series={[{ libelle: "Midi", couleur: COULEUR_MIDI, valeurs: d.tendance.midi }, { libelle: "Soir", couleur: COULEUR_SOIR, valeurs: d.tendance.soir }]} />
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
