"use client";

import { useEffect, useMemo, useState } from "react";
import { useEtabAuto } from "@/lib/useEtabAuto";
import { useEtablissement } from "@/lib/EtablissementContext";
import { usePilotageRange } from "@/lib/pilotageRange";
import { useBureau } from "@/hooks/useBureau";
import { fetchApi } from "@/lib/fetchApi";
import { EnteteAnalyse, TuileVariation, Cadre, Note, Chargement, TH, TD, TDN } from "@/components/analyse/Blocs";
import { useStatsVentes, type Attache, type ProduitVendu, type StatsVentes } from "@/components/analyse/useStatsVentes";
import { FAIBLE, MUTED, ROUGE, VERT, AMBRE, derniersJours, euros, nombre, pct } from "@/components/analyse/gabarit";
import { EtatVide } from "@/components/ui/EtatVide";
import { getCategoryColor } from "@/lib/categoryColors";
import { couleurTexteSur, styleBarreCategorie, styleChevronBarre, stylePastilleBarre, styleTitreCategorie } from "@/lib/styleCategories";
import { CADRE, CHAMP, liseret, pastille } from "@/components/ui/charte";

/**
 * Ventes › Par produit (29/10/2026) : « Qu'est-ce qui se vend ? »
 * Remplace l'ancien rapport de vente : taux d'attache face aux objectifs, top et produits qui dorment,
 * ventes par catégorie (barres de catégorie, produits dessous) avec recherche, comparées à la période précédente.
 */
const FAMILLES: { cle: string; libelle: string; objectif: string; defaut: number }[] = [
  { cle: "anti", libelle: "Antipasti", objectif: "attache_antipasti", defaut: 30 },
  { cle: "pizze", libelle: "Pizzas", objectif: "attache_pizzas", defaut: 50 },
  { cle: "plats", libelle: "Plats", objectif: "attache_plats", defaut: 40 },
  { cle: "dolci", libelle: "Desserts", objectif: "attache_desserts", defaut: 80 },
  { cle: "vin", libelle: "Vins", objectif: "attache_vins", defaut: 60 },
  { cle: "alcool", libelle: "Alcools, cocktails, bières", objectif: "attache_alcool", defaut: 30 },
  { cle: "boissons", libelle: "Boissons (toutes)", objectif: "attache_boissons", defaut: 90 },
  { cle: "cafe", libelle: "Cafés et boissons chaudes", objectif: "attache_cafe", defaut: 40 },
  { cle: "digestif", libelle: "Digestifs", objectif: "attache_digestif", defaut: 15 },
];
const attache = (s: StatsVentes | null, cle: string): Attache | null => { const r = s?.ratios?.[cle]; return r && typeof r === "object" ? r : null; };
const taux = (a: Attache | null, tickets: number) => (a && tickets > 0 ? (a.tables / tickets) * 100 : null);
const couleurTaux = (t: number | null, obj: number) => (t == null ? FAIBLE : t >= obj ? VERT : t >= obj * 0.85 ? AMBRE : ROUGE);
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function Produits() {
  useEtabAuto();
  const bureau = useBureau();
  const { current: etab } = useEtablissement();
  const etabId = etab?.id ?? "";
  const [range, setRange] = usePilotageRange(() => derniersJours(30));
  const { stats, prec, chargement, erreur } = useStatsVentes(range);
  const [objectifs, setObjectifs] = useState<{ pour: string; valeurs: Record<string, number> }>({ pour: "", valeurs: {} });
  useEffect(() => {
    if (!etabId) return;
    let annule = false;
    (async () => {
      const res = await fetchApi(`/api/pilotage/objectifs?etablissement_id=${etabId}`).catch(() => null);
      const j = res && res.ok ? await res.json().catch(() => null) : null;
      if (annule) return;
      const o = (j?.objectifs ?? {}) as Record<string, { valeur: number }>;
      setObjectifs({ pour: etabId, valeurs: Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Number(v.valeur)])) });
    })();
    return () => { annule = true; };
  }, [etabId]);
  const obj = (f: typeof FAMILLES[number]) => (objectifs.pour === etabId ? objectifs.valeurs[f.objectif] : undefined) ?? f.defaut;
  const [recherche, setRecherche] = useState("");
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set());
  const q = norm(recherche.trim());

  const categories = useMemo(() => {
    if (!stats?.cat_products) return [];
    const precParCat = prec?.cat_products ?? {};
    return Object.entries(stats.cat_products).map(([cat, produits]) => {
      const avant = new Map((precParCat[cat] ?? []).map((p) => [p.n, p]));
      const lignes = produits.map((p) => ({ ...p, avant: avant.get(p.n) ?? null }));
      const qty = lignes.reduce((t, p) => t + p.qty, 0), ht = lignes.reduce((t, p) => t + p.ca_ht, 0), ttc = lignes.reduce((t, p) => t + p.ca_ttc, 0);
      return { cat, couleur: getCategoryColor(cat), qty, ht, ttc, lignes: q ? lignes.filter((p) => norm(p.n).includes(q)) : lignes };
    }).filter((c) => c.lignes.length > 0).sort((a, b) => b.ht - a.ht);
  }, [stats, prec, q]);
  const totalQty = useMemo(() => Object.values(stats?.cat_products ?? {}).flat().reduce((t, p) => t + p.qty, 0), [stats]);
  const totalQtyPrec = useMemo(() => Object.values(prec?.cat_products ?? {}).flat().reduce((t, p) => t + p.qty, 0), [prec]);
  const parNomPrec = useMemo(() => new Map(Object.values(prec?.cat_products ?? {}).flat().map((p) => [p.n, p])), [prec]);
  const top10 = useMemo(() => (stats?.top10_names ?? []).map((n, i) => ({ n, qty: stats?.top10_qty?.[i] ?? 0, ca_ttc: stats?.top10_ca_ttc?.[i] ?? 0, ca_ht: stats?.top10_ca_ht?.[i] ?? 0 })), [stats]);
  const tickets = stats?.tickets ?? 0, ticketsPrec = prec?.tickets ?? 0;
  const dolci = attache(stats, "dolci"), vin = attache(stats, "vin");
  const basculer = (cat: string) => setOuvertes((s) => { const n = new Set(s); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; });
  const delta = (p: ProduitVendu, avant: ProduitVendu | null | undefined) => {
    if (!avant || !avant.qty) return <span style={{ color: FAIBLE }}>—</span>;
    const d = (p.qty - avant.qty) / avant.qty;
    return <span style={{ color: d >= 0 ? VERT : ROUGE, fontWeight: 600 }}>{d >= 0 ? "+" : "−"}{Math.abs(Math.round(d * 100))} %</span>;
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: bureau ? "18px 28px 60px" : "12px 14px 60px", display: "grid", gap: 14, alignContent: "start" }}>
      <style>{`.pr-ligne:hover td{background:#f7f3ec}`}</style>
      <EnteteAnalyse titre="Par produit" question="Qu'est-ce qui se vend ? Ce que chaque table prend, les produits qui marchent et ceux qui dorment." range={range} onRange={setRange} />

      {erreur && <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(180,68,58,0.08)", color: ROUGE, fontSize: 13 }}>{erreur}</div>}
      {!erreur && !stats && !chargement && <Cadre><EtatVide icone="ventes" titre="Aucune vente sur cette période" texte="Les ventes Popina de la période ne sont pas encore importées." /></Cadre>}

      {stats && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: bureau ? "repeat(5, 1fr)" : "repeat(2, 1fr)", gap: bureau ? 10 : 8, opacity: chargement ? 0.6 : 1 }}>
            <TuileVariation compacte={!bureau} icone="produit" libelle="Produits vendus" valeur={nombre(totalQty)} actuel={totalQty} precedent={totalQtyPrec || null} sous={`${nombre(tickets)} tickets`} />
            <TuileVariation compacte={!bureau} icone="euro" libelle="CA produits HT" valeur={euros(stats.ca_ht)} actuel={stats.ca_ht} precedent={prec?.ca_ht} sous={`${euros(stats.ca_ttc)} TTC`} />
            <TuileVariation compacte={!bureau} icone="ticket" couleur={couleurTaux(taux(dolci, tickets), obj(FAMILLES[3]))} libelle="Tables avec dessert" valeur={taux(dolci, tickets) != null ? pct(taux(dolci, tickets)!) : "—"} actuel={taux(dolci, tickets) ?? 0} precedent={taux(attache(prec, "dolci"), ticketsPrec)} sous={`objectif ${pct(obj(FAMILLES[3]), 0)}`} />
            <TuileVariation compacte={!bureau} icone="ticket" couleur={couleurTaux(taux(vin, tickets), obj(FAMILLES[4]))} libelle="Tables avec vin" valeur={taux(vin, tickets) != null ? pct(taux(vin, tickets)!) : "—"} actuel={taux(vin, tickets) ?? 0} precedent={taux(attache(prec, "vin"), ticketsPrec)} sous={`objectif ${pct(obj(FAMILLES[4]), 0)}`} />
            <TuileVariation compacte={!bureau} icone="foodcost" libelle="Part des boissons" valeur={stats.ca_ht ? pct((stats.drink_ht / stats.ca_ht) * 100) : "—"} actuel={stats.ca_ht ? (stats.drink_ht / stats.ca_ht) * 100 : 0} precedent={prec?.ca_ht ? (prec.drink_ht / prec.ca_ht) * 100 : null} sous={`${euros(stats.drink_ht)} HT de boissons`} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: bureau ? "3fr 2fr" : "1fr", gap: 14, alignItems: "start" }}>
            <Cadre titre="Taux d'attache" sous="Part des tickets qui prennent au moins un produit de la famille, face à l'objectif." sansMarge>
              <div style={{ overflowX: "auto", marginTop: 10 }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead><tr><th style={{ ...TH, padding: 0, width: 6 }} /><th style={TH}>Famille</th><th style={{ ...TH, textAlign: "right" }}>Taux</th><th style={{ ...TH, textAlign: "right" }}>Objectif</th>{bureau && <><th style={{ ...TH, textAlign: "right" }}>Midi</th><th style={{ ...TH, textAlign: "right" }}>Soir</th><th style={{ ...TH, textAlign: "right" }}>CA HT</th></>}</tr></thead>
                  <tbody>
                    {FAMILLES.map((f) => {
                      const a = attache(stats, f.cle), t = taux(a, tickets), o = obj(f), c = couleurTaux(t, o);
                      const svc = (s: string) => { const r = stats.ratios_by_svc?.[s]?.[f.cle]; return r && r.total ? pct((r.tables / r.total) * 100) : "—"; };
                      return (
                        <tr key={f.cle} className="pr-ligne">
                          <td style={liseret(c)} />
                          <td style={{ ...TD, fontWeight: 600 }}>{f.libelle}</td>
                          <td style={TDN}><span style={pastille(c)}>{t != null ? pct(t) : "—"}</span></td>
                          <td style={{ ...TDN, color: MUTED }}>{pct(o, 0)}</td>
                          {bureau && <><td style={TDN}>{svc("midi")}</td><td style={TDN}>{svc("soir")}</td><td style={TDN}>{a ? euros(a.ca_ht) : "—"}</td></>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: "8px 16px 14px" }}><Note>Objectifs : Paramètres › Établissements, clés attache_*. Un ticket = une table ou une commande à emporter.</Note></div>
            </Cadre>
            <div style={{ display: "grid", gap: 14 }}>
              <Cadre titre="Top 10" sous="Les produits les plus vendus, en quantité." sansMarge>
                <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 10 }}>
                  <thead><tr><th style={{ ...TH, padding: 0, width: 6 }} /><th style={TH}>Produit</th><th style={{ ...TH, textAlign: "right" }}>Qté</th><th style={{ ...TH, textAlign: "right" }}>CA HT</th><th style={{ ...TH, textAlign: "right" }}>vs avant</th></tr></thead>
                  <tbody>
                    {top10.map((p) => (
                      <tr key={p.n} className="pr-ligne"><td style={liseret("#1a1a1a")} /><td style={{ ...TD, fontWeight: 600 }}>{p.n}</td><td style={TDN}>{nombre(p.qty)}</td><td style={TDN}>{euros(p.ca_ht)}</td><td style={TDN}>{delta(p, parNomPrec.get(p.n))}</td></tr>
                    ))}
                  </tbody>
                </table>
              </Cadre>
              <Cadre titre="Plats qui dorment" sous="Les cinq plats les moins vendus de la période." sansMarge>
                <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 10 }}>
                  <tbody>
                    {(stats.bottom5 ?? []).map((p) => (
                      <tr key={p.n} className="pr-ligne"><td style={liseret(AMBRE)} /><td style={{ ...TD, fontWeight: 600 }}>{p.n}</td><td style={TDN}>{nombre(p.qty)} vendu{p.qty > 1 ? "s" : ""}</td><td style={TDN}>{euros(p.ca_ht)}</td></tr>
                    ))}
                    {(stats.bottom5 ?? []).length === 0 && <tr><td style={{ ...TD, color: FAIBLE }} colSpan={4}>Rien à signaler.</td></tr>}
                  </tbody>
                </table>
              </Cadre>
            </div>
          </div>

          <div>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Chercher un produit…" style={{ ...CHAMP, borderRadius: 20, flex: "1 1 220px", maxWidth: 420 }} />
              <span style={{ fontSize: 12.5, color: MUTED }}>{categories.length} catégorie{categories.length > 1 ? "s" : ""} · {nombre(totalQty)} produits vendus · HT</span>
            </div>
            {categories.map((c) => {
              const ouverte = !!q || ouvertes.has(c.cat);
              return (
                <div key={c.cat} style={{ marginBottom: 8 }}>
                  <button type="button" aria-expanded={ouverte} onClick={() => basculer(c.cat)} style={{ ...styleBarreCategorie(c.couleur), minHeight: 44, gap: 10, padding: "0 14px", boxShadow: "none", borderRadius: ouverte ? "14px 14px 0 0" : 14 }}>
                    <span style={styleTitreCategorie(c.couleur)}>{c.cat}</span>
                    <span style={stylePastilleBarre(c.couleur)}>{nombre(c.qty)}</span>
                    <span style={{ fontSize: 12.5, color: couleurTexteSur(c.couleur), opacity: 0.9, whiteSpace: "nowrap" }}>{euros(c.ht)} · {stats.ca_ht ? pct((c.ht / stats.ca_ht) * 100) : ""}</span>
                    <span style={styleChevronBarre(c.couleur, ouverte)}>▼</span>
                  </button>
                  {ouverte && (
                    <div style={{ ...CADRE, borderTop: 0, borderRadius: "0 0 14px 14px", overflowX: "auto" }}>
                      <table style={{ borderCollapse: "collapse", width: "100%" }}>
                        <thead><tr><th style={{ ...TH, padding: 0, width: 6 }} /><th style={TH}>Produit</th><th style={{ ...TH, textAlign: "right" }}>Qté</th><th style={{ ...TH, textAlign: "right" }}>CA HT</th>{bureau && <th style={{ ...TH, textAlign: "right" }}>CA TTC</th>}<th style={{ ...TH, textAlign: "right" }}>Part</th><th style={{ ...TH, textAlign: "right" }}>vs avant</th></tr></thead>
                        <tbody>
                          {c.lignes.map((p) => (
                            <tr key={p.n} className="pr-ligne">
                              <td style={liseret(c.couleur)} />
                              <td style={{ ...TD, fontWeight: 600 }}>{p.n}</td>
                              <td style={TDN}>{nombre(p.qty)}</td>
                              <td style={TDN}>{euros(p.ca_ht)}</td>
                              {bureau && <td style={{ ...TDN, color: MUTED }}>{euros(p.ca_ttc)}</td>}
                              <td style={{ ...TDN, color: MUTED }}>{c.ht ? pct((p.ca_ht / c.ht) * 100) : "—"}</td>
                              <td style={TDN}>{delta(p, p.avant)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
            {categories.length === 0 && q && <Cadre><EtatVide compact icone="recherche" titre="Aucun produit" texte="Essaie un autre mot." /></Cadre>}
          </div>
        </>
      )}
      {chargement && !stats && <Chargement texte="Chargement des ventes…" />}
    </div>
  );
}
