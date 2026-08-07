"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { supabase } from "@/lib/supabaseClient";
import { useEtablissement } from "@/lib/EtablissementContext";
import { useProfile } from "@/lib/ProfileContext";
import { calculerPate, type EmpatementType, type FlourMixItem, type PateResult } from "@/lib/pateEngine";
import { BottomSheet } from "@/components/layout/BottomSheet";
import { useBottomBarActions } from "@/lib/BottomBarContext";
import { useCategories, filterCategoriesForEtab } from "@/lib/useCategories";

// ── Types ────────────────────────────────────────────────────────────────────

type RecipeType = "pizza" | "cuisine" | "cocktail" | "vin" | "production" | "produit";
type MainFilter = "tous" | "pizza" | "cuisine" | "cocktail" | "vin" | "empatement" | "produit";
// "all" or any category id (built-in or custom-discovered)
type CuisineCatFilter = string;

type RecipeLine = {
  ingredient_id: string | null;
  ingredient_name: string;
  qty: number;
  unit: string;
};

type EmpData = {
  emp_type: EmpatementType;
  balls_count: number;
  ball_weight: number;
  hydration: number;   // percentage (e.g. 71)
  salt: number;        // percentage (e.g. 2.1)
  honey: number;
  oil: number;
  yeast: number;
  biga_yeast: number;
  flour_mix: FlourMixItem[];
};

type Recipe = {
  id: string;
  type: RecipeType;
  name: string;
  category: string | null;
  sous_categorie: string | null;
  fiche_type: string;
  photo_url: string | null;
  lines: RecipeLine[];
  steps: string[];
  pivot_ingredient_id: string | null;
  yield_info: string | null; // "8 portions" or "1200 g"
  portions_count: number | null;
  allergens: string[];
  metadata?: Record<string, unknown>;
  emp_data?: EmpData;
};

// ── Constants ────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<RecipeType, string> = {
  pizza: "#8B1A1A",
  cuisine: "#4a6741",
  cocktail: "#D4775A",
  vin: "#8a6b3e",
  production: "#6b5b3e",
  produit: "#8a6b3e",
};

const TYPE_LABELS: Record<RecipeType, string> = {
  pizza: "Pizza",
  cuisine: "Cuisine",
  cocktail: "Cocktail",
  vin: "Vin",
  production: "Production",
  produit: "Produit",
};

const PRODUIT_CATEGORIES = ["produit_vin", "produit_spiritueux", "produit_biere", "produit_soft", "produit_autre"] as const;

// Known cuisine sub-categories (stay under CUISINE group; anything else = top-level)
const CUISINE_SUBCATS = new Set(["entree", "plat_cuisine", "dessert", "accompagnement", "preparation", "sauce"]);
const PRODUIT_CAT_LABELS: Record<string, string> = {
  blanc: "Blanc",
  "rosé": "Rosé",
  rouge: "Rouge",
  orange: "Orange",
  produit_vin: "Vin",
  produit_spiritueux: "Spiritueux",
  produit_biere: "Biere",
  produit_soft: "Soft / Sans alcool",
  produit_autre: "Autre produit",
};

const CUISINE_CAT_LABELS: Record<string, string> = {
  preparation: "Préparation",
  sauce: "Sauce",
  entree: "Entrée",
  plat_cuisine: "Plat cuisiné",
  accompagnement: "Accompagnement",
  dessert: "Dessert",
  autre: "Autre",
  // Bar sub-categories (stored as kitchen_recipes with these categories)
  vin: "Vin",
  spiritueux: "Spiritueux",
  biere: "Biere",
  soft: "Soft",
  sirop: "Sirop",
  cocktail: "Cocktail",
};


const CUISINE_CAT_COLORS: Record<string, string> = {
  all: "#4a6741", plat_cuisine: "#B45309", preparation: "#7C3AED",
  entree: "#0284C7", sauce: "#DC2626", dessert: "#D4775A",
  accompagnement: "#16A34A", autre: "#6B7280",
  // Bar sub-categories
  cocktail: "#D4775A", vin: "#8a6b3e", spiritueux: "#6b5b3e",
  // Wine color categories
  blanc: "#c4a040", rosé: "#D4775A", rouge: "#8B1A1A", orange: "#c8720a",
  biere: "#B45309", soft: "#16A34A", sirop: "#7C3AED",
};

const WINE_COLOR_LABELS: Record<string, string> = {
  bollicine: "Bollicine", blanc: "Blanc", "rosé": "Rosé", orange: "Orange", rouge: "Rouge",
};
const WINE_COLOR_COLORS: Record<string, string> = {
  bollicine: "#c4a040", blanc: "#c4a040", "rosé": "#D4775A", orange: "#c8720a", rouge: "#8B1A1A",
};

function WineCardContent({ recipe, color }: { recipe: Recipe; color: string; }) {
  const m = recipe.metadata ?? {};
  const wineColor = String(m.color ?? "rouge");
  const wc = WINE_COLOR_COLORS[wineColor] ?? color;
  const fields: { label: string; value: string }[] = [];
  if (m.domaine) fields.push({ label: "Domaine", value: String(m.domaine) });
  if (m.region) fields.push({ label: "Region", value: String(m.region) });
  if (m.cepages) fields.push({ label: "Cepages", value: String(m.cepages) });
  if (m.descriptif) fields.push({ label: "Descriptif", value: String(m.descriptif) });
  if (m.accords) fields.push({ label: "Accords", value: String(m.accords) });
  if (m.anecdote) fields.push({ label: "Anecdote", value: String(m.anecdote) });

  return (
    <>
      {/* Color badge */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 6,
          background: wc + "15", color: wc, textTransform: "uppercase", letterSpacing: "0.06em",
        }}>
          {WINE_COLOR_LABELS[wineColor] ?? wineColor}
        </span>
        {m.sell_price != null && Number(m.sell_price) > 0 && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 6,
            background: "#f0ebe3", color: "#1a1a1a",
          }}>
            {Number(m.sell_price).toFixed(0)}{"\u20AC"}
          </span>
        )}
      </div>
      {/* Fields */}
      {fields.map((f, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <div style={{
            fontFamily: "DM Sans, sans-serif", fontSize: 10, fontWeight: 700,
            color: wc, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3,
          }}>
            {f.label}
          </div>
          <div style={{ fontSize: 13, color: "#333", lineHeight: 1.5 }}>
            {f.value}
          </div>
        </div>
      ))}
      {/* Edit link */}
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #ede6d9" }}>
        <a href={`/recettes/vin/${recipe.id.replace("wine-", "")}`} style={{
          fontSize: 12, fontWeight: 700, color, textDecoration: "none",
          display: "inline-flex", alignItems: "center", gap: 6,
        }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Modifier la fiche
        </a>
      </div>
    </>
  );
}

function fmtQty(v: number): string {
  if (v === 0) return "0";
  if (v >= 100) return Math.round(v).toLocaleString("fr-FR");
  if (v >= 10) return v.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  return v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
}

function parseJsonSteps(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === "string" && s.trim() !== "");
  if (typeof raw === "string") {
    try { const arr = JSON.parse(raw); if (Array.isArray(arr)) return arr.filter((s): s is string => typeof s === "string"); } catch { /* ignore */ }
    return raw.split("\n").filter(s => s.trim());
  }
  return [];
}

function parseAllergenArray(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") { try { return JSON.parse(raw); } catch { return []; } }
  return [];
}

function computeEmpResult(d: EmpData, countOverride?: number, weightOverride?: number): PateResult {
  return calculerPate({
    type: d.emp_type,
    nbPatons: countOverride ?? d.balls_count,
    poidsPaton: weightOverride ?? d.ball_weight,
    recipe: {
      hydration_total: d.hydration,
      salt_percent: d.salt,
      honey_percent: d.honey,
      oil_percent: d.oil,
      yeast_percent: d.yeast,
      biga_yeast_percent: d.biga_yeast,
    },
    flourMix: d.flour_mix,
  });
}

function phaseToLines(phase: PateResult["phases"][0]): RecipeLine[] {
  const lines: RecipeLine[] = [
    { ingredient_id: null, ingredient_name: "Farine", qty: phase.flour_g, unit: "g" },
    { ingredient_id: null, ingredient_name: "Eau", qty: phase.water_g, unit: "g" },
  ];
  if (phase.salt_g > 0) lines.push({ ingredient_id: null, ingredient_name: "Sel", qty: phase.salt_g, unit: "g" });
  if (phase.honey_g > 0) lines.push({ ingredient_id: null, ingredient_name: "Miel", qty: phase.honey_g, unit: "g" });
  if (phase.oil_g > 0) lines.push({ ingredient_id: null, ingredient_name: "Huile", qty: phase.oil_g, unit: "g" });
  if (phase.yeast_g > 0) lines.push({ ingredient_id: null, ingredient_name: "Levure", qty: phase.yeast_g, unit: "g" });
  return lines;
}

function resultToLines(r: PateResult): RecipeLine[] {
  const t = r.totals;
  const lines: RecipeLine[] = [
    { ingredient_id: null, ingredient_name: "Farine", qty: t.flour_total_g, unit: "g" },
    { ingredient_id: null, ingredient_name: "Eau", qty: t.water_g, unit: "g" },
  ];
  if (t.salt_g > 0) lines.push({ ingredient_id: null, ingredient_name: "Sel", qty: t.salt_g, unit: "g" });
  if (t.honey_g > 0) lines.push({ ingredient_id: null, ingredient_name: "Miel", qty: t.honey_g, unit: "g" });
  if (t.oil_g > 0) lines.push({ ingredient_id: null, ingredient_name: "Huile", qty: t.oil_g, unit: "g" });
  if (t.yeast_g > 0) lines.push({ ingredient_id: null, ingredient_name: "Levure", qty: t.yeast_g, unit: "g" });
  return lines;
}

// ── Data fetching ────────────────────────────────────────────────────────────

async function fetchAllRecipes(etabSlug: string | null): Promise<Recipe[]> {
  const recipes: Recipe[] = [];

  // Helper: filter by establishment
  const matchEstab = (establishments: string[] | null) => {
    if (!etabSlug) return true;
    if (!establishments || establishments.length === 0) return true;
    return establishments.includes(etabSlug);
  };

  // ── Pizza ──
  const { data: pizzas } = await supabase
    .from("kitchen_recipes")
    .select("id, name, photo_url, notes, pivot_ingredient_id, ball_weight_g, establishments, sous_categorie")
    .eq("category", "pizza")
    .order("name");
  const pizzaIds = (pizzas ?? []).map(p => p.id);
  const { data: pizzaIngs } = pizzaIds.length ? await supabase
    .from("kitchen_recipe_lines")
    .select("recipe_id, ingredient_id, qty, unit, sort_order, ingredients(name, allergens)")
    .in("recipe_id", pizzaIds)
    .order("sort_order") : { data: [] };

  for (const p of (pizzas ?? [])) {
    if (!matchEstab(p.establishments)) continue;
    const pIngs = (pizzaIngs ?? []).filter((i: Record<string, unknown>) => i.recipe_id === p.id);
    const allergenSet = new Set<string>();
    const lines: RecipeLine[] = pIngs.map((i: Record<string, unknown>) => {
      const ing = i.ingredients as Record<string, unknown> | null;
      for (const a of parseAllergenArray(ing?.allergens)) allergenSet.add(a);
      return { ingredient_id: (i.ingredient_id as string) ?? null, ingredient_name: (ing?.name as string) ?? "?", qty: Number(i.qty) || 0, unit: String(i.unit ?? "g") };
    });
    recipes.push({
      id: p.id, type: "pizza", name: p.name, category: null, sous_categorie: p.sous_categorie ?? null, fiche_type: "recette",
      photo_url: p.photo_url, lines, steps: parseJsonSteps(p.notes),
      pivot_ingredient_id: p.pivot_ingredient_id,
      yield_info: p.ball_weight_g ? `Pâton ${p.ball_weight_g} g` : null,
      portions_count: 1,
      allergens: [...allergenSet],
    });
  }

  // ── Cuisine ──
  const { data: kitchens } = await supabase
    .from("kitchen_recipes")
    .select("id, name, category, sous_categorie, fiche_type, metadata, photo_url, procedure, pivot_ingredient_id, yield_grams, portions_count, establishments")
    .eq("is_active", true)
    .order("name");
  const kitchenIds = (kitchens ?? []).map(k => k.id);
  const { data: kitchenIngs } = kitchenIds.length ? await supabase
    .from("kitchen_recipe_lines")
    .select("recipe_id, ingredient_id, qty, unit, sort_order, ingredients(name, allergens)")
    .in("recipe_id", kitchenIds)
    .order("sort_order") : { data: [] };

  for (const k of (kitchens ?? [])) {
    if (!matchEstab(k.establishments)) continue;
    // Skip if category is "preparation" — those go to Production section below
    if (k.category === "preparation") continue;
    // Skip pizzas — already loaded in the Pizza section above
    if (k.category === "pizza") continue;
    const isProduit = k.category?.startsWith("produit_");
    const isCocktail = k.category === "cocktail";
    const kIngs = (kitchenIngs ?? []).filter((i: Record<string, unknown>) => i.recipe_id === k.id);
    const allergenSet = new Set<string>();
    const lines: RecipeLine[] = kIngs.map((i: Record<string, unknown>) => {
      const ing = i.ingredients as Record<string, unknown> | null;
      for (const a of parseAllergenArray(ing?.allergens)) allergenSet.add(a);
      const rawUnit = String(i.unit ?? "g");
      let qty = Number(i.qty) || 0;
      let unit = rawUnit;
      if (rawUnit === "ml") { qty = qty / 10; unit = "cL"; }
      return { ingredient_id: (i.ingredient_id as string) ?? null, ingredient_name: (ing?.name as string) ?? "?", qty, unit };
    });
    let yieldInfo: string | null = null;
    if (k.portions_count) yieldInfo = `${k.portions_count} portion${k.portions_count > 1 ? "s" : ""}`;
    else if (k.yield_grams) yieldInfo = `${k.yield_grams} g`;
    recipes.push({
      id: k.id, type: isProduit ? "produit" : isCocktail ? "cocktail" : "cuisine", name: k.name, category: k.category, sous_categorie: k.sous_categorie ?? null,
      fiche_type: k.fiche_type ?? (isCocktail ? "cocktail" : "recette"),
      metadata: (k.metadata as Record<string, unknown>) ?? {},
      photo_url: k.photo_url, lines, steps: parseJsonSteps(k.procedure),
      pivot_ingredient_id: k.pivot_ingredient_id, yield_info: yieldInfo,
      portions_count: k.portions_count ?? null,
      allergens: [...allergenSet],
    });
  }

  // ── Vins ──
  const { data: wines } = await supabase
    .from("wines")
    .select("id, name, domaine, region, cepages, color, accords, descriptif, anecdote, sell_price, establishments")
    .order("name");

  for (const w of (wines ?? [])) {
    if (!matchEstab(w.establishments)) continue;
    recipes.push({
      id: `wine-${w.id}`, type: "vin", name: w.name, category: null, sous_categorie: null, fiche_type: "vin",
      photo_url: null, lines: [], steps: [],
      pivot_ingredient_id: null,
      yield_info: w.domaine ? `${w.domaine}` : null,
      portions_count: null,
      allergens: [],
      metadata: { domaine: w.domaine, region: w.region, cepages: w.cepages, color: w.color, accords: w.accords, descriptif: w.descriptif, anecdote: w.anecdote, sell_price: w.sell_price },
    });
  }

  // ── Production (prep_recipes + kitchen_recipes with category "preparation") ──
  const { data: preps } = await supabase
    .from("prep_recipes")
    .select("id, name, photo_url, procedure, pivot_ingredient_id, yield_grams, establishments")
    .order("name");
  const prepIds = (preps ?? []).map(p => p.id);
  const { data: prepIngs } = prepIds.length ? await supabase
    .from("prep_recipe_lines")
    .select("recipe_id, ingredient_id, qty, unit, sort_order, ingredients(name, allergens)")
    .in("recipe_id", prepIds)
    .order("sort_order") : { data: [] };

  for (const p of (preps ?? [])) {
    if (!matchEstab(p.establishments)) continue;
    const pIngs = (prepIngs ?? []).filter((i: Record<string, unknown>) => i.recipe_id === p.id);
    const allergenSet = new Set<string>();
    const lines: RecipeLine[] = pIngs.map((i: Record<string, unknown>) => {
      const ing = i.ingredients as Record<string, unknown> | null;
      for (const a of parseAllergenArray(ing?.allergens)) allergenSet.add(a);
      const rawUnit = String(i.unit ?? "g");
      let qty = Number(i.qty) || 0;
      let unit = rawUnit;
      if (rawUnit === "ml") { qty = qty / 10; unit = "cL"; }
      return { ingredient_id: (i.ingredient_id as string) ?? null, ingredient_name: (ing?.name as string) ?? "?", qty, unit };
    });
    recipes.push({
      id: `prep-${p.id}`, type: "production", name: p.name, category: "prep", sous_categorie: null, fiche_type: "recette",
      photo_url: p.photo_url, lines, steps: parseJsonSteps(p.procedure),
      pivot_ingredient_id: p.pivot_ingredient_id,
      yield_info: p.yield_grams ? `${p.yield_grams} g` : null,
      portions_count: null,
      allergens: [...allergenSet],
    });
  }

  // Kitchen recipes with category "preparation" → also production
  for (const k of (kitchens ?? [])) {
    if (!matchEstab(k.establishments)) continue;
    if (k.category !== "preparation") continue;
    const kIngs = (kitchenIngs ?? []).filter((i: Record<string, unknown>) => i.recipe_id === k.id);
    const allergenSet = new Set<string>();
    const lines: RecipeLine[] = kIngs.map((i: Record<string, unknown>) => {
      const ing = i.ingredients as Record<string, unknown> | null;
      for (const a of parseAllergenArray(ing?.allergens)) allergenSet.add(a);
      const rawUnit = String(i.unit ?? "g");
      let qty = Number(i.qty) || 0;
      let unit = rawUnit;
      if (rawUnit === "ml") { qty = qty / 10; unit = "cL"; }
      return { ingredient_id: (i.ingredient_id as string) ?? null, ingredient_name: (ing?.name as string) ?? "?", qty, unit };
    });
    recipes.push({
      id: k.id, type: "production", name: k.name, category: "preparation", sous_categorie: null, fiche_type: "recette",
      photo_url: k.photo_url, lines, steps: parseJsonSteps(k.procedure),
      pivot_ingredient_id: k.pivot_ingredient_id,
      yield_info: k.yield_grams ? `${k.yield_grams} g` : null,
      portions_count: null,
      allergens: [...allergenSet],
    });
  }

  // ── Empâtement ──
  const { data: empatements } = await supabase
    .from("recipes")
    .select("id, name, type, balls_count, ball_weight, flour_mix, hydration_total, salt_percent, honey_percent, oil_percent, yeast_percent, biga_yeast_percent, procedure, pivot_ingredient_id")
    .order("name");

  for (const e of (empatements ?? [])) {
    const bc = e.balls_count ?? 1;
    const bw = e.ball_weight ?? 250;
    const empType = (e.type === "biga" || e.type === "focaccia" ? e.type : "direct") as EmpatementType;
    let flourMix: FlourMixItem[] = [{ name: "Farine", percent: 100 }];
    if (e.flour_mix) {
      try {
        const parsed = typeof e.flour_mix === "string" ? JSON.parse(e.flour_mix) : e.flour_mix;
        if (Array.isArray(parsed) && parsed.length > 0) flourMix = parsed;
      } catch { /* ignore */ }
    }
    const empData: EmpData = {
      emp_type: empType,
      balls_count: bc, ball_weight: bw,
      hydration: e.hydration_total ?? 60,
      salt: e.salt_percent ?? 2.5,
      honey: e.honey_percent ?? 0,
      oil: e.oil_percent ?? 0,
      yeast: e.yeast_percent ?? 0.3,
      biga_yeast: e.biga_yeast_percent ?? 0.5,
      flour_mix: flourMix,
    };
    const result = computeEmpResult(empData);
    const lines = resultToLines(result);

    recipes.push({
      id: `emp-${e.id}`, type: "production", name: e.name, category: "empatement", sous_categorie: null, fiche_type: "empatement",
      photo_url: null, lines, steps: parseJsonSteps(e.procedure),
      pivot_ingredient_id: e.pivot_ingredient_id,
      yield_info: `${bc} pâton${bc > 1 ? "s" : ""} × ${bw} g`,
      portions_count: null,
      allergens: ["gluten"],
      emp_data: empData,
    });
  }

  return recipes;
}

// ── Component ────────────────────────────────────────────────────────────────

export function CatalogueContent() {
  const { current: etab, etablissements } = useEtablissement();
  const resolvedEtab = etab ?? etablissements?.[0] ?? null;
  const etabSlug = resolvedEtab?.slug ?? null;
  const { can } = useProfile();
  const canWrite = can("operations.edit_recettes");
  const { categories: allDbCategories } = useCategories();
  const dbCategories = useMemo(() => filterCategoriesForEtab(allDbCategories, etab?.slug), [allDbCategories, etab?.slug]);

  // Build dynamic label/color maps from DB categories
  const dynamicCatLabels = useMemo(() => {
    const map: Record<string, string> = { ...CUISINE_CAT_LABELS };
    for (const c of dbCategories) map[c.slug] = c.nom;
    return map;
  }, [dbCategories]);

  const dynamicCatColors = useMemo(() => {
    const map: Record<string, string> = { ...CUISINE_CAT_COLORS };
    for (const c of dbCategories) map[c.slug] = c.couleur;
    return map;
  }, [dbCategories]);

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [mainFilter] = useState<MainFilter>("tous");
  const [cuisineCatFilter] = useState<CuisineCatFilter>("all");
  const [prodFilter] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [showNewCatModal, setShowNewCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [showNewSubCatModal, setShowNewSubCatModal] = useState(false);
  const [newSubCatName, setNewSubCatName] = useState("");
  const [newSubCatType, setNewSubCatType] = useState("");

  // Pivot overrides: { recipeId: qty }
  const [pivotOverrides, setPivotOverrides] = useState<Record<string, number>>({});
  // Empâtement overrides: { recipeId: { count, weight } }
  const [empOverrides, setEmpOverrides] = useState<Record<string, { count?: number; weight?: number }>>({});
  // Portion overrides: { recipeId: count }
  const [portionOverrides, setPortionOverrides] = useState<Record<string, number>>({});

  // Pivot modal (any recipe with pivot or emp_data)
  const [modalRecipe, setModalRecipe] = useState<Recipe | null>(null);

  // Article de vente linking
  const [articleLinks, setArticleLinks] = useState<Map<string, string>>(new Map()); // recipeId → nom_vente
  const [availableArticles, setAvailableArticles] = useState<string[]>([]);
  const [articleSearch, setArticleSearch] = useState("");
  const [articleSaving, setArticleSaving] = useState(false);

  // Load articles_vente links for all recipes
  useEffect(() => {
    if (!etab) return;
    supabase
      .from("articles_vente")
      .select("recette_id,nom_vente")
      .eq("etablissement_id", etab.id)
      .not("recette_id", "is", null)
      .then(({ data }) => {
        const m = new Map<string, string>();
        for (const r of data ?? []) if (r.recette_id) m.set(r.recette_id, r.nom_vente);
        setArticleLinks(m);
      });
    // Load unique product names from ventes_lignes
    supabase
      .from("ventes_lignes")
      .select("description")
      .eq("etablissement_id", etab.id)
      .eq("type_ligne", "Produit")
      .eq("annule", false)
      .then(({ data }) => {
        const names = new Set<string>();
        for (const r of data ?? []) if (r.description) names.add(r.description);
        setAvailableArticles(Array.from(names).sort((a, b) => a.localeCompare(b, "fr")));
      });
  }, [etab]);

  const recipeTypeMap: Record<RecipeType, string> = { pizza: "pizza", cuisine: "kitchen", cocktail: "kitchen", vin: "wine", production: "kitchen", produit: "kitchen" };

  const linkArticle = async (recipe: Recipe, nomVente: string) => {
    if (!etab) return;
    setArticleSaving(true);
    // Upsert: delete existing link for this recipe, insert new
    await supabase.from("articles_vente").delete().eq("etablissement_id", etab.id).eq("recette_id", recipe.id);
    await supabase.from("articles_vente").upsert({
      etablissement_id: etab.id,
      nom_vente: nomVente,
      recette_type: recipeTypeMap[recipe.type],
      recette_id: recipe.id,
      source: "manual",
    }, { onConflict: "etablissement_id,nom_vente" });
    setArticleLinks(prev => { const m = new Map(prev); m.set(recipe.id, nomVente); return m; });
    setArticleSaving(false);
    setArticleSearch("");
  };

  const unlinkArticle = async (recipe: Recipe) => {
    if (!etab) return;
    setArticleSaving(true);
    await supabase.from("articles_vente").delete().eq("etablissement_id", etab.id).eq("recette_id", recipe.id);
    setArticleLinks(prev => { const m = new Map(prev); m.delete(recipe.id); return m; });
    setArticleSaving(false);
  };

  // Produit creation
  const [showProduitForm, setShowProduitForm] = useState(false);
  const [dupTarget, setDupTarget] = useState<Recipe | null>(null);
  const [dupCat, setDupCat] = useState("");
  const [dupSubCat, setDupSubCat] = useState("");
  const [editCatTarget, setEditCatTarget] = useState<Recipe | null>(null);
  const [editCatValue, setEditCatValue] = useState("");
  const [editSubCatValue, setEditSubCatValue] = useState("");
  const [produitName, setProduitName] = useState("");
  const [produitCat, setProduitCat] = useState("produit_vin");
  const [produitNotes, setProduitNotes] = useState("");
  const [produitSaving, setProduitSaving] = useState(false);

  const createProduit = async () => {
    if (!resolvedEtab || !produitName.trim()) return;
    setProduitSaving(true);
    const slug = resolvedEtab.slug?.includes("piccola") ? "piccola" : "bello_mio";
    const { error } = await supabase.from("kitchen_recipes").insert({
      name: produitName.trim(),
      category: produitCat,
      etablissement_id: resolvedEtab.id,
      establishments: [slug],
      is_active: true,
      is_draft: false,
      procedure: produitNotes.trim() ? JSON.stringify([produitNotes.trim()]) : null,
    });
    if (error) { alert(error.message); setProduitSaving(false); return; }
    setProduitName(""); setProduitNotes(""); setShowProduitForm(false); setProduitSaving(false);
    fetchAllRecipes(etabSlug).then(r => setRecipes(r));
  };

  useEffect(() => {
    fetchAllRecipes(etabSlug).then(r => { setRecipes(r); setLoading(false); });
  }, [etabSlug]);

  const filtered = useMemo(() => {
    let arr = recipes;
    // Main filter
    if (mainFilter === "pizza") arr = arr.filter(r => r.type === "pizza");
    else if (mainFilter === "cuisine") {
      arr = arr.filter(r => r.type === "cuisine");
      if (cuisineCatFilter !== "all") arr = arr.filter(r => r.category === cuisineCatFilter);
    }
    else if (mainFilter === "cocktail") arr = arr.filter(r => r.type === "cocktail");
    else if (mainFilter === "vin") arr = arr.filter(r => r.type === "vin");
    else if (mainFilter === "produit") arr = arr.filter(r => r.type === "produit");
    else if (mainFilter === "empatement") arr = arr.filter(r => r.type === "production" && r.category === "empatement");
    // Production toggle (preps only, not empâtement)
    if (prodFilter) arr = arr.filter(r => r.type === "production" && r.category !== "empatement");
    // Search
    if (q.trim()) {
      const low = q.toLowerCase();
      arr = arr.filter(r => r.name.toLowerCase().includes(low));
    }
    return arr;
  }, [recipes, mainFilter, cuisineCatFilter, prodFilter, q]);

  // Dynamic cuisine categories: base labels + any custom category actually
  // present in the data, sorted alphabetically by label.
  // Counts per main filter (independent of current filter)
  // Build a label for a cuisine category id (built-in or custom slug)
  const cuisineCatLabel = useCallback((id: string): string => {
    return dynamicCatLabels[id]
      ?? id.replace(/_/g, " ").replace(/\b\w/g, ch => ch.toUpperCase());
  }, [dynamicCatLabels]);

  // Group by type, then by category (cuisine categories sorted alphabetically)
  const groups = useMemo(() => {
    const map: Record<string, Recipe[]> = {};
    for (const r of filtered) {
      const key = r.category ? `${r.type}:${r.category}` : r.type;
      if (!map[key]) map[key] = [];
      map[key].push(r);
    }
    const typeOrder: RecipeType[] = ["pizza", "cuisine", "cocktail", "vin", "produit", "production"];
    const prodCatOrder = ["preparation", "prep", "empatement"];
    return Object.entries(map).sort(([a], [b]) => {
      const ta = a.split(":")[0];
      const tb = b.split(":")[0];
      const ia = typeOrder.indexOf(ta as RecipeType);
      const ib = typeOrder.indexOf(tb as RecipeType);
      if (ia !== ib) return ia - ib;
      const ca = a.includes(":") ? a.split(":")[1] : "";
      const cb = b.includes(":") ? b.split(":")[1] : "";
      if (ta === "production") {
        return prodCatOrder.indexOf(ca) - prodCatOrder.indexOf(cb);
      }
      // Cuisine (and any other type): alphabetical by label
      return cuisineCatLabel(ca).localeCompare(cuisineCatLabel(cb), "fr");
    });
  }, [filtered, cuisineCatLabel]);

  const toggleCat = useCallback((key: string) => {
    setOpenCats(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const toggleOpen = useCallback((id: string) => {
    setOpenId(prev => prev === id ? null : id);
  }, []);

  // Custom category order (persisted in localStorage)
  const SORT_KEY = `catalogue-cat-order-${etabSlug ?? "all"}`;
  const [catOrder, setCatOrder] = useState<string[]>([]);
  const [subCatOrders, setSubCatOrders] = useState<Record<string, string[]>>({});

  // Load saved order on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SORT_KEY);
      if (saved) setCatOrder(JSON.parse(saved));
      // Load sub-category orders
      const subOrders: Record<string, string[]> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(`${SORT_KEY}:subs:`)) {
          const type = k.replace(`${SORT_KEY}:subs:`, "");
          try { subOrders[type] = JSON.parse(localStorage.getItem(k) ?? "[]"); } catch { /* ignore */ }
        }
      }
      if (Object.keys(subOrders).length > 0) setSubCatOrders(subOrders);
    } catch { /* ignore */ }
  }, [SORT_KEY]);

  const groupLabel = useCallback((key: string): string => {
    const [type, cat] = key.split(":");
    if (!cat) return TYPE_LABELS[type as RecipeType] ?? type;
    if (type === "cuisine") return cuisineCatLabel(cat);
    if (type === "produit") return PRODUIT_CAT_LABELS[cat] ?? cat;
    if (cat === "empatement") return "Empâtement";
    if (cat === "prep" || cat === "preparation") return "Préparations";
    return cat;
  }, [cuisineCatLabel]);

  const groupColor = useCallback((key: string): string => {
    const type = key.split(":")[0] as RecipeType;
    return TYPE_COLORS[type] ?? "#1a1a1a";
  }, []);

  // Build nested groups: type → subGroups[]
  type SubGroup = { key: string; label: string; color: string; items: Recipe[] };
  type TypeGroup = { type: string; label: string; color: string; count: number; subGroups: SubGroup[]; isCustom?: boolean };

  const nestedGroups = useMemo((): TypeGroup[] => {
    const typeMap = new Map<string, SubGroup[]>();
    // Custom top-level categories (kitchen_recipes with non-standard category)
    const customTopLevel = new Map<string, Recipe[]>();

    for (const [key, items] of groups) {
      const [type, cat] = key.split(":");
      // If it's a cuisine recipe with a non-standard category → promote to top-level
      if (type === "cuisine" && cat && !CUISINE_SUBCATS.has(cat)) {
        const existing = customTopLevel.get(cat) ?? [];
        existing.push(...items);
        customTopLevel.set(cat, existing);
        continue;
      }
      const subs = typeMap.get(type) ?? [];
      const subColor = type === "cuisine" && cat ? (dynamicCatColors[cat] ?? CUISINE_CAT_COLORS[cat] ?? "#4a6741") : groupColor(key);

      // Split items by sous_categorie within each category
      const subCatMap = new Map<string, Recipe[]>();
      const noSubCat: Recipe[] = [];
      for (const r of items) {
        if (r.sous_categorie) {
          const arr = subCatMap.get(r.sous_categorie) ?? [];
          arr.push(r);
          subCatMap.set(r.sous_categorie, arr);
        } else {
          noSubCat.push(r);
        }
      }
      if (subCatMap.size > 0) {
        // Add sub-groups for each sous_categorie
        if (noSubCat.length > 0) {
          subs.push({ key: `${key}:_none`, label: cat ? groupLabel(key) : "", color: subColor, items: noSubCat });
        }
        for (const [sc, scItems] of subCatMap) {
          subs.push({ key: `${key}:${sc}`, label: sc, color: subColor, items: scItems });
        }
      } else {
        subs.push({ key, label: cat ? groupLabel(key) : "", color: subColor, items });
      }
      typeMap.set(type, subs);
    }

    const typeOrder: string[] = ["pizza", "cuisine", "cocktail", "vin", "produit", "production"];
    const result: TypeGroup[] = [];
    for (const [type, subs] of typeMap) {
      const color = TYPE_COLORS[type as RecipeType] ?? "#1a1a1a";
      const count = subs.reduce((s, g) => s + g.items.length, 0);
      const label = TYPE_LABELS[type as RecipeType] ?? type;
      result.push({ type, label, color, count, subGroups: subs });
    }

    // Add custom top-level categories
    const customColors = ["#8B6914", "#7C3AED", "#0284C7", "#C026D3", "#EA580C", "#16A34A", "#D97706"];
    let ci = 0;
    for (const [cat, items] of customTopLevel) {
      const color = customColors[ci % customColors.length];
      ci++;
      const label = cat.replace(/_/g, " ").replace(/\b\w/g, ch => ch.toUpperCase());
      result.push({ type: `custom:${cat}`, label, color, count: items.length, subGroups: [{ key: `cuisine:${cat}`, label: "", color, items }], isCustom: true });
    }

    // Add empty categories from DB that don't have recipes yet
    const existingTypes = new Set(result.map(r => r.type));
    for (const dbCat of dbCategories) {
      const typeKey = `custom:${dbCat.slug}`;
      if (!existingTypes.has(typeKey) && !existingTypes.has(dbCat.slug) && dbCat.famille_id !== "pizza") {
        // Check it's not already shown as a cuisine sub-category
        const isCuisineSub = result.some(r => r.subGroups.some(sg => sg.key === `cuisine:${dbCat.slug}`));
        if (!isCuisineSub) {
          result.push({ type: typeKey, label: dbCat.nom, color: dbCat.couleur || customColors[ci % customColors.length], count: 0, subGroups: [{ key: `cuisine:${dbCat.slug}`, label: "", color: dbCat.couleur || "#999", items: [] }], isCustom: true });
          ci++;
        }
      }
    }
    result.sort((a, b) => {
      const ia = typeOrder.indexOf(a.type);
      const ib = typeOrder.indexOf(b.type);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    // Apply custom order
    if (catOrder.length > 0) {
      const orderMap = new Map(catOrder.map((k, i) => [k, i]));
      result.sort((a, b) => {
        const ia = orderMap.get(a.type) ?? 999;
        const ib = orderMap.get(b.type) ?? 999;
        return ia - ib;
      });
    }

    // Apply sub-category orders
    for (const tg of result) {
      const subOrder = subCatOrders[tg.type];
      if (subOrder && subOrder.length > 0 && tg.subGroups.length > 1) {
        const orderMap = new Map(subOrder.map((k, i) => [k, i]));
        tg.subGroups.sort((a, b) => {
          const ia = orderMap.get(a.key) ?? 999;
          const ib = orderMap.get(b.key) ?? 999;
          return ia - ib;
        });
      }
    }

    return result;
  }, [groups, catOrder, subCatOrders, groupLabel, groupColor]);

  // Track open types separately
  const [openTypes, setOpenTypes] = useState<Set<string>>(new Set());
  const toggleType = useCallback((type: string) => {
    setOpenTypes(prev => { const n = new Set(prev); if (n.has(type)) n.delete(type); else n.add(type); return n; });
  }, []);

  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination || !canWrite) return;

    // Recipe drag between sub-groups
    if (result.type === "recipes") {
      const srcDropId = result.source.droppableId;
      const dstDropId = result.destination.droppableId;
      if (srcDropId === dstDropId && result.source.index === result.destination.index) return;

      const recipeId = result.draggableId;

      // Parse droppableId to extract category + sous_categorie
      // Format: "type:category" or "type:category:sous_cat" or "type:category:_none"
      const parseDrop = (dropId: string) => {
        const parts = dropId.split(":");
        const type = parts[0]; // "cuisine", "pizza", etc.
        const cat = parts[1] ?? "";
        const sc = parts[2];
        return {
          type,
          category: cat || type, // if no sub-cat split, category = type
          sous_categorie: sc && sc !== "_none" ? sc : null,
        };
      };

      const dst = parseDrop(dstDropId);

      // Update local state immediately
      setRecipes(prev => prev.map(r => {
        if (r.id !== recipeId) return r;
        return { ...r, category: dst.category, sous_categorie: dst.sous_categorie };
      }));

      // Update DB
      supabase
        .from("kitchen_recipes")
        .update({ category: dst.category, sous_categorie: dst.sous_categorie })
        .eq("id", recipeId)
        .then(({ error }) => {
          if (error) console.error("Failed to move recipe:", error);
        });
      return;
    }

    // Sub-category reorder
    if (result.type === "subcategories") {
      const parentType = result.source.droppableId.replace("subcats:", "");
      const group = nestedGroups.find(g => g.type === parentType);
      if (!group) return;
      if (result.source.index === result.destination.index) return;
      const subs = [...group.subGroups];
      const [moved] = subs.splice(result.source.index, 1);
      subs.splice(result.destination.index, 0, moved);
      // Persist sub-category order for this type
      const subKey = `${SORT_KEY}:subs:${parentType}`;
      const subOrder = subs.map(s => s.key);
      try { localStorage.setItem(subKey, JSON.stringify(subOrder)); } catch { /* ignore */ }
      // Force re-render by updating catOrder (triggers nestedGroups recompute)
      setSubCatOrders(prev => ({ ...prev, [parentType]: subOrder }));
      return;
    }

    // Category reorder (existing logic)
    if (result.source.index === result.destination.index) return;
    const keys = nestedGroups.map((g) => g.type);
    const [moved] = keys.splice(result.source.index, 1);
    keys.splice(result.destination.index, 0, moved);
    setCatOrder(keys);
    try { localStorage.setItem(SORT_KEY, JSON.stringify(keys)); } catch { /* ignore */ }
  }, [nestedGroups, SORT_KEY]);

  const handleDelete = useCallback(async (recipe: Recipe) => {
    if (!window.confirm(`Supprimer "${recipe.name}" ?\nCette action est irréversible.`)) return;
    try {
      if (recipe.type === "pizza") {
        await supabase.from("kitchen_recipe_lines").delete().eq("recipe_id", recipe.id);
        const { error } = await supabase.from("kitchen_recipes").delete().eq("id", recipe.id);
        if (error) throw error;
      } else if (recipe.type === "cuisine" || recipe.type === "produit") {
        await supabase.from("kitchen_recipe_lines").delete().eq("recipe_id", recipe.id);
        const { error } = await supabase.from("kitchen_recipes").delete().eq("id", recipe.id);
        if (error) throw error;
      } else if (recipe.type === "cocktail") {
        await supabase.from("kitchen_recipe_lines").delete().eq("recipe_id", recipe.id);
        const { error } = await supabase.from("kitchen_recipes").delete().eq("id", recipe.id);
        if (error) throw error;
      } else if (recipe.type === "vin") {
        const realId = recipe.id.replace(/^wine-/, "");
        const { error } = await supabase.from("wines").delete().eq("id", realId);
        if (error) throw error;
      } else if (recipe.type === "production") {
        if (recipe.category === "empatement") {
          const realId = recipe.id.replace(/^emp-/, "");
          await supabase.from("recipe_ingredients").delete().eq("recipe_id", realId);
          await supabase.from("recipe_phases").delete().eq("recipe_id", realId);
          await supabase.from("recipe_flours").delete().eq("recipe_id", realId);
          const { error } = await supabase.from("recipes").delete().eq("id", realId);
          if (error) throw error;
        } else if (recipe.category === "prep") {
          const realId = recipe.id.replace(/^prep-/, "");
          await supabase.from("prep_recipe_lines").delete().eq("recipe_id", realId);
          const { error } = await supabase.from("prep_recipes").delete().eq("id", realId);
          if (error) throw error;
        } else {
          // kitchen_recipes with category "preparation"
          await supabase.from("kitchen_recipe_lines").delete().eq("recipe_id", recipe.id);
          const { error } = await supabase.from("kitchen_recipes").delete().eq("id", recipe.id);
          if (error) throw error;
        }
      }
      setRecipes(prev => prev.filter(r => r.id !== recipe.id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`Erreur lors de la suppression : ${msg}`);
    }
  }, []);

  const handleDuplicate = useCallback((recipe: Recipe) => {
    setDupTarget(recipe);
    setDupCat(recipe.category ?? "plat_cuisine");
    setDupSubCat("");
  }, []);

  const confirmDuplicate = useCallback(async () => {
    if (!dupTarget) return;
    try {
      const { data: orig } = await supabase.from("kitchen_recipes").select("*").eq("id", dupTarget.id).single();
      if (!orig) return;
      const { id: _id, created_at: _ca, updated_at: _ua, ...rest } = orig;
      rest.name = `${rest.name} (copie)`;
      rest.category = dupCat || orig.category;
      rest.sous_categorie = dupSubCat || null;
      rest.statut = "brouillon";
      rest.in_catalogue = false;
      const { data: newRec } = await supabase.from("kitchen_recipes").insert(rest).select("id").single();
      if (newRec) {
        const { data: lines } = await supabase.from("kitchen_recipe_lines").select("*").eq("recipe_id", dupTarget.id);
        if (lines?.length) {
          await supabase.from("kitchen_recipe_lines").insert(lines.map(({ id: _i, recipe_id: _r, created_at: _c, updated_at: _u, ...l }: Record<string, unknown>) => ({ ...l, recipe_id: newRec.id })));
        }
      }
      setDupTarget(null);
      fetchAllRecipes(etabSlug).then(r => setRecipes(r));
    } catch (err) {
      alert(`Erreur duplication : ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [dupTarget, dupCat, dupSubCat, etabSlug]);

  // Register FAB in bottom bar for "produit" mode
  const produitAccent = TYPE_COLORS.produit;
  useBottomBarActions(() => canWrite && mainFilter === "produit" ? [{
    key: "new-produit", label: "Nouveau produit", accent: produitAccent,
    onClick: () => setShowProduitForm(true),
    icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>,
  }] : [], [canWrite, mainFilter, produitAccent]);

  return (
    <main className="container" style={{ paddingBottom: 80 }}>

        {/* ── Search + CTAs ── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
            <input
              type="search"
              placeholder="Rechercher une fiche..."
              value={q}
              onChange={e => setQ(e.target.value)}
              style={{
                width: "100%", padding: "8px 12px", borderRadius: 10,
                border: "1.5px solid #ddd6c8", background: "#fff", fontSize: 13,
                outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
          {canWrite && (
            <>
              <Link href="/fiche/new"
                style={{
                  padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                  border: "none", background: "#D4775A", color: "#fff",
                  cursor: "pointer", whiteSpace: "nowrap", textDecoration: "none", display: "inline-block",
                }}>
                + Nouvelle recette
              </Link>
              <button type="button" onClick={() => setShowNewCatModal(true)}
                style={{
                  padding: "8px 16px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                  border: "1.5px solid #4a6741", background: "#fff", color: "#4a6741",
                  cursor: "pointer", whiteSpace: "nowrap",
                }}>
                + Categorie
              </button>
            </>
          )}
        </div>

        {/* Loading */}
        {loading && <p style={{ textAlign: "center", color: "#999", padding: 40 }}>Chargement...</p>}

        {/* Empty */}
        {!loading && filtered.length === 0 && (
          <p style={{ textAlign: "center", color: "#999", padding: 40, fontSize: 14 }}>Aucune recette trouvée.</p>
        )}

        {/* Groups — nested accordion with drag & drop */}
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="catalogue-categories" type="categories">
            {(droppableProvided) => (
              <div ref={droppableProvided.innerRef} {...droppableProvided.droppableProps}>
        {nestedGroups.map((tg, groupIdx) => {
          const typeOpen = openTypes.has(tg.type);
          const hasSubs = tg.subGroups.length > 1 || (tg.subGroups.length === 1 && tg.subGroups[0].label);
          return (
            <Draggable key={tg.type} draggableId={tg.type} index={groupIdx} isDragDisabled={!canWrite}>
              {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.draggableProps}
              style={{ ...provided.draggableProps.style, marginBottom: 14 }}
            >
              {/* Type header */}
              <div
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "12px 14px", background: snapshot.isDragging ? "#f9f6f0" : "#fff",
                  border: snapshot.isDragging ? `2px solid ${tg.color}` : "1px solid #ede6d9",
                  boxShadow: snapshot.isDragging
                    ? `inset 4px 0 0 ${tg.color}, 0 8px 24px rgba(0,0,0,0.15)`
                    : `inset 4px 0 0 ${tg.color}, 0 1px 3px rgba(0,0,0,0.04)`,
                  borderRadius: 14, textAlign: "left", fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
              >
                <div
                  {...provided.dragHandleProps}
                  style={{
                    cursor: "grab", color: "#b0a894", flexShrink: 0,
                    touchAction: "none", padding: "10px 6px",
                    display: "flex", alignItems: "center",
                    WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none",
                  }}
                  title="Glisser pour réordonner"
                >
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="4" r="2"/><circle cx="16" cy="4" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="20" r="2"/><circle cx="16" cy="20" r="2"/></svg>
                </div>
                <div
                  onClick={() => toggleType(tg.type)}
                  style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
                >
                  <span style={{
                    fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 14, fontWeight: 800,
                    letterSpacing: "0.12em", textTransform: "uppercase", color: tg.color,
                  }}>
                    {tg.label}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 20,
                    background: `${tg.color}15`, color: tg.color,
                  }}>
                    {tg.count}
                  </span>
                  <span style={{
                    marginLeft: "auto", fontSize: 10, color: "#b0a894",
                    transition: "transform 0.2s",
                    transform: typeOpen ? "rotate(0)" : "rotate(-90deg)",
                  }}>
                    ▼
                  </span>
                </div>
                {/* Delete custom category */}
                {tg.isCustom && canWrite && (
                  <button type="button" onClick={async (e) => {
                    e.stopPropagation();
                    const cat = tg.type.replace("custom:", "");
                    if (!confirm(`Supprimer la catégorie "${tg.label}" et ses ${tg.count} recettes ?`)) return;
                    await supabase.from("kitchen_recipes").delete().eq("category", cat);
                    fetchAllRecipes(etabSlug).then(r => setRecipes(r));
                  }} style={{
                    width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(220,38,38,0.2)",
                    background: "rgba(220,38,38,0.06)", color: "#DC2626", cursor: "pointer",
                    flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  }} title="Supprimer cette catégorie">
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>
                  </button>
                )}
              </div>

              {/* Sub-groups or direct recipes */}
              {typeOpen && (
                <div style={{ marginTop: 6 }}>
                  {/* CTA + Sous-catégorie */}
                  {canWrite && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setNewSubCatType(tg.type); setShowNewSubCatModal(true); }}
                      style={{
                        padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                        border: `1.5px solid ${tg.color}40`, background: `${tg.color}08`, color: tg.color,
                        cursor: "pointer", marginBottom: 8,
                      }}
                    >
                      + Sous-categorie
                    </button>
                  )}
                  <Droppable droppableId={`subcats:${tg.type}`} type="subcategories">
                    {(subCatDropProvided) => (
                      <div ref={subCatDropProvided.innerRef} {...subCatDropProvided.droppableProps}>
                  {tg.subGroups.map((sg, sgIdx) => {
                    const subOpen = !hasSubs || openCats.has(sg.key);
                    return (
                      <Draggable key={sg.key} draggableId={`subcat:${sg.key}`} index={sgIdx} isDragDisabled={!canWrite || !hasSubs}>
                        {(sgDragProvided, sgDragSnap) => (
                      <div
                        ref={sgDragProvided.innerRef}
                        {...sgDragProvided.draggableProps}
                        style={{ ...sgDragProvided.draggableProps.style, marginBottom: hasSubs ? 8 : 0 }}
                      >
                        {/* Sub-category header (only if multiple sub-groups) */}
                        {hasSubs && (
                          <div
                            onClick={() => toggleCat(sg.key)}
                            style={{
                              display: "flex", alignItems: "center", gap: 10,
                              padding: "10px 18px", cursor: "pointer",
                              background: sgDragSnap.isDragging ? `${sg.color}15` : `${sg.color}08`, borderRadius: 10,
                              border: sgDragSnap.isDragging ? `2px solid ${sg.color}` : `1px solid ${sg.color}18`,
                              marginBottom: subOpen ? 6 : 0,
                              boxShadow: sgDragSnap.isDragging ? `0 6px 20px rgba(0,0,0,0.12)` : "none",
                            }}
                          >
                            <div
                              {...sgDragProvided.dragHandleProps}
                              style={{ cursor: "grab", color: "#ccc", flexShrink: 0, touchAction: "none", display: "flex", alignItems: "center", padding: "2px 4px" }}
                              onClick={e => e.stopPropagation()}
                              title="Glisser pour réordonner"
                            >
                              <svg width={12} height={12} viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="4" r="1.5"/><circle cx="16" cy="4" r="1.5"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="8" cy="20" r="1.5"/><circle cx="16" cy="20" r="1.5"/></svg>
                            </div>
                            <span style={{
                              width: 8, height: 8, borderRadius: "50%",
                              background: sg.color, flexShrink: 0,
                            }} />
                            <span style={{
                              fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 12, fontWeight: 700,
                              letterSpacing: "0.08em", textTransform: "uppercase", color: sg.color,
                            }}>
                              {sg.label}
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: sg.color, opacity: 0.6 }}>
                              {sg.items.length}
                            </span>
                            <span style={{
                              marginLeft: "auto", fontSize: 9, color: "#b0a894",
                              transition: "transform 0.2s",
                              transform: subOpen ? "rotate(0)" : "rotate(-90deg)",
                            }}>
                              ▼
                            </span>
                          </div>
                        )}

                        {/* Recipe rows — droppable zone */}
                        {subOpen && (
                          <Droppable droppableId={sg.key} type="recipes">
                            {(subDropProvided, subDropSnap) => (
                              <div
                                ref={subDropProvided.innerRef}
                                {...subDropProvided.droppableProps}
                                style={{
                                  minHeight: 4,
                                  borderRadius: 8,
                                  transition: "background 0.15s",
                                  background: subDropSnap.isDraggingOver ? `${tg.color}08` : "transparent",
                                  border: subDropSnap.isDraggingOver ? `1.5px dashed ${tg.color}40` : "1.5px dashed transparent",
                                  padding: subDropSnap.isDraggingOver ? 4 : 0,
                                }}
                              >
                          {sg.items.map((recipe, recipeIdx) => {
                          const color = tg.color;
                const isOpen = openId === recipe.id;
                const canProduce = !!recipe.emp_data
                  || (recipe.type === "pizza" || (recipe.type === "cuisine" && recipe.category !== "preparation"))
                  || !!recipe.pivot_ingredient_id;

                return (
                  <Draggable key={recipe.id} draggableId={recipe.id} index={recipeIdx} isDragDisabled={!canWrite}>
                    {(recDragProvided, recDragSnap) => (
                  <div
                    ref={recDragProvided.innerRef}
                    {...recDragProvided.draggableProps}
                    style={{ ...recDragProvided.draggableProps.style, marginBottom: 6, opacity: recDragSnap.isDragging ? 0.85 : 1 }}
                  >
                    {/* Row */}
                    <div
                      onClick={() => toggleOpen(recipe.id)}
                      style={{
                        padding: "12px 14px", background: recDragSnap.isDragging ? "#faf7f2" : "#fff",
                        border: recDragSnap.isDragging ? `2px solid ${color}` : "1px solid #ede6d9",
                        borderRadius: isOpen ? "12px 12px 0 0" : 12,
                        borderBottom: isOpen ? "1px solid #f2ede4" : recDragSnap.isDragging ? `2px solid ${color}` : "1px solid #ede6d9",
                        cursor: "pointer",
                        transition: "all 0.18s",
                        boxShadow: recDragSnap.isDragging ? `0 8px 24px rgba(0,0,0,0.15)` : "0 1px 2px rgba(0,0,0,0.02)",
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = `${color}40`; (e.currentTarget as HTMLElement).style.boxShadow = `0 2px 8px ${color}12`; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = isOpen ? "#f2ede4" : "#ede6d9"; (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 2px rgba(0,0,0,0.02)"; }}
                    >
                      {/* Line 1: Handle + Thumbnail + Name + Chevron */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        {canWrite && (
                          <div {...recDragProvided.dragHandleProps} style={{ cursor: "grab", color: "#ccc", flexShrink: 0, touchAction: "none", WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }} onClick={e => e.stopPropagation()}>
                            <svg width={12} height={12} viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="4" r="1.5"/><circle cx="16" cy="4" r="1.5"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="8" cy="20" r="1.5"/><circle cx="16" cy="20" r="1.5"/></svg>
                          </div>
                        )}
                        <div style={{
                          width: 36, height: 36, borderRadius: 8, flexShrink: 0, overflow: "hidden",
                          background: recipe.photo_url ? `url(${recipe.photo_url}) center/cover` : `linear-gradient(135deg, ${color}25 0%, ${color}10 100%)`,
                          display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${color}20`,
                        }}>
                          {!recipe.photo_url && <span style={{ fontSize: 12, fontWeight: 700, color: `${color}60`, fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>{initials(recipe.name)}</span>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, fontSize: 14, color: "#1a1a1a", textTransform: "uppercase", letterSpacing: "0.03em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {recipe.name}
                          </div>
                        </div>
                        <span style={{ fontSize: 10, color: "#b0a894", flexShrink: 0, transition: "transform 0.2s", transform: isOpen ? "rotate(180deg)" : "rotate(0)" }}>▼</span>
                      </div>

                      {/* Line 2: Meta + buttons */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", paddingLeft: canWrite ? 22 : 0 }}>
                        <span style={{ fontSize: 11, color: "#999" }}>
                          {recipe.type === "vin" ? (
                            <>
                              <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: (WINE_COLOR_COLORS[String(recipe.metadata?.color ?? "")] ?? "#8a6b3e") + "15", color: WINE_COLOR_COLORS[String(recipe.metadata?.color ?? "")] ?? "#8a6b3e", textTransform: "uppercase", marginRight: 3 }}>
                                {WINE_COLOR_LABELS[String(recipe.metadata?.color ?? "")] ?? ""}
                              </span>
                              {recipe.metadata?.domaine && String(recipe.metadata.domaine)}
                            </>
                          ) : (
                            <>{recipe.lines.length} ingr.{recipe.steps.length > 0 && ` · ${recipe.steps.length} et.`}{recipe.yield_info && ` · ${recipe.yield_info}`}</>
                          )}
                        </span>
                        <a href={recipe.type === "production" && recipe.category === "empatement" ? `/recettes/empatement/${recipe.id.replace(/^emp-/, "")}` : recipe.type === "pizza" ? `/recettes/pizza/${recipe.id}` : `/fiche/${recipe.id}`}
                          onClick={(e) => e.stopPropagation()}
                          style={{ padding: "2px 8px", borderRadius: 12, border: `1px solid ${color}30`, background: `${color}06`, color, fontSize: 10, fontWeight: 700, textDecoration: "none", flexShrink: 0 }}>
                          Fiche
                        </a>
                        {canProduce && <button type="button" onClick={(e) => { e.stopPropagation(); setModalRecipe(recipe); }} style={{ padding: "2px 8px", borderRadius: 12, border: "none", background: "rgba(45,106,79,0.1)", color: "#2D6A4F", fontSize: 10, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>Prod.</button>}
                        {recipe.allergens.length > 0 && (
                          <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                            {recipe.allergens.slice(0, 3).map(a => (<span key={a} style={{ fontSize: 7, fontWeight: 800, padding: "1px 4px", borderRadius: 3, background: "rgba(220,38,38,0.08)", color: "#DC2626" }}>{a.slice(0, 3).toUpperCase()}</span>))}
                            {recipe.allergens.length > 3 && <span style={{ fontSize: 7, color: "#999" }}>+{recipe.allergens.length - 3}</span>}
                          </div>
                        )}
                        {canWrite && <button type="button" onClick={(e) => { e.stopPropagation(); handleDuplicate(recipe); }} title="Dupliquer" style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid rgba(37,99,235,0.15)", background: "rgba(37,99,235,0.05)", color: "#2563EB", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>
                          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                        </button>}
                        {canWrite && <button type="button" onClick={(e) => { e.stopPropagation(); handleDelete(recipe); }} title="Supprimer" style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid rgba(220,38,38,0.15)", background: "rgba(220,38,38,0.05)", color: "#DC2626", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                        </button>}
                      </div>
                    </div>

                    {/* Expanded fiche */}
                    {isOpen && (
                      <div style={{
                        background: "#fff", borderRadius: "0 0 10px 10px",
                        padding: "16px 20px 20px", marginBottom: 4,
                        borderLeft: `3px solid ${color}`,
                      }}>
                        {recipe.type === "vin" ? (
                          <WineCardContent recipe={recipe} color={color} />
                        ) : (
                        <>
                        {/* Photo banner */}
                        {recipe.photo_url && (
                          <div style={{
                            width: "100%", height: 180, borderRadius: 10,
                            background: `url(${recipe.photo_url}) center/cover`,
                            marginBottom: 16,
                          }} />
                        )}

                        {/* Ingredients table */}
                        <div style={{
                          fontFamily: "DM Sans, sans-serif", fontSize: 13, fontWeight: 700,
                          color: color, textTransform: "uppercase", letterSpacing: "0.06em",
                          marginBottom: 8,
                        }}>
                          Ingrédients
                        </div>
                        <div style={{ marginBottom: 16 }}>
                          {recipe.lines.map((line, idx) => (
                              <div key={idx} style={{
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                padding: "8px 12px", borderRadius: 6,
                                background: idx % 2 === 0 ? "#faf7f2" : "transparent",
                              }}>
                                <span style={{ color: "#1a1a1a", fontWeight: 500, fontSize: 14 }}>
                                  {line.ingredient_name}
                                </span>
                                <span style={{
                                  fontWeight: 800, fontSize: 14, color: "#1a1a1a",
                                  fontVariantNumeric: "tabular-nums",
                                }}>
                                  {line.qty > 0 ? fmtQty(line.qty) : "—"} <span style={{ fontWeight: 500, color: "#999", fontSize: 12 }}>{line.unit}</span>
                                </span>
                              </div>
                          ))}
                        </div>

                        {/* Steps */}
                        {recipe.steps.length > 0 && (
                          <>
                            <div style={{
                              fontFamily: "DM Sans, sans-serif", fontSize: 13, fontWeight: 700,
                              color: color, textTransform: "uppercase", letterSpacing: "0.06em",
                              marginBottom: 8,
                            }}>
                              Procédé
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                              {recipe.steps.map((step, idx) => (
                                <div key={idx} style={{ display: "flex", gap: 10, fontSize: 14, lineHeight: 1.5 }}>
                                  <span style={{
                                    width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                                    background: `${color}15`, color, fontSize: 12, fontWeight: 800,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                  }}>
                                    {idx + 1}
                                  </span>
                                  <span style={{ color: "#333", paddingTop: 2 }}>{step}</span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}

                        {/* Yield + allergens footer */}
                        <div style={{
                          display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center",
                          paddingTop: 12, borderTop: "1px solid #ede6d9",
                        }}>
                          {recipe.yield_info && (
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6,
                              background: `${color}12`, color,
                            }}>
                              {recipe.yield_info}
                            </span>
                          )}
                          {recipe.allergens.map(a => (
                            <span key={a} style={{
                              fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                              background: "rgba(220,38,38,0.08)", color: "#DC2626",
                            }}>
                              {a}
                            </span>
                          ))}
                        </div>
                        </>
                        )}
                      </div>
                    )}
                  </div>
                    )}
                  </Draggable>
                );
              })}
                          {subDropProvided.placeholder}
                              </div>
                            )}
                          </Droppable>
                        )}
                      </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {subCatDropProvided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              )}
            </div>
            )}
            </Draggable>
          );
        })}
        {droppableProvided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

      {/* MODALE PIVOT */}
      {modalRecipe && (() => {
        const mColor = TYPE_COLORS[modalRecipe.type];
        const isEmp = !!modalRecipe.emp_data;

        // Empâtement: recalculate from pateEngine
        let displayLines = modalRecipe.lines;
        let hasChanged = false;
        let empYield = modalRecipe.yield_info;
        let empResult: PateResult | null = null;
        if (isEmp && modalRecipe.emp_data) {
          const ov = empOverrides[modalRecipe.id];
          const bc = ov?.count ?? modalRecipe.emp_data.balls_count;
          const bw = ov?.weight ?? modalRecipe.emp_data.ball_weight;
          hasChanged = bc !== modalRecipe.emp_data.balls_count || bw !== modalRecipe.emp_data.ball_weight;
          try { empResult = computeEmpResult(modalRecipe.emp_data, bc, bw); } catch { /* ignore */ }
          if (empResult) {
            displayLines = resultToLines(empResult);
            if (hasChanged) {
              empYield = `${bc} pâton${bc > 1 ? "s" : ""} × ${bw} g = ${fmtQty(bc * bw)} g`;
            }
          }
        }

        // Determine mode: pivot or portions
        const pivotLine = !isEmp && modalRecipe.pivot_ingredient_id
          ? modalRecipe.lines.find(l => l.ingredient_id === modalRecipe.pivot_ingredient_id) ?? null
          : null;
        const usePortionMode = !isEmp && !pivotLine && (modalRecipe.type === "pizza" || modalRecipe.type === "cuisine");
        const basePortions = modalRecipe.portions_count ?? 1;

        // Pivot mode
        const mPivotOverride = pivotOverrides[modalRecipe.id];
        const mBasePivot = pivotLine?.qty || 1;
        const pivotFactor = !isEmp && pivotLine && mPivotOverride != null && mPivotOverride > 0 ? mPivotOverride / mBasePivot : 1;
        if (!isEmp && pivotLine && pivotFactor !== 1) {
          displayLines = modalRecipe.lines.map(l => ({ ...l, qty: l.qty * pivotFactor }));
          hasChanged = true;
        }

        // Portion mode
        const mPortionOverride = portionOverrides[modalRecipe.id];
        const portionFactor = usePortionMode && mPortionOverride != null && mPortionOverride > 0 ? mPortionOverride / basePortions : 1;
        if (usePortionMode && portionFactor !== 1) {
          displayLines = modalRecipe.lines.map(l => ({ ...l, qty: l.qty * portionFactor }));
          hasChanged = true;
        }

        return (
          <div
            onClick={() => setModalRecipe(null)}
            style={{
              position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
              display: "flex", alignItems: "center", justifyContent: "center",
              zIndex: 1000, padding: 16,
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560,
                boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
                borderLeft: `5px solid ${mColor}`,
                maxHeight: "90vh", overflowY: "auto",
              }}
            >
              {/* Header */}
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "18px 20px 10px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {modalRecipe.photo_url && (
                    <div style={{
                      width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                      background: `url(${modalRecipe.photo_url}) center/cover`,
                      border: `1px solid ${mColor}20`,
                    }} />
                  )}
                  <div>
                    <div style={{
                      fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700,
                      fontSize: 20, color: mColor, textTransform: "uppercase",
                    }}>
                      {modalRecipe.name}
                    </div>
                    <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
                      {isEmp ? (empYield ?? "") : (modalRecipe.yield_info ?? "")}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setModalRecipe(null)}
                  style={{
                    width: 32, height: 32, borderRadius: 8, border: "none",
                    background: "rgba(0,0,0,0.06)", color: "#999", fontSize: 16,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Empâtement: pâtons + grammage */}
              {isEmp && modalRecipe.emp_data && (
                <div style={{ padding: "0 20px", marginBottom: 16 }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                    padding: "12px 16px", borderRadius: 12,
                    background: `${mColor}08`, border: `1.5px solid ${mColor}25`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: mColor }}>Pâtons</span>
                      <input
                        type="number"
                        value={empOverrides[modalRecipe.id]?.count ?? ""}
                        placeholder={String(modalRecipe.emp_data.balls_count)}
                        onChange={e => {
                          const v = e.target.value;
                          setEmpOverrides(prev => ({
                            ...prev,
                            [modalRecipe.id]: { ...prev[modalRecipe.id], count: v === "" ? undefined : parseInt(v) },
                          }));
                        }}
                        style={{
                          width: 80, height: 38, borderRadius: 10,
                          border: `2px solid ${mColor}40`, padding: "0 10px",
                          fontSize: 16, fontWeight: 800, textAlign: "center",
                          background: "#fff", color: "#1a1a1a", outline: "none",
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 16, color: "#ccc", fontWeight: 300 }}>×</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="number"
                        value={empOverrides[modalRecipe.id]?.weight ?? ""}
                        placeholder={String(modalRecipe.emp_data.ball_weight)}
                        onChange={e => {
                          const v = e.target.value;
                          setEmpOverrides(prev => ({
                            ...prev,
                            [modalRecipe.id]: { ...prev[modalRecipe.id], weight: v === "" ? undefined : parseInt(v) },
                          }));
                        }}
                        style={{
                          width: 80, height: 38, borderRadius: 10,
                          border: `2px solid ${mColor}40`, padding: "0 10px",
                          fontSize: 16, fontWeight: 800, textAlign: "center",
                          background: "#fff", color: "#1a1a1a", outline: "none",
                        }}
                      />
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#999" }}>g</span>
                    </div>
                    {hasChanged && (
                      <span style={{
                        fontSize: 13, fontWeight: 800, color: mColor, marginLeft: "auto",
                        padding: "4px 10px", borderRadius: 8, background: `${mColor}12`,
                      }}>
                        {fmtQty((empOverrides[modalRecipe.id]?.count ?? modalRecipe.emp_data.balls_count) * (empOverrides[modalRecipe.id]?.weight ?? modalRecipe.emp_data.ball_weight))} g
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Pivot mode: ingredient input */}
              {!isEmp && pivotLine && (
                <div style={{ padding: "0 20px", marginBottom: 16 }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                    padding: "12px 16px", borderRadius: 12,
                    background: "rgba(45,106,79,0.06)", border: "1.5px solid rgba(45,106,79,0.2)",
                  }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: "#D97706" }}>★</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#2D6A4F" }}>
                      {pivotLine.ingredient_name}
                    </span>
                    <input
                      type="number"
                      value={pivotOverrides[modalRecipe.id] ?? ""}
                      placeholder={String(pivotLine.qty)}
                      onChange={e => {
                        const v = e.target.value;
                        setPivotOverrides(prev => ({
                          ...prev,
                          [modalRecipe.id]: v === "" ? undefined as unknown as number : parseFloat(v),
                        }));
                      }}
                      style={{
                        width: 100, height: 38, borderRadius: 10,
                        border: "2px solid rgba(45,106,79,0.3)", padding: "0 12px",
                        fontSize: 16, fontWeight: 800, textAlign: "center",
                        background: "#fff", color: "#1a1a1a", outline: "none",
                      }}
                    />
                    <span style={{ fontSize: 13, color: "#999", fontWeight: 600 }}>{pivotLine.unit}</span>
                    {pivotFactor !== 1 && (
                      <span style={{
                        fontSize: 13, fontWeight: 800, color: "#2D6A4F", marginLeft: "auto",
                        padding: "4px 10px", borderRadius: 8, background: "rgba(45,106,79,0.1)",
                      }}>
                        × {pivotFactor.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Portion mode: pizza/cuisine without pivot */}
              {!isEmp && usePortionMode && (
                <div style={{ padding: "0 20px", marginBottom: 16 }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                    padding: "12px 16px", borderRadius: 12,
                    background: "rgba(45,106,79,0.06)", border: "1.5px solid rgba(45,106,79,0.2)",
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#2D6A4F" }}>
                      {modalRecipe.type === "pizza" ? "Pizzas" : "Portions"}
                    </span>
                    <input
                      type="number"
                      value={portionOverrides[modalRecipe.id] ?? ""}
                      placeholder={String(basePortions)}
                      onChange={e => {
                        const v = e.target.value;
                        setPortionOverrides(prev => ({
                          ...prev,
                          [modalRecipe.id]: v === "" ? undefined as unknown as number : parseFloat(v),
                        }));
                      }}
                      style={{
                        width: 80, height: 38, borderRadius: 10,
                        border: "2px solid rgba(45,106,79,0.3)", padding: "0 12px",
                        fontSize: 16, fontWeight: 800, textAlign: "center",
                        background: "#fff", color: "#1a1a1a", outline: "none",
                      }}
                    />
                    {portionFactor !== 1 && (
                      <span style={{
                        fontSize: 13, fontWeight: 800, color: "#2D6A4F", marginLeft: "auto",
                        padding: "4px 10px", borderRadius: 8, background: "rgba(45,106,79,0.1)",
                      }}>
                        × {portionFactor.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Ingredients — phases for biga, flat list for others */}
              <div style={{ padding: "0 20px" }}>
                {empResult && empResult.phases.length > 1 ? (
                  /* Biga: show each phase separately */
                  empResult.phases.map((phase, phIdx) => {
                    const pLines = phaseToLines(phase);
                    return (
                      <div key={phIdx} style={{ marginBottom: 16 }}>
                        <div style={{
                          fontSize: 12, fontWeight: 700, color: mColor,
                          textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8,
                        }}>
                          {phase.name}
                        </div>
                        {pLines.map((line, idx) => (
                          <div key={idx} style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            padding: "10px 14px", borderRadius: 8,
                            background: idx % 2 === 0 ? "#faf7f2" : "transparent",
                          }}>
                            <span style={{ color: "#1a1a1a", fontWeight: 500, fontSize: 15 }}>
                              {line.ingredient_name}
                            </span>
                            <span style={{
                              fontWeight: 800, fontSize: 16,
                              color: hasChanged ? "#D4775A" : "#1a1a1a",
                              fontVariantNumeric: "tabular-nums",
                            }}>
                              {line.qty > 0 ? fmtQty(line.qty) : "—"}
                              <span style={{ fontWeight: 500, color: "#999", fontSize: 12, marginLeft: 4 }}>g</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })
                ) : (
                  /* Single phase or standard pivot: flat list */
                  <>
                    <div style={{
                      fontSize: 12, fontWeight: 700, color: mColor,
                      textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8,
                    }}>
                      Ingrédients
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      {displayLines.map((line, idx) => (
                        <div key={idx} style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          padding: "10px 14px", borderRadius: 8,
                          background: idx % 2 === 0 ? "#faf7f2" : "transparent",
                        }}>
                          <span style={{ color: "#1a1a1a", fontWeight: 500, fontSize: 15, display: "flex", alignItems: "center", gap: 4 }}>
                            {pivotLine && line.ingredient_id === modalRecipe.pivot_ingredient_id && (
                              <span style={{ color: "#D97706", fontWeight: 800 }}>★</span>
                            )}
                            {line.ingredient_name}
                          </span>
                          <span style={{
                            fontWeight: 800, fontSize: 16,
                            color: hasChanged ? "#2D6A4F" : "#1a1a1a",
                            fontVariantNumeric: "tabular-nums",
                          }}>
                            {line.qty > 0 ? fmtQty(line.qty) : "—"}
                            <span style={{ fontWeight: 500, color: "#999", fontSize: 12, marginLeft: 4 }}>{line.unit}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Steps */}
              {modalRecipe.steps.length > 0 && (
                <div style={{ padding: "0 20px" }}>
                  <div style={{
                    fontSize: 12, fontWeight: 700, color: mColor,
                    textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8,
                  }}>
                    Procédé
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                    {modalRecipe.steps.map((step, idx) => (
                      <div key={idx} style={{ display: "flex", gap: 10, fontSize: 14, lineHeight: 1.5 }}>
                        <span style={{
                          width: 24, height: 24, borderRadius: "50%", flexShrink: 0,
                          background: `${mColor}15`, color: mColor, fontSize: 12, fontWeight: 800,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {idx + 1}
                        </span>
                        <span style={{ color: "#333", paddingTop: 2 }}>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Metadata (vin, boisson) */}
              {modalRecipe.metadata && Object.keys(modalRecipe.metadata).length > 0 && (
                <div style={{ padding: "0 20px 16px" }}>
                  <div style={{
                    fontSize: 12, fontWeight: 700, color: mColor,
                    textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10,
                  }}>
                    {modalRecipe.fiche_type === "vin" ? "Fiche vin" : "Details"}
                  </div>
                  <div style={{
                    display: "flex", flexDirection: "column", gap: 6,
                    padding: "14px 16px", borderRadius: 12,
                    background: modalRecipe.fiche_type === "vin" ? "rgba(138,107,62,0.06)" : "rgba(0,0,0,0.02)",
                    border: `1.5px solid ${modalRecipe.fiche_type === "vin" ? "rgba(138,107,62,0.15)" : "rgba(0,0,0,0.06)"}`,
                  }}>
                    {Object.entries(modalRecipe.metadata).filter(([, v]) => v && String(v).trim()).map(([key, val]) => {
                      const labels: Record<string, string> = {
                        domaine: "Domaine", region: "Region", cepage: "Cepage",
                        appellation: "Appellation", accords: "Accords", descriptif: "Descriptif",
                        anecdote: "Anecdote", temperature: "Temperature", millesime: "Millesime",
                        type_boisson: "Type", provenance: "Provenance", volume: "Volume",
                      };
                      return (
                        <div key={key} style={{ display: "flex", gap: 8, fontSize: 13, lineHeight: 1.5 }}>
                          <span style={{ fontWeight: 700, color: "#1a1a1a", minWidth: 90, flexShrink: 0 }}>
                            {labels[key] ?? key}
                          </span>
                          <span style={{ color: "#555" }}>{String(val)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Footer: allergens */}
              {modalRecipe.allergens.length > 0 && (
                <div style={{
                  padding: "12px 20px 18px",
                  borderTop: "1px solid #ede6d9",
                  display: "flex", gap: 8, flexWrap: "wrap",
                }}>
                  {modalRecipe.allergens.map(a => (
                    <span key={a} style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                      background: "rgba(220,38,38,0.08)", color: "#DC2626",
                    }}>
                      {a}
                    </span>
                  ))}
                </div>
              )}

              {/* Article de vente linking */}
              <div style={{
                padding: "14px 20px 18px",
                borderTop: "1px solid #ede6d9",
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: "#999",
                  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8,
                }}>
                  Article de vente (caisse)
                </div>
                {articleLinks.has(modalRecipe.id) ? (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px", borderRadius: 10,
                    background: "rgba(74,103,65,0.06)", border: "1.5px solid rgba(74,103,65,0.2)",
                  }}>
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#4a6741" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>
                      {articleLinks.get(modalRecipe.id)}
                    </span>
                    <button type="button" onClick={() => unlinkArticle(modalRecipe)} disabled={articleSaving} style={{
                      fontSize: 11, color: "#DC2626", background: "none", border: "none", cursor: "pointer", fontWeight: 600,
                    }}>
                      Retirer
                    </button>
                  </div>
                ) : (
                  <div>
                    <input
                      placeholder="Rechercher un article de la caisse..."
                      value={articleSearch}
                      onChange={e => setArticleSearch(e.target.value)}
                      style={{
                        width: "100%", padding: "9px 12px", borderRadius: 10,
                        border: "1.5px solid #e5ddd0", fontSize: 13, background: "#fff",
                        outline: "none", color: "#1a1a1a", boxSizing: "border-box",
                        marginBottom: 6,
                      }}
                    />
                    {articleSearch.length >= 2 && (() => {
                      const q = articleSearch.toLowerCase();
                      const matches = availableArticles.filter(a => a.toLowerCase().includes(q)).slice(0, 8);
                      if (matches.length === 0) return <div style={{ fontSize: 12, color: "#999", padding: "4px 0" }}>Aucun article trouve</div>;
                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 200, overflowY: "auto" }}>
                          {matches.map(name => (
                            <button key={name} type="button" onClick={() => linkArticle(modalRecipe, name)} disabled={articleSaving} style={{
                              textAlign: "left", padding: "8px 12px", borderRadius: 8,
                              border: "none", background: "transparent", cursor: "pointer",
                              fontSize: 13, color: "#1a1a1a",
                            }}
                            onMouseOver={e => { e.currentTarget.style.background = "#f5f0e8"; }}
                            onMouseOut={e => { e.currentTarget.style.background = "transparent"; }}
                            >
                              {name}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Nouveau produit BottomSheet ── */}
      <BottomSheet open={showProduitForm} onClose={() => setShowProduitForm(false)} title="Nouveau produit">
        <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "0 4px 8px" }}>
          <div>
            <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>Nom *</div>
            <input
              value={produitName}
              onChange={e => setProduitName(e.target.value)}
              placeholder="Ex: Chateau Margaux 2018"
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #e5ddd0", fontSize: 14, background: "#fff", outline: "none", boxSizing: "border-box" }}
              autoFocus
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>Type</div>
            <select
              value={produitCat}
              onChange={e => setProduitCat(e.target.value)}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #e5ddd0", fontSize: 14, background: "#fff", cursor: "pointer", boxSizing: "border-box" }}
            >
              {PRODUIT_CATEGORIES.map(c => (
                <option key={c} value={c}>{PRODUIT_CAT_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>Notes / Description</div>
            <textarea
              value={produitNotes}
              onChange={e => setProduitNotes(e.target.value)}
              placeholder="Cepage, region, temperature de service..."
              rows={3}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #e5ddd0", fontSize: 14, background: "#fff", outline: "none", resize: "vertical", boxSizing: "border-box" }}
            />
          </div>
          <button
            type="button"
            onClick={createProduit}
            disabled={produitSaving || !produitName.trim()}
            style={{
              width: "100%", padding: "12px 0", borderRadius: 10, border: "none",
              background: TYPE_COLORS.produit, color: "#fff", fontSize: 14, fontWeight: 700,
              cursor: produitSaving || !produitName.trim() ? "not-allowed" : "pointer",
              opacity: produitSaving || !produitName.trim() ? 0.5 : 1,
            }}
          >
            {produitSaving ? "..." : "Creer la fiche produit"}
          </button>
        </div>
      </BottomSheet>

      {/* ── Nouvelle catégorie BottomSheet ── */}
      {/* ── Edit category modal ── */}
      {editCatTarget && (
        <div onClick={() => setEditCatTarget(null)} style={{
          position: "fixed", inset: 0, zIndex: 300,
          background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "#fff", borderRadius: 16, padding: 24, maxWidth: 420, width: "100%",
            boxShadow: "0 20px 60px rgba(0,0,0,0.25)", border: "1px solid #e0d8ce",
          }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px", color: "#1a1a1a" }}>
              {editCatTarget.name}
            </h3>
            <p style={{ fontSize: 12, color: "#999", margin: "0 0 16px" }}>Modifier la categorie et la sous-categorie</p>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 4px" }}>Categorie</label>
            <select value={editCatValue} onChange={e => setEditCatValue(e.target.value)}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #ddd6c8", fontSize: 13, marginBottom: 12, fontFamily: "inherit", boxSizing: "border-box" }}>
              <option value="pizza">Pizza</option>
              {Object.entries(CUISINE_CAT_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
              {[...new Set(recipes.map(r => r.category ?? "").filter(c => c && c !== "pizza" && !(c in CUISINE_CAT_LABELS)))].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 4px" }}>Sous-categorie</label>
            <input type="text" value={editSubCatValue} onChange={e => setEditSubCatValue(e.target.value)} placeholder="Facultatif"
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #ddd6c8", fontSize: 13, marginBottom: 16, fontFamily: "inherit", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setEditCatTarget(null)} style={{ padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, background: "#f5f0e8", color: "#666", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
              <button onClick={async () => {
                const table = editCatTarget.type === "production" ? "kitchen_recipes" : "kitchen_recipes";
                const realId = editCatTarget.id.replace(/^(prep-|emp-)/, "");
                await supabase.from(table).update({ category: editCatValue, sous_categorie: editSubCatValue.trim() || null }).eq("id", realId);
                setEditCatTarget(null);
                fetchAllRecipes(etabSlug).then(r => setRecipes(r));
              }} style={{ padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 700, background: "#D4775A", color: "#fff", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      <BottomSheet open={showNewCatModal} onClose={() => setShowNewCatModal(false)} title="Nouvelle categorie">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="text"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="Nom de la categorie (ex: Brunch, Street Food...)"
            style={{
              width: "100%", padding: "10px 12px", borderRadius: 8,
              border: "1.5px solid #ddd6c8", fontSize: 13, outline: "none",
              boxSizing: "border-box",
            }}
          />
          <button
            type="button"
            disabled={!newCatName.trim()}
            onClick={async () => {
              if (!resolvedEtab || !newCatName.trim()) return;
              const slug = newCatName.trim().toLowerCase().replace(/[^a-z0-9àâäéèêëïîôùûüç]+/g, "_").replace(/^_|_$/g, "");
              // Check if category already exists
              const existing = recipes.find(r => r.category === slug);
              if (existing) { alert(`La categorie "${newCatName.trim()}" existe deja.`); return; }
              const eSlug = resolvedEtab.slug?.includes("piccola") ? "piccola" : "bello_mio";
              const { error } = await supabase.from("kitchen_recipes").insert({
                name: `Nouvelle recette ${newCatName.trim()}`,
                category: slug,
                establishments: [eSlug],
                is_active: true,
              });
              if (error) { alert("Erreur: " + error.message); return; }
              setNewCatName("");
              setShowNewCatModal(false);
              fetchAllRecipes(etabSlug).then(r => setRecipes(r));
            }}
            style={{
              padding: "12px", borderRadius: 10, fontSize: 13, fontWeight: 700,
              background: newCatName.trim() ? "#4a6741" : "#ccc",
              color: "#fff", border: "none", cursor: newCatName.trim() ? "pointer" : "not-allowed",
            }}
          >
            Creer la categorie
          </button>
        </div>
      </BottomSheet>

      {/* ── Nouvelle sous-catégorie BottomSheet ── */}
      <BottomSheet open={showNewSubCatModal} onClose={() => { setShowNewSubCatModal(false); setNewSubCatName(""); }} title={`Nouvelle sous-categorie (${newSubCatType})`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="text"
            value={newSubCatName}
            onChange={(e) => setNewSubCatName(e.target.value)}
            placeholder="Nom de la sous-categorie (ex: Entrée, Dessert, Cocktail signature...)"
            style={{
              width: "100%", padding: "10px 12px", borderRadius: 8,
              border: "1.5px solid #ddd6c8", fontSize: 13, outline: "none",
              boxSizing: "border-box",
            }}
          />
          <button
            type="button"
            disabled={!newSubCatName.trim()}
            onClick={async () => {
              if (!resolvedEtab || !newSubCatName.trim()) return;
              const slug = newSubCatName.trim().toLowerCase().replace(/[^a-z0-9àâäéèêëïîôùûüç]+/g, "_").replace(/^_|_$/g, "");
              const eSlug2 = resolvedEtab.slug?.includes("piccola") ? "piccola" : "bello_mio";
              const { error } = await supabase.from("kitchen_recipes").insert({
                name: `Nouvelle recette ${newSubCatName.trim()}`,
                category: slug,
                establishments: [eSlug2],
                is_active: true,
              });
              if (error) { alert("Erreur: " + error.message); return; }
              setNewSubCatName("");
              setShowNewSubCatModal(false);
              fetchAllRecipes(etabSlug).then(r => setRecipes(r));
            }}
            style={{
              padding: "12px", borderRadius: 10, fontSize: 13, fontWeight: 700,
              background: newSubCatName.trim() ? "#4a6741" : "#ccc",
              color: "#fff", border: "none", cursor: newSubCatName.trim() ? "pointer" : "not-allowed",
            }}
          >
            Creer la sous-categorie
          </button>
        </div>
      </BottomSheet>

      {/* ── Modal duplication ── */}
      {dupTarget && (
        <div onClick={() => setDupTarget(null)} style={{
          position: "fixed", inset: 0, zIndex: 300,
          background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "#fff", borderRadius: 16, padding: 24, maxWidth: 420, width: "100%",
            boxShadow: "0 20px 60px rgba(0,0,0,0.25)", border: "1px solid #e0d8ce",
          }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 4px", color: "#1a1a1a" }}>
              Dupliquer : {dupTarget.name}
            </h3>
            <p style={{ fontSize: 12, color: "#999", margin: "0 0 16px" }}>
              La copie sera creee en brouillon. Choisissez la categorie cible.
            </p>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 4px" }}>Categorie</label>
            <select value={dupCat} onChange={e => { setDupCat(e.target.value); setDupSubCat(""); }}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #ddd6c8", fontSize: 13, marginBottom: 12, fontFamily: "inherit", boxSizing: "border-box" }}>
              <option value="pizza">Pizza</option>
              {Object.entries(CUISINE_CAT_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
              {[...new Set(recipes.map(r => r.category ?? "").filter(c => c && c !== "pizza" && !(c in CUISINE_CAT_LABELS)))].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: ".08em", margin: "0 0 4px" }}>Sous-categorie (facultatif)</label>
            <input type="text" value={dupSubCat} onChange={e => setDupSubCat(e.target.value)} placeholder="Ex : Signature, Classique..."
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #ddd6c8", fontSize: 13, marginBottom: 16, fontFamily: "inherit", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setDupTarget(null)} style={{ padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, background: "#f5f0e8", color: "#666", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
              <button onClick={confirmDuplicate} style={{ padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 700, background: "#2563EB", color: "#fff", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Dupliquer</button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
