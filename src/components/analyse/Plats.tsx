"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useEtabAuto } from "@/lib/useEtabAuto";
import { useEtablissement } from "@/lib/EtablissementContext";
import { usePilotageRange } from "@/lib/pilotageRange";
import { useBureau } from "@/hooks/useBureau";
import { fetchApi } from "@/lib/fetchApi";
import { EnteteAnalyse, TuileVariation, Cadre, Note, Chargement, TH, TD, TDN } from "@/components/analyse/Blocs";
import { AMBRE, BLEU, FAIBLE, MUTED, ROUGE, VERT, derniersJours, euros, nombre, pct } from "@/components/analyse/gabarit";
import { EtatVide } from "@/components/ui/EtatVide";
import { CelluleProduit, TableauMobile } from "@/components/ui/TableauMobile";
import Link from "next/link";

/**
 * Analyse › Rentabilité plats (10/10/2026) : « Quels plats garder, repricer, retirer ? »
 * Matrice popularité × marge (Stars, À pousser, À repricer, À retirer) puis le tableau des
 * plats triés par marge totale, ou groupés par catégorie et sous-catégorie du menu Popina.
 * Source : /api/ventes/marges (ventes Popina × coût des fiches).
 */
const sousCat = (p: Produit) => (p.sous_categorie ?? "").trim();
/** « PIZZE · Pizze » ou juste « PIZZE » quand la sous-catégorie répète la catégorie */
const libelleCat = (p: Produit) => { const sc = sousCat(p); return sc && sc.toLowerCase() !== p.categorie.toLowerCase() ? `${p.categorie} · ${sc}` : p.categorie; };
type Produit = { name: string; categorie: string; sous_categorie?: string | null; qty: number; ca_ttc: number; ca_ht: number; prix_revient: number | null; cout_total: number | null; marge_brute: number | null; marge_pct: number | null; food_cost_pct: number | null; matched: boolean; linked_no_cost?: string | null };
type Reponse = { kpis: { ca_ttc: number; ca_ht: number; cogs: number; marge_brute: number; food_cost_pct: number; nb_produits: number; nb_matched: number; total_qty: number }; products: Produit[]; categories: { cat: string; ca_ht: number; cogs: number; marge: number; food_cost_pct: number; sous?: { nom: string; qty: number; ca_ht: number; cogs: number; marge: number; food_cost_pct: number }[] }[] };
type Groupe = "stars" | "pousser" | "repricer" | "retirer";
const GROUPES: Record<Groupe, { libelle: string; couleur: string; conseil: string }> = {
  stars: { libelle: "Stars", couleur: VERT, conseil: "Très vendus et très rentables : à mettre en avant, ne pas y toucher." },
  pousser: { libelle: "À pousser", couleur: BLEU, conseil: "Rentables mais peu vendus : les suggérer en salle, les placer mieux sur la carte." },
  repricer: { libelle: "À repricer", couleur: AMBRE, conseil: "Très vendus mais peu rentables : monter le prix ou revoir la recette." },
  retirer: { libelle: "À retirer", couleur: ROUGE, conseil: "Peu vendus et peu rentables : à remplacer à la prochaine carte." },
};
const mediane = (v: number[]) => { if (!v.length) return 0; const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function Plats() {
  useEtabAuto();
  const bureau = useBureau();
  const { current: etab } = useEtablissement();
  const [range, setRange] = usePilotageRange(() => derniersJours(30));
  const etabId = etab?.id ?? "";
  const [etat, setEtat] = useState<{ cle: string; donnees: Reponse | null; erreur: string | null }>({ cle: "", donnees: null, erreur: null });
  // Filtre « cat » ou « cat|sous-catégorie » ; affichage classement (marge décroissante) ou par catégorie Popina
  const [categorie, setCategorie] = useState("toutes");
  const [affichage, setAffichage] = useState<"classement" | "categories">("classement");
  const [groupe, setGroupe] = useState<Groupe | "tous">("tous");
  const [q, setQ] = useState("");
  const cle = `${etabId}|${range.from}|${range.to}`;
  useEffect(() => {
    if (!etabId) return;
    let annule = false;
    (async () => {
      try {
        const res = await fetchApi(`/api/ventes/marges?etablissement_id=${etabId}&from=${range.from}&to=${range.to}`);
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

  // Classement : popularité (quantité) et marge unitaire (%) comparées à la médiane des plats reliés
  const classes = useMemo(() => {
    const relies = (donnees?.products ?? []).filter((p) => p.matched && p.marge_pct != null && p.qty > 0);
    const medQ = mediane(relies.map((p) => p.qty)), medM = mediane(relies.map((p) => p.marge_pct ?? 0));
    const m = new Map<string, Groupe>();
    for (const p of relies) {
      const pop = p.qty >= medQ, rentable = (p.marge_pct ?? 0) >= medM;
      m.set(p.name, pop && rentable ? "stars" : !pop && rentable ? "pousser" : pop ? "repricer" : "retirer");
    }
    return { m, medQ, medM };
  }, [donnees]);
  // Arborescence du menu Popina : catégories (ordre du CA) et leurs sous-catégories
  const arbo = useMemo(() => {
    const ordre = (donnees?.categories ?? []).map((c) => c.cat);
    const m = new Map<string, Set<string>>();
    for (const p of donnees?.products ?? []) { if (!m.has(p.categorie)) m.set(p.categorie, new Set()); const sc = sousCat(p); if (sc) m.get(p.categorie)!.add(sc); }
    return [...m.entries()].map(([cat, set]) => ({ cat, sous: [...set].sort() })).sort((a, b) => (ordre.indexOf(a.cat) + 1 || 999) - (ordre.indexOf(b.cat) + 1 || 999));
  }, [donnees]);
  const [catFiltre, sousFiltre] = categorie === "toutes" ? [null, null] : categorie.split("|");
  const lignes = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (donnees?.products ?? [])
      .filter((p) => (!catFiltre || p.categorie === catFiltre) && (!sousFiltre || sousCat(p) === sousFiltre) && (groupe === "tous" || classes.m.get(p.name) === groupe) && (!n || p.name.toLowerCase().includes(n)))
      .sort((a, b) => (b.marge_brute ?? -1) - (a.marge_brute ?? -1));
  }, [donnees, catFiltre, sousFiltre, groupe, q, classes]);
  // Par catégorie : sections (catégorie, puis sous-catégorie si le menu en a plusieurs), lignes par marge décroissante
  const sections = useMemo(() => {
    if (affichage !== "categories") return null;
    return arbo.flatMap(({ cat, sous }) => {
      const dansCat = lignes.filter((p) => p.categorie === cat);
      if (!dansCat.length) return [];
      const plusieurs = sous.length > 1 || (sous.length === 1 && sous[0].toLowerCase() !== cat.toLowerCase());
      if (!plusieurs) return [{ cle: cat, cat, sous: null as string | null, lignes: dansCat }];
      const groupes = [...sous, ""].map((sc) => ({ cle: `${cat}|${sc}`, cat, sous: sc || "Sans sous-catégorie", lignes: dansCat.filter((p) => sousCat(p) === sc) })).filter((g) => g.lignes.length);
      return groupes;
    });
  }, [affichage, arbo, lignes]);
  const nonRelies = (donnees?.products ?? []).filter((p) => !p.matched);
  const caNonRelie = nonRelies.reduce((t, p) => t + p.ca_ht, 0);
  const k = donnees?.kpis;
  const couleurFc = (v: number | null) => (v == null ? FAIBLE : v <= 28 ? VERT : v <= 35 ? AMBRE : ROUGE);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: bureau ? "18px 28px 60px" : "12px 14px 60px", display: "grid", gap: 14, alignContent: "start" }}>
      <EnteteAnalyse titre="Rentabilité plats" question="Quels plats garder, repricer, retirer ? Ce que chaque plat rapporte vraiment, une fois la matière payée." range={range} onRange={setRange} comparaison="ventes × coût des fiches techniques" />

      {etat.erreur && <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(180,68,58,0.08)", color: ROUGE, fontSize: 13 }}>{etat.erreur}</div>}
      {chargement && !donnees && <Chargement texte="Calcul des marges (ventes × fiches)…" />}
      {donnees && donnees.products.length === 0 && <Cadre><EtatVide icone="ventes" titre="Aucune vente sur cette période" texte="Les ventes Popina de la période ne sont pas encore importées." /></Cadre>}

      {donnees && k && donnees.products.length > 0 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: bureau ? "repeat(4, 1fr)" : "repeat(2, 1fr)", gap: bureau ? 10 : 8, opacity: chargement ? 0.6 : 1 }}>
            <TuileVariation compacte={!bureau} icone="foodcost" couleur={couleurFc(k.food_cost_pct)} libelle="Food cost" valeur={pct(k.food_cost_pct, 1)} actuel={k.food_cost_pct} precedent={null} sous="matière ÷ CA HT des plats reliés · objectif ≤ 28 %" />
            <TuileVariation compacte={!bureau} icone="euro" libelle="Marge brute" valeur={euros(k.marge_brute)} actuel={k.marge_brute} precedent={null} sous={`sur ${euros(k.ca_ht)} HT de plats reliés`} />
            <TuileVariation compacte={!bureau} icone="produit" libelle="Plats vendus" valeur={nombre(k.total_qty)} actuel={k.total_qty} precedent={null} sous={`${k.nb_produits} références à la carte`} />
            <TuileVariation compacte={!bureau} icone="lien" couleur={k.nb_produits && k.nb_matched / k.nb_produits >= 0.8 ? VERT : AMBRE} libelle="Reliés à une fiche" valeur={k.nb_produits ? pct((k.nb_matched / k.nb_produits) * 100) : "—"} actuel={k.nb_matched} precedent={null} sous={nonRelies.length ? `${nonRelies.length} touches sans coût · ${euros(caNonRelie)} HT` : "toutes les touches ont un coût"} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: bureau ? "repeat(4, 1fr)" : "repeat(2, 1fr)", gap: 10 }}>
            {(Object.keys(GROUPES) as Groupe[]).map((g) => {
              const liste = (donnees.products ?? []).filter((p) => classes.m.get(p.name) === g).sort((a, b) => (b.marge_brute ?? 0) - (a.marge_brute ?? 0));
              const actif = groupe === g;
              return (
                <button key={g} type="button" onClick={() => setGroupe(actif ? "tous" : g)} style={{ textAlign: "left", background: "#fff", border: `${actif ? 2 : 1}px solid ${actif ? GROUPES[g].couleur : "#ddd6c8"}`, borderRadius: 14, padding: "12px 14px", cursor: "pointer", fontFamily: "inherit" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <span style={{ fontWeight: 700, color: GROUPES[g].couleur, fontSize: 14 }}>{GROUPES[g].libelle}</span>
                    <span style={{ fontWeight: 700, color: GROUPES[g].couleur }}>{liste.length}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2, lineHeight: 1.35 }}>{GROUPES[g].conseil}</div>
                  <div style={{ fontSize: 12.5, marginTop: 8, color: "#1a1a1a", lineHeight: 1.4 }}>{liste.slice(0, bureau ? 4 : 3).map((p) => p.name).join(" · ")}{liste.length > (bureau ? 4 : 3) ? " …" : ""}</div>
                </button>
              );
            })}
          </div>

          <Cadre titre="Plat par plat" sous={affichage === "classement" ? `Triés par marge totale sur la période. Popularité et marge comparées à la médiane des plats reliés (${nombre(classes.medQ)} vendus, ${pct(classes.medM)} de marge).` : "Catégories et sous-catégories du menu Popina, plats par marge décroissante dans chacune."} sansMarge
            droite={<div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", maxWidth: "100%" }}>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" style={{ height: 32, padding: "0 10px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 12.5, fontFamily: "inherit", width: bureau ? 150 : 120, minWidth: 0 }} />
              <select value={categorie} onChange={(e) => setCategorie(e.target.value)} style={{ height: 32, padding: "0 8px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 12.5, fontFamily: "inherit", background: "#fff", maxWidth: 190 }}>
                <option value="toutes">Toutes catégories</option>
                {arbo.map(({ cat, sous }) => sous.length > 1 || (sous.length === 1 && sous[0].toLowerCase() !== cat.toLowerCase())
                  ? <optgroup key={cat} label={cat}><option value={cat}>{cat} · tout</option>{sous.map((sc) => <option key={sc} value={`${cat}|${sc}`}>{sc}</option>)}</optgroup>
                  : <option key={cat} value={cat}>{cat}</option>)}
              </select>
              <span style={{ display: "inline-flex", background: "#ece4d4", borderRadius: 10, padding: 3, gap: 3 }}>
                {(["classement", "categories"] as const).map((v) => (
                  <button key={v} type="button" onClick={() => setAffichage(v)} style={{ padding: "5px 10px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", background: affichage === v ? "#fff" : "transparent", color: affichage === v ? "#1a1a1a" : MUTED, boxShadow: affichage === v ? "0 1px 2px rgba(0,0,0,0.08)" : "none" }}>{v === "classement" ? "Classement" : "Par catégorie"}</button>
                ))}
              </span>
            </div>}>
            {lignes.length === 0 && <div style={{ padding: "10px 16px 16px" }}><EtatVide compact icone="recherche" titre="Aucun plat ne correspond" texte="Modifiez la recherche, la catégorie ou le groupe." /></div>}
            {lignes.length > 0 && (bureau ? (
              <div style={{ overflowX: "auto", marginTop: 10 }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead><tr><th style={TH}>Plat</th><th style={{ ...TH, textAlign: "right" }}>Vendus</th><th style={{ ...TH, textAlign: "right" }}>Prix HT</th><th style={{ ...TH, textAlign: "right" }}>Coût</th><th style={{ ...TH, textAlign: "right" }}>Marge / plat</th><th style={{ ...TH, textAlign: "right" }}>Marge</th><th style={{ ...TH, textAlign: "right" }}>Food cost</th></tr></thead>
                  <tbody>
                    {(sections ?? [{ cle: "tout", cat: null as string | null, sous: null as string | null, lignes: lignes.slice(0, 150) }]).map((sec) => (
                      <React.Fragment key={sec.cle}>
                        {sec.cat && <tr><td colSpan={7} style={{ ...TD, padding: "8px 12px 6px", background: "#f7f3ec", fontWeight: 700, fontSize: 12, letterSpacing: ".04em", textTransform: "uppercase", color: "#1a1a1a" }}>{sec.cat}{sec.sous ? <span style={{ color: MUTED, fontWeight: 600, textTransform: "none", letterSpacing: 0 }}> · {sec.sous}</span> : null}<span style={{ color: FAIBLE, fontWeight: 500, textTransform: "none", letterSpacing: 0 }}> · {sec.lignes.length} plat{sec.lignes.length > 1 ? "s" : ""} · {euros(sec.lignes.reduce((t, p) => t + (p.marge_brute ?? 0), 0))} de marge</span></td></tr>}
                        {sec.lignes.map((p) => { const g = classes.m.get(p.name); const prixHt = p.qty ? p.ca_ht / p.qty : 0; return (
                          <tr key={p.name}>
                            <td style={TD}>
                              <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>{p.name}{g && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 8, background: `${GROUPES[g].couleur}1f`, color: GROUPES[g].couleur }}>{GROUPES[g].libelle}</span>}</div>
                              <div style={{ fontSize: 11.5, color: MUTED }}>{sec.cat ? null : libelleCat(p)}{!p.matched && <span style={{ color: AMBRE }}>{sec.cat ? "" : " · "}sans fiche reliée</span>}{p.linked_no_cost && <span style={{ color: AMBRE }}> · {p.linked_no_cost}</span>}</div>
                            </td>
                            <td style={TDN}>{nombre(p.qty)}</td>
                            <td style={TDN}>{euros(prixHt, 2)}</td>
                            <td style={{ ...TDN, color: p.prix_revient != null ? "#1a1a1a" : FAIBLE }}>{p.prix_revient != null ? euros(p.prix_revient, 2) : "—"}</td>
                            <td style={{ ...TDN, color: p.marge_brute != null ? "#1a1a1a" : FAIBLE }}>{p.marge_brute != null && p.qty ? euros(p.marge_brute / p.qty, 2) : "—"}</td>
                            <td style={{ ...TDN, fontWeight: 700, color: p.marge_brute != null ? "#1a1a1a" : FAIBLE }}>{p.marge_brute != null ? euros(p.marge_brute) : "—"}</td>
                            <td style={{ ...TDN, fontWeight: 600, color: couleurFc(p.food_cost_pct) }}>{p.food_cost_pct != null ? pct(p.food_cost_pct) : "—"}</td>
                          </tr>); })}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ marginTop: 10, display: "grid", gap: sections ? 10 : 0, padding: sections ? "0 10px" : 0 }}>
                {(sections ?? [{ cle: "tout", cat: null as string | null, sous: null as string | null, lignes: lignes.slice(0, 150) }]).map((sec) => (
                  <div key={sec.cle}>
                    {sec.cat && <div style={{ padding: "8px 10px 6px", fontWeight: 700, fontSize: 12, letterSpacing: ".04em", textTransform: "uppercase", color: "#1a1a1a" }}>{sec.cat}{sec.sous ? <span style={{ color: MUTED, fontWeight: 600, textTransform: "none", letterSpacing: 0 }}> · {sec.sous}</span> : null}<span style={{ color: FAIBLE, fontWeight: 500, textTransform: "none", letterSpacing: 0 }}> · {sec.lignes.length}</span></div>}
                    <TableauMobile sansCadre={!sec.cat} colonnes={[{ libelle: "Plat" }, { libelle: "Marge · food cost", align: "right", largeur: 132 }]}>
                      {sec.lignes.map((p) => { const g = classes.m.get(p.name); return (
                        <tr key={p.name}>
                          <td style={{ padding: 0, width: 4, background: g ? GROUPES[g].couleur : "#ddd6c8", borderBottom: "1px solid #f0ebe2" }} />
                          <CelluleProduit style={{ padding: "9px 10px", borderBottom: "1px solid #f0ebe2", verticalAlign: "middle", fontSize: 13 }} titre={p.name}
                            droite={<>
                              <div style={{ fontWeight: 700, color: p.marge_brute != null ? "#1a1a1a" : FAIBLE }}>{p.marge_brute != null ? euros(p.marge_brute) : "—"}</div>
                              <div style={{ fontSize: 11.5, marginTop: 1 }}>{p.marge_brute != null && p.qty ? <span style={{ color: MUTED }}>{euros(p.marge_brute / p.qty, 2)} / plat · </span> : null}<span style={{ fontWeight: 700, color: couleurFc(p.food_cost_pct) }}>{p.food_cost_pct != null ? pct(p.food_cost_pct) : "—"}</span></div>
                            </>}>
                            <div style={{ fontSize: 11.5, color: MUTED, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              {g && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 8, background: `${GROUPES[g].couleur}1f`, color: GROUPES[g].couleur }}>{GROUPES[g].libelle}</span>}
                              <span>{nombre(p.qty)} vendus{sec.cat ? "" : ` · ${libelleCat(p)}`}{!p.matched && <span style={{ color: AMBRE }}> · sans fiche</span>}</span>
                            </div>
                          </CelluleProduit>
                        </tr>); })}
                    </TableauMobile>
                  </div>
                ))}
              </div>
            ))}
            <div style={{ padding: "10px 16px 14px" }}>
              {!sections && lignes.length > 150 && <div style={{ fontSize: 12.5, color: MUTED }}>150 plats affichés sur {lignes.length} : affinez avec la recherche ou la catégorie.</div>}
              <Note>Prix HT = CA HT ÷ quantité. Coût = coût matière de la fiche technique au prix d&apos;achat courant. Les touches sans fiche reliée n&apos;ont pas de marge : reliez-les dans la <Link href="/carte" style={{ color: "#D4775A" }}>Carte</Link>.</Note>
            </div>
          </Cadre>

          <Cadre titre="Par catégorie" sous="Food cost et marge par catégorie et sous-catégorie du menu Popina." sansMarge>
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr><th style={TH}>Catégorie</th><th style={{ ...TH, textAlign: "right" }}>CA HT</th>{bureau && <th style={{ ...TH, textAlign: "right" }}>Coût matière</th>}<th style={{ ...TH, textAlign: "right" }}>Marge{bureau ? " brute" : ""}</th><th style={{ ...TH, textAlign: "right" }}>Food cost</th></tr></thead>
                <tbody>
                  {donnees.categories.map((c) => {
                    const sous = (c.sous ?? []).filter((sc) => sc.nom && sc.nom.toLowerCase() !== c.cat.toLowerCase());
                    const detail = sous.length > 1 || (sous.length === 1 && (c.sous ?? []).length > 1);
                    return (
                      <React.Fragment key={c.cat}>
                        <tr><td style={{ ...TD, fontWeight: 700 }}>{c.cat}</td><td style={TDN}>{euros(c.ca_ht)}</td>{bureau && <td style={TDN}>{euros(c.cogs)}</td>}<td style={{ ...TDN, fontWeight: 700 }}>{euros(c.marge)}</td><td style={{ ...TDN, fontWeight: 600, color: couleurFc(c.food_cost_pct) }}>{pct(c.food_cost_pct)}</td></tr>
                        {detail && (c.sous ?? []).map((sc) => (
                          <tr key={`${c.cat}|${sc.nom}`}><td style={{ ...TD, paddingLeft: 28, color: MUTED, fontSize: 12.5 }}>{sc.nom || "Sans sous-catégorie"}</td><td style={{ ...TDN, color: MUTED, fontSize: 12.5 }}>{euros(sc.ca_ht)}</td>{bureau && <td style={{ ...TDN, color: MUTED, fontSize: 12.5 }}>{euros(sc.cogs)}</td>}<td style={{ ...TDN, fontSize: 12.5 }}>{euros(sc.marge)}</td><td style={{ ...TDN, fontSize: 12.5, fontWeight: 600, color: couleurFc(sc.food_cost_pct) }}>{pct(sc.food_cost_pct)}</td></tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Cadre>
        </>
      )}
    </div>
  );
}
