"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useEtablissement } from "@/lib/EtablissementContext";
import { BORD, BTN, CADRE, FAIBLE, MUTED, TD, TH, liseret, pastille, INTERTITRE } from "@/components/ui/charte";
import { couleurTexteSur, styleBarreCategorie, stylePastilleBarre, styleTitreCategorie } from "@/lib/styleCategories";
import { cachedSupplierColor, loadSupplierColors } from "@/lib/supplierColors";
import { EtatVide } from "@/components/ui/EtatVide";
import { clesPersonnel, estLignePersonnel } from "@/lib/achats/personnel";
import { CAT_LABELS } from "@/types/ingredients";

/**
 * Courses du personnel (29/10/2026) : la liste de courses des produits cochés « repas du personnel »
 * dans la Base produits, groupés par fournisseur (Metro surtout), à cocher en faisant les courses ;
 * et le relevé du mois pour le cabinet (avantages en nature, compte 647), d'après les factures importées.
 * Rien n'est écrit dans Pennylane : l'app constate et guide.
 */
type Produit = { id: string; name: string; category: string; sub_category: string | null; import_name: string | null; supplier_id: string | null; order_unit_label: string | null; order_quantity: number | null };
type Ligne = { nom: string; date: string; fournisseur: string; facture: string; quantite: number; unite: string; total: number };

const CLE_COCHES = "courses-personnel:coches";
const abonnes = new Set<() => void>();
function lireCoches(): string[] {
  try { return JSON.parse(localStorage.getItem(CLE_COCHES) ?? "[]") as string[]; } catch { return []; }
}
let cacheCoches: string[] | null = null;
let cacheBrut = "";
function snapshotCoches(): string[] {
  const brut = (() => { try { return localStorage.getItem(CLE_COCHES) ?? "[]"; } catch { return "[]"; } })();
  if (cacheCoches === null || brut !== cacheBrut) { cacheBrut = brut; cacheCoches = lireCoches(); }
  return cacheCoches;
}
function ecrireCoches(ids: string[]) {
  try { localStorage.setItem(CLE_COCHES, JSON.stringify(ids)); } catch { /* stockage indisponible */ }
  abonnes.forEach((f) => f());
}
const abonner = (f: () => void) => { abonnes.add(f); return () => { abonnes.delete(f); }; };
const VIDE: string[] = [];

const euros = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const moisDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const libelleMois = (m: string) => new Date(m + "-15T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

export function CoursesPersonnel({ bureau }: { bureau: boolean }) {
  const { current: etab } = useEtablissement();
  const etabId = etab?.id ?? "";
  const [produits, setProduits] = useState<Produit[] | null>(null);
  const [fournisseurs, setFournisseurs] = useState<Map<string, string>>(new Map());
  const [erreur, setErreur] = useState<string | null>(null);
  const coches = useSyncExternalStore(abonner, snapshotCoches, () => VIDE);
  const [mois, setMois] = useState(() => moisDe(new Date()));
  const [lignes, setLignes] = useState<{ mois: string; lignes: Ligne[] } | null>(null);

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        await loadSupplierColors(supabase);
        const [{ data: p, error: e1 }, { data: f }] = await Promise.all([
          supabase.from("ingredients").select("id, name, category, sub_category, import_name, supplier_id, order_unit_label, order_quantity").eq("pour_personnel", true).eq("is_active", true).order("name"),
          supabase.from("suppliers").select("id, name"),
        ]);
        if (e1) throw new Error(e1.message);
        if (annule) return;
        setFournisseurs(new Map((f ?? []).map((x) => [x.id as string, x.name as string])));
        setProduits((p ?? []) as Produit[]);
      } catch (e) { if (!annule) setErreur(e instanceof Error ? e.message : "Chargement impossible"); }
    })();
    return () => { annule = true; };
  }, []);

  // Relevé du mois : lignes des factures importées dont le nom est celui d'un produit du personnel
  useEffect(() => {
    if (!etabId || !produits) return;
    let annule = false;
    (async () => {
      const cles = clesPersonnel(produits);
      const debut = `${mois}-01`, fin = new Date(Number(mois.slice(0, 4)), Number(mois.slice(5, 7)), 0).toISOString().slice(0, 10);
      const { data: factures } = await supabase.from("supplier_invoices").select("id, invoice_number, invoice_date, suppliers(name)").eq("etablissement_id", etabId).gte("invoice_date", debut).lte("invoice_date", fin);
      const liste = (factures ?? []) as unknown as { id: string; invoice_number: string | null; invoice_date: string; suppliers: { name: string } | null }[];
      const parFacture = new Map(liste.map((x) => [x.id, x]));
      const ids = liste.map((x) => x.id);
      const res: Ligne[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await supabase.from("supplier_invoice_lines").select("name, quantity, unit, total_price, invoice_id").in("invoice_id", ids.slice(i, i + 200));
        for (const l of (data ?? []) as { name: string | null; quantity: number | null; unit: string | null; total_price: number | null; invoice_id: string }[]) {
          if (!estLignePersonnel(l.name, cles)) continue;
          const f = parFacture.get(l.invoice_id);
          res.push({ nom: l.name ?? "", date: f?.invoice_date ?? "", fournisseur: f?.suppliers?.name ?? "—", facture: f?.invoice_number ?? "", quantite: l.quantity ?? 0, unite: l.unit ?? "", total: l.total_price ?? 0 });
        }
      }
      res.sort((a, b) => a.date.localeCompare(b.date) || a.nom.localeCompare(b.nom, "fr"));
      if (!annule) setLignes({ mois, lignes: res });
    })();
    return () => { annule = true; };
  }, [etabId, produits, mois]);

  const groupes = useMemo(() => {
    const m = new Map<string, Produit[]>();
    for (const p of produits ?? []) { const nom = (p.supplier_id && fournisseurs.get(p.supplier_id)) || "Sans fournisseur"; (m.get(nom) ?? m.set(nom, []).get(nom)!).push(p); }
    return [...m.entries()].map(([nom, items]) => ({ nom, couleur: nom === "Sans fournisseur" ? "#b0a894" : cachedSupplierColor(nom), items: items.sort((a, b) => a.name.localeCompare(b.name, "fr")) })).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  }, [produits, fournisseurs]);
  const cochesSet = useMemo(() => new Set(coches), [coches]);
  const basculer = (id: string) => ecrireCoches(cochesSet.has(id) ? coches.filter((x) => x !== id) : [...coches, id]);
  const total = lignes?.lignes.reduce((t, l) => t + l.total, 0) ?? 0;
  const decalerMois = (n: number) => { const d = new Date(mois + "-15T12:00:00"); d.setMonth(d.getMonth() + n); setMois(moisDe(d)); };
  const nbProduits = produits?.length ?? 0;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {erreur && <div style={{ ...CADRE, padding: 14, color: "#b4443a", fontSize: 13 }}>Erreur : {erreur}</div>}
      {produits && nbProduits === 0 && !erreur && (
        <div style={CADRE}><EtatVide icone="produit" titre="Aucun produit du personnel" texte="Dans la Base produits, ouvre une fiche et coche « Repas du personnel » : elle apparaîtra ici, dans la liste de courses." action={<Link href="/ingredients" style={{ ...BTN, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Base produits</Link>} /></div>
      )}
      {nbProduits > 0 && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12.5, color: MUTED }}>{nbProduits} produit{nbProduits > 1 ? "s" : ""} · {cochesSet.size} dans le panier</span>
            <button type="button" style={{ ...BTN, marginLeft: "auto" }} onClick={() => ecrireCoches([])} disabled={cochesSet.size === 0}>Tout décocher</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: bureau ? "repeat(auto-fit, minmax(300px, 1fr))" : "1fr", gap: 12, alignItems: "start" }}>
            {groupes.map((g) => (
              <div key={g.nom}>
                <div style={{ ...styleBarreCategorie(g.couleur), minHeight: 44, gap: 10, padding: "0 14px", boxShadow: "none", borderRadius: "14px 14px 0 0", cursor: "default" }}>
                  <span style={styleTitreCategorie(g.couleur)}>{g.nom}</span>
                  <span style={stylePastilleBarre(g.couleur)}>{g.items.length}</span>
                  <span style={{ marginLeft: "auto", fontSize: 12, color: couleurTexteSur(g.couleur), opacity: 0.9 }}>{g.items.filter((p) => cochesSet.has(p.id)).length} coché{g.items.filter((p) => cochesSet.has(p.id)).length > 1 ? "s" : ""}</span>
                </div>
                <div style={{ ...CADRE, borderTop: 0, borderRadius: "0 0 14px 14px", overflow: "hidden" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%" }}>
                    <tbody>
                      {g.items.map((p) => {
                        const coche = cochesSet.has(p.id);
                        return (
                          <tr key={p.id} onClick={() => basculer(p.id)} style={{ cursor: "pointer", background: coche ? "#f7f3ec" : undefined }}>
                            <td style={liseret(g.couleur)} />
                            <td style={{ ...TD, width: 28, padding: "9px 4px 9px 10px" }}><input type="checkbox" checked={coche} readOnly style={{ margin: 0, accentColor: "#4a6741", pointerEvents: "none" }} /></td>
                            <td style={TD}>
                              <div style={{ fontWeight: 600, textDecoration: coche ? "line-through" : "none", color: coche ? FAIBLE : "#1a1a1a" }}>{p.name}</div>
                              <div style={{ fontSize: 11.5, color: MUTED }}>{(CAT_LABELS as Record<string, string>)[p.category] ?? p.category}{p.sub_category ? ` · ${p.sub_category}` : ""}{p.order_unit_label ? ` · ${p.order_quantity ?? 1} ${p.order_unit_label}` : ""}</div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Relevé du mois pour le cabinet : avantages en nature (647), d'après les factures importées */}
      <section style={CADRE}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "14px 16px 10px", borderBottom: `1px solid ${BORD}` }}>
          <div>
            <div style={INTERTITRE}>Relevé pour le cabinet · avantages en nature</div>
            <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>Les lignes des factures importées qui portent un produit du personnel. À transmettre au cabinet (compte 647) ; rien n&apos;est écrit dans Pennylane.</div>
          </div>
          <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4 }}>
            <button type="button" style={{ ...BTN, height: 32, padding: "0 10px" }} onClick={() => decalerMois(-1)} aria-label="Mois précédent">‹</button>
            <span style={{ fontSize: 13, fontWeight: 700, minWidth: 130, textAlign: "center", textTransform: "capitalize" }}>{libelleMois(mois)}</span>
            <button type="button" style={{ ...BTN, height: 32, padding: "0 10px" }} onClick={() => decalerMois(1)} aria-label="Mois suivant">›</button>
          </div>
        </div>
        {!lignes || lignes.mois !== mois ? <div style={{ padding: 20, textAlign: "center", color: MUTED, fontSize: 13 }}>Chargement…</div>
        : lignes.lignes.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: MUTED, fontSize: 13 }}>Aucune ligne de facture reconnue ce mois-ci.</div>
        : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr><th style={TH}>Date</th><th style={TH}>Fournisseur</th><th style={TH}>Produit</th>{bureau && <th style={TH}>Facture</th>}<th style={{ ...TH, textAlign: "right" }}>Qté</th><th style={{ ...TH, textAlign: "right" }}>HT</th></tr></thead>
              <tbody>
                {lignes.lignes.map((l, i) => (
                  <tr key={i}>
                    <td style={{ ...TD, whiteSpace: "nowrap" }}>{new Date(l.date + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</td>
                    <td style={TD}><span style={pastille(cachedSupplierColor(l.fournisseur))}>{l.fournisseur}</span></td>
                    <td style={{ ...TD, fontWeight: 600 }}>{l.nom}</td>
                    {bureau && <td style={{ ...TD, color: MUTED }}>{l.facture}</td>}
                    <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap" }}>{l.quantite} {l.unite}</td>
                    <td style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{euros(l.total)}</td>
                  </tr>
                ))}
                <tr><td colSpan={bureau ? 5 : 4} style={{ ...TD, fontWeight: 700, borderBottom: "none" }}>Total du mois</td><td style={{ ...TD, textAlign: "right", fontWeight: 700, borderBottom: "none", fontVariantNumeric: "tabular-nums" }}>{euros(total)}</td></tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
