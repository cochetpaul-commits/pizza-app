"use client";

import { useEffect, useMemo, useState } from "react";
import { useEtabAuto } from "@/lib/useEtabAuto";
import { useEtablissement } from "@/lib/EtablissementContext";
import { usePilotageRange } from "@/lib/pilotageRange";
import { useBureau } from "@/hooks/useBureau";
import { fetchApi } from "@/lib/fetchApi";
import { EnteteAnalyse, TuileVariation, Cadre, Note, Chargement, TH, TD, TDN } from "@/components/analyse/Blocs";
import { AMBRE, BLEU, FAIBLE, MUTED, ROUGE, VERT, derniersJours, euros, nombre, pct } from "@/components/analyse/gabarit";
import { EtatVide } from "@/components/ui/EtatVide";
import Link from "next/link";

/**
 * Analyse › Rentabilité plats (10/10/2026) : « Quels plats garder, repricer, retirer ? »
 * Matrice popularité × marge (Stars, À pousser, À repricer, À retirer) puis le tableau des
 * plats triés par marge totale. Source : /api/ventes/marges (ventes Popina × coût des fiches).
 */
type Produit = { name: string; categorie: string; qty: number; ca_ttc: number; ca_ht: number; prix_revient: number | null; cout_total: number | null; marge_brute: number | null; marge_pct: number | null; food_cost_pct: number | null; matched: boolean; linked_no_cost?: string | null };
type Reponse = { kpis: { ca_ttc: number; ca_ht: number; cogs: number; marge_brute: number; food_cost_pct: number; nb_produits: number; nb_matched: number; total_qty: number }; products: Produit[]; categories: { cat: string; ca_ht: number; cogs: number; marge: number; food_cost_pct: number }[] };
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
  const [categorie, setCategorie] = useState("toutes");
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
  const categories = useMemo(() => [...new Set((donnees?.products ?? []).map((p) => p.categorie))].sort(), [donnees]);
  const lignes = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (donnees?.products ?? [])
      .filter((p) => (categorie === "toutes" || p.categorie === categorie) && (groupe === "tous" || classes.m.get(p.name) === groupe) && (!n || p.name.toLowerCase().includes(n)))
      .sort((a, b) => (b.marge_brute ?? -1) - (a.marge_brute ?? -1));
  }, [donnees, categorie, groupe, q, classes]);
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

          <Cadre titre="Plat par plat" sous={`Triés par marge totale sur la période. Popularité et marge comparées à la médiane des plats reliés (${nombre(classes.medQ)} vendus, ${pct(classes.medM)} de marge).`} sansMarge
            droite={<div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" style={{ height: 32, padding: "0 10px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 12.5, fontFamily: "inherit", width: 150 }} />
              <select value={categorie} onChange={(e) => setCategorie(e.target.value)} style={{ height: 32, padding: "0 8px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 12.5, fontFamily: "inherit", background: "#fff" }}>
                <option value="toutes">Toutes catégories</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>}>
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr><th style={TH}>Plat</th><th style={{ ...TH, textAlign: "right" }}>Vendus</th>{bureau && <th style={{ ...TH, textAlign: "right" }}>Prix HT</th>}{bureau && <th style={{ ...TH, textAlign: "right" }}>Coût</th>}{bureau && <th style={{ ...TH, textAlign: "right" }}>Marge / plat</th>}<th style={{ ...TH, textAlign: "right" }}>Marge</th><th style={{ ...TH, textAlign: "right" }}>Food cost</th></tr></thead>
                <tbody>
                  {lignes.slice(0, 150).map((p) => {
                    const g = classes.m.get(p.name);
                    const prixHt = p.qty ? p.ca_ht / p.qty : 0;
                    return (
                      <tr key={p.name}>
                        <td style={TD}>
                          <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>{p.name}{g && <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 8, background: `${GROUPES[g].couleur}1f`, color: GROUPES[g].couleur }}>{GROUPES[g].libelle}</span>}</div>
                          <div style={{ fontSize: 11.5, color: MUTED }}>{p.categorie}{!p.matched && <span style={{ color: AMBRE }}> · sans fiche reliée</span>}{p.linked_no_cost && <span style={{ color: AMBRE }}> · {p.linked_no_cost}</span>}</div>
                        </td>
                        <td style={TDN}>{nombre(p.qty)}</td>
                        {bureau && <td style={TDN}>{euros(prixHt, 2)}</td>}
                        {bureau && <td style={{ ...TDN, color: p.prix_revient != null ? "#1a1a1a" : FAIBLE }}>{p.prix_revient != null ? euros(p.prix_revient, 2) : "—"}</td>}
                        {bureau && <td style={{ ...TDN, color: p.marge_brute != null ? "#1a1a1a" : FAIBLE }}>{p.marge_brute != null && p.qty ? euros(p.marge_brute / p.qty, 2) : "—"}</td>}
                        <td style={{ ...TDN, fontWeight: 700, color: p.marge_brute != null ? "#1a1a1a" : FAIBLE }}>{p.marge_brute != null ? euros(p.marge_brute) : "—"}{!bureau && p.marge_brute != null && p.qty ? <div style={{ fontSize: 11, color: MUTED, fontWeight: 500 }}>{euros(p.marge_brute / p.qty, 2)} / plat</div> : null}</td>
                        <td style={{ ...TDN, fontWeight: 600, color: couleurFc(p.food_cost_pct) }}>{p.food_cost_pct != null ? pct(p.food_cost_pct) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "10px 16px 14px" }}>
              {lignes.length > 150 && <div style={{ fontSize: 12.5, color: MUTED }}>150 plats affichés sur {lignes.length} : affinez avec la recherche ou la catégorie.</div>}
              <Note>Prix HT = CA HT ÷ quantité. Coût = coût matière de la fiche technique au prix d&apos;achat courant. Les touches sans fiche reliée n&apos;ont pas de marge : reliez-les dans la <Link href="/carte" style={{ color: "#D4775A" }}>Carte</Link>.</Note>
            </div>
          </Cadre>

          <Cadre titre="Par catégorie" sous="Food cost et marge par famille de la carte." sansMarge>
            <div style={{ overflowX: "auto", marginTop: 10 }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr><th style={TH}>Catégorie</th><th style={{ ...TH, textAlign: "right" }}>CA HT</th><th style={{ ...TH, textAlign: "right" }}>Coût matière</th><th style={{ ...TH, textAlign: "right" }}>Marge brute</th><th style={{ ...TH, textAlign: "right" }}>Food cost</th></tr></thead>
                <tbody>
                  {donnees.categories.map((c) => (
                    <tr key={c.cat}><td style={{ ...TD, fontWeight: 600 }}>{c.cat}</td><td style={TDN}>{euros(c.ca_ht)}</td><td style={TDN}>{euros(c.cogs)}</td><td style={{ ...TDN, fontWeight: 700 }}>{euros(c.marge)}</td><td style={{ ...TDN, fontWeight: 600, color: couleurFc(c.food_cost_pct) }}>{pct(c.food_cost_pct)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Cadre>
        </>
      )}
    </div>
  );
}
