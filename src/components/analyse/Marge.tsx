"use client";

import { useEffect, useMemo, useState } from "react";
import type { DateRange } from "@/components/ui/DateRangePicker";
import { useEtabAuto } from "@/lib/useEtabAuto";
import { useEtablissement } from "@/lib/EtablissementContext";
import { usePilotageRange } from "@/lib/pilotageRange";
import { useBureau } from "@/hooks/useBureau";
import { fetchApi } from "@/lib/fetchApi";
import { EnteteAnalyse, TuileVariation, Cadre, Note, Chargement, TH, TD, TDN } from "@/components/analyse/Blocs";
import { GraphBarres } from "@/components/analyse/GraphBarres";
import { AMBRE, BLEU, FAIBLE, MUTED, ROUGE, TERRACOTTA, VERT, derniersMois, euros, libelleMois, libelleMoisLong, pct, variation, texteVariation } from "@/components/analyse/gabarit";
import type { MoisMarge } from "@/app/api/analyse/marge/route";
import { EtatVide } from "@/components/ui/EtatVide";
import Link from "next/link";

/**
 * Analyse › Marge (10/10/2026) : « Que reste-t-il ? »
 * Mois par mois : CA HT, achats matières, masse salariale, rémunération des gérants, charges
 * d'exploitation (Pennylane), marge brute et EBE avec leurs ratios face aux objectifs.
 */
type Reponse = { mois: MoisMarge[]; libelles: Record<string, string>; postes_exploitation: string[]; objectifs: Record<string, number> };
type Ligne = { mois: string; clos: boolean; ca: number; achats: number; ms: number; gerants: number; exploitation: number; margeBrute: number; ebe: number; postes: Record<string, number> };

export function Marge() {
  useEtabAuto();
  const bureau = useBureau();
  const { current: etab } = useEtablissement();
  const [range, setRange] = usePilotageRange(() => derniersMois(6));
  const etabId = etab?.id ?? "";
  const [etat, setEtat] = useState<{ cle: string; donnees: Reponse | null; erreur: string | null }>({ cle: "", donnees: null, erreur: null });
  const cle = `${etabId}|${range.from}|${range.to}`;
  useEffect(() => {
    if (!etabId) return;
    let annule = false;
    (async () => {
      try {
        const res = await fetchApi(`/api/analyse/marge?etablissement_id=${etabId}&from=${range.from}&to=${range.to}`);
        const j = await res.json();
        if (annule) return;
        if (!res.ok) { setEtat({ cle, donnees: null, erreur: j?.error ?? "Chargement impossible" }); return; }
        setEtat({ cle, donnees: j as Reponse, erreur: null });
      } catch (e) { if (!annule) setEtat({ cle, donnees: null, erreur: e instanceof Error ? e.message : "Chargement impossible" }); }
    })();
    return () => { annule = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);
  const chargement = etat.cle !== cle;
  const donnees = etat.donnees;

  const lignes = useMemo<Ligne[]>(() => {
    if (!donnees) return [];
    const expl = new Set(donnees.postes_exploitation);
    return donnees.mois.map((m) => {
      const p = m.postes;
      const achats = p.achats_matieres ?? 0, ms = p.masse_salariale ?? 0, gerants = p.remuneration_gerants ?? 0;
      const exploitation = Object.entries(p).filter(([k]) => expl.has(k)).reduce((t, [, v]) => t + v, 0);
      const margeBrute = m.ca_ht - achats;
      return { mois: m.mois, clos: m.clos, ca: m.ca_ht, achats, ms, gerants, exploitation, margeBrute, ebe: margeBrute - ms - gerants - exploitation, postes: p };
    });
  }, [donnees]);
  // Mois de référence : le dernier mois clos avec du CA et des charges (le mois en cours est partiel)
  const reference = useMemo(() => [...lignes].reverse().find((l) => l.clos && l.ca > 0 && (l.achats > 0 || l.ms > 0)) ?? lignes[lignes.length - 1] ?? null, [lignes]);
  const precedent = useMemo(() => (reference ? lignes[lignes.indexOf(reference) - 1] ?? null : null), [lignes, reference]);
  const objMs = donnees?.objectifs.ratio_masse_sal ?? null;
  const ratio = (v: number, ca: number) => (ca > 0 ? (v / ca) * 100 : null);
  const couleurRatio = (r: number | null, bon: number, moyen: number) => (r == null ? undefined : r <= bon ? VERT : r <= moyen ? AMBRE : ROUGE);
  const raccourcis: { libelle: string; r: DateRange }[] = [{ libelle: "3 mois", r: derniersMois(3) }, { libelle: "6 mois", r: derniersMois(6) }, { libelle: "12 mois", r: derniersMois(12) }];
  const nbMois = lignes.length;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: bureau ? "18px 28px 60px" : "12px 14px 60px", display: "grid", gap: 14, alignContent: "start" }}>
      <EnteteAnalyse titre="Marge" question="Que reste-t-il ? Du CA à l'EBE, mois par mois, avec les achats, la masse salariale et les charges réellement passées." range={range} onRange={setRange}
        raccourcis={raccourcis} comparaison={`${nbMois} mois · référence : ${reference ? libelleMoisLong(reference.mois) : "—"}`} />

      {etat.erreur && <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(180,68,58,0.08)", color: ROUGE, fontSize: 13 }}>{etat.erreur}</div>}
      {chargement && !donnees && <Chargement texte="Chargement des charges…" />}
      {donnees && lignes.every((l) => l.ca === 0) && <Cadre><EtatVide icone="ventes" titre="Aucune vente sur ces mois" texte="Choisissez une période où les ventes Popina sont importées." /></Cadre>}

      {reference && reference.ca > 0 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: bureau ? "repeat(4, 1fr)" : "repeat(2, 1fr)", gap: bureau ? 10 : 8, opacity: chargement ? 0.6 : 1 }}>
            <TuileVariation compacte={!bureau} icone="euro" libelle={`CA HT · ${libelleMois(reference.mois)}`} valeur={euros(reference.ca)} actuel={reference.ca} precedent={precedent?.ca} sous="ventes Popina" />
            <TuileVariation compacte={!bureau} icone="foodcost" couleur={couleurRatio(ratio(reference.achats, reference.ca), 32, 38)} libelle="Marge brute" valeur={reference.achats > 0 ? pct(100 - (ratio(reference.achats, reference.ca) ?? 0)) : "—"} actuel={reference.margeBrute} precedent={precedent?.margeBrute}
              sous={reference.achats > 0 ? `${euros(reference.margeBrute)} · matière ${pct(ratio(reference.achats, reference.ca) ?? 0)} du CA` : "achats matières non importés"} />
            <TuileVariation compacte={!bureau} icone="couverts" couleur={couleurRatio(ratio(reference.ms, reference.ca), objMs ?? 35, (objMs ?? 35) + 8)} libelle="Masse salariale" valeur={reference.ms > 0 ? pct(ratio(reference.ms, reference.ca) ?? 0) : "—"} actuel={reference.ms} precedent={precedent?.ms} inverse
              sous={`${euros(reference.ms)}${objMs ? ` · objectif ≤ ${pct(objMs)}` : ""}${reference.gerants ? ` · gérants ${euros(reference.gerants)}` : ""}`} />
            <TuileVariation compacte={!bureau} icone="ticket" couleur={reference.ebe >= 0 ? VERT : ROUGE} libelle="EBE estimé" valeur={euros(reference.ebe)} actuel={reference.ebe} precedent={precedent?.ebe} sous={`${pct(ratio(reference.ebe, reference.ca) ?? 0)} du CA · avant amortissements et impôts`} />
          </div>

          <Cadre titre="Où va le chiffre d'affaires" sous="Par mois : achats matières, masse salariale, gérants et charges d'exploitation empilés ; la courbe est le CA HT. Ce qui dépasse la courbe est perdu, ce qui reste dessous est l'EBE.">
            <GraphBarres empile format={(v) => euros(v)} etiquettes={lignes.map((l) => libelleMois(l.mois))} libelleAxe="Charges par mois face au CA"
              series={[
                { libelle: "Achats matières", couleur: TERRACOTTA, valeurs: lignes.map((l) => l.achats) },
                { libelle: "Masse salariale", couleur: BLEU, valeurs: lignes.map((l) => l.ms) },
                { libelle: "Gérants", couleur: "#7c8fb8", valeurs: lignes.map((l) => l.gerants) },
                { libelle: "Exploitation", couleur: "#b8b0a3", valeurs: lignes.map((l) => l.exploitation) },
                { libelle: "CA HT", couleur: "#1a1a1a", courbe: true, valeurs: lignes.map((l) => l.ca) },
              ]} />
          </Cadre>

          <Cadre titre="Mois par mois" sous="Ratios sur le CA HT. Objectifs : matière ≤ 32 %, masse salariale ≤ objectif de l'établissement. Le mois en cours est partiel." sansMarge>
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr>
                  <th style={TH}>Mois</th><th style={{ ...TH, textAlign: "right" }}>CA HT</th><th style={{ ...TH, textAlign: "right" }}>{bureau ? "Matière" : "Mat."}</th>
                  {bureau && <th style={{ ...TH, textAlign: "right" }}>Marge brute</th>}{bureau && <th style={{ ...TH, textAlign: "right" }}>Masse sal.</th>}{bureau && <th style={{ ...TH, textAlign: "right" }}>Gérants</th>}{bureau && <th style={{ ...TH, textAlign: "right" }}>Exploit.</th>}<th style={{ ...TH, textAlign: "right" }}>EBE</th>
                </tr></thead>
                <tbody>
                  {lignes.map((l) => {
                    const rm = ratio(l.achats, l.ca), rs = ratio(l.ms, l.ca), re = ratio(l.ebe, l.ca);
                    const vide = l.ca === 0;
                    return (
                      <tr key={l.mois} style={{ background: l === reference ? "rgba(212,119,90,0.06)" : undefined, opacity: vide ? 0.5 : 1 }}>
                        <td style={{ ...TD, fontWeight: 700 }}>{libelleMoisLong(l.mois)}{!l.clos && <span style={{ color: FAIBLE, fontWeight: 500 }}> · en cours</span>}</td>
                        <td style={{ ...TDN, fontWeight: 600 }}>{vide ? "—" : euros(l.ca)}</td>
                        <td style={TDN}>{l.achats ? <>{bureau && euros(l.achats)} <span style={{ color: couleurRatio(rm, 32, 38) ?? MUTED, fontWeight: 600 }}>{pct(rm ?? 0)}</span>{!bureau && l.ms ? <div style={{ fontSize: 11, color: MUTED }}>MS {pct(rs ?? 0)}</div> : null}</> : <span style={{ color: FAIBLE }}>—</span>}</td>
                        {bureau && <td style={TDN}>{l.achats ? <>{euros(l.margeBrute)} <span style={{ color: MUTED }}>{pct(100 - (rm ?? 0))}</span></> : <span style={{ color: FAIBLE }}>—</span>}</td>}
                        {bureau && <td style={TDN}>{l.ms ? <>{euros(l.ms)} <span style={{ color: couleurRatio(rs, objMs ?? 35, (objMs ?? 35) + 8) ?? MUTED, fontWeight: 600 }}>{pct(rs ?? 0)}</span></> : <span style={{ color: FAIBLE }}>—</span>}</td>}
                        {bureau && <td style={TDN}>{l.gerants ? euros(l.gerants) : <span style={{ color: FAIBLE }}>—</span>}</td>}
                        {bureau && <td style={TDN}>{l.exploitation ? euros(l.exploitation) : <span style={{ color: FAIBLE }}>—</span>}</td>}
                        <td style={{ ...TDN, fontWeight: 700, color: vide ? FAIBLE : l.ebe >= 0 ? VERT : ROUGE }}>{vide ? "—" : <>{euros(l.ebe)}{bureau ? " " : <br />}<span style={{ fontWeight: 500 }}>{pct(re ?? 0)}</span></>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "10px 16px 14px" }}>
              <Note>CA HT : ventes Popina. Charges : Pennylane (achats, paie Silae, loyer, énergie…), passées le mois de leur comptabilisation, d&apos;où des écarts de mois en mois ; la masse salariale réelle est connue quand la paie est importée. L&apos;EBE ne compte ni amortissements, ni impôts, ni variation de stock. Le détail et le coût matière théorique (recettes × ventes) restent dans <Link href="/rentabilite" style={{ color: TERRACOTTA }}>Rentabilité</Link>.</Note>
            </div>
          </Cadre>

          <div style={{ display: "grid", gridTemplateColumns: bureau ? "1fr 1fr" : "1fr", gap: 14 }}>
            <Cadre titre={`Charges d'exploitation · ${libelleMoisLong(reference.mois)}`} sous="Hors achats et salaires, par poste Pennylane.">
              {Object.entries(reference.postes).filter(([k, v]) => donnees!.postes_exploitation.includes(k) && Math.abs(v) > 0.5).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", borderBottom: "1px solid #f0ebe2", fontSize: 13 }}>
                  <span style={{ color: MUTED }}>{donnees!.libelles[k] ?? k}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{euros(v)} <span style={{ color: FAIBLE, fontWeight: 500 }}>{pct(ratio(v, reference.ca) ?? 0)}</span></span>
                </div>
              ))}
              {Object.keys(reference.postes).filter((k) => donnees!.postes_exploitation.includes(k)).length === 0 && <div style={{ color: FAIBLE, fontSize: 13 }}>Aucune charge d&apos;exploitation ce mois-ci dans Pennylane.</div>}
            </Cadre>
            <Cadre titre="Lecture rapide" sous="Les trois ratios qui décident de la rentabilité.">
              {[
                { l: "Matière (achats / CA HT)", v: ratio(reference.achats, reference.ca), obj: "≤ 32 %", c: couleurRatio(ratio(reference.achats, reference.ca), 32, 38), p: precedent ? ratio(precedent.achats, precedent.ca) : null },
                { l: "Masse salariale / CA HT", v: ratio(reference.ms, reference.ca), obj: objMs ? `≤ ${pct(objMs)}` : "≤ 35 %", c: couleurRatio(ratio(reference.ms, reference.ca), objMs ?? 35, (objMs ?? 35) + 8), p: precedent ? ratio(precedent.ms, precedent.ca) : null },
                { l: "Prime cost (matière + salaires)", v: ratio(reference.achats + reference.ms, reference.ca), obj: "≤ 65 %", c: couleurRatio(ratio(reference.achats + reference.ms, reference.ca), 65, 72), p: precedent ? ratio(precedent.achats + precedent.ms, precedent.ca) : null },
                { l: "EBE / CA HT", v: ratio(reference.ebe, reference.ca), obj: "≥ 10 %", c: (ratio(reference.ebe, reference.ca) ?? 0) >= 10 ? VERT : (ratio(reference.ebe, reference.ca) ?? 0) >= 0 ? AMBRE : ROUGE, p: precedent ? ratio(precedent.ebe, precedent.ca) : null },
              ].map((x) => {
                const v = x.v != null && x.p != null ? variation(x.v, x.p) : null;
                return (
                  <div key={x.l} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: "1px solid #f0ebe2", fontSize: 13 }}>
                    <span><span style={{ fontWeight: 600 }}>{x.l}</span><span style={{ color: FAIBLE }}> · {x.obj}</span></span>
                    <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}><b style={{ color: x.c ?? "#1a1a1a" }}>{x.v != null ? pct(x.v, 1) : "—"}</b>{v != null && <span style={{ color: MUTED, fontSize: 12 }}> {texteVariation(v)} vs {libelleMois(precedent!.mois)}</span>}</span>
                  </div>
                );
              })}
            </Cadre>
          </div>
        </>
      )}
    </div>
  );
}
