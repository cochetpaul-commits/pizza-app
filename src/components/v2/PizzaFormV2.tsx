"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { SmartSelect, type SmartSelectOption } from "@/components/SmartSelect";
import { AllergenBadges } from "@/components/AllergenBadges";
import { parseAllergens, mergeAllergens } from "@/lib/allergens";
import { offerRowToCpu, enrichCpuWithConversions } from "@/lib/offerPricing";
import { formatCpuLabel, formatIngredientPriceLine } from "@/lib/formatPrice";
import type { LatestOffer } from "@/types/ingredients";
import { compressImage } from "@/lib/compressImage";

import { DragDropContext, type DropResult } from "@hello-pangea/dnd";
import { fetchApi } from "@/lib/fetchApi";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import { IngredientListDnD, normalizeUnit, type IngredientLine } from "./IngredientListDnD";
import { StepsList } from "./StepsList";
import { RecipeHero, HeroBtn, HeroDangerBtn } from "./RecipeHero";
import { PublishCatalogueButton } from "./PublishCatalogueButton";
import { StepperInput } from "@/components/StepperInput";
import type { Ingredient } from "@/types/ingredients";
import type { CpuByUnit } from "@/lib/offerPricing";
import ProductionModal from "@/components/ProductionModal";

const PIZZA_UNITS = ["g", "cL", "pcs"];
const ACCENT = "#8B1A1A";

type DoughRecipeRow = {
  id: string;
  name: string | null;
  type: string | null;
  total_cost: number | null;
  yield_grams: number | null;
  ball_weight: number | null;
};

function tmpId() { return `tmp-${Math.random().toString(36).slice(2)}`; }
function n2(v: unknown) { const x = Number(v); return Number.isFinite(x) ? x : 0; }
function round2(v: number) { return Math.round(v * 100) / 100; }
function fmtMoney(v: number) {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props { pizzaId?: string; initialProdMode?: boolean; }

function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n) + "…" : s; }

export default function PizzaFormV2({ pizzaId, initialProdMode }: Props) {
  const router = useRouter();
  const { can } = useProfile();
  const userCanWrite = can("operations.edit_recettes");
  const etab = useEtablissement();
  const isEdit = !!pizzaId;

  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState<unknown>(null);

  // Form state
  const [name, setName] = useState("");
  const [doughRecipeId, setDoughRecipeId] = useState("");
  const [ballWeightG, setBallWeightG] = useState<number | "">(264);
  const [notes, setNotes] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  const [sellPrice, setSellPrice] = useState<number | "">("");
  const [sellCoeff, setSellCoeff] = useState<number | null>(null);
  const [nbParts, setNbParts] = useState(1);
  const [cookedWeightG, setCookedWeightG] = useState<number | "">(""); // poids apres cuisson
  const [sellPriceEmporter, setSellPriceEmporter] = useState<number | "">("");
  const [vatEmporter, setVatEmporter] = useState(0.055); // 5.5% TVA emporter

  // Dough recipes
  const [doughRecipes, setDoughRecipes] = useState<DoughRecipeRow[]>([]);

  // Ingredients
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [priceByIngredient, setPriceByIngredient] = useState<Record<string, CpuByUnit>>({});
  const [priceLabelByIngredient, setPriceLabelByIngredient] = useState<Record<string, string>>({});
  const [_supplierByIngredient, setSupplierByIngredient] = useState<Record<string, string | null>>({});

  // Pre/post ingredient lines
  const [preLines, setPreLines] = useState<IngredientLine[]>([]);
  const [postLines, setPostLines] = useState<IngredientLine[]>([]);

  // Steps (stored in notes for kitchen_recipes)
  const [steps, setSteps] = useState<string[]>([]);

  // Pricing
  const [vatRate, setVatRate] = useState(0.1);
  const [fcTarget, setFcTarget] = useState(30);

  // Main tab
  type MainTab = "recette";
  const [mainTab, setMainTab] = useState<MainTab>("recette");

  // Production mode
  const [prodMode, setProdMode] = useState(initialProdMode ?? false);
  const [showProdModal, setShowProdModal] = useState(initialProdMode ?? false);
  const [pivotIngredientId, setPivotIngredientId] = useState<string | null>(null);
  const [prodQty, setProdQty] = useState<number | "">("");

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const fileRef = useRef<HTMLInputElement | null>(null);

  const allLines = useMemo(() => [...preLines, ...postLines], [preLines, postLines]);

  // Cross-list drag handler (avant four ↔ apres four)
  function onCrossDragEnd(result: DropResult) {
    const { source, destination } = result;
    if (!destination) return;

    const srcId = source.droppableId; // "pre" or "post"
    const dstId = destination.droppableId;

    const srcItems = srcId === "pre" ? [...preLines] : [...postLines];
    const setSrc = srcId === "pre" ? setPreLines : setPostLines;

    if (srcId === dstId) {
      // Reorder within same list
      const [moved] = srcItems.splice(source.index, 1);
      srcItems.splice(destination.index, 0, moved);
      setSrc(srcItems.map((item, i) => ({ ...item, sort_order: i })));
    } else {
      // Move across lists
      const dstItems = dstId === "pre" ? [...preLines] : [...postLines];
      const setDst = dstId === "pre" ? setPreLines : setPostLines;
      const [moved] = srcItems.splice(source.index, 1);
      dstItems.splice(destination.index, 0, moved);
      setSrc(srcItems.map((item, i) => ({ ...item, sort_order: i })));
      setDst(dstItems.map((item, i) => ({ ...item, sort_order: i })));
    }
  }

  // Computed allergens
  const computedAllergens = useMemo(() => {
    const lists = allLines
      .map(l => ingredients.find(i => i.id === l.ingredient_id))
      .filter(Boolean)
      .map(i => parseAllergens((i as Ingredient).allergens))
      .filter((a): a is string[] => Array.isArray(a));
    return mergeAllergens(lists);
  }, [allLines, ingredients]);

  // Dough cost
  const selectedDough = useMemo(() => doughRecipes.find(r => r.id === doughRecipeId), [doughRecipes, doughRecipeId]);
  const doughCostPerBall = useMemo(() => {
    if (!selectedDough) return null;
    const ballW = ballWeightG !== "" ? Number(ballWeightG) : 0;
    if (ballW > 0 && selectedDough.total_cost && selectedDough.yield_grams && selectedDough.yield_grams > 0) {
      return round2((selectedDough.total_cost / selectedDough.yield_grams) * ballW);
    }
    if (selectedDough.ball_weight && selectedDough.ball_weight > 0 && selectedDough.total_cost && selectedDough.yield_grams && selectedDough.yield_grams > 0) {
      return round2((selectedDough.total_cost / selectedDough.yield_grams) * selectedDough.ball_weight);
    }
    return null;
  }, [selectedDough, ballWeightG]);

  // Ingredient costs
  const ingredientCostTotal = useMemo(() => {
    return allLines.reduce((acc, l) => {
      if (!l.ingredient_id || l.qty === "" || !(Number(l.qty) > 0)) return acc;
      const cpu = priceByIngredient[l.ingredient_id];
      if (!cpu) return acc;
      const qty = Number(l.qty);
      const unit = l.unit.toLowerCase();

      // Enrich cpu with ingredient meta (same conversions as IngredientListDnD)
      const ing = ingredients.find(i => i.id === l.ingredient_id);
      const eff = { ...cpu };
      const pwg = ing?.piece_weight_g ?? null;
      const pvm = (ing as Record<string, unknown>)?.piece_volume_ml as number | null ?? null;
      const dens = ing?.density_g_per_ml ?? null;
      if (eff.g == null && eff.pcs != null && pwg && pwg > 0) eff.g = eff.pcs / pwg;
      if (eff.ml == null && eff.pcs != null && pvm && pvm > 0) eff.ml = eff.pcs / pvm;
      if (eff.g == null && eff.ml != null && dens && dens > 0) eff.g = eff.ml / dens;
      if (eff.ml == null && eff.g != null && dens && dens > 0) eff.ml = eff.g * dens;

      if ((unit === "g" || unit === "kg") && eff.g) return acc + eff.g * (unit === "kg" ? qty * 1000 : qty);
      if ((unit === "cl" || unit === "ml" || unit === "l") && eff.ml) {
        const factor = unit === "cl" ? 10 : unit === "l" ? 1000 : 1;
        return acc + eff.ml * qty * factor;
      }
      if ((unit === "pc" || unit === "pcs") && eff.pcs) return acc + eff.pcs * qty;
      return acc;
    }, 0);
  }, [allLines, priceByIngredient, ingredients]);

  const totalCost = round2((doughCostPerBall ?? 0) + ingredientCostTotal);

  // Total weight (g) — sum all ingredient lines in grams
  const totalWeightG = useMemo(() => {
    let w = 0;
    for (const l of allLines) {
      if (l.qty === "" || !(Number(l.qty) > 0)) continue;
      const qty = Number(l.qty);
      const unit = l.unit.toLowerCase();
      if (unit === "g") w += qty;
      else if (unit === "kg") w += qty * 1000;
      else if (unit === "cl" || unit === "ml" || unit === "l") {
        // Convert liquid to grams via density if available
        const ing = ingredients.find(i => i.id === l.ingredient_id);
        const dens = ing?.density_g_per_ml;
        if (dens && dens > 0) {
          const ml = unit === "cl" ? qty * 10 : unit === "l" ? qty * 1000 : qty;
          w += ml * dens;
        }
      }
    }
    // Add dough weight if applicable
    if (ballWeightG !== "" && Number(ballWeightG) > 0) w += Number(ballWeightG);
    return Math.round(w);
  }, [allLines, ingredients, ballWeightG]);

  const doughOptions: SmartSelectOption[] = doughRecipes.map(r => ({
    id: r.id,
    name: r.name ?? "Empatement",
    category: r.type ?? undefined,
  }));

  // Production mode computations
  const prodPivotLine = pivotIngredientId
    ? allLines.find(l => l.ingredient_id === pivotIngredientId && l.qty !== "" && Number(l.qty) > 0) ?? null
    : null;
  const prodPivotIng = pivotIngredientId
    ? ingredients.find(i => i.id === pivotIngredientId) ?? null
    : null;
  const prodFactor = prodPivotLine && prodQty !== "" && Number(prodQty) > 0
    ? Number(prodQty) / Number(prodPivotLine.qty)
    : null;
  const prodValidLines = allLines.filter(l => l.ingredient_id && l.qty !== "" && Number(l.qty) > 0);
  const prodTotalW = prodValidLines.reduce((acc, l) => {
    const qty = prodFactor !== null ? Math.round(Number(l.qty) * prodFactor) : Number(l.qty);
    const unit = l.unit.toLowerCase();
    return unit === "g" ? acc + qty : acc;
  }, 0);

  // ── KPI computations ──────────────────────────────────────────
  const costPerPizza = totalCost > 0 ? totalCost : null;
  const effectiveParts = nbParts > 0 ? nbParts : 1;
  const costPerPart = costPerPizza ? round2(costPerPizza / effectiveParts) : null;
  const derivedSellPerPart = costPerPart && sellCoeff && sellCoeff > 0 ? round2(costPerPart * sellCoeff) : null;
  const derivedSellPerPizza = derivedSellPerPart ? round2(derivedSellPerPart * effectiveParts) : null;
  const foodCostPct = costPerPart && derivedSellPerPart ? round2((costPerPart / derivedSellPerPart) * 100) : null;
  const margePerPart = costPerPart && derivedSellPerPart ? round2(derivedSellPerPart - costPerPart) : null;
  const prixTTCPart = derivedSellPerPart ? round2(derivedSellPerPart * (1 + vatRate)) : null;

  // Tab definitions
  const MAIN_TABS: { key: MainTab; label: string }[] = isEdit ? [
    { key: "recette", label: "Recette" },
  ] : [
    { key: "recette", label: "Recette" },
  ];

  const title = name || "Nouvelle pizza";

  // Load
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { setStatus("error"); setError({ message: "NOT_LOGGED" }); return; }

      const myEstab = etab.current?.slug?.includes("piccola") ? "piccola" : "bellomio";
      const ingsQ = supabase.from("ingredients").select("*").eq("is_active", true)
        .or(`establishments.cs.{"${myEstab}"},establishments.is.null`);
      const doughQ = supabase.from("recipes").select("id,name,type,total_cost,yield_grams,ball_weight");
      const offQ = supabase.from("v_latest_offers").select("*");
      const [{ data: ingsData, error: iErr }, { data: offers }, { data: doughs }] = await Promise.all([
        ingsQ.order("name"),
        offQ,
        doughQ.order("created_at", { ascending: false }),
      ]);
      if (cancelled) return;
      if (iErr) { setStatus("error"); setError(iErr); return; }

      const ingList = (ingsData ?? []) as Ingredient[];
      setIngredients(ingList);
      setDoughRecipes((doughs ?? []) as DoughRecipeRow[]);

      const offerList = (offers ?? []) as Record<string, unknown>[];
      const supplierIds = Array.from(new Set(offerList.map(o => String(o.supplier_id ?? "")).filter(Boolean)));
      const supplierNameById: Record<string, string> = {};
      if (supplierIds.length) {
        const { data: sups } = await supabase.from("suppliers").select("id,name").in("id", supplierIds);
        for (const s of (sups ?? []) as { id: string; name: string }[]) {
          if (s.id && s.name) supplierNameById[s.id] = s.name;
        }
      }

      const pm: Record<string, CpuByUnit> = {};
      const metaM: Record<string, { density_kg_per_l?: number | null; piece_weight_g?: number | null }> = {};
      const supplierByIng: Record<string, string | null> = {};
      const offerByIng: Record<string, LatestOffer> = {};
      for (const o of offerList) {
        const iid = String(o.ingredient_id ?? "");
        if (!iid) continue;
        pm[iid] = offerRowToCpu(o);
        metaM[iid] = { density_kg_per_l: o.density_kg_per_l as number | null, piece_weight_g: o.piece_weight_g as number | null };
        offerByIng[iid] = o as unknown as LatestOffer;
        const sid = String(o.supplier_id ?? "");
        supplierByIng[iid] = sid ? (supplierNameById[sid] ?? null) : null;
      }
      // Enrichissement avec les méta de l'ingrédient (piece_weight_g, density)
      for (const i of ingList) {
        const cpu = pm[i.id];
        if (!cpu) continue;
        const meta = metaM[i.id] ?? {};
        const pwg = meta.piece_weight_g ?? i.piece_weight_g ?? null;
        const dens = meta.density_kg_per_l ?? i.density_g_per_ml ?? null;
        pm[i.id] = enrichCpuWithConversions({ piece_weight_g: pwg, density_kg_per_l: dens }, cpu);
        metaM[i.id] = { piece_weight_g: pwg, density_kg_per_l: dens };
      }
      // Fallback 1 : purchase_price / purchase_unit depuis l'ingredient
      for (const i of ingList) {
        if (pm[i.id] && (pm[i.id].g || pm[i.id].ml || pm[i.id].pcs)) continue;
        const pp = i.purchase_price;
        const pu = i.purchase_unit;
        const pul = (i.purchase_unit_label ?? "").toLowerCase().trim();
        if (pp != null && pp > 0 && pu != null && pu > 0) {
          const perUnit = pp / pu;
          if (pul === "kg") pm[i.id] = { g: perUnit / 1000 };
          else if (pul === "l") pm[i.id] = { ml: perUnit / 1000 };
          else if (pul === "ml") pm[i.id] = { ml: perUnit };
          else if (pul === "pc" || pul === "pcs") pm[i.id] = { pcs: perUnit };
          else pm[i.id] = { g: perUnit };
          pm[i.id] = enrichCpuWithConversions({ density_kg_per_l: i.density_g_per_ml, piece_weight_g: i.piece_weight_g }, pm[i.id]);
          supplierByIng[i.id] = "maison";
          continue;
        }
        const cpu = i.cost_per_unit;
        if (cpu != null && cpu > 0) {
          pm[i.id] = { g: cpu };
          pm[i.id] = enrichCpuWithConversions({ density_kg_per_l: i.density_g_per_ml, piece_weight_g: i.piece_weight_g }, pm[i.id]);
          supplierByIng[i.id] = "maison";
        }
      }
      // Fallback 2 : kitchen_recipes + prep_recipes par output_ingredient_id OU par nom
      {
        const ingNameToId: Record<string, string> = {};
        const missingIds = new Set<string>();
        for (const i of ingList) {
          if (pm[i.id] && (pm[i.id].g || pm[i.id].ml || pm[i.id].pcs)) continue;
          missingIds.add(i.id);
          const nk = (i.name ?? "").toUpperCase().trim();
          if (nk) ingNameToId[nk] = i.id;
        }
        if (missingIds.size > 0) {
          const krQ = supabase.from("kitchen_recipes").select("name,output_ingredient_id,total_cost,yield_grams,cost_per_kg");
          const prQ = supabase.from("prep_recipes").select("name,output_ingredient_id");
          const [{ data: krAll }, { data: prAll }] = await Promise.all([krQ, prQ]);
          if (cancelled) return;
          for (const kr of (krAll ?? []) as Array<{ name: string | null; output_ingredient_id: string | null; total_cost: number | null; yield_grams: number | null; cost_per_kg: number | null }>) {
            let cpuG = 0;
            if (kr.cost_per_kg && kr.cost_per_kg > 0) cpuG = kr.cost_per_kg / 1000;
            else if (kr.total_cost && kr.total_cost > 0 && kr.yield_grams && kr.yield_grams > 0) cpuG = kr.total_cost / kr.yield_grams;
            if (cpuG <= 0) continue;
            if (kr.output_ingredient_id && missingIds.has(kr.output_ingredient_id)) {
              pm[kr.output_ingredient_id] = { g: cpuG }; supplierByIng[kr.output_ingredient_id] = "maison"; missingIds.delete(kr.output_ingredient_id);
            }
            const nk = (kr.name ?? "").toUpperCase().trim();
            if (nk && ingNameToId[nk] && missingIds.has(ingNameToId[nk])) {
              pm[ingNameToId[nk]] = { g: cpuG }; supplierByIng[ingNameToId[nk]] = "maison"; missingIds.delete(ingNameToId[nk]);
            }
          }
          for (const pr of (prAll ?? []) as Array<{ name: string | null; output_ingredient_id: string | null }>) {
            let cpuG = 0;
            if (pr.output_ingredient_id) {
              const ing = ingList.find(i => i.id === pr.output_ingredient_id);
              if (ing?.purchase_price && ing.purchase_price > 0 && ing.purchase_unit_label === "kg") cpuG = ing.purchase_price / 1000;
            }
            if (cpuG <= 0) continue;
            if (pr.output_ingredient_id && missingIds.has(pr.output_ingredient_id)) {
              pm[pr.output_ingredient_id] = { g: cpuG }; supplierByIng[pr.output_ingredient_id] = "maison"; missingIds.delete(pr.output_ingredient_id);
            }
            const nk = (pr.name ?? "").toUpperCase().trim();
            if (nk && ingNameToId[nk] && missingIds.has(ingNameToId[nk])) {
              pm[ingNameToId[nk]] = { g: cpuG }; supplierByIng[ingNameToId[nk]] = "maison"; missingIds.delete(ingNameToId[nk]);
            }
          }
        }
      }

      if (cancelled) return;
      setPriceByIngredient(pm);
      setSupplierByIngredient(supplierByIng);

      const labelMap: Record<string, string> = {};
      for (const i of ingList) {
        const off = offerByIng[i.id] ?? null;
        if (off) {
          labelMap[i.id] = formatIngredientPriceLine(i, off, supplierByIng[i.id] ?? null);
        } else {
          labelMap[i.id] = formatCpuLabel(pm[i.id] ?? {}, metaM[i.id] ?? {}, i.piece_volume_ml ?? null, supplierByIng[i.id] ?? null);
        }
      }
      setPriceLabelByIngredient(labelMap);

      if (pizzaId) {
        const [{ data: piz }, { data: pLines }] = await Promise.all([
          supabase.from("kitchen_recipes").select("*").eq("id", pizzaId).single(),
          supabase.from("kitchen_recipe_lines").select("*").eq("recipe_id", pizzaId).order("sort_order"),
        ]);
        if (cancelled) return;
        if (piz) {
          const p = piz as Record<string, unknown>;
          setName(String(p.name ?? ""));
          setDoughRecipeId(String(p.dough_recipe_id ?? ""));
          setBallWeightG(p.ball_weight_g ? Number(p.ball_weight_g) : 264);
          setNotes(String(p.notes ?? ""));
          // establishments auto-assigned from current etab context
          setPhotoUrl(String(p.photo_url ?? ""));
          if (p.photo_url) setPhotoPreview(String(p.photo_url));
          if (p.vat_rate) setVatRate(Number(p.vat_rate));
          if (p.margin_rate) {
            const mr = Number(p.margin_rate);
            if (mr > 0) setSellCoeff(mr);
          }
          if (p.nb_parts != null && Number(p.nb_parts) > 0) setNbParts(Number(p.nb_parts));
          if (p.sell_price != null) setSellPrice(Number(p.sell_price));
          if (p.sell_price_emporter != null) setSellPriceEmporter(Number(p.sell_price_emporter));
          if (p.vat_rate_emporter != null) setVatEmporter(Number(p.vat_rate_emporter));
          setPivotIngredientId(String(p.pivot_ingredient_id ?? "") || null);
        }
        if (pLines) {
          const all = (pLines as Array<Record<string, unknown>>).map((l, i) => {
            const rawUnit = String(l.unit ?? "g");
            const nu = normalizeUnit(rawUnit);
            let rawQty = n2(l.qty);
            if (rawUnit.toLowerCase() === "ml" && rawQty > 0) rawQty = round2(rawQty / 10);
            return {
              id: String(l.id ?? tmpId()),
              ingredient_id: String(l.ingredient_id ?? ""),
              qty: (rawQty > 0 ? rawQty : "") as number | "",
              unit: nu,
              sort_order: n2(l.sort_order) || i,
              stage: String(l.stage ?? "pre"),
            };
          });
          setPreLines(all.filter(l => l.stage === "pre").map((l, i) => ({ ...l, sort_order: i })));
          setPostLines(all.filter(l => l.stage === "post").map((l, i) => ({ ...l, sort_order: i })));
        }
      }

      setStatus("ok");
    }
    load();
    return () => { cancelled = true; };
  }, [pizzaId, etab]);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    try {
      const compressed = await compressImage(file);
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id ?? "anon";
      const ts = Date.now();
      const path = pizzaId ? `${uid}/pizzas/${pizzaId}.jpg` : `${uid}/pizzas/${ts}.jpg`;
      const { error: upErr } = await supabase.storage.from("recipe-images").upload(path, compressed, { upsert: true, contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("recipe-images").getPublicUrl(path);
      setPhotoUrl(urlData.publicUrl);
      setPhotoPreview(urlData.publicUrl);
    } catch (err) { console.error("Photo:", err); }
    finally { setPhotoUploading(false); }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("NOT_LOGGED");

      const margin_rate = sellCoeff && sellCoeff > 0 ? round2(sellCoeff) : 0;
      const stepsJson = steps.length > 0 ? JSON.stringify(steps) : null;
      const notesValue = stepsJson ?? (notes || null);

      const payload: Record<string, unknown> = {
        name: name || "Nouvelle pizza",
        dough_recipe_id: doughRecipeId || null,
        notes: notesValue,
        photo_url: photoUrl || null,
        establishments: etab.current ? [etab.current.slug] : ["bellomio"],
        total_cost: totalCost > 0 ? totalCost : null,
        ball_weight_g: ballWeightG !== "" ? Number(ballWeightG) : null,
        vat_rate: vatRate,
        sell_price_emporter: sellPriceEmporter !== "" ? Number(sellPriceEmporter) : null,
        vat_rate_emporter: vatEmporter,
        margin_rate,
        nb_parts: nbParts,
        sell_price: derivedSellPerPizza ?? (sellPrice !== "" ? Number(sellPrice) : null),
        is_draft: false,
      };

      let pid = pizzaId;
      if (pid) {
        const { error } = await supabase.from("kitchen_recipes").update(payload).eq("id", pid);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("kitchen_recipes")
          .insert({ ...payload, user_id: auth.user.id, category: "pizza", ...(etab.current ? { etablissement_id: etab.current.id } : {}) })
          .select("id").single<{ id: string }>();
        if (error) throw error;
        pid = data.id;
      }

      // Save pivot
      await supabase.from("kitchen_recipes").update({ pivot_ingredient_id: pivotIngredientId }).eq("id", pid!);

      // Upsert ingredient lines
      await supabase.from("kitchen_recipe_lines").delete().eq("recipe_id", pid!);
      const allValidLines = [
        ...preLines.filter(l => l.ingredient_id && l.qty !== "" && Number(l.qty) > 0).map((l, i) => ({ ...l, stage: "pre", sort_order: i })),
        ...postLines.filter(l => l.ingredient_id && l.qty !== "" && Number(l.qty) > 0).map((l, i) => ({ ...l, stage: "post", sort_order: i })),
      ];
      if (allValidLines.length > 0) {
        const { error: lErr } = await supabase.from("kitchen_recipe_lines").insert(
          allValidLines.map(l => ({
            recipe_id: pid!,
            ingredient_id: l.ingredient_id,
            qty: Number(l.qty),
            unit: l.unit,
            sort_order: l.sort_order,
            stage: l.stage,
          }))
        );
        if (lErr) throw lErr;
      }

      if (!isEdit) router.push(`/recettes/pizza/${pid}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : (err as { message?: string })?.message ?? JSON.stringify(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!pizzaId) return;
    if (!window.confirm("Supprimer cette fiche pizza ?")) return;
    await supabase.from("kitchen_recipe_lines").delete().eq("recipe_id", pizzaId);
    await supabase.from("kitchen_recipes").delete().eq("id", pizzaId);
    router.push("/recettes?tab=pizza");
  }

  async function handleExportPdf() {
    if (!pizzaId) return;
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/recettes/pdf?id=${pizzaId}&portions=${nbParts}`, {
      });
      if (!res.ok) { const e = await res.json().catch(() => ({ message: "Erreur inconnue" })); alert(`Erreur PDF: ${e.message}`); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(name || "pizza").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally { setPdfLoading(false); }
  }

  if (status === "loading") {
    return (
      <main className="container"><div className="muted" style={{ marginTop: 40, textAlign: "center" }}>Chargement…</div></main>
    );
  }
  if (status === "error") {
    return (
      <main className="container"><pre className="errorBox">{JSON.stringify(error, null, 2)}</pre></main>
    );
  }

  return (
    <>
      <main className="container safe-bottom">

        <RecipeHero
          title={title}
          accent={ACCENT}
          isEdit={true}
          photoPreview={photoPreview}
          etabName={etab.current?.nom}
          typeLabel="Pizza"
          onBack={() => router.push("/recettes")}
          actions={<>
            {isEdit && pivotIngredientId && <HeroBtn onClick={() => setShowProdModal(true)}>Production</HeroBtn>}
            <HeroBtn onClick={handleExportPdf} disabled={!isEdit || pdfLoading}>{pdfLoading ? "Export…" : "PDF"}</HeroBtn>
            <HeroBtn onClick={() => {
              if (!pizzaId) return;
              const n = prompt("Nombre de portions / personnes ?", "10");
              if (!n) return;
              const portions = parseInt(n);
              if (portions > 0) window.open(`/api/recettes/pdf?id=${pizzaId}&portions=${portions}`, "_blank");
            }} disabled={!isEdit}>PDF Prod.</HeroBtn>
            {isEdit ? <PublishCatalogueButton recipeType="pizza" recipeId={pizzaId!} /> : <HeroBtn disabled title="Enregistrer la recette pour publier au catalogue">Catalogue</HeroBtn>}
            {userCanWrite && <HeroBtn onClick={handleSave} disabled={saving} primary>{saving ? "Sauvegarde…" : "Enregistrer"}</HeroBtn>}
            {isEdit && userCanWrite && (
              <HeroDangerBtn onClick={async () => {
                if (!confirm("Supprimer cette recette ? Cette action est irreversible.")) return;
                const { error } = await supabase.from("kitchen_recipes").delete().eq("id", pizzaId);
                if (error) { alert(error.message); return; }
                router.push("/recettes");
              }}>Supprimer</HeroDangerBtn>
            )}
          </>}
        />

        {/* ── Tab bar ── */}
        <div style={{ textAlign: "center", marginBottom: 16 }}><div style={{ display: "inline-flex", gap: 4, padding: 4, background: "#e8e0d0", borderRadius: 12, overflowX: "auto" }}>
          {MAIN_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setMainTab(t.key)}
              style={{
                padding: "8px 20px", fontSize: 13, fontWeight: 600,
                cursor: "pointer", border: "none", borderRadius: 10,
                background: mainTab === t.key ? (etab?.current?.couleur ? etab.current.couleur + "25" : "#fff") : "transparent",
                color: mainTab === t.key ? "#1a1a1a" : "#999",
                boxShadow: mainTab === t.key ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                transition: "all 0.15s", whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </button>
          ))}
        </div></div>

        {saveError && <div className="errorBox" style={{ marginBottom: 12 }}>{saveError}</div>}

        {/* ── TAB: RECETTE (Food Cost + Recette fusionnés) ── */}
        {mainTab === "recette" && (
          <>
            {/* Food Cost & Marges */}
            <PizzaPricing
              costPerPizza={costPerPizza}
              totalWeightG={totalWeightG}
              cookedWeightG={cookedWeightG}
              onCookedWeightChange={setCookedWeightG}
              sellPriceEmporter={sellPriceEmporter}
              onSellPriceEmporterChange={setSellPriceEmporter}
              vatEmporter={vatEmporter}
              onVatEmporterChange={setVatEmporter}
              nbParts={nbParts}
              onNbPartsChange={setNbParts}
              costPerPart={costPerPart}
              sellCoeff={sellCoeff}
              onSellCoeffChange={setSellCoeff}
              derivedSellPerPart={derivedSellPerPart}
              derivedSellPerPizza={derivedSellPerPizza}
              foodCostPct={foodCostPct}
              fcTarget={fcTarget}
              onFcTargetChange={setFcTarget}
              margePerPart={margePerPart}
              prixTTCPart={prixTTCPart}
              vatRate={vatRate}
              onVatChange={setVatRate}
            />

            {/* Production mode toggle */}
            {isEdit && (
              <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
                <button type="button" className="btn" onClick={() => { setProdMode(m => !m); setProdQty(""); }}
                  style={prodMode ? { background: "#4a6741", color: "white", borderColor: "#4a6741" } : undefined}>
                  {prodMode ? "Mode normal" : "Mode production"}
                </button>
                {!prodMode && isEdit && userCanWrite && (
                  <button type="button" className="btn" onClick={handleDelete} style={{ color: "#d93f3f", fontSize: 12 }}>Supprimer</button>
                )}
              </div>
            )}

            {prodMode ? (
              <>
                {/* Banner */}
                <div style={{
                  background: "#4a6741", color: "white", borderRadius: 12,
                  padding: "12px 16px", marginBottom: 16,
                }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>Mode Production</div>
                  <div style={{ fontSize: 13, opacity: 0.85 }}>
                    {prodPivotIng
                      ? `Modifie ${prodPivotIng.name}, tout se recalcule`
                      : `${title} — appuie sur ☆ en mode normal pour choisir un pivot`}
                  </div>
                </div>

                {!pivotIngredientId || !prodPivotLine ? (
                  <div style={{
                    padding: "24px 16px", background: "rgba(0,0,0,0.03)", borderRadius: 12,
                    textAlign: "center", color: "#6f6a61", fontSize: 14, lineHeight: 1.7, marginBottom: 16,
                  }}>
                    Aucun ingredient pivot defini.<br />
                    Appuyez sur ☆ en mode normal pour en choisir un.
                  </div>
                ) : (
                  <>
                    <div style={{
                      background: "#FFFBEB", border: "2px solid #D97706",
                      borderRadius: 12, padding: 16, marginBottom: 12,
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#D97706", marginBottom: 6 }}>★ Ingredient pivot</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "#2d2d2d", marginBottom: 12 }}>
                        {prodPivotIng?.name ?? "—"}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <StepperInput
                          value={prodQty}
                          onChange={setProdQty}
                          step={1} min={0}
                          placeholder={String(prodPivotLine.qty)}
                        />
                        <span style={{ fontSize: 16, color: "#6f6a61", fontWeight: 600 }}>{prodPivotLine.unit}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#9a8f84" }}>
                        Recette de base : {prodPivotLine.qty} {prodPivotLine.unit}
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                      {prodValidLines.filter(l => l.ingredient_id !== pivotIngredientId).map(l => {
                        const ing = ingredients.find(i => i.id === l.ingredient_id);
                        const newQty = prodFactor !== null ? Math.round(Number(l.qty) * prodFactor) : null;
                        return (
                          <div key={l.id} style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            background: "white", border: "1px solid #EFEFEF", borderRadius: 10, padding: "10px 14px",
                          }}>
                            <span style={{ fontSize: 14, color: "#2d2d2d" }}>{truncate(ing?.name ?? "—", 35)}</span>
                            <span style={{ fontSize: 22, fontWeight: 800, color: "#4a6741" }}>
                              {newQty !== null ? `${newQty.toLocaleString("fr-FR")} ${l.unit}` : `${l.qty} ${l.unit}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {prodTotalW > 0 && (
                      <div style={{
                        background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10,
                        padding: "12px 16px", color: "#4a6741", fontWeight: 700, fontSize: 15, marginBottom: 16,
                      }}>
                        Poids total estime : {prodTotalW.toLocaleString("fr-FR")} g
                      </div>
                    )}
                  </>
                )}

                {steps.length > 0 && (
                  <div style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", border: "1px solid #e0d8ce", marginBottom: 14 }}>
                    <h3 style={{ margin: "0 0 12px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#777" }}>
                      Etapes
                    </h3>
                    <ol style={{ margin: 0, paddingLeft: 20 }}>
                      {steps.map((s, i) => (
                        <li key={i} style={{ marginBottom: 6, fontSize: 14, color: "#2d2d2d", lineHeight: 1.5 }}>{s}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </>
            ) : (
              /* ── MODE NORMAL ── */
              <>
                {/* Infos generales */}
                <div style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", border: "1px solid #e0d8ce", marginBottom: 14 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div>
                      <label className="label">Nom de la pizza</label>
                      <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Nom…" />
                    </div>
                    <div>
                      <label className="label">Empatement lie</label>
                      <SmartSelect
                        options={doughOptions}
                        value={doughRecipeId}
                        onChange={setDoughRecipeId}
                        placeholder="Choisir un empatement…"
                      />
                    </div>
                    {doughRecipeId && (
                      <div>
                        <label className="label">Poids paton (g)</label>
                        <StepperInput
                          value={ballWeightG}
                          onChange={setBallWeightG}
                          step={1} min={0}
                        />
                        {doughCostPerBall != null && (
                          <span style={{ marginLeft: 10, fontSize: 13, color: "#6f6a61" }}>
                            → Cout paton : {fmtMoney(doughCostPerBall)} €
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Ingredients Avant four + Apres four — shared drag context */}
                <DragDropContext onDragEnd={onCrossDragEnd}>
                  <div style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", border: "1px solid #e0d8ce", marginBottom: 14 }}>
                    <h3 style={{ margin: "0 0 12px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#777" }}>
                      Ingredients — Avant four
                    </h3>
                    <IngredientListDnD
                      droppableId="pre"
                      items={preLines}
                      ingredients={ingredients}
                      priceByIngredient={priceByIngredient}
                      units={PIZZA_UNITS}
                      onChange={setPreLines}
                      priceLabelByIngredient={priceLabelByIngredient}
                      pivotId={pivotIngredientId}
                      onPivotChange={setPivotIngredientId}
                      externalDragContext
                    />
                  </div>

                  <div style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", border: "1px solid #e0d8ce", marginBottom: 14 }}>
                    <h3 style={{ margin: "0 0 12px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#777" }}>
                      Ingredients — Apres four
                    </h3>
                    <IngredientListDnD
                      droppableId="post"
                      items={postLines}
                      ingredients={ingredients}
                      priceByIngredient={priceByIngredient}
                      units={PIZZA_UNITS}
                      onChange={setPostLines}
                      priceLabelByIngredient={priceLabelByIngredient}
                      pivotId={pivotIngredientId}
                      onPivotChange={setPivotIngredientId}
                      externalDragContext
                    />
                  </div>
                </DragDropContext>

                {/* Etapes */}
                <div style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", border: "1px solid #e0d8ce", marginBottom: 14 }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#777" }}>
                    Etapes
                  </h3>
                  <StepsList steps={steps} onChange={setSteps} />
                  <div style={{ marginTop: 12 }}>
                    <label className="label">Notes libres</label>
                    <textarea
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      rows={3}
                      placeholder="Notes additionnelles…"
                      style={{
                        width: "100%", borderRadius: 8, border: "1px solid rgba(217,199,182,0.8)",
                        padding: "8px 10px", fontSize: 14, background: "rgba(255,255,255,0.8)",
                        fontFamily: "inherit", resize: "vertical",
                      }}
                    />
                  </div>
                </div>

                {/* Allergenes */}
                <div style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", border: "1px solid #e0d8ce", marginBottom: 14 }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#777" }}>
                    Allergenes
                  </h3>
                  <AllergenBadges allergens={computedAllergens} />
                </div>

                {/* Photo */}
                <div style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", border: "1px solid #e0d8ce", marginBottom: 14 }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#777" }}>
                    Photo
                  </h3>
                  {photoPreview && (
                    <div style={{ marginBottom: 10 }}>
                      <Image src={photoPreview} alt="Photo pizza" width={200} height={150} style={{ borderRadius: 10, objectFit: "cover" }} />
                    </div>
                  )}
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoChange} />
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={photoUploading} className="btn">
                    {photoUploading ? "Envoi…" : photoPreview ? "Changer la photo" : "Ajouter une photo"}
                  </button>
                </div>

                {/* Bottom save */}
                <div style={{ paddingBottom: 32 }}>
                  {saveError && <div className="errorBox" style={{ marginBottom: 8 }}>{saveError}</div>}
                  {userCanWrite && (
                    <button onClick={handleSave} disabled={saving} className="btn btnPrimary w-full">
                      {saving ? "Sauvegarde…" : "Sauvegarder"}
                    </button>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </main>

      {showProdModal && pivotIngredientId && pizzaId && (
        <ProductionModal
          recipeType="pizza"
          recipeId={pizzaId}
          recipeName={title}
          pivotIngredientId={pivotIngredientId}
          onClose={() => setShowProdModal(false)}
        />
      )}
    </>
  );
}

// ── Pizza Pricing Panel — Hero KPI + Tiroir ─────────────────────
function PizzaPricing({
  costPerPizza, totalWeightG, cookedWeightG, onCookedWeightChange, sellPriceEmporter, onSellPriceEmporterChange, vatEmporter, onVatEmporterChange, nbParts, onNbPartsChange, costPerPart,
  sellCoeff, onSellCoeffChange,
  derivedSellPerPart, derivedSellPerPizza,
  foodCostPct, fcTarget, onFcTargetChange,
  margePerPart, prixTTCPart,
  vatRate, onVatChange,
}: {
  costPerPizza: number | null;
  totalWeightG?: number;
  cookedWeightG: number | "";
  onCookedWeightChange: (v: number | "") => void;
  sellPriceEmporter?: number | "";
  onSellPriceEmporterChange?: (v: number | "") => void;
  vatEmporter?: number;
  onVatEmporterChange?: (v: number) => void;
  nbParts: number;
  onNbPartsChange: (n: number) => void;
  costPerPart: number | null;
  sellCoeff: number | null;
  onSellCoeffChange: (c: number) => void;
  derivedSellPerPart: number | null;
  derivedSellPerPizza: number | null;
  foodCostPct: number | null;
  fcTarget: number;
  onFcTargetChange: (t: number) => void;
  margePerPart: number | null;
  prixTTCPart: number | null;
  vatRate: number;
  onVatChange: (r: number) => void;
}) {
  const [coeffLocal, setCoeffLocal] = useState(sellCoeff != null ? String(sellCoeff) : "");
  const [coeffEditing, setCoeffEditing] = useState(false);
  const [ttcLocal, setTtcLocal] = useState(prixTTCPart != null ? prixTTCPart.toFixed(2) : "");
  const [ttcEditing, setTtcEditing] = useState(false);
  const [paramsOpen, setParamsOpen] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!coeffEditing) setCoeffLocal(sellCoeff != null ? String(sellCoeff) : "");
  }, [sellCoeff, coeffEditing]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!ttcEditing) setTtcLocal(prixTTCPart != null ? prixTTCPart.toFixed(2) : "");
  }, [prixTTCPart, ttcEditing]);

  function applyTTC(ttcTyped: number) {
    if (!costPerPart || costPerPart <= 0) return;
    const coeff = ttcTyped / (costPerPart * (1 + vatRate));
    // 4 décimales : préserve la précision du TTC saisi.
    if (coeff > 0) onSellCoeffChange(Math.round(coeff * 10000) / 10000);
  }

  const fcColor = foodCostPct == null ? "#999"
    : foodCostPct <= fcTarget ? "#16a34a"
    : foodCostPct <= fcTarget + 5 ? "#D97706"
    : "#DC2626";
  const fcRatio = foodCostPct == null ? 0 : Math.min(1, foodCostPct / (fcTarget * 1.67));
  const margeColor = margePerPart != null && margePerPart > 0 ? "#16a34a" : "#999";

  const isMultiParts = nbParts > 1;
  const vatPct = Math.round(vatRate * 100);

  // Label style
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.08em" };
  const bigNum: React.CSSProperties = { fontSize: 26, fontWeight: 800, fontFamily: "var(--font-oswald), Oswald, sans-serif", lineHeight: 1.1, marginTop: 2 };

  return (
    <div style={{
      background: "#fff", borderRadius: 16, border: "1px solid #e0d8ce",
      marginBottom: 16, overflow: "hidden",
    }}>

      {/* ── Hero KPIs — 4 columns ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 0,
        padding: "20px 16px 16px",
      }}>
        {/* KPI 1: Cout/part */}
        <div style={{ textAlign: "center", padding: "0 4px" }}>
          <div style={lbl}>{isMultiParts ? "Cout / part" : "Cout pizza"}</div>
          <div style={{ ...bigNum, color: "#8B1A1A" }}>
            {costPerPart != null ? `${fmtMoney(costPerPart)}€` : (costPerPizza != null ? `${fmtMoney(costPerPizza)}€` : "-")}
          </div>
        </div>

        {/* KPI 2: Coeff */}
        <div style={{ textAlign: "center", padding: "0 4px", borderLeft: "1px solid #ece4d4" }}>
          <div style={lbl}>Coeff</div>
          <div style={{ ...bigNum, color: "#7C3AED" }}>
            {sellCoeff != null ? `×${sellCoeff.toFixed(2)}` : "-"}
          </div>
        </div>

        {/* KPI 3: Prix vente */}
        <div style={{ textAlign: "center", padding: "0 4px", borderLeft: "1px solid #ece4d4" }}>
          <div style={lbl}>{isMultiParts ? "Vente / part" : "Prix vente"}</div>
          <div style={{ ...bigNum, color: "#1a1a1a" }}>
            {prixTTCPart != null ? `${fmtMoney(prixTTCPart)}€` : "-"}
          </div>
          {derivedSellPerPart != null && (
            <div style={{ fontSize: 11, color: "#999", marginTop: 1 }}>
              {fmtMoney(derivedSellPerPart)}€ HT
            </div>
          )}
        </div>

        {/* KPI 4: Pizza entiere (si multi-parts) ou Marge */}
        <div style={{ textAlign: "center", padding: "0 4px", borderLeft: "1px solid #ece4d4" }}>
          {isMultiParts ? (
            <>
              <div style={lbl}>Pizza entiere</div>
              <div style={{ ...bigNum, color: "#1a1a1a" }}>
                {derivedSellPerPizza != null ? `${fmtMoney(derivedSellPerPizza * (1 + vatRate))}€` : "-"}
              </div>
              {derivedSellPerPizza != null && (
                <div style={{ fontSize: 11, color: "#999", marginTop: 1 }}>
                  {fmtMoney(derivedSellPerPizza)}€ HT
                </div>
              )}
            </>
          ) : (
            <>
              <div style={lbl}>Marge</div>
              <div style={{ ...bigNum, color: margeColor }}>
                {margePerPart != null ? `${fmtMoney(margePerPart)}€` : "-"}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Poids + Prix/kg + Cuisson ── */}
      {(totalWeightG ?? 0) > 0 && (
        <div style={{ borderTop: "1px solid #ece4d4", padding: "10px 16px" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 16, fontSize: 12, color: "#888", flexWrap: "wrap", alignItems: "center" }}>
            <span>Poids cru : <strong style={{ color: "#1a1a1a" }}>{(totalWeightG ?? 0) >= 1000 ? `${((totalWeightG ?? 0) / 1000).toFixed(2)} kg` : `${totalWeightG} g`}</strong></span>
            {costPerPizza != null && (totalWeightG ?? 0) > 0 && (
              <span>Prix/kg : <strong style={{ color: "#8B1A1A" }}>{fmtMoney(costPerPizza / (totalWeightG ?? 1) * 1000)}{"\u20AC"}</strong></span>
            )}
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              Poids cuit :
              <input type="number" value={cookedWeightG} onChange={e => onCookedWeightChange(e.target.value ? Number(e.target.value) : "")}
                placeholder="g" style={{ width: 60, padding: "3px 6px", borderRadius: 6, border: "1px solid #e0d8ce", fontSize: 12, textAlign: "center" }} />
              g
            </span>
            {cookedWeightG !== "" && Number(cookedWeightG) > 0 && (totalWeightG ?? 0) > 0 && (
              <span>Reduction : <strong style={{ color: "#D4775A" }}>{((1 - Number(cookedWeightG) / (totalWeightG ?? 1)) * 100).toFixed(0)}%</strong></span>
            )}
          </div>
        </div>
      )}

      {/* ── Food Cost + Marge bar ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0,
        borderTop: "1px solid #ece4d4",
      }}>
        {/* Food cost */}
        <div style={{ padding: "14px 16px", borderRight: "1px solid #ece4d4" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={lbl}>Food cost</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: fcColor, fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>
              {foodCostPct != null ? `${foodCostPct.toFixed(0)}%` : "-"}
            </span>
            <span style={{ fontSize: 10, color: "#bbb", marginLeft: "auto" }}>
              cible {fcTarget}%
            </span>
          </div>
          <div style={{ height: 5, background: "#ece4d4", borderRadius: 999, overflow: "hidden", marginTop: 8 }}>
            <div style={{ width: `${Math.min(100, fcRatio * 100)}%`, height: "100%", background: fcColor, borderRadius: 999, transition: "width 0.3s" }} />
          </div>
        </div>

        {/* Marge */}
        <div style={{ padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={lbl}>Marge brute</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: margeColor, fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>
              {margePerPart != null ? `${fmtMoney(margePerPart)}€` : "-"}
            </span>
            <span style={{ fontSize: 10, color: "#bbb", marginLeft: "auto" }}>
              {isMultiParts ? "/ part" : "/ pizza"}
            </span>
          </div>
          {isMultiParts && costPerPizza != null && (
            <div style={{ fontSize: 11, color: "#999", marginTop: 6 }}>
              Cout pizza : {fmtMoney(costPerPizza)}€
            </div>
          )}
        </div>
      </div>

      {/* ── Tiroir : Parametres de calcul ── */}
      <div style={{ borderTop: "1px solid #ece4d4" }}>
        <button
          type="button"
          onClick={() => setParamsOpen(!paramsOpen)}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 16px", background: "none", border: "none",
            cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#999",
            textTransform: "uppercase", letterSpacing: "0.06em",
          }}
        >
          <span>Parametres de calcul</span>
          <span style={{
            display: "inline-block", transition: "transform 0.2s",
            transform: paramsOpen ? "rotate(180deg)" : "rotate(0deg)",
            fontSize: 14,
          }}>&#9660;</span>
        </button>

        {paramsOpen && (
          <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Parts */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ ...lbl, minWidth: 44 }}>Parts</span>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {[1, 2, 4, 6, 8, 10, 12].map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onNbPartsChange(p)}
                    style={{
                      padding: "5px 11px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                      border: "1.5px solid",
                      borderColor: nbParts === p ? "#8B1A1A" : "#ddd6c8",
                      background: nbParts === p ? "rgba(139,26,26,0.08)" : "#fff",
                      color: nbParts === p ? "#8B1A1A" : "#6f6a61",
                      cursor: "pointer", minWidth: 34,
                    }}
                  >{p}</button>
                ))}
              </div>
            </div>

            {/* Coefficient */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ ...lbl, minWidth: 44 }}>Coeff</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: "#7C3AED", fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>×</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={coeffEditing ? coeffLocal : (sellCoeff != null ? sellCoeff.toFixed(2) : "")}
                  placeholder="3"
                  onFocus={(e) => {
                    setCoeffEditing(true);
                    setCoeffLocal(sellCoeff != null ? String(sellCoeff) : "");
                    setTimeout(() => e.target.select(), 0);
                  }}
                  onChange={(e) => {
                    const raw = e.target.value.replace(",", ".").replace(/[^\d.]/g, "");
                    setCoeffLocal(raw);
                    const n = Number(raw);
                    if (!isNaN(n) && n > 0) onSellCoeffChange(n);
                  }}
                  onBlur={() => {
                    setCoeffEditing(false);
                    const n = Number(coeffLocal);
                    if (!isNaN(n) && n > 0) onSellCoeffChange(n);
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
                  style={{
                    width: 56, fontSize: 20, fontWeight: 800, color: "#7C3AED",
                    fontFamily: "var(--font-oswald), Oswald, sans-serif",
                    border: "2px solid #e0d8ce", borderRadius: 10, padding: "3px 8px",
                    background: "#faf6ee", outline: "none",
                    fontVariantNumeric: "tabular-nums",
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {[2, 2.5, 3, 3.5, 4, 5].map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onSellCoeffChange(c)}
                    style={{
                      padding: "4px 10px", borderRadius: 10, fontSize: 11, fontWeight: 700,
                      border: "1.5px solid",
                      borderColor: sellCoeff === c ? "#7C3AED" : "#ddd6c8",
                      background: sellCoeff === c ? "rgba(124,58,237,0.08)" : "#fff",
                      color: sellCoeff === c ? "#7C3AED" : "#6f6a61",
                      cursor: "pointer",
                    }}
                  >×{c}</button>
                ))}
              </div>
            </div>

            {/* Prix TTC — saisir directement le prix, deduit le coeff */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ ...lbl, minWidth: 44 }}>Prix TTC</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="text"
                  inputMode="decimal"
                  value={ttcEditing ? ttcLocal : (prixTTCPart != null ? prixTTCPart.toFixed(2) : "")}
                  placeholder="12,00"
                  disabled={!costPerPart || costPerPart <= 0}
                  onFocus={(e) => {
                    setTtcEditing(true);
                    setTtcLocal(prixTTCPart != null ? prixTTCPart.toFixed(2) : "");
                    setTimeout(() => e.target.select(), 0);
                  }}
                  onChange={(e) => {
                    const raw = e.target.value.replace(",", ".").replace(/[^\d.]/g, "");
                    setTtcLocal(raw);
                    const n = Number(raw);
                    if (!isNaN(n) && n > 0) applyTTC(n);
                  }}
                  onBlur={() => {
                    setTtcEditing(false);
                    const n = Number(ttcLocal);
                    if (!isNaN(n) && n > 0) applyTTC(n);
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
                  style={{
                    width: 80, fontSize: 20, fontWeight: 800, color: "#1a1a1a",
                    fontFamily: "var(--font-oswald), Oswald, sans-serif",
                    border: "2px solid #e0d8ce", borderRadius: 10, padding: "3px 8px",
                    background: costPerPart && costPerPart > 0 ? "#faf6ee" : "#f0ebe2",
                    outline: "none", fontVariantNumeric: "tabular-nums",
                  }}
                />
                <span style={{ fontSize: 14, fontWeight: 700, color: "#6f6a61" }}>€</span>
              </div>
              <span style={{ fontSize: 10, color: "#999", fontStyle: "italic" }}>
                → ajuste automatiquement le coeff
              </span>
            </div>

            {/* TVA + FC cible */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ ...lbl, minWidth: 44 }}>TVA</span>
                <select
                  value={vatPct}
                  onChange={(e) => onVatChange(Number(e.target.value) / 100)}
                  style={{
                    padding: "4px 8px", borderRadius: 8, border: "1px solid #ddd6c8",
                    background: "#fff", fontSize: 12, fontWeight: 700, color: "#1a1a1a",
                    cursor: "pointer",
                  }}
                >
                  {[0, 5.5, 10, 20].map(v => (
                    <option key={v} value={v}>{v}%</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={lbl}>Cible FC</span>
                <input
                  type="number" min={5} max={80} step={1}
                  value={fcTarget}
                  onChange={(e) => onFcTargetChange(Number(e.target.value))}
                  style={{
                    width: 40, padding: "3px 6px", borderRadius: 8,
                    border: "1px solid #ddd6c8", background: "#fff",
                    fontSize: 12, fontWeight: 700, textAlign: "right", color: "#1a1a1a",
                  }}
                />
                <span style={{ fontSize: 12, color: "#999" }}>%</span>
              </div>
            </div>

            {/* Prix emporter */}
            {onSellPriceEmporterChange && (
              <div style={{ borderTop: "1px solid #ece4d4", paddingTop: 10, marginTop: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ ...lbl, minWidth: 80 }}>Prix emporter</span>
                  <input
                    type="number" step={0.5} min={0}
                    value={sellPriceEmporter ?? ""}
                    onChange={e => onSellPriceEmporterChange(e.target.value ? Number(e.target.value) : "")}
                    placeholder="TTC"
                    style={{ width: 70, padding: "4px 8px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14, fontWeight: 700, textAlign: "center" }}
                  />
                  <span style={{ fontSize: 12, color: "#999" }}>€ TTC</span>
                  <span style={{ ...lbl, marginLeft: 10 }}>TVA</span>
                  <select value={Math.round((vatEmporter ?? 0.055) * 100)} onChange={e => onVatEmporterChange?.(Number(e.target.value) / 100)}
                    style={{ padding: "4px 8px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    {[0, 5.5, 10, 20].map(v => <option key={v} value={v}>{v}%</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
