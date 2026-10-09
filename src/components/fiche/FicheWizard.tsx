"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useEtablissement } from "@/lib/EtablissementContext";
import { useProfile } from "@/lib/ProfileContext";
import { StepsList } from "@/components/v2/StepsList";
import { IngredientListDnD, type IngredientLine } from "@/components/v2/IngredientListDnD";
import { buildRecipeMeta, type RecipeIngredientMeta } from "@/lib/recipeMeta";
import type { LatestOffer } from "@/types/ingredients";
import {
  type FicheState, type Categorie, type Famille, type IngredientRef, type LigneIngredient, type Zone, type PrixLigne,
  ALLERGENES_14, PATON_BASE, coutRecetteTotal, coutPaton, coutPortion, prixTTC, prixHT,
  foodCostPct, margeBrute, prixConseille, fcColor, allergenesActifs, resumeAuto,
  eur, tmpKey, defaultFiche, ligneWeightG,
} from "./ficheTypes";
import { offerRowToCpu, enrichCpuWithConversions, type CpuByUnit } from "@/lib/offerPricing";
import { formatCpuLabel } from "@/lib/formatPrice";
import { openApiFile } from "@/lib/fetchApi";
import { couleurTexte } from "@/lib/styleCategories";
import { useBureau } from "@/hooks/useBureau";
import { fermerOffresActives } from "@/lib/offerClosing";

// ── Brouillons non enregistrés ──────────────────────────────────────
// Le 03/09/2026, des fiches saisies sur un appareil dont la session était
// figée n'ont jamais atteint la base : un seul brouillon par point d'entrée
// survivait, 6 h. Désormais chaque fiche en cours a son entrée (72 h, 20 max)
// et l'assistant propose de les reprendre.
type DraftEntry = {
  id: string; ts: number; nom: string; categorie_slug: string; sous_categorie: string;
  step: number; fiche: FicheState; linkedPopina: string | null;
};
// Une fiche de préparation (sirop, sauce, base…) sert d'ingrédient à d'autres fiches
const autoCommeIngredient = (cat?: string | null, sc?: string | null) =>
  /^(preparation|production|sauce)$/i.test(cat ?? "") || /sirop|sauce|base|pr[ée]pa|infusion|pur[ée]e/i.test(sc ?? "");
const ARCHIVE_TTL_MS = 72 * 60 * 60 * 1000;
const archiveKey = (etabSlug: string) => `fiche-drafts:${etabSlug}`;
function readArchive(etabSlug: string): DraftEntry[] {
  try {
    const raw = localStorage.getItem(archiveKey(etabSlug));
    const arr = raw ? (JSON.parse(raw) as DraftEntry[]) : [];
    const now = Date.now();
    return arr.filter(d => d && d.fiche && now - (d.ts ?? 0) < ARCHIVE_TTL_MS);
  } catch { return []; }
}
function writeArchive(etabSlug: string, entries: DraftEntry[]) {
  try { localStorage.setItem(archiveKey(etabSlug), JSON.stringify(entries.slice(0, 20))); } catch { /* quota / stockage bloqué */ }
}
function ageLabel(ts: number): string {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} j`;
}
// Un enregistrement ne doit jamais « tourner dans le vide » : au-delà de 15 s
// on prévient (le brouillon reste sur l'appareil).
const SAVE_TIMEOUT_MS = 15000;
function withTimeout<T>(p: PromiseLike<T>, ms = SAVE_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}

// ── Styles ──
const COLORS = {
  bg: "#f6efe2", card: "#ffffff", ink: "#2b2620", muted: "#8d8577",
  terra: "#c97b5b", terraDark: "#b5654a", bordeaux: "#7d2a2a",
  green: "#4a5d43", ok: "#3e8e5a", warn: "#c9483e", amber: "#c9882e",
  pill: "#f3e6de", line: "#eee4d4",
};

type Props = {
  recipeId?: string;
  recipeType?: "pizza" | "cuisine" | "cocktail";
  /** Pré-sélection quand on crée depuis une catégorie / sous-catégorie */
  initialCategorie?: string;
  initialSousCategorie?: string;
  /** Création depuis une touche de caisse (page Carte) : nom, prix TTC et lien Popina déjà remplis */
  initialNom?: string;
  initialPrixTtc?: number | null;
  initialPopinaId?: string | null;
  /** Dans le volet de la Carte : pas de cadre ni d'en-tête propres, fermeture et retour par rappels */
  enVolet?: boolean;
  onFermer?: () => void;
  onEnregistre?: (id: string) => void;
};

export default function FicheWizard({ recipeId, recipeType, initialCategorie, initialSousCategorie, initialNom, initialPrixTtc, initialPopinaId, enVolet = false, onFermer, onEnregistre }: Props) {
  const bureau = useBureau();
  // Bureau : une ligne par ingrédient (comme le tableau des produits) ; téléphone : cartes compactes
  const modeIngredients = bureau ? "tableau" : "cartes";
  const router = useRouter();
  const { current: etab, etablissements } = useEtablissement();
  const { can } = useProfile();
  // Écriture = permission « Créer et modifier les recettes » (rôle + exceptions
  // de la fiche employé), pas le rôle brut : un équipier autorisé doit pouvoir
  // sauvegarder. L'étape prix/marge suit la permission « valeurs monétaires ».
  const canWrite = can("operations.edit_recettes");
  const canSeeMoney = can("performances.show_money");
  const resolvedEtab = etab ?? etablissements?.[0];
  const etabSlug = resolvedEtab?.slug?.includes("piccola") ? "piccola" : "bello_mio";

  const [fiche, setFiche] = useState<FicheState>(() => ({
    ...defaultFiche(etabSlug),
    ...(initialCategorie ? { categorie_slug: initialCategorie } : {}),
    comme_ingredient: autoCommeIngredient(initialCategorie, initialSousCategorie),
    ...(initialSousCategorie ? { sous_categorie: initialSousCategorie } : {}),
    ...(initialNom ? { nom: initialNom } : {}),
    ...(initialPrixTtc && initialPrixTtc > 0 ? { prix_ttc_manuel: initialPrixTtc } : {}),
  }));
  const [categories, setCategories] = useState<Categorie[]>([]);
  const [familles, setFamilles] = useState<Famille[]>([]);
  const [mercuriale, setMercuriale] = useState<IngredientRef[]>([]);
  const [empatements, setEmpatements] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [showNewSubCat, setShowNewSubCat] = useState(false);
  const [newSubCatName, setNewSubCatName] = useState("");
  const [existingSubCats, setExistingSubCats] = useState<Record<string, string[]>>({});
  const [popinaProducts, setPopinaProducts] = useState<{ id: string; name: string; category: string; price_ttc: number; kitchen_recipe_id: string | null }[]>([]);
  const [linkedPopina, setLinkedPopina] = useState<string | null>(initialPopinaId ?? null);
  const [popinaSearch, setPopinaSearch] = useState("");
  const [showPopinaList, setShowPopinaList] = useState(false);
  const [priceLabelByIngredient, setPriceLabelByIngredient] = useState<Record<string, string>>({});
  const [metaByIngredient, setMetaByIngredient] = useState<Record<string, RecipeIngredientMeta>>({});

  // ── Load data ──
  useEffect(() => {
    (async () => {
    const [fRes, cRes, iRes, empRes, offRes, popRes] = await Promise.all([
      supabase.from("familles").select("*"),
      supabase.from("categories").select("*").order("sort_order").order("nom")
        .or(`establishments.cs.{"${etabSlug === "piccola" ? "piccola" : "bellomio"}"},establishments.is.null`),
      supabase.from("ingredients").select("id, name, category, allergens, cost_per_unit, cost_per_kg, purchase_price, purchase_unit, purchase_unit_label, density_g_per_ml, piece_weight_g, piece_volume_ml, establishments, source")
        .or(`establishments.cs.{"${etabSlug === "piccola" ? "piccola" : "bellomio"}"},establishments.is.null`),
      supabase.from("recipes").select("id, name").order("name"),
      supabase.from("v_latest_offers").select("*"),
      supabase.from("popina_products").select("id, name, category, price_ttc, kitchen_recipe_id").eq("active", true).order("name"),
    ]);
    {
      setFamilles((fRes.data ?? []) as Famille[]);
      setCategories((cRes.data ?? []) as Categorie[]);
      setEmpatements((empRes.data ?? []).map((r: Record<string, unknown>) => ({ id: r.id as string, name: (r.name as string).trim() })));
      const popProducts = (popRes.data ?? []) as { id: string; name: string; category: string; price_ttc: number; kitchen_recipe_id: string | null }[];
      setPopinaProducts(popProducts);

      // Load existing sous_categories from recipes (grouped by category)
      const { data: scData } = await supabase
        .from("kitchen_recipes")
        .select("category, sous_categorie")
        .not("sous_categorie", "is", null);
      // Fusion insensible à la casse/accents (« Sirop » = « SIROP ») :
      // la graphie déclarée sur la catégorie fait référence.
      const foldSc = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
      const scMap: Record<string, Map<string, string>> = {};
      for (const c of (cRes.data ?? []) as Categorie[]) {
        if (!scMap[c.slug]) scMap[c.slug] = new Map();
        for (const sc of c.sous_categories ?? []) if (sc) scMap[c.slug].set(foldSc(sc), sc);
      }
      for (const r of (scData ?? []) as { category: string; sous_categorie: string }[]) {
        if (!r.sous_categorie) continue;
        if (!scMap[r.category]) scMap[r.category] = new Map();
        if (!scMap[r.category].has(foldSc(r.sous_categorie))) scMap[r.category].set(foldSc(r.sous_categorie), r.sous_categorie);
      }
      const scResult: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(scMap)) scResult[k] = [...v.values()].sort((a, b) => a.localeCompare(b, "fr"));
      setExistingSubCats(scResult);

      // Build CPU map from supplier offers
      const cpuMap: Record<string, CpuByUnit> = {};
      const offerRows = (offRes.data ?? []) as Record<string, unknown>[];
      const offerByIng: Record<string, LatestOffer> = {};
      for (const o of offerRows) {
        const iid = String(o.ingredient_id ?? "");
        if (!iid) continue;
        cpuMap[iid] = offerRowToCpu(o);
        offerByIng[iid] = o as unknown as LatestOffer;
      }

      // Fetch supplier names for dropdown display
      const supplierIds = Array.from(new Set(offerRows.map(o => String(o.supplier_id ?? "")).filter(Boolean)));
      const supNameById: Record<string, string> = {};
      if (supplierIds.length) {
        const { data: sups } = await supabase.from("suppliers").select("id,name").in("id", supplierIds);
        for (const s of (sups ?? []) as { id: string; name: string }[]) {
          if (s.id && s.name) supNameById[s.id] = s.name;
        }
      }
      // Build price labels: "METRO · 9,30 €/kg"
      const supByIng: Record<string, string | null> = {};
      for (const o of offerRows) {
        const iid = String(o.ingredient_id ?? "");
        const sid = String(o.supplier_id ?? "");
        if (iid && sid) supByIng[iid] = supNameById[sid] ?? null;
      }

      // Build mercuriale from ingredients + offers
      const ingList = (iRes.data ?? []) as Record<string, unknown>[];
      // Enrich CPU with ingredient meta (density, piece weight)
      for (const i of ingList) {
        const id = i.id as string;
        let cpu = cpuMap[id];
        if (cpu) {
          cpu = enrichCpuWithConversions({
            piece_weight_g: (i.piece_weight_g as number) ?? null,
            density_kg_per_l: (i.density_g_per_ml as number) ?? null,
          }, cpu);
          // Derive ml from pcs + piece_volume_ml (e.g. bottle 750ml at 3.73€ → 0.00497 €/ml)
          const pvml = Number(i.piece_volume_ml) || 0;
          if (pvml > 0 && cpu.pcs != null && cpu.pcs > 0 && (cpu.ml == null || cpu.ml <= 0)) {
            cpu = { ...cpu, ml: cpu.pcs / pvml };
          }
          cpuMap[id] = cpu;
        }
        // Fallback: purchase_price
        if (!cpu || (!cpu.g && !cpu.ml && !cpu.pcs)) {
          const pp = Number(i.purchase_price) || 0;
          const pu = Number(i.purchase_unit) || 1;
          const pul = String(i.purchase_unit_label ?? "").toLowerCase().trim();
          if (pp > 0 && pu > 0) {
            const perUnit = pp / pu;
            if (pul === "kg") cpuMap[id] = { g: perUnit / 1000 };
            else if (pul === "g") cpuMap[id] = { g: perUnit };
            else if (pul === "l" || pul === "litre") cpuMap[id] = { ml: perUnit / 1000 };
            else if (pul === "cl") cpuMap[id] = { ml: perUnit / 10 };
            else if (pul === "ml") cpuMap[id] = { ml: perUnit };
            else if (pul === "bouteille" || pul === "piece" || pul === "pièce" || pul === "unite" || pul === "unité") cpuMap[id] = { pcs: perUnit };
            else cpuMap[id] = { g: perUnit / 1000 }; // default: treat as kg
          }
        }
        // Fallback: cost_per_unit (generated column, €/g)
        if (!cpuMap[id] || (!cpuMap[id].g && !cpuMap[id].ml && !cpuMap[id].pcs)) {
          const costPU = Number(i.cost_per_unit) || 0;
          if (costPU > 0) cpuMap[id] = { g: costPU };
        }
      }

      const mercs: IngredientRef[] = ingList.map((i) => {
        const id = i.id as string;
        let allergens: string[] = [];
        try { allergens = typeof i.allergens === "string" ? JSON.parse(i.allergens as string) : ((i.allergens as string[]) ?? []); } catch { /* */ }
        const cpu = cpuMap[id] ?? {};
        // Determine base unit from best available price
        let base: "g" | "cl" | "pc" = "g";
        let prixBase = cpu.g ?? 0;
        if (cpu.ml != null && cpu.ml > 0 && (!cpu.g || cpu.g <= 0)) { base = "cl"; prixBase = cpu.ml * 10; } // €/ml → €/cl
        else if (cpu.pcs != null && cpu.pcs > 0 && (!cpu.g || cpu.g <= 0) && (!cpu.ml || cpu.ml <= 0)) { base = "pc"; prixBase = cpu.pcs; }
        // Override with density detection from category
        const cat = String(i.category ?? "");
        if (["vins", "spiritueux", "biere", "soft", "liqueurs", "sirops"].includes(cat) && cpu.ml != null && cpu.ml > 0) {
          base = "cl"; prixBase = cpu.ml * 10;
        }
        return {
          id,
          nom_court: (i.name as string).replace(/\s+\d+[.,/]?\d*\s*(KG|G|GR|CL|ML|L|PCS|PIECES?|UNITE?S?|X)\b/gi, "").replace(/\s*~+\s*$/g, "").trim(),
          nom_produit: i.name as string,
          prix_base: prixBase,
          unite_base: base,
          allergenes: allergens,
          cpu,
          source: (i.source as string) ?? null,
        };
      });
      setMercuriale(mercs);

      // Build price labels for dropdown: "METRO · 9,30 €/kg"
      const labelMap: Record<string, string> = {};
      const metaMap: Record<string, RecipeIngredientMeta> = {};
      for (const i of ingList) {
        const id = i.id as string;
        const cpu = cpuMap[id] ?? {};
        const meta = {
          density_kg_per_l: (i.density_g_per_ml as number) ?? null,
          piece_weight_g: (i.piece_weight_g as number) ?? null,
        };
        const pvml = (i.piece_volume_ml as number) ?? null;
        const label = formatCpuLabel(cpu, meta, pvml, null);
        if (label && label !== "Prix ND") labelMap[id] = label;
        metaMap[id] = buildRecipeMeta(
          i as unknown as Parameters<typeof buildRecipeMeta>[0],
          offerByIng[id] ?? null,
          supByIng[id] ?? null,
        );
        if (!metaMap[id].prix && labelMap[id]) metaMap[id].prix = labelMap[id];
      }
      setPriceLabelByIngredient(labelMap);
      setMetaByIngredient(metaMap);

      // Load existing recipe if recipeId is provided
      if (recipeId) {
        // Auto-detect type: all recipes are now in kitchen_recipes
        let rec: Record<string, unknown> | null = null;
        let lines: Record<string, unknown>[] = [];
        let detectedType: "cuisine" | "pizza" | "cocktail" = recipeType ?? "cuisine";

        // All types (pizza, cuisine, cocktail) are in kitchen_recipes
        const { data } = await supabase.from("kitchen_recipes").select("*").eq("id", recipeId).single();
        if (data) {
          rec = data;
          const cat = data.category as string;
          if (cat === "pizza") detectedType = "pizza";
          else if (cat === "cocktail") detectedType = "cocktail";
          else detectedType = "cuisine";
        }

        if (rec) {
          const { data: lData } = await supabase.from("kitchen_recipe_lines").select("*").eq("recipe_id", recipeId);
          lines = (lData ?? []) as Record<string, unknown>[];

          const ficheLines: LigneIngredient[] = lines.map((l) => {
            const ing = mercs.find(m => m.id === l.ingredient_id);
            return {
              key: tmpKey(),
              ingredient_id: l.ingredient_id as string,
              ingredient: ing ?? null,
              quantite: Number(l.qty ?? l.quantite ?? 0),
              unite: (l.unit ?? l.unite ?? ing?.unite_base ?? "g") as string,
              zone: (l.zone ?? "apres_four") as "avant_four" | "apres_four",
            };
          });

          const catSlug = detectedType === "pizza" ? "pizza" : detectedType === "cocktail" ? "cocktail" : (rec.category as string ?? "plat_cuisine");
          setFiche({
            id: recipeId,
            nom: (rec.name as string) ?? "",
            categorie_slug: catSlug,
            sous_categorie: (rec.sous_categorie as string) ?? "",
            statut: ((rec.statut as string) ?? (rec.in_catalogue ? "publiee" : "validee")) as "brouillon" | "validee" | "publiee",
            paton_poids: (rec.ball_weight_g as number) ?? 264,
            empatement: (rec.empatement as string) ?? "FOCACCIA",
            lignes: ficheLines,
            etapes: (() => { try { return typeof rec.procedure === "string" ? JSON.parse(rec.procedure as string) : ((rec.procedure as string[]) ?? []); } catch { return []; } })(),
            notes: (rec.notes as string) ?? "",
            portions: (rec.portions_count as number) ?? 1,
            coeff: rec.sell_price && rec.cost_per_portion ? Number(rec.sell_price) / Number(rec.cost_per_portion) : 3,
            tva: rec.vat_rate ? Number(rec.vat_rate) * 100 : 10,
            prix_ttc_manuel: rec.sell_price ? Number(rec.sell_price) * (1 + (rec.vat_rate ? Number(rec.vat_rate) : 0.1)) : null,
            prix_ttc_emporter: rec.sell_price_emporter ? Number(rec.sell_price_emporter) : null,
            tva_emporter: rec.vat_rate_emporter != null ? Number(rec.vat_rate_emporter) * 100 : 5.5,
            sell_price_per_kg: rec.sell_price_per_kg ? Number(rec.sell_price_per_kg) : null,
            sell_price_per_portion: rec.sell_price_per_portion ? Number(rec.sell_price_per_portion) : null,
            cooked_weight_g: rec.cooked_weight_g ? Number(rec.cooked_weight_g) : null,
            comme_ingredient: !!rec.output_ingredient_id,
            output_ingredient_id: (rec.output_ingredient_id as string) ?? null,
            prix_lignes: Array.isArray(rec.prix_lignes) ? rec.prix_lignes as PrixLigne[] : [],
            description: (rec.description_courte as string) ?? "",
            accord: (rec.accord as string) ?? (rec.wine_pairing as string) ?? "",
            resume_salle: (rec.resume_salle as string) ?? "",
            resume_manuel: (rec.resume_manuel as boolean) ?? false,
            photo_url: (rec.photo_url as string) ?? (rec.image_url as string) ?? null,
            establishments: (rec.establishments as string[]) ?? [etabSlug],
          });
        }
      }

      // Detect linked Popina product
      if (recipeId) {
        const linked = popProducts.find(p => p.kitchen_recipe_id === recipeId);
        if (linked) setLinkedPopina(linked.id);
      }

      setLoading(false);
    }
    })();
  }, [recipeId, recipeType, etabSlug]);

  // ── Derived ──
  // Type de liaison Popina attendu par Pilotage › Produits (marges) :
  // sans linked_type, la liaison est ignorée par le calcul des marges.
  const popinaLinkedType = fiche.categorie_slug === "pizza" ? "pizza" : fiche.categorie_slug === "cocktail" ? "cocktail" : "kitchen";

  const cat = useMemo(() => categories.find(c => c.slug === fiche.categorie_slug), [categories, fiche.categorie_slug]);
  const fam = useMemo(() => familles.find(f => f.id === (cat?.famille_id ?? "autre")) ?? { id: "autre", label: "Autre", objectif_fc: 30, tva_defaut: 10, portions_label: "portion", portions_label_pluriel: "portions" } as Famille, [familles, cat]);
  const isPizza = fam.id === "pizza";
  const isBar = fam.id === "cocktail" || fam.id === "soft";

  const patonCost = isPizza ? coutPaton(fiche.paton_poids, PATON_BASE.cout, PATON_BASE.poids) : 0;
  const totalCost = coutRecetteTotal(fiche.lignes, patonCost);
  const costPerPortion = coutPortion(totalCost, fiche.portions);
  const ttc = prixTTC(costPerPortion, fiche.coeff, fiche.prix_ttc_manuel);
  const ht = prixHT(ttc, fiche.tva);
  const fc = foodCostPct(costPerPortion, ht);
  const marge = margeBrute(ht, costPerPortion);
  const conseille = prixConseille(costPerPortion, fam.objectif_fc, fiche.tva);
  const fcCol = fcColor(fc, fam.objectif_fc);
  const actifs = allergenesActifs(fiche.lignes);

  const update = useCallback((partial: Partial<FicheState>) => {
    setFiche(prev => ({ ...prev, ...partial }));
  }, []);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2600); };

  // ── Brouillon en cache ──────────────────────────────────────────────
  // Corriger un ingrédient depuis la recette navigue vers /ingredients puis
  // revient : sans cache, la recette en cours était perdue. On persiste le
  // brouillon en localStorage (6 h) et on le restaure au retour.
  const DRAFT_TTL_MS = 72 * 60 * 60 * 1000;
  const draftKey = `fiche-draft:${etabSlug}:${recipeId ?? `new:${initialCategorie ?? ""}:${initialSousCategorie ?? ""}`}`;
  const draftReady = useRef(false);
  const draftIdRef = useRef<string>(recipeId ?? `new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
  const [drafts, setDrafts] = useState<DraftEntry[]>([]);
  useEffect(() => {
    setDrafts(readArchive(etabSlug));
  }, [etabSlug]);

  useEffect(() => {
    if (loading || draftReady.current) return;
    try {
      // Retour depuis la fiche produit (?draft=…) : on reprend ce brouillon précis
      const wanted = new URLSearchParams(window.location.search).get("draft");
      const entry = wanted ? readArchive(etabSlug).find(d => d.id === wanted) : undefined;
      if (entry?.fiche) {
        draftIdRef.current = entry.id;
        setFiche(entry.fiche);
        setLinkedPopina(entry.linkedPopina ?? null);
        showToast("Fiche en cours restaurée");
        draftReady.current = true;
        return;
      }
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw) as { ts?: number; step?: number; fiche?: FicheState; linkedPopina?: string | null };
        if (d?.fiche && Date.now() - (d.ts ?? 0) < DRAFT_TTL_MS) {
          setFiche(d.fiche);
          if (d.linkedPopina !== undefined) setLinkedPopina(d.linkedPopina);
          showToast("Brouillon restauré");
        } else {
          localStorage.removeItem(draftKey);
        }
      }
    } catch { /* localStorage indisponible : tant pis, pas de cache */ }
    draftReady.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    if (!draftReady.current) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ ts: Date.now(), step: 0, fiche, linkedPopina }));
    } catch { /* quota plein ou stockage bloqué : non bloquant */ }
    if (!fiche.nom.trim() && fiche.lignes.length === 0) return;
    const t = setTimeout(() => {
      const others = readArchive(etabSlug).filter(d => d.id !== draftIdRef.current);
      const next: DraftEntry[] = [{
        id: draftIdRef.current, ts: Date.now(), nom: fiche.nom, categorie_slug: fiche.categorie_slug,
        sous_categorie: fiche.sous_categorie, step: 0, fiche, linkedPopina,
      }, ...others];
      writeArchive(etabSlug, next);
      setDrafts(next);
    }, 800);
    return () => clearTimeout(t);
  }, [fiche, linkedPopina, draftKey, etabSlug]);

  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(draftKey); } catch { /* */ }
    const rest = readArchive(etabSlug).filter(d => d.id !== draftIdRef.current);
    writeArchive(etabSlug, rest);
    setDrafts(rest);
  }, [draftKey, etabSlug]);

  const otherDrafts = drafts.filter(d => d.id !== draftIdRef.current);
  const restoreDraft = (d: DraftEntry) => {
    const enCours = fiche.nom.trim() || fiche.lignes.length > 0;
    if (enCours && !confirm(`Remplacer la fiche en cours par le brouillon « ${d.nom?.trim() || "sans nom"} » ?`)) return;
    draftIdRef.current = d.id;
    setFiche(d.fiche);
    setLinkedPopina(d.linkedPopina ?? null);
    showToast("Brouillon restauré — pense à enregistrer");
  };
  const forgetDraft = (d: DraftEntry) => {
    if (!confirm(`Oublier le brouillon « ${d.nom?.trim() || "sans nom"} » ?`)) return;
    const rest = readArchive(etabSlug).filter(x => x.id !== d.id);
    writeArchive(etabSlug, rest);
    setDrafts(rest);
  };

  // ── Save to DB ──
  async function handleSave() {
    if (!fiche.nom.trim()) { showToast("Le nom est requis"); return; }
    setSaving(true);

    const catSlug = fiche.categorie_slug;
    const isEdit = !!fiche.id;
    const savePainterCost = patonCost;
    const saveTotalCost = coutRecetteTotal(fiche.lignes, savePainterCost);
    const saveCostPerPortion = coutPortion(saveTotalCost, fiche.portions);
    const saveTtc = prixTTC(saveCostPerPortion, fiche.coeff, fiche.prix_ttc_manuel);
    const saveHt = prixHT(saveTtc, fiche.tva);

    const recData: Record<string, unknown> = {
      name: fiche.nom.trim(),
      category: catSlug,
      sous_categorie: fiche.sous_categorie || null,
      statut: fiche.statut,
      in_catalogue: fiche.statut === "publiee",
      is_active: true,
      establishments: fiche.establishments,
      procedure: JSON.stringify(fiche.etapes.filter(Boolean)),
      notes: fiche.notes || null,
      portions_count: fiche.portions,
      cost_per_portion: saveCostPerPortion > 0 ? saveCostPerPortion : null,
      total_cost: saveTotalCost > 0 ? saveTotalCost : null,
      sell_price: saveHt > 0 ? saveHt : null,
      vat_rate: fiche.tva / 100,
      sell_price_emporter: fiche.prix_ttc_emporter != null && fiche.prix_ttc_emporter > 0 ? fiche.prix_ttc_emporter : null,
      vat_rate_emporter: fiche.tva_emporter / 100,
      margin_rate: saveHt > 0 ? (1 - saveCostPerPortion / saveHt) : 0.65,
      sell_price_per_kg: fiche.sell_price_per_kg,
      sell_price_per_portion: fiche.sell_price_per_portion,
      cooked_weight_g: fiche.cooked_weight_g,
      prix_lignes: fiche.prix_lignes.length > 0 ? fiche.prix_lignes : null,
      description_courte: fiche.description || null,
      wine_pairing: fiche.accord || null,
      accord: fiche.accord || null,
      resume_salle: fiche.resume_salle || null,
      resume_manuel: fiche.resume_manuel,
      photo_url: fiche.photo_url,
    };

    if (isPizza) {
      recData.ball_weight_g = fiche.paton_poids;
      recData.empatement = fiche.empatement || null;
    }

    let savedId = fiche.id;

    try {
    if (isEdit && savedId) {
      const { error } = await withTimeout(supabase.from("kitchen_recipes").update(recData).eq("id", savedId));
      if (error) { showToast("Erreur : " + error.message); setSaving(false); return; }
    } else {
      const { data, error } = await withTimeout(supabase.from("kitchen_recipes").insert(recData).select("id").single());
      if (error) { showToast("Erreur : " + error.message); setSaving(false); return; }
      savedId = data?.id;
      update({ id: savedId });
    }

    if (savedId) {
      const { error: delErr } = await withTimeout(supabase.from("kitchen_recipe_lines").delete().eq("recipe_id", savedId));
      if (delErr) { showToast("Erreur ingrédients : " + delErr.message); setSaving(false); return; }
      const linesToInsert = fiche.lignes
        .filter(l => l.ingredient_id)
        .map((l, i) => ({
          recipe_id: savedId,
          ingredient_id: l.ingredient_id,
          qty: l.quantite,
          unit: l.unite,
          zone: l.zone,
          sort_order: i,
        }));
      if (linesToInsert.length > 0) {
        const { error: insErr } = await withTimeout(supabase.from("kitchen_recipe_lines").insert(linesToInsert));
        if (insErr) { showToast("Fiche enregistrée mais ingrédients refusés : " + insErr.message); setSaving(false); return; }
      }
    }

    // Recette maison → ingrédient réutilisable (sirop de thym, sauce, base…).
    // Prix au kg = coût matière / poids de référence (poids cuit s'il est saisi).
    if (savedId) {
      const wCru = fiche.lignes.reduce((a: number, l: LigneIngredient) => a + ligneWeightG(l), 0);
      const wRef = fiche.cooked_weight_g && fiche.cooked_weight_g > 0 ? fiche.cooked_weight_g : wCru;
      const costKg = wRef > 0 && saveTotalCost > 0 ? Math.round((saveTotalCost / wRef) * 1000 * 100) / 100 : null;
      let ingId = fiche.output_ingredient_id;
      if (!ingId) {
        const { data: lie } = await withTimeout(supabase.from("ingredients").select("id").eq("source", "recette_maison").eq("recipe_id", savedId).limit(1));
        ingId = (lie as { id: string }[] | null)?.[0]?.id ?? null;
      }
      if (fiche.comme_ingredient) {
        const liquide = isBar || /sirop|jus|infusion/i.test(fiche.sous_categorie ?? "");
        const payload = {
          name: fiche.nom.trim(),
          category: /sirop/i.test(fiche.sous_categorie ?? "") ? "sirops" : "preparation",
          purchase_price: costKg, purchase_unit: 1, purchase_unit_label: "kg", purchase_unit_name: "kg",
          source: "recette_maison", recipe_id: savedId, is_active: true, status: "validated",
          piece_weight_g: fiche.portions > 1 && wRef > 0 ? Math.round((wRef / fiche.portions) * 100) / 100 : null,
          establishments: (fiche.establishments ?? []).map((e: string) => (e.includes("piccola") ? "piccola" : "bellomio")),
          ...(liquide ? { density_g_per_ml: 1 } : {}),
        };
        if (ingId) {
          const { error: e1 } = await withTimeout(supabase.from("ingredients").update(payload).eq("id", ingId));
          if (e1) showToast("Fiche enregistrée, mais l'ingrédient maison n'a pas pu être mis à jour : " + e1.message);
        } else {
          const { data: cree, error: e2 } = await withTimeout(supabase.from("ingredients").insert({ ...payload, default_unit: "g", allergens: null, supplier_id: null, etablissement_id: resolvedEtab?.id ?? null }).select("id").single());
          if (e2) showToast("Fiche enregistrée, mais l'ingrédient maison n'a pas pu être créé : " + e2.message);
          ingId = (cree as { id: string } | null)?.id ?? null;
        }
        if (ingId) {
          await withTimeout(supabase.from("kitchen_recipes").update({ output_ingredient_id: ingId }).eq("id", savedId));
          update({ output_ingredient_id: ingId });
        }
      } else if (ingId) {
        // Case décochée : on retire l'ingrédient du choix seulement s'il ne sert nulle part
        const { count } = await withTimeout(supabase.from("kitchen_recipe_lines").select("id", { count: "exact", head: true }).eq("ingredient_id", ingId));
        if (!count) {
          await withTimeout(supabase.from("ingredients").update({ is_active: false }).eq("id", ingId));
          await withTimeout(fermerOffresActives(supabase, ingId));
        }
        else showToast(`Toujours utilisée comme ingrédient dans ${count} ligne${count > 1 ? "s" : ""} de fiche : elle reste disponible.`);
      }
    }

    // Sync Popina link if we just got an ID
    if (savedId && linkedPopina) {
      const pp = popinaProducts.find(p => p.id === linkedPopina);
      if (pp && pp.kitchen_recipe_id !== savedId) {
        await withTimeout(supabase.from("popina_products").update({ kitchen_recipe_id: savedId, ingredient_id: null, linked_type: popinaLinkedType }).eq("id", linkedPopina));
      }
    }
    } catch (e) {
      const bloque = e instanceof Error && e.message === "timeout";
      showToast(bloque
        ? "Enregistrement bloqué (15 s) : le brouillon est conservé sur cet appareil — vérifie la connexion ou recharge l'app, puis réessaie."
        : `Erreur : ${e instanceof Error ? e.message : "enregistrement impossible"}`);
      setSaving(false);
      return;
    }

    setSaving(false);
    clearDraft();
    showToast("Fiche enregistrée");
    if (onEnregistre && savedId) onEnregistre(savedId);
  }

  // ── Steps ──
  if (loading) return <div style={{ textAlign: "center", padding: 60, color: COLORS.muted }}>Chargement...</div>;

  // ── Gabarit de la fiche (maquette validée le 09/10/2026) : une seule colonne, sections empilées ──
  const BORD = "#ddd6c8";
  const SEC: CSSProperties = { padding: enVolet ? "16px 0" : "18px 18px", borderBottom: `1px solid ${BORD}`, display: "grid", gap: 12 };
  const H2: CSSProperties = { margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "#6f6a61", display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" };
  const LBL: CSSProperties = { display: "block", fontSize: 12.5, fontWeight: 600, color: "#6f6a61", marginBottom: 5 };
  const INPUT: CSSProperties = { height: 44, width: "100%", border: `1px solid ${BORD}`, borderRadius: 12, background: "#fff", padding: "0 14px", fontSize: 15, color: "#1a1a1a", fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
  const SELECT: CSSProperties = { ...INPUT, appearance: "auto" as const };
  const ZONE: CSSProperties = { ...INPUT, height: "auto", minHeight: 80, padding: "10px 14px", resize: "vertical" as const };
  const NOTE: CSSProperties = { fontSize: 12.5, color: "#6f6a61" };
  const BTN: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 42, padding: "0 16px", borderRadius: 12, border: `1px solid ${BORD}`, background: "#fff", fontWeight: 600, color: "#1a1a1a", whiteSpace: "nowrap", fontSize: 14, cursor: "pointer", fontFamily: "inherit" };
  const PETIT: CSSProperties = { ...BTN, height: 34, fontSize: 13, padding: "0 12px" };
  const AIDE: CSSProperties = { fontWeight: 500, letterSpacing: 0, textTransform: "none", fontSize: 12, color: "#a39d92" };
  const pilule = (actif: boolean): CSSProperties => ({ padding: "8px 14px", borderRadius: 9, fontSize: 13.5, fontWeight: 700, cursor: "pointer", border: "none", fontFamily: "inherit", background: actif ? "#fff" : "transparent", color: actif ? "#1a1a1a" : "#6f6a61", boxShadow: actif ? "0 1px 4px rgba(0,0,0,0.08)" : "none" });
  const Bascule = ({ titre, aide, actif, onChange }: { titre: string; aide: string; actif: boolean; onChange: (v: boolean) => void }) => (
    <button type="button" onClick={() => onChange(!actif)} aria-pressed={actif} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", textAlign: "left", border: "none", background: "transparent", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
      <span><b style={{ display: "block", fontSize: 15, color: "#1a1a1a" }}>{titre}</b><small style={{ color: "#6f6a61", fontSize: 12.5 }}>{aide}</small></span>
      <span style={{ display: "inline-block", width: 40, height: 24, borderRadius: 12, background: actif ? "#1a1a1a" : BORD, position: "relative", flexShrink: 0 }}>
        <span style={{ position: "absolute", top: 3, left: actif ? 19 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
      </span>
    </button>
  );
  const couleurCat = cat?.couleur ?? "#939597";
  const fcCouleur = fcCol === "ok" ? "#4a6741" : fcCol === "warn" ? "#b7791f" : "#b4443a";
  const htEmporter = fiche.prix_ttc_emporter != null && fiche.prix_ttc_emporter > 0 ? prixHT(fiche.prix_ttc_emporter, fiche.tva_emporter) : null;
  const popinaLie = linkedPopina ? popinaProducts.find(p => p.id === linkedPopina) : null;
  const retourCarte = () => { if (onFermer) onFermer(); else router.push("/carte?vue=fiches"); };

  // Lignes d'ingrédients : conversion vers l'éditeur commun (IngredientListDnD), par zone
  const toLines = (zone: string): IngredientLine[] =>
    fiche.lignes.filter(l => l.zone === zone).map((l, i) => ({ id: l.key, ingredient_id: l.ingredient_id ?? "", qty: l.quantite || "", unit: l.unite, sort_order: i }));
  const fromLines = (lines: IngredientLine[], zone: string): LigneIngredient[] =>
    lines.map(l => ({ key: l.id, ingredient_id: l.ingredient_id || null, ingredient: mercuriale.find((m: IngredientRef) => m.id === l.ingredient_id) ?? null, quantite: typeof l.qty === "number" ? l.qty : 0, unite: l.unit, zone: zone as Zone }));
  const updateZone = (lines: IngredientLine[], zone: string) => update({ lignes: [...fiche.lignes.filter(l => l.zone !== zone), ...fromLines(lines, zone)] });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ingList = mercuriale.map(m => ({ id: m.id, name: m.nom_produit || m.nom_court, category: "" as any, allergens: m.allergenes, source: m.source ?? null })) as any[];
  const priceMap: Record<string, CpuByUnit> = {};
  for (const m of mercuriale) {
    if (m.cpu && (m.cpu.g || m.cpu.ml || m.cpu.pcs)) priceMap[m.id] = m.cpu;
    else if (m.prix_base > 0) priceMap[m.id] = m.unite_base === "cl" ? { ml: m.prix_base / 10 } : m.unite_base === "pc" ? { pcs: m.prix_base } : { g: m.prix_base };
  }
  const units = ["g", "kg", "cl", "ml", "L", "pcs"];
  const currentUrl = (() => { if (typeof window === "undefined") return ""; const u = new URL(window.location.href); u.searchParams.set("draft", draftIdRef.current); return u.pathname + u.search; })();
  const poidsCru = fiche.lignes.reduce((acc: number, l: LigneIngredient) => acc + ligneWeightG(l), 0) + (isPizza && fiche.paton_poids ? fiche.paton_poids : 0);

  return (
    <div style={enVolet ? undefined : { maxWidth: 760, margin: "0 auto", padding: "16px 16px 40px" }}>

      {/* BROUILLONS NON ENREGISTRÉS (cet appareil) : pas dans le volet de modification d'une fiche existante (10/10/2026) */}
      {otherDrafts.length > 0 && !(enVolet && recipeId) && (
        <div style={{ background: "#fff8ec", border: "1px solid #ecd9b8", borderRadius: 14, padding: "10px 14px", marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: COLORS.amber, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Brouillons non enregistrés sur cet appareil</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {otherDrafts.map(d => (
              <span key={d.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 999, padding: "4px 6px 4px 12px", fontSize: 13 }}>
                <button type="button" onClick={() => restoreDraft(d)} style={{ border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, color: COLORS.ink, padding: 0 }}>
                  <strong>{d.nom?.trim() || "Sans nom"}</strong><span style={{ color: COLORS.muted }}> · {d.sous_categorie || d.categorie_slug || "—"} · {ageLabel(d.ts)}</span>
                </button>
                <button type="button" aria-label="Oublier ce brouillon" onClick={() => forgetDraft(d)} style={{ border: "none", background: "none", cursor: "pointer", color: COLORS.muted, fontSize: 15, padding: "0 4px" }}>×</button>
              </span>
            ))}
          </div>
        </div>
      )}

      <div style={enVolet ? { background: "#fff" } : { background: "#fff", border: `1px solid ${BORD}`, borderRadius: 16, overflow: "hidden" }}>
        {/* EN-TÊTE (le volet de la Carte a le sien) */}
        {!enVolet && <div style={{ padding: "18px 18px 14px", borderBottom: `1px solid ${BORD}`, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 24, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".02em", lineHeight: 1.1, color: "#1a1a1a" }}>{fiche.nom || "Nouvelle fiche"}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {cat && <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: `${couleurCat}1f`, color: couleurTexte(couleurCat) }}>{cat.nom}</span>}
              <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: fiche.statut === "publiee" ? "rgba(74,103,65,0.12)" : fiche.statut === "validee" ? "rgba(37,99,235,0.10)" : "#f2ede4", color: fiche.statut === "publiee" ? "#4a6741" : fiche.statut === "validee" ? "#2563EB" : "#6f6a61" }}>
                {fiche.statut === "publiee" ? "Publiée" : fiche.statut === "validee" ? "Validée" : "Brouillon"}
              </span>
              {popinaLie && <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "rgba(212,119,90,0.12)", color: "#D4775A" }}>Popina {popinaLie.price_ttc?.toFixed(2).replace(".", ",")} €</span>}
            </div>
          </div>
          <button type="button" onClick={retourCarte} aria-label="Fermer" style={{ border: "none", background: "transparent", fontSize: 24, color: "#6f6a61", lineHeight: 1, cursor: "pointer", padding: 0 }}>×</button>
        </div>}

        {/* IDENTITÉ */}
        <div style={SEC}>
          <h2 style={H2}>Identité</h2>
          <div>
            <label style={LBL}>Nom</label>
            <input type="text" value={fiche.nom} onChange={e => update({ nom: e.target.value })} placeholder="Ex : BURRATA" style={{ ...INPUT, fontWeight: 700, fontSize: 17 }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={LBL}>Catégorie</label>
              {showNewCat ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <input type="text" autoFocus value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Nom de la catégorie" style={{ ...INPUT, borderColor: COLORS.terra }}
                    onKeyDown={async e => {
                      if (e.key === "Enter" && newCatName.trim()) {
                        const slug = newCatName.trim().toLowerCase().replace(/[^a-z0-9àâäéèêëïîôùûüç]+/g, "_").replace(/^_|_$/g, "");
                        const { data, error } = await supabase.from("categories").insert({ nom: newCatName.trim(), slug, couleur: "#999999", famille_id: "autre", sous_categories: [], sort_order: 99 }).select().single();
                        if (error) { alert(`Catégorie non créée : ${error.message}`); return; }
                        if (data) { setCategories(prev => [...prev, data as Categorie]); update({ categorie_slug: slug, sous_categorie: "" }); }
                        setNewCatName(""); setShowNewCat(false);
                      }
                      if (e.key === "Escape") { setNewCatName(""); setShowNewCat(false); }
                    }} />
                  <button type="button" onClick={() => { setNewCatName(""); setShowNewCat(false); }} style={{ ...PETIT, height: 44 }}>×</button>
                </div>
              ) : (
                <select value={fiche.categorie_slug} style={SELECT} onChange={e => {
                  const slug = e.target.value;
                  if (slug === "__new__") { setShowNewCat(true); return; }
                  const c = categories.find(cc => cc.slug === slug);
                  const f = familles.find(ff => ff.id === (c?.famille_id ?? "autre"));
                  update({ categorie_slug: slug, sous_categorie: "", tva: f?.tva_defaut ?? 10 });
                }}>
                  {fiche.categorie_slug && !categories.some(c => c.slug === fiche.categorie_slug) && <option value={fiche.categorie_slug}>{fiche.categorie_slug}</option>}
                  {categories.map(c => <option key={c.slug} value={c.slug}>{c.nom}</option>)}
                  <option value="__new__">+ Créer une catégorie</option>
                </select>
              )}
            </div>
            <div>
              <label style={LBL}>Sous-catégorie</label>
              {showNewSubCat ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <input type="text" autoFocus value={newSubCatName} onChange={e => setNewSubCatName(e.target.value)} placeholder="Nom de la sous-catégorie" style={{ ...INPUT, borderColor: COLORS.terra }}
                    onKeyDown={async e => {
                      if (e.key === "Enter" && newSubCatName.trim()) {
                        const scName = newSubCatName.trim();
                        if (cat) {
                          const newSubs = [...(cat.sous_categories ?? []), scName];
                          await supabase.from("categories").update({ sous_categories: newSubs }).eq("id", cat.id);
                          setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, sous_categories: newSubs } : c));
                        }
                        setExistingSubCats(prev => ({ ...prev, [fiche.categorie_slug]: [...new Set([...(prev[fiche.categorie_slug] ?? []), scName])].sort() }));
                        update({ sous_categorie: scName });
                        setNewSubCatName(""); setShowNewSubCat(false);
                      }
                      if (e.key === "Escape") { setNewSubCatName(""); setShowNewSubCat(false); }
                    }} />
                  <button type="button" onClick={() => { setNewSubCatName(""); setShowNewSubCat(false); }} style={{ ...PETIT, height: 44 }}>×</button>
                </div>
              ) : (
                <select value={fiche.sous_categorie} style={SELECT} onChange={e => { const v = e.target.value; if (v === "__new__") { setShowNewSubCat(true); return; } update({ sous_categorie: v }); }}>
                  <option value="">Aucune</option>
                  {(existingSubCats[fiche.categorie_slug] ?? []).map(s => <option key={s} value={s}>{s}</option>)}
                  <option value="__new__">+ Créer une sous-catégorie</option>
                </select>
              )}
            </div>
          </div>
          <div>
            <label style={LBL}>Statut</label>
            <div style={{ display: "inline-flex", background: "#ece4d4", borderRadius: 12, padding: 3, gap: 3 }}>
              {(["brouillon", "validee", "publiee"] as const).map(s => (
                <button key={s} type="button" onClick={() => update({ statut: s })} style={pilule(fiche.statut === s)}>{s === "brouillon" ? "Brouillon" : s === "validee" ? "Validée" : "Publiée"}</button>
              ))}
            </div>
            <div style={{ ...NOTE, marginTop: 4 }}>Publiée : visible par l&apos;équipe dans la Carte (photo, description, allergènes).</div>
          </div>
          <div>
            <label style={LBL}>Établissements</label>
            <div style={{ display: "flex", gap: 8 }}>
              {([["bello_mio", "Bello Mio", "#e27f57"], ["piccola", "Piccola Mia", "#e6c428"]] as const).map(([slug, nom, couleur]) => {
                const actif = (fiche.establishments ?? []).some(e => e === slug || (slug === "bello_mio" && e === "bellomio"));
                return (
                  <button key={slug} type="button" onClick={() => {
                    const sans = (fiche.establishments ?? []).filter(e => !(e === slug || (slug === "bello_mio" && e === "bellomio")));
                    update({ establishments: actif ? sans : [...sans, slug] });
                  }} style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${actif ? "#1a1a1a" : BORD}`, borderRadius: 12, padding: "9px 14px", fontWeight: 600, fontSize: 14, color: actif ? "#1a1a1a" : "#6f6a61", background: "#fff", cursor: "pointer", fontFamily: "inherit" }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: couleur }} />{nom}
                  </button>
                );
              })}
            </div>
          </div>
          {isPizza && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={LBL}>Empâtement</label>
                <select value={fiche.empatement} onChange={e => update({ empatement: e.target.value })} style={SELECT}>
                  {empatements.length > 0 ? empatements.map(emp => <option key={emp.id} value={emp.name}>{emp.name}</option>) : <option>FOCACCIA</option>}
                </select>
              </div>
              <div>
                <label style={LBL}>Pâton <span style={AIDE}>· {eur(patonCost)}</span></label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button type="button" onClick={() => update({ paton_poids: Math.max(0, fiche.paton_poids - 2) })} style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: "#D4775A", color: "#fff", fontSize: 18, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>−</button>
                  <b style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 20, minWidth: 54, textAlign: "center" }}>{fiche.paton_poids} g</b>
                  <button type="button" onClick={() => update({ paton_poids: fiche.paton_poids + 2 })} style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: "#D4775A", color: "#fff", fontSize: 18, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>+</button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* PRIX DE VENTE (valeurs monétaires) */}
        {canSeeMoney && (
          <div style={SEC}>
            <h2 style={H2}>Prix de vente <span style={AIDE}>{popinaLie ? `Popina : ${popinaLie.price_ttc?.toFixed(2).replace(".", ",")} € TTC` : "TTC saisi, HT calculé"}</span></h2>
            <div style={{ display: "grid", gap: 8 }}>
              {/* Sur place */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 96px", gap: 10, alignItems: "center", border: `1px solid ${BORD}`, borderRadius: 12, padding: "10px 14px" }}>
                <div><b style={{ fontSize: 14 }}>Sur place</b><small style={{ display: "block", color: "#6f6a61", fontSize: 12 }}>{eur(ht)} HT · coeff. ×{(costPerPortion > 0 ? ttc / costPerPortion : fiche.coeff).toFixed(1)}</small></div>
                <input type="number" step="0.5" min={0} value={ttc > 0 ? Number(ttc.toFixed(2)) : ""} placeholder="0,00" onChange={e => update({ prix_ttc_manuel: Number(e.target.value) || 0 })} aria-label="Prix TTC sur place"
                  style={{ ...INPUT, height: 40, padding: "0 10px", textAlign: "right", fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 19, fontWeight: 700 }} />
                <select value={fiche.tva} onChange={e => update({ tva: Number(e.target.value) })} aria-label="TVA sur place" style={{ ...SELECT, height: 40, padding: "0 8px", fontSize: 13 }}>
                  <option value={10}>TVA 10 %</option><option value={5.5}>TVA 5,5 %</option><option value={20}>TVA 20 %</option>
                </select>
              </div>
              {/* À emporter */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 96px", gap: 10, alignItems: "center", border: `1px solid ${BORD}`, borderRadius: 12, padding: "10px 14px" }}>
                <div><b style={{ fontSize: 14 }}>À emporter</b><small style={{ display: "block", color: "#6f6a61", fontSize: 12 }}>{htEmporter != null ? `${eur(htEmporter)} HT` : "même prix que sur place si vide"}</small></div>
                <input type="number" step="0.5" min={0} value={fiche.prix_ttc_emporter ?? ""} placeholder={ttc > 0 ? ttc.toFixed(2) : "0,00"} onChange={e => update({ prix_ttc_emporter: e.target.value ? Number(e.target.value) : null })} aria-label="Prix TTC à emporter"
                  style={{ ...INPUT, height: 40, padding: "0 10px", textAlign: "right", fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 19, fontWeight: 700 }} />
                <select value={fiche.tva_emporter} onChange={e => update({ tva_emporter: Number(e.target.value) })} aria-label="TVA à emporter" style={{ ...SELECT, height: 40, padding: "0 8px", fontSize: 13 }}>
                  <option value={5.5}>TVA 5,5 %</option><option value={10}>TVA 10 %</option><option value={20}>TVA 20 %</option>
                </select>
              </div>
              {/* Autres prix */}
              {fiche.prix_lignes.map((pl, i) => {
                const ttcL = pl.prix_ht * (1 + pl.tva / 100);
                const libelle = pl.mode === "custom" ? pl.label : pl.mode === "kg" ? "Au kilo" : pl.mode === "piece" ? "À la pièce" : pl.mode === "litre" ? "Au litre" : "À la portion";
                return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 110px 96px 32px", gap: 10, alignItems: "center", border: `1px solid ${BORD}`, borderRadius: 12, padding: "10px 14px" }}>
                    <div style={{ minWidth: 0 }}>
                      <select value={pl.mode} onChange={e => { const next = [...fiche.prix_lignes]; next[i] = { ...pl, mode: e.target.value as PrixLigne["mode"] }; update({ prix_lignes: next }); }} style={{ border: "none", background: "transparent", fontWeight: 700, fontSize: 14, fontFamily: "inherit", padding: 0, color: "#1a1a1a" }}>
                        <option value="portion">À la portion</option><option value="kg">Au kilo</option><option value="piece">À la pièce</option><option value="litre">Au litre</option><option value="custom">Autre</option>
                      </select>
                      {pl.mode === "custom" && <input value={pl.label} placeholder="Libellé (livraison, traiteur…)" onChange={e => { const next = [...fiche.prix_lignes]; next[i] = { ...pl, label: e.target.value }; update({ prix_lignes: next }); }} style={{ ...INPUT, height: 32, fontSize: 13, marginTop: 4 }} />}
                      <small style={{ display: "block", color: "#6f6a61", fontSize: 12 }}>{pl.mode === "custom" ? "" : `${libelle} · `}{eur(pl.prix_ht)} HT</small>
                    </div>
                    <input type="number" step="0.5" min={0} value={ttcL > 0 ? Number(ttcL.toFixed(2)) : ""} placeholder="0,00" onChange={e => { const t = Number(e.target.value) || 0; const next = [...fiche.prix_lignes]; next[i] = { ...pl, prix_ht: t / (1 + pl.tva / 100) }; update({ prix_lignes: next }); }} aria-label="Prix TTC"
                      style={{ ...INPUT, height: 40, padding: "0 10px", textAlign: "right", fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 19, fontWeight: 700 }} />
                    <select value={pl.tva} onChange={e => { const next = [...fiche.prix_lignes]; next[i] = { ...pl, tva: Number(e.target.value) }; update({ prix_lignes: next }); }} aria-label="TVA" style={{ ...SELECT, height: 40, padding: "0 8px", fontSize: 13 }}>
                      {[5.5, 10, 20, 0].map(v => <option key={v} value={v}>TVA {String(v).replace(".", ",")} %</option>)}
                    </select>
                    <button type="button" onClick={() => update({ prix_lignes: fiche.prix_lignes.filter((_, j) => j !== i) })} aria-label="Retirer ce prix" style={{ border: "none", background: "transparent", color: "#b4443a", fontSize: 18, cursor: "pointer", fontFamily: "inherit" }}>×</button>
                  </div>
                );
              })}
              <button type="button" onClick={() => update({ prix_lignes: [...fiche.prix_lignes, { mode: "custom", label: "", prix_ht: 0, tva: 10, coeff: fiche.coeff }] })}
                style={{ border: `1px dashed ${BORD}`, borderRadius: 12, padding: "10px 14px", color: "#D4775A", fontWeight: 700, fontSize: 14, background: "transparent", textAlign: "left", cursor: "pointer", fontFamily: "inherit" }}>
                + Ajouter un prix (livraison, traiteur au kilo, à la part…)
              </button>
            </div>
            {/* Repères */}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", background: "#f7f3ec", borderRadius: 12, padding: "12px 14px" }}>
              <div><div style={{ fontSize: 12, color: "#6f6a61" }}>Coût matière</div><div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>{eur(costPerPortion)}</div></div>
              <div><div style={{ fontSize: 12, color: "#6f6a61" }}>Food cost</div><div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 22, fontWeight: 700, lineHeight: 1.1, color: fcCouleur }}>{ht > 0 ? `${fc.toFixed(1).replace(".", ",")} %` : "—"}</div></div>
              <div><div style={{ fontSize: 12, color: "#6f6a61" }}>Marge HT</div><div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 22, fontWeight: 700, lineHeight: 1.1 }}>{ht > 0 ? eur(marge) : "—"}</div></div>
            </div>
            <div style={{ ...NOTE, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span>Food cost sur le prix HT sur place, par {fam.portions_label}. Objectif {fam.label.toLowerCase()} : {fam.objectif_fc} %{conseille > 0 ? ` · prix conseillé ${eur(conseille)} TTC` : ""}.</span>
              {conseille > 0 && fcCol !== "ok" && <button type="button" onClick={() => { update({ prix_ttc_manuel: conseille }); showToast("Prix conseillé appliqué"); }} style={PETIT}>Appliquer {eur(conseille)}</button>}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <span style={NOTE}>Coefficient :</span>
              {[2.5, 3, 3.5, 4].map(c => <button key={c} type="button" onClick={() => update({ coeff: c, prix_ttc_manuel: null })} style={{ ...PETIT, height: 30, fontSize: 12.5, padding: "0 10px" }}>×{String(c).replace(".", ",")}</button>)}
            </div>

            {/* Traiteur : prix au kilo, poids après cuisson */}
            <details style={{ border: `1px solid ${BORD}`, borderRadius: 12, padding: "10px 14px" }}>
              <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 14 }}>Traiteur : prix au kilo et poids après cuisson</summary>
              {(() => {
                const wRef = fiche.cooked_weight_g && fiche.cooked_weight_g > 0 ? fiche.cooked_weight_g : poidsCru;
                const coutKg = wRef > 0 && totalCost > 0 ? (totalCost / wRef) * 1000 : null;
                const ttcKg = fiche.sell_price_per_kg;
                const coeffKg = coutKg != null && ttcKg != null && ttcKg > 0 ? ttcKg / coutKg : null;
                const htKg = ttcKg != null ? ttcKg / (1 + fiche.tva / 100) : null;
                const conseilleKg = coutKg != null ? prixConseille(coutKg, fam.objectif_fc, fiche.tva) : 0;
                return (
                  <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <label style={LBL}>Poids après cuisson <span style={AIDE}>· cru {poidsCru >= 1000 ? `${(poidsCru / 1000).toFixed(2)} kg` : `${Math.round(poidsCru)} g`}</span></label>
                        <input type="number" step={10} min={0} value={fiche.cooked_weight_g ?? ""} placeholder="g" onChange={e => update({ cooked_weight_g: e.target.value ? Number(e.target.value) : null })} style={INPUT} />
                      </div>
                      <div>
                        <label style={LBL}>Prix TTC au kilo <span style={AIDE}>{coeffKg != null ? `· coeff. ×${coeffKg.toFixed(2)}` : ""}</span></label>
                        <input type="number" step="0.5" min={0} value={ttcKg ?? ""} placeholder={conseilleKg > 0 ? conseilleKg.toFixed(2) : ""} onChange={e => update({ sell_price_per_kg: e.target.value ? Number(e.target.value) : null })} style={INPUT} />
                      </div>
                    </div>
                    <div style={NOTE}>
                      {coutKg != null ? <>Coût matière {eur(coutKg)} / kg{htKg != null ? ` · ${eur(htKg)} HT / kg` : ""}{conseilleKg > 0 ? ` · conseillé ${eur(conseilleKg)} TTC / kg` : ""}.</> : "Renseigne des quantités en g ou kg pour calculer le coût au kilo."}
                      {coutKg != null && <> <button type="button" onClick={() => update({ sell_price_per_kg: Math.round(coutKg * 3 * 100) / 100 })} style={{ ...PETIT, height: 28, fontSize: 12, padding: "0 8px", marginLeft: 6 }}>×3</button></>}
                    </div>
                  </div>
                );
              })()}
            </details>
          </div>
        )}

        {/* RECETTE */}
        <div style={SEC}>
          <h2 style={H2}>Recette {fiche.id && <button type="button" onClick={() => openApiFile(`/api/recettes/pdf?id=${fiche.id}`)} style={{ border: "none", background: "transparent", fontWeight: 600, fontSize: 13, color: "#1a1a1a", textDecoration: "underline", textDecorationColor: BORD, textUnderlineOffset: 3, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Imprimer</button>}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "#6f6a61", flexWrap: "wrap" }}>
            Quantités pour
            <button type="button" onClick={() => update({ portions: Math.max(1, fiche.portions - 1) })} style={{ width: 30, height: 30, boxSizing: "border-box", borderRadius: 8, border: "1px solid #ddd6c8", background: "#fff", color: "#6f6a61", fontSize: 15, fontWeight: 500, lineHeight: 1, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>−</button>
            <b style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 18, minWidth: 22, textAlign: "center", color: "#1a1a1a" }}>{fiche.portions}</b>
            <button type="button" onClick={() => update({ portions: fiche.portions + 1 })} style={{ width: 30, height: 30, boxSizing: "border-box", borderRadius: 8, border: "1px solid #ddd6c8", background: "#fff", color: "#6f6a61", fontSize: 15, fontWeight: 500, lineHeight: 1, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>+</button>
            {fiche.portions > 1 ? fam.portions_label_pluriel : fam.portions_label}
            {fiche.portions > 1 && <span style={NOTE}>· {eur(totalCost)} la recette, {eur(costPerPortion)} la {fam.portions_label}</span>}
          </div>
          {isPizza && (
            <>
              <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: couleurCat }}>Avant four</div>
              <IngredientListDnD mode={modeIngredients} droppableId="avant_four" items={toLines("avant_four")} ingredients={ingList} priceByIngredient={priceMap} priceLabelByIngredient={priceLabelByIngredient} metaByIngredient={metaByIngredient} units={units} onChange={lines => updateZone(lines, "avant_four")} returnUrl={currentUrl} />
            </>
          )}
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: couleurCat }}>{isPizza ? "Après four" : isBar ? "Composition" : "Ingrédients"}</div>
          <IngredientListDnD mode={modeIngredients} droppableId="apres_four" items={toLines("apres_four")} ingredients={ingList} priceByIngredient={priceMap} priceLabelByIngredient={priceLabelByIngredient} metaByIngredient={metaByIngredient} units={units} onChange={lines => updateZone(lines, "apres_four")} returnUrl={currentUrl} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, paddingTop: 4, fontSize: 15 }}>
            <span>Coût matière{isPizza && patonCost > 0 ? <span style={NOTE}> · dont pâton {eur(patonCost)}</span> : null}</span>
            <span><b style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 20 }}>{eur(totalCost)}</b>{canSeeMoney && ht > 0 && <span style={{ color: fcCouleur, fontWeight: 700 }}> &nbsp;{fc.toFixed(1).replace(".", ",")} %</span>}</span>
          </div>
          {poidsCru > 0 && <div style={NOTE}>Poids cru {poidsCru >= 1000 ? `${(poidsCru / 1000).toFixed(2)} kg` : `${Math.round(poidsCru)} g`}{fiche.portions > 1 ? ` · ${Math.round(poidsCru / fiche.portions)} g la ${fam.portions_label}` : ""}{totalCost > 0 ? ` · ${(totalCost / poidsCru * 1000).toFixed(2).replace(".", ",")} € le kilo` : ""}. Prix d&apos;achat du jour.</div>}
        </div>

        {/* PRÉPARATION */}
        <div style={SEC}>
          <h2 style={H2}>Préparation <span style={AIDE}>Les étapes alimentent le résumé pour la salle.</span></h2>
          <StepsList steps={fiche.etapes} onChange={(etapes) => { const resume_salle = fiche.resume_manuel ? fiche.resume_salle : resumeAuto(etapes); update({ etapes, resume_salle }); }} recipeId={fiche.id} />
          <div>
            <label style={LBL}>Notes libres</label>
            <textarea value={fiche.notes} onChange={e => update({ notes: e.target.value })} placeholder="Cuisson, dressage, point d'attention…" style={{ ...ZONE, minHeight: 60 }} />
          </div>
        </div>

        {/* POUR LA SALLE */}
        <div style={SEC}>
          <h2 style={H2}>Pour la salle</h2>
          <div>
            <label style={LBL}>Description sur la carte</label>
            <textarea value={fiche.description} onChange={e => update({ description: e.target.value })} placeholder="Ex : Focaccia croustillante, burrata crémeuse des Pouilles…" style={ZONE} />
          </div>
          <div>
            <label style={LBL}>Accord <span style={AIDE}>· vin, cocktail</span></label>
            <input type="text" value={fiche.accord} onChange={e => update({ accord: e.target.value })} placeholder="Ex : Verre de Vermentino, Spritz Bello" style={INPUT} />
          </div>
          <div>
            <label style={{ ...LBL, display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span>En un mot pour le service <span style={AIDE}>· généré depuis les étapes</span></span>
              <button type="button" onClick={() => { update({ resume_salle: resumeAuto(fiche.etapes), resume_manuel: false }); showToast("Résumé régénéré depuis les étapes"); }} style={{ border: "none", background: "transparent", color: "#D4775A", fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>Régénérer</button>
            </label>
            <textarea value={fiche.resume_salle} onChange={e => update({ resume_salle: e.target.value, resume_manuel: true })} placeholder="Généré automatiquement depuis les étapes de préparation" style={{ ...ZONE, minHeight: 56 }} />
          </div>
        </div>

        {/* ALLERGÈNES */}
        <div style={SEC}>
          <h2 style={H2}>Allergènes</h2>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ALLERGENES_14.map(a => (
              <span key={a} style={{ fontSize: 13, fontWeight: 600, padding: "6px 12px", borderRadius: 10, border: `1px solid ${actifs.has(a) ? "transparent" : BORD}`, background: actifs.has(a) ? "rgba(180,68,58,0.12)" : "transparent", color: actifs.has(a) ? "#b4443a" : "#6f6a61" }}>{a}</span>
            ))}
          </div>
          <div style={NOTE}>{actifs.size > 0 ? `${[...actifs].join(", ")} : depuis les ingrédients de la recette.` : "Aucun allergène détecté dans les ingrédients. Ils se règlent sur la fiche de chaque produit."}</div>
        </div>

        {/* CAISSE */}
        <div style={SEC}>
          <h2 style={H2}>Caisse</h2>
          {etabSlug !== "piccola" && (
            <div>
              <label style={LBL}>Touche Popina</label>
              {popinaLie ? (
                <div style={{ ...INPUT, justifyContent: "space-between", display: "flex", alignItems: "center" }}>
                  <span style={{ fontWeight: 700 }}>{popinaLie.name}<span style={{ fontWeight: 500, color: "#6f6a61" }}> · {popinaLie.category} · {popinaLie.price_ttc?.toFixed(2).replace(".", ",")} €</span></span>
                  <button type="button" onClick={async () => { if (linkedPopina) await supabase.from("popina_products").update({ kitchen_recipe_id: null, linked_type: null }).eq("id", linkedPopina); setLinkedPopina(null); showToast("Lien Popina retiré"); }}
                    style={{ border: "none", background: "transparent", color: "#b4443a", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Retirer</button>
                </div>
              ) : (
                <div style={{ position: "relative" }}>
                  <input type="text" value={popinaSearch} placeholder="Chercher une touche de caisse…" onChange={e => { setPopinaSearch(e.target.value); setShowPopinaList(true); }} onFocus={() => setShowPopinaList(true)} onBlur={() => setTimeout(() => setShowPopinaList(false), 150)} style={INPUT} />
                  {showPopinaList && popinaSearch.trim().length >= 2 && (() => {
                    const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
                    const q = norm(popinaSearch);
                    const results = popinaProducts.filter(p => norm(p.name).includes(q)).sort((a, b) => (a.kitchen_recipe_id ? 1 : 0) - (b.kitchen_recipe_id ? 1 : 0)).slice(0, 15);
                    return (
                      <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#fff", border: `1px solid ${BORD}`, borderRadius: 12, maxHeight: 240, overflowY: "auto", zIndex: 30, boxShadow: "0 12px 28px rgba(0,0,0,0.12)" }}>
                        {results.length === 0 && <div style={{ padding: 12, fontSize: 13, color: "#6f6a61" }}>Aucune touche trouvée.</div>}
                        {results.map(p => (
                          <div key={p.id} onMouseDown={async e => {
                            e.preventDefault();
                            if (fiche.id) await supabase.from("popina_products").update({ kitchen_recipe_id: fiche.id, ingredient_id: null, linked_type: popinaLinkedType }).eq("id", p.id);
                            setLinkedPopina(p.id); setPopinaSearch(""); setShowPopinaList(false); showToast(`Liée à ${p.name}`);
                          }} style={{ padding: "9px 13px", cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 8, borderBottom: "1px solid #f0ebe2" }}>
                            <span style={{ fontWeight: 600 }}>{p.name}{p.kitchen_recipe_id && <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "#f0ebe2", color: "#999", marginLeft: 6 }}>déjà liée</span>}</span>
                            <span style={{ fontSize: 12.5, color: "#6f6a61", whiteSpace: "nowrap" }}>{p.category} · {p.price_ttc?.toFixed(2).replace(".", ",")} €</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
          <Bascule titre="Utilisable comme ingrédient" aide="Pour une sauce, une base, une pâte reprise dans d'autres fiches : elle apparaît dans la recherche d'ingrédients avec son prix au kilo." actif={!!fiche.comme_ingredient} onChange={v => update({ comme_ingredient: v })} />
        </div>

        {/* PIED */}
        <div style={{ position: "sticky", bottom: enVolet ? -12 : 0, background: "#fff", borderTop: `1px solid ${BORD}`, padding: enVolet ? "12px 0" : "12px 18px calc(12px + env(safe-area-inset-bottom, 0px))", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {fiche.id && canWrite && (
            <button type="button" onClick={async () => {
              if (!confirm(`Supprimer la fiche « ${fiche.nom} » ?`)) return;
              await supabase.from("kitchen_recipe_lines").delete().eq("recipe_id", fiche.id!);
              await supabase.from("kitchen_recipes").delete().eq("id", fiche.id!);
              clearDraft(); retourCarte();
            }} style={{ border: "none", background: "transparent", color: "#b4443a", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit", padding: 0, marginRight: "auto" }}>Supprimer</button>
          )}
          {!(fiche.id && canWrite) && <span style={{ marginRight: "auto" }} />}
          <button type="button" onClick={() => { if (confirm("Quitter sans enregistrer ?")) { clearDraft(); retourCarte(); } }} style={BTN}>Annuler</button>
          {canWrite && (
            <button type="button" disabled={saving} onClick={handleSave} style={{ ...BTN, background: "#1a1a1a", color: "#f2ede4", borderColor: "#1a1a1a", fontWeight: 700, flex: 1, maxWidth: 220, opacity: saving ? 0.6 : 1 }}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
          )}
        </div>
      </div>

      {/* TOAST */}
      {toast && (
        <div style={{ position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", background: COLORS.ink, color: "#fff", borderRadius: 999, padding: "11px 24px", fontSize: 13.5, fontWeight: 700, zIndex: 50 }}>{toast}</div>
      )}
    </div>
  );
}
