"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  UNITS, unitsFor, ALLERGENES_14, PATON_BASE,
  coutLigne, coutRecetteTotal, coutPaton, coutPortion, prixTTC, prixHT,
  foodCostPct, margeBrute, prixConseille, fcColor, allergenesActifs, resumeAuto,
  eur, tmpKey, defaultFiche, ligneWeightG,
} from "./ficheTypes";
import { offerRowToCpu, enrichCpuWithConversions, type CpuByUnit } from "@/lib/offerPricing";
import { formatCpuLabel } from "@/lib/formatPrice";
import { openApiFile } from "@/lib/fetchApi";

// ── Brouillons non enregistrés ──────────────────────────────────────
// Le 03/09/2026, des fiches saisies sur un appareil dont la session était
// figée n'ont jamais atteint la base : un seul brouillon par point d'entrée
// survivait, 6 h. Désormais chaque fiche en cours a son entrée (72 h, 20 max)
// et l'assistant propose de les reprendre.
type DraftEntry = {
  id: string; ts: number; nom: string; categorie_slug: string; sous_categorie: string;
  step: number; fiche: FicheState; linkedPopina: string | null;
};
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
};

export default function FicheWizard({ recipeId, recipeType, initialCategorie, initialSousCategorie }: Props) {
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

  const [step, setStep] = useState(0);
  const [fiche, setFiche] = useState<FicheState>(() => ({
    ...defaultFiche(etabSlug),
    ...(initialCategorie ? { categorie_slug: initialCategorie } : {}),
    ...(initialSousCategorie ? { sous_categorie: initialSousCategorie } : {}),
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
  const [salleView, setSalleView] = useState<"salle" | "cuisine">("salle");
  const [existingSubCats, setExistingSubCats] = useState<Record<string, string[]>>({});
  const [popinaProducts, setPopinaProducts] = useState<{ id: string; name: string; category: string; price_ttc: number; kitchen_recipe_id: string | null }[]>([]);
  const [linkedPopina, setLinkedPopina] = useState<string | null>(null);
  const [popinaSearch, setPopinaSearch] = useState("");
  const [showPopinaList, setShowPopinaList] = useState(false);
  const [priceLabelByIngredient, setPriceLabelByIngredient] = useState<Record<string, string>>({});
  const [metaByIngredient, setMetaByIngredient] = useState<Record<string, RecipeIngredientMeta>>({});
  // Saisie en cours du coefficient kilo (null = affichage dérivé du prix)
  const [coeffKgDraft, setCoeffKgDraft] = useState<string | null>(null);

  // ── Load data ──
  useEffect(() => {
    (async () => {
    const [fRes, cRes, iRes, empRes, offRes, popRes] = await Promise.all([
      supabase.from("familles").select("*"),
      supabase.from("categories").select("*").order("sort_order").order("nom")
        .or(`establishments.cs.{"${etabSlug === "piccola" ? "piccola" : "bellomio"}"},establishments.is.null`),
      supabase.from("ingredients").select("id, name, category, allergens, cost_per_unit, cost_per_kg, purchase_price, purchase_unit, purchase_unit_label, density_g_per_ml, piece_weight_g, piece_volume_ml, establishments")
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
            sell_price_per_kg: rec.sell_price_per_kg ? Number(rec.sell_price_per_kg) : null,
            sell_price_per_portion: rec.sell_price_per_portion ? Number(rec.sell_price_per_portion) : null,
            cooked_weight_g: rec.cooked_weight_g ? Number(rec.cooked_weight_g) : null,
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
        if (typeof entry.step === "number") setStep(entry.step);
        setLinkedPopina(entry.linkedPopina ?? null);
        showToast("Fiche en cours restaurée");
        draftReady.current = true;
        return;
      }
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw) as { ts?: number; step?: number; fiche?: FicheState; linkedPopina?: string | null };
        if (d?.fiche && Date.now() - (d.ts ?? 0) < DRAFT_TTL_MS) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setFiche(d.fiche);
          if (typeof d.step === "number") setStep(d.step);
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
      localStorage.setItem(draftKey, JSON.stringify({ ts: Date.now(), step, fiche, linkedPopina }));
    } catch { /* quota plein ou stockage bloqué : non bloquant */ }
    if (!fiche.nom.trim() && fiche.lignes.length === 0) return;
    const t = setTimeout(() => {
      const others = readArchive(etabSlug).filter(d => d.id !== draftIdRef.current);
      const next: DraftEntry[] = [{
        id: draftIdRef.current, ts: Date.now(), nom: fiche.nom, categorie_slug: fiche.categorie_slug,
        sous_categorie: fiche.sous_categorie, step, fiche, linkedPopina,
      }, ...others];
      writeArchive(etabSlug, next);
      setDrafts(next);
    }, 800);
    return () => clearTimeout(t);
  }, [fiche, step, linkedPopina, draftKey, etabSlug]);

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
    setStep(typeof d.step === "number" ? d.step : 0);
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
  }

  // ── Steps ──
  const STEPS = ["Infos", "Ingredients", "Preparation", "Prix et marge", "Fiche salle"];

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: COLORS.muted }}>Chargement...</div>;

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "28px 16px 80px" }}>

      {/* HERO */}
      <div style={{
        background: `linear-gradient(135deg, #82302c, #6e2523)`,
        color: "#fff", borderRadius: 22, padding: "22px 26px", marginBottom: 14,
        boxShadow: "0 10px 24px #7d2a2a22",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: ".2em", opacity: 0.75, textTransform: "uppercase", fontWeight: 600 }}>
              Fiche technique
            </div>
            <h1 style={{ fontSize: 26, letterSpacing: ".08em", marginTop: 4, textTransform: "uppercase", fontWeight: 800 }}>
              {fiche.nom || "Nouvelle recette"}
            </h1>
          </div>
          <span style={{
            borderRadius: 999, padding: "5px 14px", fontSize: 12, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase",
            background: fiche.statut === "publiee" ? "#f6e2df" : fiche.statut === "validee" ? "#e2efe4" : "#f2ede2",
            color: fiche.statut === "publiee" ? COLORS.bordeaux : fiche.statut === "validee" ? COLORS.ok : COLORS.muted,
          }}>
            {fiche.statut === "publiee" ? "Au catalogue" : fiche.statut === "validee" ? "Validee" : "Brouillon"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <span style={{ background: "#ffffff22", borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 600 }}>
            {resolvedEtab?.nom ?? "Bello Mio"}
          </span>
          {cat && <span style={{ background: "#ffffff22", borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 600 }}>{cat.nom}</span>}
          {fiche.sous_categorie && <span style={{ background: "#ffffff22", borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 600 }}>{fiche.sous_categorie}</span>}
        </div>
      </div>

      {/* BROUILLONS NON ENREGISTRÉS (cet appareil) */}
      {otherDrafts.length > 0 && (
        <div style={{ background: "#fff8ec", border: "1px solid #ecd9b8", borderRadius: 14, padding: "10px 14px", marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: COLORS.amber, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>
            Brouillons non enregistrés sur cet appareil
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {otherDrafts.map(d => (
              <span key={d.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#fff", border: `1px solid ${COLORS.line}`, borderRadius: 999, padding: "4px 6px 4px 12px", fontSize: 13 }}>
                <button type="button" onClick={() => restoreDraft(d)} style={{ border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, color: COLORS.ink, padding: 0 }}>
                  <strong>{d.nom?.trim() || "Sans nom"}</strong>
                  <span style={{ color: COLORS.muted }}> · {d.sous_categorie || d.categorie_slug || "—"} · {ageLabel(d.ts)}</span>
                </button>
                <button type="button" aria-label="Oublier ce brouillon" onClick={() => forgetDraft(d)} style={{ border: "none", background: "none", cursor: "pointer", color: COLORS.muted, fontSize: 15, lineHeight: 1, padding: "0 4px" }}>×</button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* PIPELINE */}
      <div style={{
        display: "flex", alignItems: "center", background: COLORS.card,
        borderRadius: 18, padding: "14px 18px", marginBottom: 14, boxShadow: "0 4px 14px #0000000a",
      }}>
        {["Brouillon cuisine", "Fiche validee", "Au catalogue salle"].map((label, i) => (
          <React.Fragment key={i}>
            {i > 0 && <div style={{ flex: 1, height: 2, background: COLORS.line, margin: "0 12px", minWidth: 20 }} />}
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em",
              color: i < (fiche.statut === "publiee" ? 3 : fiche.statut === "validee" ? 2 : 1) ? COLORS.ok : (i === (fiche.statut === "publiee" ? 2 : fiche.statut === "validee" ? 1 : 0) ? COLORS.bordeaux : COLORS.muted),
            }}>
              <span style={{
                width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
                background: i < (fiche.statut === "publiee" ? 3 : fiche.statut === "validee" ? 2 : 1) ? COLORS.ok : (i === (fiche.statut === "publiee" ? 2 : fiche.statut === "validee" ? 1 : 0) ? COLORS.bordeaux : COLORS.pill),
                color: i < (fiche.statut === "publiee" ? 3 : fiche.statut === "validee" ? 2 : 1) || i === (fiche.statut === "publiee" ? 2 : fiche.statut === "validee" ? 1 : 0) ? "#fff" : COLORS.muted,
              }}>
                {i + 1}
              </span>
              <span className="hidden-mobile" style={{ whiteSpace: "nowrap" }}>{label}</span>
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* STEPPER */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {STEPS.map((s, i) => (
          <button key={i} onClick={() => setStep(i)} style={{
            flex: 1, minWidth: 120, border: "none", cursor: "pointer",
            background: step === i ? COLORS.terra : COLORS.card,
            borderRadius: 14, padding: "10px 8px", fontSize: 12, fontWeight: 700,
            color: step === i ? "#fff" : COLORS.muted, letterSpacing: ".04em",
            boxShadow: "0 3px 10px #0000000a", transition: ".15s",
            fontFamily: "inherit",
          }}>
            <span style={{
              display: "inline-flex", width: 20, height: 20, borderRadius: "50%",
              background: step === i ? "#ffffff33" : COLORS.pill,
              alignItems: "center", justifyContent: "center", marginRight: 6, fontSize: 11,
              color: step === i ? "#fff" : COLORS.muted,
            }}>{i + 1}</span>
            {s}
          </button>
        ))}
      </div>

      {/* ÉTAPE 1 : INFOS */}
      {step === 0 && (
        <div style={{ background: COLORS.card, borderRadius: 18, padding: "22px 24px", marginBottom: 14, boxShadow: "0 4px 14px #0000000a" }}>
          <h2 style={{ fontSize: 13, letterSpacing: ".15em", textTransform: "uppercase", color: COLORS.bordeaux, marginBottom: 16, fontWeight: 800 }}>
            1. Informations de base
          </h2>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: "14px 0 6px" }}>Nom de la recette</label>
          <input type="text" value={fiche.nom} onChange={e => update({ nom: e.target.value })} placeholder="Ex : BURRATA"
            style={{ width: "100%", border: `1.5px solid ${COLORS.line}`, borderRadius: 12, padding: "11px 14px", fontSize: 15, background: "#fffdf9", color: COLORS.ink, outline: "none", boxSizing: "border-box" }} />

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 14 }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 6px" }}>Categorie</label>
              {showNewCat ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <input type="text" autoFocus value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder="Nom de la categorie"
                    style={{ flex: 1, border: `1.5px solid ${COLORS.terra}`, borderRadius: 12, padding: "11px 14px", fontSize: 15, background: "#fffdf9", outline: "none", fontFamily: "inherit" }}
                    onKeyDown={async e => {
                      if (e.key === "Enter" && newCatName.trim()) {
                        const slug = newCatName.trim().toLowerCase().replace(/[^a-z0-9àâäéèêëïîôùûüç]+/g, "_").replace(/^_|_$/g, "");
                        const { data, error } = await supabase.from("categories").insert({ nom: newCatName.trim(), slug, couleur: "#999999", famille_id: "autre", sous_categories: [], sort_order: 99 }).select().single();
                        if (error) { alert(`Catégorie non créée : ${error.message}`); return; }
                        if (data) {
                          setCategories(prev => [...prev, data as Categorie]);
                          update({ categorie_slug: slug, sous_categorie: "" });
                        }
                        setNewCatName(""); setShowNewCat(false);
                      }
                      if (e.key === "Escape") { setNewCatName(""); setShowNewCat(false); }
                    }} />
                  <button onClick={() => { setNewCatName(""); setShowNewCat(false); }}
                    style={{ border: "none", background: "#f2ede2", borderRadius: 10, padding: "0 12px", cursor: "pointer", color: COLORS.muted, fontWeight: 700, fontFamily: "inherit" }}>x</button>
                </div>
              ) : (
                <select value={fiche.categorie_slug} onChange={e => {
                  const slug = e.target.value;
                  if (slug === "__new__") { setShowNewCat(true); return; }
                  const c = categories.find(cc => cc.slug === slug);
                  const f = familles.find(ff => ff.id === (c?.famille_id ?? "autre"));
                  update({ categorie_slug: slug, sous_categorie: "", tva: f?.tva_defaut ?? 10 });
                }} style={{ width: "100%", border: `1.5px solid ${COLORS.line}`, borderRadius: 12, padding: "11px 14px", fontSize: 15, background: "#fffdf9", fontFamily: "inherit" }}>
                  {categories.map(c => {
                    const f = familles.find(ff => ff.id === c.famille_id);
                    return <option key={c.slug} value={c.slug}>{c.nom} ({f?.label ?? "Autre"}, FC {f?.objectif_fc ?? 30} %)</option>;
                  })}
                  <option value="__new__">+ Creer une categorie</option>
                </select>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 6px" }}>
                Sous-categorie <span style={{ textTransform: "none", letterSpacing: 0 }}>(facultatif)</span>
              </label>
              {showNewSubCat ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <input type="text" autoFocus value={newSubCatName} onChange={e => setNewSubCatName(e.target.value)} placeholder="Nom de la sous-categorie"
                    style={{ flex: 1, border: `1.5px solid ${COLORS.terra}`, borderRadius: 12, padding: "11px 14px", fontSize: 15, background: "#fffdf9", outline: "none", fontFamily: "inherit" }}
                    onKeyDown={async e => {
                      if (e.key === "Enter" && newSubCatName.trim()) {
                        const scName = newSubCatName.trim();
                        // Save to categories table if cat exists
                        if (cat) {
                          const newSubs = [...(cat.sous_categories ?? []), scName];
                          await supabase.from("categories").update({ sous_categories: newSubs }).eq("id", cat.id);
                          setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, sous_categories: newSubs } : c));
                        }
                        // Update local existing sub-cats
                        setExistingSubCats(prev => ({
                          ...prev,
                          [fiche.categorie_slug]: [...new Set([...(prev[fiche.categorie_slug] ?? []), scName])].sort(),
                        }));
                        update({ sous_categorie: scName });
                        setNewSubCatName(""); setShowNewSubCat(false);
                      }
                      if (e.key === "Escape") { setNewSubCatName(""); setShowNewSubCat(false); }
                    }} />
                  <button onClick={() => { setNewSubCatName(""); setShowNewSubCat(false); }}
                    style={{ border: "none", background: "#f2ede2", borderRadius: 10, padding: "0 12px", cursor: "pointer", color: COLORS.muted, fontWeight: 700, fontFamily: "inherit" }}>x</button>
                </div>
              ) : (
                <select value={fiche.sous_categorie} onChange={e => {
                  const v = e.target.value;
                  if (v === "__new__") { setShowNewSubCat(true); return; }
                  update({ sous_categorie: v });
                }} style={{ width: "100%", border: `1.5px solid ${COLORS.line}`, borderRadius: 12, padding: "11px 14px", fontSize: 15, background: "#fffdf9", fontFamily: "inherit" }}>
                  <option value="">Aucune</option>
                  {(existingSubCats[fiche.categorie_slug] ?? []).map(s => <option key={s} value={s}>{s}</option>)}
                  <option value="__new__">+ Creer une sous-categorie</option>
                </select>
              )}
            </div>
          </div>

          {/* Variante pizza */}
          {isPizza && (
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 14 }}>
              <div style={{ flex: 1, minWidth: 150 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 6px" }}>Empatement lie</label>
                <select value={fiche.empatement} onChange={e => update({ empatement: e.target.value })}
                  style={{ width: "100%", border: `1.5px solid ${COLORS.line}`, borderRadius: 12, padding: "11px 14px", fontSize: 15, background: "#fffdf9", fontFamily: "inherit" }}>
                  {empatements.length > 0
                    ? empatements.map(emp => <option key={emp.id} value={emp.name}>{emp.name}</option>)
                    : <option>FOCACCIA</option>
                  }
                </select>
              </div>
              <div style={{ flex: 1, minWidth: 150 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 6px" }}>Poids paton (g)</label>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button onClick={() => update({ paton_poids: Math.max(0, fiche.paton_poids - 2) })} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "#fff", color: COLORS.bordeaux, fontSize: 17, fontWeight: 800, cursor: "pointer", boxShadow: "0 2px 6px #00000012" }}>&minus;</button>
                  <b style={{ minWidth: 44, textAlign: "center", fontSize: 17 }}>{fiche.paton_poids}</b>
                  <button onClick={() => update({ paton_poids: fiche.paton_poids + 2 })} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "#fff", color: COLORS.bordeaux, fontSize: 17, fontWeight: 800, cursor: "pointer", boxShadow: "0 2px 6px #00000012" }}>+</button>
                  <span style={{ fontSize: 12.5, color: COLORS.muted, marginLeft: 8 }}>cout paton : {eur(patonCost)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ÉTAPE 2 : INGRÉDIENTS */}
      {step === 1 && (
        <div style={{ background: COLORS.card, borderRadius: 18, padding: "22px 24px", marginBottom: 14, boxShadow: "0 4px 14px #0000000a" }}>
          <h2 style={{ fontSize: 13, letterSpacing: ".15em", textTransform: "uppercase", color: COLORS.bordeaux, marginBottom: 16, fontWeight: 800 }}>
            2. Ingredients
          </h2>

          {/* Ingredient list with drag & drop */}
          {(() => {
            // Convert LigneIngredient → IngredientLine for IngredientListDnD
            const toLines = (zone: string): IngredientLine[] =>
              fiche.lignes.filter(l => l.zone === zone).map((l, i) => ({
                id: l.key, ingredient_id: l.ingredient_id ?? "", qty: l.quantite || "", unit: l.unite, sort_order: i,
              }));
            const fromLines = (lines: IngredientLine[], zone: string): LigneIngredient[] =>
              lines.map(l => ({
                key: l.id, ingredient_id: l.ingredient_id || null,
                ingredient: mercuriale.find((m: IngredientRef) => m.id === l.ingredient_id) ?? null,
                quantite: typeof l.qty === "number" ? l.qty : 0, unite: l.unit, zone: zone as Zone,
              }));
            const updateZone = (lines: IngredientLine[], zone: string) => {
              const otherLines = fiche.lignes.filter(l => l.zone !== zone);
              update({ lignes: [...otherLines, ...fromLines(lines, zone)] });
            };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const ingList = mercuriale.map(m => ({ id: m.id, name: m.nom_produit || m.nom_court, category: "" as any, allergens: m.allergenes })) as any[];
            const priceMap: Record<string, CpuByUnit> = {};
            for (const m of mercuriale) {
              // Prix complets (€/g, €/ml, €/pièce) quand on les a — l'ancien
              // raccourci { g: prix_base } perdait le €/L : plus d'estimation
              // possible sur une ligne en cl, et le poids total comptait
              // les centilitres comme des grammes.
              if (m.cpu && (m.cpu.g || m.cpu.ml || m.cpu.pcs)) priceMap[m.id] = m.cpu;
              else if (m.prix_base > 0) {
                priceMap[m.id] = m.unite_base === "cl" ? { ml: m.prix_base / 10 } : m.unite_base === "pc" ? { pcs: m.prix_base } : { g: m.prix_base };
              }
            }
            const units = ["g", "kg", "cl", "ml", "L", "pcs"];
            // URL de retour depuis /ingredients : on y glisse l'identifiant du
            // brouillon pour retrouver exactement cette fiche, quel que soit le
            // chemin d'entrée (nouvelle fiche, catégorie, sous-catégorie).
            const currentUrl = (() => {
              if (typeof window === "undefined") return "";
              const u = new URL(window.location.href);
              u.searchParams.set("draft", draftIdRef.current);
              return u.pathname + u.search;
            })();

            return (
              <>
                {isPizza && (
                  <>
                    <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: COLORS.muted, fontWeight: 800, margin: "18px 0 8px" }}>Avant four</div>
                    <IngredientListDnD droppableId="avant_four" items={toLines("avant_four")} ingredients={ingList} priceByIngredient={priceMap} priceLabelByIngredient={priceLabelByIngredient} metaByIngredient={metaByIngredient} units={units} onChange={lines => updateZone(lines, "avant_four")} returnUrl={currentUrl} />
                  </>
                )}
                <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: COLORS.muted, fontWeight: 800, margin: "18px 0 8px" }}>
                  {isPizza ? "Apres four" : isBar ? "Composition" : "Ingredients"}
                </div>
                <IngredientListDnD droppableId="apres_four" items={toLines("apres_four")} ingredients={ingList} priceByIngredient={priceMap} priceLabelByIngredient={priceLabelByIngredient} metaByIngredient={metaByIngredient} units={units} onChange={lines => updateZone(lines, "apres_four")} returnUrl={currentUrl} />
              </>
            );
          })()}

          {/* Total + poids + allergènes */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1.5px solid ${COLORS.line}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, marginBottom: 6 }}>
              <span>Cout matiere, recette complete</span>
              <span style={{ color: COLORS.bordeaux, fontSize: 18 }}>{eur(totalCost)}</span>
            </div>
            {(() => {
              const wG = fiche.lignes.reduce((acc: number, l: LigneIngredient) => acc + ligneWeightG(l), 0)
                + (isPizza && fiche.paton_poids ? fiche.paton_poids : 0);
              if (wG <= 0) return null;
              return (
                <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#888" }}>
                  <span>Poids total : <strong style={{ color: "#1a1a1a" }}>{wG >= 1000 ? `${(wG / 1000).toFixed(2)} kg` : `${Math.round(wG)} g`}</strong></span>
                  {fiche.portions > 1 && <span>Poids/portion : <strong style={{ color: "#1a1a1a" }}>{Math.round(wG / fiche.portions)} g</strong></span>}
                  {totalCost > 0 && wG > 0 && <span>Prix/kg : <strong style={{ color: COLORS.bordeaux }}>{(totalCost / wG * 1000).toFixed(2)}€</strong></span>}
                </div>
              );
            })()}
          </div>
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: COLORS.muted, fontWeight: 800, marginBottom: 8 }}>Allergenes, detectes automatiquement</div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {ALLERGENES_14.map(a => (
                <span key={a} style={{
                  borderRadius: 999, padding: "5px 13px", fontSize: 12, fontWeight: 700,
                  background: actifs.has(a) ? "#fbe3e0" : "#f2ede2",
                  color: actifs.has(a) ? COLORS.warn : "#b9b2a2",
                }}>{a}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ÉTAPE 3 : PRÉPARATION */}
      {step === 2 && (
        <div style={{ background: COLORS.card, borderRadius: 18, padding: "22px 24px", marginBottom: 14, boxShadow: "0 4px 14px #0000000a" }}>
          <h2 style={{ fontSize: 13, letterSpacing: ".15em", textTransform: "uppercase", color: COLORS.bordeaux, marginBottom: 16, fontWeight: 800 }}>
            3. Preparation <span style={{ color: COLORS.muted, fontWeight: 600, letterSpacing: ".02em", textTransform: "none", fontSize: 12 }}>(facultatif)</span>
          </h2>
          <StepsList
            steps={fiche.etapes}
            onChange={(etapes) => {
              const resume_salle = fiche.resume_manuel ? fiche.resume_salle : resumeAuto(etapes);
              update({ etapes, resume_salle });
            }}
            recipeId={fiche.id}
          />
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: "14px 0 6px" }}>Notes libres</label>
          <textarea value={fiche.notes} onChange={e => update({ notes: e.target.value })} placeholder="Cuisson, dressage, point d'attention..."
            style={{ width: "100%", border: `1.5px solid ${COLORS.line}`, borderRadius: 12, padding: "11px 14px", fontSize: 15, background: "#fffdf9", outline: "none", resize: "vertical", minHeight: 70, fontFamily: "inherit", boxSizing: "border-box" }} />
        </div>
      )}

      {/* ÉTAPE 4 : PRIX & MARGE (permission valeurs monétaires) */}
      {step === 3 && canSeeMoney && (
        <div style={{ background: COLORS.card, borderRadius: 18, padding: "22px 24px", marginBottom: 14, boxShadow: "0 4px 14px #0000000a" }}>
          <h2 style={{ fontSize: 13, letterSpacing: ".15em", textTransform: "uppercase", color: COLORS.bordeaux, marginBottom: 16, fontWeight: 800 }}>
            4. Prix et marge
          </h2>

          {/* Portions */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "#faf5ea", borderRadius: 14, padding: "12px 16px", marginBottom: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: COLORS.muted }}>Recette pour</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button onClick={() => update({ portions: Math.max(1, fiche.portions - 1) })} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "#fff", color: COLORS.bordeaux, fontSize: 17, fontWeight: 800, cursor: "pointer", boxShadow: "0 2px 6px #00000012" }}>&minus;</button>
              <b style={{ minWidth: 44, textAlign: "center", fontSize: 17 }}>{fiche.portions}</b>
              <button onClick={() => update({ portions: fiche.portions + 1 })} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "#fff", color: COLORS.bordeaux, fontSize: 17, fontWeight: 800, cursor: "pointer", boxShadow: "0 2px 6px #00000012" }}>+</button>
              <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.muted }}>{fiche.portions > 1 ? fam.portions_label_pluriel : fam.portions_label}</span>
            </div>
            <span style={{ fontSize: 12.5, color: COLORS.muted, fontWeight: 600 }}>
              {fiche.portions > 1 ? `cout recette ${eur(totalCost)} / ${fiche.portions} = ${eur(costPerPortion)} / ${fam.portions_label}` : `tout est calcule pour 1 ${fam.portions_label}`}
            </span>
          </div>

          {/* KPIs */}
          <div style={{ display: "flex", background: "#fffdf9", border: `1.5px solid ${COLORS.line}`, borderRadius: 16, overflow: "hidden", marginBottom: 14, flexWrap: "wrap" }}>
            <KPI label="Cout / portion" value={eur(costPerPortion)} color={COLORS.bordeaux} sub={isPizza ? `dont paton ${eur(patonCost)}` : fiche.portions > 1 ? `recette : ${eur(totalCost)}` : ""} />
            <KPI label="Coeff" value={`x${(costPerPortion > 0 ? ttc / costPerPortion : fiche.coeff).toFixed(2)}`} color="#6b4fd8" />
            <KPI label="Prix vente TTC" value={eur(ttc)} sub={`${eur(ht)} HT, TVA ${fiche.tva} %`} />
            <KPI label="Marge brute" value={eur(marge)} color={COLORS.ok} sub={fiche.portions > 1 ? `/ ${fam.portions_label}, recette : ${eur(marge * fiche.portions)}` : `/ ${fam.portions_label}`} />
          </div>

          {/* Poids total + Prix/kg + Cuisson */}
          {(() => {
            // Liquides inclus : 3 L comptent 3 kg
            const weightG = fiche.lignes.reduce((acc: number, l: LigneIngredient) => acc + ligneWeightG(l), 0)
              + (isPizza && fiche.paton_poids ? fiche.paton_poids : 0);
            if (weightG <= 0) return null;
            const pricePerKg = totalCost > 0 ? totalCost / weightG * 1000 : 0;
            return (
              <div style={{ display: "flex", justifyContent: "center", gap: 16, fontSize: 12, color: "#888", marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
                <span>Poids cru : <strong style={{ color: "#1a1a1a" }}>{weightG >= 1000 ? `${(weightG / 1000).toFixed(2)} kg` : `${Math.round(weightG)} g`}</strong></span>
                {pricePerKg > 0 && <span>Prix/kg : <strong style={{ color: COLORS.bordeaux }}>{pricePerKg.toFixed(2)}{"\u20AC"}</strong></span>}
                {fiche.portions > 0 && weightG > 0 && <span>Poids/portion : <strong style={{ color: "#1a1a1a" }}>{Math.round(weightG / fiche.portions)} g</strong></span>}
              </div>
            );
          })()}

          {/* Bandeau prix conseillé */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            border: `1.5px solid ${fcCol === "ok" ? "#dfe8dc" : "#f0d9d6"}`,
            background: fcCol === "ok" ? "#f2f7f0" : "#fbf1ef",
            borderRadius: 14, padding: "12px 16px", marginBottom: 16, flexWrap: "wrap",
          }}>
            <span style={{ fontSize: 13.5, color: fcCol === "ok" ? COLORS.green : COLORS.warn, fontWeight: 700 }}>
              {fcCol === "ok"
                ? `Food cost tenu : ${fc.toFixed(0)} % pour un objectif ${fam.label.toLowerCase()} de ${fam.objectif_fc} %. Prix plancher : ${eur(conseille)} TTC.`
                : `Food cost depasse : ${fc.toFixed(0)} % pour un objectif ${fam.label.toLowerCase()} de ${fam.objectif_fc} %. Prix conseille : ${eur(conseille)} TTC.`
              }
            </span>
            {fcCol !== "ok" && (
              <button onClick={() => { update({ prix_ttc_manuel: conseille }); showToast("Prix conseille applique"); }}
                style={{ border: "none", background: COLORS.warn, color: "#fff", borderRadius: 999, padding: "8px 18px", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                Appliquer
              </button>
            )}
          </div>

          {/* Contrôles coeff / prix / TVA */}
          <div style={{ background: "rgba(255,255,255,0.8)", borderRadius: 14, border: "1px solid rgba(0,0,0,0.06)", padding: 16, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: ".08em" }}>Prix de vente · a la portion</div>
            <span style={{ fontSize: 11, color: "#aaa" }}>Prix TTC = cout portion ({eur(costPerPortion)}) × coefficient</span>
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 6px" }}>Coefficient</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input type="number" value={(costPerPortion > 0 ? ttc / costPerPortion : fiche.coeff).toFixed(2)} step="0.01" onChange={e => update({ coeff: Number(e.target.value) || 1, prix_ttc_manuel: null })}
                  style={{ width: 86, textAlign: "center", fontWeight: 800, color: "#6b4fd8", fontSize: 17, border: `1.5px solid ${COLORS.line}`, borderRadius: 12, padding: "9px", background: "#fffdf9", fontFamily: "inherit" }} />
                {[2.5, 3, 3.5, 4].map(c => (
                  <button key={c} onClick={() => update({ coeff: c, prix_ttc_manuel: null })}
                    style={{ border: `1.5px solid ${COLORS.line}`, background: "#fffdf9", borderRadius: 999, padding: "6px 13px", fontSize: 12.5, fontWeight: 700, color: COLORS.muted, cursor: "pointer", fontFamily: "inherit" }}>
                    x{c}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 6px" }}>Prix TTC : ajuste le coeff</label>
              <input type="number" step="0.5" value={ttc.toFixed(2)} onChange={e => update({ prix_ttc_manuel: Number(e.target.value) || 0 })}
                style={{ width: "100%", border: `1.5px solid ${COLORS.line}`, borderRadius: 12, padding: "11px 14px", fontSize: 15, background: "#fffdf9", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
            <div style={{ minWidth: 120 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 6px" }}>TVA</label>
              <select value={fiche.tva} onChange={e => update({ tva: Number(e.target.value) })}
                style={{ width: "100%", border: `1.5px solid ${COLORS.line}`, borderRadius: 12, padding: "11px 14px", fontSize: 15, background: "#fffdf9", fontFamily: "inherit" }}>
                <option value={10}>10 %</option><option value={20}>20 % (alcool)</option><option value={5.5}>5,5 %</option>
              </select>
            </div>
          </div>

          {/* Food cost bar */}
          <div style={{ marginTop: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: COLORS.muted, fontWeight: 700, alignItems: "center" }}>
              <span>FOOD COST <b style={{ color: fcCol === "ok" ? COLORS.ok : fcCol === "warn" ? COLORS.amber : COLORS.warn, fontSize: 15 }}>{fc.toFixed(0)} %</b></span>
              <span>objectif {fam.label} : {fam.objectif_fc} %</span>
            </div>
            <div style={{ height: 8, borderRadius: 99, background: "#eee6d7", overflow: "hidden", marginTop: 8 }}>
              <div style={{
                height: "100%", borderRadius: 99, transition: ".3s",
                width: `${Math.min(100, (fam.objectif_fc > 0 ? fc / fam.objectif_fc : 0) * 50)}%`,
                background: fcCol === "ok" ? COLORS.ok : fcCol === "warn" ? COLORS.amber : COLORS.warn,
              }} />
            </div>
          </div>
          </div>

          {/* Poids apres cuisson */}
          <div style={{ marginTop: 14, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, color: "#888" }}>Poids apres cuisson</span>
              <input type="number" step={10} min={0} value={fiche.cooked_weight_g ?? ""}
                onChange={e => update({ cooked_weight_g: e.target.value ? Number(e.target.value) : null })}
                placeholder="g" style={{ width: 80, padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${COLORS.line}`, fontSize: 14, fontWeight: 700, textAlign: "center" }} />
              <span style={{ fontSize: 12, color: "#999" }}>g</span>
            </div>
            {fiche.cooked_weight_g != null && fiche.cooked_weight_g > 0 && (() => {
              const wCru = fiche.lignes.reduce((a: number, l: LigneIngredient) => a + ligneWeightG(l), 0);
              const reduction = wCru > 0 ? ((1 - fiche.cooked_weight_g / wCru) * 100).toFixed(0) : 0;
              return <span style={{ fontSize: 12, color: COLORS.terra, fontWeight: 700 }}>Reduction : {reduction}%</span>;
            })()}
          </div>

          {/* Traiteur · prix au kilo : coût matière/kg, coeff et prix TTC/kg */}
          {(() => {
            const wCru = fiche.lignes.reduce((a: number, l: LigneIngredient) => a + ligneWeightG(l), 0)
              + (isPizza && fiche.paton_poids ? fiche.paton_poids : 0);
            const wRef = fiche.cooked_weight_g && fiche.cooked_weight_g > 0 ? fiche.cooked_weight_g : wCru;
            if (wRef <= 0 || totalCost <= 0) {
              return (
                <div style={{ marginTop: 18, background: "rgba(255,255,255,0.8)", borderRadius: 14, border: "1px dashed rgba(0,0,0,0.12)", padding: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>
                    Prix de vente · au kilo (traiteur)
                  </div>
                  <div style={{ fontSize: 12, color: "#aaa" }}>
                    Renseignez des quantites en g ou kg dans les ingredients pour calculer le cout matiere au kilo.
                  </div>
                </div>
              );
            }
            const coutKg = (totalCost / wRef) * 1000;
            const ttcKg = fiche.sell_price_per_kg;
            const coeffKg = ttcKg != null && ttcKg > 0 ? ttcKg / coutKg : null;
            const htKg = ttcKg != null ? ttcKg / (1 + fiche.tva / 100) : null;
            const margeKg = htKg != null ? htKg - coutKg : null;
            const conseilleKg = prixConseille(coutKg, fam.objectif_fc, fiche.tva);
            return (
              <div style={{ marginTop: 18, background: "rgba(255,255,255,0.8)", borderRadius: 14, border: "1px solid rgba(0,0,0,0.06)", padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: ".08em" }}>
                    Prix de vente · au kilo (traiteur)
                  </div>
                  <span style={{ fontSize: 11, color: "#aaa" }}>
                    Prix TTC/kg = cout/kg ({eur(coutKg)}) × coeff kilo · base {fiche.cooked_weight_g && fiche.cooked_weight_g > 0 ? "poids cuit" : "poids cru"} : {wRef >= 1000 ? `${(wRef / 1000).toFixed(2)} kg` : `${Math.round(wRef)} g`}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 12 }}>
                  <KPI label="Cout / kg" value={eur(coutKg)} color={COLORS.bordeaux} sub="matiere" />
                  <KPI label="Coeff kilo" value={coeffKg != null ? `x${coeffKg.toFixed(2)}` : "—"} color="#6b4fd8" sub="TTC / cout" />
                  <KPI label="Prix vente TTC / kg" value={ttcKg != null ? eur(ttcKg) : "—"} sub={htKg != null ? `${eur(htKg)} HT, TVA ${fiche.tva} %` : `TVA ${fiche.tva} %`} />
                  <KPI label="Marge brute / kg" value={margeKg != null ? eur(margeKg) : "—"} color={COLORS.ok} />
                </div>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div style={{ minWidth: 150 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 6px" }}>Coefficient kilo</label>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <input type="number" step="0.01"
                        value={coeffKgDraft ?? (coeffKg != null ? coeffKg.toFixed(2) : "")}
                        placeholder="x"
                        onFocus={() => setCoeffKgDraft(coeffKg != null ? String(Math.round(coeffKg * 100) / 100) : "")}
                        onChange={e => {
                          // Garder la frappe telle quelle et appliquer le prix en direct
                          setCoeffKgDraft(e.target.value);
                          const c = Number(e.target.value.replace(",", "."));
                          if (Number.isFinite(c) && c > 0) {
                            update({ sell_price_per_kg: Math.round(coutKg * c * 100) / 100 });
                          }
                        }}
                        onBlur={() => setCoeffKgDraft(null)}
                        style={{ width: 86, textAlign: "center", fontWeight: 800, color: "#6b4fd8", fontSize: 17, border: `1.5px solid ${COLORS.line}`, borderRadius: 12, padding: "9px", background: "#fffdf9", fontFamily: "inherit" }} />
                      {[2.5, 3, 3.5].map(c => (
                        <button key={c} onClick={() => update({ sell_price_per_kg: Math.round(coutKg * c * 100) / 100 })}
                          style={{ border: `1.5px solid ${COLORS.line}`, background: "#fffdf9", borderRadius: 999, padding: "6px 13px", fontSize: 12.5, fontWeight: 700, color: COLORS.muted, cursor: "pointer", fontFamily: "inherit" }}>
                          x{c}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 150 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 6px" }}>Prix TTC / kg : ajuste le coeff</label>
                    <input type="number" step="0.5" value={ttcKg ?? ""}
                      placeholder={conseilleKg > 0 ? conseilleKg.toFixed(2) : ""}
                      onChange={e => update({ sell_price_per_kg: e.target.value ? Number(e.target.value) : null })}
                      style={{ width: "100%", border: `1.5px solid ${COLORS.line}`, borderRadius: 12, padding: "11px 14px", fontSize: 15, background: "#fffdf9", fontFamily: "inherit", boxSizing: "border-box" }} />
                  </div>
                </div>
                {/* Food cost au kilo */}
                {htKg != null && htKg > 0 && (() => {
                  const fcKg = (coutKg / htKg) * 100;
                  const fcKgCol = fcColor(fcKg, fam.objectif_fc);
                  return (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: COLORS.muted, fontWeight: 700, alignItems: "center" }}>
                        <span>FOOD COST KILO <b style={{ color: fcKgCol === "ok" ? COLORS.ok : fcKgCol === "warn" ? COLORS.amber : COLORS.warn, fontSize: 15 }}>{fcKg.toFixed(0)} %</b></span>
                        <span>objectif {fam.label} : {fam.objectif_fc} %</span>
                      </div>
                      <div style={{ height: 8, borderRadius: 99, background: "#eee6d7", overflow: "hidden", marginTop: 8 }}>
                        <div style={{
                          height: "100%", borderRadius: 99, transition: ".3s",
                          width: `${Math.min(100, (fam.objectif_fc > 0 ? fcKg / fam.objectif_fc : 0) * 50)}%`,
                          background: fcKgCol === "ok" ? COLORS.ok : fcKgCol === "warn" ? COLORS.amber : COLORS.warn,
                        }} />
                      </div>
                    </div>
                  );
                })()}
                {conseilleKg > 0 && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12.5, color: COLORS.green, fontWeight: 700 }}>
                      Prix conseille (objectif {fam.objectif_fc} % de food cost) : {eur(conseilleKg)} TTC / kg
                    </span>
                    <button onClick={() => { update({ sell_price_per_kg: Math.round(conseilleKg * 100) / 100 }); showToast("Prix au kilo conseille applique"); }}
                      style={{ border: `1.5px solid ${COLORS.green}`, background: "transparent", color: COLORS.green, borderRadius: 999, padding: "6px 14px", fontSize: 11.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                      Appliquer
                    </button>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Lignes de prix multi-mode */}
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1.5px solid ${COLORS.line}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#8a6b3e", textTransform: "uppercase", letterSpacing: ".08em" }}>
                Tarifs de vente
              </label>
              <button onClick={() => update({ prix_lignes: [...fiche.prix_lignes, { mode: "portion", label: "", prix_ht: 0, tva: 10, coeff: fiche.coeff }] })}
                style={{ border: `1.5px dashed ${COLORS.terra}`, background: "transparent", color: COLORS.terraDark, borderRadius: 999, padding: "4px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                + Ajouter un tarif
              </button>
            </div>
            {fiche.prix_lignes.length === 0 && (
              <div style={{ fontSize: 12, color: "#bbb", fontStyle: "italic", marginBottom: 8 }}>Aucun tarif supplementaire. Utilisez le prix principal ci-dessus ou ajoutez des lignes.</div>
            )}
            {fiche.prix_lignes.map((pl, i) => {
              const ttc = pl.prix_ht * (1 + pl.tva / 100);
              return (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap", padding: "8px 10px", background: "rgba(255,255,255,0.6)", borderRadius: 10, border: `1px solid ${COLORS.line}` }}>
                  <select value={pl.mode} onChange={e => {
                    const next = [...fiche.prix_lignes]; next[i] = { ...pl, mode: e.target.value as PrixLigne["mode"] }; update({ prix_lignes: next });
                  }} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${COLORS.line}`, fontSize: 12, fontWeight: 600 }}>
                    <option value="portion">Portion</option>
                    <option value="kg">Kilo</option>
                    <option value="piece">Piece</option>
                    <option value="litre">Litre</option>
                    <option value="custom">Autre</option>
                  </select>
                  {pl.mode === "custom" && (
                    <input value={pl.label} onChange={e => { const next = [...fiche.prix_lignes]; next[i] = { ...pl, label: e.target.value }; update({ prix_lignes: next }); }}
                      placeholder="Label" style={{ width: 80, padding: "4px 8px", borderRadius: 6, border: `1px solid ${COLORS.line}`, fontSize: 12 }} />
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 11, color: "#888" }}>HT</span>
                    <input type="number" step={0.5} min={0} value={pl.prix_ht || ""}
                      onChange={e => { const next = [...fiche.prix_lignes]; next[i] = { ...pl, prix_ht: Number(e.target.value) || 0 }; update({ prix_lignes: next }); }}
                      style={{ width: 65, padding: "4px 8px", borderRadius: 6, border: `1px solid ${COLORS.line}`, fontSize: 13, fontWeight: 700, textAlign: "center" }} />
                    <span style={{ fontSize: 11, color: "#888" }}>€</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 11, color: "#888" }}>TVA</span>
                    <select value={pl.tva} onChange={e => { const next = [...fiche.prix_lignes]; next[i] = { ...pl, tva: Number(e.target.value) }; update({ prix_lignes: next }); }}
                      style={{ padding: "4px 6px", borderRadius: 6, border: `1px solid ${COLORS.line}`, fontSize: 11, fontWeight: 600 }}>
                      {[0, 5.5, 10, 20].map(v => <option key={v} value={v}>{v}%</option>)}
                    </select>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a" }}>{ttc.toFixed(2)}€ TTC</span>
                  <button onClick={() => { const next = fiche.prix_lignes.filter((_, j) => j !== i); update({ prix_lignes: next }); }}
                    style={{ border: "none", background: "rgba(220,38,38,0.08)", color: "#DC2626", width: 24, height: 24, borderRadius: 6, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>x</button>
                </div>
              );
            })}
          </div>

          {/* Liaison Popina — Bello Mio uniquement */}
          {etabSlug !== "piccola" && <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1.5px solid ${COLORS.line}` }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>
              Touche vente Popina
            </label>
            {linkedPopina ? (() => {
              const pp = popinaProducts.find(p => p.id === linkedPopina);
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f2f7f0", border: `1.5px solid #dfe8dc`, borderRadius: 12, padding: "10px 14px" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.green, flex: 1 }}>{pp?.name ?? "Produit lie"}</span>
                  <span style={{ fontSize: 12, color: COLORS.muted }}>{pp?.category} : {pp?.price_ttc?.toFixed(2)} {"\u20AC"}</span>
                  <button onClick={async () => {
                    if (linkedPopina) {
                      await supabase.from("popina_products").update({ kitchen_recipe_id: null, linked_type: null }).eq("id", linkedPopina);
                    }
                    setLinkedPopina(null);
                    showToast("Lien Popina retire");
                  }} style={{ border: "none", background: "#f7e3df", color: COLORS.warn, width: 26, height: 26, borderRadius: "50%", cursor: "pointer", fontWeight: 800, flexShrink: 0, fontFamily: "inherit" }}>x</button>
                </div>
              );
            })() : (
              <div style={{ position: "relative" }}>
                <input type="text" value={popinaSearch} placeholder="Chercher un produit Popina..."
                  onChange={e => { setPopinaSearch(e.target.value); setShowPopinaList(true); }}
                  onFocus={() => setShowPopinaList(true)}
                  onBlur={() => setTimeout(() => setShowPopinaList(false), 150)}
                  style={{ width: "100%", border: `1.5px solid ${COLORS.line}`, borderRadius: 12, padding: "11px 14px", fontSize: 14, background: "#fffdf9", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
                {showPopinaList && popinaSearch.trim().length >= 2 && (() => {
                  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                  const q = norm(popinaSearch);
                  const results = popinaProducts
                    .filter(p => norm(p.name).includes(q))
                    .sort((a, b) => (a.kitchen_recipe_id ? 1 : 0) - (b.kitchen_recipe_id ? 1 : 0))
                    .slice(0, 15);
                  return results.length > 0 ? (
                    <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#fff", border: `1.5px solid ${COLORS.line}`, borderRadius: 12, maxHeight: 220, overflowY: "auto", zIndex: 30, boxShadow: "0 12px 28px #00000020" }}>
                      {results.map(p => (
                        <div key={p.id} onMouseDown={async e => {
                          e.preventDefault();
                          if (fiche.id) {
                            // Detach from previous recipe if already linked
                            await supabase.from("popina_products").update({ kitchen_recipe_id: fiche.id, ingredient_id: null, linked_type: popinaLinkedType }).eq("id", p.id);
                          }
                          setLinkedPopina(p.id);
                          setPopinaSearch("");
                          setShowPopinaList(false);
                          showToast(`Lie a ${p.name}`);
                        }} style={{ padding: "9px 13px", cursor: "pointer" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#faf5ea"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#fff"; }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 13.5, fontWeight: 700 }}>{p.name}</span>
                            {p.kitchen_recipe_id && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "#f0ebe2", color: "#999" }}>deja lie</span>}
                          </div>
                          <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 1 }}>
                            {p.category} : {p.price_ttc?.toFixed(2)} {"\u20AC"} TTC
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "#fff", border: `1.5px solid ${COLORS.line}`, borderRadius: 12, padding: 12, zIndex: 30, boxShadow: "0 12px 28px #00000020" }}>
                      <span style={{ fontSize: 12.5, color: COLORS.muted, fontStyle: "italic" }}>Aucun produit Popina non lie trouve.</span>
                    </div>
                  );
                })()}
              </div>
            )}
            {!linkedPopina && <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 4 }}>Associer cette fiche a un produit de la caisse Popina pour le suivi des ventes.</div>}
          </div>}

          {/* Bouton valider */}
          <div style={{ marginTop: 20, textAlign: "right" }}>
            <button onClick={() => { update({ statut: "validee" }); showToast("Fiche validee"); }}
              style={{ border: "none", borderRadius: 999, padding: "13px 28px", fontSize: 14.5, fontWeight: 800, cursor: "pointer", background: COLORS.green, color: "#fff", fontFamily: "inherit" }}>
              Valider la fiche
            </button>
          </div>
        </div>
      )}

      {/* ÉTAPE 5 : FICHE SALLE */}
      {step === 4 && (
        <div style={{ background: COLORS.card, borderRadius: 18, padding: "22px 24px", marginBottom: 14, boxShadow: "0 4px 14px #0000000a" }}>
          <h2 style={{ fontSize: 13, letterSpacing: ".15em", textTransform: "uppercase", color: COLORS.bordeaux, marginBottom: 16, fontWeight: 800 }}>
            5. Fiche de vente : salle
          </h2>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 6px" }}>Description carte</label>
              <textarea value={fiche.description} onChange={e => update({ description: e.target.value })} placeholder="Ex : Focaccia croustillante, burrata cremeuse des Pouilles..."
                style={{ width: "100%", border: `1.5px solid ${COLORS.line}`, borderRadius: 12, padding: "11px 14px", fontSize: 15, background: "#fffdf9", outline: "none", resize: "vertical", minHeight: 70, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
            <div style={{ flex: 1, minWidth: 150 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 6px" }}>Accord conseille</label>
              <input type="text" value={fiche.accord} onChange={e => update({ accord: e.target.value })} placeholder="Ex : Verre de Vermentino, Spritz Bello"
                style={{ width: "100%", border: `1.5px solid ${COLORS.line}`, borderRadius: 12, padding: "11px 14px", fontSize: 15, background: "#fffdf9", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
          </div>

          {/* Résumé */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "20px 0 6px", flexWrap: "wrap", gap: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: 0 }}>Resume cuisine pour la salle</label>
            <button onClick={() => { update({ resume_salle: resumeAuto(fiche.etapes), resume_manuel: false }); showToast("Resume regenere depuis les etapes"); }}
              style={{ border: `1.5px solid ${COLORS.line}`, background: "#fffdf9", borderRadius: 999, padding: "6px 13px", fontSize: 12.5, fontWeight: 700, color: COLORS.muted, cursor: "pointer", fontFamily: "inherit" }}>
              Regenerer depuis les etapes
            </button>
          </div>
          <textarea value={fiche.resume_salle} onChange={e => update({ resume_salle: e.target.value, resume_manuel: true })} placeholder="Genere automatiquement depuis les etapes de preparation"
            style={{ width: "100%", border: `1.5px solid ${COLORS.line}`, borderRadius: 12, padding: "11px 14px", fontSize: 15, background: "#fffdf9", outline: "none", resize: "vertical", minHeight: 56, fontFamily: "inherit", boxSizing: "border-box" }} />

          {/* Aperçu toggle */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "20px 0 6px", flexWrap: "wrap", gap: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: COLORS.muted, textTransform: "uppercase", letterSpacing: ".08em", margin: 0 }}>Apercu</label>
            <div style={{ display: "flex", gap: 4, background: COLORS.pill, borderRadius: 999, padding: 3 }}>
              <button onClick={() => setSalleView("salle")} style={{ border: "none", borderRadius: 999, padding: "6px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", background: salleView === "salle" ? COLORS.card : "transparent", color: salleView === "salle" ? COLORS.bordeaux : COLORS.muted, boxShadow: salleView === "salle" ? "0 2px 6px #00000012" : "none" }}>Vue salle</button>
              <button onClick={() => setSalleView("cuisine")} style={{ border: "none", borderRadius: 999, padding: "6px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", background: salleView === "cuisine" ? COLORS.card : "transparent", color: salleView === "cuisine" ? COLORS.bordeaux : COLORS.muted, boxShadow: salleView === "cuisine" ? "0 2px 6px #00000012" : "none" }}>Vue cuisine</button>
            </div>
          </div>

          {salleView === "salle" ? (
            <div style={{ border: `1.5px solid ${COLORS.line}`, borderRadius: 16, padding: "18px 20px", background: "#fffdf9" }}>
              <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", marginBottom: 4 }}>{fiche.nom || "Nouvelle recette"}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {[...actifs].map(a => <span key={a} style={{ border: "1px solid #f2c9c4", color: COLORS.warn, background: "#fdf0ee", borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 600 }}>{a}</span>)}
              </div>
              <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: COLORS.muted, fontWeight: 800, marginBottom: 4 }}>Composition</div>
              {fiche.lignes.filter(l => l.ingredient).map(l => (
                <div key={l.key} style={{ fontSize: 13, padding: "3px 0", display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 600 }}>{l.ingredient?.nom_court}</span>
                  <span style={{ color: COLORS.muted }}>{l.quantite} {l.unite}</span>
                </div>
              ))}
              {fiche.description && <div style={{ fontSize: 13.5, color: "#5b5346", marginTop: 10, lineHeight: 1.55 }}>{fiche.description}</div>}
              {fiche.resume_salle && <div style={{ fontSize: 12.5, color: COLORS.muted, marginTop: 10, lineHeight: 1.5, fontStyle: "italic", borderLeft: `3px solid ${COLORS.pill}`, paddingLeft: 10 }}>En cuisine : {fiche.resume_salle}</div>}
              {fiche.accord && <div style={{ fontSize: 12.5, marginTop: 8, color: COLORS.green, fontWeight: 700 }}>Accord : {fiche.accord}</div>}
            </div>
          ) : (
            <div style={{ border: `1.5px solid ${COLORS.line}`, borderRadius: 16, padding: "18px 20px", background: "#fffdf9" }}>
              <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: ".05em", textTransform: "uppercase", marginBottom: 12 }}>{fiche.nom || "Nouvelle recette"}</div>
              {isPizza && (
                <div style={{ fontSize: 12.5, color: COLORS.muted, marginBottom: 10 }}>
                  Paton : {fiche.paton_poids} g ({fiche.empatement}) : {eur(patonCost)}
                </div>
              )}
              {isPizza && fiche.lignes.some(l => l.zone === "avant_four" && l.ingredient) && (
                <>
                  <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: COLORS.muted, fontWeight: 800, margin: "8px 0 4px" }}>Avant four</div>
                  {fiche.lignes.filter(l => l.zone === "avant_four" && l.ingredient).map(l => (
                    <div key={l.key} style={{ fontSize: 13, padding: "3px 0", display: "flex", justifyContent: "space-between" }}>
                      <span>{l.ingredient?.nom_court}</span>
                      <span style={{ color: COLORS.muted }}>{l.quantite} {l.unite} : {eur(coutLigne(l))}</span>
                    </div>
                  ))}
                </>
              )}
              <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: COLORS.muted, fontWeight: 800, margin: "8px 0 4px" }}>
                {isPizza ? "Apres four" : isBar ? "Composition" : "Ingredients"}
              </div>
              {fiche.lignes.filter(l => l.zone === "apres_four" && l.ingredient).map(l => (
                <div key={l.key} style={{ fontSize: 13, padding: "3px 0", display: "flex", justifyContent: "space-between" }}>
                  <span>{l.ingredient?.nom_court}</span>
                  <span style={{ color: COLORS.muted }}>{l.quantite} {l.unite} : {eur(coutLigne(l))}</span>
                </div>
              ))}
              <div style={{ borderTop: `1.5px solid ${COLORS.line}`, marginTop: 10, paddingTop: 8, display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 14 }}>
                <span>Cout total</span>
                <span style={{ color: COLORS.bordeaux }}>{eur(totalCost)}</span>
              </div>
              {fiche.etapes.filter(Boolean).length > 0 && (
                <>
                  <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: COLORS.muted, fontWeight: 800, margin: "14px 0 6px" }}>Preparation</div>
                  {fiche.etapes.filter(Boolean).map((e, i) => (
                    <div key={i} style={{ fontSize: 13, padding: "2px 0", display: "flex", gap: 8 }}>
                      <span style={{ color: COLORS.bordeaux, fontWeight: 800, flexShrink: 0 }}>{i + 1}.</span>
                      <span>{e}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Publier */}
          <div style={{ marginTop: 20, textAlign: "right" }}>
            <button disabled={fiche.statut === "brouillon"} onClick={() => {
              if (fiche.statut === "brouillon") { showToast("Validez d'abord la fiche a l'etape 4"); return; }
              update({ statut: "publiee" }); showToast("Publiee au catalogue, visible par la salle");
            }}
              style={{ border: "none", borderRadius: 999, padding: "13px 28px", fontSize: 14.5, fontWeight: 800, cursor: fiche.statut === "brouillon" ? "default" : "pointer", background: COLORS.bordeaux, color: "#fff", opacity: fiche.statut === "brouillon" ? 0.45 : 1, fontFamily: "inherit" }}>
              Publier au catalogue
            </button>
          </div>
        </div>
      )}

      {/* NAV */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
        {/* Row 1: main actions */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
          <button disabled={step === 0} onClick={() => setStep(s => {
              let prev = s - 1;
              if (prev === 3 && !canSeeMoney) prev = 2;
              return Math.max(0, prev);
            })}
            style={{ border: `1.5px solid ${COLORS.line}`, borderRadius: 999, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: step === 0 ? "default" : "pointer", background: "transparent", color: COLORS.muted, opacity: step === 0 ? 0.45 : 1, fontFamily: "inherit" }}>
            Retour
          </button>
          {canWrite && (
            <button disabled={saving} onClick={handleSave}
              style={{ border: `1.5px solid ${COLORS.green}`, borderRadius: 999, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", background: "#fff", color: COLORS.green, fontFamily: "inherit", opacity: saving ? 0.5 : 1 }}>
              {saving ? "..." : "Sauvegarder"}
            </button>
          )}
          <button onClick={() => {
              if (step < 4) {
                let next = step + 1;
                if (next === 3 && !canSeeMoney) next = 4;
                setStep(next);
              } else { handleSave(); router.push("/recettes"); }
            }}
            style={{ flex: 1, border: "none", borderRadius: 999, padding: "10px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer", background: COLORS.terra, color: "#fff", boxShadow: "0 6px 16px #c97b5b44", fontFamily: "inherit" }}>
            {step === 4 ? "Terminer" : "Continuer"}
          </button>
        </div>
        {/* Row 2: secondary actions */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => {
              if (confirm("Quitter sans sauvegarder ?")) { clearDraft(); router.push("/recettes"); }
            }}
            style={{ border: `1.5px solid ${COLORS.line}`, borderRadius: 999, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", background: "transparent", color: COLORS.muted, fontFamily: "inherit" }}>
            Annuler
          </button>
          {fiche.id && canWrite && (
            <button onClick={async () => {
                if (!confirm(`Supprimer la recette "${fiche.nom}" ?`)) return;
                await supabase.from("kitchen_recipe_lines").delete().eq("recipe_id", fiche.id!);
                await supabase.from("kitchen_recipes").delete().eq("id", fiche.id!);
                clearDraft();
                router.push("/recettes");
              }}
              style={{ border: `1.5px solid ${COLORS.warn}`, borderRadius: 999, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", background: "transparent", color: COLORS.warn, fontFamily: "inherit" }}>
              Supprimer
            </button>
          )}
          {fiche.id && (
            <>
              <button onClick={() => openApiFile(`/api/recettes/pdf?id=${fiche.id}`)}
                style={{ border: `1.5px solid ${COLORS.line}`, borderRadius: 999, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", background: "#fff", color: COLORS.muted, fontFamily: "inherit" }}>
                PDF
              </button>
              <button onClick={() => {
                const n = prompt("Nombre de portions / personnes ?", String(fiche.portions > 1 ? fiche.portions : 10));
                if (!n) return;
                const p = parseInt(n);
                if (p > 0) openApiFile(`/api/recettes/pdf?id=${fiche.id}&portions=${p}`);
              }}
                style={{ border: `1.5px solid ${COLORS.line}`, borderRadius: 999, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", background: "#fff", color: COLORS.muted, fontFamily: "inherit" }}>
                PDF Prod.
              </button>
            </>
          )}
        </div>
      </div>

      {/* TOAST */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)",
          background: COLORS.ink, color: "#fff", borderRadius: 999, padding: "11px 24px",
          fontSize: 13.5, fontWeight: 700, zIndex: 50,
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Composant ligne ingrédient ──
function IngredientRow({ ligne, mercuriale, onChange, onDelete }: {
  ligne: LigneIngredient;
  mercuriale: IngredientRef[];
  onChange: (l: LigneIngredient) => void;
  onDelete: () => void;
}) {
  const [search, setSearch] = useState(ligne.ingredient?.nom_court ?? "");
  const [showList, setShowList] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const filtered = useMemo(() => {
    const q = norm(search);
    if (!q) return mercuriale.slice(0, 30);
    return mercuriale.filter(m => norm(m.nom_court).includes(q) || norm(m.nom_produit).includes(q)).slice(0, 30);
  }, [search, mercuriale]);

  const cost = coutLigne(ligne);
  const compatUnits = ligne.ingredient ? unitsFor(ligne.ingredient.unite_base) : ["g"];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#faf5ea", borderRadius: 12, padding: "8px 10px", marginBottom: 8 }}>
      {/* Combobox */}
      <div ref={ref} style={{ position: "relative", flex: 2.4, minWidth: 150 }}>
        <input type="text" value={search} placeholder="Chercher un ingredient"
          onChange={e => { setSearch(e.target.value); setShowList(true); }}
          onFocus={() => { setSearch(ligne.ingredient?.nom_court ?? ""); setShowList(true); }}
          onBlur={() => setTimeout(() => setShowList(false), 150)}
          style={{ width: "100%", padding: "9px 12px", fontSize: 13.5, background: "#fff", fontWeight: 600, borderRadius: 10, border: `1.5px solid ${COLORS.line}`, outline: "none", boxSizing: "border-box" }}
        />
        {showList && (
          <div style={{
            position: "absolute", top: "calc(100% + 4px)", left: 0, right: -80, background: "#fff",
            border: `1.5px solid ${COLORS.line}`, borderRadius: 12, maxHeight: 230, overflowY: "auto",
            zIndex: 30, boxShadow: "0 12px 28px #00000020",
          }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 12, fontSize: 12.5, color: COLORS.muted, fontStyle: "italic" }}>Aucun ingredient trouve.</div>
            ) : filtered.map(m => (
              <div key={m.id} onMouseDown={e => {
                e.preventDefault();
                setSearch(m.nom_court);
                setShowList(false);
                onChange({ ...ligne, ingredient_id: m.id, ingredient: m, unite: m.unite_base });
              }} style={{ padding: "9px 13px", cursor: "pointer" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#faf5ea"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "#fff"; }}
              >
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{m.nom_court}</div>
                <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 1 }}>
                  {m.nom_produit} · <b style={{ color: COLORS.terraDark }}>{m.prix_base.toLocaleString("fr-FR")} {"\u20AC"} / {m.unite_base === "pc" ? "piece" : m.unite_base}</b>
                  {m.allergenes.length > 0 && ` · ${m.allergenes.join(", ")}`}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quantité */}
      <input type="number" value={ligne.quantite} min={0} step="any"
        onChange={e => onChange({ ...ligne, quantite: Number(e.target.value) || 0 })}
        style={{ width: 74, padding: "9px 6px", textAlign: "right", fontWeight: 700, background: "#fff", borderRadius: 10, border: `1.5px solid ${COLORS.line}`, fontSize: 13.5, outline: "none" }} />

      {/* Unité */}
      <select value={ligne.unite} onChange={e => onChange({ ...ligne, unite: e.target.value })}
        style={{ width: 74, padding: "9px 6px", fontSize: 13, background: "#fff", fontWeight: 700, color: COLORS.muted, borderRadius: 10, border: `1.5px solid ${COLORS.line}` }}>
        {compatUnits.map(u => <option key={u} value={u}>{UNITS[u].label}</option>)}
      </select>

      {/* Coût */}
      <span style={{ width: 72, textAlign: "right", fontSize: 13.5, fontWeight: 700, color: COLORS.terraDark }}>
        {eur(cost)}
      </span>

      {/* Supprimer */}
      <button onClick={onDelete} style={{ border: "none", background: "#f7e3df", color: COLORS.warn, width: 28, height: 28, borderRadius: "50%", cursor: "pointer", fontWeight: 800, flexShrink: 0 }}>x</button>
    </div>
  );
}

// ── KPI tile ──
function KPI({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 118, padding: "16px 10px", textAlign: "center", borderRight: `1.5px solid ${COLORS.line}` }}>
      <div style={{ fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", color: COLORS.muted, fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, color: color ?? COLORS.ink }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
