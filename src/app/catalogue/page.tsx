"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import type { CSSProperties } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useEtablissement } from "@/lib/EtablissementContext";
import { calculerPate, type EmpatementType, type FlourMixItem, type PateResult } from "@/lib/pateEngine";

// ── Types ────────────────────────────────────────────────────────────────────

type RecipeType = "pizza" | "cuisine" | "cocktail" | "production";

type RecipeLine = {
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
  photo_url: string | null;
  lines: RecipeLine[];
  steps: string[];
  pivot_ingredient_id: string | null;
  yield_info: string | null; // "8 portions" or "1200 g"
  allergens: string[];
  emp_data?: EmpData;
};

// ── Constants ────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<RecipeType, string> = {
  pizza: "#8B1A1A",
  cuisine: "#4a6741",
  cocktail: "#D4775A",
  production: "#6b5b3e",
};

const TYPE_LABELS: Record<RecipeType, string> = {
  pizza: "Pizza",
  cuisine: "Cuisine",
  cocktail: "Cocktail",
  production: "Production",
};

const CUISINE_CAT_LABELS: Record<string, string> = {
  preparation: "Préparation",
  sauce: "Sauce",
  entree: "Entrée",
  plat_cuisine: "Plat cuisiné",
  accompagnement: "Accompagnement",
  dessert: "Dessert",
  autre: "Autre",
};

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
    { ingredient_name: "Farine", qty: phase.flour_g, unit: "g" },
    { ingredient_name: "Eau", qty: phase.water_g, unit: "g" },
  ];
  if (phase.salt_g > 0) lines.push({ ingredient_name: "Sel", qty: phase.salt_g, unit: "g" });
  if (phase.honey_g > 0) lines.push({ ingredient_name: "Miel", qty: phase.honey_g, unit: "g" });
  if (phase.oil_g > 0) lines.push({ ingredient_name: "Huile", qty: phase.oil_g, unit: "g" });
  if (phase.yeast_g > 0) lines.push({ ingredient_name: "Levure", qty: phase.yeast_g, unit: "g" });
  return lines;
}

function resultToLines(r: PateResult): RecipeLine[] {
  const t = r.totals;
  const lines: RecipeLine[] = [
    { ingredient_name: "Farine", qty: t.flour_total_g, unit: "g" },
    { ingredient_name: "Eau", qty: t.water_g, unit: "g" },
  ];
  if (t.salt_g > 0) lines.push({ ingredient_name: "Sel", qty: t.salt_g, unit: "g" });
  if (t.honey_g > 0) lines.push({ ingredient_name: "Miel", qty: t.honey_g, unit: "g" });
  if (t.oil_g > 0) lines.push({ ingredient_name: "Huile", qty: t.oil_g, unit: "g" });
  if (t.yeast_g > 0) lines.push({ ingredient_name: "Levure", qty: t.yeast_g, unit: "g" });
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
    .from("pizza_recipes")
    .select("id, name, photo_url, notes, pivot_ingredient_id, ball_weight_g, establishments")
    .order("name");
  const pizzaIds = (pizzas ?? []).map(p => p.id);
  const { data: pizzaIngs } = pizzaIds.length ? await supabase
    .from("pizza_ingredients")
    .select("pizza_id, ingredient_id, qty, unit, sort_order, ingredients(name, allergens)")
    .in("pizza_id", pizzaIds)
    .order("sort_order") : { data: [] };

  for (const p of (pizzas ?? [])) {
    if (!matchEstab(p.establishments)) continue;
    const pIngs = (pizzaIngs ?? []).filter((i: Record<string, unknown>) => i.pizza_id === p.id);
    const allergenSet = new Set<string>();
    const lines: RecipeLine[] = pIngs.map((i: Record<string, unknown>) => {
      const ing = i.ingredients as Record<string, unknown> | null;
      for (const a of parseAllergenArray(ing?.allergens)) allergenSet.add(a);
      return { ingredient_name: (ing?.name as string) ?? "?", qty: Number(i.qty) || 0, unit: String(i.unit ?? "g") };
    });
    recipes.push({
      id: p.id, type: "pizza", name: p.name, category: null,
      photo_url: p.photo_url, lines, steps: parseJsonSteps(p.notes),
      pivot_ingredient_id: p.pivot_ingredient_id,
      yield_info: p.ball_weight_g ? `Pâton ${p.ball_weight_g} g` : null,
      allergens: [...allergenSet],
    });
  }

  // ── Cuisine ──
  const { data: kitchens } = await supabase
    .from("kitchen_recipes")
    .select("id, name, category, photo_url, procedure, pivot_ingredient_id, yield_grams, portions_count, establishments")
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
    // Skip if category is "preparation" — those go to Production
    if (k.category === "preparation") continue;
    const kIngs = (kitchenIngs ?? []).filter((i: Record<string, unknown>) => i.recipe_id === k.id);
    const allergenSet = new Set<string>();
    const lines: RecipeLine[] = kIngs.map((i: Record<string, unknown>) => {
      const ing = i.ingredients as Record<string, unknown> | null;
      for (const a of parseAllergenArray(ing?.allergens)) allergenSet.add(a);
      const rawUnit = String(i.unit ?? "g");
      let qty = Number(i.qty) || 0;
      let unit = rawUnit;
      if (rawUnit === "ml") { qty = qty / 10; unit = "cL"; }
      return { ingredient_name: (ing?.name as string) ?? "?", qty, unit };
    });
    let yieldInfo: string | null = null;
    if (k.portions_count) yieldInfo = `${k.portions_count} portion${k.portions_count > 1 ? "s" : ""}`;
    else if (k.yield_grams) yieldInfo = `${k.yield_grams} g`;
    recipes.push({
      id: k.id, type: "cuisine", name: k.name, category: k.category,
      photo_url: k.photo_url, lines, steps: parseJsonSteps(k.procedure),
      pivot_ingredient_id: k.pivot_ingredient_id, yield_info: yieldInfo,
      allergens: [...allergenSet],
    });
  }

  // ── Cocktail ──
  const { data: cocktails } = await supabase
    .from("cocktails")
    .select("id, name, image_url, steps, pivot_ingredient_id, glass, establishments")
    .order("name");
  const cocktailIds = (cocktails ?? []).map(c => c.id);
  const { data: cocktailIngs } = cocktailIds.length ? await supabase
    .from("cocktail_ingredients")
    .select("cocktail_id, ingredient_id, qty, unit, sort_order, ingredients(name, allergens)")
    .in("cocktail_id", cocktailIds)
    .order("sort_order") : { data: [] };

  for (const c of (cocktails ?? [])) {
    if (!matchEstab(c.establishments)) continue;
    const cIngs = (cocktailIngs ?? []).filter((i: Record<string, unknown>) => i.cocktail_id === c.id);
    const allergenSet = new Set<string>();
    const lines: RecipeLine[] = cIngs.map((i: Record<string, unknown>) => {
      const ing = i.ingredients as Record<string, unknown> | null;
      for (const a of parseAllergenArray(ing?.allergens)) allergenSet.add(a);
      return { ingredient_name: (ing?.name as string) ?? "?", qty: Number(i.qty) || 0, unit: String(i.unit ?? "cL") };
    });
    recipes.push({
      id: c.id, type: "cocktail", name: c.name, category: null,
      photo_url: c.image_url, lines, steps: parseJsonSteps(c.steps),
      pivot_ingredient_id: c.pivot_ingredient_id,
      yield_info: c.glass ? `Verre : ${c.glass}` : null,
      allergens: [...allergenSet],
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
      return { ingredient_name: (ing?.name as string) ?? "?", qty, unit };
    });
    recipes.push({
      id: `prep-${p.id}`, type: "production", name: p.name, category: "prep",
      photo_url: p.photo_url, lines, steps: parseJsonSteps(p.procedure),
      pivot_ingredient_id: p.pivot_ingredient_id,
      yield_info: p.yield_grams ? `${p.yield_grams} g` : null,
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
      return { ingredient_name: (ing?.name as string) ?? "?", qty, unit };
    });
    recipes.push({
      id: k.id, type: "production", name: k.name, category: "preparation",
      photo_url: k.photo_url, lines, steps: parseJsonSteps(k.procedure),
      pivot_ingredient_id: k.pivot_ingredient_id,
      yield_info: k.yield_grams ? `${k.yield_grams} g` : null,
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
      id: `emp-${e.id}`, type: "production", name: e.name, category: "empatement",
      photo_url: null, lines, steps: parseJsonSteps(e.procedure),
      pivot_ingredient_id: e.pivot_ingredient_id,
      yield_info: `${bc} pâton${bc > 1 ? "s" : ""} × ${bw} g`,
      allergens: ["gluten"],
      emp_data: empData,
    });
  }

  return recipes;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function CataloguePage() {
  const { current: etab } = useEtablissement();
  const etabSlug = etab?.slug ?? null;

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<RecipeType | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());

  // Pivot overrides: { recipeId: qty }
  const [pivotOverrides, setPivotOverrides] = useState<Record<string, number>>({});
  // Empâtement overrides: { recipeId: { count, weight } }
  const [empOverrides, setEmpOverrides] = useState<Record<string, { count?: number; weight?: number }>>({});

  // Pivot modal (any recipe with pivot or emp_data)
  const [modalRecipe, setModalRecipe] = useState<Recipe | null>(null);

  useEffect(() => {
    fetchAllRecipes(etabSlug).then(r => { setRecipes(r); setLoading(false); });
  }, [etabSlug]);

  const filtered = useMemo(() => {
    let arr = recipes;
    if (typeFilter) arr = arr.filter(r => r.type === typeFilter);
    if (q.trim()) {
      const low = q.toLowerCase();
      arr = arr.filter(r => r.name.toLowerCase().includes(low));
    }
    return arr;
  }, [recipes, typeFilter, q]);

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of recipes) c[r.type] = (c[r.type] ?? 0) + 1;
    return c;
  }, [recipes]);

  // Group by type, then by category
  const groups = useMemo(() => {
    const map: Record<string, Recipe[]> = {};
    for (const r of filtered) {
      const key = r.category ? `${r.type}:${r.category}` : r.type;
      if (!map[key]) map[key] = [];
      map[key].push(r);
    }
    const typeOrder: RecipeType[] = ["pizza", "cuisine", "cocktail", "production"];
    const cuisineCatOrder = ["entree", "plat_cuisine", "accompagnement", "dessert", "sauce", "autre"];
    const prodCatOrder = ["preparation", "prep", "empatement"];
    return Object.entries(map).sort(([a], [b]) => {
      const ta = a.split(":")[0];
      const tb = b.split(":")[0];
      const ia = typeOrder.indexOf(ta as RecipeType);
      const ib = typeOrder.indexOf(tb as RecipeType);
      if (ia !== ib) return ia - ib;
      const ca = a.includes(":") ? a.split(":")[1] : "";
      const cb = b.includes(":") ? b.split(":")[1] : "";
      const catOrder = ta === "production" ? prodCatOrder : cuisineCatOrder;
      return catOrder.indexOf(ca) - catOrder.indexOf(cb);
    });
  }, [filtered]);

  const toggleCat = useCallback((key: string) => {
    setCollapsedCats(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const toggleOpen = useCallback((id: string) => {
    setOpenId(prev => prev === id ? null : id);
  }, []);

  function groupLabel(key: string): string {
    const [type, cat] = key.split(":");
    if (!cat) return TYPE_LABELS[type as RecipeType] ?? type;
    if (type === "cuisine") return CUISINE_CAT_LABELS[cat] ?? cat;
    if (cat === "empatement") return "Empâtement";
    if (cat === "prep" || cat === "preparation") return "Préparations";
    return cat;
  }

  function groupColor(key: string): string {
    const type = key.split(":")[0] as RecipeType;
    return TYPE_COLORS[type] ?? "#1a1a1a";
  }

  // Pill style
  const pill = (active: boolean, color: string): CSSProperties => ({
    padding: "7px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700,
    border: active ? "none" : `1.5px solid ${color}40`,
    background: active ? color : "transparent",
    color: active ? "#fff" : color,
    cursor: "pointer", whiteSpace: "nowrap",
  });

  return (
    <div style={{ background: "#f2ede4", minHeight: "100vh" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 60px" }}>

        {/* Header */}
        <h1 style={{
          fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, fontSize: 26,
          color: "#1a1a1a", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "0.04em",
        }}>
          Catalogue
        </h1>
        <p style={{ fontSize: 13, color: "#999", margin: "0 0 20px" }}>
          {recipes.length} recette{recipes.length > 1 ? "s" : ""} — consultation équipe
        </p>

        {/* Search */}
        <input
          type="search"
          placeholder="Rechercher une recette..."
          value={q}
          onChange={e => setQ(e.target.value)}
          style={{
            width: "100%", padding: "10px 14px", borderRadius: 12,
            border: "1.5px solid #ddd6c8", background: "#fff", fontSize: 14,
            outline: "none", boxSizing: "border-box", marginBottom: 14,
          }}
        />

        {/* Type filter pills */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
          <button onClick={() => setTypeFilter(null)} style={pill(!typeFilter, "#1a1a1a")}>
            Tous ({recipes.length})
          </button>
          {(["pizza", "cuisine", "cocktail", "production"] as const).map(t => (
            <button key={t} onClick={() => setTypeFilter(typeFilter === t ? null : t)} style={pill(typeFilter === t, TYPE_COLORS[t])}>
              {TYPE_LABELS[t]} ({typeCounts[t] ?? 0})
            </button>
          ))}
        </div>

        {/* Loading */}
        {loading && <p style={{ textAlign: "center", color: "#999", padding: 40 }}>Chargement...</p>}

        {/* Empty */}
        {!loading && filtered.length === 0 && (
          <p style={{ textAlign: "center", color: "#999", padding: 40, fontSize: 14 }}>Aucune recette trouvée.</p>
        )}

        {/* Groups */}
        {groups.map(([key, items]) => {
          const color = groupColor(key);
          const isCollapsed = collapsedCats.has(key);
          return (
            <div key={key} style={{ marginBottom: 8 }}>
              {/* Category header */}
              <button
                onClick={() => toggleCat(key)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "12px 16px", background: "#fff",
                  border: "1.5px solid #ddd6c8", borderLeft: `3px solid ${color}`,
                  borderRadius: 12, cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                  marginBottom: 6, boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <span style={{
                  fontFamily: "DM Sans, sans-serif", fontSize: 13, fontWeight: 700,
                  letterSpacing: "0.14em", textTransform: "uppercase", color,
                }}>
                  {groupLabel(key)}
                </span>
                <span style={{
                  fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                  background: `${color}18`, color,
                }}>
                  {items.length}
                </span>
                <span style={{
                  marginLeft: "auto", fontSize: 10, color: "#b0a894",
                  transition: "transform 0.2s",
                  transform: isCollapsed ? "rotate(-90deg)" : "rotate(0)",
                }}>
                  ▼
                </span>
              </button>

              {/* Recipe rows */}
              {!isCollapsed && items.map(recipe => {
                const isOpen = openId === recipe.id;
                const hasPivot = !!recipe.pivot_ingredient_id || !!recipe.emp_data;

                return (
                  <div key={recipe.id} style={{ marginBottom: 2 }}>
                    {/* Row */}
                    <div
                      onClick={() => hasPivot ? setModalRecipe(recipe) : toggleOpen(recipe.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "10px 16px", background: isOpen ? "#fff" : "rgba(255,255,255,0.7)",
                        borderRadius: isOpen ? "10px 10px 0 0" : 10,
                        cursor: "pointer", borderBottom: isOpen ? "1px solid #ede6d9" : "none",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={e => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = "#fff"; }}
                      onMouseLeave={e => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.7)"; }}
                    >
                      {/* Thumbnail */}
                      <div style={{
                        width: 40, height: 40, borderRadius: 8, flexShrink: 0, overflow: "hidden",
                        background: recipe.photo_url
                          ? `url(${recipe.photo_url}) center/cover`
                          : `linear-gradient(135deg, ${color}25 0%, ${color}10 100%)`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        border: `1px solid ${color}20`,
                      }}>
                        {!recipe.photo_url && (
                          <span style={{ fontSize: 14, fontWeight: 700, color: `${color}60`, fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>
                            {initials(recipe.name)}
                          </span>
                        )}
                      </div>

                      {/* Name + meta */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: 14,
                          color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {recipe.name}
                        </div>
                        <div style={{ fontSize: 11, color: "#999", marginTop: 1 }}>
                          {recipe.lines.length} ingr.
                          {recipe.steps.length > 0 && ` · ${recipe.steps.length} étape${recipe.steps.length > 1 ? "s" : ""}`}
                          {recipe.yield_info && ` · ${recipe.yield_info}`}
                        </div>
                      </div>

                      {/* Allergen dots */}
                      {recipe.allergens.length > 0 && (
                        <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                          {recipe.allergens.slice(0, 3).map(a => (
                            <span key={a} style={{
                              fontSize: 8, fontWeight: 800, padding: "2px 5px", borderRadius: 4,
                              background: "rgba(220,38,38,0.08)", color: "#DC2626",
                              border: "1px solid rgba(220,38,38,0.18)",
                            }}>
                              {a.slice(0, 3).toUpperCase()}
                            </span>
                          ))}
                          {recipe.allergens.length > 3 && (
                            <span style={{ fontSize: 8, color: "#999" }}>+{recipe.allergens.length - 3}</span>
                          )}
                        </div>
                      )}

                      {/* Chevron */}
                      <span style={{
                        fontSize: 10, color: "#b0a894", flexShrink: 0,
                        transition: "transform 0.2s",
                        transform: isOpen ? "rotate(180deg)" : "rotate(0)",
                      }}>
                        ▼
                      </span>
                    </div>

                    {/* Expanded fiche */}
                    {isOpen && (
                      <div style={{
                        background: "#fff", borderRadius: "0 0 10px 10px",
                        padding: "16px 20px 20px", marginBottom: 4,
                        borderLeft: `3px solid ${color}`,
                      }}>
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
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* ═══ MODALE PIVOT ═══ */}
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

        // Standard pivot: factor
        const mPivotOverride = pivotOverrides[modalRecipe.id];
        const mBasePivot = modalRecipe.lines[0]?.qty || 1;
        const mFactor = !isEmp && mPivotOverride != null && mPivotOverride > 0 ? mPivotOverride / mBasePivot : 1;
        if (!isEmp && mFactor !== 1) {
          displayLines = modalRecipe.lines.map(l => ({ ...l, qty: l.qty * mFactor }));
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

              {/* Standard pivot: ★ ingredient input */}
              {!isEmp && modalRecipe.lines.length > 0 && (
                <div style={{ padding: "0 20px", marginBottom: 16 }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                    padding: "12px 16px", borderRadius: 12,
                    background: `${mColor}08`, border: `1.5px solid ${mColor}25`,
                  }}>
                    <span style={{ fontSize: 16, fontWeight: 800, color: mColor }}>★</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: mColor }}>
                      {modalRecipe.lines[0].ingredient_name}
                    </span>
                    <input
                      type="number"
                      value={pivotOverrides[modalRecipe.id] ?? ""}
                      placeholder={String(modalRecipe.lines[0].qty)}
                      onChange={e => {
                        const v = e.target.value;
                        setPivotOverrides(prev => ({
                          ...prev,
                          [modalRecipe.id]: v === "" ? undefined as unknown as number : parseFloat(v),
                        }));
                      }}
                      style={{
                        width: 100, height: 38, borderRadius: 10,
                        border: `2px solid ${mColor}40`, padding: "0 12px",
                        fontSize: 16, fontWeight: 800, textAlign: "center",
                        background: "#fff", color: "#1a1a1a", outline: "none",
                      }}
                    />
                    <span style={{ fontSize: 13, color: "#999", fontWeight: 600 }}>{modalRecipe.lines[0].unit}</span>
                    {mFactor !== 1 && (
                      <span style={{
                        fontSize: 13, fontWeight: 800, color: mColor, marginLeft: "auto",
                        padding: "4px 10px", borderRadius: 8, background: `${mColor}12`,
                      }}>
                        × {mFactor.toLocaleString("fr-FR", { maximumFractionDigits: 2 })}
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
                          <span style={{ color: "#1a1a1a", fontWeight: 500, fontSize: 15 }}>
                            {line.ingredient_name}
                          </span>
                          <span style={{
                            fontWeight: 800, fontSize: 16,
                            color: hasChanged ? "#D4775A" : "#1a1a1a",
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
            </div>
          </div>
        );
      })()}
    </div>
  );
}
