"use client";

import { useEffect, useMemo, useState } from "react";
import { useEtabAuto } from "@/lib/useEtabAuto";
import { useEtablissement } from "@/lib/EtablissementContext";
import { usePilotageRange } from "@/lib/pilotageRange";
import { useBureau } from "@/hooks/useBureau";
import { fetchApi } from "@/lib/fetchApi";
import { EnteteAnalyse, TuileVariation, Cadre, Note, Chargement, TH, TD, TDN } from "@/components/analyse/Blocs";
import { useStatsVentes, type Attache, type ProduitVendu, type StatsVentes } from "@/components/analyse/useStatsVentes";
import { FAIBLE, MUTED, ROUGE, VERT, AMBRE, derniersJours, euros, nombre, pct, texteVariation, variation } from "@/components/analyse/gabarit";
import { EtatVide } from "@/components/ui/EtatVide";
import { getCategoryColor } from "@/lib/categoryColors";
import { couleurTexte } from "@/lib/styleCategories";
import { BORD, CHAMP, liseret, pastille } from "@/components/ui/charte";
import { GraphBarres } from "@/components/analyse/GraphBarres";
import { COULEUR_MIDI, COULEUR_SOIR, periodeEffective } from "@/components/analyse/gabarit";
import type { ProduitsPeriode } from "@/lib/analyse/produitsPeriode";
import { ZoomProduit } from "@/components/analyse/ZoomProduit";

/**
 * Ventes › Par produit (29/10/2026) : « Qu'est-ce qui se vend ? »
 * Remplace l'ancien rapport de vente : taux d'attache face aux objectifs, top et produits qui dorment,
 * ventes par catégorie (barres de catégorie, produits dessous) avec recherche, comparées à la période précédente.
 */
// cat : la catégorie de caisse correspondante (clic sur la ligne → tendance et tableau de cette catégorie)
const FAMILLES: { cle: string; libelle: string; objectif: string; defaut: number; cat: string }[] = [
  { cle: "anti", libelle: "Antipasti", objectif: "attache_antipasti", defaut: 30, cat: "ANTIPASTI" },
  { cle: "pizze", libelle: "Pizzas", objectif: "attache_pizzas", defaut: 50, cat: "PIZZE" },
  { cle: "plats", libelle: "Plats", objectif: "attache_plats", defaut: 40, cat: "CUCINA" },
  { cle: "dolci", libelle: "Desserts", objectif: "attache_desserts", defaut: 80, cat: "DOLCI" },
  { cle: "vin", libelle: "Vins", objectif: "attache_vins", defaut: 60, cat: "VINI" },
  { cle: "alcool", libelle: "Alcools, cocktails, bières", objectif: "attache_alcool", defaut: 30, cat: "ALCOOL" },
  { cle: "boissons", libelle: "Boissons (toutes)", objectif: "attache_boissons", defaut: 90, cat: "BEVANDE" },
  { cle: "cafe", libelle: "Cafés et boissons chaudes", objectif: "attache_cafe", defaut: 40, cat: "BEVANDE CALDE" },
  { cle: "digestif", libelle: "Digestifs", objectif: "attache_digestif", defaut: 15, cat: "DIGESTIVI" },
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
  // Tendance et midi / soir (30/10/2026) : la même période effective que les statistiques
  const eff = periodeEffective(range);
  const [periode, setPeriode] = useState<{ cle: string; d: ProduitsPeriode | null }>({ cle: "", d: null });
  const [mesure, setMesure] = useState<"qty" | "ht">("qty");
  // Tendance : toutes les catégories empilées, c'est illisible ; par défaut le total, et un sélecteur par catégorie
  const [catTendance, setCatTendance] = useState<string>("total");
  // Zoom sur un produit : un clic sur une ligne ouvre le volet
  const [zoom, setZoom] = useState<string | null>(null);
  const clePeriode = `${etabId}|${eff.from}|${eff.to}`;
  useEffect(() => {
    if (!etabId) return;
    let annule = false;
    fetchApi(`/api/ventes/produits?etablissement_id=${etabId}&from=${eff.from}&to=${eff.to}`).then(async (r) => {
      const j = r.ok ? ((await r.json()) as ProduitsPeriode) : null;
      if (!annule) setPeriode({ cle: clePeriode, d: j });
    }).catch(() => { if (!annule) setPeriode({ cle: clePeriode, d: null }); });
    return () => { annule = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clePeriode]);
  const pp = periode.cle === clePeriode ? periode.d : null;
  const svcProduit = (n: string) => pp?.produits[n] ?? null;
  const q = norm(recherche.trim());

  const categories = useMemo(() => {
    if (!stats?.cat_products) return [];
    const precParCat = prec?.cat_products ?? {};
    return Object.entries(stats.cat_products).map(([cat, produits]) => {
      const avant = new Map((precParCat[cat] ?? []).map((p) => [p.n, p]));
      const lignes = produits.map((p) => ({ ...p, avant: avant.get(p.n) ?? null })).sort((a, b) => a.n.localeCompare(b.n, "fr"));
      const qty = lignes.reduce((t, p) => t + p.qty, 0), ht = lignes.reduce((t, p) => t + p.ca_ht, 0), ttc = lignes.reduce((t, p) => t + p.ca_ttc, 0);
      return { cat, couleur: getCategoryColor(cat), qty, ht, ttc, lignes: q ? lignes.filter((p) => norm(p.n).includes(q)) : lignes };
    }).filter((c) => c.lignes.length > 0).sort((a, b) => a.cat.localeCompare(b.cat, "fr"));
  }, [stats, prec, q]);
  // Tendances par catégorie (31/10/2026, demande de Paul) : quantités et CA de chaque catégorie face à la période comparée,
  // sans le filtre de recherche, classées par CA
  const tendancesCat = useMemo(() => {
    if (!stats?.cat_products) return [];
    const precParCat = prec?.cat_products ?? {};
    const somme = (ps: ProduitVendu[] | undefined) => (ps ?? []).reduce((t, p) => ({ qty: t.qty + p.qty, ht: t.ht + p.ca_ht }), { qty: 0, ht: 0 });
    const total = Object.values(stats.cat_products).flat().reduce((t, p) => t + p.ca_ht, 0);
    return Object.keys({ ...stats.cat_products, ...precParCat }).map((cat) => {
      const a = somme(stats.cat_products?.[cat]), av = somme(precParCat[cat]);
      return { cat, couleur: getCategoryColor(cat), qty: a.qty, ht: a.ht, qtyAvant: av.qty, htAvant: av.ht, part: total ? (a.ht / total) * 100 : 0 };
    }).filter((c) => c.qty > 0 || c.qtyAvant > 0).sort((a, b) => b.ht - a.ht);
  }, [stats, prec]);
  const plats = tendancesCat.find((c) => /cucina|cuisine|plat/i.test(c.cat)) ?? null, pizze = tendancesCat.find((c) => /pizz/i.test(c.cat)) ?? null;
  const ratioPlats = plats && pizze && pizze.qty > 0 ? (plats.qty / pizze.qty) * 100 : null;
  const ratioPlatsAvant = plats && pizze && pizze.qtyAvant > 0 ? (plats.qtyAvant / pizze.qtyAvant) * 100 : null;
  const totalQty = useMemo(() => Object.values(stats?.cat_products ?? {}).flat().reduce((t, p) => t + p.qty, 0), [stats]);
  const totalQtyPrec = useMemo(() => Object.values(prec?.cat_products ?? {}).flat().reduce((t, p) => t + p.qty, 0), [prec]);
  const parNomPrec = useMemo(() => new Map(Object.values(prec?.cat_products ?? {}).flat().map((p) => [p.n, p])), [prec]);
  // Catégorie de chaque produit vendu : le liseré des tableaux Top 10 et dormants prend sa couleur
  const couleurProduit = useMemo(() => { const m = new Map<string, string>(); for (const [cat, ps] of Object.entries(stats?.cat_products ?? {})) for (const p of ps) m.set(p.n, getCategoryColor(cat)); return (n: string) => m.get(n) ?? "#1a1a1a"; }, [stats]);
  const top10 = useMemo(() => (stats?.top10_names ?? []).map((n, i) => ({ n, qty: stats?.top10_qty?.[i] ?? 0, ca_ttc: stats?.top10_ca_ttc?.[i] ?? 0, ca_ht: stats?.top10_ca_ht?.[i] ?? 0 })), [stats]);
  const tickets = stats?.tickets ?? 0, ticketsPrec = prec?.tickets ?? 0;
  const dolci = attache(stats, "dolci"), vin = attache(stats, "vin");
  // Clic sur une famille du taux d'attache : la tendance passe sur sa catégorie et son tableau s'ouvre, en vue
  const voirCategorie = (cat: string) => {
    const existe = categories.some((c) => c.cat === cat);
    setCatTendance(existe ? cat : "total");
    if (!existe) return;
    setTimeout(() => document.getElementById("tendance")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };
  const delta = (p: ProduitVendu, avant: ProduitVendu | null | undefined) => {
    if (!avant || !avant.qty) return <span style={{ color: FAIBLE }}>—</span>;
    const d = (p.qty - avant.qty) / avant.qty;
    return <span style={{ color: d >= 0 ? VERT : ROUGE, fontWeight: 600 }}>{d >= 0 ? "+" : "−"}{Math.abs(Math.round(d * 100))} %</span>;
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: bureau ? "18px 28px 60px" : "12px 14px 60px", display: "grid", gap: 14, alignContent: "start" }}>
      <style>{`.pr-ligne{cursor:pointer}.pr-ligne:hover td{background:#f7f3ec}.pr-top:hover{background:#f7f3ec}.pr-mix:hover{background:#f7f3ec}`}</style>
      {zoom && etabId && <ZoomProduit nom={zoom} etabId={etabId} periode={eff} bureau={bureau} onFermer={() => setZoom(null)} />}
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

          {tendancesCat.length > 0 && (
            <Cadre titre="Tendances par catégorie" sous="Ce que chaque catégorie a vendu sur la période, en quantité et en CA HT, face à la période comparée. Un clic ouvre la catégorie." sansMarge
              droite={ratioPlats != null ? <div style={{ fontSize: 12.5, color: MUTED }}>Plats face aux pizze : <b style={{ color: "#1a1a1a" }}>{nombre(ratioPlats)} plats pour 100 pizze</b>{ratioPlatsAvant != null && ratioPlatsAvant > 0 && (() => { const d = variation(ratioPlats, ratioPlatsAvant); return d == null ? null : <span style={{ color: d >= 0 ? VERT : ROUGE, fontWeight: 600 }}> {texteVariation(d)}</span>; })()}</div> : undefined}>
              <div style={{ overflowX: "auto", marginTop: 10 }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead><tr><th style={{ ...TH, padding: 0, width: 6 }} /><th style={TH}>Catégorie</th><th style={{ ...TH, textAlign: "right" }}>Quantité</th><th style={{ ...TH, textAlign: "right" }}>Évolution</th><th style={{ ...TH, textAlign: "right" }}>CA HT</th>{bureau && <th style={{ ...TH, textAlign: "right" }}>Évolution</th>}<th style={{ ...TH, textAlign: "right" }}>Part</th></tr></thead>
                  <tbody>
                    {tendancesCat.map((c) => {
                      const dq = variation(c.qty, c.qtyAvant || null), dh = variation(c.ht, c.htAvant || null);
                      const ev = (d: number | null) => (d == null ? <span style={{ color: FAIBLE }}>—</span> : <span style={{ color: d >= 0 ? VERT : ROUGE, fontWeight: 600 }}>{texteVariation(d)}</span>);
                      return (
                        <tr key={c.cat} className="pr-ligne" onClick={() => voirCategorie(c.cat)}>
                          <td style={liseret(c.couleur)} />
                          <td style={{ ...TD, fontWeight: 700, color: couleurTexte(c.couleur) }}>{c.cat}{c.qtyAvant > 0 && <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 400 }}>avant {nombre(c.qtyAvant)} · {euros(c.htAvant)}</div>}</td>
                          <td style={{ ...TDN, fontWeight: 700 }}>{nombre(c.qty)}</td>
                          <td style={TDN}>{ev(dq)}</td>
                          <td style={TDN}>{euros(c.ht)}</td>
                          {bureau && <td style={TDN}>{ev(dh)}</td>}
                          <td style={{ ...TDN, color: MUTED }}>{pct(c.part)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!bureau && ratioPlats != null && <div style={{ padding: "8px 16px 12px", fontSize: 12.5, color: MUTED }}>Plats face aux pizze : <b style={{ color: "#1a1a1a" }}>{nombre(ratioPlats)} plats pour 100 pizze</b></div>}
            </Cadre>
          )}

          {/* Tendance des ventes (30/10/2026) : les catégories à gauche (le « mix » de l'ancienne page, cliquables),
              le graphique et les plats à droite. Deux tuiles en une, à la demande de Paul. */}
          {pp && categories.length > 0 && (() => {
            const n = pp.cles.length;
            const serie = (noms: string[], champ: "qty" | "ht") => { const out = Array.from({ length: n }, () => 0); for (const nom of noms) { const v = pp.produits[nom]?.[champ]; if (v) for (let i = 0; i < n; i++) out[i] += v[i] ?? 0; } return out; };
            const cat = categories.find((c) => c.cat === catTendance) ?? null;
            const noms = cat ? cat.lignes.map((l) => l.n) : categories.flatMap((c) => c.lignes.map((l) => l.n));
            const series = cat
              ? [{ libelle: cat.cat, couleur: cat.couleur, valeurs: serie(noms, mesure) }]
              : [{ libelle: "Tous produits", couleur: "#1a1a1a", valeurs: serie(noms, mesure) }];
            const maxHt = Math.max(1, ...categories.map((x) => x.ht));
            const lignesCat = cat ? [...cat.lignes].sort((a, b) => b.qty - a.qty) : [];
            const ligneCat = (libelle: string, couleur: string, ht: number, qty: number, active: boolean, onClick: () => void) => (
              <div key={libelle} className="pr-mix" onClick={onClick} aria-pressed={active} style={{ cursor: "pointer", borderRadius: 10, padding: "6px 8px", background: active ? "#f7f3ec" : undefined, boxShadow: active ? `inset 3px 0 0 ${couleur}` : undefined }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 12.5, marginBottom: 3 }}>
                  <span style={{ fontWeight: 700, color: couleurTexte(couleur) }}>{libelle}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: MUTED }}>{nombre(qty)}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "#f0ebe3", overflow: "hidden" }}><div style={{ width: `${Math.min(100, (ht / maxHt) * 100)}%`, height: "100%", background: couleur, borderRadius: 3 }} /></div>
                <div style={{ fontSize: 11, color: FAIBLE, marginTop: 2 }}>{euros(ht)} HT · {stats.ca_ht ? pct((ht / stats.ca_ht) * 100) : "—"}</div>
              </div>
            );
            return (
              <div id="tendance" style={{ scrollMarginTop: 70 }}>
                <Cadre titre="Tendance des ventes" sous={`Par catégorie de la carte, puis par ${pp.pas === "jour" ? "jour" : pp.pas === "semaine" ? "semaine" : "mois"}. Une catégorie à gauche, ses plats dessous, un clic sur un plat ouvre le zoom.`}
                  droite={<span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Chercher un produit…" style={{ ...CHAMP, height: 32, borderRadius: 20, width: 200, fontSize: 12.5 }} />
                    <span style={{ display: "inline-flex", background: "#ece4d4", borderRadius: 10, padding: 3, gap: 3 }}>
                      {(["qty", "ht"] as const).map((m) => <button key={m} type="button" onClick={() => setMesure(m)} aria-pressed={mesure === m} style={{ border: "none", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", background: mesure === m ? "#fff" : "transparent", color: mesure === m ? "#1a1a1a" : MUTED }}>{m === "qty" ? "Quantités" : "CA HT"}</button>)}
                    </span>
                  </span>}>
                  <div style={{ display: "grid", gridTemplateColumns: bureau ? "250px 1fr" : "1fr", gap: 14, alignItems: "start" }}>
                    <div style={{ display: "grid", gap: 2, borderRight: bureau ? `1px solid ${BORD}` : undefined, paddingRight: bureau ? 10 : 0 }}>
                      {ligneCat("Toutes les catégories", "#1a1a1a", stats.ca_ht, totalQty, !cat, () => setCatTendance("total"))}
                      {[...categories].sort((a, b) => b.ht - a.ht).map((c) => ligneCat(c.cat, c.couleur, c.ht, c.qty, cat?.cat === c.cat, () => setCatTendance(c.cat)))}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <GraphBarres sansValeurs={n > 12} format={(v) => (mesure === "qty" ? nombre(v) : euros(v))} etiquettes={pp.etiquettes} libelleAxe="Ventes" series={series} />
                      {cat ? (
                        <div style={{ marginTop: 14, borderTop: `1px solid ${BORD}`, paddingTop: 10 }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: couleurTexte(cat.couleur) }}>{cat.cat}</span>
                            <span style={{ fontSize: 12.5, color: MUTED }}>{lignesCat.length} produit{lignesCat.length > 1 ? "s" : ""} · {nombre(cat.qty)} vendus · {euros(cat.ht)} HT</span>
                          </div>
                          <div style={{ overflowX: "auto" }}>
                            <table style={{ borderCollapse: "collapse", width: "100%" }}>
                              <thead><tr><th style={{ ...TH, padding: 0, width: 6 }} /><th style={TH}>Produit</th><th style={{ ...TH, textAlign: "right" }}>Qté</th><th style={{ ...TH, textAlign: "right", color: COULEUR_MIDI }}>Midi</th><th style={{ ...TH, textAlign: "right", color: COULEUR_SOIR }}>Soir</th><th style={{ ...TH, textAlign: "right" }}>CA HT</th><th style={{ ...TH, textAlign: "right" }}>Part</th><th style={{ ...TH, textAlign: "right" }}>vs avant</th></tr></thead>
                              <tbody>
                                {lignesCat.map((p) => { const sv = svcProduit(p.n); return (
                                  <tr key={p.n} className="pr-ligne" onClick={() => setZoom(p.n)}>
                                    <td style={liseret(cat.couleur)} />
                                    <td style={{ ...TD, fontWeight: 600 }}>{p.n}</td>
                                    <td style={TDN}>{nombre(p.qty)}</td>
                                    <td style={{ ...TDN, color: MUTED }}>{sv ? nombre(sv.midi_qty) : "—"}</td>
                                    <td style={{ ...TDN, color: MUTED }}>{sv ? nombre(sv.soir_qty) : "—"}</td>
                                    <td style={TDN}>{euros(p.ca_ht)}</td>
                                    <td style={{ ...TDN, color: MUTED }}>{cat.qty ? pct((p.qty / cat.qty) * 100) : "—"}</td>
                                    <td style={TDN}>{delta(p, p.avant)}</td>
                                  </tr>
                                ); })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : q ? (
                        <div style={{ marginTop: 14, borderTop: `1px solid ${BORD}`, paddingTop: 10 }}>
                          <div style={{ fontSize: 12.5, color: MUTED, marginBottom: 6 }}>{categories.reduce((t, c) => t + c.lignes.length, 0)} produit{categories.reduce((t, c) => t + c.lignes.length, 0) > 1 ? "s" : ""} pour « {recherche.trim()} »</div>
                          <table style={{ borderCollapse: "collapse", width: "100%" }}>
                            <thead><tr><th style={{ ...TH, padding: 0, width: 6 }} /><th style={TH}>Produit</th><th style={{ ...TH, textAlign: "right" }}>Qté</th><th style={{ ...TH, textAlign: "right", color: COULEUR_MIDI }}>Midi</th><th style={{ ...TH, textAlign: "right", color: COULEUR_SOIR }}>Soir</th><th style={{ ...TH, textAlign: "right" }}>CA HT</th><th style={{ ...TH, textAlign: "right" }}>vs avant</th></tr></thead>
                            <tbody>
                              {categories.flatMap((c) => c.lignes.map((p) => { const sv = svcProduit(p.n); return (
                                <tr key={p.n} className="pr-ligne" onClick={() => setZoom(p.n)}>
                                  <td style={liseret(c.couleur)} />
                                  <td style={{ ...TD, fontWeight: 600 }}>{p.n}<div style={{ fontSize: 11, color: couleurTexte(c.couleur), fontWeight: 600 }}>{c.cat}</div></td>
                                  <td style={TDN}>{nombre(p.qty)}</td>
                                  <td style={{ ...TDN, color: MUTED }}>{sv ? nombre(sv.midi_qty) : "—"}</td>
                                  <td style={{ ...TDN, color: MUTED }}>{sv ? nombre(sv.soir_qty) : "—"}</td>
                                  <td style={TDN}>{euros(p.ca_ht)}</td>
                                  <td style={TDN}>{delta(p, p.avant)}</td>
                                </tr>
                              ); }))}
                              {categories.length === 0 && <tr><td colSpan={7} style={{ ...TD, color: FAIBLE }}>Aucun produit. Essaie un autre mot.</td></tr>}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div style={{ marginTop: 14, borderTop: `1px solid ${BORD}`, paddingTop: 10 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: MUTED, marginBottom: 8 }}>Top 3 par catégorie</div>
                          <div style={{ display: "grid", gridTemplateColumns: bureau ? "repeat(auto-fill, minmax(200px, 1fr))" : "1fr 1fr", gap: 8 }}>
                            {categories.map((c) => (
                              <div key={c.cat} style={{ border: `1px solid ${BORD}`, borderRadius: 10, overflow: "hidden", boxShadow: `inset 6px 0 0 ${c.couleur}`, cursor: "pointer" }} onClick={() => setCatTendance(c.cat)} title="Voir toute la catégorie">
                                <div style={{ padding: "7px 10px 4px 14px", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: couleurTexte(c.couleur) }}>{c.cat} <span style={{ color: FAIBLE, fontWeight: 500, letterSpacing: 0, textTransform: "none" }}>· {nombre(c.qty)}</span></div>
                                {[...c.lignes].sort((a, b) => b.qty - a.qty).slice(0, 3).map((p) => (
                                  <div key={p.n} onClick={(e) => { e.stopPropagation(); setZoom(p.n); }} className="pr-top" style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 10px 4px 14px", fontSize: 12.5 }}>
                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{p.n}</span>
                                    <span style={{ color: MUTED, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{nombre(p.qty)}</span>
                                  </div>
                                ))}
                                <div style={{ height: 6 }} />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </Cadre>
              </div>
            );
          })()}

          {/* Taux d'attache et midi / soir côte à côte, puis Top 10 et dormants (30/10) */}
          <div style={{ display: "grid", gridTemplateColumns: bureau ? "1.2fr 1fr" : "1fr", gap: 14, alignItems: "start" }}>
            <Cadre titre="Taux d'attache" sous="Part des tickets qui prennent au moins un produit de la famille, face à l'objectif. Un clic ouvre la catégorie." sansMarge>
              <div style={{ overflowX: "auto", marginTop: 10 }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead><tr><th style={{ ...TH, padding: 0, width: 6 }} /><th style={TH}>Famille</th><th style={{ ...TH, textAlign: "right" }}>Taux</th><th style={{ ...TH, textAlign: "right" }}>Objectif</th>{bureau && <><th style={{ ...TH, textAlign: "right" }}>Midi</th><th style={{ ...TH, textAlign: "right" }}>Soir</th></>}</tr></thead>
                  <tbody>
                    {FAMILLES.map((f) => {
                      const a = attache(stats, f.cle), t = taux(a, tickets), o = obj(f), c = couleurTaux(t, o);
                      const svc = (s: string) => { const r = stats.ratios_by_svc?.[s]?.[f.cle]; return r && r.total ? pct((r.tables / r.total) * 100) : "—"; };
                      return (
                        <tr key={f.cle} className="pr-ligne" onClick={() => voirCategorie(f.cat)}>
                          <td style={liseret(c)} />
                          <td style={{ ...TD, fontWeight: 600 }}>{f.libelle}{a && <div style={{ fontSize: 11.5, color: MUTED, fontWeight: 400 }}>{euros(a.ca_ht)} HT</div>}</td>
                          <td style={TDN}><span style={pastille(c)}>{t != null ? pct(t) : "—"}</span></td>
                          <td style={{ ...TDN, color: MUTED }}>{pct(o, 0)}</td>
                          {bureau && <><td style={TDN}>{svc("midi")}</td><td style={TDN}>{svc("soir")}</td></>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: "8px 16px 14px" }}><Note>Objectifs : Paramètres › Établissements, clés attache_*. Un ticket = une table ou une commande à emporter.</Note></div>
            </Cadre>
            {pp && (
              <Cadre titre="Midi et soir" sous="Ce qui part à chaque service, par catégorie. Un clic ouvre la catégorie." sansMarge>
                <div style={{ overflowX: "auto", marginTop: 10 }}>
                  <table style={{ borderCollapse: "collapse", width: "100%" }}>
                    <thead><tr><th style={{ ...TH, padding: 0, width: 6 }} /><th style={TH}>Catégorie</th><th style={{ ...TH, textAlign: "right", color: COULEUR_MIDI }}>Midi</th><th style={{ ...TH, textAlign: "right", color: COULEUR_SOIR }}>Soir</th></tr></thead>
                    <tbody>
                      {categories.map((c) => {
                        const midi = c.lignes.reduce((t, l) => t + (svcProduit(l.n)?.midi_qty ?? 0), 0), soir = c.lignes.reduce((t, l) => t + (svcProduit(l.n)?.soir_qty ?? 0), 0);
                        const tot = midi + soir, part = tot ? (midi / tot) * 100 : 0;
                        return (
                          <tr key={c.cat} className="pr-ligne" onClick={() => voirCategorie(c.cat)}>
                            <td style={liseret(c.couleur)} />
                            <td style={{ ...TD, fontWeight: 600 }}>{c.cat}
                              <div style={{ height: 5, borderRadius: 3, background: COULEUR_SOIR, marginTop: 5, overflow: "hidden" }}><div style={{ width: `${part}%`, height: "100%", background: COULEUR_MIDI }} /></div>
                            </td>
                            <td style={TDN}>{nombre(midi)}<div style={{ fontSize: 11, color: MUTED, fontWeight: 400 }}>{pct(part)}</div></td>
                            <td style={TDN}>{nombre(soir)}<div style={{ fontSize: 11, color: MUTED, fontWeight: 400 }}>{pct(100 - part)}</div></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Cadre>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: bureau ? "1fr 1fr" : "1fr", gap: 14, alignItems: "start" }}>
              <Cadre titre="Top 10" sous="Les produits les plus vendus, en quantité." sansMarge>
                <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 10 }}>
                  <thead><tr><th style={{ ...TH, padding: 0, width: 6 }} /><th style={TH}>Produit</th><th style={{ ...TH, textAlign: "right" }}>Qté</th><th style={{ ...TH, textAlign: "right" }}>CA HT</th><th style={{ ...TH, textAlign: "right" }}>vs avant</th></tr></thead>
                  <tbody>
                    {top10.map((p) => (
                      <tr key={p.n} className="pr-ligne" onClick={() => setZoom(p.n)}><td style={liseret(couleurProduit(p.n))} /><td style={{ ...TD, fontWeight: 600 }}>{p.n}</td><td style={TDN}>{nombre(p.qty)}</td><td style={TDN}>{euros(p.ca_ht)}</td><td style={TDN}>{delta(p, parNomPrec.get(p.n))}</td></tr>
                    ))}
                  </tbody>
                </table>
              </Cadre>
              <Cadre titre="Plats qui dorment" sous="Les cinq plats les moins vendus de la période." sansMarge bande={AMBRE}>
                <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 10 }}>
                  <tbody>
                    {(stats.bottom5 ?? []).map((p) => (
                      <tr key={p.n} className="pr-ligne" onClick={() => setZoom(p.n)}><td style={liseret(couleurProduit(p.n))} /><td style={{ ...TD, fontWeight: 600 }}>{p.n}</td><td style={TDN}>{nombre(p.qty)} vendu{p.qty > 1 ? "s" : ""}</td><td style={TDN}>{euros(p.ca_ht)}</td></tr>
                    ))}
                    {(stats.bottom5 ?? []).length === 0 && <tr><td style={{ ...TD, color: FAIBLE }} colSpan={4}>Rien à signaler.</td></tr>}
                  </tbody>
                </table>
              </Cadre>
          </div>

        </>
      )}
      {chargement && !stats && <Chargement texte="Chargement des ventes…" />}
    </div>
  );
}
