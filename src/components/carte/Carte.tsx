"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import { fetchApi, openApiFile } from "@/lib/fetchApi";
import { useBureau } from "@/hooks/useBureau";
import { VoletDroit } from "@/components/produits/BaseProduits";
import { OSWALD } from "@/components/TuileProduit";
import { couleurTexteSur, styleBarreCategorie } from "@/lib/styleCategories";
import { CatalogueContent } from "@/components/production/CatalogueTab";
import { CatalogueSalleContent } from "@/components/production/CatalogueSalleTab";
import type { ArticleCarte, ReponseCarte } from "@/app/api/carte/route";

/**
 * Carte (maquette validée le 09/10/2026) : une seule page qui réunit les touches de caisse Popina
 * (vue Articles), les fiches techniques, les préparations et le catalogue de l'équipe. Les lignes
 * de la vue Articles sont les touches Popina : prix de vente de la caisse, coût matière de la fiche
 * (ou prix d'achat du produit relié), food cost et marge. Tableau plat de A à Z par défaut, ou
 * accordéons par catégorie de caisse ; un clic ouvre le volet de lecture, « Modifier la fiche »
 * ouvre la fiche complète. Les équipiers sans accès aux valeurs monétaires n'ont pas la vue Articles.
 */

export type VueCarte = "articles" | "fiches" | "preparations" | "equipe";

const BORD = "#ddd6c8";
const MUTED = "#6f6a61";
const FAIBLE = "#a39d92";
const BON = "#4a6741";
const ATTENTION = "#b7791f";
const MAUVAIS = "#b4443a";
const ACCENT = "#D4775A";

const CATEGORIES: { cle: string; libelle: string; couleur: string; cuisine: boolean }[] = [
  { cle: "PIZZE", libelle: "Pizze", couleur: "#DD4124", cuisine: true },
  { cle: "ANTIPASTI", libelle: "Antipasti", couleur: "#E2583E", cuisine: true },
  { cle: "CUCINA", libelle: "Cucina", couleur: "#0F4C81", cuisine: true },
  { cle: "DOLCI", libelle: "Dolci", couleur: "#FFBE98", cuisine: true },
  { cle: "VINI", libelle: "Vini", couleur: "#955251", cuisine: false },
  { cle: "DIGESTIVI", libelle: "Digestivi", couleur: "#5F4B8B", cuisine: false },
  { cle: "ALCOOL", libelle: "Alcool", couleur: "#B163A3", cuisine: false },
  { cle: "BEVANDE", libelle: "Bevande", couleur: "#7BC4C4", cuisine: false },
  { cle: "BEVANDE CALDE", libelle: "Bevande calde", couleur: "#A47864", cuisine: false },
  { cle: "MESSAGES", libelle: "Messages", couleur: "#939597", cuisine: false },
];
const CAT_PAR_CLE = new Map(CATEGORIES.map((c) => [c.cle, c]));
const infoCategorie = (cle: string) => CAT_PAR_CLE.get(cle) ?? { cle, libelle: cle.charAt(0) + cle.slice(1).toLowerCase(), couleur: "#939597", cuisine: false };
const ordreCategorie = (cle: string) => { const i = CATEGORIES.findIndex((c) => c.cle === cle); return i < 0 ? CATEGORIES.length : i; };
/** Catégorie de caisse → catégorie de fiche pré-remplie quand on crée la fiche depuis la touche */
const CAT_FICHE: Record<string, string> = { PIZZE: "pizza", ANTIPASTI: "antipasti", CUCINA: "plat_cuisine", DOLCI: "dessert" };

type Verdict = { libelle: string; couleur: string; fond: string; niveau: "bon" | "attention" | "mauvais" };
/** Verdict food cost (règles de la maquette) : Excellent < 20 %, Bon < 28 %, Correct < 35 %, Élevé au-delà ; « À vérifier » quand la fiche est manifestement fausse. */
function verdictFoodCost(fc: number | null): Verdict | null {
  if (fc == null) return null;
  if (fc > 60 || fc < 5) return { libelle: "À vérifier", couleur: MAUVAIS, fond: "rgba(180,68,58,0.12)", niveau: "mauvais" };
  if (fc < 20) return { libelle: "Excellent", couleur: BON, fond: "rgba(74,103,65,0.12)", niveau: "bon" };
  if (fc < 28) return { libelle: "Bon", couleur: BON, fond: "rgba(74,103,65,0.12)", niveau: "bon" };
  if (fc < 35) return { libelle: "Correct", couleur: ATTENTION, fond: "rgba(183,121,31,0.12)", niveau: "attention" };
  return { libelle: "Élevé", couleur: MAUVAIS, fond: "rgba(180,68,58,0.12)", niveau: "mauvais" };
}

const euros = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const pct = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: n >= 100 ? 0 : 1, maximumFractionDigits: n >= 100 ? 0 : 1 })} %`;
const qte = (q: number | null, u: string | null) => (q == null ? "—" : `${q.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${u ?? ""}`.trim());

const TH_PLAT: CSSProperties = { textAlign: "left", fontSize: 12.5, color: "#1a1a1a", padding: "12px 16px", borderBottom: `1px solid ${BORD}`, fontWeight: 600, whiteSpace: "nowrap" };
const TD_PLAT: CSSProperties = { padding: "12px 16px", borderBottom: `1px solid ${BORD}`, verticalAlign: "middle", fontSize: 13 };
/** Tableaux dans les accordéons (maquette) : en-tête en petites capitales discrètes, lignes plus serrées, séparateurs plus légers */
const TH_SEC: CSSProperties = { textAlign: "left", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: FAIBLE, padding: "8px 14px", borderBottom: `1px solid ${BORD}`, fontWeight: 600, whiteSpace: "nowrap" };
const TD_SEC: CSSProperties = { padding: "10px 14px", borderBottom: "1px solid #f0ebe2", verticalAlign: "middle", fontSize: 13 };
const BTN: CSSProperties = { height: 36, padding: "0 14px", borderRadius: 10, border: `1px solid ${BORD}`, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "#1a1a1a", whiteSpace: "nowrap" };
const SELECT: CSSProperties = { height: 36, padding: "0 10px", borderRadius: 10, border: `1px solid ${BORD}`, background: "#fff", fontSize: 12.5, fontFamily: "inherit", color: "#1a1a1a", maxWidth: "100%" };
const PETIT: CSSProperties = { fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 8, border: `1px solid ${ACCENT}`, background: "#fff", cursor: "pointer", fontFamily: "inherit", color: ACCENT, whiteSpace: "nowrap" };

// Affichage plat ou par catégorie, mémorisé sur l'appareil (même mécanique que la Base produits)
const CLE = "carte:affichage";
const abonnes = new Set<() => void>();
const lire = (): "az" | "cat" => { try { return localStorage.getItem(CLE) === "cat" ? "cat" : "az"; } catch { return "az"; } };
const ecrire = (v: "az" | "cat") => { try { localStorage.setItem(CLE, v); } catch { /* navigation privée */ } abonnes.forEach((f) => f()); };
const abonner = (f: () => void) => { abonnes.add(f); return () => { abonnes.delete(f); }; };

function Chip({ fond, couleur, bord, children }: { fond: string; couleur: string; bord?: string; children: ReactNode }) {
  return <span style={{ display: "inline-block", fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 999, whiteSpace: "nowrap", background: fond, color: couleur, border: bord ? `1px solid ${bord}` : "none" }}>{children}</span>;
}
function ChipCategorie({ cle }: { cle: string }) {
  const c = infoCategorie(cle);
  return <Chip fond={`${c.couleur}1a`} couleur={couleurTexteSur(c.couleur) === "#fff" ? c.couleur : "#7a4a2a"} bord={`${c.couleur}66`}>{c.libelle}</Chip>;
}
function ChipFoodCost({ a }: { a: ArticleCarte }) {
  const v = verdictFoodCost(a.food_cost);
  if (!v || a.food_cost == null) return <span style={{ color: FAIBLE }}>—</span>;
  return <Chip fond={v.fond} couleur={v.couleur} bord={`${v.couleur}55`}>{pct(a.food_cost)}</Chip>;
}
function FoodCostTexte({ a }: { a: ArticleCarte }) {
  const v = verdictFoodCost(a.food_cost);
  if (!v || a.food_cost == null) return <span style={{ color: FAIBLE }}>—</span>;
  return <span style={{ fontWeight: 600, color: v.couleur, fontVariantNumeric: "tabular-nums" }}><Point couleur={v.couleur} />{pct(a.food_cost)}</span>;
}
function Point({ couleur }: { couleur: string }) {
  return <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: couleur, marginRight: 7, verticalAlign: 1 }} />;
}
const STATUTS: Record<string, string> = { publiee: "publiée", validee: "validée", brouillon: "brouillon" };
function libelleLien(a: ArticleCarte): string {
  if (a.lien === "fiche" && a.fiche) return a.fiche.categorie === "pizza" ? "Fiche pizza" : a.fiche.categorie === "cocktail" ? "Fiche cocktail" : a.fiche.categorie === "preparation" ? "Préparation" : "Fiche cuisine";
  if (a.lien === "produit" && a.produit) return `Produit · ${a.produit.nom}`;
  if (a.lien_orphelin) return "Lien à refaire";
  return "Non relié";
}

function Tuile({ libelle, valeur, sous, couleur, active, onClick }: { libelle: string; valeur: ReactNode; sous: string; couleur?: string; active?: boolean; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      style={{ background: "#fff", border: `1px solid ${active ? "#1a1a1a" : BORD}`, borderRadius: 12, padding: "12px 14px", display: "grid", gap: 2, minWidth: 0, textAlign: "left", cursor: onClick ? "pointer" : "default", fontFamily: "inherit" }}>
      <span style={{ fontSize: 12, color: MUTED, fontWeight: 600 }}>{libelle}</span>
      <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 26, lineHeight: 1.1, color: couleur ?? "#1a1a1a", fontVariantNumeric: "tabular-nums" }}>{valeur}</span>
      <span style={{ fontSize: 11.5, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sous}</span>
    </button>
  );
}

/* ── Relier une touche à une fiche ou un produit ─────────────────────────── */

type Candidat = { id: string; name: string; supplier?: string | null };

function PanneauRelier({ article, onFait, onAnnuler }: { article: ArticleCarte; onFait: () => void; onAnnuler: () => void }) {
  const [type, setType] = useState<"kitchen" | "ingredient">(infoCategorie(article.categorie).cuisine ? "kitchen" : "ingredient");
  const [q, setQ] = useState(article.nom);
  const [resultats, setResultats] = useState<Candidat[]>([]);
  const [recherche, setRecherche] = useState(false);
  const [enregistrement, setEnregistrement] = useState<string | null>(null);
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (minuterie.current) clearTimeout(minuterie.current);
    if (!q.trim()) return;
    minuterie.current = setTimeout(async () => {
      setRecherche(true);
      try {
        const res = await fetchApi("/api/popina-catalogue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, q }) });
        const data = await res.json();
        setResultats(Array.isArray(data) ? data : []);
      } catch { setResultats([]); }
      setRecherche(false);
    }, 250);
    return () => { if (minuterie.current) clearTimeout(minuterie.current); };
  }, [q, type]);

  async function relier(c: Candidat) {
    setEnregistrement(c.id);
    const res = await fetchApi("/api/popina-catalogue", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ popina_product_id: article.id, linked_type: type, linked_id: c.id }) });
    setEnregistrement(null);
    if (!res.ok) { alert("Le lien n'a pas pu être enregistré."); return; }
    onFait();
  }

  const onglet = (v: "kitchen" | "ingredient", libelle: string) => (
    <button type="button" onClick={() => setType(v)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", background: type === v ? "#fff" : "transparent", color: type === v ? "#1a1a1a" : MUTED, boxShadow: type === v ? "0 1px 4px rgba(0,0,0,0.08)" : "none" }}>{libelle}</button>
  );

  return (
    <div style={{ border: `1px solid ${ACCENT}`, borderRadius: 12, padding: 14, display: "grid", gap: 10, background: "#fffaf7" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <b style={{ fontSize: 13 }}>Relier la touche « {article.nom} »</b>
        <span style={{ display: "inline-flex", background: "#ece4d4", borderRadius: 10, padding: 3, gap: 3, marginLeft: "auto" }}>{onglet("kitchen", "Fiche technique")}{onglet("ingredient", "Produit")}</span>
      </div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={type === "kitchen" ? "Nom de la fiche…" : "Nom du produit…"} autoFocus
        style={{ height: 36, padding: "0 12px", borderRadius: 10, border: `1px solid ${BORD}`, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
      <div style={{ maxHeight: 220, overflowY: "auto", display: "grid", gap: 2 }}>
        {recherche && <div style={{ fontSize: 12.5, color: MUTED, padding: "6px 2px" }}>Recherche…</div>}
        {!recherche && q.trim() && resultats.length === 0 && <div style={{ fontSize: 12.5, color: MUTED, padding: "6px 2px" }}>Rien trouvé. Essaie un autre mot, ou crée la fiche.</div>}
        {q.trim() && resultats.map((c) => (
          <button key={c.id} type="button" disabled={enregistrement != null} onClick={() => relier(c)}
            style={{ display: "flex", justifyContent: "space-between", gap: 8, textAlign: "left", padding: "8px 10px", borderRadius: 8, border: `1px solid ${BORD}`, background: "#fff", cursor: "pointer", fontFamily: "inherit", fontSize: 13, opacity: enregistrement && enregistrement !== c.id ? 0.5 : 1 }}>
            <span style={{ fontWeight: 600 }}>{c.name}</span>
            <span style={{ color: MUTED, fontSize: 12 }}>{enregistrement === c.id ? "Enregistrement…" : c.supplier ?? ""}</span>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" onClick={onAnnuler} style={{ ...BTN, height: 32 }}>Annuler</button>
      </div>
    </div>
  );
}

/* ── Dose (touche reliée à un produit : une bouteille vendue au verre) ───── */

function PanneauDose({ article, onFait }: { article: ArticleCarte; onFait: () => void }) {
  const initiale = article.produit?.dose?.match(/^([\d.,]+)\s*(cl|pcs|g|ml)?/i);
  const [dose, setDose] = useState(initiale ? initiale[1].replace(",", ".") : "");
  const [unite, setUnite] = useState<"cl" | "pcs">(initiale && initiale[2]?.toLowerCase() === "pcs" ? "pcs" : "cl");
  const [occupe, setOccupe] = useState(false);

  async function enregistrer() {
    if (!article.produit) return;
    const n = Number(dose);
    if (!(n > 0)) { alert("Indique une dose supérieure à zéro."); return; }
    setOccupe(true);
    const res = await fetchApi("/api/popina-catalogue/doses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ popina_product_id: article.id, ingredient_id: article.produit.id, dose: n, dose_unit: unite }) });
    setOccupe(false);
    if (!res.ok) { alert("La dose n'a pas pu être enregistrée."); return; }
    onFait();
  }
  async function retirer() {
    setOccupe(true);
    const res = await fetchApi("/api/popina-catalogue/doses");
    const liste = (await res.json()) as { id: string; popina_product_id: string }[];
    const d = Array.isArray(liste) ? liste.find((x) => x.popina_product_id === article.id) : undefined;
    if (d) await fetchApi("/api/popina-catalogue/doses", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: d.id }) });
    setOccupe(false);
    onFait();
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={{ fontSize: 12.5, color: MUTED }}>Dose vendue :</span>
      <input value={dose} onChange={(e) => setDose(e.target.value)} inputMode="decimal" placeholder="ex. 4" style={{ width: 70, height: 32, padding: "0 10px", borderRadius: 8, border: `1px solid ${BORD}`, fontSize: 13, fontFamily: "inherit" }} />
      <select value={unite} onChange={(e) => setUnite(e.target.value as "cl" | "pcs")} style={{ ...SELECT, height: 32 }}>
        <option value="cl">cl (sur le volume de la bouteille)</option>
        <option value="pcs">pièces</option>
      </select>
      <button type="button" disabled={occupe} onClick={enregistrer} style={{ ...BTN, height: 32 }}>Enregistrer</button>
      {article.produit?.dose && <button type="button" disabled={occupe} onClick={retirer} style={{ border: "none", background: "transparent", color: MAUVAIS, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Retirer la dose</button>}
    </div>
  );
}

/* ── Volet de lecture ─────────────────────────────────────────────────────── */

const Titre = ({ children }: { children: ReactNode }) => <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: MUTED, marginTop: 8, paddingTop: 14, borderTop: `1px solid ${BORD}` }}>{children}</div>;
const Kpi = ({ l, val, s, couleur }: { l: string; val: string; s: string; couleur?: string }) => (
  <div style={{ background: "#f7f3ec", borderRadius: 10, padding: "10px 12px", minWidth: 0 }}>
    <div style={{ fontSize: 11.5, color: MUTED }}>{l}</div>
    <div style={{ fontFamily: OSWALD, fontSize: 20, fontWeight: 700, color: couleur ?? "#1a1a1a" }}>{val}</div>
    <div style={{ fontSize: 11.5, color: MUTED, overflow: "hidden", textOverflow: "ellipsis" }}>{s}</div>
  </div>
);

function VoletArticle({ article, peutEcrire, periode, onFermer, onRecharger, relierOuvert, setRelierOuvert, bureau }: {
  article: ArticleCarte; peutEcrire: boolean; periode: { from: string; to: string } | null; onFermer: () => void; onRecharger: () => void;
  relierOuvert: boolean; setRelierOuvert: (v: boolean) => void; bureau: boolean;
}) {
  const router = useRouter();
  const c = infoCategorie(article.categorie);
  const v = verdictFoodCost(article.food_cost);
  const coeff = article.cout != null && article.cout > 0 ? article.prix_ht / article.cout : null;
  const urlCreation = `/fiche/new?nom=${encodeURIComponent(article.nom)}&popina=${article.id}&prix=${article.prix_ttc}${CAT_FICHE[article.categorie] ? `&cat=${CAT_FICHE[article.categorie]}` : ""}`;
  const sousTitre = [c.libelle, article.fiche ? `${libelleLien(article).toLowerCase()}${article.fiche.statut ? ` ${STATUTS[article.fiche.statut] ?? article.fiche.statut}` : ""}` : article.produit ? `produit « ${article.produit.nom} »` : "touche non reliée"].join(" · ");
  const allergenes = article.fiche?.allergenes ?? article.produit?.allergenes ?? [];

  const pied = (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", width: "100%" }}>
      {article.fiche && <button type="button" onClick={() => openApiFile(`/api/recettes/pdf?id=${article.fiche!.id}`)} style={BTN}>Imprimer la fiche</button>}
      {bureau && <button type="button" onClick={() => router.push("/ventes/marges")} style={BTN}>Voir les ventes</button>}
      <span style={{ flex: 1 }} />
      {article.produit && <button type="button" onClick={() => router.push(`/ingredients/${article.produit!.id}`)} style={BTN}>Ouvrir le produit</button>}
      {article.fiche
        ? <button type="button" onClick={() => router.push(`/fiche/${article.fiche!.id}`)} style={{ ...BTN, background: "#1a1a1a", color: "#f2ede4", border: "none", fontWeight: 700 }}>{peutEcrire ? "Modifier la fiche" : "Voir la fiche"}</button>
        : peutEcrire && <button type="button" onClick={() => router.push(urlCreation)} style={{ ...BTN, background: ACCENT, color: "#fff", border: "none", fontWeight: 700 }}>Créer la fiche</button>}
    </div>
  );

  return (
    <VoletDroit titre={article.nom} sousTitre={sousTitre} onFermer={onFermer} pied={pied}>
      <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Kpi l="Prix de vente TTC (Popina)" val={euros(article.prix_ttc)} s={`${euros(article.prix_ht)} HT · TVA ${Math.round(article.tva * 100)} %`} />
          <Kpi l="Coût matière" val={article.cout != null ? euros(article.cout) : "—"} s={article.cout_detail ?? "aucune fiche ni produit relié"} />
          <Kpi l="Marge produit HT" val={article.marge_ht != null ? euros(article.marge_ht) : "—"} s={coeff != null ? `coefficient ${coeff.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}` : "coût inconnu"} />
          <Kpi l="Food cost (HT)" val={article.food_cost != null ? pct(article.food_cost) : "—"} s={v ? `${v.libelle}${v.libelle === "À vérifier" ? " · la fiche semble fausse" : " · coût / prix HT"}` : "coût / prix HT"} couleur={v?.couleur} />
        </div>

        {peutEcrire && (
          <>
            <Titre>Lien Popina</Titre>
            {relierOuvert ? (
              <PanneauRelier article={article} onFait={() => { setRelierOuvert(false); onRecharger(); }} onAnnuler={() => setRelierOuvert(false)} />
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13 }}>
                <span><Point couleur={article.lien ? BON : ATTENTION} />{libelleLien(article)}</span>
                <button type="button" onClick={() => setRelierOuvert(true)} style={PETIT}>{article.lien ? "Changer le lien" : "Relier ▾"}</button>
                {article.lien && (
                  <button type="button" onClick={async () => {
                    if (!confirm(`Retirer le lien de « ${article.nom} » ?`)) return;
                    await fetchApi("/api/popina-catalogue", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ popina_product_id: article.id, linked_type: null, linked_id: null }) });
                    onRecharger();
                  }} style={{ border: "none", background: "transparent", color: MAUVAIS, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Retirer</button>
                )}
              </div>
            )}
            {article.produit && !relierOuvert && <PanneauDose article={article} onFait={onRecharger} />}
          </>
        )}

        {article.fiche?.description && (<><Titre>Description (carte du restaurant)</Titre><div style={{ fontSize: 13.5 }}>{article.fiche.description}</div></>)}
        {article.fiche?.resume_salle && (<><Titre>Résumé pour la salle</Titre><div style={{ fontSize: 13.5 }}>{article.fiche.resume_salle}</div></>)}
        {allergenes.length > 0 && (
          <>
            <Titre>Allergènes (depuis les ingrédients)</Titre>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{allergenes.map((a) => <span key={a} style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 8, background: "rgba(180,68,58,0.12)", color: MAUVAIS }}>{a}</span>)}</div>
          </>
        )}

        {article.fiche && (
          <>
            <Titre>Recette</Titre>
            <div style={{ fontSize: 12, color: MUTED }}>{article.fiche.categorie === "pizza" ? "Quantités pour une pizza." : article.fiche.nb_parts > 1 ? `Quantités pour ${article.fiche.nb_parts} parts.` : "Quantités pour une portion."}</div>
            {article.fiche.lignes.length === 0 && <div style={{ fontSize: 13, color: FAIBLE }}>Aucune ligne dans la fiche.</div>}
            {article.fiche.lignes.map((l, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 0", borderBottom: i < article.fiche!.lignes.length - 1 ? "1px solid #ece6db" : "none", fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{l.nom}{l.preparation && <span style={{ fontSize: 11, color: MUTED, fontWeight: 500 }}> · préparation</span>}</span>
                <span style={{ color: MUTED, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{qte(l.qty, l.unit)}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, paddingTop: 8 }}>
              <span>Coût matière de la recette</span><span>{article.fiche.total_cost != null ? euros(article.fiche.total_cost) : "—"}</span>
            </div>
            <div style={{ fontSize: 12, color: MUTED }}>Coût enregistré avec la fiche, au prix d&apos;achat du moment. Le food cost se calcule sur le prix HT de la caisse.</div>
          </>
        )}

        <Titre>Caisse</Titre>
        <div style={{ fontSize: 12.5, color: MUTED }}>
          Touche Popina « {article.nom} » · catégorie {c.libelle}{article.sous_categorie ? ` / ${article.sous_categorie}` : ""} · active
          {article.ventes_30j
            ? ` · ${article.ventes_30j.qty.toLocaleString("fr-FR")} vendue${article.ventes_30j.qty > 1 ? "s" : ""} sur 30 jours, ${euros(article.ventes_30j.ca_ttc)} TTC`
            : periode ? " · aucune vente sur 30 jours" : ""}.
        </div>
      </div>
    </VoletDroit>
  );
}

/* ── Vue Articles ─────────────────────────────────────────────────────────── */

type FiltreLien = "tous" | "fiche" | "produit" | "aucun";
type FiltreFc = "tous" | "bon" | "attention" | "mauvais" | "sans";

export function VueArticles({ bureau, peutEcrire, estAdmin }: { bureau: boolean; peutEcrire: boolean; estAdmin: boolean }) {
  const router = useRouter();
  const { current: etab } = useEtablissement();
  const affichage = useSyncExternalStore(abonner, lire, () => "az" as const);
  const [donnees, setDonnees] = useState<ReponseCarte | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [q, setQ] = useState("");
  const [categorie, setCategorie] = useState<string>("toutes");
  const [lien, setLien] = useState<FiltreLien>("tous");
  const [fc, setFc] = useState<FiltreFc>("tous");
  const [ouvertId, setOuvertId] = useState<string | null>(null);
  const [relierOuvert, setRelierOuvert] = useState(false);
  const [sectionsOuvertes, setSectionsOuvertes] = useState<Set<string>>(() => new Set(["PIZZE", "ANTIPASTI", "CUCINA", "DOLCI"]));
  const [synchro, setSynchro] = useState(false);

  const recharger = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const res = await fetchApi("/api/carte");
        const json = await res.json();
        if (annule) return;
        if (!res.ok) { setErreur(json?.error ?? "Chargement impossible"); return; }
        setDonnees(json as ReponseCarte);
        setErreur(null);
      } catch (e) { if (!annule) setErreur(e instanceof Error ? e.message : "Chargement impossible"); }
    })();
    return () => { annule = true; };
  }, [tick, etab?.id]);

  const articles = useMemo(() => donnees?.articles ?? [], [donnees]);
  const ouvert = ouvertId ? articles.find((a) => a.id === ouvertId) ?? null : null;

  // Compteurs (hors touches « Messages » de la caisse)
  const compteurs = useMemo(() => {
    const utiles = articles.filter((a) => a.categorie !== "MESSAGES");
    const relies = utiles.filter((a) => a.lien);
    const fiches = relies.filter((a) => a.lien === "fiche").length;
    const cuisine = utiles.filter((a) => infoCategorie(a.categorie).cuisine && a.food_cost != null && verdictFoodCost(a.food_cost)?.libelle !== "À vérifier");
    const fcMoyen = cuisine.length ? cuisine.reduce((s, a) => s + (a.food_cost ?? 0), 0) / cuisine.length : null;
    const parCat = CATEGORIES.filter((c) => c.cuisine).map((c) => {
      const l = cuisine.filter((a) => a.categorie === c.cle);
      return l.length ? `${c.libelle.toLowerCase()} ${pct(l.reduce((s, a) => s + (a.food_cost ?? 0), 0) / l.length)}` : null;
    }).filter(Boolean).join(" · ");
    const aVerifier = utiles.filter((a) => verdictFoodCost(a.food_cost)?.libelle === "À vérifier");
    return { total: utiles.length, relies: relies.length, fiches, produits: relies.length - fiches, nonRelies: utiles.length - relies.length, messages: articles.length - utiles.length, fcMoyen, parCat, aVerifier };
  }, [articles]);

  const filtres = useMemo(() => {
    const texte = q.trim().toLowerCase();
    return articles.filter((a) => {
      if (categorie === "toutes" ? a.categorie === "MESSAGES" : a.categorie !== categorie) return false;
      if (lien === "fiche" && a.lien !== "fiche") return false;
      if (lien === "produit" && a.lien !== "produit") return false;
      if (lien === "aucun" && a.lien) return false;
      if (fc !== "tous") {
        const v = verdictFoodCost(a.food_cost);
        if (fc === "sans" ? v != null : fc === "mauvais" ? v?.niveau !== "mauvais" : v?.niveau !== fc) return false;
      }
      if (texte && !`${a.nom} ${a.fiche?.nom ?? ""} ${a.produit?.nom ?? ""} ${a.fiche?.description ?? ""}`.toLowerCase().includes(texte)) return false;
      return true;
    });
  }, [articles, q, categorie, lien, fc]);
  const tries = useMemo(() => [...filtres].sort((a, b) => a.nom.localeCompare(b.nom, "fr")), [filtres]);
  const parCategorie = useMemo(() => {
    const m = new Map<string, ArticleCarte[]>();
    for (const a of tries) { const l = m.get(a.categorie) ?? []; l.push(a); m.set(a.categorie, l); }
    return [...m.entries()].sort((x, y) => ordreCategorie(x[0]) - ordreCategorie(y[0]));
  }, [tries]);
  const enRecherche = q.trim().length > 0;

  async function synchroniser() {
    setSynchro(true);
    try {
      const res = await fetchApi("/api/popina-catalogue/sync", { method: "POST" });
      if (!res.ok) alert("La synchronisation Popina a échoué.");
      recharger();
    } finally { setSynchro(false); }
  }

  const sousArticle = (a: ArticleCarte) => a.fiche?.description ?? (a.fiche && a.fiche.nom.toLowerCase() !== a.nom.toLowerCase() ? `Fiche « ${a.fiche.nom} »` : null) ?? (a.produit ? `Produit « ${a.produit.nom} »${a.produit.dose ? ` · dose ${a.produit.dose}` : ""}` : null) ?? (a.cout_detail && a.cout_detail !== "la pizza" && a.cout_detail !== "la portion" ? a.cout_detail : null);
  const urlCreation = (a: ArticleCarte) => `/fiche/new?nom=${encodeURIComponent(a.nom)}&popina=${a.id}&prix=${a.prix_ttc}${CAT_FICHE[a.categorie] ? `&cat=${CAT_FICHE[a.categorie]}` : ""}`;

  const celluleLien = (a: ArticleCarte) => (
    a.lien
      ? <span style={{ fontSize: 12.5, color: MUTED, whiteSpace: "nowrap" }}><Point couleur={BON} />{libelleLien(a)}</span>
      : peutEcrire
        ? <button type="button" onClick={(e) => { e.stopPropagation(); setOuvertId(a.id); setRelierOuvert(true); }} style={PETIT}>Relier ▾</button>
        : <span style={{ fontSize: 12.5, color: MUTED }}><Point couleur={ATTENTION} />Non relié</span>
  );
  const celluleFiche = (a: ArticleCarte) => (
    a.fiche
      ? <a href={`/fiche/${a.fiche.id}`} onClick={(e) => e.stopPropagation()} style={{ fontSize: 12.5, fontWeight: 600, color: "#1a1a1a", textDecoration: "underline", textDecorationColor: BORD, textUnderlineOffset: 3, whiteSpace: "nowrap" }}>Voir la fiche</a>
      : peutEcrire && a.categorie !== "MESSAGES"
        ? <a href={urlCreation(a)} onClick={(e) => e.stopPropagation()} style={{ fontSize: 12.5, fontWeight: 600, color: ACCENT, textDecoration: "none", whiteSpace: "nowrap" }}>Créer la fiche</a>
        : <span style={{ color: FAIBLE }}>—</span>
  );

  const ligne = (a: ArticleCarte, enSection: boolean) => { const TD = enSection ? TD_SEC : TD_PLAT; return (
    <tr key={a.id} className={`ca-ligne${ouvert?.id === a.id ? " on" : ""}`} onClick={() => { setOuvertId(a.id); setRelierOuvert(false); }} style={{ cursor: "pointer" }}>
      {enSection && <td style={{ ...TD, padding: 0, width: 4, background: infoCategorie(a.categorie).couleur }} />}
      <td style={{ ...TD, minWidth: 240 }}>
        <div style={{ fontWeight: 600 }}>{a.nom}</div>
        {sousArticle(a) && <div style={{ fontSize: 12, color: MUTED, marginTop: 1 }}>{sousArticle(a)}</div>}
      </td>
      {!enSection && <td style={TD}><ChipCategorie cle={a.categorie} /></td>}
      <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
        {euros(a.prix_ttc)}{enSection && <div style={{ fontSize: 11, color: FAIBLE }}>{euros(a.prix_ht)} HT</div>}
      </td>
      <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: a.cout == null ? FAIBLE : "#1a1a1a" }}>
        {a.cout != null ? euros(a.cout) : "—"}{enSection && a.cout_source === "produit" && <div style={{ fontSize: 11, color: FAIBLE }}>prix d&apos;achat</div>}
      </td>
      <td style={{ ...TD, textAlign: enSection ? "right" : "left", whiteSpace: "nowrap" }}>{enSection ? <FoodCostTexte a={a} /> : <ChipFoodCost a={a} />}</td>
      {enSection && <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: a.marge_ht == null ? FAIBLE : a.marge_ht < 0 ? MAUVAIS : "#1a1a1a" }}>{a.marge_ht != null ? euros(a.marge_ht) : "—"}</td>}
      <td style={TD}>{enSection && a.lien ? <span style={{ fontSize: 12, color: MUTED, whiteSpace: "nowrap" }}>{libelleLien(a)}</span> : celluleLien(a)}</td>
      <td style={TD}>{celluleFiche(a)}</td>
      <td style={{ ...TD, textAlign: "right", width: 40, color: FAIBLE, fontWeight: 700 }}>→</td>
    </tr>
  ); };
  const entete = (enSection: boolean) => { const TH = enSection ? TH_SEC : TH_PLAT; return (
    <tr>
      {enSection && <th style={{ ...TH, padding: 0, width: 4 }} />}
      <th style={TH}>Article</th>
      {!enSection && <th style={TH}>Catégorie</th>}
      <th style={{ ...TH, textAlign: "right" }}>{enSection ? "Prix TTC" : "Prix"}</th>
      <th style={{ ...TH, textAlign: "right" }}>{enSection ? "Coût matière" : "Coût"}</th>
      <th style={{ ...TH, textAlign: enSection ? "right" : "left" }}>{enSection ? "Food cost" : "% Food cost (HT)"}</th>
      {enSection && <th style={{ ...TH, textAlign: "right" }}>Marge HT</th>}
      <th style={TH}>Lien Popina</th>
      <th style={TH}>Fiche</th>
      <th style={TH} />
    </tr>
  ); };

  const carte = (a: ArticleCarte) => (
    <button key={a.id} type="button" onClick={() => { setOuvertId(a.id); setRelierOuvert(false); }}
      style={{ display: "grid", gridTemplateColumns: "4px 1fr auto", gap: 12, alignItems: "center", textAlign: "left", width: "100%", background: "#fff", border: `1px solid ${BORD}`, borderRadius: 12, padding: "0 12px 0 0", overflow: "hidden", cursor: "pointer", fontFamily: "inherit" }}>
      <span style={{ alignSelf: "stretch", background: infoCategorie(a.categorie).couleur }} />
      <span style={{ padding: "10px 0", minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 600, fontSize: 14 }}>{a.nom}</span>
        <span style={{ display: "block", fontSize: 12, color: MUTED, marginTop: 2 }}>{infoCategorie(a.categorie).libelle} · {a.lien ? libelleLien(a) : "non relié"}</span>
      </span>
      <span style={{ textAlign: "right", display: "grid", gap: 4, justifyItems: "end" }}>
        <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{euros(a.prix_ttc)}</span>
        <ChipFoodCost a={a} />
      </span>
    </button>
  );

  return (
    <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
      <style>{`.ca-ligne:hover td{background:#f7f3ec}.ca-ligne.on td{background:rgba(212,119,90,0.12)}.ca-ligne:last-child td{border-bottom:0}`}</style>

      <div style={{ display: "grid", gridTemplateColumns: bureau ? "repeat(4, 1fr)" : "repeat(2, 1fr)", gap: 10 }}>
        <Tuile libelle="Articles reliés" valeur={<>{compteurs.relies} <span style={{ fontSize: 14, color: MUTED }}>/ {compteurs.total}</span></>} sous={`${compteurs.fiches} à une fiche, ${compteurs.produits} à un produit`} active={lien === "tous" && fc === "tous"} onClick={() => { setLien("tous"); setFc("tous"); }} />
        <Tuile libelle="Non reliés" valeur={String(compteurs.nonRelies)} sous={compteurs.messages ? `hors ${compteurs.messages} touche${compteurs.messages > 1 ? "s" : ""} « Messages » de la caisse` : "touches de caisse sans fiche ni produit"} couleur={compteurs.nonRelies ? ATTENTION : undefined} active={lien === "aucun"} onClick={() => { setLien(lien === "aucun" ? "tous" : "aucun"); setFc("tous"); }} />
        <Tuile libelle="Food cost cuisine" valeur={compteurs.fcMoyen != null ? pct(compteurs.fcMoyen) : "—"} sous={compteurs.parCat || "pizze, antipasti, cucina, dolci"} couleur={compteurs.fcMoyen != null ? (verdictFoodCost(compteurs.fcMoyen)?.couleur ?? undefined) : undefined} />
        <Tuile libelle="Fiches à vérifier" valeur={String(compteurs.aVerifier.length)} sous={compteurs.aVerifier.length ? compteurs.aVerifier.slice(0, 2).map((a) => `${a.nom} ${a.food_cost != null ? pct(a.food_cost) : ""}`).join(", ") : "food cost cohérent partout"} couleur={compteurs.aVerifier.length ? MAUVAIS : BON} active={fc === "mauvais"} onClick={() => { setFc(fc === "mauvais" ? "tous" : "mauvais"); setLien("tous"); }} />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un article, une fiche…"
          style={{ flex: "1 1 220px", height: 36, padding: "0 12px", borderRadius: 10, border: `1px solid ${BORD}`, fontSize: 13, fontFamily: "inherit", outline: "none", background: "#fff", minWidth: 0 }} />
        <select value={categorie} onChange={(e) => setCategorie(e.target.value)} style={SELECT}>
          <option value="toutes">Catégorie caisse : toutes</option>
          {CATEGORIES.map((c) => <option key={c.cle} value={c.cle}>{c.libelle}</option>)}
        </select>
        <select value={lien} onChange={(e) => setLien(e.target.value as FiltreLien)} style={SELECT}>
          <option value="tous">Lien : tous</option><option value="fiche">Reliés à une fiche</option><option value="produit">Reliés à un produit</option><option value="aucun">Non reliés</option>
        </select>
        <select value={fc} onChange={(e) => setFc(e.target.value as FiltreFc)} style={SELECT}>
          <option value="tous">Food cost : tous</option><option value="bon">Excellent ou bon</option><option value="attention">Correct</option><option value="mauvais">Élevé ou à vérifier</option><option value="sans">Sans coût</option>
        </select>
        {bureau && <span style={{ marginLeft: "auto", color: MUTED, fontSize: 12.5 }}>{tries.length} article{tries.length > 1 ? "s" : ""}</span>}
        <span style={{ display: "inline-flex", background: "#ece4d4", borderRadius: 10, padding: 3, gap: 3, marginLeft: bureau ? 0 : "auto" }}>
          {(["az", "cat"] as const).map((v) => (
            <button key={v} type="button" onClick={() => ecrire(v)} style={{ padding: "5px 10px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", background: affichage === v ? "#fff" : "transparent", color: affichage === v ? "#1a1a1a" : MUTED, boxShadow: affichage === v ? "0 1px 4px rgba(0,0,0,0.08)" : "none" }}>{v === "az" ? "A → Z" : "Par catégorie"}</button>
          ))}
        </span>
        {estAdmin && <button type="button" disabled={synchro} onClick={synchroniser} style={{ ...BTN, opacity: synchro ? 0.6 : 1 }}>{synchro ? "Synchronisation…" : "Synchroniser Popina"}</button>}
      </div>

      {erreur && <div style={{ padding: 14, borderRadius: 12, background: "rgba(180,68,58,0.08)", color: MAUVAIS, fontSize: 13 }}>{erreur}</div>}
      {!donnees && !erreur && <div style={{ padding: 30, textAlign: "center", color: MUTED }}>Chargement de la carte…</div>}
      {donnees && tries.length === 0 && <div style={{ padding: 30, textAlign: "center", color: MUTED }}>Aucun article ne correspond.</div>}

      {donnees && tries.length > 0 && !bureau && (
        <div style={{ display: "grid", gap: 8 }}>
          {affichage === "az"
            ? tries.map(carte)
            : parCategorie.map(([cle, liste]) => {
              const c = infoCategorie(cle); const ouverte = enRecherche || sectionsOuvertes.has(cle);
              return (
                <div key={cle} style={{ display: "grid", gap: 8 }}>
                  <button type="button" onClick={() => setSectionsOuvertes((s) => { const n = new Set(s); if (n.has(cle)) n.delete(cle); else n.add(cle); return n; })}
                    className="barre-categorie" style={{ ...styleBarreCategorie(c.couleur), minHeight: 44, gap: 10, padding: "0 14px", boxShadow: "none", borderRadius: 14 }}>
                    <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", letterSpacing: ".04em", color: couleurTexteSur(c.couleur) }}>{c.libelle}</span>
                    <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 15, color: couleurTexteSur(c.couleur), opacity: 0.7, marginLeft: -4, flex: 1, textAlign: "left" }}>{liste.length}</span>
                    <span style={{ color: couleurTexteSur(c.couleur), fontSize: 12, opacity: 0.85, transform: ouverte ? "rotate(180deg)" : "none" }}>▼</span>
                  </button>
                  {ouverte && liste.map(carte)}
                </div>
              );
            })}
        </div>
      )}

      {donnees && tries.length > 0 && bureau && affichage === "az" && (
        <div style={{ background: "#fff", border: `1px solid ${BORD}`, borderRadius: 14, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900, fontSize: 13 }}>
            <thead>{entete(false)}</thead>
            <tbody>{tries.map((a) => ligne(a, false))}</tbody>
          </table>
          <div style={{ padding: "10px 16px", color: MUTED, fontSize: 12.5 }}>{tries.length} article{tries.length > 1 ? "s" : ""} de A à Z{categorie === "toutes" && compteurs.messages ? ` · les ${compteurs.messages} touches « Messages » de la caisse sont dans leur catégorie` : ""}</div>
        </div>
      )}

      {donnees && tries.length > 0 && bureau && affichage === "cat" && (
        <div style={{ display: "grid", gap: 10 }}>
          {parCategorie.map(([cle, liste]) => {
            const c = infoCategorie(cle);
            const ouverte = enRecherche || sectionsOuvertes.has(cle);
            const avecFc = liste.filter((a) => a.food_cost != null && verdictFoodCost(a.food_cost)?.libelle !== "À vérifier");
            const nonRelies = liste.filter((a) => !a.lien).length;
            const aVerifier = liste.filter((a) => verdictFoodCost(a.food_cost)?.libelle === "À vérifier").length;
            const etat = cle === "MESSAGES" ? "touches de la caisse, ignorées" : [
              c.cuisine && avecFc.length ? `food cost ${pct(avecFc.reduce((s, a) => s + (a.food_cost ?? 0), 0) / avecFc.length)}` : null,
              aVerifier ? `${aVerifier} à vérifier` : null,
              nonRelies ? `${nonRelies} non relié${nonRelies > 1 ? "s" : ""}` : null,
            ].filter(Boolean).join(" · ");
            const texte = couleurTexteSur(c.couleur);
            return (
              <div key={cle}>
                <button type="button" aria-expanded={ouverte} className={`barre-categorie${ouverte ? " ouverte" : ""}`} onClick={() => setSectionsOuvertes((s) => { const n = new Set(s); if (n.has(cle)) n.delete(cle); else n.add(cle); return n; })}
                  style={{ ...styleBarreCategorie(c.couleur), minHeight: 46, gap: 12, padding: "0 16px", boxShadow: "none", borderRadius: ouverte ? "14px 14px 0 0" : 14 }}>
                  <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", letterSpacing: ".04em", color: texte }}>{c.libelle}</span>
                  <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 15, color: texte, opacity: 0.7, marginLeft: -4 }}>{liste.length}</span>
                  <span style={{ flex: 1, textAlign: "right", fontSize: 12, fontWeight: 500, color: texte, opacity: 0.9 }}>{etat}</span>
                  <span style={{ color: texte, fontSize: 12, opacity: 0.85, transform: ouverte ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▼</span>
                </button>
                {ouverte && (
                  <div style={{ background: "#fff", border: `1px solid ${BORD}`, borderTop: 0, borderRadius: "0 0 14px 14px", overflowX: "auto" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 860, fontSize: 13 }}>
                      <thead>{entete(true)}</thead>
                      <tbody>{liste.map((a) => ligne(a, true))}</tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {ouvert && (
        <VoletArticle article={ouvert} peutEcrire={peutEcrire} periode={donnees?.periode_ventes ?? null} bureau={bureau}
          onFermer={() => { setOuvertId(null); setRelierOuvert(false); }} onRecharger={recharger}
          relierOuvert={relierOuvert} setRelierOuvert={setRelierOuvert} />
      )}
      {!bureau && peutEcrire && (
        <button type="button" onClick={() => router.push("/fiche/new")} style={{ position: "fixed", right: 16, bottom: 86, zIndex: 90, height: 44, padding: "0 18px", borderRadius: 22, border: "none", background: ACCENT, color: "#fff", fontWeight: 700, fontSize: 14, boxShadow: "0 6px 18px rgba(0,0,0,0.18)", fontFamily: "inherit" }}>+ Fiche</button>
      )}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export function Carte({ vueInitiale }: { vueInitiale?: VueCarte | null }) {
  const bureau = useBureau();
  const router = useRouter();
  const { can, isGroupAdmin, loading } = useProfile();
  const voitArticles = can("performances.show_money");
  const peutEcrire = can("operations.edit_recettes");
  const vues: { cle: VueCarte; libelle: string }[] = [
    ...(voitArticles ? [{ cle: "articles" as const, libelle: "Articles" }] : []),
    { cle: "fiches", libelle: "Fiches techniques" },
    { cle: "preparations", libelle: "Préparations" },
    { cle: "equipe", libelle: "Vue équipe" },
  ];
  const [vueChoisie, setVueChoisie] = useState<VueCarte | null>(vueInitiale ?? null);
  const vue: VueCarte = vueChoisie && vues.some((v) => v.cle === vueChoisie) ? vueChoisie : voitArticles ? "articles" : "equipe";

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: MUTED }}>Chargement…</div>;

  return (
    <div style={{ background: "#f2ede4", minHeight: "100vh" }}>
      <div style={{ padding: bureau ? "18px 28px 60px" : "12px 14px 90px", boxSizing: "border-box", display: "grid", gap: 14, alignContent: "start" }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
          <div>
            <h1 style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: bureau ? 28 : 22, textTransform: "uppercase", letterSpacing: ".02em", margin: 0, lineHeight: 1.05, color: "#1a1a1a" }}>Carte</h1>
            <div style={{ color: MUTED, fontSize: 13 }}>
              {vue === "articles" ? "Ce qui se vend en caisse, relié à sa fiche technique : prix, coût matière, food cost, marge."
                : vue === "fiches" ? "Les fiches techniques de la maison : pizze, cuisine, cocktails, empâtements, vins."
                : vue === "preparations" ? "Sauces, pâtes, fonds et bases : les préparations utilisées dans les fiches."
                : "Ce que la salle doit savoir : photo, description, allergènes, accords."}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", background: "#ece4d4", borderRadius: 10, padding: 3, gap: 3, overflowX: "auto", maxWidth: "100%" }}>
              {vues.map((v) => (
                <button key={v.cle} type="button" onClick={() => setVueChoisie(v.cle)}
                  style={{ padding: "6px 12px", borderRadius: 8, border: "none", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", background: vue === v.cle ? "#fff" : "transparent", color: vue === v.cle ? "#1a1a1a" : MUTED, boxShadow: vue === v.cle ? "0 1px 4px rgba(0,0,0,0.08)" : "none" }}>{v.libelle}</button>
              ))}
            </span>
            {bureau && peutEcrire && vue !== "equipe" && (
              <button type="button" onClick={() => router.push("/fiche/new")} style={{ ...BTN, background: ACCENT, color: "#fff", border: "none", fontWeight: 700 }}>+ Nouvelle fiche</button>
            )}
          </div>
        </div>

        {vue === "articles" && voitArticles && <VueArticles bureau={bureau} peutEcrire={peutEcrire} estAdmin={isGroupAdmin} />}
        {vue === "fiches" && <CatalogueContent />}
        {vue === "preparations" && <CatalogueContent preparations />}
        {vue === "equipe" && <CatalogueSalleContent sansTitre />}
      </div>
    </div>
  );
}
