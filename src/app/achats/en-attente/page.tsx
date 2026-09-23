"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RequireRole } from "@/components/RequireRole";
import { fetchApi } from "@/lib/fetchApi";
import { useEtablissement } from "@/lib/EtablissementContext";
import { supabase } from "@/lib/supabaseClient";

type Produit = {
  cle: string; sku: string | null; libelle: string; lignes: number; factures: number;
  quantite: number | null; unite: string | null; montant_ht: number;
  dernier_prix: number | null; derniere_date: string | null; derniere_facture_id: string | null; derniere_facture_numero: string | null;
};
type RefIgnoree = { id: string; supplier_id: string; sku: string; label: string | null; created_at: string };
type Fournisseur = { supplier_id: string; nom: string; lignes: number; montant_ht: number; factures_total: number; produits: Produit[]; ignorees: RefIgnoree[] };
type Reponse = { ok: boolean; periode: { depuis: string; mois: number }; factures: number; lignes: number; fournisseurs: Fournisseur[]; error?: string };

const eur = (n: number | null | undefined) => n == null ? "—" : n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const dateFr = (d: string | null) => d ? new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";
const unite = (u: string | null) => u === "kg" ? "kg" : u === "l" ? "L" : u === "pc" ? "pc" : (u ?? "");

/**
 * Lignes de facture sans fiche produit, par fournisseur, sur 6 mois : nombre
 * d'achats, montant, dernier prix. Deux actions : créer la fiche d'une ligne
 * (logique de l'import) et relancer le rapprochement d'un fournisseur à partir
 * des lignes déjà en base (sans relire les PDF).
 */
export default function LignesEnAttentePage() {
  return (
    <RequireRole allowedRoles={["group_admin", "manager"]}>
      <Contenu />
    </RequireRole>
  );
}

function Contenu() {
  const router = useRouter();
  const { current } = useEtablissement();
  const [mois, setMois] = useState(6);
  const [data, setData] = useState<Reponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouverts, setOuverts] = useState<Record<string, boolean>>({});
  const [enCours, setEnCours] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [fiches, setFiches] = useState<Array<{ id: string; name: string; category: string | null; supplier_sku: string | null }> | null>(null);
  const [picker, setPicker] = useState<{ f: Fournisseur; p: Produit } | null>(null);
  const [recherche, setRecherche] = useState("");

  const chargerFiches = useCallback(async () => {
    if (fiches) return;
    const out: Array<{ id: string; name: string; category: string | null; supplier_sku: string | null }> = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from("ingredients").select("id, name, category, supplier_sku").eq("is_active", true).order("name").range(from, from + 999);
      out.push(...((data ?? []) as typeof out));
      if (!data || data.length < 1000) break;
    }
    setFiches(out);
  }, [fiches]);

  const ouvrirPicker = (f: Fournisseur, p: Produit) => { setPicker({ f, p }); setRecherche(p.libelle.replace(/\b(c\d|fr|es|ma|nl|it|be|pt|za|cr)\b/gi, "").replace(/[\d,./~°xX×]+\s*(g|gr|kg|k|ml|cl|l|f|p|px)?\b/gi, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 2).join(" ")); void chargerFiches(); };

  const [voirIgnorees, setVoirIgnorees] = useState<Record<string, boolean>>({});
  type PrixAValider = { id: string; produit: string; fournisseur: string; ancien_prix: number | null; nouveau_prix: number | null; ecart_pct: number | null; unite: string | null; source: string | null; created_at: string };
  const [prixAValider, setPrixAValider] = useState<PrixAValider[]>([]);
  const chargerPrix = useCallback(async () => {
    try { const r = await fetchApi("/api/factures/prix-a-valider"); const j = await r.json(); if (r.ok && j.ok) setPrixAValider(j.prix as PrixAValider[]); } catch { /* encart facultatif */ }
  }, []);
  useEffect(() => { void chargerPrix(); }, [chargerPrix, current?.id]);
  const deciderPrix = async (p: PrixAValider, action: "accepter" | "refuser") => {
    setMessage(null);
    try {
      const r = await fetchApi("/api/factures/prix-a-valider", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id, action }) });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setMessage(`${p.produit} (${p.fournisseur}) : baisse ${action === "accepter" ? "acceptée, prix appliqué" : "refusée, prix habituel conservé"}.`);
      await chargerPrix();
    } catch (e) { setMessage(e instanceof Error ? e.message : "erreur"); }
  };

  const ignorer = async (f: Fournisseur, p: Produit) => {
    const k = `${f.supplier_id}:${p.cle}`;
    setEnCours((s) => ({ ...s, [k]: "…" })); setMessage(null);
    try {
      const r = await fetchApi("/api/factures/ignorer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ supplier_id: f.supplier_id, sku: p.sku, nom: p.libelle, label: p.libelle }) });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setMessage(`${p.libelle} : ignoré. Les factures restent intactes, aucune fiche ne sera créée pour cette référence.`);
      await charger();
    } catch (e) {
      setMessage(`${p.libelle} : ${e instanceof Error ? e.message : "erreur"}`);
    } finally { setEnCours((s) => { const n = { ...s }; delete n[k]; return n; }); }
  };

  const reactiver = async (f: Fournisseur, i: RefIgnoree) => {
    setMessage(null);
    try {
      const r = await fetchApi("/api/factures/ignorer", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: i.id }) });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setMessage(`${i.label ?? i.sku} (${f.nom}) : de nouveau en attente.`);
      await charger();
    } catch (e) { setMessage(e instanceof Error ? e.message : "erreur"); }
  };

  const rattacher = async (ficheId: string, ficheNom: string) => {
    if (!picker) return;
    const { f, p } = picker;
    const k = `${f.supplier_id}:${p.cle}`;
    setEnCours((s) => ({ ...s, [k]: "Rattachement…" })); setPicker(null); setMessage(null);
    try {
      if (!p.sku) throw new Error("ligne sans référence fournisseur : créez la fiche ou renommez-la à l'identique");
      const r = await fetchApi("/api/factures/alias", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ supplier_id: f.supplier_id, sku: p.sku, ingredient_id: ficheId, label: p.libelle }) });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setMessage(`Référence ${p.sku} (${p.libelle}) rattachée à « ${ficheNom} ». Relancez le rapprochement de ${f.nom} pour enregistrer les prix.`);
      await charger();
    } catch (e) {
      setMessage(`${p.libelle} : ${e instanceof Error ? e.message : "erreur"}`);
    } finally { setEnCours((s) => { const n = { ...s }; delete n[k]; return n; }); }
  };

  const charger = useCallback(async () => {
    setLoading(true); setErreur(null);
    try {
      const r = await fetchApi(`/api/factures/en-attente?mois=${mois}`);
      const j = (await r.json()) as Reponse;
      if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setData(j);
      setOuverts((o) => Object.keys(o).length ? o : Object.fromEntries(j.fournisseurs.slice(0, 1).map((f) => [f.supplier_id, true])));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "erreur");
    } finally { setLoading(false); }
  }, [mois]);

  useEffect(() => { void charger(); }, [charger, current?.id]);

  const creerFiche = async (f: Fournisseur, p: Produit) => {
    if (!p.derniere_facture_id) return;
    const k = `${f.supplier_id}:${p.cle}`;
    setEnCours((s) => ({ ...s, [k]: "Création…" })); setMessage(null);
    try {
      const r = await fetchApi("/api/factures/rapprocher", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoice_id: p.derniere_facture_id, sku: p.sku, nom: p.sku ? null : p.libelle, creer: true }) });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      const err = (j.details as Array<{ erreur?: string }>).find((d) => d.erreur)?.erreur;
      if (err) throw new Error(err);
      setMessage(`${p.libelle} : ${j.fiches} fiche créée, ${j.offres} prix enregistré. Relancez le rapprochement du fournisseur pour rattacher l'historique.`);
      await charger();
    } catch (e) {
      setMessage(`${p.libelle} : ${e instanceof Error ? e.message : "erreur"}`);
    } finally { setEnCours((s) => { const n = { ...s }; delete n[k]; return n; }); }
  };

  const relancer = async (f: Fournisseur) => {
    const k = f.supplier_id;
    let offset = 0, offres = 0, traitees = 0, total = 0, erreurs = 0;
    setMessage(null);
    try {
      for (let tour = 0; tour < 60; tour++) {
        setEnCours((s) => ({ ...s, [k]: total ? `${traitees}/${total} factures…` : "Démarrage…" }));
        const r = await fetchApi("/api/factures/rapprocher", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ supplier_id: f.supplier_id, offset, limit: 5 }) });
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        total = j.total; traitees += j.traitees; offres += j.offres;
        erreurs += (j.details as Array<{ erreur?: string }>).filter((d) => d.erreur).length;
        if (j.suivant == null) break;
        offset = j.suivant;
      }
      setMessage(`${f.nom} : ${traitees} factures rejouées, ${offres} prix mis à jour${erreurs ? `, ${erreurs} en erreur` : ""}.`);
      await charger();
    } catch (e) {
      setMessage(`${f.nom} : ${e instanceof Error ? e.message : "erreur"}`);
    } finally { setEnCours((s) => { const n = { ...s }; delete n[k]; return n; }); }
  };

  const card: React.CSSProperties = { background: "#fff", borderRadius: 14, boxShadow: "0 1px 3px rgba(0,0,0,.06)", marginBottom: 12, overflow: "hidden" };
  const btn: React.CSSProperties = { padding: "6px 12px", borderRadius: 16, border: "1px solid #ddd", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" };
  const th: React.CSSProperties = { textAlign: "left", fontSize: 11, textTransform: "uppercase", letterSpacing: .4, color: "#888", padding: "8px 10px", borderBottom: "1px solid #eee", whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #f3f3f3", fontSize: 13, verticalAlign: "top" };
  const num: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 16px 96px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <button type="button" onClick={() => router.push("/achats")} style={btn}>← Achats</button>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, flex: 1 }}>Lignes en attente</h1>
        <label style={{ fontSize: 13, color: "#555" }}>
          Période{" "}
          <select value={mois} onChange={(e) => setMois(Number(e.target.value))} style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #ddd" }}>
            {[3, 6, 12].map((m) => <option key={m} value={m}>{m} mois</option>)}
          </select>
        </label>
      </div>
      <p style={{ fontSize: 13, color: "#666", margin: "0 0 14px" }}>
        Achats facturés qui ne correspondent à aucune fiche produit. « Rattacher… » ajoute la référence à une fiche existante (plusieurs références par fiche) ; « Créer la fiche » crée le produit et son prix à partir de la dernière facture ; « Ignorer » sort un produit abandonné de la liste ;
        « Relancer le rapprochement » rejoue les factures déjà en base pour rattacher l&apos;historique aux fiches créées depuis, sans écraser un prix plus récent.
      </p>
      {message && <div style={{ background: "#fff7e6", border: "1px solid #ffd591", borderRadius: 10, padding: "10px 12px", fontSize: 13, marginBottom: 12 }}>{message}</div>}
      {prixAValider.length > 0 && (
        <section style={{ ...card, border: "1px solid #ffd591" }}>
          <div style={{ padding: "12px 14px", fontWeight: 800, fontSize: 15 }}>Baisses de prix à valider <span style={{ color: "#888", fontWeight: 500, fontSize: 12 }}>· plus de 20 % sous le prix habituel, non appliquées</span></div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead><tr><th style={th}>Produit</th><th style={th}>Fournisseur</th><th style={{ ...th, textAlign: "right" }}>Prix habituel</th><th style={{ ...th, textAlign: "right" }}>Prix facturé</th><th style={{ ...th, textAlign: "right" }}>Écart</th><th style={th}>Source</th><th style={th}></th></tr></thead>
              <tbody>
                {prixAValider.map((p) => (
                  <tr key={p.id}>
                    <td style={td}>{p.produit}</td><td style={td}>{p.fournisseur}</td>
                    <td style={num}>{eur(p.ancien_prix)}{p.unite ? " / " + unite(p.unite) : ""}</td>
                    <td style={{ ...num, fontWeight: 700 }}>{eur(p.nouveau_prix)}{p.unite ? " / " + unite(p.unite) : ""}</td>
                    <td style={{ ...num, color: "#b45309" }}>{p.ecart_pct != null ? `${p.ecart_pct} %` : "—"}</td>
                    <td style={{ ...td, color: "#666", whiteSpace: "nowrap" }}>{p.source ?? "—"}</td>
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      <button type="button" onClick={() => deciderPrix(p, "accepter")} style={{ ...btn, marginRight: 6 }}>Accepter</button>
                      <button type="button" onClick={() => deciderPrix(p, "refuser")} style={{ ...btn, color: "#999" }}>Refuser</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {erreur && <div style={{ background: "#fff1f0", border: "1px solid #ffa39e", borderRadius: 10, padding: "10px 12px", fontSize: 13, marginBottom: 12 }}>{erreur}</div>}
      {loading && !data ? (
        <p style={{ color: "#999", textAlign: "center", marginTop: 40 }}>Analyse des factures…</p>
      ) : data && data.fournisseurs.length === 0 ? (
        <p style={{ color: "#999", textAlign: "center", marginTop: 40 }}>Toutes les lignes de facture des {data.periode.mois} derniers mois ont une fiche.</p>
      ) : data && (
        <>
          <p style={{ fontSize: 12, color: "#888", margin: "0 0 10px" }}>
            Depuis le {dateFr(data.periode.depuis)} · {data.factures} factures · {data.lignes} lignes lues · {data.fournisseurs.reduce((a, f) => a + f.produits.length, 0)} produits sans fiche
            {loading ? " · actualisation…" : ""}
          </p>
          {data.fournisseurs.map((f) => {
            const ouvert = !!ouverts[f.supplier_id];
            const busy = enCours[f.supplier_id];
            return (
              <section key={f.supplier_id} style={card}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", flexWrap: "wrap" }}>
                  <button type="button" onClick={() => setOuverts((o) => ({ ...o, [f.supplier_id]: !ouvert }))} style={{ ...btn, border: "none", padding: "4px 6px", fontSize: 16 }} aria-label={ouvert ? "Replier" : "Déplier"}>{ouvert ? "▾" : "▸"}</button>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{f.nom}</div>
                    <div style={{ fontSize: 12, color: "#777" }}>{f.produits.length} produit{f.produits.length > 1 ? "s" : ""} · {f.lignes} ligne{f.lignes > 1 ? "s" : ""} · {f.factures_total} facture{f.factures_total > 1 ? "s" : ""} sur la période</div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 15, fontVariantNumeric: "tabular-nums" }}>{eur(f.montant_ht)}</div>
                  <button type="button" disabled={!!busy} onClick={() => relancer(f)} style={{ ...btn, background: busy ? "#f5f5f5" : "#1a1a1a", color: busy ? "#888" : "#fff", border: "none" }}>
                    {busy ?? "Relancer le rapprochement"}
                  </button>
                </div>
                {ouvert && (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                      <thead><tr>
                        <th style={th}>Produit</th><th style={th}>Réf.</th>
                        <th style={{ ...th, textAlign: "right" }}>Achats</th><th style={{ ...th, textAlign: "right" }}>Quantité</th>
                        <th style={{ ...th, textAlign: "right" }}>Montant HT</th><th style={{ ...th, textAlign: "right" }}>Dernier prix</th>
                        <th style={th}>Dernière facture</th><th style={th}></th>
                      </tr></thead>
                      <tbody>
                        {f.produits.map((p) => {
                          const k = `${f.supplier_id}:${p.cle}`;
                          return (
                            <tr key={p.cle}>
                              <td style={td}>{p.libelle}</td>
                              <td style={{ ...td, color: "#777", fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{p.sku ?? "—"}</td>
                              <td style={num}>{p.lignes}{p.factures !== p.lignes ? <span style={{ color: "#999" }}> / {p.factures} fact.</span> : null}</td>
                              <td style={num}>{p.quantite == null ? "—" : `${p.quantite.toLocaleString("fr-FR")} ${unite(p.unite)}`}</td>
                              <td style={{ ...num, fontWeight: 700 }}>{eur(p.montant_ht)}</td>
                              <td style={num}>{p.dernier_prix == null ? "—" : `${eur(p.dernier_prix)}${p.unite ? " / " + unite(p.unite) : ""}`}</td>
                              <td style={{ ...td, whiteSpace: "nowrap", color: "#666" }}>{dateFr(p.derniere_date)}{p.derniere_facture_numero ? <span style={{ color: "#aaa" }}> · {p.derniere_facture_numero}</span> : null}</td>
                              <td style={{ ...td, textAlign: "right" }}>
                                <div style={{ display: "inline-flex", gap: 6 }}>
                                  {p.sku && <button type="button" disabled={!!enCours[k]} onClick={() => ouvrirPicker(f, p)} style={btn}>Rattacher…</button>}
                                  <button type="button" disabled={!!enCours[k] || !p.derniere_facture_id} onClick={() => creerFiche(f, p)} style={btn}>{enCours[k] ?? "Créer la fiche"}</button>
                                  <button type="button" disabled={!!enCours[k]} onClick={() => ignorer(f, p)} title="Produit abandonné : sortir de la liste sans toucher aux factures" style={{ ...btn, color: "#999" }}>Ignorer</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {f.ignorees.length > 0 && (
                      <div style={{ padding: "8px 14px 12px", fontSize: 12, color: "#888" }}>
                        <button type="button" onClick={() => setVoirIgnorees((v) => ({ ...v, [f.supplier_id]: !v[f.supplier_id] }))} style={{ ...btn, border: "none", padding: 0, color: "#888", fontWeight: 500 }}>
                          {f.ignorees.length} référence{f.ignorees.length > 1 ? "s" : ""} ignorée{f.ignorees.length > 1 ? "s" : ""} {voirIgnorees[f.supplier_id] ? "▾" : "▸"}
                        </button>
                        {voirIgnorees[f.supplier_id] && (
                          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                            {f.ignorees.map((i) => (
                              <li key={i.id} style={{ marginBottom: 4 }}>
                                {i.label ?? i.sku}{!i.sku.startsWith("n:") ? <span style={{ color: "#bbb" }}> · {i.sku}</span> : null}{" "}
                                <button type="button" onClick={() => reactiver(f, i)} style={{ ...btn, padding: "1px 8px", fontSize: 11, marginLeft: 6 }}>Réactiver</button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </>
      )}
      {picker && (
        <div role="dialog" aria-modal="true" onClick={() => setPicker(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", width: "100%", maxWidth: 560, maxHeight: "80dvh", borderRadius: "16px 16px 0 0", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontWeight: 800 }}>Rattacher « {picker.p.libelle} » <span style={{ color: "#888", fontWeight: 500 }}>(réf. {picker.p.sku})</span></div>
            <div style={{ fontSize: 12, color: "#666" }}>La référence devient un alias de la fiche choisie : les prochaines factures et la relance du rapprochement la reconnaîtront.</div>
            <input autoFocus value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher une fiche…" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", fontSize: 14 }} />
            <div style={{ overflowY: "auto", flex: 1, border: "1px solid #eee", borderRadius: 10 }}>
              {!fiches ? <p style={{ padding: 12, color: "#999", fontSize: 13 }}>Chargement des fiches…</p> : (() => {
                const mots = recherche.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/).filter(Boolean);
                const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                const res = fiches.filter((x) => mots.every((m) => norm(x.name).includes(m))).slice(0, 40);
                return res.length ? res.map((x) => (
                  <button key={x.id} type="button" onClick={() => rattacher(x.id, x.name)} style={{ display: "flex", width: "100%", textAlign: "left", gap: 10, padding: "10px 12px", border: "none", borderBottom: "1px solid #f3f3f3", background: "#fff", cursor: "pointer", fontSize: 13 }}>
                    <span style={{ flex: 1 }}>{x.name}</span>
                    <span style={{ color: "#999", fontSize: 11 }}>{x.category ?? ""}{x.supplier_sku ? ` · ${x.supplier_sku}` : ""}</span>
                  </button>
                )) : <p style={{ padding: 12, color: "#999", fontSize: 13 }}>Aucune fiche ne correspond.</p>;
              })()}
            </div>
            <button type="button" onClick={() => setPicker(null)} style={{ ...btn, alignSelf: "flex-end" }}>Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}
