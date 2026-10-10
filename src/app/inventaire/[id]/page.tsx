"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { RequireRole } from "@/components/RequireRole";
import { supabase } from "@/lib/supabaseClient";
import { fetchApi, openApiFile } from "@/lib/fetchApi";
import { ModalNonComptes } from "@/components/inventaire/ModalNonComptes";
import { inChunks } from "@/lib/supabaseChunks";
import { useProfile } from "@/lib/ProfileContext";
import { libelleZone } from "@/lib/commandeArticles";
import { articleDeFiche, categorieDeFamille, choisirConditionnement, conditionnementDArticle, ficheDepuisCreation, totalLigne, type ArticleFournisseur, type Conditionnement, type CreationProduit, type FicheConditionnement, type OffreActive } from "@/lib/inventaire";
import { libelleType, TYPES_COLISAGE } from "@/lib/commandeArticles";
import { coutUniteComptee, type OffreValo, type RecetteValo } from "@/lib/inventaireValorisation";
import { cleEtab } from "@/lib/zonesEtablissement";
import { CATEGORIES, CAT_COLORS, CAT_LABELS, type Category } from "@/types/ingredients";
import { couleurRayon, rayonDuProduit, RAYON_AUTRES, RAYON_PREPARATIONS } from "@/lib/rayons";
import { getSupplierColor } from "@/lib/supplierColors";
import { BoutonCrayon, BoutonCroix, Compteur, Conditionnement as CondLibelle } from "@/components/TuileProduit";
import { CelluleProduit, TableauMobile } from "@/components/ui/TableauMobile";
import { useBureau, useLarge } from "@/hooks/useBureau";
import { couleurTexte, styleBarreCategorie, styleChevronBarre, stylePastilleBarre, styleSousCategorie, styleTitreCategorie } from "@/lib/styleCategories";
import { correspondRecherche, filtrerRecherche, normaliserRecherche } from "@/lib/rechercheTolerante";
void categorieDeFamille;

/**
 * Inventaire « feuille » : saisie zone par zone, dans l'ordre de la feuille papier (famille, puis produit).
 * Deux champs par produit, colis et unités ; total = colis × contenu + unités. Chaque ligne se compte à l'unité
 * ou par colis (conditionnement de commande de la fiche), affiche le détail du conditionnement et le coût
 * unitaire, s'ouvre sur la fiche produit (crayon), se retire de la liste (et se remet), change de zone.
 * Zones : ajout depuis l'écran. Produits : ajout par recherche ou par catégorie, création rapide d'une fiche.
 * Enregistrement au fil de la saisie ; clôturé = lecture seule (un admin peut rouvrir). Admins et managers.
 */

type Inventaire = { id: string; etablissement_id: string; date: string; type: "fin_exercice" | "mensuel"; statut: string; saisie: string };
type Ligne = {
  id: string; ingredient_id: string; zone: string; ordre: number | null; famille: string | null;
  colis: number | null; unites: number | null; quantite: number; unite: string | null;
  cond_contenu: number | null; cond_libelle: string | null; retiree: boolean; nom: string;
  nom_feuille: string | null; rattachement: string | null; aVerifier: boolean; inactive: boolean;
};
type Fiche = {
  id: string; name: string; status: string | null; is_active: boolean; category: string | null; sub_category: string | null; rayon_commande: string | null; default_unit: string | null; default_supplier_id: string | null; supplier_id: string | null;
  purchase_price: number | null; purchase_unit: number | null; purchase_unit_label: string | null; piece_weight_g: number | null; piece_volume_ml: number | null; density_g_per_ml: number | null;
  order_unit_label: string | null; order_quantity: number | null; order_element: string | null; order_element_permis: boolean | null;
};

/** Conditionnement compté d'un produit : article de commande (fournisseur principal, sinon dernière offre), sinon la fiche seule */
function conditionnementFiche(f: Fiche | undefined, articles: ArticleFournisseur[], offres: OffreActive[]): Conditionnement | null {
  if (!f) return null;
  const c = choisirConditionnement(f.default_supplier_id, articles, offres);
  if (c) return c;
  const a = articleDeFiche(f);
  return a ? conditionnementDArticle(a, f.default_supplier_id ?? f.supplier_id) : null;
}
type Saisie = { colis: string; unites: string };

const ACCENT = "#D4775A";
const OSWALD = "var(--font-oswald), Oswald, sans-serif";
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
const txt = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));
const eur = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const normNom = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const fmtDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
const pluriel = (u: string | null, n: number) => {
  const m = u ?? "";
  if (n <= 1 || !m || ["kg", "g", "l", "ml", "cl", "pc", "colis"].includes(m)) return m;
  return m.endsWith("s") || m.endsWith("x") ? m : m === "plateau" ? "plateaux" : m === "seau" ? "seaux" : `${m}s`;
};
const uniteFiche = (u: string | null | undefined) => (u === "kg" ? "kg" : u === "l" ? "litre" : u === "g" ? "kg" : u === "ml" ? "litre" : "pièce");

export default function InventaireFeuillePage() {
  return (
    <RequireRole allowedRoles={["group_admin", "manager"]}>
      <Feuille />
    </RequireRole>
  );
}

function Feuille() {
  const bureau = useBureau();
  const large = useLarge();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isGroupAdmin } = useProfile();
  const [inv, setInv] = useState<Inventaire | null>(null);
  const [etabNom, setEtabNom] = useState("");
  const [etabSlug, setEtabSlug] = useState("");
  const [zones, setZones] = useState<string[]>([]);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [nonComptes, setNonComptes] = useState<{ id: string; nom: string }[] | null>(null);
  const [fiches, setFiches] = useState<Record<string, Fiche>>({});
  /** Rayons de l'écran de commande (rayons_commande), dans l'ordre : les catégories de l'inventaire */
  const [rayons, setRayons] = useState<{ code: string; libelle: string; ordre: number }[]>([]);
  const [articles, setArticles] = useState<Record<string, ArticleFournisseur[]>>({});
  const [offres, setOffres] = useState<Record<string, (OffreValo & OffreActive)[]>>({});
  /** Préparations maison : recette cuisine dont le produit est la sortie, pour valoriser au coût de recette */
  const [recettes, setRecettes] = useState<Record<string, RecetteValo & { name: string }>>({});
  /** Fournisseurs (nom, couleur) pour la pastille sous le nom du produit, comme sur la fiche produit */
  const [fournisseurs, setFournisseurs] = useState<Record<string, { name: string; color: string | null }>>({});
  const [saisies, setSaisies] = useState<Record<string, Saisie>>({});
  const [zone, setZone] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [etatLigne, setEtatLigne] = useState<Record<string, "attente" | "ok" | "erreur">>({});
  const [voirRetirees, setVoirRetirees] = useState(false);
  /** Recherche dans la zone affichée (nom de la feuille ou nom de la fiche) : familles et sous-catégories ouvertes pendant la recherche */
  const [filtre, setFiltre] = useState("");
  const [modaleAjout, setModaleAjout] = useState(false);
  /** Rayons et sous-catégories ouverts ou fermés à la main, clés « zone|rayon » et « zone|rayon|sous-catégorie » (tout est replié par défaut) */
  const [bascules, setBascules] = useState<Record<string, boolean>>({});
  const cleFamille = (z: string, fam: string | null) => `${z}|${fam ?? ""}`;
  const minuteries = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  /** Action serveur en cours (ajout, création…) : les événements temps réel qu'elle provoque ne rechargent pas en plus */
  const actionEnCours = useRef(false);
  const rechargement = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dernierChargement = useRef(0);
  const fichierRef = useRef<HTMLInputElement | null>(null);

  const charger = useCallback(async () => {
    const { data: i, error } = await supabase.from("inventaires").select("id, etablissement_id, date, type, statut, saisie").eq("id", id).maybeSingle();
    if (error || !i) { setErreur("Inventaire introuvable ou accès refusé"); return; }
    const invRow = i as Inventaire;
    const [{ data: z }, { data: e }, { data: ls }, { data: ry }] = await Promise.all([
      supabase.from("storage_zones").select("name, display_order").eq("etablissement_id", invRow.etablissement_id).order("display_order"),
      supabase.from("etablissements").select("nom, slug").eq("id", invRow.etablissement_id).maybeSingle(),
      supabase.from("inventaire_lignes").select("id, ingredient_id, zone, ordre, famille, colis, unites, quantite, unite, cond_contenu, cond_libelle, retiree, nom_feuille, rattachement")
        .eq("inventaire_id", id).order("ordre", { ascending: true, nullsFirst: false }).limit(5000),
      supabase.from("rayons_commande").select("code, libelle, ordre").order("ordre"),
    ]);
    const ids = [...new Set((ls ?? []).map((l) => l.ingredient_id as string))];
    const [{ data: ings }, { data: arts }, { data: offs }, { data: recs }] = await Promise.all([
      inChunks<Fiche>(ids, (b) => supabase.from("ingredients").select("id, name, status, is_active, category, sub_category, rayon_commande, default_unit, default_supplier_id, supplier_id, purchase_price, purchase_unit, purchase_unit_label, piece_weight_g, piece_volume_ml, density_g_per_ml, order_unit_label, order_quantity, order_element, order_element_permis").in("id", b)),
      inChunks<ArticleFournisseur & { ingredient_id: string }>(ids, (b) => supabase.from("commande_articles").select("ingredient_id, supplier_id, unite_commande, contenu_nb, element, element_qte, element_unite, commande_element_permise, precommande").in("ingredient_id", b)),
      inChunks<OffreValo & OffreActive & { ingredient_id: string }>(ids, (b) => supabase.from("supplier_offers").select("ingredient_id, supplier_id, is_active, valid_from, valid_to, created_at, unit, unit_price, pack_price, pack_count, pack_each_qty, pack_each_unit, pack_total_qty, pack_unit, price_kind, piece_weight_g, density_kg_per_l").in("ingredient_id", b)),
      inChunks<RecetteValo & { output_ingredient_id: string; name: string; updated_at: string | null }>(ids, (b) => supabase.from("kitchen_recipes").select("output_ingredient_id, name, cost_per_kg, total_cost, yield_grams, updated_at").in("output_ingredient_id", b).eq("is_active", true)),
    ]);
    // Plusieurs recettes pour une même sortie : la plus récemment modifiée
    const recDe: Record<string, RecetteValo & { name: string }> = {};
    const recMaj: Record<string, string> = {};
    for (const r of recs) {
      const maj = String(r.updated_at ?? "");
      if (recDe[r.output_ingredient_id] && recMaj[r.output_ingredient_id] >= maj) continue;
      recDe[r.output_ingredient_id] = { name: r.name, cost_per_kg: r.cost_per_kg, total_cost: r.total_cost, yield_grams: r.yield_grams };
      recMaj[r.output_ingredient_id] = maj;
    }
    const ficheDe: Record<string, Fiche> = {};
    for (const f of ings) ficheDe[f.id] = f;
    const artDe: Record<string, ArticleFournisseur[]> = {};
    for (const a of arts) (artDe[a.ingredient_id] ??= []).push(a);
    const offDe: Record<string, (OffreValo & OffreActive)[]> = {};
    for (const o of offs) (offDe[o.ingredient_id] ??= []).push(o);
    const idsFournisseurs = [...new Set([
      ...ings.flatMap((f) => [f.default_supplier_id, f.supplier_id]),
      ...arts.map((a) => a.supplier_id), ...offs.map((o) => o.supplier_id),
    ].filter((x): x is string => !!x))];
    const fournDe: Record<string, { name: string; color: string | null }> = {};
    const { data: sups } = await inChunks<{ id: string; name: string; color: string | null }>(idsFournisseurs, (b) => supabase.from("suppliers").select("id, name, color").in("id", b));
    for (const s of sups) fournDe[s.id] = { name: s.name, color: s.color };
    const liste = ((ls ?? []) as Omit<Ligne, "nom" | "aVerifier" | "inactive">[]).map((l) => {
      const f = ficheDe[l.ingredient_id];
      return { ...l, nom: f?.name ?? l.nom_feuille ?? "?", aVerifier: f?.status === "to_check", inactive: !f || f.is_active === false };
    });
    // Fiche avec un conditionnement à plusieurs pièces mais ligne comptée à l'unité seule : la ligne passe en deux champs
    // (colis + unités) d'office, le comptage déjà saisi reste en unités. Ainsi « quand la fiche est renseignée, ça marche ».
    if (invRow.statut !== "cloture") {
      for (const l of liste) {
        if (l.retiree || (l.cond_contenu != null && l.cond_contenu > 1)) continue;
        const c = conditionnementFiche(ficheDe[l.ingredient_id], artDe[l.ingredient_id] ?? [], offDe[l.ingredient_id] ?? []);
        if (!c || c.contenu <= 1) continue;
        const unites = l.unites ?? l.colis ?? (l.quantite > 0 ? l.quantite : null);
        const maj = { cond_contenu: c.contenu, cond_libelle: c.libelle, unite: c.unite, cond_supplier_id: c.supplier_id, colis: null, unites };
        const { error } = await supabase.from("inventaire_lignes").update({ ...maj, updated_at: new Date().toISOString() }).eq("id", l.id);
        if (!error) Object.assign(l, maj);
      }
    }
    setInv(invRow);
    setEtabNom((e?.nom as string | undefined) ?? "");
    setEtabSlug((e?.slug as string | undefined) ?? "");
    const nomsZones = (z ?? []).map((x) => x.name as string);
    setZones(nomsZones);
    setLignes(liste);
    setFiches(ficheDe); setArticles(artDe); setOffres(offDe); setFournisseurs(fournDe); setRecettes(recDe);
    dernierChargement.current = Date.now();
    setRayons([...((ry ?? []) as { code: string; libelle: string; ordre: number }[]), RAYON_PREPARATIONS, RAYON_AUTRES]);
    // Colis unique (contenu 1) : un seul champ, « colis » ; sans conditionnement : un seul champ, « unités ».
    // Une quantité déjà enregistrée ailleurs (ancien inventaire) est reportée dans le champ affiché.
    setSaisies(Object.fromEntries(liste.map((l) => {
      const ancienne = l.colis == null && l.unites == null && l.quantite > 0 ? l.quantite : null;
      if (l.cond_contenu != null && l.cond_contenu <= 1) return [l.id, { colis: txt(l.colis ?? l.unites ?? ancienne), unites: "" }];
      if (l.cond_contenu == null) return [l.id, { colis: "", unites: txt(l.unites ?? l.colis ?? ancienne) }];
      return [l.id, { colis: txt(l.colis), unites: txt(l.unites ?? ancienne) }];
    })));
    setZone((cur) => cur ?? nomsZones.find((n) => liste.some((l) => l.zone === n)) ?? nomsZones[0] ?? null);
  }, [id]);

  useEffect(() => { void charger(); }, [charger]);

  // Multi-comptes : plusieurs personnes comptent en même temps, chaque ligne enregistrée apparaît chez les autres
  // (Realtime sur inventaire_lignes). Une ligne en cours de frappe ici n'est pas écrasée : elle part 500 ms après la dernière touche.
  const [direct, setDirect] = useState(false);
  useEffect(() => {
    if (!inv?.id) return;
    const canal = supabase.channel(`inventaire-feuille-${inv.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "inventaire_lignes", filter: `inventaire_id=eq.${inv.id}` }, (payload) => {
        if (payload.eventType === "DELETE") {
          const old = payload.old as { id?: string };
          if (old?.id) setLignes((prev) => prev.filter((l) => l.id !== old.id));
          return;
        }
        const r = payload.new as Partial<Ligne> & { id: string };
        if (payload.eventType === "INSERT" || !lignesRef.current.some((l) => l.id === r.id)) {
          // Lignes ajoutées par quelqu'un d'autre : un seul rechargement pour tout un lot (pas un par ligne) ;
          // mes propres ajouts rechargent déjà à la fin de l'action.
          if (actionEnCours.current) return;
          if (rechargement.current) clearTimeout(rechargement.current);
          rechargement.current = setTimeout(() => { rechargement.current = null; void charger(); }, 800);
          return;
        }
        if (minuteries.current.has(r.id)) return; // je suis en train de taper cette ligne
        setLignes((prev) => prev.map((l) => (l.id === r.id ? { ...l, ...r, nom: l.nom, aVerifier: l.aVerifier, inactive: l.inactive } : l)));
        const contenu = r.cond_contenu ?? null;
        const colis = r.colis ?? null, unites = r.unites ?? null;
        setSaisies((prev) => ({
          ...prev,
          [r.id]: contenu != null && contenu <= 1 ? { colis: txt(colis ?? unites), unites: "" }
            : contenu == null ? { colis: "", unites: txt(unites ?? colis) }
            : { colis: txt(colis), unites: txt(unites) },
        }));
      })
      // Fiche produit modifiée (catégorie, sous-catégorie, rayon, conditionnement, nom…) : la feuille se réorganise
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "ingredients", filter: `etablissement_id=eq.${inv.etablissement_id}` }, (payload) => {
        const r = payload.new as { id?: string };
        if (!r?.id || !lignesRef.current.some((l) => l.ingredient_id === r.id)) return;
        if (rechargement.current) clearTimeout(rechargement.current);
        rechargement.current = setTimeout(() => { rechargement.current = null; void charger(); }, 800);
      })
      .subscribe((etat) => setDirect(etat === "SUBSCRIBED"));
    return () => { void supabase.removeChannel(canal); };
  }, [inv?.id, inv?.etablissement_id, charger]);

  // Retour sur l'onglet (après une fiche modifiée ailleurs, par exemple) : rechargement si le dernier date de plus de 15 s
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible" || actionEnCours.current) return;
      if (Date.now() - dernierChargement.current < 15000) return;
      void charger();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [charger]);

  const lectureSeule = !inv || inv.statut === "cloture";

  const parZone = useMemo(() => {
    const m = new Map<string, Ligne[]>();
    for (const l of lignes) { const a = m.get(l.zone) ?? []; a.push(l); m.set(l.zone, a); }
    return m;
  }, [lignes]);
  const compte = (l: Ligne) => { const s = saisies[l.id]; return !!s && (s.colis.trim() !== "" || s.unites.trim() !== ""); };

  /** Rayon (catégorie de commande) d'une ligne : celui de la fiche, sinon d'après sa catégorie */
  const rayonDe = useCallback((l: Ligne) => { const f = fiches[l.ingredient_id]; return rayonDuProduit(f?.rayon_commande, f?.category); }, [fiches]);

  /** Conditionnement de commande de la fiche (pour compter par colis) et coût d'une unité comptée */
  const condProduit = useCallback((l: Ligne): Conditionnement | null =>
    conditionnementFiche(fiches[l.ingredient_id], articles[l.ingredient_id] ?? [], offres[l.ingredient_id] ?? []), [fiches, articles, offres]);
  /** Fournisseur affiché sous le nom : celui du conditionnement retenu, sinon de la dernière offre active, sinon celui de la fiche */
  const fournisseurDe = useCallback((l: Ligne, c: Conditionnement | null) => {
    const f = fiches[l.ingredient_id];
    if (!f) return null;
    const date = (o: OffreActive) => o.valid_from ?? o.created_at ?? "";
    const derniere = [...(offres[l.ingredient_id] ?? [])].sort((a, b) => date(b).localeCompare(date(a)))[0];
    const sid = c?.supplier_id ?? derniere?.supplier_id ?? f.default_supplier_id ?? f.supplier_id;
    return sid ? fournisseurs[sid] ?? null : null;
  }, [fiches, offres, fournisseurs]);
  const coutDe = useCallback((l: Ligne) => {
    const f = fiches[l.ingredient_id];
    if (!f) return { cout: null, source: null, raison: "fiche supprimée" };
    return coutUniteComptee(l.unite, f, offres[l.ingredient_id] ?? [], recettes[l.ingredient_id]);
  }, [fiches, offres, recettes]);

  /** Enregistre une ligne 500 ms après la dernière frappe */
  function saisir(l: Ligne, champ: keyof Saisie, valeur: string) {
    if (lectureSeule) return;
    const v = valeur.replace(/[^0-9.,]/g, "");
    setSaisies((s) => ({ ...s, [l.id]: { ...(s[l.id] ?? { colis: "", unites: "" }), [champ]: v } }));
    setEtatLigne((e) => ({ ...e, [l.id]: "attente" }));
    const t = minuteries.current.get(l.id);
    if (t) clearTimeout(t);
    minuteries.current.set(l.id, setTimeout(() => void enregistrer(l.id), 500));
  }
  const saisiesRef = useRef(saisies);
  useEffect(() => { saisiesRef.current = saisies; }, [saisies]);
  const lignesRef = useRef(lignes);
  useEffect(() => { lignesRef.current = lignes; }, [lignes]);

  async function enregistrer(ligneId: string) {
    minuteries.current.delete(ligneId);
    const l = lignesRef.current.find((x) => x.id === ligneId);
    const s = saisiesRef.current[ligneId];
    if (!l || !s) return;
    const colis = num(s.colis), unites = num(s.unites);
    if ((colis != null && !(colis >= 0)) || (unites != null && !(unites >= 0))) { setEtatLigne((e) => ({ ...e, [ligneId]: "erreur" })); return; }
    const total = totalLigne(colis, unites, l.cond_contenu);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("inventaire_lignes").update({
      colis, unites, quantite: total ?? 0, saisi_par: u.user?.id ?? null, updated_at: new Date().toISOString(),
    }).eq("id", ligneId);
    setEtatLigne((e) => ({ ...e, [ligneId]: error ? "erreur" : "ok" }));
    if (error) setMessage(`Pas enregistré : ${error.message}`);
  }

  // En quittant la page : ce qui attend part tout de suite
  useEffect(() => () => { for (const [lid, t] of minuteries.current) { clearTimeout(t); void enregistrer(lid); } }, []);

  async function action(nom: string, corps: Record<string, unknown>, succes: (j: Record<string, unknown>) => string) {
    setEnCours(nom); setMessage(null); actionEnCours.current = true;
    if (rechargement.current) { clearTimeout(rechargement.current); rechargement.current = null; }
    try {
      const res = await fetchApi(`/api/inventaires/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage(json.error ?? `Erreur ${res.status}`); return json; }
      setMessage(succes(json));
      await charger();
      return json;
    } catch (e) {
      setMessage(`Pas enregistré : ${e instanceof Error ? e.message : "réseau indisponible"}`);
      return {};
    } finally { setEnCours(null); actionEnCours.current = false; }
  }

  /** Suppression de l'inventaire entier (lignes comprises) : confirmation avec le nombre de lignes comptées */
  async function supprimerInventaire() {
    if (!inv) return;
    const comptees = lignes.filter((l) => !l.retiree && compte(l)).length;
    const texte = `Supprimer cet inventaire du ${fmtDate(inv.date)} ?\n${lignes.length} ligne(s)${comptees ? `, dont ${comptees} comptée(s)` : ""} seront effacées définitivement.`;
    if (!confirm(texte)) return;
    if (comptees > 0 && !confirm("Il y a des comptages saisis. Confirmer la suppression définitive ?")) return;
    setEnCours("suppression"); setMessage(null);
    try {
      const res = await fetchApi(`/api/inventaires/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage(json.error ?? `Erreur ${res.status}`); return; }
      router.push("/inventaire");
    } catch (e) {
      setMessage(`Pas supprimé : ${e instanceof Error ? e.message : "réseau indisponible"}`);
    } finally { setEnCours(null); }
  }

  async function importer(f: File) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
    const tableau = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
    const json = await action("import", { action: "importer", tableau }, (j) =>
      `${j.lignes} lignes importées${Number(j.sans_conditionnement) ? `, dont ${j.sans_conditionnement} sans conditionnement (unités seulement)` : ""}.`);
    const errs = (json?.erreurs as string[] | undefined) ?? [];
    if (errs.length) setMessage((m) => `${m ?? ""} ${errs.length} remarque(s) : ${errs.slice(0, 5).join(" ; ")}${errs.length > 5 ? " ; …" : ""}`);
  }

  async function cloturer() {
    const restant = lignes.filter((l) => !l.retiree && !compte(l)).length;
    for (const [lid, t] of minuteries.current) { clearTimeout(t); await enregistrer(lid); }
    if (!confirm(`Clôturer l'inventaire ?${restant ? `\n${restant} ligne(s) non comptée(s) : elles resteront vides.` : ""}\nIl ne sera plus modifiable (sauf réouverture par un admin).`)) return;
    // Produits actifs non comptés (ou retirés de la feuille) : proposés à la désactivation après la clôture
    const vus = new Set<string>();
    const oublies = lignes.filter((l) => !l.inactive && (l.retiree || !compte(l)) && l.ingredient_id && !vus.has(l.ingredient_id) && vus.add(l.ingredient_id)).map((l) => ({ id: l.ingredient_id as string, nom: l.nom }));
    const resultat = await action("cloture", { action: "cloturer" }, (j) => j.avertissement ? String(j.avertissement)
      : `Inventaire clôturé : ${Number(j.total ?? 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € HT${Number(j.sans_prix) ? `, ${j.sans_prix} ligne(s) sans prix` : ""} (${j.mouvements} produits dans les mouvements de stock).`);
    if (resultat && !("error" in resultat) && oublies.length > 0) setNonComptes(oublies);
  }

  /** Compter par colis (conditionnement de la fiche) ou à l'unité ; les quantités déjà saisies sont converties */
  async function basculerComptage(l: Ligne) {
    if (lectureSeule) return;
    const t = minuteries.current.get(l.id);
    if (t) { clearTimeout(t); await enregistrer(l.id); }
    const s = saisiesRef.current[l.id] ?? { colis: "", unites: "" };
    const totalActuel = totalLigne(num(s.colis), num(s.unites), l.cond_contenu);
    const c = condProduit(l);
    const parColis = !(l.cond_contenu != null && l.cond_contenu > 1);
    let maj: Partial<Ligne>;
    if (parColis) {
      if (!c || c.contenu <= 1) return;
      maj = { cond_contenu: c.contenu, cond_libelle: c.libelle, unite: c.unite, colis: null, unites: totalActuel };
    } else {
      const f = fiches[l.ingredient_id];
      maj = { cond_contenu: null, cond_libelle: null, unite: uniteFiche(f?.default_unit), colis: null, unites: totalActuel };
    }
    const { error } = await supabase.from("inventaire_lignes").update({ ...maj, quantite: totalActuel ?? 0, updated_at: new Date().toISOString() }).eq("id", l.id);
    if (error) { setMessage(`Pas enregistré : ${error.message}`); return; }
    setLignes((prev) => prev.map((x) => (x.id === l.id ? { ...x, ...maj } : x)));
    setSaisies((prev) => ({ ...prev, [l.id]: maj.cond_contenu != null && maj.cond_contenu > 1 ? { colis: "", unites: txt(totalActuel) } : { colis: "", unites: txt(totalActuel) } }));
  }

  async function retirer(l: Ligne, remettre = false) {
    if (lectureSeule) return;
    const { error } = await supabase.from("inventaire_lignes").update({ retiree: !remettre, updated_at: new Date().toISOString() }).eq("id", l.id);
    if (error) { setMessage(`Pas enregistré : ${error.message}`); return; }
    setLignes((prev) => prev.map((x) => (x.id === l.id ? { ...x, retiree: !remettre } : x)));
  }

  /** Retire (ou remet) un lot de lignes (un rayon entier dans la zone), sans toucher aux fiches */
  async function retirerLot(cibles: Ligne[], libelle: string, remettre = false, sansConfirmation = false) {
    if (lectureSeule || !cibles.length) return;
    if (!remettre && !sansConfirmation && !confirm(`Retirer les ${cibles.length} produits de « ${libelle} » de cette zone ?\nIls restent dans « retirés » et peuvent être remis.`)) return;
    const ids = cibles.map((l) => l.id);
    const { error } = await supabase.from("inventaire_lignes").update({ retiree: !remettre, updated_at: new Date().toISOString() }).in("id", ids);
    if (error) { setMessage(`Pas enregistré : ${error.message}`); return; }
    setLignes((prev) => prev.map((x) => (ids.includes(x.id) ? { ...x, retiree: !remettre } : x)));
    setMessage(`${cibles.length} produit(s) ${remettre ? "remis" : "retiré(s)"} (${libelle}).`);
  }

  /** Retire tous les produits de la zone affichée (ils restent dans « retirés ») et passe à la zone suivante */
  async function retirerZone() {
    if (!zone || lectureSeule) return;
    const actives = (parZone.get(zone) ?? []).filter((l) => !l.retiree);
    const comptees = actives.filter(compte).length;
    if (!confirm(`Retirer la zone « ${libelleZone(zone)} » de l'inventaire ?\n${actives.length} produit(s)${comptees ? `, dont ${comptees} compté(s),` : ""} passeront dans « retirés » et pourront être remis.`)) return;
    await retirerLot(actives, libelleZone(zone), false, true);
    const suivante = zones.find((z) => z !== zone && (parZone.get(z) ?? []).some((l) => !l.retiree && !actives.includes(l)));
    if (suivante) setZone(suivante);
  }

  async function ajouterZone() {
    if (!inv) return;
    const nom = prompt("Nom de la nouvelle zone (ex. RÉSERVE, FRIGO BAR) :")?.trim().toUpperCase();
    if (!nom) return;
    if (zones.some((z) => normNom(z) === normNom(nom))) { setMessage("Cette zone existe déjà."); return; }
    const { error } = await supabase.from("storage_zones").insert({ name: nom, etablissement_id: inv.etablissement_id, display_order: zones.length + 1, supplier_ids: [], category_slugs: [] });
    if (error) { setMessage(error.message); return; }
    setZones((z) => [...z, nom]);
    setZone(nom);
    setMessage(`Zone « ${libelleZone(nom)} » ajoutée.`);
  }

  /** Entrée dans un compteur : champ suivant (saisie rapide de la feuille au clavier) */
  const entreeSuivante = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const champs = [...document.querySelectorAll<HTMLInputElement>("input[inputmode=decimal]:not([disabled])")];
    champs[champs.indexOf(e.currentTarget) + 1]?.focus();
  };

  /** Téléphone (10/10/2026) : même tableau que le bureau en trois colonnes — nom + conditionnement · fournisseur + total, compteurs à droite, actions */
  const ligneMobile = (l: Ligne, couleur: string) => {
    const s = saisies[l.id] ?? { colis: "", unites: "" };
    const contenu = l.cond_contenu;
    const deuxChamps = contenu != null && contenu > 1;
    const total = totalLigne(num(s.colis), num(s.unites), contenu);
    const etat = etatLigne[l.id];
    const c = condProduit(l);
    const peutColis = !!c && c.contenu > 1;
    const valo = coutDe(l);
    const f = fiches[l.ingredient_id];
    const fournisseur = fournisseurDe(l, c);
    const detailPiece = f?.piece_weight_g ? `${f.piece_weight_g >= 1000 ? `${txt(f.piece_weight_g / 1000)} kg` : `${txt(f.piece_weight_g)} g`} la pièce` : f?.piece_volume_ml ? `${f.piece_volume_ml >= 1000 ? `${txt(f.piece_volume_ml / 1000)} L` : `${txt(f.piece_volume_ml)} mL`} la pièce` : null;
    const couleurCat = (f?.category && CAT_COLORS[f.category as Category]) || couleur;
    const nomColis = deuxChamps && l.cond_libelle ? pluriel(l.cond_libelle.split(" ")[0], 2) : null;
    const auPoids = l.unite === "kg" || l.unite === "litre";
    const compteur = (champ: keyof Saisie, etiquette: string, pas: number) => {
      const v = num(s[champ]) ?? 0;
      const fixer = (x: number) => saisir(l, champ, txt(Math.max(0, Math.round(x * 100) / 100)));
      return (
        <Compteur valeur={s[champ]} etiquette={etiquette} desactive={lectureSeule} moinsActif={v > 0}
          onMoins={() => fixer(v - pas)} onPlus={() => fixer(v + pas)} onSaisie={(x) => saisir(l, champ, x)} onEntree={entreeSuivante} />
      );
    };
    const remarque = l.rattachement === "approché" || l.rattachement === "rattaché par ressemblance" || l.aVerifier || l.inactive;
    const TD: React.CSSProperties = { padding: "8px 6px 8px 10px", borderBottom: "1px solid #f0ebe2", verticalAlign: "middle", fontSize: 13, background: compte(l) ? "rgba(45,106,79,0.07)" : undefined };
    return (
      <tr key={l.id}>
        <td style={{ ...TD, padding: 0, width: 4, background: couleurCat }} />
        <CelluleProduit style={{ ...TD, paddingRight: 2 }} titre={<span style={{ color: l.inactive ? "#999" : undefined }}>{l.nom_feuille ?? l.nom}</span>} droite={
          <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
            {contenu != null && compteur("colis", deuxChamps ? nomColis ?? "colis" : pluriel(l.unite ?? "colis", 2), !deuxChamps && auPoids ? 0.5 : 1)}
            {(deuxChamps || contenu == null) && compteur("unites", pluriel(l.unite ?? "unités", 2), contenu == null && auPoids ? 0.5 : 1)}
          </div>
        }>
          {remarque && (
            <span style={{ display: "inline-block", marginTop: 3, fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 8, background: l.inactive ? "#fde7e7" : l.aVerifier ? "#fde7ef" : "#fdf3d4", color: l.inactive ? "#a12b2b" : l.aVerifier ? "#b0306a" : "#8a6a12" }}>
              {l.inactive ? (f ? "fiche désactivée" : "fiche supprimée") : l.aVerifier ? "fiche à vérifier" : "rattaché par ressemblance"}
            </span>
          )}
          <div style={{ fontSize: 11.5, color: "#6f6656", marginTop: 2 }}>
            <CondLibelle>{c?.libelle ?? l.cond_libelle ?? l.unite ?? "unité"}</CondLibelle>{!c && detailPiece ? ` · ${detailPiece}` : ""}
            {fournisseur ? ` · ${fournisseur.name}` : recettes[l.ingredient_id] ? " · recette maison" : ""}
            {valo.cout == null && <span style={{ color: "#b45309" }}> · sans prix{valo.raison ? ` (${valo.raison})` : ""}</span>}
          </div>
          <div style={{ fontSize: 11.5, marginTop: 2, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {total != null
              ? <span><strong style={{ color: "#1a1a1a" }}>{txt(total)} {pluriel(l.unite, total)}</strong>{valo.cout != null && <span style={{ color: "#6f6656" }}> · {eur(total * valo.cout)}</span>}</span>
              : <span style={{ color: "#c4bcae" }}>non compté</span>}
            {!lectureSeule && peutColis && !deuxChamps && (
              <button type="button" onClick={() => void basculerComptage(l)} style={{ ...lien, fontSize: 11.5 }}>compter par {c!.libelle.split(" ")[0]}</button>
            )}
          </div>
        </CelluleProduit>
        <td style={{ ...TD, padding: "8px 6px 8px 0", width: 30, textAlign: "center" }}>
          <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span title={etat === "erreur" ? "Pas enregistré" : etat === "attente" ? "Enregistrement…" : etat === "ok" ? "Enregistré" : ""} style={{ width: 8, height: 8, borderRadius: 4, background: etat === "erreur" ? "#DC2626" : etat === "attente" ? "#e0b44c" : etat === "ok" ? "#2D6A4F" : "transparent" }} />
            {f && <BoutonCrayon href={`/ingredients?edit=${l.ingredient_id}&back=${encodeURIComponent(`/inventaire/${id}`)}`} title="Modifier la fiche produit (prix, conditionnement, zone)" />}
            {!lectureSeule && <BoutonCroix onClick={() => void retirer(l)} title="Retirer de la liste (la fiche n'est pas touchée)" />}
          </div>
        </td>
      </tr>
    );
  };

  /** Bureau : une ligne de tableau par produit, tout sur une ligne (gabarit Base produits) ; compteurs dans la colonne Comptage */
  const ligne = (l: Ligne, couleur: string) => {
    const s = saisies[l.id] ?? { colis: "", unites: "" };
    const contenu = l.cond_contenu;
    const deuxChamps = contenu != null && contenu > 1;
    const total = totalLigne(num(s.colis), num(s.unites), contenu);
    const etat = etatLigne[l.id];
    const c = condProduit(l);
    const peutColis = !!c && c.contenu > 1;
    const valo = coutDe(l);
    const f = fiches[l.ingredient_id];
    const fournisseur = fournisseurDe(l, c);
    const detailPiece = f?.piece_weight_g ? `${f.piece_weight_g >= 1000 ? `${txt(f.piece_weight_g / 1000)} kg` : `${txt(f.piece_weight_g)} g`} la pièce` : f?.piece_volume_ml ? `${f.piece_volume_ml >= 1000 ? `${txt(f.piece_volume_ml / 1000)} L` : `${txt(f.piece_volume_ml)} mL`} la pièce` : null;
    const couleurCat = (f?.category && CAT_COLORS[f.category as Category]) || couleur;
    const nomColis = deuxChamps && l.cond_libelle ? pluriel(l.cond_libelle.split(" ")[0], 2) : null;
    const auPoids = l.unite === "kg" || l.unite === "litre";
    const compteur = (champ: keyof Saisie, etiquette: string, pas: number) => {
      const v = num(s[champ]) ?? 0;
      const fixer = (x: number) => saisir(l, champ, txt(Math.max(0, Math.round(x * 100) / 100)));
      return (
        <Compteur valeur={s[champ]} etiquette={etiquette} desactive={lectureSeule} moinsActif={v > 0}
          onMoins={() => fixer(v - pas)} onPlus={() => fixer(v + pas)} onSaisie={(x) => saisir(l, champ, x)} onEntree={entreeSuivante} />
      );
    };
    const remarque = l.rattachement === "approché" || l.rattachement === "rattaché par ressemblance" || l.aVerifier || l.inactive;
    const TD: React.CSSProperties = { padding: "8px 14px", borderBottom: "1px solid #f0ebe2", verticalAlign: "middle", fontSize: 13, whiteSpace: "nowrap", background: compte(l) ? "rgba(45,106,79,0.07)" : undefined };
    return (
      <tr key={l.id}>
        <td style={{ ...TD, padding: 0, width: 4, background: couleurCat }} />
        <td style={{ ...TD, whiteSpace: "normal", minWidth: 220 }}>
          <div style={{ fontWeight: 600, color: l.inactive ? "#999" : "#1a1a1a", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {l.nom_feuille ?? l.nom}
            {remarque && (
              <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 8, background: l.inactive ? "#fde7e7" : l.aVerifier ? "#fde7ef" : "#fdf3d4", color: l.inactive ? "#a12b2b" : l.aVerifier ? "#b0306a" : "#8a6a12" }}>
                {l.inactive ? (f ? "fiche désactivée" : "fiche supprimée") : l.aVerifier ? "fiche à vérifier" : "rattaché par ressemblance"}
              </span>
            )}
          </div>
          {valo.cout == null && <div style={{ fontSize: 11.5, color: "#b45309" }}>sans prix{valo.raison ? ` (${valo.raison})` : ""}</div>}
        </td>
        <td style={{ ...TD, color: "#6f6656", fontSize: 12.5 }}>
          <CondLibelle>{c?.libelle ?? l.cond_libelle ?? l.unite ?? "unité"}</CondLibelle>{!c && detailPiece ? ` · ${detailPiece}` : ""}
          {!lectureSeule && peutColis && !deuxChamps && (
            <div><button type="button" onClick={() => void basculerComptage(l)} style={lien}>compter par {c!.libelle.split(" ")[0]}</button></div>
          )}
        </td>
        <td style={TD}>
          {fournisseur
            ? <span className="pastille" style={{ "--pastille-c": getSupplierColor(fournisseur.name, fournisseur.color) } as React.CSSProperties}>{fournisseur.name}</span>
            : recettes[l.ingredient_id]
              ? <span className="pastille" title={`Valorisée au coût de la recette « ${recettes[l.ingredient_id].name} »`} style={{ "--pastille-c": CAT_COLORS.preparation } as React.CSSProperties}>recette maison</span>
              : <span style={{ color: "#a39d92" }}>—</span>}
        </td>
        <td style={TD}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
            {contenu != null && compteur("colis", deuxChamps ? nomColis ?? "colis" : pluriel(l.unite ?? "colis", 2), !deuxChamps && auPoids ? 0.5 : 1)}
            {(deuxChamps || contenu == null) && compteur("unites", pluriel(l.unite ?? "unités", 2), contenu == null && auPoids ? 0.5 : 1)}
          </div>
        </td>
        <td style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
          {total != null
            ? <><strong style={{ color: "#1a1a1a" }}>{txt(total)} {pluriel(l.unite, total)}</strong>{valo.cout != null && <div style={{ fontSize: 11.5, color: "#6f6656" }}>{eur(total * valo.cout)}</div>}</>
            : <span style={{ color: "#c4bcae" }}>non compté</span>}
        </td>
        <td style={{ ...TD, textAlign: "right", width: 90 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span title={etat === "erreur" ? "Pas enregistré" : etat === "attente" ? "Enregistrement…" : etat === "ok" ? "Enregistré" : ""} style={{ width: 8, height: 8, borderRadius: 4, background: etat === "erreur" ? "#DC2626" : etat === "attente" ? "#e0b44c" : etat === "ok" ? "#2D6A4F" : "transparent" }} />
            {f && <BoutonCrayon href={`/ingredients?edit=${l.ingredient_id}&back=${encodeURIComponent(`/inventaire/${id}`)}`} title="Modifier la fiche produit (prix, conditionnement, zone)" />}
            {!lectureSeule && <BoutonCroix onClick={() => void retirer(l)} title="Retirer de la liste (la fiche n'est pas touchée)" />}
          </span>
        </td>
      </tr>
    );
  };

  const tableau = (ls: Ligne[], couleur: string) => {
    const TH: React.CSSProperties = { textAlign: "left", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "#a39d92", padding: "8px 14px", borderBottom: "1px solid #ddd6c8", fontWeight: 600, whiteSpace: "nowrap" };
    if (!large) return (
      <TableauMobile sansCadre colonnes={[{ libelle: "Produit" }, { libelle: "Comptage", align: "right", largeur: 150 }, { largeur: 34 }]}>
        {ls.map((l) => ligneMobile(l, couleur))}
      </TableauMobile>
    );
    return (
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900 }}>
          <thead><tr>
            <th style={{ ...TH, padding: 0, width: 4 }} /><th style={TH}>Produit</th><th style={TH}>Conditionnement</th><th style={TH}>Fournisseur</th>
            <th style={TH}>Comptage</th><th style={{ ...TH, textAlign: "right" }}>Total</th><th style={TH} />
          </tr></thead>
          <tbody>{ls.map((l) => ligne(l, couleur))}</tbody>
        </table>
      </div>
    );
  };

  if (erreur) return <div style={{ maxWidth: 900, margin: "0 auto", padding: 24, color: "#8a2b2b" }}>{erreur}</div>;
  if (!inv) return <div style={{ maxWidth: 900, margin: "0 auto", padding: 24, color: "#999" }}>Chargement…</div>;

  const lignesZoneToutes = zone ? parZone.get(zone) ?? [] : [];
  // Recherche tolérante aux fautes (« aqua filete » trouve ACQUA FILETTE), sur le nom de la feuille et celui de la fiche
  const enRecherche = normaliserRecherche(filtre).split(" ").some((m) => m.length >= 2);
  const correspond = (l: Ligne) => !enRecherche || correspondRecherche(filtre, `${l.nom_feuille ?? ""} ${l.nom}`);
  const lignesZone = lignesZoneToutes.filter((l) => !l.retiree && correspond(l));
  const retireesZone = lignesZoneToutes.filter((l) => l.retiree);
  const actives = lignes.filter((l) => !l.retiree);
  const totalComptees = actives.filter(compte).length;
  const aDesSaisies = totalComptees > 0;
  const valeurDe = (ls: Ligne[]) => ls.reduce((t, l) => {
    const s = saisies[l.id]; const q = s ? totalLigne(num(s.colis), num(s.unites), l.cond_contenu) : null;
    const c = coutDe(l).cout;
    return t + (q != null && c != null ? q * c : 0);
  }, 0);
  const valeurZone = valeurDe(lignesZone);
  /** Total en cours, toutes zones (lignes comptées et valorisées) */
  const valeurTotale = valeurDe(actives);
  const sansPrixComptees = actives.filter((l) => compte(l) && coutDe(l).cout == null).length;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "16px 12px 80px" }}>
      <button type="button" onClick={() => router.push("/inventaire")} style={{ border: "none", background: "none", color: "#8a8378", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 8 }}>
        ← Inventaires
      </button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: OSWALD, fontSize: 22, margin: 0 }}>Inventaire au {fmtDate(inv.date)}</h1>
          <div style={{ fontSize: 13, color: "#6f6656", marginTop: 2 }}>
            {etabNom} · {inv.type === "fin_exercice" ? "Fin d'exercice" : "Mensuel"} ·{" "}
            <span style={{ fontWeight: 700, color: inv.statut === "cloture" ? "#2D6A4F" : ACCENT }}>{inv.statut === "cloture" ? "Clôturé" : "En cours"}</span>
            {" "}· {totalComptees} / {actives.length} comptées
            {direct && <span title="Les comptages des autres personnes apparaissent ici en direct" style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 700, color: "#2D6A4F" }}>● en direct</span>}
          </div>
          {totalComptees > 0 && (
            <div style={{ marginTop: 6, display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#8a7e6b", textTransform: "uppercase", letterSpacing: "0.06em" }}>Total en cours</span>
              <span style={{ fontFamily: OSWALD, fontSize: 22, fontWeight: 700, color: "#1a1a1a" }}>{eur(valeurTotale)}</span>
              <span style={{ fontSize: 12, color: "#8a8378" }}>HT{sansPrixComptees > 0 ? ` · ${sansPrixComptees} ligne${sansPrixComptees > 1 ? "s" : ""} sans prix` : ""}</span>
            </div>
          )}
        </div>
        {/* Boutons bas (34 px) pour tenir sur une ligne au téléphone : Clôturer d'abord, Supprimer en lien discret */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", width: "100%" }}>
          {!lectureSeule && lignes.length > 0 && (
            <button type="button" disabled={!!enCours} onClick={() => void cloturer()} style={boutonBas(ACCENT, "#fff")}>
              {enCours === "cloture" ? "Clôture…" : "Clôturer"}
            </button>
          )}
          {lignes.length > 0 && (
            <button type="button" onClick={() => openApiFile(`/api/inventaire/pdf?id=${id}`)} style={boutonBas("#fff", "#1a1a1a")} title="Export comptable : valorisation HT par zone, famille et catégorie">
              PDF comptable
            </button>
          )}
          {!lectureSeule && !aDesSaisies && (
            <>
              <input ref={fichierRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importer(f); }} />
              <button type="button" disabled={!!enCours} onClick={() => fichierRef.current?.click()} style={boutonBas("#fff", "#1a1a1a")}>
                {enCours === "import" ? "Import…" : lignes.length ? "Remplacer par la feuille" : "Importer la feuille"}
              </button>
            </>
          )}
          {inv.statut === "cloture" && isGroupAdmin && (
            <button type="button" disabled={!!enCours} onClick={() => { if (confirm("Rouvrir cet inventaire ? Il redevient modifiable ; les mouvements de stock seront refaits à la prochaine clôture.")) void action("rouvrir", { action: "rouvrir" }, () => "Inventaire rouvert."); }}
              style={boutonBas("#fff", "#b45309")}>Rouvrir (admin)</button>
          )}
          {(!lectureSeule || isGroupAdmin) && (
            <button type="button" disabled={!!enCours} onClick={() => void supprimerInventaire()} title="Supprimer cet inventaire et toutes ses lignes"
              style={{ ...boutonBas("#fff", "#a12b2b"), border: "none", background: "none", marginLeft: "auto", padding: "0 4px" }}>
              {enCours === "suppression" ? "Suppression…" : "Supprimer"}
            </button>
          )}
        </div>
      </div>

      {message && <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 10, background: "#fff", border: "1px solid #ddd6c8", fontSize: 13 }}>{message}</div>}

      {lignes.length === 0 ? (
        <div style={{ marginTop: 20, padding: 20, background: "#fff", borderRadius: 14, border: "1px solid #ddd6c8", fontSize: 14, color: "#6f6656" }}>
          Pas encore de lignes. Importe le fichier de la feuille (colonnes : zone, famille, nom, identifiant de la fiche), ou ajoute des produits zone par zone.
        </div>
      ) : null}

      {/* Zones, dans l'ordre des feuilles */}
      <div className="inventaire-zones" style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", margin: "14px 0 10px", padding: "6px 0", position: "sticky", top: "var(--topbar-desktop-height, 0px)", zIndex: 5, background: "#f2ede4" }}>
        {/* Une zone reste visible tant qu'elle a des lignes, même toutes retirées (grisée) ; seules les zones sans aucune ligne passent dans « + zone » */}
        {zones.filter((z) => z === zone || (parZone.get(z) ?? []).length > 0).map((z) => {
          const toutes = parZone.get(z) ?? [];
          const ls = toutes.filter((l) => !l.retiree);
          const n = ls.filter(compte).length;
          const valeur = n > 0 ? valeurDe(ls) : 0;
          const actif = z === zone;
          const retiree = toutes.length > 0 && ls.length === 0;
          return (
            <button key={z} type="button" onClick={() => setZone(z)} title={retiree ? `Tous les produits de ${libelleZone(z)} ont été retirés : ouvre la zone pour les remettre` : undefined} style={{
              flexShrink: 0, padding: "6px 12px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", fontFamily: "inherit",
              border: actif ? `1.5px solid ${ACCENT}` : retiree ? "1px dashed #c4bcae" : "1px solid #ddd6c8", background: actif ? "#FFF0EB" : retiree ? "#faf7f2" : "#fff",
              color: actif ? ACCENT : retiree ? "#8a8378" : "#1a1a1a", textAlign: "center",
            }}>
              {libelleZone(z)}{" "}
              {retiree
                ? <span style={{ fontWeight: 500, color: "#a12b2b" }}>retirée</span>
                : <span style={{ fontWeight: 500, color: n === ls.length && ls.length ? "#2D6A4F" : "#999" }}>{n}/{ls.length}</span>}
              {/* Valeur comptée de la zone, sous le nom */}
              <div style={{ fontSize: 11, fontWeight: 600, color: n > 0 ? "#6f6656" : "#c4bcae", marginTop: 1 }}>{retiree ? `${toutes.length} à remettre` : n > 0 ? eur(valeur) : "—"}</div>
            </button>
          );
        })}
        {!lectureSeule && (
          /* Zones sans produit (retirées de l'inventaire ou jamais remplies) : à rouvrir d'ici, ou nouvelle zone */
          <select value="" onChange={(e) => { const v = e.target.value; if (v === "__nouvelle__") void ajouterZone(); else if (v) setZone(v); }}
            title="Ouvrir une zone sans produit, ou créer une zone" aria-label="Autres zones" style={{
              flexShrink: 0, padding: "0 12px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 700, border: "1px dashed #b0a894", background: "#fff", color: "#6f6656", alignSelf: "stretch", fontFamily: "inherit",
            }}>
            <option value="">+ zone</option>
            {zones.filter((z) => z !== zone && (parZone.get(z) ?? []).length === 0).map((z) => <option key={z} value={z}>{libelleZone(z)} (vide)</option>)}
            <option value="__nouvelle__">+ Nouvelle zone…</option>
          </select>
        )}
      </div>

      {zone && (
        <div>
          <div style={{ position: "relative", margin: "0 0 8px" }}>
            <input type="search" value={filtre} onChange={(e) => setFiltre(e.target.value)} placeholder={`Rechercher dans ${libelleZone(zone)}…`} inputMode="search"
              style={{ width: "100%", height: 42, borderRadius: 12, border: "1.5px solid #ddd6c8", padding: "0 36px 0 12px", fontSize: 15, boxSizing: "border-box", background: "#fff", fontFamily: "inherit" }} />
            {filtre && (
              <button type="button" onClick={() => setFiltre("")} aria-label="Effacer" style={{ position: "absolute", right: 6, top: 6, width: 30, height: 30, borderRadius: 15, border: "none", background: "#f0ebe3", color: "#6f6656", cursor: "pointer", fontSize: 15 }}>×</button>
            )}
          </div>
          {!enRecherche && lignesZone.length === 0 && retireesZone.length > 0 && (
            /* Zone vidée (« retirer la zone » ou croix de rayon) : le dire clairement et proposer de tout remettre */
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 12px", margin: "0 0 10px", background: "#fde7e7", border: "1px solid #f3c6c6", borderRadius: 12, fontSize: 13, color: "#7a1f1f" }}>
              <span style={{ flex: 1, minWidth: 180 }}>
                <strong>Tous les produits de {libelleZone(zone)} ont été retirés</strong> ({retireesZone.length}). Rien n&apos;est perdu : ils sont dans la liste « retirés » ci-dessous.
              </span>
              {!lectureSeule && (
                <button type="button" onClick={() => void retirerLot(retireesZone, libelleZone(zone), true)} style={{ ...bouton("#fff", "#2D6A4F"), height: 34, fontSize: 12.5 }}>Tout remettre</button>
              )}
            </div>
          )}
          {enRecherche && lignesZone.length === 0 && (
            <div style={{ fontSize: 13, color: "#8a8378", margin: "0 4px 8px" }}>
              Aucun produit ne correspond dans {libelleZone(zone)}.
              {lignes.some((l) => !l.retiree && l.zone !== zone && correspond(l)) && <> Déjà dans : {[...new Set(lignes.filter((l) => !l.retiree && l.zone !== zone && correspond(l)).map((l) => libelleZone(l.zone)))].join(", ")}. Tu peux l&apos;ajouter ici aussi (« + Ajouter ») : les zones s&apos;additionnent.</>}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "0 4px 6px" }}>
            <span style={{ fontSize: 12.5, color: "#6f6656" }}>
              {lignesZone.length} produit{lignesZone.length > 1 ? "s" : ""}{enRecherche ? " trouvés" : ""}{valeurZone > 0 ? <> · valeur comptée <strong style={{ color: "#1a1a1a" }}>{eur(valeurZone)}</strong> HT</> : null}
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {(() => {
                const codes = [...new Set(lignesZone.map(rayonDe))];
                const clesSous = [...new Set(lignesZone.map((l) => `${cleFamille(zone, rayonDe(l))}|${fiches[l.ingredient_id]?.sub_category ?? ""}`))];
                const estOuverte = (c: string) => bascules[cleFamille(zone, c)] ?? false;
                const toutesFermees = codes.length > 0 && codes.every((c) => !estOuverte(c));
                return (
                  <button type="button" onClick={() => setBascules((b) => { const n = { ...b }; for (const c of codes) n[cleFamille(zone, c)] = toutesFermees; for (const k of clesSous) n[k] = toutesFermees; return n; })} style={lien}>
                    {toutesFermees ? "tout déplier" : "tout replier"}
                  </button>
                );
              })()}
              {!lectureSeule && (
                <button type="button" onClick={() => setModaleAjout(true)} style={{ ...bouton("#fff", ACCENT), height: 34, fontSize: 12.5 }}>+ Ajouter</button>
              )}
              {!lectureSeule && lignesZoneToutes.some((l) => !l.retiree) && (
                <button type="button" onClick={() => void retirerZone()} title="Retirer tous les produits de cette zone de l'inventaire" style={{ ...lien, color: "#a12b2b" }}>retirer la zone</button>
              )}
            </div>
          </div>

          {(() => {
            // Rayon (catégorie de l'écran de commande, même ordre) → sous-catégorie de la fiche → lignes dans l'ordre de la feuille
            const groupes = rayons
              .map((r) => ({ ...r, lignes: lignesZone.filter((l) => rayonDe(l) === r.code) }))
              .filter((r) => r.lignes.length > 0)
              .map((r) => {
                const sous: { nom: string | null; lignes: Ligne[] }[] = [];
                for (const l of r.lignes) {
                  const sc = fiches[l.ingredient_id]?.sub_category ?? null;
                  let g = sous.find((x) => (x.nom ?? null) === sc);
                  if (!g) { g = { nom: sc, lignes: [] }; sous.push(g); }
                  g.lignes.push(l);
                }
                sous.sort((a, b) => (a.nom ?? "zzz").localeCompare(b.nom ?? "zzz", "fr"));
                return { ...r, sous };
              });
            return groupes.map((r, i) => {
              const couleur = couleurRayon(r.code);
              const comptees = r.lignes.filter(compte).length;
              // Replié par défaut (rayons et sous-catégories) : on n'ouvre que ce que l'on compte
              const ouverte = enRecherche || (bascules[cleFamille(zone, r.code)] ?? false);
              const plusieursSous = r.sous.length > 1 || (r.sous.length === 1 && r.sous[0].nom != null);
              return (
                <div key={r.code} style={{ margin: `${i === 0 ? 4 : 10}px 0 6px` }}>
                  {/* Titre de rayon : fond plein, texte blanc, exactement comme l'écran de commande */}
                  <button type="button" onClick={() => setBascules((b) => ({ ...b, [cleFamille(zone, r.code)]: !ouverte }))} aria-expanded={ouverte}
                    className={`barre-categorie${ouverte ? " ouverte" : ""}`}
                    style={{ ...styleBarreCategorie(couleur), minHeight: 46, gap: 12, padding: "0 16px", boxShadow: "none", borderRadius: ouverte ? "14px 14px 0 0" : 14 }}>
                    <span style={styleTitreCategorie(couleur)}>
                      {r.libelle} <span style={{ opacity: 0.75, fontWeight: 400 }}>({r.lignes.length})</span>
                    </span>
                    {comptees > 0 && (
                      <span style={stylePastilleBarre(couleur)}>{comptees}{comptees === r.lignes.length ? " ✓" : ""}</span>
                    )}
                    {!lectureSeule && (
                      /* Retirer tout le rayon de cette zone (les produits restent dans « retirés ») */
                      <span role="button" tabIndex={0} title={`Retirer « ${r.libelle} » de cette zone`} aria-label={`Retirer le rayon ${r.libelle}`}
                        onClick={(e) => { e.stopPropagation(); void retirerLot(r.lignes, r.libelle); }}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); void retirerLot(r.lignes, r.libelle); } }}
                        style={croixBarre(couleur)}>×</span>
                    )}
                    <span style={styleChevronBarre(couleur, ouverte)}>▼</span>
                  </button>
                  {/* Cadre collé à la barre, sous-catégories en bandeau (repliables sur téléphone), produits en tableau */}
                  {ouverte && (
                    <div style={{ background: "#fff", border: "1px solid #ddd6c8", borderTop: "none", borderRadius: "0 0 14px 14px", overflow: "hidden" }}>
                      {r.sous.map((g) => {
                        const compteesSous = g.lignes.filter(compte).length;
                        // Téléphone : sous-catégories repliées par défaut (on n'ouvre que ce que l'on compte) ; bureau : toujours visibles
                        const cleSous = `${cleFamille(zone, r.code)}|${g.nom ?? ""}`;
                        const sousOuverte = bureau || enRecherche || !plusieursSous || (bascules[cleSous] ?? false);
                        return (
                          <div key={g.nom ?? "∅"}>
                            {plusieursSous && (
                              <div role={bureau ? undefined : "button"} tabIndex={bureau ? undefined : 0} aria-expanded={bureau ? undefined : sousOuverte}
                                onClick={bureau ? undefined : () => setBascules((b) => ({ ...b, [cleSous]: !sousOuverte }))}
                                onKeyDown={bureau ? undefined : (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setBascules((b) => ({ ...b, [cleSous]: !sousOuverte })); } }}
                                style={{ ...styleSousCategorie(couleur, sousOuverte), cursor: bureau ? "default" : "pointer", borderRadius: 0, margin: 0 }}>
                                <span>{g.nom ?? "Autre"} <span style={{ fontWeight: 500, opacity: 0.8 }}>({g.lignes.length})</span></span>
                                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  {compteesSous > 0 && <span style={{ fontSize: 10.5, color: compteesSous === g.lignes.length ? "#2D6A4F" : "#8a7e6b" }}>{compteesSous}/{g.lignes.length}</span>}
                                  {!lectureSeule && (
                                    <span role="button" tabIndex={0} title={`Retirer « ${g.nom ?? "Autre"} » de cette zone`} aria-label={`Retirer la sous-catégorie ${g.nom ?? "Autre"}`}
                                      onClick={(e) => { e.stopPropagation(); void retirerLot(g.lignes, `${r.libelle} · ${g.nom ?? "Autre"}`); }}
                                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); void retirerLot(g.lignes, `${r.libelle} · ${g.nom ?? "Autre"}`); } }}
                                      style={croixPetite}>×</span>
                                  )}
                                  {!bureau && <span style={{ fontSize: 10, transition: "transform 0.2s", transform: sousOuverte ? "rotate(0)" : "rotate(-90deg)" }}>▼</span>}
                                </span>
                              </div>
                            )}
                            {sousOuverte && tableau(g.lignes, couleur)}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            });
          })()}

          {retireesZone.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <button type="button" onClick={() => setVoirRetirees((v) => !v)} style={{ ...lien, fontSize: 12.5 }}>
                {voirRetirees ? "▾" : "▸"} {retireesZone.length} produit{retireesZone.length > 1 ? "s" : ""} retiré{retireesZone.length > 1 ? "s" : ""} de la liste
              </button>
              {voirRetirees && !lectureSeule && (
                <button type="button" onClick={() => void retirerLot(retireesZone, "retirés", true)} style={{ ...lien, color: "#2D6A4F", marginLeft: 10 }}>tout remettre</button>
              )}
              {voirRetirees && retireesZone.map((l) => (
                <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", fontSize: 13, color: "#8a8378", background: "#faf7f2", borderRadius: 8, marginTop: 4 }}>
                  <span style={{ flex: 1, textDecoration: "line-through" }}>{l.nom_feuille ?? l.nom}</span>
                  {!lectureSeule && <button type="button" onClick={() => void retirer(l, true)} style={{ ...lien, color: "#2D6A4F" }}>remettre</button>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {modaleAjout && zone && inv && (
        <ModaleAjout zone={zone} etabId={inv.etablissement_id} etabCle={cleEtab(etabSlug)} dejaLa={new Set(lignesZone.map((l) => l.ingredient_id))}
          enCours={!!enCours} onClose={() => setModaleAjout(false)}
          onAjouter={async (ids) => { await action("ajout", { action: "ajouter", ingredient_ids: ids, zone }, (j) => `${j.ajoutes} produit(s) ajouté(s) dans ${libelleZone(zone)}${Number(j.deja_la) ? `, ${j.deja_la} déjà présent(s)` : ""}.`); }}
          onCreer={async (fiche) => {
            const j = await action("creation", { action: "creer", nom: fiche.nom, categorie: fiche.categorie, zone, fiche }, (j) =>
              j.reprise ? `« ${fiche.nom} » existait déjà${j.reactivee ? " (fiche réactivée)" : ""} : ajouté dans ${libelleZone(zone)}.`
                : `Fiche « ${fiche.nom} » créée (prix à renseigner) et ajoutée dans ${libelleZone(zone)}.`);
            return !!(j as { ok?: boolean }).ok;
          }}
        />
      )}
      {nonComptes && (
        <ModalNonComptes produits={nonComptes} onFermer={() => setNonComptes(null)}
          onFait={(nb) => { setNonComptes(null); setMessage(`${nb} produit${nb > 1 ? "s" : ""} mis inactif${nb > 1 ? "s" : ""} : ils se réactivent dans la Base produits.`); void charger(); }} />
      )}
    </div>
  );
}

/** Ajout de produits dans la zone : recherche, filtre par catégorie, sélection multiple, création rapide */
function ModaleAjout({ zone, etabId, etabCle, dejaLa, enCours, onClose, onAjouter, onCreer }: {
  zone: string; etabId: string; etabCle: string | null; dejaLa: Set<string>; enCours: boolean; onClose: () => void;
  onAjouter: (ids: string[]) => Promise<void>; onCreer: (fiche: CreationProduit) => Promise<boolean>;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"" | Category>("");
  const [resultats, setResultats] = useState<{ id: string; name: string; category: string | null }[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  /** Mini-fiche de création (ouverte depuis « Créer ») */
  const [creation, setCreation] = useState<CreationProduit | null>(null);
  const [mode, setMode] = useState<"produits" | "categorie" | "fournisseur">("produits");
  const [fournisseurs, setFournisseurs] = useState<{ id: string; name: string }[]>([]);
  const [fournisseurId, setFournisseurId] = useState("");
  const [lot, setLot] = useState<{ id: string; name: string }[] | null>(null);

  // Fournisseurs de l'établissement (ajout d'un fournisseur entier dans la zone)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("suppliers").select("id, name").eq("etablissement_id", etabId).eq("is_active", true).order("name");
      setFournisseurs((data ?? []) as { id: string; name: string }[]);
    })();
  }, [etabId]);

  // Lot à ajouter : tous les produits d'une catégorie, ou tous les produits achetés chez un fournisseur (offres actives + fournisseur de la fiche)
  useEffect(() => {
    (async () => {
      setLot(null);
      if (mode === "categorie" && cat) {
        let req = supabase.from("ingredients").select("id, name").eq("is_active", true).eq("category", cat).order("name").limit(1000);
        if (etabCle) req = req.or(`establishments.cs.{"${etabCle}"},establishments.is.null`);
        const { data } = await req;
        setLot((data ?? []) as { id: string; name: string }[]);
      } else if (mode === "fournisseur" && fournisseurId) {
        const [{ data: offs }, { data: directs }] = await Promise.all([
          supabase.from("supplier_offers").select("ingredient_id").eq("supplier_id", fournisseurId).eq("is_active", true).limit(2000),
          supabase.from("ingredients").select("id").eq("supplier_id", fournisseurId).eq("is_active", true).limit(1000),
        ]);
        const ids = [...new Set([...(offs ?? []).map((o) => o.ingredient_id as string), ...(directs ?? []).map((d) => d.id as string)])];
        if (!ids.length) { setLot([]); return; }
        const { data: ings } = await inChunks<{ id: string; name: string }>(ids, (b) => {
          let req = supabase.from("ingredients").select("id, name").in("id", b).eq("is_active", true);
          if (etabCle) req = req.or(`establishments.cs.{"${etabCle}"},establishments.is.null`);
          return req;
        });
        setLot(ings.sort((a, b) => a.name.localeCompare(b.name, "fr")));
      }
    })();
  }, [mode, cat, fournisseurId, etabCle]);

  // Catalogue de l'établissement chargé une fois : la recherche se fait ensuite sur place, tolérante aux fautes
  const [catalogue, setCatalogue] = useState<{ id: string; name: string; category: string | null; sub_category: string | null }[] | null>(null);
  useEffect(() => {
    (async () => {
      let req = supabase.from("ingredients").select("id, name, category, sub_category").eq("is_active", true).order("name").limit(5000);
      if (etabCle) req = req.or(`establishments.cs.{"${etabCle}"},establishments.is.null`);
      const { data } = await req;
      setCatalogue((data ?? []) as { id: string; name: string; category: string | null; sub_category: string | null }[]);
    })();
  }, [etabCle]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (!catalogue || (q.trim().length < 2 && !cat)) { setResultats([]); return; }
      const base = cat ? catalogue.filter((x) => x.category === cat) : catalogue;
      setResultats((q.trim().length >= 2 ? filtrerRecherche(base, q, (x) => x.name) : base).slice(0, 80));
    }, 150);
    return () => clearTimeout(t);
  }, [q, cat, catalogue]);

  const exact = resultats.some((r) => normNom(r.name) === normNom(q));
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 900, maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 -8px 30px rgba(0,0,0,0.2)" }}>
        <div style={{ padding: "14px 16px 8px" }}>
          <div style={{ fontFamily: OSWALD, fontSize: 16, fontWeight: 700 }}>Ajouter dans « {libelleZone(zone)} »</div>
          <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
            {([["produits", "Produits"], ["categorie", "Catégorie entière"], ["fournisseur", "Fournisseur entier"]] as const).map(([m, l]) => (
              <button key={m} type="button" onClick={() => setMode(m)} style={puce(mode === m)}>{l}</button>
            ))}
          </div>
          {mode === "produits" && (
            <input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher dans la base produits…"
              style={{ width: "100%", height: 42, borderRadius: 10, border: "1px solid #ddd6c8", padding: "0 12px", fontSize: 15, boxSizing: "border-box", marginTop: 8 }} />
          )}
          {mode !== "fournisseur" && (
            <div style={{ display: "flex", gap: 4, overflowX: "auto", marginTop: 8, paddingBottom: 4 }}>
              {mode === "produits" && <button type="button" onClick={() => setCat("")} style={puce(cat === "")}>Toutes</button>}
              {CATEGORIES.map((c) => <button key={c} type="button" onClick={() => setCat(c === cat ? "" : c)} style={puce(cat === c)}>{CAT_LABELS[c]}</button>)}
            </div>
          )}
          {mode === "fournisseur" && (
            <select value={fournisseurId} onChange={(e) => setFournisseurId(e.target.value)} style={{ width: "100%", height: 42, borderRadius: 10, border: "1px solid #ddd6c8", padding: "0 10px", fontSize: 15, background: "#fff", marginTop: 8 }}>
              <option value="">— Choisir un fournisseur —</option>
              {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px" }}>
          {mode !== "produits" && (
            lot == null ? <div style={{ fontSize: 13, color: "#999", padding: 12 }}>{(mode === "categorie" && !cat) || (mode === "fournisseur" && !fournisseurId) ? "Choisis une catégorie ou un fournisseur." : "Chargement…"}</div>
            : (() => {
              const nouveaux = lot.filter((x) => !dejaLa.has(x.id));
              return (
                <div style={{ padding: "8px 0" }}>
                  <div style={{ fontSize: 13, marginBottom: 8 }}>
                    <strong>{lot.length}</strong> produit{lot.length > 1 ? "s" : ""}, dont <strong>{nouveaux.length}</strong> pas encore dans la zone.
                  </div>
                  <button type="button" disabled={nouveaux.length === 0 || enCours} onClick={() => { void onAjouter(nouveaux.map((x) => x.id)).then(onClose); }}
                    style={{ ...bouton(ACCENT, "#fff"), opacity: nouveaux.length === 0 ? 0.5 : 1 }}>
                    Ajouter les {nouveaux.length} produits dans {libelleZone(zone)}
                  </button>
                  <div style={{ fontSize: 12, color: "#8a8378", marginTop: 10, lineHeight: 1.5 }}>{nouveaux.slice(0, 60).map((x) => x.name).join(" · ")}{nouveaux.length > 60 ? " · …" : ""}</div>
                </div>
              );
            })()
          )}
          {mode === "produits" && resultats.length === 0 && (q.trim().length >= 2 || cat) && <div style={{ fontSize: 13, color: "#999", padding: 12 }}>Aucun produit.</div>}
          {mode === "produits" && resultats.map((r) => {
            const present = dejaLa.has(r.id);
            return (
              <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", borderBottom: "1px solid #f3efe7", opacity: present ? 0.5 : 1 }}>
                <input type="checkbox" disabled={present} checked={sel.has(r.id)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} style={{ width: 18, height: 18, accentColor: ACCENT }} />
                <span style={{ flex: 1, fontSize: 14 }}>{r.name}</span>
                <span style={{ fontSize: 11, color: "#999" }}>{present ? "déjà dans la zone" : CAT_LABELS[r.category as Category] ?? r.category}</span>
              </label>
            );
          })}
          {mode === "produits" && q.trim().length >= 2 && !exact && !creation && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 10, borderRadius: 10, background: "rgba(45,106,79,0.06)", border: "1.5px dashed rgba(45,106,79,0.35)", margin: "8px 0", flexWrap: "wrap" }}>
              <span style={{ flex: 1, fontSize: 12.5 }}>Pas dans la base ? Créer « <b>{q.trim()}</b> » avec une fiche minimale (sans prix)</span>
              <button type="button" disabled={enCours} onClick={() => setCreation({ nom: q.trim(), categorie: cat || "epicerie_salee", unite: "piece", type_piece: "piece", colisage: null, contenu: 6 })}
                style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: "#2D6A4F", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Créer…</button>
            </div>
          )}
          {mode === "produits" && creation && (
            <MiniFiche creation={creation} onChange={setCreation} fournisseurs={fournisseurs} enCours={enCours}
              sousCategories={[...new Set((catalogue ?? []).filter((x) => x.category === creation.categorie && x.sub_category).map((x) => x.sub_category as string))].sort((a, b) => a.localeCompare(b, "fr"))}
              onAnnuler={() => setCreation(null)}
              onCreer={async () => { const ok = await onCreer(creation); if (ok) onClose(); }} />
          )}
        </div>
        <div style={{ padding: "10px 16px 16px", borderTop: "1px solid #f0ebe2", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} style={bouton("#fff", "#1a1a1a")}>Fermer</button>
          {mode === "produits" && (
            <button type="button" disabled={sel.size === 0 || enCours} onClick={() => { void onAjouter([...sel]).then(onClose); }} style={{ ...bouton(ACCENT, "#fff"), opacity: sel.size === 0 ? 0.5 : 1 }}>
              Ajouter {sel.size > 0 ? `(${sel.size})` : ""}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Champ de comptage avec − / + (comme l'écran de commande : pas de clavier obligatoire) ; la saisie au clavier reste possible */
/** Croix de retrait dans une barre de rayon (ronde, claire, à la couleur de la barre) */
const croixBarre = (couleur: string): React.CSSProperties => ({
  width: 22, height: 22, borderRadius: 11, background: "rgba(255,255,255,0.9)", color: couleurTexte(couleur), fontSize: 15, fontWeight: 700, lineHeight: 1,
  display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
});
/** Petite croix rose (sous-catégorie), la même que sur les cartes */
const croixPetite: React.CSSProperties = {
  width: 18, height: 18, borderRadius: 9, background: "#fde7e7", color: "#a12b2b", fontSize: 12, fontWeight: 700, lineHeight: 1,
  display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
};
const lien: React.CSSProperties = { border: "none", background: "none", color: ACCENT, fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0, fontFamily: "inherit" };
const puce = (actif: boolean): React.CSSProperties => ({
  flexShrink: 0, padding: "5px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
  border: actif ? `1.5px solid ${ACCENT}` : "1px solid #ddd6c8", background: actif ? "#FFF0EB" : "#fff", color: actif ? ACCENT : "#6f6656",
});
const boutonBas = (bg: string, fg: string): React.CSSProperties => ({ ...bouton(bg, fg), height: 34, fontSize: 12.5, padding: "0 12px" });
const bouton = (bg: string, fg: string): React.CSSProperties => ({
  height: 40, padding: "0 14px", borderRadius: 10, border: bg === "#fff" ? "1px solid #ddd6c8" : "none", background: bg, color: fg,
  fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
});

/** Mini-fiche de création depuis l'inventaire : le minimum pour compter et retrouver le produit, sans le prix */
function MiniFiche({ creation: c, onChange, fournisseurs, sousCategories, enCours, onAnnuler, onCreer }: {
  creation: CreationProduit; onChange: (c: CreationProduit) => void; fournisseurs: { id: string; name: string }[]; sousCategories: string[];
  enCours: boolean; onAnnuler: () => void; onCreer: () => Promise<void>;
}) {
  const maj = (p: Partial<CreationProduit>) => onChange({ ...c, ...p });
  const piece = c.unite === "piece";
  const verif = ficheDepuisCreation(c);
  const article = verif.ok ? articleDeFiche(verif.fiche as unknown as FicheConditionnement) : null;
  const cond = article ? conditionnementDArticle(article, null) : null;
  const etiquette: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, color: "#8a7e6b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 };
  const champ: React.CSSProperties = { width: "100%", height: 38, borderRadius: 8, border: "1px solid #ddd6c8", padding: "0 10px", fontSize: 14, boxSizing: "border-box", background: "#fff", fontFamily: "inherit" };
  const bloc: React.CSSProperties = { flex: "1 1 180px", minWidth: 0 };
  return (
    <div style={{ padding: 12, borderRadius: 12, background: "rgba(45,106,79,0.05)", border: "1.5px solid rgba(45,106,79,0.3)", margin: "8px 0" }}>
      <div style={{ fontFamily: OSWALD, fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Nouveau produit <span style={{ fontWeight: 400, color: "#8a7e6b", fontSize: 12 }}>· le prix viendra de la facture</span></div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <div style={{ ...bloc, flexBasis: "100%" }}>
          <div style={etiquette}>Nom</div>
          <input value={c.nom} onChange={(e) => maj({ nom: e.target.value })} style={champ} />
        </div>
        <div style={bloc}>
          <div style={etiquette}>Catégorie</div>
          <select value={c.categorie} onChange={(e) => maj({ categorie: e.target.value, sous_categorie: null })} style={champ}>
            {CATEGORIES.map((k) => <option key={k} value={k}>{CAT_LABELS[k]}</option>)}
          </select>
        </div>
        <div style={bloc}>
          <div style={etiquette}>Sous-catégorie</div>
          <input list="sous-categories-creation" value={c.sous_categorie ?? ""} onChange={(e) => maj({ sous_categorie: e.target.value })} placeholder="ex. Eaux" style={champ} />
          <datalist id="sous-categories-creation">{sousCategories.map((s) => <option key={s} value={s} />)}</datalist>
        </div>
        <div style={bloc}>
          <div style={etiquette}>Fournisseur</div>
          <select value={c.supplier_id ?? ""} onChange={(e) => maj({ supplier_id: e.target.value || null })} style={champ}>
            <option value="">— pas encore connu —</option>
            {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div style={{ ...bloc, flexBasis: "100%" }}>
          <div style={etiquette}>Acheté</div>
          <div style={{ display: "flex", gap: 4 }}>
            {([["piece", "à la pièce"], ["kg", "au kilo"], ["litre", "au litre"]] as const).map(([u, l]) => (
              <button key={u} type="button" onClick={() => maj({ unite: u })} style={puce(c.unite === u)}>{l}</button>
            ))}
          </div>
        </div>
        {piece && (
          <>
            <div style={bloc}>
              <div style={etiquette}>Type de pièce</div>
              <select value={c.type_piece ?? "piece"} onChange={(e) => maj({ type_piece: e.target.value })} style={champ}>
                {TYPES_COLISAGE.map((t) => <option key={t} value={t}>{libelleType(t)}</option>)}
              </select>
            </div>
            <div style={bloc}>
              <div style={etiquette}>Taille d&apos;une pièce (facultatif)</div>
              <div style={{ display: "flex", gap: 6 }}>
                <input type="number" inputMode="decimal" min={0} step="any" value={c.taille_qte ?? ""} onChange={(e) => maj({ taille_qte: e.target.value === "" ? null : Number(e.target.value) })} placeholder="750" style={{ ...champ, flex: 1 }} />
                <select value={c.taille_unite ?? "ml"} onChange={(e) => maj({ taille_unite: e.target.value as CreationProduit["taille_unite"] })} style={{ ...champ, width: 80 }}>
                  {(["g", "kg", "ml", "l"] as const).map((u) => <option key={u} value={u}>{u === "l" ? "L" : u === "ml" ? "mL" : u}</option>)}
                </select>
              </div>
            </div>
            <div style={bloc}>
              <div style={etiquette}>Conditionnement de commande</div>
              <select value={c.colisage ?? ""} onChange={(e) => maj({ colisage: e.target.value || null })} style={champ}>
                <option value="">— à l&apos;unité —</option>
                {TYPES_COLISAGE.filter((t) => t !== "piece" && t !== (c.type_piece ?? "piece")).map((t) => <option key={t} value={t}>{libelleType(t)}</option>)}
              </select>
            </div>
            {c.colisage && (
              <div style={bloc}>
                <div style={etiquette}>Pièces par {libelleType(c.colisage).toLowerCase()}</div>
                <input type="number" inputMode="numeric" min={1} step={1} value={c.contenu ?? ""} onChange={(e) => maj({ contenu: e.target.value === "" ? null : Number(e.target.value) })} style={champ} />
              </div>
            )}
          </>
        )}
      </div>
      <div style={{ marginTop: 10, fontSize: 12.5, color: verif.ok ? "#2D6A4F" : "#a12b2b" }}>
        {verif.ok
          ? <>Fiche : <strong>{cond?.libelle ?? (c.unite === "kg" ? "kg" : c.unite === "litre" ? "litre" : "pièce")}</strong>{cond && cond.contenu > 1 ? <> · compté par {libelleType(c.colisage ?? "").toLowerCase()} et par {cond.unite}</> : <> · compté en {cond?.unite ?? "unités"}</>}</>
          : verif.erreur}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
        <button type="button" onClick={onAnnuler} style={{ ...bouton("#fff", "#1a1a1a"), height: 36, fontSize: 12.5 }}>Annuler</button>
        <button type="button" disabled={enCours || !verif.ok} onClick={() => void onCreer()}
          style={{ ...bouton("#2D6A4F", "#fff"), height: 36, fontSize: 12.5, opacity: enCours || !verif.ok ? 0.6 : 1 }}>{enCours ? "Création…" : "Créer et ajouter dans la zone"}</button>
      </div>
    </div>
  );
}
