"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { DateRange } from "@/components/ui/DateRangePicker";
import { useEtabAuto } from "@/lib/useEtabAuto";
import { useEtablissement } from "@/lib/EtablissementContext";
import { usePilotageRange } from "@/lib/pilotageRange";
import { useBureau } from "@/hooks/useBureau";
import { fetchApi } from "@/lib/fetchApi";
import { EnteteAnalyse, TuileVariation, Cadre, Note, Chargement, TH, TD, TDN } from "@/components/analyse/Blocs";
import { GraphBarres } from "@/components/analyse/GraphBarres";
import { AMBRE, FAIBLE, MUTED, ROUGE, VERT, dateCourte, derniersMois, euros, libelleMois, texteVariation, variation } from "@/components/analyse/gabarit";
import { EtatVide } from "@/components/ui/EtatVide";
import { CHAMP, liseret, pastille } from "@/components/ui/charte";
import type { Depenses as Donnees, PosteDepense } from "@/lib/analyse/depenses";

/**
 * Pilotage › Achats › Toutes les dépenses (24/11/2026, demande de Paul) : tout ce que Pennylane range par catégorie
 * (électricité, gaz, loyer, URSSAF, maintenance…), par grand poste, face aux mois d'avant. Toucher une catégorie
 * déroule ses factures et prélèvements. Hors taxes, à la date de la facture : des dépenses, pas de la trésorerie.
 */
const COULEURS: Record<string, string> = {
  achats_matieres: "#D4775A", masse_salariale: "#4a5a8a", remuneration_gerants: "#7a4fc9", loyer: "#8a6d3b", energie: "#e0a83c",
  entretien: "#5e8278", locations: "#6b8fb0", honoraires: "#9c6b8e", assurances: "#4a6741", commissions_cb: "#a39d92", autres_charges: "#b8886a", a_categoriser: AMBRE,
};
const couleur = (poste: string) => COULEURS[poste] ?? "#a39d92";
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function Depenses() {
  useEtabAuto();
  const { current: etab } = useEtablissement();
  return <DepensesVue etabId={etab?.id ?? ""} />;
}

/** La page, pour un établissement donné */
export function DepensesVue({ etabId }: { etabId: string }) {
  const bureau = useBureau();
  const [range, setRange] = usePilotageRange(() => derniersMois(3));
  const cle = `${etabId}|${range.from}|${range.to}`;
  const [etat, setEtat] = useState<{ cle: string; donnees: (Donnees & { synchro: string | null }) | null; erreur: string | null }>({ cle: "", donnees: null, erreur: null });
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!etabId) return;
    let annule = false;
    fetchApi(`/api/analyse/depenses?etablissement_id=${etabId}&from=${range.from}&to=${range.to}`)
      .then(async (r) => { const j = await r.json(); if (!annule) setEtat(r.ok ? { cle, donnees: j, erreur: null } : { cle, donnees: null, erreur: j?.error ?? "Chargement impossible" }); })
      .catch((e) => { if (!annule) setEtat({ cle, donnees: null, erreur: e instanceof Error ? e.message : "Chargement impossible" }); });
    return () => { annule = true; };
  }, [cle, etabId, range.from, range.to]);

  const d = etat.donnees;
  const chargement = etat.cle !== cle;
  // Recherche : fournisseur, libellé ou catégorie ; on ne garde que les catégories (et lignes) qui correspondent
  const postes = useMemo<PosteDepense[]>(() => {
    if (!d) return [];
    const mots = norm(q.trim()).split(/\s+/).filter(Boolean);
    // « À catégoriser » en tête : c'est le travail à faire dans Pennylane
    const ordre = [...d.postes].sort((a, b) => Number(b.poste === "a_categoriser") - Number(a.poste === "a_categoriser"));
    if (!mots.length) return ordre;
    const ok = (t: string) => mots.every((m) => t.includes(m));
    return ordre.map((p) => ({
      ...p,
      categories: p.categories.map((c) => ok(norm(`${p.libelle} ${c.categorie}`)) ? c : { ...c, lignes: c.lignes.filter((l) => ok(norm(`${l.fournisseur ?? ""} ${l.libelle ?? ""}`))) })
        .filter((c) => c.lignes.length > 0 && (ok(norm(`${p.libelle} ${c.categorie}`)) || c.lignes.length > 0))
        .map((c) => ok(norm(`${p.libelle} ${c.categorie}`)) ? c : { ...c, total: Math.round(c.lignes.reduce((t, l) => t + l.montant_ht, 0) * 100) / 100, nb: c.lignes.length, totalPrec: 0 }),
    })).filter((p) => p.categories.length > 0);
  }, [d, q]);
  const basculer = (k: string) => setOuverts((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const poste = (k: string) => d?.postes.find((p) => p.poste === k);
  const aCat = poste("a_categoriser");
  const nbMois = d?.mois.length ?? 0;
  const raccourcis: { libelle: string; r: DateRange }[] = [{ libelle: "Ce mois", r: derniersMois(1) }, { libelle: "3 mois", r: derniersMois(3) }, { libelle: "6 mois", r: derniersMois(6) }, { libelle: "12 mois", r: derniersMois(12) }];
  const tuile = (k: string, libelle: string) => { const p = poste(k); return <TuileVariation compacte={!bureau} inverse couleur={couleur(k)} libelle={libelle} valeur={euros(p?.total ?? 0)} actuel={p?.total ?? 0} precedent={p?.totalPrec ?? null} sous={d && d.total ? `${Math.round(((p?.total ?? 0) / d.total) * 100)} % des dépenses` : undefined} />; };
  // Graphique : les six plus gros postes empilés, le reste en « autres »
  const graph = useMemo(() => {
    if (!d) return null;
    const gros = d.postes.slice(0, 6).map((p) => p.poste);
    return {
      etiquettes: d.parMois.map((m) => libelleMois(m.mois)),
      series: [
        ...gros.map((k) => ({ libelle: poste(k)?.libelle ?? k, couleur: couleur(k), valeurs: d.parMois.map((m) => Math.max(0, m.postes[k] ?? 0)) })),
        ...(d.postes.length > 6 ? [{ libelle: "Autres postes", couleur: "#cfc8bb", valeurs: d.parMois.map((m) => Math.max(0, Object.entries(m.postes).filter(([k]) => !gros.includes(k)).reduce((t, [, v]) => t + v, 0))) }] : []),
      ],
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d]);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: bureau ? "18px 28px 60px" : "12px 14px 60px", display: "grid", gap: 14, alignContent: "start" }}>
      <EnteteAnalyse titre="Toutes les dépenses" question="Où part l'argent ? Toutes les factures et prélèvements classés dans Pennylane, par poste et par catégorie."
        range={range} onRange={setRange} raccourcis={raccourcis} comparaison={nbMois ? `${nbMois} mois · comparés aux ${nbMois} mois d'avant` : undefined} />

      {etat.erreur && <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(180,68,58,0.08)", color: ROUGE, fontSize: 13 }}>{etat.erreur}</div>}
      {chargement && !d && <Chargement texte="Lecture des dépenses…" />}
      {d && d.postes.length === 0 && <Cadre><EtatVide icone="commande" titre="Aucune dépense sur ces mois" texte="Pennylane n'a rien de classé sur cette période pour cet établissement." /></Cadre>}

      {d && d.postes.length > 0 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: bureau ? "repeat(4, 1fr)" : "repeat(2, 1fr)", gap: bureau ? 10 : 8, opacity: chargement ? 0.6 : 1 }}>
            <TuileVariation compacte={!bureau} inverse icone="facture" libelle="Total des dépenses HT" valeur={euros(d.total)} actuel={d.total} precedent={d.totalPrec || null} sous={`${nbMois} mois`} />
            {tuile("achats_matieres", "Achats matières")}
            {tuile("masse_salariale", "Masse salariale")}
            <TuileVariation compacte={!bureau} couleur={AMBRE} libelle="À catégoriser" valeur={euros(aCat?.total ?? 0)} actuel={aCat?.total ?? 0} precedent={null}
              sous={aCat ? `${aCat.categories.reduce((t, c) => t + c.nb, 0)} pièces à classer dans Pennylane` : "tout est classé"} />
          </div>

          {graph && nbMois > 1 && (
            <Cadre titre="Par mois" sous="Hors taxes, les six plus gros postes empilés.">
              <GraphBarres empile etiquettes={graph.etiquettes} series={graph.series} format={(v) => euros(v)} libelleAxe="Dépenses HT par mois" />
            </Cadre>
          )}

          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un fournisseur, une catégorie (EDF, gaz, URSSAF…)" style={{ ...CHAMP, borderRadius: 20, width: "100%", maxWidth: 460 }} />

          {postes.length === 0 && <div style={{ fontSize: 13, color: MUTED }}>Rien ne correspond à « {q} » sur cette période.</div>}
          {postes.map((p) => {
            const c = couleur(p.poste), v = variation(p.total, p.totalPrec || null);
            return (
              <Cadre key={p.poste} bande={c} titre={p.libelle} sansMarge
                sous={p.poste === "a_categoriser" ? "Dépenses sans catégorie dans Pennylane : à classer là-bas, elles faussent les totaux des autres postes." : undefined}
                droite={<div style={{ textAlign: "right" }}><div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, fontSize: 18 }}>{euros(p.total)}</div>{v != null && !q && <div style={{ fontSize: 11.5, fontWeight: 700 }}>{texteVariation(v)} vs avant</div>}</div>}>
                <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
                  <colgroup><col style={{ width: 6 }} /><col /><col style={{ width: bureau ? 70 : 0 }} /><col style={{ width: bureau ? 120 : 96 }} />{bureau && <col style={{ width: 90 }} />}</colgroup>
                  <thead><tr><th style={{ ...TH, padding: 0 }} /><th style={TH}>Catégorie</th><th style={{ ...TH, textAlign: "right", ...(bureau ? {} : { padding: 0 }) }}>{bureau ? "Pièces" : ""}</th><th style={{ ...TH, textAlign: "right" }}>HT</th>{bureau && <th style={{ ...TH, textAlign: "right" }}>Avant</th>}</tr></thead>
                  <tbody>
                    {p.categories.map((cat) => {
                      const k = `${p.poste}|${cat.categorie}`, ouvert = ouverts.has(k) || !!q.trim();
                      const vc = variation(cat.total, cat.totalPrec || null);
                      return (
                        <Fragment key={k}>
                          <tr onClick={() => basculer(k)} style={{ cursor: "pointer", background: ouvert ? "#faf7f1" : undefined }}>
                            <td style={liseret(c)} />
                            <td style={{ ...TD, fontWeight: 600, overflowWrap: "anywhere" }}>
                              <span style={{ color: MUTED, fontSize: 10, marginRight: 6, display: "inline-block", transform: ouvert ? "rotate(90deg)" : "none" }}>▶</span>{cat.categorie}
                              {!bureau && <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 400 }}>{cat.nb} pièce{cat.nb > 1 ? "s" : ""}{vc != null && !q ? ` · ${texteVariation(vc)}` : ""}</div>}
                            </td>
                            <td style={{ ...TDN, color: MUTED, ...(bureau ? {} : { padding: 0 }) }}>{bureau ? cat.nb : ""}</td>
                            <td style={{ ...TDN, fontWeight: 700 }}>{euros(cat.total)}</td>
                            {bureau && <td style={{ ...TDN, color: vc == null ? FAIBLE : vc > 0.05 ? ROUGE : vc < -0.05 ? VERT : MUTED }}>{cat.totalPrec ? euros(cat.totalPrec) : "—"}</td>}
                          </tr>
                          {ouvert && cat.lignes.map((l, i) => (
                            <tr key={i} style={{ background: "#fdfbf7" }}>
                              <td style={liseret("transparent")} />
                              <td colSpan={bureau ? 2 : 2} style={{ ...TD, fontSize: 12.5, paddingLeft: 28, overflowWrap: "anywhere" }}>
                                <span style={{ color: MUTED }}>{l.date ? dateCourte(l.date) : libelleMois(l.mois)}</span> · <b style={{ fontWeight: 600 }}>{l.fournisseur ?? "—"}</b>
                                {l.libelle && <div style={{ color: MUTED, fontSize: 11.5 }}>{l.libelle}</div>}
                                {l.type === "transaction" && <span style={{ ...pastille(MUTED), marginLeft: 0, marginTop: 3 }}>prélèvement</span>}
                              </td>
                              <td style={{ ...TDN, fontSize: 12.5 }}>{euros(l.montant_ht, 2)}</td>
                              {bureau && <td style={TD} />}
                            </tr>
                          ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </Cadre>
            );
          })}
          <Note>
            Hors taxes, à la date de la facture (ou du prélèvement quand il n&apos;y a pas de facture : salaires, URSSAF). Ce sont des dépenses, pas de la trésorerie : un achat de novembre payé en décembre compte en novembre. Source : Pennylane, relu chaque nuit{d.synchro ? `, dernière lecture le ${new Date(d.synchro).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}` : ""}. Les totaux par poste sont repris dans <Link href="/analyse/marge" style={{ color: MUTED }}>Résultat</Link>.
          </Note>
        </>
      )}
    </div>
  );
}
