"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { fetchPriceAlerts, ALERT_THRESHOLD, type PriceAlert } from "@/lib/priceAlerts";
import { useEtablissement } from "@/lib/EtablissementContext";
import { CAT_LABELS, type Category } from "@/types/ingredients";
import { cachedSupplierColor, loadSupplierColors } from "@/lib/supplierColors";
import { useBureau } from "@/hooks/useBureau";
import { Tuile } from "@/components/ui/Tuile";
import { EtatVide } from "@/components/ui/EtatVide";
import { Cadre, Note, Chargement, TH, TD, TDN } from "@/components/analyse/Blocs";
import { GraphBarres } from "@/components/analyse/GraphBarres";
import { ATTENTION, BON, BORD, CADRE, CHAMP, FAIBLE, MAUVAIS, MUTED, filtre, h1, liseret, pastille, BTN } from "@/components/ui/charte";

/**
 * Achats › Variations de prix (refonte 29/10/2026, charte) : les offres fournisseurs dont le prix a changé,
 * sur une période, avec les alertes (≥ 5 %) à mettre en veille. Catalogue unifié : toutes les offres,
 * quel que soit le compte qui les a importées.
 */
const SNOOZE_KEY = "alertes-prix:snoozed";
const lireVeilles = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? "{}"); } catch { return {}; } };
const cle = (a: PriceAlert) => `${a.ingredient_id}__${a.supplier_id}`;
const PERIODES = [["7", "7 j"], ["30", "30 j"], ["90", "3 mois"], ["365", "12 mois"]] as const;
const depuis = (jours: number) => { const d = new Date(); d.setDate(d.getDate() - jours); return d.toISOString(); };
const pctTexte = (v: number) => `${v > 0 ? "+" : "−"}${Math.abs(v * 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
const prix = (v: number, u: string) => `${v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/${u}`;
const dateCourte = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" });

export function VariationsPrix({ enOnglet }: { enOnglet?: boolean }) {
  const bureau = useBureau();
  const { current: etab } = useEtablissement();
  const [etat, setEtat] = useState<{ chargement: boolean; erreur: string | null; alertes: PriceAlert[] }>({ chargement: true, erreur: null, alertes: [] });
  const [veilles, setVeilles] = useState<Record<string, string>>({});
  const [periode, setPeriode] = useState<"7" | "30" | "90" | "365">("30");
  const [seuil, setSeuil] = useState(5);
  const [fournisseur, setFournisseur] = useState("tous");
  const [sens, setSens] = useState<"tous" | "up" | "down" | "alertes" | "veille">("tous");
  const [recherche, setRecherche] = useState("");

  useEffect(() => {
    let annule = false;
    (async () => {
      setEtat((e) => ({ ...e, chargement: true, erreur: null }));
      try {
        setVeilles(lireVeilles());
        await loadSupplierColors(supabase);
        const alertes = await fetchPriceAlerts(supabase, "", 0.01, depuis(365), etab?.id);
        if (!annule) setEtat({ chargement: false, erreur: null, alertes });
      } catch (e) { if (!annule) setEtat({ chargement: false, erreur: e instanceof Error ? e.message : "Chargement impossible", alertes: [] }); }
    })();
    return () => { annule = true; };
  }, [etab?.id]);
  const veiller = (a: PriceAlert, oui: boolean) => {
    const n = { ...veilles };
    if (oui) { const d = new Date(); d.setDate(d.getDate() + 30); n[cle(a)] = d.toISOString(); } else delete n[cle(a)];
    try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(n)); } catch { /* navigation privée */ }
    setVeilles(n);
  };
  const maintenant = new Date().toISOString();
  const enVeille = (a: PriceAlert) => { const u = veilles[cle(a)]; return !!u && u > maintenant; };

  const fournisseurs = useMemo(() => [...new Map(etat.alertes.map((a) => [a.supplier_id, a.supplier_name])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [etat.alertes]);
  const limite = depuis(Number(periode));
  const q = recherche.trim().toLowerCase();
  const lignes = etat.alertes.filter((a) => {
    if (a.new_offer_date < limite) return false;
    if (Math.abs(a.change_pct) < seuil / 100) return false;
    if (fournisseur !== "tous" && a.supplier_id !== fournisseur) return false;
    if (q && !a.ingredient_name.toLowerCase().includes(q)) return false;
    if (sens === "up" && a.direction !== "up") return false;
    if (sens === "down" && a.direction !== "down") return false;
    if (sens === "alertes" && (Math.abs(a.change_pct) < ALERT_THRESHOLD || enVeille(a))) return false;
    if (sens === "veille" && !enVeille(a)) return false;
    return true;
  }).sort((a, b) => b.new_offer_date.localeCompare(a.new_offer_date));
  const hausses = lignes.filter((a) => a.direction === "up"), baisses = lignes.filter((a) => a.direction === "down");
  const alertesActives = etat.alertes.filter((a) => a.new_offer_date >= limite && Math.abs(a.change_pct) >= ALERT_THRESHOLD && !enVeille(a)).length;
  const moyenne = lignes.length ? lignes.reduce((t, a) => t + a.change_pct, 0) / lignes.length : 0;
  const parFournisseur = new Map<string, number>();
  for (const a of hausses) parFournisseur.set(a.supplier_name, (parFournisseur.get(a.supplier_name) ?? 0) + 1);
  const pire = [...parFournisseur.entries()].sort((a, b) => b[1] - a[1])[0];
  const mois = useMemo(() => Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() - 11 + i, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; }), []);
  const parMois = (dir: "up" | "down") => mois.map((m) => etat.alertes.filter((a) => a.new_offer_date.startsWith(m) && a.direction === dir && Math.abs(a.change_pct) >= seuil / 100 && (fournisseur === "tous" || a.supplier_id === fournisseur)).length);

  return (
    <div style={enOnglet ? { display: "grid", gap: 14 } : { maxWidth: 1100, margin: "0 auto", padding: bureau ? "18px 28px 60px" : "12px 14px 60px", display: "grid", gap: 14, alignContent: "start" }}>
      <style>{`.vp-ligne:hover td{background:#f7f3ec}`}</style>
      {!enOnglet && (
        <div>
          <h1 style={h1(bureau)}>Variations de prix</h1>
          <div style={{ color: MUTED, fontSize: 13, marginTop: 4 }}>Quels prix fournisseurs ont bougé ? Les hausses à négocier, les baisses à répercuter, les alertes à traiter.</div>
        </div>
      )}
      {etat.erreur && <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(180,68,58,0.08)", color: MAUVAIS, fontSize: 13 }}>{etat.erreur}</div>}
      {etat.chargement ? <Chargement texte="Lecture des offres fournisseurs…" /> : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: bureau ? "repeat(4, 1fr)" : "repeat(2, 1fr)", gap: 8 }}>
            <Tuile compacte={!bureau} icone="alerte" libelle="Alertes à traiter" valeur={alertesActives} couleur={alertesActives ? MAUVAIS : MUTED} sous={`≥ ${ALERT_THRESHOLD * 100} %, hors veille`} active={sens === "alertes"} onClick={() => setSens(sens === "alertes" ? "tous" : "alertes")} />
            <Tuile compacte={!bureau} icone="produit" libelle="Hausses" valeur={hausses.length} couleur={hausses.length ? ATTENTION : MUTED} sous={pire ? `${pire[0]} : ${pire[1]}` : "aucune"} active={sens === "up"} onClick={() => setSens(sens === "up" ? "tous" : "up")} />
            <Tuile compacte={!bureau} icone="recu" libelle="Baisses" valeur={baisses.length} couleur={baisses.length ? BON : MUTED} sous="à répercuter sur les fiches" active={sens === "down"} onClick={() => setSens(sens === "down" ? "tous" : "down")} />
            <Tuile compacte={!bureau} icone="euro" libelle="Variation moyenne" valeur={lignes.length ? pctTexte(moyenne) : "—"} couleur={moyenne > 0 ? ATTENTION : BON} sous={`${lignes.length} changement${lignes.length > 1 ? "s" : ""} sur la période`} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {PERIODES.map(([v, l]) => <button key={v} type="button" onClick={() => setPeriode(v)} style={filtre(periode === v)}>{l}</button>)}
            <select value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} style={{ ...CHAMP, borderRadius: 20, fontWeight: 600, maxWidth: 220 }}>
              <option value="tous">Tous les fournisseurs</option>
              {fournisseurs.map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
            </select>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: MUTED }}>Seuil
              <input type="number" min={1} max={50} value={seuil} onChange={(e) => setSeuil(Math.max(1, Number(e.target.value) || 1))} style={{ ...CHAMP, width: 64, textAlign: "right", fontWeight: 600 }} /> %
            </label>
            <button type="button" onClick={() => setSens(sens === "veille" ? "tous" : "veille")} style={filtre(sens === "veille")}>En veille</button>
            <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Chercher un produit…" style={{ ...CHAMP, borderRadius: 20, flex: "1 1 160px", minWidth: 0, maxWidth: 320 }} />
          </div>

          <Cadre titre="Hausses et baisses par mois" sous="Nombre de changements de prix au-dessus du seuil, douze derniers mois.">
            <GraphBarres format={(v) => `${v}`} etiquettes={mois.map((m) => new Date(m + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "short" }))}
              series={[{ libelle: "Hausses", couleur: ATTENTION, valeurs: parMois("up") }, { libelle: "Baisses", couleur: BON, valeurs: parMois("down") }]} />
          </Cadre>

          <div style={CADRE}>
            {lignes.length === 0 ? <EtatVide icone="produit" titre="Aucun changement de prix" texte="Sur cette période et avec ce seuil, rien n'a bougé." /> : (
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr>
                  <th style={{ ...TH, padding: 0, width: 6 }} /><th style={TH}>Produit</th>{bureau && <th style={TH}>Fournisseur</th>}<th style={{ ...TH, textAlign: "right" }}>Prix</th><th style={{ ...TH, textAlign: "right" }}>Variation</th>{bureau && <th style={{ ...TH, textAlign: "right" }}>Date</th>}<th style={{ ...TH, width: 90 }} />
                </tr></thead>
                <tbody>
                  {lignes.map((a) => {
                    const veille = enVeille(a), c = cachedSupplierColor(a.supplier_name) || FAIBLE;
                    return (
                      <tr key={cle(a) + a.new_offer_date} className="vp-ligne" style={{ opacity: veille ? 0.55 : 1 }}>
                        <td style={liseret(c)} />
                        <td style={TD}><Link href={`/ingredients?edit=${a.ingredient_id}`} style={{ color: "#1a1a1a", textDecoration: "none", fontWeight: 600 }}>{a.ingredient_name}</Link><div style={{ fontSize: 11.5, color: MUTED }}>{bureau ? (CAT_LABELS[a.ingredient_category as Category] ?? a.ingredient_category ?? "") : `${a.supplier_name} · ${dateCourte(a.new_offer_date)}`}</div></td>
                        {bureau && <td style={{ ...TD, color: c, fontWeight: 600 }}>{a.supplier_name}</td>}
                        <td style={{ ...TDN, whiteSpace: "nowrap" }}><span style={{ color: MUTED }}>{prix(a.old_price, a.unit)}</span> → <b>{prix(a.new_price, a.unit)}</b></td>
                        <td style={TDN}><span style={pastille(a.aberrant ? MAUVAIS : a.direction === "up" ? ATTENTION : BON)}>{pctTexte(a.change_pct)}{a.aberrant ? " · à vérifier" : ""}</span></td>
                        {bureau && <td style={{ ...TDN, color: MUTED }}>{dateCourte(a.new_offer_date)}</td>}
                        <td style={{ ...TDN, paddingRight: 10 }}>
                          {Math.abs(a.change_pct) >= ALERT_THRESHOLD && <button type="button" onClick={() => veiller(a, !veille)} style={{ ...BTN, padding: "3px 10px", fontSize: 11, color: MUTED, borderColor: BORD }}>{veille ? "Réactiver" : "Veille 30 j"}</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <Note>Comparaison entre l&apos;offre active d&apos;un produit chez un fournisseur et la précédente. Une variation au-delà de 50 % est signalée « à vérifier » (souvent un conditionnement différent sur la facture).</Note>
        </>
      )}
    </div>
  );
}
