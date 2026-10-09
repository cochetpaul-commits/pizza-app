"use client";

import React, { useMemo, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { VoletDroit } from "@/components/produits/BaseProduits";
import { OSWALD } from "@/components/TuileProduit";
import { Tuile } from "@/components/ui/Tuile";
import { EtatVide } from "@/components/ui/EtatVide";
import { couleurTexteSur, styleBarreCategorie } from "@/lib/styleCategories";
import type { DonneesCarte, EditionFiche } from "./Carte";
import type { FicheCarte, ReponseCarte } from "@/app/api/carte/route";

/**
 * Vues « Fiches techniques » et « Préparations » de la Carte (10/10/2026), sur le gabarit commun :
 * tuiles, filtres, barres de catégories et tableau (bureau) ou cartes (téléphone), volet de lecture à droite.
 * Fiches techniques = ce qui se vend (pizze, cuisine, cocktails, vins). Préparations = sauces, bases, empâtements.
 */

const BORD = "#ddd6c8";
const MUTED = "#6f6a61";
const FAIBLE = "#a39d92";
const BON = "#4a6741";
const ATTENTION = "#b7791f";
const MAUVAIS = "#b4443a";
const ACCENT = "#D4775A";
const CATEGORIES_PREP = new Set(["preparation", "sauce"]);
const COULEUR_VIN = "#955251";
const COULEUR_EMPATEMENT = "#A47864";
const COULEUR_ANCIEN = "#939597";

const euros = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const pct = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
const qte = (q: number | null, u: string | null) => (q == null ? "—" : `${q.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ${u ?? ""}`.trim());
const STATUTS: Record<string, { libelle: string; couleur: string }> = {
  publiee: { libelle: "Publiée", couleur: BON }, validee: { libelle: "Validée", couleur: "#2563EB" }, brouillon: { libelle: "Brouillon", couleur: ATTENTION },
};

const TH: CSSProperties = { textAlign: "left", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: FAIBLE, padding: "8px 14px", borderBottom: `1px solid ${BORD}`, fontWeight: 600, whiteSpace: "nowrap" };
const TD: CSSProperties = { padding: "10px 14px", borderBottom: "1px solid #f0ebe2", verticalAlign: "middle", fontSize: 13 };
const SELECT: CSSProperties = { height: 36, padding: "0 10px", borderRadius: 10, border: `1px solid ${BORD}`, background: "#fff", fontSize: 12.5, fontFamily: "inherit", color: "#1a1a1a", cursor: "pointer" };
const BTN: CSSProperties = { height: 36, padding: "0 14px", borderRadius: 10, border: `1px solid ${BORD}`, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "#1a1a1a", whiteSpace: "nowrap" };

function verdict(fc: number | null): { couleur: string; libelle: string } | null {
  if (fc == null) return null;
  if (fc > 60 || fc < 5) return { couleur: MAUVAIS, libelle: "À vérifier" };
  if (fc < 20) return { couleur: BON, libelle: "Excellent" };
  if (fc < 28) return { couleur: BON, libelle: "Bon" };
  if (fc < 35) return { couleur: ATTENTION, libelle: "Correct" };
  return { couleur: MAUVAIS, libelle: "Élevé" };
}
function Point({ couleur }: { couleur: string }) {
  return <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: couleur, marginRight: 7, verticalAlign: 1 }} />;
}
function Statut({ s }: { s: string | null }) {
  const v = s ? STATUTS[s] : undefined;
  if (!v) return <span style={{ color: FAIBLE }}>—</span>;
  return <span style={{ fontSize: 12, fontWeight: 600, color: v.couleur, whiteSpace: "nowrap" }}><Point couleur={v.couleur} />{v.libelle}</span>;
}

// Affichage A → Z ou par catégorie, mémorisé sur l'appareil ; par catégorie par défaut pour les fiches
const CLE = "carte:fiches:affichage";
const abonnes = new Set<() => void>();
const lire = (): "az" | "cat" => { try { return localStorage.getItem(CLE) === "az" ? "az" : "cat"; } catch { return "cat"; } };
const ecrire = (v: "az" | "cat") => { try { localStorage.setItem(CLE, v); } catch { /* navigation privée */ } abonnes.forEach((f) => f()); };
const abonner = (f: () => void) => { abonnes.add(f); return () => { abonnes.delete(f); }; };

/** Une ligne du tableau, quelle que soit sa nature (fiche, vin, empâtement, ancienne préparation) */
type Ligne = {
  id: string;
  groupe: string;
  nom: string;
  sous: string | null;
  statut: string | null;
  nbIngredients: number | null;
  cout: number | null;
  coutLibelle: string | null;
  prix: number | null;
  prixLibelle: string | null;
  foodCost: number | null;
  fiche: FicheCarte | null;
  href: string | null;
};
type Groupe = { cle: string; libelle: string; couleur: string; ordre: number };

function construire(d: ReponseCarte, mode: "fiches" | "preparations"): { lignes: Ligne[]; groupes: Groupe[] } {
  const catParSlug = new Map(d.categories.map((c) => [c.slug, c]));
  const groupes = new Map<string, Groupe>();
  const lignes: Ligne[] = [];
  const groupeDeFiche = (slug: string): Groupe => {
    const c = catParSlug.get(slug);
    const g = groupes.get(slug) ?? { cle: slug, libelle: c?.nom ?? slug.replace(/_/g, " ").replace(/^./, (x) => x.toUpperCase()), couleur: c?.couleur ?? COULEUR_ANCIEN, ordre: c?.ordre ?? 90 };
    groupes.set(slug, g);
    return g;
  };
  for (const f of d.fiches) {
    const prep = CATEGORIES_PREP.has(f.categorie);
    if ((mode === "preparations") !== prep) continue;
    const g = groupeDeFiche(f.categorie);
    const rendement = f.poids_g ? `${f.poids_g >= 1000 ? `${(f.poids_g / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} kg` : `${Math.round(f.poids_g)} g`}` : f.nb_parts > 1 ? `${f.nb_parts} parts` : null;
    lignes.push({
      id: f.id, groupe: g.cle, nom: f.nom,
      sous: prep ? rendement : (f.sous_categorie ?? f.description ?? null),
      statut: f.statut, nbIngredients: f.lignes.length,
      cout: prep ? f.total_cost : f.cout,
      coutLibelle: prep ? (f.total_cost != null ? "la recette" : null) : (f.cout != null ? (f.categorie === "pizza" ? "la pizza" : f.nb_parts > 1 ? "la part" : "la portion") : null),
      prix: f.prix_ttc, prixLibelle: f.prix_source === "popina" ? "caisse" : f.prix_source === "fiche" ? "fiche" : null,
      foodCost: f.food_cost, fiche: f, href: null,
    });
  }
  if (mode === "fiches" && d.vins.length) {
    groupes.set("vins", { cle: "vins", libelle: "Vins", couleur: COULEUR_VIN, ordre: 80 });
    for (const v of d.vins) {
      lignes.push({ id: `vin-${v.id}`, groupe: "vins", nom: v.nom, sous: [v.domaine, v.couleur].filter(Boolean).join(" · ") || null, statut: null, nbIngredients: null, cout: null, coutLibelle: null, prix: v.prix, prixLibelle: v.prix != null ? "carte" : null, foodCost: null, fiche: null, href: `/recettes/vin/${v.id}` });
    }
  }
  if (mode === "preparations") {
    if (d.empatements.length) {
      groupes.set("empatements", { cle: "empatements", libelle: "Empâtements", couleur: COULEUR_EMPATEMENT, ordre: 85 });
      for (const e of d.empatements) {
        lignes.push({ id: `emp-${e.id}`, groupe: "empatements", nom: e.nom, sous: e.patons && e.poids ? `${e.patons} pâton${e.patons > 1 ? "s" : ""} × ${e.poids} g` : null, statut: null, nbIngredients: null, cout: null, coutLibelle: null, prix: null, prixLibelle: null, foodCost: null, fiche: null, href: `/recettes/empatement/${e.id}` });
      }
    }
    if (d.preparations_anciennes.length) {
      groupes.set("anciennes", { cle: "anciennes", libelle: "Préparations (ancien module)", couleur: COULEUR_ANCIEN, ordre: 95 });
      for (const p of d.preparations_anciennes) {
        lignes.push({ id: `prep-${p.id}`, groupe: "anciennes", nom: p.nom, sous: p.poids_g ? `${p.poids_g} g` : null, statut: null, nbIngredients: null, cout: null, coutLibelle: null, prix: null, prixLibelle: null, foodCost: null, fiche: null, href: `/prep/${p.id}` });
      }
    }
  }
  return { lignes, groupes: [...groupes.values()].sort((a, b) => a.ordre - b.ordre || a.libelle.localeCompare(b.libelle, "fr")) };
}

/* ── Volet de lecture d'une fiche ─────────────────────────────────────────── */

const Titre = ({ children }: { children: ReactNode }) => <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: MUTED, marginTop: 8, paddingTop: 14, borderTop: `1px solid ${BORD}` }}>{children}</div>;
const Kpi = ({ l, val, s, couleur }: { l: string; val: string; s: string; couleur?: string }) => (
  <div style={{ background: "#f7f3ec", borderRadius: 12, padding: "10px 12px" }}>
    <div style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>{l}</div>
    <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 22, lineHeight: 1.1, color: couleur ?? "#1a1a1a", fontVariantNumeric: "tabular-nums" }}>{val}</div>
    <div style={{ fontSize: 11.5, color: MUTED }}>{s}</div>
  </div>
);

function VoletLecture({ fiche, groupe, peutEcrire, onFermer, onEditer }: { fiche: FicheCarte; groupe: Groupe; peutEcrire: boolean; onFermer: () => void; onEditer: (e: EditionFiche) => void }) {
  const v = verdict(fiche.food_cost);
  const prep = CATEGORIES_PREP.has(fiche.categorie);
  const sousTitre = [groupe.libelle, fiche.sous_categorie, fiche.statut ? STATUTS[fiche.statut]?.libelle : null, `${fiche.lignes.length} ingrédient${fiche.lignes.length > 1 ? "s" : ""}`].filter(Boolean).join(" · ");
  const pied = (
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
      <button type="button" onClick={onFermer} style={BTN}>Fermer</button>
      {peutEcrire && <button type="button" onClick={() => onEditer({ recipeId: fiche.id })} style={{ ...BTN, background: "#1a1a1a", color: "#f2ede4", border: "none", fontWeight: 700 }}>Modifier la fiche</button>}
    </div>
  );
  return (
    <VoletDroit titre={fiche.nom} sousTitre={sousTitre} onFermer={onFermer} pied={pied}>
      <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
        {fiche.photo_url && <div style={{ height: 160, borderRadius: 12, background: `url(${fiche.photo_url}) center/cover` }} />}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {prep ? (
            <>
              <Kpi l="Coût de la recette" val={fiche.total_cost != null ? euros(fiche.total_cost) : "—"} s={fiche.poids_g ? `${fiche.poids_g} g produits` : fiche.nb_parts > 1 ? `${fiche.nb_parts} parts` : "au prix d'achat du moment"} />
              <Kpi l="Ingrédients" val={String(fiche.lignes.length)} s={fiche.allergenes.length ? `${fiche.allergenes.length} allergène${fiche.allergenes.length > 1 ? "s" : ""}` : "aucun allergène"} />
            </>
          ) : (
            <>
              <Kpi l="Prix de vente TTC" val={fiche.prix_ttc != null ? euros(fiche.prix_ttc) : "—"} s={fiche.prix_source === "popina" ? `touche « ${fiche.popina_nom} »` : fiche.prix_source === "fiche" ? "prix de la fiche" : "pas de prix"} />
              <Kpi l="Coût matière" val={fiche.cout != null ? euros(fiche.cout) : "—"} s={fiche.cout != null ? (fiche.categorie === "pizza" ? "la pizza" : fiche.nb_parts > 1 ? `la part (${fiche.nb_parts} parts)` : "la portion") : "fiche sans coût"} />
              <Kpi l="Food cost (HT)" val={fiche.food_cost != null ? pct(fiche.food_cost) : "—"} s={v ? v.libelle : "coût ou prix manquant"} couleur={v?.couleur} />
              <Kpi l="Ingrédients" val={String(fiche.lignes.length)} s={fiche.allergenes.length ? `${fiche.allergenes.length} allergène${fiche.allergenes.length > 1 ? "s" : ""}` : "aucun allergène"} />
            </>
          )}
        </div>
        {fiche.description && (<><Titre>Description (carte du restaurant)</Titre><div style={{ fontSize: 13.5 }}>{fiche.description}</div></>)}
        {fiche.resume_salle && (<><Titre>Résumé pour la salle</Titre><div style={{ fontSize: 13.5 }}>{fiche.resume_salle}</div></>)}
        {fiche.allergenes.length > 0 && (
          <>
            <Titre>Allergènes (depuis les ingrédients)</Titre>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{fiche.allergenes.map((a) => <span key={a} style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 8, background: "rgba(180,68,58,0.1)", color: MAUVAIS }}>{a}</span>)}</div>
          </>
        )}
        <Titre>Recette</Titre>
        <div style={{ fontSize: 12, color: MUTED }}>{fiche.categorie === "pizza" ? "Quantités pour une pizza." : fiche.nb_parts > 1 ? `Quantités pour ${fiche.nb_parts} parts.` : "Quantités pour une portion."}</div>
        {fiche.lignes.length === 0 && <div style={{ fontSize: 13, color: FAIBLE }}>Aucune ligne dans la fiche.</div>}
        {fiche.lignes.map((l, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 0", borderBottom: i < fiche.lignes.length - 1 ? "1px solid #ece6db" : "none", fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>{l.nom}{l.preparation && <span style={{ fontSize: 11, color: MUTED, fontWeight: 500 }}> · préparation</span>}</span>
            <span style={{ color: MUTED, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{qte(l.qty, l.unit)}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, paddingTop: 8 }}>
          <span>Coût matière de la recette</span><span>{fiche.total_cost != null ? euros(fiche.total_cost) : "—"}</span>
        </div>
      </div>
    </VoletDroit>
  );
}

/* ── Vue ─────────────────────────────────────────────────────────────────── */

export function VueFiches({ mode, bureau, peutEcrire, onEditer, editionOuverte, source }: {
  mode: "fiches" | "preparations"; bureau: boolean; peutEcrire: boolean; onEditer: (e: EditionFiche) => void; editionOuverte: boolean; source: DonneesCarte;
}) {
  const router = useRouter();
  const { donnees, erreur } = source;
  const affichage = useSyncExternalStore(abonner, lire, () => "cat" as const);
  const [q, setQ] = useState("");
  const [groupeFiltre, setGroupeFiltre] = useState("tous");
  const [statut, setStatut] = useState("tous");
  const [ouvertId, setOuvertId] = useState<string | null>(null);
  const [sectionsOuvertes, setSectionsOuvertes] = useState<Set<string>>(() => new Set());

  const { lignes, groupes } = useMemo(() => (donnees ? construire(donnees, mode) : { lignes: [], groupes: [] }), [donnees, mode]);
  const groupeParCle = useMemo(() => new Map(groupes.map((g) => [g.cle, g])), [groupes]);
  const fiches = useMemo(() => lignes.filter((l) => l.fiche), [lignes]);
  const compteurs = useMemo(() => {
    const publiees = fiches.filter((l) => l.statut === "publiee").length;
    const sansCout = fiches.filter((l) => l.cout == null).length;
    const avecFc = fiches.filter((l) => l.foodCost != null && verdict(l.foodCost)?.libelle !== "À vérifier");
    const fcMoyen = avecFc.length ? avecFc.reduce((s, l) => s + (l.foodCost ?? 0), 0) / avecFc.length : null;
    const sansPrix = fiches.filter((l) => l.prix == null).length;
    return { total: fiches.length, publiees, sansCout, fcMoyen, sansPrix, autres: lignes.length - fiches.length };
  }, [fiches, lignes]);

  const filtrees = useMemo(() => {
    const texte = q.trim().toLowerCase();
    return lignes.filter((l) => {
      if (groupeFiltre !== "tous" && l.groupe !== groupeFiltre) return false;
      if (statut === "sans_cout" ? l.cout != null || !l.fiche : statut === "sans_prix" ? l.prix != null || !l.fiche : statut !== "tous" && l.statut !== statut) return false;
      if (texte && !`${l.nom} ${l.sous ?? ""} ${l.fiche?.description ?? ""}`.toLowerCase().includes(texte)) return false;
      return true;
    }).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  }, [lignes, q, groupeFiltre, statut]);
  const parGroupe = useMemo(() => {
    const m = new Map<string, Ligne[]>();
    for (const l of filtrees) { const arr = m.get(l.groupe) ?? []; arr.push(l); m.set(l.groupe, arr); }
    return groupes.filter((g) => m.has(g.cle)).map((g) => [g, m.get(g.cle) as Ligne[]] as const);
  }, [filtrees, groupes]);
  const enRecherche = q.trim().length > 0;
  const ouverte = ouvertId ? lignes.find((l) => l.id === ouvertId) ?? null : null;

  const ouvrir = (l: Ligne) => { if (l.href) router.push(l.href); else setOuvertId(l.id); };
  const basculer = (cle: string) => setSectionsOuvertes((s) => { const n = new Set(s); if (n.has(cle)) n.delete(cle); else n.add(cle); return n; });

  const entete = (enSection: boolean) => (
    <tr>
      {enSection && <th style={{ ...TH, padding: 0, width: 4 }} />}
      <th style={TH}>{mode === "fiches" ? "Fiche" : "Préparation"}</th>
      {!enSection && <th style={TH}>Catégorie</th>}
      <th style={TH}>Statut</th>
      <th style={{ ...TH, textAlign: "right" }}>Ingrédients</th>
      <th style={{ ...TH, textAlign: "right" }}>{mode === "fiches" ? "Coût matière" : "Coût recette"}</th>
      {mode === "fiches" && <th style={{ ...TH, textAlign: "right" }}>Prix TTC</th>}
      {mode === "fiches" && <th style={{ ...TH, textAlign: "right" }}>Food cost</th>}
      <th style={TH} />
    </tr>
  );
  const ligne = (l: Ligne, enSection: boolean) => {
    const g = groupeParCle.get(l.groupe);
    const v = verdict(l.foodCost);
    return (
      <tr key={l.id} className={`cf-ligne${ouverte?.id === l.id ? " on" : ""}`} onClick={() => ouvrir(l)} style={{ cursor: "pointer" }}>
        {enSection && <td style={{ ...TD, padding: 0, width: 4, background: g?.couleur }} />}
        <td style={{ ...TD, minWidth: 240 }}>
          <div style={{ fontWeight: 600 }}>{l.nom}</div>
          {l.sous && <div style={{ fontSize: 12, color: MUTED, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 420 }}>{l.sous}</div>}
        </td>
        {!enSection && <td style={TD}><span style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}><Point couleur={g?.couleur ?? FAIBLE} />{g?.libelle}</span></td>}
        <td style={TD}><Statut s={l.statut} /></td>
        <td style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums", color: l.nbIngredients == null ? FAIBLE : "#1a1a1a" }}>{l.nbIngredients ?? "—"}</td>
        <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: l.cout == null ? FAIBLE : "#1a1a1a" }}>
          {l.cout != null ? euros(l.cout) : "—"}{l.coutLibelle && <div style={{ fontSize: 11, color: FAIBLE }}>{l.coutLibelle}</div>}
        </td>
        {mode === "fiches" && <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: l.prix == null ? FAIBLE : "#1a1a1a" }}>
          {l.prix != null ? euros(l.prix) : "—"}{l.prixLibelle && <div style={{ fontSize: 11, color: FAIBLE }}>{l.prixLibelle}</div>}
        </td>}
        {mode === "fiches" && <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap" }}>
          {v && l.foodCost != null ? <span style={{ fontWeight: 600, color: v.couleur, fontVariantNumeric: "tabular-nums" }}><Point couleur={v.couleur} />{pct(l.foodCost)}</span> : <span style={{ color: FAIBLE }}>—</span>}
        </td>}
        <td style={{ ...TD, textAlign: "right", width: 40, color: FAIBLE, fontWeight: 700 }}>→</td>
      </tr>
    );
  };
  const carte = (l: Ligne) => {
    const g = groupeParCle.get(l.groupe);
    const v = verdict(l.foodCost);
    return (
      <button key={l.id} type="button" onClick={() => ouvrir(l)}
        style={{ display: "grid", gridTemplateColumns: "4px 1fr auto", gap: 12, alignItems: "center", textAlign: "left", width: "100%", background: "#fff", border: `1px solid ${BORD}`, borderRadius: 12, padding: "0 12px 0 0", overflow: "hidden", cursor: "pointer", fontFamily: "inherit", color: "#1a1a1a" }}>
        <span style={{ alignSelf: "stretch", background: g?.couleur }} />
        <span style={{ padding: "10px 0", minWidth: 0 }}>
          <span style={{ display: "block", fontWeight: 600, fontSize: 14 }}>{l.nom}</span>
          <span style={{ display: "block", fontSize: 12, color: MUTED, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[g?.libelle, l.sous, l.statut ? STATUTS[l.statut]?.libelle : null].filter(Boolean).join(" · ")}</span>
        </span>
        <span style={{ textAlign: "right", display: "grid", gap: 2, justifyItems: "end" }}>
          <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{mode === "fiches" ? (l.prix != null ? euros(l.prix) : l.cout != null ? euros(l.cout) : "—") : (l.cout != null ? euros(l.cout) : "—")}</span>
          {v && l.foodCost != null ? <span style={{ fontSize: 12, fontWeight: 600, color: v.couleur }}>{pct(l.foodCost)}</span> : l.cout != null && mode === "fiches" ? <span style={{ fontSize: 11, color: FAIBLE }}>coût {euros(l.cout)}</span> : null}
        </span>
      </button>
    );
  };

  const creation: EditionFiche = mode === "preparations" ? { cat: "preparation" } : {};

  return (
    <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
      <style>{`.cf-ligne:hover td{background:#f7f3ec}.cf-ligne.on td{background:rgba(212,119,90,0.12)}.cf-ligne:last-child td{border-bottom:0}`}</style>

      <div style={{ display: "grid", gridTemplateColumns: bureau ? "repeat(4, 1fr)" : "repeat(2, 1fr)", gap: 10 }}>
        <Tuile couleur="#1a1a1a" icone="fiche" libelle={mode === "fiches" ? "Fiches techniques" : "Préparations"} valeur={String(compteurs.total)} sous={compteurs.autres ? `+ ${compteurs.autres} ${mode === "fiches" ? "vins" : "empâtements et anciennes fiches"}` : mode === "fiches" ? "pizze, cuisine, cocktails" : "sauces, bases, pâtes"} active={statut === "tous"} onClick={() => setStatut("tous")} />
        <Tuile icone="recu" couleur={BON} libelle="Publiées" valeur={String(compteurs.publiees)} sous="visibles par l'équipe dans la Carte" active={statut === "publiee"} onClick={() => setStatut(statut === "publiee" ? "tous" : "publiee")} />
        <Tuile icone="sans" couleur={compteurs.sansCout ? MAUVAIS : BON} libelle="Sans coût" valeur={String(compteurs.sansCout)} sous="ingrédients sans prix d'achat" active={statut === "sans_cout"} onClick={() => setStatut(statut === "sans_cout" ? "tous" : "sans_cout")} />
        {mode === "fiches"
          ? <Tuile icone="foodcost" couleur={compteurs.fcMoyen != null ? (verdict(compteurs.fcMoyen)?.couleur ?? undefined) : undefined} libelle="Food cost moyen" valeur={compteurs.fcMoyen != null ? pct(compteurs.fcMoyen) : "—"} sous={compteurs.sansPrix ? `${compteurs.sansPrix} fiche${compteurs.sansPrix > 1 ? "s" : ""} sans prix de vente` : "sur les fiches avec prix et coût"} active={statut === "sans_prix"} onClick={() => setStatut(statut === "sans_prix" ? "tous" : "sans_prix")} />
          : <Tuile icone="alerte" couleur={ATTENTION} libelle="Brouillons" valeur={String(fiches.filter((l) => l.statut === "brouillon").length)} sous="à valider ou à publier" active={statut === "brouillon"} onClick={() => setStatut(statut === "brouillon" ? "tous" : "brouillon")} />}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={mode === "fiches" ? "Rechercher une fiche…" : "Rechercher une préparation…"}
          style={{ flex: "1 1 220px", height: 36, padding: "0 12px", borderRadius: 10, border: `1px solid ${BORD}`, fontSize: 13, fontFamily: "inherit", outline: "none", background: "#fff", minWidth: 0 }} />
        <select value={groupeFiltre} onChange={(e) => setGroupeFiltre(e.target.value)} style={SELECT}>
          <option value="tous">Catégorie : toutes</option>
          {groupes.map((g) => <option key={g.cle} value={g.cle}>{g.libelle}</option>)}
        </select>
        <select value={statut} onChange={(e) => setStatut(e.target.value)} style={SELECT}>
          <option value="tous">Statut : tous</option><option value="publiee">Publiées</option><option value="validee">Validées</option><option value="brouillon">Brouillons</option><option value="sans_cout">Sans coût</option>{mode === "fiches" && <option value="sans_prix">Sans prix de vente</option>}
        </select>
        {bureau && <span style={{ marginLeft: "auto", color: MUTED, fontSize: 12.5 }}>{filtrees.length} {mode === "fiches" ? "fiche" : "préparation"}{filtrees.length > 1 ? "s" : ""}</span>}
        <span style={{ display: "inline-flex", background: "#ece4d4", borderRadius: 10, padding: 3, gap: 3, marginLeft: bureau ? 0 : "auto" }}>
          {(["az", "cat"] as const).map((v) => (
            <button key={v} type="button" onClick={() => ecrire(v)} style={{ padding: "5px 10px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", background: affichage === v ? "#fff" : "transparent", color: affichage === v ? "#1a1a1a" : MUTED, boxShadow: affichage === v ? "0 1px 2px rgba(0,0,0,0.08)" : "none" }}>{v === "az" ? "A → Z" : "Par catégorie"}</button>
          ))}
        </span>
      </div>

      {erreur && <div style={{ padding: 14, borderRadius: 12, background: "rgba(180,68,58,0.08)", color: MAUVAIS, fontSize: 13 }}>{erreur}</div>}
      {!donnees && !erreur && <div style={{ padding: 30, textAlign: "center", color: MUTED }}>Chargement des fiches…</div>}
      {donnees && filtrees.length === 0 && (
        <EtatVide icone={enRecherche || statut !== "tous" || groupeFiltre !== "tous" ? "recherche" : "liste"} titre={enRecherche || statut !== "tous" || groupeFiltre !== "tous" ? "Aucune fiche ne correspond" : mode === "fiches" ? "Aucune fiche technique" : "Aucune préparation"}
          texte={enRecherche || statut !== "tous" || groupeFiltre !== "tous" ? "Modifiez la recherche ou les filtres." : "Créez la première avec « + Nouvelle fiche »."}
          action={peutEcrire && !enRecherche && statut === "tous" && groupeFiltre === "tous" ? <button type="button" onClick={() => onEditer(creation)} style={{ ...BTN, background: ACCENT, color: "#fff", border: "none", fontWeight: 700 }}>+ Nouvelle fiche</button> : undefined} />
      )}

      {donnees && filtrees.length > 0 && !bureau && (
        <div style={{ display: "grid", gap: 8 }}>
          {affichage === "az"
            ? filtrees.map(carte)
            : parGroupe.map(([g, liste]) => {
              const ouv = enRecherche || sectionsOuvertes.has(g.cle);
              return (
                <div key={g.cle} style={{ display: "grid", gap: 8 }}>
                  <button type="button" onClick={() => basculer(g.cle)} className="barre-categorie" style={{ ...styleBarreCategorie(g.couleur), minHeight: 44, gap: 10, padding: "0 14px", boxShadow: "none", borderRadius: 14 }}>
                    <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", letterSpacing: ".04em", color: couleurTexteSur(g.couleur) }}>{g.libelle}</span>
                    <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 15, color: couleurTexteSur(g.couleur), opacity: 0.7, marginLeft: -4, flex: 1, textAlign: "left" }}>{liste.length}</span>
                    <span style={{ color: couleurTexteSur(g.couleur), fontSize: 12, opacity: 0.85, transform: ouv ? "rotate(180deg)" : "none" }}>▼</span>
                  </button>
                  {ouv && liste.map(carte)}
                </div>
              );
            })}
        </div>
      )}

      {donnees && filtrees.length > 0 && bureau && affichage === "az" && (
        <div style={{ background: "#fff", border: `1px solid ${BORD}`, borderRadius: 14, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 820, fontSize: 13 }}>
            <thead>{entete(false)}</thead>
            <tbody>{filtrees.map((l) => ligne(l, false))}</tbody>
          </table>
        </div>
      )}

      {donnees && filtrees.length > 0 && bureau && affichage === "cat" && (
        <div style={{ display: "grid", gap: 10 }}>
          {parGroupe.map(([g, liste]) => {
            const ouv = enRecherche || sectionsOuvertes.has(g.cle);
            const texte = couleurTexteSur(g.couleur);
            const avecFc = liste.filter((l) => l.foodCost != null && verdict(l.foodCost)?.libelle !== "À vérifier");
            const sansCout = liste.filter((l) => l.fiche && l.cout == null).length;
            const brouillons = liste.filter((l) => l.statut === "brouillon").length;
            const etat = [
              mode === "fiches" && avecFc.length ? `food cost ${pct(avecFc.reduce((s, l) => s + (l.foodCost ?? 0), 0) / avecFc.length)}` : null,
              sansCout ? `${sansCout} sans coût` : null,
              brouillons ? `${brouillons} brouillon${brouillons > 1 ? "s" : ""}` : null,
            ].filter(Boolean).join(" · ");
            return (
              <div key={g.cle}>
                <button type="button" aria-expanded={ouv} className={`barre-categorie${ouv ? " ouverte" : ""}`} onClick={() => basculer(g.cle)}
                  style={{ ...styleBarreCategorie(g.couleur), minHeight: 46, gap: 12, padding: "0 16px", boxShadow: "none", borderRadius: ouv ? "14px 14px 0 0" : 14 }}>
                  <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", letterSpacing: ".04em", color: texte }}>{g.libelle}</span>
                  <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 15, color: texte, opacity: 0.7, marginLeft: -4 }}>{liste.length}</span>
                  <span style={{ flex: 1, textAlign: "right", fontSize: 12, fontWeight: 500, color: texte, opacity: 0.9 }}>{etat}</span>
                  <span style={{ color: texte, fontSize: 12, opacity: 0.85, transform: ouv ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▼</span>
                </button>
                {ouv && (
                  <div style={{ background: "#fff", border: `1px solid ${BORD}`, borderTop: 0, borderRadius: "0 0 14px 14px", overflowX: "auto" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 780, fontSize: 13 }}>
                      <thead>{entete(true)}</thead>
                      <tbody>{liste.map((l) => ligne(l, true))}</tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {ouverte?.fiche && !editionOuverte && (
        <VoletLecture fiche={ouverte.fiche} groupe={groupeParCle.get(ouverte.groupe) ?? { cle: "", libelle: "", couleur: FAIBLE, ordre: 0 }} peutEcrire={peutEcrire} onFermer={() => setOuvertId(null)} onEditer={(e) => { setOuvertId(null); onEditer(e); }} />
      )}
      {!bureau && peutEcrire && (
        <button type="button" onClick={() => onEditer(creation)} style={{ position: "fixed", right: 16, bottom: 86, zIndex: 90, height: 44, padding: "0 18px", borderRadius: 22, border: "none", background: ACCENT, color: "#fff", fontWeight: 700, fontSize: 14, fontFamily: "inherit", boxShadow: "0 6px 18px rgba(0,0,0,0.18)", cursor: "pointer" }}>+ Fiche</button>
      )}
    </div>
  );
}

