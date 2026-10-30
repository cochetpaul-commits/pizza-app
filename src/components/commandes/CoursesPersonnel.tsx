"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useEtablissement } from "@/lib/EtablissementContext";
import { BON, BORD, BTN, CADRE, FAIBLE, MUTED, TD, TH, liseret, pastille, INTERTITRE } from "@/components/ui/charte";
import { couleurTexteSur, styleBarreCategorie, stylePastilleBarre, styleTitreCategorie } from "@/lib/styleCategories";
import { cachedSupplierColor, loadSupplierColors } from "@/lib/supplierColors";
import { EtatVide } from "@/components/ui/EtatVide";
import { clesPersonnel, estLignePersonnel } from "@/lib/achats/personnel";
import { probablePersonnel } from "@/lib/achats/probablePersonnel";
import { CAT_LABELS } from "@/types/ingredients";
import { employeTabletteActif } from "@/lib/tablette/store";

/**
 * Repas du personnel (30/10/2026, d'après Paul) : pas un menu, un bouton dans Commandes.
 * 1. La liste de courses, partagée : les produits cochés « repas du personnel », groupés par fournisseur (Metro surtout),
 *    cochés par n'importe qui en faisant les courses, vus par tous (table courses_personnel).
 * 2. Le tri : à mesure que les factures Metro arrivent, les fiches Metro pas encore triées sont proposées,
 *    les plus probables en tête ; un clic « Personnel » ou « Restaurant » et on n'y revient plus.
 * 3. Le relevé du mois pour le cabinet (avantages en nature, compte 647), d'après les factures importées.
 * Rien n'est écrit dans Pennylane : l'app constate et guide.
 */
type Produit = { id: string; name: string; category: string; sub_category: string | null; import_name: string | null; supplier_id: string | null; order_unit_label: string | null; order_quantity: number | null; pour_personnel: boolean; personnel_tri_at: string | null };
type Ligne = { nom: string; date: string; fournisseur: string; facture: string; quantite: number; unite: string; total: number };

const euros = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const moisDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const libelleMois = (m: string) => new Date(m + "-15T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
const libelleCat = (c: string) => (CAT_LABELS as Record<string, string>)[c] ?? c;

export function CoursesPersonnel({ bureau }: { bureau: boolean }) {
  const { current: etab } = useEtablissement();
  const etabId = etab?.id ?? "";
  const [produits, setProduits] = useState<Produit[] | null>(null);
  const [fournisseurs, setFournisseurs] = useState<Map<string, string>>(new Map());
  const [coches, setCoches] = useState<Set<string>>(new Set());
  const [erreur, setErreur] = useState<string | null>(null);
  const [mois, setMois] = useState(() => moisDe(new Date()));
  const [lignes, setLignes] = useState<{ mois: string; lignes: Ligne[] } | null>(null);
  const [triOuvert, setTriOuvert] = useState(false);
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    try {
      await loadSupplierColors(supabase);
      const [{ data: f }, { data: c, error: e2 }] = await Promise.all([
        supabase.from("suppliers").select("id, name"),
        etabId ? supabase.from("courses_personnel").select("ingredient_id").eq("etablissement_id", etabId) : Promise.resolve({ data: [], error: null }),
      ]);
      if (e2) throw new Error(e2.message);
      const noms = new Map((f ?? []).map((x) => [x.id as string, x.name as string]));
      const idsMetro = [...noms.entries()].filter(([, n]) => /metro/i.test(n)).map(([id]) => id);
      // Les fiches du personnel, plus les fiches Metro pas encore triées (proposition)
      const [{ data: p1, error: e1 }, { data: p2, error: e3 }] = await Promise.all([
        supabase.from("ingredients").select("id, name, category, sub_category, import_name, supplier_id, order_unit_label, order_quantity, pour_personnel, personnel_tri_at").eq("pour_personnel", true).eq("is_active", true).order("name"),
        idsMetro.length ? supabase.from("ingredients").select("id, name, category, sub_category, import_name, supplier_id, order_unit_label, order_quantity, pour_personnel, personnel_tri_at").in("supplier_id", idsMetro).eq("is_active", true).eq("pour_personnel", false).is("personnel_tri_at", null).order("name") : Promise.resolve({ data: [], error: null }),
      ]);
      if (e1) throw new Error(e1.message);
      if (e3) throw new Error(e3.message);
      setFournisseurs(noms);
      setCoches(new Set((c ?? []).map((x) => x.ingredient_id as string)));
      setProduits([...((p1 ?? []) as Produit[]), ...((p2 ?? []) as Produit[])]);
    } catch (e) { setErreur(e instanceof Error ? e.message : "Chargement impossible"); }
  }, [etabId]);
  useEffect(() => { void charger(); }, [charger]);

  const perso = useMemo(() => (produits ?? []).filter((p) => p.pour_personnel), [produits]);
  const aTrier = useMemo(() => (produits ?? []).filter((p) => !p.pour_personnel).map((p) => ({ ...p, probable: probablePersonnel(p.name) || probablePersonnel(p.import_name ?? "") })).sort((a, b) => Number(b.probable) - Number(a.probable) || a.name.localeCompare(b.name, "fr")), [produits]);

  // Relevé du mois : lignes des factures importées dont le nom est celui d'un produit du personnel
  useEffect(() => {
    if (!etabId || !produits) return;
    let annule = false;
    (async () => {
      const cles = clesPersonnel(perso);
      const debut = `${mois}-01`, fin = new Date(Number(mois.slice(0, 4)), Number(mois.slice(5, 7)), 0).toISOString().slice(0, 10);
      const { data: factures } = await supabase.from("supplier_invoices").select("id, invoice_number, invoice_date, suppliers(name)").eq("etablissement_id", etabId).gte("invoice_date", debut).lte("invoice_date", fin);
      const liste = (factures ?? []) as unknown as { id: string; invoice_number: string | null; invoice_date: string; suppliers: { name: string } | null }[];
      const parFacture = new Map(liste.map((x) => [x.id, x]));
      const ids = liste.map((x) => x.id);
      const res: Ligne[] = [];
      for (let i = 0; i < ids.length && cles.size; i += 200) {
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
  }, [etabId, produits, perso, mois]);

  const groupes = useMemo(() => {
    const m = new Map<string, Produit[]>();
    for (const p of perso) { const nom = (p.supplier_id && fournisseurs.get(p.supplier_id)) || "Sans fournisseur"; (m.get(nom) ?? m.set(nom, []).get(nom)!).push(p); }
    return [...m.entries()].map(([nom, items]) => ({ nom, couleur: nom === "Sans fournisseur" ? "#b0a894" : cachedSupplierColor(nom), items: items.sort((a, b) => a.name.localeCompare(b.name, "fr")) })).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  }, [perso, fournisseurs]);

  // Coche partagée : écrite en base, visible par tous ; l'affichage suit tout de suite, la base confirme
  const basculer = async (id: string) => {
    if (!etabId) return;
    const etait = coches.has(id);
    setCoches((s) => { const n = new Set(s); if (etait) n.delete(id); else n.add(id); return n; });
    const { data: u } = await supabase.auth.getUser();
    const r = etait
      ? await supabase.from("courses_personnel").delete().eq("etablissement_id", etabId).eq("ingredient_id", id)
      : await supabase.from("courses_personnel").upsert({ etablissement_id: etabId, ingredient_id: id, coche_par: u.user?.id ?? null, employe_id: employeTabletteActif()?.id ?? null, coche_at: new Date().toISOString() });
    if (r.error) { setErreur(r.error.message); void charger(); }
  };
  const toutDecocher = async () => {
    if (!etabId) return;
    setCoches(new Set());
    const r = await supabase.from("courses_personnel").delete().eq("etablissement_id", etabId);
    if (r.error) { setErreur(r.error.message); void charger(); }
  };
  // Tri des fiches Metro : « Personnel » coche la fiche, « Restaurant » la range pour de bon
  const trier = async (ids: string[], personnel: boolean) => {
    if (!ids.length) return;
    setOccupe(true);
    const r = await supabase.from("ingredients").update({ pour_personnel: personnel, personnel_tri_at: new Date().toISOString() }).in("id", ids);
    if (r.error) setErreur(r.error.message);
    await charger();
    setOccupe(false);
  };

  const total = lignes?.lignes.reduce((t, l) => t + l.total, 0) ?? 0;
  const decalerMois = (n: number) => { const d = new Date(mois + "-15T12:00:00"); d.setMonth(d.getMonth() + n); setMois(moisDe(d)); };
  const nbProbables = aTrier.filter((p) => p.probable).length;

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {erreur && <div style={{ ...CADRE, padding: 14, color: "#b4443a", fontSize: 13 }}>Erreur : {erreur}</div>}

      {/* Tri des fiches Metro pas encore classées : proposition, les plus probables en tête */}
      {aTrier.length > 0 && (
        <section style={{ ...CADRE, boxShadow: "inset 6px 0 0 #b7791f" }}>
          <button type="button" onClick={() => setTriOuvert((v) => !v)} style={{ display: "flex", width: "100%", alignItems: "center", gap: 10, padding: "12px 16px", border: "none", background: "transparent", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
            <div style={{ flex: 1 }}>
              <div style={INTERTITRE}>À trier · {aTrier.length} fiche{aTrier.length > 1 ? "s" : ""} Metro</div>
              <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>{nbProbables ? `${nbProbables} ressemble${nbProbables > 1 ? "nt" : ""} à des courses pour l'équipe, en tête de liste. ` : ""}Un clic « Personnel » ou « Restaurant » par fiche ; les nouvelles fiches Metro reviendront ici à la prochaine facture.</div>
            </div>
            <span style={pastille("#b7791f")}>{aTrier.length}</span>
            <span style={{ color: FAIBLE, transform: triOuvert ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▼</span>
          </button>
          {triOuvert && (
            <div style={{ borderTop: `1px solid ${BORD}` }}>
              <div style={{ overflowX: "auto", maxHeight: 460, overflowY: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead><tr><th style={TH}>Produit</th>{bureau && <th style={TH}>Catégorie</th>}<th style={{ ...TH, textAlign: "right" }}>Pour qui ?</th></tr></thead>
                  <tbody>
                    {aTrier.map((p) => (
                      <tr key={p.id} style={{ background: p.probable ? "#fdf7ec" : undefined }}>
                        <td style={{ ...TD, fontWeight: 600 }}>{p.name}{p.probable && <span style={{ ...pastille("#b7791f"), marginLeft: 8 }}>probable</span>}</td>
                        {bureau && <td style={{ ...TD, color: MUTED }}>{libelleCat(p.category)}{p.sub_category ? ` · ${p.sub_category}` : ""}</td>}
                        <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap" }}>
                          <button type="button" disabled={occupe} onClick={() => trier([p.id], true)} style={{ ...BTN, height: 30, padding: "0 12px", background: BON, color: "#fff", border: "none", marginRight: 6 }}>Personnel</button>
                          <button type="button" disabled={occupe} onClick={() => trier([p.id], false)} style={{ ...BTN, height: 30, padding: "0 12px" }}>Restaurant</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "10px 16px", borderTop: `1px solid ${BORD}`, fontSize: 12.5, color: MUTED }}>
                <span>Tout ce qui n&apos;est pas coché « Personnel » est pour le restaurant :</span>
                <button type="button" disabled={occupe} onClick={() => trier(aTrier.map((p) => p.id), false)} style={{ ...BTN, height: 32 }}>Le reste est pour le restaurant</button>
              </div>
            </div>
          )}
        </section>
      )}

      {produits && perso.length === 0 && !erreur && (
        <div style={CADRE}><EtatVide icone="produit" titre="Aucun produit du personnel" texte={aTrier.length ? "Ouvre « À trier » ci-dessus et marque « Personnel » les produits achetés pour l'équipe." : "Dans la Base produits, ouvre une fiche et coche « Repas du personnel » : elle apparaîtra ici, dans la liste de courses."} action={<Link href="/ingredients" style={{ ...BTN, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Base produits</Link>} /></div>
      )}
      {perso.length > 0 && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12.5, color: MUTED }}>{perso.length} produit{perso.length > 1 ? "s" : ""} · {coches.size} coché{coches.size > 1 ? "s" : ""} · liste partagée, chacun voit ce que l&apos;autre a coché</span>
            <button type="button" style={{ ...BTN, marginLeft: "auto" }} onClick={toutDecocher} disabled={coches.size === 0}>Tout décocher</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: bureau ? "repeat(auto-fit, minmax(300px, 1fr))" : "1fr", gap: 12, alignItems: "start" }}>
            {groupes.map((g) => {
              const nbCoches = g.items.filter((p) => coches.has(p.id)).length;
              return (
                <div key={g.nom}>
                  <div style={{ ...styleBarreCategorie(g.couleur), minHeight: 44, gap: 10, padding: "0 14px", boxShadow: "none", borderRadius: "14px 14px 0 0", cursor: "default" }}>
                    <span style={styleTitreCategorie(g.couleur)}>{g.nom}</span>
                    <span style={stylePastilleBarre(g.couleur)}>{g.items.length}</span>
                    <span style={{ marginLeft: "auto", fontSize: 12, color: couleurTexteSur(g.couleur), opacity: 0.9 }}>{nbCoches} coché{nbCoches > 1 ? "s" : ""}</span>
                  </div>
                  <div style={{ ...CADRE, borderTop: 0, borderRadius: "0 0 14px 14px", overflow: "hidden" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%" }}>
                      <tbody>
                        {g.items.map((p) => {
                          const coche = coches.has(p.id);
                          return (
                            <tr key={p.id} role="checkbox" aria-checked={coche} onClick={() => basculer(p.id)} style={{ cursor: "pointer", background: coche ? "#f7f3ec" : undefined }}>
                              <td style={liseret(g.couleur)} />
                              <td style={TD}>
                                <div style={{ fontWeight: 600, textDecoration: coche ? "line-through" : "none", color: coche ? FAIBLE : "#1a1a1a" }}>{p.name}</div>
                                <div style={{ fontSize: 11.5, color: MUTED }}>{libelleCat(p.category)}{p.sub_category ? ` · ${p.sub_category}` : ""}{p.order_unit_label ? ` · ${p.order_quantity ?? 1} ${p.order_unit_label}` : ""}</div>
                              </td>
                              <td style={{ ...TD, width: 30, textAlign: "right", color: coche ? BON : FAIBLE, fontWeight: 700 }}>{coche ? "✓" : ""}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
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
