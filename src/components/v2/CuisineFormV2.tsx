"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { AllergenBadges } from "@/components/AllergenBadges";
import { parseAllergens, mergeAllergens } from "@/lib/allergens";
import { offerRowToCpu, enrichCpuWithConversions } from "@/lib/offerPricing";
import { formatCpuLabel, formatIngredientPriceLine } from "@/lib/formatPrice";
import type { LatestOffer } from "@/types/ingredients";
import { compressImage } from "@/lib/compressImage";

import { fetchApi } from "@/lib/fetchApi";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import { IngredientListDnD, normalizeUnit, type IngredientLine } from "./IngredientListDnD";
import { StepsList } from "./StepsList";
import { RecipeHero, HeroBtn, HeroDangerBtn } from "./RecipeHero";
import { PublishCatalogueButton } from "./PublishCatalogueButton";
import { StepperInput } from "@/components/StepperInput";
import type { Ingredient, Category } from "@/types/ingredients";
import type { CpuByUnit } from "@/lib/offerPricing";
import ProductionModal from "@/components/ProductionModal";

const CUISINE_UNITS = ["g", "cL", "pcs"];
const ACCENT = "#4a6741";

const BASE_CATEGORIES = [
  { id: "preparation",    label: "Préparation" },
  { id: "plat_cuisine",   label: "Plat cuisiné" },
  { id: "entree",         label: "Entrée" },
  { id: "accompagnement", label: "Accompagnement" },
  { id: "sauce",          label: "Sauce" },
  { id: "dessert",        label: "Dessert" },
  { id: "autre",          label: "Autre" },
];

function tmpId() { return `tmp-${Math.random().toString(36).slice(2)}`; }
function n2(v: unknown) { const x = Number(v); return Number.isFinite(x) ? x : 0; }
function round2(v: number) { return Math.round(v * 100) / 100; }
function fmtMoney(v: number) { return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function MetaField({ label, value, onChange, placeholder, full }: {
  label: string; value?: string; onChange: (v: string) => void; placeholder?: string; full?: boolean;
}) {
  return (
    <div style={full ? { gridColumn: "1 / -1" } : {}}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
      <input
        value={value ?? ""}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", padding: "8px 10px", borderRadius: 8,
          border: "1.5px solid #e5ddd0", fontSize: 13, background: "#fff",
          outline: "none", color: "#1a1a1a", boxSizing: "border-box",
        }}
      />
    </div>
  );
}

interface Props { recipeId?: string; initialProdMode?: boolean; initialCategory?: string; initialFicheType?: string; }

function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n) + "…" : s; }

export default function CuisineFormV2({ recipeId, initialProdMode, initialCategory, initialFicheType }: Props) {
  const router = useRouter();
  const { can } = useProfile();
  const userCanWrite = can("operations.edit_recettes");
  const { current: etab } = useEtablissement();
  const isEdit = !!recipeId;

  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState<unknown>(null);

  // Form state
  const [name, setName] = useState("");
  const [category, setCategory] = useState(initialCategory ?? "plat_cuisine");
  const [ficheType, setFicheType] = useState(initialFicheType ?? "recette");
  const [yieldGrams, setYieldGrams] = useState<number | "">("");
  const [portionsCount, setPortionsCount] = useState<number | "">("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  // Ingredients
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [priceByIngredient, setPriceByIngredient] = useState<Record<string, CpuByUnit>>({});
  const [priceLabelByIngredient, setPriceLabelByIngredient] = useState<Record<string, string>>({});
  const [supplierByIngredientMap, setSupplierByIngredient] = useState<Record<string, string | null>>({});
  const [lines, setLines] = useState<IngredientLine[]>([]);

  // Steps
  const [steps, setSteps] = useState<string[]>([]);

  // Dynamic categories (base + custom from DB)
  const [customCats, setCustomCats] = useState<{ id: string; label: string }[]>([]);
  const CATEGORIES = useMemo(() => {
    const baseIds = new Set(BASE_CATEGORIES.map(c => c.id));
    const extras = customCats.filter(c => !baseIds.has(c.id));
    return [...BASE_CATEGORIES, ...extras];
  }, [customCats]);

  useEffect(() => {
    supabase.from("kitchen_recipes").select("category").eq("is_active", true)
      .then(({ data }) => {
        const cats = new Set<string>();
        for (const r of data ?? []) if (r.category) cats.add(r.category);
        const baseIds = new Set(BASE_CATEGORIES.map(c => c.id));
        setCustomCats([...cats].filter(c => !baseIds.has(c)).map(c => ({
          id: c, label: c.replace(/_/g, " ").replace(/\b\w/g, ch => ch.toUpperCase()),
        })));
      });
  }, []);

  // Metadata (vin/boisson specific fields)
  const [meta, setMeta] = useState<Record<string, string>>({});
  const updateMeta = (k: string, v: string) => setMeta(prev => ({ ...prev, [k]: v }));

  // Pricing
  const [vatRate, setVatRate] = useState(0.1);
  const [fcTarget, setFcTarget] = useState(30);
  const [sellCoeff, setSellCoeff] = useState<number | null>(null);
  const [pricingMode, setPricingMode] = useState<"portion" | "kg">("portion");

  // Production mode
  const [prodMode, setProdMode] = useState(initialProdMode ?? false);
  const [showProdModal, setShowProdModal] = useState(initialProdMode ?? false);
  const [pivotIngredientId, setPivotIngredientId] = useState<string | null>(null);
  const [prodQty, setProdQty] = useState<number | "">("");

  // Main tab
  type MainTab = "recette";
  const [mainTab] = useState<MainTab>("recette");

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Index ingredient (linked catalog entry)
  const [indexIngredientId, setIndexIngredientId] = useState<string | null>(null);
  const [indexMsg, setIndexMsg] = useState<string | null>(null);
  const [indexSaving, setIndexSaving] = useState(false);

  const fileRef = useRef<HTMLInputElement | null>(null);
  // Track the actually-saved recipe id across renders to prevent re-inserting
  // on subsequent Save clicks when the component stays mounted.
  const savedIdRef = useRef<string | null>(recipeId ?? null);

  // Computed allergens
  const computedAllergens = useMemo(() => {
    const allLists = lines
      .map(l => ingredients.find(i => i.id === l.ingredient_id))
      .filter(Boolean)
      .map(i => parseAllergens((i as Ingredient).allergens))
      .filter((a): a is string[] => Array.isArray(a));
    return mergeAllergens(allLists);
  }, [lines, ingredients]);

  // Computed costs — uses same enrichment logic as IngredientListDnD.computeCost
  const totalCost = useMemo(() => {
    return lines.reduce((acc, l) => {
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
      if (eff.pcs == null && eff.g != null && pwg && pwg > 0) eff.pcs = eff.g * pwg;
      if (eff.pcs == null && eff.ml != null && pvm && pvm > 0) eff.pcs = eff.ml * pvm;

      if ((unit === "g" || unit === "kg") && eff.g) return acc + eff.g * (unit === "kg" ? qty * 1000 : qty);
      if ((unit === "cl" || unit === "ml" || unit === "l") && eff.ml) {
        const factor = unit === "cl" ? 10 : unit === "l" ? 1000 : 1;
        return acc + eff.ml * qty * factor;
      }
      if ((unit === "pc" || unit === "pcs") && eff.pcs) return acc + eff.pcs * qty;
      return acc;
    }, 0);
  }, [lines, priceByIngredient, ingredients]);

  // Poids total ingrédients (g + conversion cL/mL/L via densité, défaut 1g/mL)
  const totalWeightG = useMemo(() => {
    return lines.reduce((acc, l) => {
      if (!l.ingredient_id || l.qty === "" || !(Number(l.qty) > 0)) return acc;
      const qty = Number(l.qty);
      const unit = l.unit.toLowerCase();
      if (unit === "g") return acc + qty;
      if (unit === "kg") return acc + qty * 1000;
      if (unit === "cl" || unit === "ml" || unit === "l") {
        const ing = ingredients.find(i => i.id === l.ingredient_id);
        const dens = ing?.density_g_per_ml ?? 1; // défaut 1g/mL (eau)
        const ml = unit === "cl" ? qty * 10 : unit === "l" ? qty * 1000 : qty;
        return acc + ml * dens;
      }
      return acc;
    }, 0);
  }, [lines, ingredients]);

  const yieldG = yieldGrams !== "" ? Number(yieldGrams) : null;
  const portions = portionsCount !== "" ? Number(portionsCount) : null;
  const costPerKg = yieldG && yieldG > 0 && totalCost > 0 ? round2((totalCost / yieldG) * 1000) : null;
  const costPerPortion = portions && portions > 0 && totalCost > 0 ? round2(totalCost / portions) : null;

  // Load data
  useEffect(() => {
    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { setStatus("error"); setError({ message: "NOT_LOGGED" }); return; }

      const myEstab = etab?.slug?.includes("piccola") ? "piccola" : "bellomio";
      const ingsQ = supabase.from("ingredients").select("*").eq("is_active", true)
        .or(`establishments.cs.{"${myEstab}"},establishments.is.null`);
      const offQ = supabase.from("v_latest_offers").select("*");
      const [{ data: ingsData, error: iErr }, { data: offers, error: oErr }] = await Promise.all([
        ingsQ.order("name"),
        offQ,
      ]);
      if (iErr) { setStatus("error"); setError(iErr); return; }
      if (oErr) { console.error("offers query:", oErr); }

      const ingList = (ingsData ?? []) as Ingredient[];
      setIngredients(ingList);

      const offerList = (offers ?? []) as Record<string, unknown>[];
      const supplierIds = Array.from(new Set(offerList.map(o => String(o.supplier_id ?? "")).filter(Boolean)));
      const supplierNameById: Record<string, string> = {};
      if (supplierIds.length) {
        const { data: sups, error: supErr } = await supabase.from("suppliers").select("id,name").in("id", supplierIds);
        if (supErr) { console.error("suppliers query:", supErr); }
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
      // Enrichissement supplémentaire avec les méta de l'ingrédient (piece_weight_g, density)
      // afin de convertir les offres en €/pc vers €/kg quand l'ingrédient porte le poids pièce.
      for (const i of ingList) {
        const cpu = pm[i.id];
        if (!cpu) continue;
        const meta = metaM[i.id] ?? {};
        const pwg = meta.piece_weight_g ?? i.piece_weight_g ?? null;
        const dens = meta.density_kg_per_l ?? i.density_g_per_ml ?? null;
        pm[i.id] = enrichCpuWithConversions({ piece_weight_g: pwg, density_kg_per_l: dens }, cpu);
        metaM[i.id] = { piece_weight_g: pwg, density_kg_per_l: dens };
      }
      // Fallback 1 : purchase_price / purchase_unit depuis l'ingrédient
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
          const [{ data: krAll, error: krErr }, { data: prAll, error: prErr }] = await Promise.all([krQ, prQ]);
          if (krErr) { console.error("kitchen_recipes query:", krErr); }
          if (prErr) { console.error("prep_recipes query:", prErr); }
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
          // prep_recipes n'a pas total_cost — on résout le coût via l'ingrédient lié (purchase_price)
          for (const pr of (prAll ?? []) as Array<{ name: string | null; output_ingredient_id: string | null }>) {
            // Try to get cost from the linked ingredient's purchase_price
            let cpuG = 0;
            if (pr.output_ingredient_id) {
              const ing = ingList.find(i => i.id === pr.output_ingredient_id);
              if (ing?.purchase_price && ing.purchase_price > 0 && ing.purchase_unit_label === "kg") {
                cpuG = ing.purchase_price / 1000; // €/kg → €/g
              }
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

      setPriceByIngredient(pm);
      setSupplierByIngredient(supplierByIng);

      // Pour le LABEL on utilise la même fonction que la page /ingredients
      // (formatIngredientPriceLine via formatIngredientPrice → fromOffer/fromLegacy),
      // garantissant la cohérence d'affichage (€/kg, €/L) et l'utilisation correcte
      // de piece_weight_g / piece_volume_ml depuis l'offre OU l'ingrédient.
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

      // Load existing recipe if editing
      if (recipeId) {
        const [{ data: rec }, { data: recLines }] = await Promise.all([
          supabase.from("kitchen_recipes").select("*").eq("id", recipeId).single(),
          supabase.from("kitchen_recipe_lines").select("*").eq("recipe_id", recipeId).order("sort_order"),
        ]);
        if (rec) {
          const r = rec as Record<string, unknown>;
          setName(String(r.name ?? ""));
          setCategory(String(r.category ?? "plat_cuisine"));
          if (r.fiche_type) setFicheType(String(r.fiche_type));
          if (r.metadata && typeof r.metadata === "object") {
            const m: Record<string, string> = {};
            for (const [k, v] of Object.entries(r.metadata as Record<string, unknown>)) {
              if (typeof v === "string") m[k] = v;
            }
            setMeta(m);
          }
          setYieldGrams(r.yield_grams ? Number(r.yield_grams) : "");
          setPortionsCount(r.portions_count ? Number(r.portions_count) : "");
          // establishments auto-assigned from current etab context
          setPhotoUrl(String(r.photo_url ?? ""));
          if (r.photo_url) setPhotoPreview(String(r.photo_url));
          if (r.vat_rate) setVatRate(Number(r.vat_rate));
          if (r.margin_rate) {
            const mr = Number(r.margin_rate);
            if (mr > 0) setSellCoeff(mr);
          }
          if (r.nb_parts != null) {
            const np = Number(r.nb_parts);
            if (np === 0) setPricingMode("kg");
            else setPricingMode("portion");
          }
          if (r.procedure) {
            try { setSteps(JSON.parse(String(r.procedure)) as string[]); } catch { setSteps([]); }
          }
          setPivotIngredientId(String(r.pivot_ingredient_id ?? "") || null);
        }
        if (recLines) {
          setLines((recLines as Array<Record<string, unknown>>).map((l, i) => {
            const rawUnit = String(l.unit ?? "g");
            const nu = normalizeUnit(rawUnit);
            let rawQty: number | "" = n2(l.qty) || "";
            if (rawUnit.toLowerCase() === "ml" && typeof rawQty === "number" && rawQty > 0) rawQty = round2(rawQty / 10);
            return { id: String(l.id ?? tmpId()), ingredient_id: String(l.ingredient_id ?? ""), qty: rawQty, unit: nu, sort_order: n2(l.sort_order) || i };
          }));
        }

        // Check if ingredient in catalog linked to this recipe
        const recRow = rec as Record<string, unknown>;
        let linkedIngId: string | null = null;
        // 1) source + recipe_id
        const { data: bySource } = await supabase
          .from("ingredients").select("id")
          .eq("source", "recette_maison").eq("recipe_id", recipeId)
          .limit(1);
        if (bySource?.[0]) {
          linkedIngId = bySource[0].id;
        }
        // 2) output_ingredient_id on the recipe
        if (!linkedIngId && recRow.output_ingredient_id) {
          linkedIngId = String(recRow.output_ingredient_id);
        }
        // 3) name match (case-insensitive)
        if (!linkedIngId && recRow.name) {
          const { data: byName } = await supabase
            .from("ingredients").select("id")
            .ilike("name", String(recRow.name))
            .in("category", ["preparation", "sauce"])
            .eq("is_active", true)
            .limit(1);
          if (byName?.[0]) linkedIngId = byName[0].id;
        }
        if (linkedIngId) setIndexIngredientId(linkedIngId);
      }

      setStatus("ok");
    }
    load();
  }, [recipeId, etab]);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    try {
      const compressed = await compressImage(file);
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id ?? "anon";
      const ts = Date.now();
      const path = recipeId ? `${uid}/kitchen/${recipeId}.jpg` : `${uid}/kitchen/${ts}.jpg`;
      const { error: upErr } = await supabase.storage.from("recipe-images").upload(path, compressed, { upsert: true, contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("recipe-images").getPublicUrl(path);
      const url = urlData.publicUrl;
      setPhotoUrl(url);
      setPhotoPreview(url);
    } catch (err) {
      console.error("Photo upload error:", err);
    } finally {
      setPhotoUploading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("NOT_LOGGED");

      const margin_rate = sellCoeff && sellCoeff > 0 ? round2(sellCoeff) : 0;
      const totalCostRounded = round2(totalCost);

      const payload: Record<string, unknown> = {
        name: name || "Nouvelle recette",
        category,
        fiche_type: ficheType,
        metadata: Object.keys(meta).length > 0 ? meta : {},
        yield_grams: yieldGrams !== "" ? Math.round(Number(yieldGrams)) : 0,
        portions_count: portionsCount !== "" ? Math.round(Number(portionsCount)) : 0,
        establishments: etab ? [etab.slug] : ["bellomio"],
        vat_rate: vatRate,
        margin_rate,
        total_cost: totalCostRounded > 0 ? totalCostRounded : null,
        cost_per_kg: costPerKg,
        cost_per_portion: costPerPortion,
        sell_price: derivedSellPerUnit ?? null,
        nb_parts: pricingMode === "kg" ? 0 : (portions && portions > 0 ? Math.round(portions) : 1),
        photo_url: photoUrl || null,
        procedure: steps.length > 0 ? JSON.stringify(steps) : null,
        is_draft: false,
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      let rid = savedIdRef.current ?? recipeId;
      if (rid) {
        const { error } = await supabase.from("kitchen_recipes").update(payload).eq("id", rid);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("kitchen_recipes")
          .insert({ ...payload, user_id: auth.user.id, ...(etab ? { etablissement_id: etab.id } : {}) })
          .select("id").single<{ id: string }>();
        if (error) throw error;
        rid = data.id;
        savedIdRef.current = rid;
      }

      // Save pivot (column added by migration — silent failure if not yet applied)
      await supabase.from("kitchen_recipes").update({ pivot_ingredient_id: pivotIngredientId }).eq("id", rid!);

      // Upsert lines
      await supabase.from("kitchen_recipe_lines").delete().eq("recipe_id", rid!);
      const validLines = lines.filter(l => l.ingredient_id && l.qty !== "" && Number(l.qty) > 0);
      if (validLines.length > 0) {
        const payload = validLines.map((l, i) => ({
          recipe_id: rid!,
          ingredient_id: l.ingredient_id,
          qty: Number(l.qty),
          // Force canonical unit (g / cL / pcs) to satisfy the DB check
          unit: normalizeUnit(l.unit),
          sort_order: i,
        }));
        const { error: lErr } = await supabase.from("kitchen_recipe_lines").insert(payload);
        if (lErr) {
          console.error("[kitchen_recipe_lines] insert payload:", payload);
          throw lErr;
        }
      }

      // Sync ingredient catalog — update linked ingredient with cost/kg
      try {
        const CAT_MAP: Record<string, Category> = {
          preparation: "preparation", sauce: "sauce", autre: "autre",
        };
        const ingCat: Category = CAT_MAP[category] ?? "preparation";
        const recipeName = name || "Nouvelle recette";
        // Si la prépa a un rendement ET un nb de portions, déduire le poids
        // d'une portion (= piece_weight_g sur l'ingrédient). Permet de
        // sélectionner cette prépa en `pcs` dans une recette parente.
        const pieceWeightG = yieldG && yieldG > 0 && portions && portions > 0
          ? round2(yieldG / portions)
          : null;
        const ingUpdate = {
          name: recipeName,
          category: ingCat,
          purchase_price: costPerKg ?? null,
          purchase_unit: 1,
          purchase_unit_label: "kg" as const,
          purchase_unit_name: "kg" as const,
          source: "recette_maison",
          recipe_id: rid!,
          piece_weight_g: pieceWeightG,
        };

        // Strategy 1: already known from load or previous save
        let existingId = indexIngredientId;

        // Strategy 2: source + recipe_id
        if (!existingId) {
          const { data } = await supabase
            .from("ingredients").select("id")
            .eq("source", "recette_maison").eq("recipe_id", rid!)
            .limit(1);
          existingId = data?.[0]?.id ?? null;
        }

        // Strategy 3: name match in preparation/sauce categories
        if (!existingId) {
          const { data } = await supabase
            .from("ingredients").select("id")
            .ilike("name", recipeName)
            .in("category", ["preparation", "sauce"])
            .eq("is_active", true)
            .limit(1);
          existingId = data?.[0]?.id ?? null;
        }

        if (existingId) {
          const { error: updErr } = await supabase.from("ingredients").update(ingUpdate).eq("id", existingId);
          if (updErr) console.warn("Ingredient sync update failed:", updErr);
          setIndexIngredientId(existingId);
          await supabase.from("kitchen_recipes").update({ output_ingredient_id: existingId }).eq("id", rid!);
        } else if (costPerKg && costPerKg > 0) {
          const { data: newIng, error: insErr } = await supabase.from("ingredients").insert({
            ...ingUpdate,
            is_active: true,
            allergens: null,
            default_unit: "g",
            density_g_per_ml: null,
            piece_volume_ml: null,
            supplier_id: null,
            ...(etab ? { etablissement_id: etab.id } : {}),
          }).select("id").single<{ id: string }>();
          if (insErr) console.warn("Ingredient sync insert failed:", insErr);
          if (newIng) {
            setIndexIngredientId(newIng.id);
            await supabase.from("kitchen_recipes").update({ output_ingredient_id: newIng.id }).eq("id", rid!);
          }
        }
      } catch (e) {
        console.warn("[SYNC] failed:", e);
      }

      if (!isEdit && !recipeId) router.replace(`/recettes/cuisine/${rid}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message
        : (err as { message?: string })?.message ?? JSON.stringify(err);
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!recipeId) return;
    if (!window.confirm("Supprimer cette fiche cuisine ?")) return;
    await supabase.from("kitchen_recipe_lines").delete().eq("recipe_id", recipeId);
    await supabase.from("kitchen_recipes").delete().eq("id", recipeId);
    router.push("/recettes?tab=cuisine");
  }

  async function handleExportPdf() {
    if (!recipeId) return;
    setPdfLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { alert("Non authentifié"); return; }
      const res = await fetchApi("/api/kitchen/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ recipeId }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({ message: "Erreur inconnue" })); alert(`Erreur PDF: ${e.message}`); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(name || "cuisine").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally { setPdfLoading(false); }
  }


  async function handleIndexSave() {
    if (!recipeId) return;
    setIndexSaving(true);
    setIndexMsg(null);
    try {
      const CAT_MAP: Record<string, Category> = {
        preparation: "preparation", sauce: "sauce", autre: "autre",
      };
      const ingCat: Category = CAT_MAP[category] ?? "preparation";
      const pieceWeightG = yieldG && yieldG > 0 && portions && portions > 0
        ? round2(yieldG / portions)
        : null;

      if (indexIngredientId) {
        await supabase.from("ingredients").update({
          name: name || "Nouvelle recette",
          category: ingCat,
          purchase_price: costPerKg ?? null,
          purchase_unit: 1,
          purchase_unit_label: "kg",
          purchase_unit_name: "kg",
          piece_weight_g: pieceWeightG,
        }).eq("id", indexIngredientId);
      } else {
        const { data: newIng, error: insErr } = await supabase.from("ingredients").insert({
          name: name || "Nouvelle recette",
          category: ingCat,
          purchase_price: costPerKg ?? null,
          purchase_unit: 1,
          purchase_unit_label: "kg",
          purchase_unit_name: "kg",
          source: "recette_maison",
          recipe_id: recipeId,
          is_active: true,
          allergens: null,
          default_unit: "g",
          density_g_per_ml: null,
          piece_weight_g: pieceWeightG,
          piece_volume_ml: null,
          supplier_id: null,
          ...(etab ? { etablissement_id: etab.id } : {}),
        }).select("id").single<{ id: string }>();
        if (insErr) throw insErr;
        setIndexIngredientId(newIng.id);
        // Link output_ingredient_id on the kitchen_recipe
        await supabase.from("kitchen_recipes").update({ output_ingredient_id: newIng.id }).eq("id", recipeId);
      }

      setIndexMsg(costPerKg ? `Index mis à jour — ${fmtMoney(costPerKg)} €/kg` : "Ajouté à l'index (prix non calculé)");
      setTimeout(() => setIndexMsg(null), 5000);
    } catch (err) {
      setIndexMsg("Erreur : " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIndexSaving(false);
    }
  }

  const ficheLabel = ficheType === "vin" ? "vin" : ficheType === "boisson" ? "boisson" : ficheType === "cocktail" ? "cocktail" : "cuisine";
  const title = name || `Nouvelle fiche ${ficheLabel}`;
  const isBarType = ficheType === "vin" || ficheType === "boisson" || ficheType === "cocktail";
  const ficheAccent = isBarType ? "#D4775A" : ACCENT;

  // ── Production mode computations ───────────────────────────────────────
  const prodPivotLine = pivotIngredientId
    ? lines.find(l => l.ingredient_id === pivotIngredientId && l.qty !== "" && Number(l.qty) > 0) ?? null
    : null;
  const prodPivotIng = pivotIngredientId
    ? ingredients.find(i => i.id === pivotIngredientId) ?? null
    : null;
  const prodFactor = prodPivotLine && prodQty !== "" && Number(prodQty) > 0
    ? Number(prodQty) / Number(prodPivotLine.qty)
    : null;
  const prodValidLines = lines.filter(l => l.ingredient_id && l.qty !== "" && Number(l.qty) > 0);
  const prodTotalW = prodValidLines.reduce((acc, l) => {
    const qty = prodFactor !== null ? Math.round(Number(l.qty) * prodFactor) : Number(l.qty);
    const unit = l.unit.toLowerCase();
    return unit === "g" ? acc + qty : acc;
  }, 0);

  // ── KPI computations ──────────────────────────────────────────
  // Portion mode: totalCost / portions_count = costPerPart, × coeff = sellPerPart
  // Kg mode: costPerKg × coeff = sellPerKg
  const effectiveParts = pricingMode === "portion" ? (portions && portions > 0 ? portions : 1) : 1;
  const baseCost = pricingMode === "kg" ? costPerKg : (totalCost > 0 ? round2(totalCost / effectiveParts) : null);
  const derivedSellPerUnit = baseCost && sellCoeff && sellCoeff > 0 ? round2(baseCost * sellCoeff) : null;
  const derivedSellTotal = pricingMode === "portion" && derivedSellPerUnit && effectiveParts > 1
    ? round2(derivedSellPerUnit * effectiveParts) : null;
  const foodCostPct = baseCost && derivedSellPerUnit ? round2((baseCost / derivedSellPerUnit) * 100) : null;
  const margePerUnit = baseCost && derivedSellPerUnit ? round2(derivedSellPerUnit - baseCost) : null;
  const prixTTCUnit = derivedSellPerUnit ? round2(derivedSellPerUnit * (1 + vatRate)) : null;

  const categoryLabel = CATEGORIES.find(c => c.id === category)?.label ?? category;

  // Tab definitions — same in create and edit (cmd & pop tabs require existing recipe)

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
          accent={ficheAccent}
          isEdit={true}
          photoPreview={photoPreview}
          etabName={etab?.nom}
          typeLabel={ficheType === "vin" || ficheType === "boisson" ? ficheLabel : categoryLabel}
          onBack={() => router.push("/recettes")}
          actions={<>
            {isEdit && pivotIngredientId && <HeroBtn onClick={() => setShowProdModal(true)}>Production</HeroBtn>}
            <HeroBtn onClick={handleExportPdf} disabled={!isEdit || pdfLoading} title={!isEdit ? "Enregistrer la recette pour exporter le PDF" : undefined}>{pdfLoading ? "Export…" : "PDF"}</HeroBtn>
            <HeroBtn onClick={() => router.push("/catalogue/fiches")} title="Voir le catalogue salle">Catalogue Salle</HeroBtn>
            {isEdit ? <PublishCatalogueButton recipeType="cuisine" recipeId={recipeId!} /> : <HeroBtn disabled title="Enregistrer la recette pour publier au catalogue">Catalogue</HeroBtn>}
            {userCanWrite && <HeroBtn onClick={handleSave} disabled={saving} primary>{saving ? "Sauvegarde…" : "Enregistrer"}</HeroBtn>}
            {isEdit && userCanWrite && (
              <HeroDangerBtn onClick={async () => {
                if (!confirm("Supprimer cette recette ? Cette action est irreversible.")) return;
                const { error } = await supabase.from("kitchen_recipes").delete().eq("id", recipeId);
                if (error) { alert(error.message); return; }
                router.push("/recettes");
              }}>Supprimer</HeroDangerBtn>
            )}
          </>}
        />

        {saveError && <div className="errorBox" style={{ marginBottom: 12 }}>{saveError}</div>}

        {/* ── TAB: RECETTE (Food Cost + Recette fusionnés) ── */}
        {mainTab === "recette" && (
          <>
            {/* Food Cost & Marges */}
            <CuisinePricing
              pricingMode={pricingMode}
              onPricingModeChange={setPricingMode}
              totalCost={totalCost > 0 ? round2(totalCost) : null}
              costPerKg={costPerKg}
              baseCost={baseCost}
              portions={portions}
              onPortionsChange={(n) => setPortionsCount(n)}
              sellCoeff={sellCoeff}
              onSellCoeffChange={setSellCoeff}
              derivedSellPerUnit={derivedSellPerUnit}
              derivedSellTotal={derivedSellTotal}
              foodCostPct={foodCostPct}
              fcTarget={fcTarget}
              onFcTargetChange={setFcTarget}
              margePerUnit={margePerUnit}
              prixTTCUnit={prixTTCUnit}
              vatRate={vatRate}
              onVatChange={setVatRate}
              yieldGrams={typeof yieldGrams === "number" ? yieldGrams : null}
            />
          </>
        )}
        {mainTab === "recette" && (
          <>
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
                  background: ficheAccent, color: "white", borderRadius: 12,
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
                    textAlign: "center", color: "#6f6a61", fontSize: 14, lineHeight: 1.7,
                    marginBottom: 16,
                  }}>
                    Aucun ingrédient pivot défini.<br />
                    Appuyez sur ☆ en mode normal pour en choisir un.
                  </div>
                ) : (
                  <>
                    {/* Pivot card */}
                    <div style={{
                      background: "#FFFBEB", border: "2px solid #D97706",
                      borderRadius: 12, padding: 16, marginBottom: 12,
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#D97706", marginBottom: 6 }}>★ Ingrédient pivot</div>
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

                    {/* Secondary ingredients */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                      {prodValidLines
                        .filter(l => l.ingredient_id !== pivotIngredientId)
                        .map(l => {
                          const ing = ingredients.find(i => i.id === l.ingredient_id);
                          const newQty = prodFactor !== null ? Math.round(Number(l.qty) * prodFactor) : null;
                          return (
                            <div key={l.id} style={{
                              display: "flex", justifyContent: "space-between", alignItems: "center",
                              background: "white", border: "1px solid #EFEFEF", borderRadius: 10, padding: "10px 14px",
                            }}>
                              <span style={{ fontSize: 14, color: "#2d2d2d" }}>{truncate(ing?.name ?? "—", 35)}</span>
                              <span style={{ fontSize: 22, fontWeight: 800, color: "#4a6741" }}>
                                {newQty !== null
                                  ? `${newQty.toLocaleString("fr-FR")} ${l.unit}`
                                  : `${l.qty} ${l.unit}`}
                              </span>
                            </div>
                          );
                        })
                      }
                    </div>

                    {/* Total */}
                    {prodTotalW > 0 && (
                      <div style={{
                        background: "#F0FDF4", border: "1px solid #BBF7D0",
                        borderRadius: 10, padding: "12px 16px",
                        color: "#4a6741", fontWeight: 700, fontSize: 15, marginBottom: 16,
                      }}>
                        Poids total estimé : {prodTotalW.toLocaleString("fr-FR")} g
                      </div>
                    )}
                  </>
                )}

                {/* Steps (read-only in production) */}
                {steps.length > 0 && (
                  <div style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", border: "1px solid #e0d8ce", marginBottom: 14 }}>
                    <h3 style={{ margin: "0 0 12px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#777" }}>
                      Étapes
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
                {/* Header recette : nom + categorie + stats */}
                <div style={{
                  background: "#fff", borderRadius: 16, padding: "24px 24px 20px",
                  border: "1px solid #e0d8ce", marginBottom: 14,
                }}>
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: "#999",
                    textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8,
                  }}>
                    {ficheType === "vin" ? "Vin" : ficheType === "boisson" ? "Boisson" : (CATEGORIES.find(c => c.id === category)?.label ?? "Recette")}
                  </div>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Nom de la recette…"
                    style={{
                      width: "100%", border: "none", outline: "none", background: "transparent",
                      fontSize: 28, fontWeight: 700, color: "#1a1a1a",
                      fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                      padding: 0, marginBottom: 14,
                    }}
                  />

                  {/* Vin/Boisson metadata fields */}
                  {(ficheType === "vin" || ficheType === "boisson") && (
                    <div style={{
                      display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
                      marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #f0ebe2",
                    }}>
                      {ficheType === "vin" && (<>
                        <MetaField label="Domaine" value={meta.domaine} onChange={v => updateMeta("domaine", v)} placeholder="Ex: Scrimaglio" />
                        <MetaField label="Region" value={meta.region} onChange={v => updateMeta("region", v)} placeholder="Ex: Piémont" />
                        <MetaField label="Cepage" value={meta.cepage} onChange={v => updateMeta("cepage", v)} placeholder="Ex: 100% Arneis" />
                        <MetaField label="Appellation" value={meta.appellation} onChange={v => updateMeta("appellation", v)} placeholder="Ex: Langhe DOC" />
                        <MetaField label="Accords" value={meta.accords} onChange={v => updateMeta("accords", v)} placeholder="Ex: Fruits de mer, fromages" full />
                        <MetaField label="Descriptif" value={meta.descriptif} onChange={v => updateMeta("descriptif", v)} placeholder="Notes de dégustation..." full />
                        <MetaField label="Anecdote" value={meta.anecdote} onChange={v => updateMeta("anecdote", v)} placeholder="Histoire du vin..." full />
                        <MetaField label="Temperature" value={meta.temperature} onChange={v => updateMeta("temperature", v)} placeholder="Ex: 8-10°C" />
                        <MetaField label="Millesime" value={meta.millesime} onChange={v => updateMeta("millesime", v)} placeholder="Ex: 2022" />
                      </>)}
                      {ficheType === "boisson" && (<>
                        <MetaField label="Type" value={meta.type_boisson} onChange={v => updateMeta("type_boisson", v)} placeholder="Ex: IPA, Lager, Limonade" />
                        <MetaField label="Provenance" value={meta.provenance} onChange={v => updateMeta("provenance", v)} placeholder="Ex: Bretagne" />
                        <MetaField label="Volume" value={meta.volume} onChange={v => updateMeta("volume", v)} placeholder="Ex: 33cL, 75cL" />
                        <MetaField label="Descriptif" value={meta.descriptif} onChange={v => updateMeta("descriptif", v)} placeholder="Description..." full />
                      </>)}
                    </div>
                  )}

                  {/* Stats inline */}
                  {ficheType !== "vin" && ficheType !== "boisson" && <div style={{
                    display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center",
                    paddingBottom: 14, marginBottom: 14, borderBottom: "1px solid #f0ebe2",
                  }}>
                    <RecipeStat label="Rendement" value={
                      <StepperInput value={yieldGrams} onChange={setYieldGrams} step={50} min={0} placeholder="0" />
                    } unit="g" extra={totalWeightG > 0 && (
                      <button
                        type="button"
                        onClick={() => setYieldGrams(Math.round(totalWeightG))}
                        title={`= ${Math.round(totalWeightG)} g`}
                        style={{
                          padding: "0 8px", height: 24, borderRadius: 6, fontSize: 10, fontWeight: 700,
                          border: "1px solid #4a6741", background: "rgba(74,103,65,0.08)",
                          color: "#4a6741", cursor: "pointer", whiteSpace: "nowrap",
                        }}
                      >= ingrédients</button>
                    )} />
                    <RecipeStat label="Portions" value={
                      <StepperInput value={portionsCount} onChange={setPortionsCount} step={1} min={1} placeholder="1" />
                    } />
                    {lines.length > 0 && (
                      <RecipeStat label="Ingrédients" value={
                        <span style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                          {lines.filter(l => l.ingredient_id).length}
                        </span>
                      } />
                    )}
                  </div>}

                  {/* Categorie pills — hidden for vin/boisson */}
                  {ficheType !== "vin" && ficheType !== "boisson" && (
                  <div style={{ display: "inline-flex", flexWrap: "wrap", gap: 4, padding: 4, background: "#f5f0e8", borderRadius: 12 }}>
                    {CATEGORIES.map(c => (
                      <button
                        key={c.id} type="button" onClick={() => setCategory(c.id)}
                        style={{
                          padding: "6px 14px", borderRadius: 10, fontSize: 12, fontWeight: 600,
                          border: "none",
                          background: category === c.id ? (etab?.couleur ? etab.couleur + "25" : "#fff") : "transparent",
                          color: category === c.id ? "#1a1a1a" : "#999",
                          boxShadow: category === c.id ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                          cursor: "pointer", transition: "all 0.15s",
                        }}
                      >{c.label}</button>
                    ))}
                  </div>
                  )}
                </div>

                {/* Ingrédients — hidden for vin/boisson */}
                {ficheType !== "vin" && ficheType !== "boisson" && <div style={{ background: "#fff", borderRadius: 16, padding: "20px 24px", border: "1px solid #e0d8ce", marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <h3 style={{ margin: 0, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#777" }}>
                      Ingrédients
                    </h3>
                    {(totalWeightG > 0 || totalCost > 0) && (
                      <div style={{ fontSize: 11, color: "#9a8f84", display: "flex", gap: 12, alignItems: "baseline" }}>
                        {totalWeightG > 0 && <span><strong style={{ color: "#4a6741", fontSize: 13 }}>{Math.round(totalWeightG).toLocaleString("fr-FR")}</strong> g</span>}
                        {totalCost > 0 && <span><strong style={{ color: "#D4775A", fontSize: 13 }}>{round2(totalCost).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> €</span>}
                      </div>
                    )}
                  </div>
                  <IngredientListDnD
                    items={lines}
                    ingredients={ingredients}
                    priceByIngredient={priceByIngredient}
                    units={CUISINE_UNITS}
                    onChange={setLines}
                    priceLabelByIngredient={priceLabelByIngredient}
                    supplierByIngredient={Object.fromEntries(Object.entries(supplierByIngredientMap).filter(([,v]) => v != null) as [string,string][])}
                    pivotId={pivotIngredientId}
                    onPivotChange={setPivotIngredientId}
                    returnUrl={typeof window !== "undefined" ? window.location.pathname + window.location.search : ""}
                  />
                </div>}

                {/* Étapes — hidden for vin/boisson */}
                {ficheType !== "vin" && ficheType !== "boisson" && <div style={{ background: "#fff", borderRadius: 16, padding: "20px 24px", border: "1px solid #e0d8ce", marginBottom: 14 }}>
                  <h3 style={{ margin: "0 0 14px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#777" }}>
                    Étapes
                  </h3>
                  {steps.length === 0 ? (
                    <StepsGhostSlots onAdd={(label) => setSteps([label])} />
                  ) : (
                    <StepsList steps={steps} onChange={setSteps} />
                  )}
                </div>}

                {/* Index button for preparations */}
                {category === "preparation" && isEdit && (
                  <div className="card" style={{ marginBottom: 16, borderLeft: "4px solid #4a6741" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                      <div>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "#4a6741", textTransform: "uppercase", letterSpacing: 0.5 }}>
                          Index ingrédient
                        </p>
                        <p className="muted" style={{ margin: "2px 0 0", fontSize: 11 }}>
                          {costPerKg ? `Prix calculé : ${fmtMoney(costPerKg)} €/kg` : "Prix non calculé (rendement manquant)"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleIndexSave}
                        disabled={indexSaving}
                        className="btn"
                        style={{ background: "#4a6741", borderColor: "#4a6741", color: "#fff", fontSize: 12, flexShrink: 0 }}
                      >
                        {indexSaving ? "Enregistrement…" : indexIngredientId ? "Mettre à jour l'index" : "Ajouter à l'index"}
                      </button>
                    </div>
                    {indexMsg && (
                      <div style={{
                        marginTop: 8, fontSize: 12, fontWeight: 600,
                        color: indexMsg.startsWith("Erreur") ? "#8B1A1A" : "#4a6741",
                      }}>
                        {indexMsg}
                      </div>
                    )}
                  </div>
                )}

                {/* Infos complémentaires (allergènes + photo) */}
                <details style={{ background: "#fff", borderRadius: 16, border: "1px solid #e0d8ce", marginBottom: 14, overflow: "hidden" }}>
                  <summary style={{
                    padding: "16px 24px", cursor: "pointer", listStyle: "none",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#777",
                  }}>
                    <span>Infos complémentaires</span>
                    <span style={{ fontSize: 10, color: "#bbb" }}>allergènes · photo</span>
                  </summary>
                  <div style={{ padding: "0 24px 20px", display: "flex", flexDirection: "column", gap: 18 }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#999", fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Allergènes</div>
                      <AllergenBadges allergens={computedAllergens} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#999", fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Photo</div>
                      {photoPreview && (
                        <div style={{ marginBottom: 10 }}>
                          <Image src={photoPreview} alt="Photo" width={200} height={150} style={{ borderRadius: 10, objectFit: "cover" }} />
                        </div>
                      )}
                      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoChange} />
                      <button
                        type="button" onClick={() => fileRef.current?.click()} disabled={photoUploading}
                        className="btn"
                      >
                        {photoUploading ? "Envoi…" : photoPreview ? "Changer la photo" : "Ajouter une photo"}
                      </button>
                    </div>
                  </div>
                </details>

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

        {/* ── SALLE (intégré dans recette) ── */}
        {mainTab === "recette" && (
          <SalleTab
            meta={meta}
            updateMeta={updateMeta}
            userCanWrite={userCanWrite}
            saving={saving}
            saveError={saveError}
            onSave={handleSave}
            recipeId={recipeId ?? null}
          />
        )}
      </main>

      {showProdModal && pivotIngredientId && recipeId && (
        <ProductionModal
          recipeType="cuisine"
          recipeId={recipeId}
          recipeName={title}
          pivotIngredientId={pivotIngredientId}
          onClose={() => setShowProdModal(false)}
        />
      )}
    </>
  );
}

// ── Salle Tab ────────────────────────────────────────────────────
const REGIME_OPTIONS: { key: string; label: string }[] = [
  { key: "vegetarien", label: "Végétarien" },
  { key: "vegan", label: "Vegan" },
  { key: "sans_gluten", label: "Sans gluten" },
  { key: "sans_lactose", label: "Sans lactose" },
  { key: "halal", label: "Halal" },
];

function parseRegimes(csv: string | undefined): Set<string> {
  if (!csv) return new Set();
  return new Set(csv.split(",").map(s => s.trim()).filter(Boolean));
}

function serializeRegimes(set: Set<string>): string {
  return Array.from(set).join(",");
}

type PairingItem = { id: string; name: string; category: string };

const DRINK_CAT_COLORS: Record<string, { bg: string; fg: string }> = {
  vins: { bg: "#F5E6F0", fg: "#7B2D5F" },
  spiritueux: { bg: "#FFF3E0", fg: "#E65100" },
  biere: { bg: "#FFF9C4", fg: "#F9A825" },
  soft: { bg: "#E0F7FA", fg: "#00838F" },
  liqueurs: { bg: "#EDE7F6", fg: "#5E35B1" },
  cafeteria: { bg: "#EFEBE9", fg: "#5D4037" },
  sirops: { bg: "#FCE4EC", fg: "#C62828" },
};

function SalleTab({
  meta, updateMeta, userCanWrite, saving, saveError, onSave, recipeId,
}: {
  meta: Record<string, string>;
  updateMeta: (k: string, v: string) => void;
  userCanWrite: boolean;
  saving: boolean;
  saveError: string | null;
  onSave: () => void;
  recipeId: string | null;
}) {
  const router = useRouter();
  const regimes = parseRegimes(meta.regimes_csv);

  // Pairings state
  const [pairings, setPairings] = useState<PairingItem[]>([]);
  const [pairingSearch, setPairingSearch] = useState("");
  const [pairingResults, setPairingResults] = useState<PairingItem[]>([]);
  const [pairingSearching, setPairingSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load existing pairings
  useEffect(() => {
    if (!recipeId) return;
    fetch("/api/catalogue/fiches")
      .then(async (fichesRes) => {
        const fiches = await fichesRes.json();
        const fiche = Array.isArray(fiches) ? fiches.find((f: { id: string }) => f.id === recipeId) : null;
        if (fiche?.pairings) setPairings(fiche.pairings);
      })
      .catch(() => {});
  }, [recipeId]);

  function doPairingSearch(q: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setPairingResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setPairingSearching(true);
      const res = await fetch(`/api/catalogue/fiches/pairings?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setPairingResults(Array.isArray(data) ? data : []);
      setPairingSearching(false);
    }, 250);
  }

  async function addPairing(item: PairingItem) {
    if (!recipeId) return;
    await fetch("/api/catalogue/fiches/pairings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipe_id: recipeId, recipe_type: "cuisine", ingredient_id: item.id }),
    });
    setPairings((prev) => [...prev, item]);
    setPairingSearch("");
    setPairingResults([]);
  }

  async function removePairing(ingredientId: string) {
    if (!recipeId) return;
    await fetch("/api/catalogue/fiches/pairings", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipe_id: recipeId, recipe_type: "cuisine", ingredient_id: ingredientId }),
    });
    setPairings((prev) => prev.filter((p) => p.id !== ingredientId));
  }

  const selectedPairingIds = new Set(pairings.map((p) => p.id));
  const toggleRegime = (key: string) => {
    const next = new Set(regimes);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    updateMeta("regimes_csv", serializeRegimes(next));
  };

  const sectionStyle: React.CSSProperties = {
    background: "#fff", borderRadius: 16, padding: "20px 24px",
    border: "1px solid #e0d8ce", marginBottom: 14,
  };
  const sectionTitleStyle: React.CSSProperties = {
    margin: "0 0 12px", fontSize: 10, fontWeight: 700,
    textTransform: "uppercase", letterSpacing: "0.12em", color: "#D4775A",
  };
  const hintStyle: React.CSSProperties = {
    fontSize: 11, color: "#999", marginBottom: 10, lineHeight: 1.4,
  };
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 8,
    border: "1.5px solid #e5ddd0", fontSize: 13, background: "#fff",
    outline: "none", color: "#1a1a1a", boxSizing: "border-box",
    fontFamily: "inherit",
  };
  const textareaStyle: React.CSSProperties = { ...inputStyle, minHeight: 90, resize: "vertical" };

  return (
    <>
      <div style={{
        background: "#fff7ed", borderRadius: 12, padding: "12px 16px",
        border: "1px solid #fed7aa", marginBottom: 14, color: "#9a3412", fontSize: 12, lineHeight: 1.5,
      }}>
        <strong style={{ fontWeight: 700 }}>Fiche salle</strong> — ces informations alimentent le PDF destiné aux serveurs.
        Elles permettent de répondre aux clients sur la composition, les allergènes, les accords et les régimes.
      </div>

      {/* Argumentaire */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Argumentaire client</div>
        <div style={hintStyle}>
          Phrase prête à dire au client. Vendeur, court (1-3 phrases), évoque l&apos;origine et le caractère du plat.
        </div>
        <textarea
          value={meta.description_salle ?? ""}
          onChange={e => updateMeta("description_salle", e.target.value)}
          placeholder="Ex: Notre risotto crémeux au parmesan Reggiano affiné 24 mois, garni de fruits de mer frais arrivés le matin même…"
          style={textareaStyle}
        />
      </div>

      {/* Accords — multi-select depuis ingrédients boissons */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Accords conseillés</div>
        <div style={hintStyle}>Sélectionne les boissons à suggérer pour augmenter le ticket moyen.</div>

        {/* Selected pairings */}
        {pairings.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {pairings.map((p) => {
              const col = DRINK_CAT_COLORS[p.category] ?? { bg: "#eee", fg: "#666" };
              return (
                <span key={p.id} style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "5px 10px", borderRadius: 8, fontSize: 12,
                  background: col.bg, color: col.fg, border: `1px solid ${col.fg}30`,
                }}>
                  {p.name}
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                    background: `${col.fg}15`, color: col.fg,
                  }}>
                    {p.category}
                  </span>
                  {userCanWrite && (
                    <button
                      type="button"
                      onClick={() => removePairing(p.id)}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: col.fg, fontSize: 15, fontWeight: 700, lineHeight: 1, padding: 0,
                      }}
                    >
                      ×
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        )}

        {/* Search input */}
        {userCanWrite && recipeId && (
          <div style={{ position: "relative" }}>
            <input
              type="text"
              value={pairingSearch}
              onChange={(e) => { setPairingSearch(e.target.value); doPairingSearch(e.target.value); }}
              placeholder="Rechercher un vin, spiritueux, biere, soft..."
              style={inputStyle}
            />
            {(pairingResults.length > 0 || pairingSearching) && pairingSearch.trim() && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20,
                marginTop: 2, border: "1px solid #e5ddd0", borderRadius: 8,
                background: "#fff", maxHeight: 200, overflowY: "auto",
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              }}>
                {pairingSearching ? (
                  <div style={{ padding: 10, fontSize: 12, color: "#999" }}>Recherche...</div>
                ) : (
                  pairingResults.map((r) => {
                    const already = selectedPairingIds.has(r.id);
                    const col = DRINK_CAT_COLORS[r.category] ?? { bg: "#eee", fg: "#666" };
                    return (
                      <div
                        key={r.id}
                        onClick={() => { if (!already) addPairing(r); }}
                        style={{
                          padding: "8px 12px", fontSize: 12, cursor: already ? "default" : "pointer",
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          opacity: already ? 0.4 : 1,
                          borderBottom: "1px solid #f5f0e8",
                        }}
                        onMouseEnter={(e) => { if (!already) e.currentTarget.style.background = "#f9f6f0"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
                      >
                        <span>{r.name}</span>
                        <span style={{
                          padding: "1px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700,
                          background: col.bg, color: col.fg,
                        }}>
                          {r.category}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        {!recipeId && (
          <div style={{ fontSize: 12, color: "#bbb", fontStyle: "italic" }}>
            Enregistre la recette pour ajouter des accords.
          </div>
        )}

        {pairings.length === 0 && recipeId && !pairingSearch && (
          <div style={{ fontSize: 12, color: "#bbb", fontStyle: "italic", marginTop: 6 }}>
            Aucun accord — recherche une boisson ci-dessus.
          </div>
        )}
      </div>

      {/* Régimes */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Régimes compatibles</div>
        <div style={hintStyle}>Coche uniquement ce que le plat respecte. Les autres régimes seront affichés comme incompatibles.</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {REGIME_OPTIONS.map(opt => {
            const active = regimes.has(opt.key);
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => toggleRegime(opt.key)}
                style={{
                  padding: "8px 14px", borderRadius: 20,
                  border: active ? "1.5px solid #4A6741" : "1.5px solid #ddd6c8",
                  background: active ? "#4A6741" : "#fff",
                  color: active ? "#fff" : "#666",
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* FAQ */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Questions / objections clients</div>
        <div style={hintStyle}>
          Une question par ligne, format : <code style={{ background: "#f5f0e8", padding: "1px 5px", borderRadius: 3 }}>Question | Réponse</code>
        </div>
        <textarea
          value={meta.faq ?? ""}
          onChange={e => updateMeta("faq", e.target.value)}
          placeholder={"C'est épicé ? | Non, c'est doux et crémeux.\nLes fruits de mer sont frais ? | Oui, livraison Mael deux fois par semaine.\nC'est servi chaud ? | Oui, à 65°C."}
          style={{ ...textareaStyle, minHeight: 120, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}
        />
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 12, paddingBottom: 32, flexWrap: "wrap" }}>
        {userCanWrite && (
          <button onClick={onSave} disabled={saving} className="btn btnPrimary" style={{ flex: 1, minWidth: 200 }}>
            {saving ? "Sauvegarde…" : "Sauvegarder"}
          </button>
        )}
        <button
          onClick={() => router.push("/catalogue/fiches")}
          className="btn"
          style={{ flex: 1, minWidth: 200 }}
          title="Voir le catalogue salle"
        >
          Catalogue Salle
        </button>
      </div>
      {saveError && <div className="errorBox" style={{ marginBottom: 8 }}>{saveError}</div>}
    </>
  );
}

// ── Recipe stat (header inline) ──────────────────────────────────
function RecipeStat({ label, value, unit, extra }: { label: string; value: React.ReactNode; unit?: string; extra?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 9, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.1em" }}>
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {value}
        {unit && <span style={{ fontSize: 11, color: "#9a8f84", fontWeight: 600 }}>{unit}</span>}
        {extra}
      </div>
    </div>
  );
}

// ── Steps ghost slots (suggestion when empty) ────────────────────
function StepsGhostSlots({ onAdd }: { onAdd: (label: string) => void }) {
  const slots = ["Mise en place", "Cuisson", "Dressage"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {slots.map((s, i) => (
        <button
          key={s} type="button" onClick={() => onAdd(s)}
          style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "12px 16px", background: "transparent",
            border: "1.5px dashed #d9d2c4", borderRadius: 10,
            cursor: "pointer", textAlign: "left",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#f9f5ef"; e.currentTarget.style.borderColor = "#4a6741"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "#d9d2c4"; }}
        >
          <span style={{
            width: 26, height: 26, borderRadius: "50%",
            background: "#f0ebe2", color: "#9a8f84",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 700, fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
          }}>{i + 1}</span>
          <span style={{ fontSize: 13, color: "#9a8f84", fontWeight: 500 }}>{s}</span>
          <span style={{ marginLeft: "auto", fontSize: 10, color: "#bbb" }}>cliquer pour ajouter</span>
        </button>
      ))}
    </div>
  );
}

// ── Cuisine Pricing Panel — Hero KPI + Tiroir ───────────────────
function CuisinePricing({
  pricingMode, onPricingModeChange,
  totalCost, costPerKg: _costPerKg, baseCost,
  portions, onPortionsChange,
  sellCoeff, onSellCoeffChange,
  derivedSellPerUnit, derivedSellTotal,
  foodCostPct, fcTarget, onFcTargetChange,
  margePerUnit, prixTTCUnit,
  vatRate, onVatChange,
  yieldGrams,
}: {
  pricingMode: "portion" | "kg";
  onPricingModeChange: (m: "portion" | "kg") => void;
  totalCost: number | null;
  costPerKg: number | null;
  baseCost: number | null;
  portions: number | null;
  onPortionsChange: (n: number | "") => void;
  sellCoeff: number | null;
  onSellCoeffChange: (c: number) => void;
  derivedSellPerUnit: number | null;
  derivedSellTotal: number | null;
  foodCostPct: number | null;
  fcTarget: number;
  onFcTargetChange: (t: number) => void;
  margePerUnit: number | null;
  prixTTCUnit: number | null;
  vatRate: number;
  onVatChange: (r: number) => void;
  yieldGrams: number | null;
}) {
  const [coeffLocal, setCoeffLocal] = useState(sellCoeff != null ? String(sellCoeff) : "");
  const [coeffEditing, setCoeffEditing] = useState(false);
  const [ttcLocal, setTtcLocal] = useState(prixTTCUnit != null ? prixTTCUnit.toFixed(2) : "");
  const [ttcEditing, setTtcEditing] = useState(false);
  const [paramsOpen, setParamsOpen] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!coeffEditing) setCoeffLocal(sellCoeff != null ? String(sellCoeff) : "");
  }, [sellCoeff, coeffEditing]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!ttcEditing) setTtcLocal(prixTTCUnit != null ? prixTTCUnit.toFixed(2) : "");
  }, [prixTTCUnit, ttcEditing]);

  // Applique un prix TTC saisi : deduit le coeff correspondant et le propage.
  // Formule : coeff = TTC / (baseCost × (1 + vatRate))
  function applyTTC(ttcTyped: number) {
    if (!baseCost || baseCost <= 0) return;
    const coeff = ttcTyped / (baseCost * (1 + vatRate));
    // 4 décimales pour que le TTC recalcule EXACTEMENT ce qui a été tape
    // (2 décimales font perdre precision : 22€ tape => 3.82 arrondi => 21.98€).
    if (coeff > 0) onSellCoeffChange(Math.round(coeff * 10000) / 10000);
  }

  const fcColor = foodCostPct == null ? "#999"
    : foodCostPct <= fcTarget ? "#16a34a"
    : foodCostPct <= fcTarget + 5 ? "#D97706"
    : "#DC2626";
  const fcRatio = foodCostPct == null ? 0 : Math.min(1, foodCostPct / (fcTarget * 1.67));
  const margeColor = margePerUnit != null && margePerUnit > 0 ? "#16a34a" : "#999";

  const isPortionMode = pricingMode === "portion";
  const unitLabel = isPortionMode ? "portion" : "kg";
  const vatPct = Math.round(vatRate * 100);
  const hasMultiPortions = isPortionMode && portions != null && portions > 1;

  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.08em" };
  const bigNum: React.CSSProperties = { fontSize: 26, fontWeight: 800, fontFamily: "var(--font-oswald), Oswald, sans-serif", lineHeight: 1.1, marginTop: 2 };

  return (
    <div style={{
      background: "#fff", borderRadius: 16, border: "1px solid #e0d8ce",
      marginBottom: 16, overflow: "hidden",
    }}>

      {/* ── Hero KPIs — 4 columns ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
        gap: 0, padding: "20px 16px 16px",
      }}>
        {/* KPI 1: Cout */}
        <div style={{ textAlign: "center", padding: "0 4px" }}>
          <div style={lbl}>{isPortionMode ? "Cout / portion" : "Cout / kg"}</div>
          <div style={{ ...bigNum, color: "#8B1A1A" }}>
            {baseCost != null ? `${fmtMoney(baseCost)}€` : "-"}
          </div>
        </div>

        {/* KPI 2: Coeff */}
        <div style={{ textAlign: "center", padding: "0 4px", borderLeft: "1px solid #ece4d4" }}>
          <div style={lbl}>Coeff</div>
          <div style={{ ...bigNum, color: "#7C3AED" }}>
            {sellCoeff != null ? `×${sellCoeff.toFixed(2)}` : "-"}
          </div>
        </div>

        {/* KPI 3: Prix vente (TTC big, HT small) */}
        <div style={{ textAlign: "center", padding: "0 4px", borderLeft: "1px solid #ece4d4" }}>
          <div style={lbl}>{isPortionMode ? "Vente / portion" : "Vente / kg"}</div>
          <div style={{ ...bigNum, color: "#1a1a1a" }}>
            {prixTTCUnit != null ? `${fmtMoney(prixTTCUnit)}€` : "-"}
          </div>
          {derivedSellPerUnit != null && (
            <div style={{ fontSize: 11, color: "#999", marginTop: 1 }}>
              {fmtMoney(derivedSellPerUnit)}€ HT
            </div>
          )}
        </div>

        {/* KPI 4: Plat entier (if multi-portions) or Marge */}
        <div style={{ textAlign: "center", padding: "0 4px", borderLeft: "1px solid #ece4d4" }}>
          {hasMultiPortions && derivedSellTotal != null ? (
            <>
              <div style={lbl}>Plat entier</div>
              <div style={{ ...bigNum, color: "#1a1a1a" }}>
                {fmtMoney(derivedSellTotal * (1 + vatRate))}€
              </div>
              <div style={{ fontSize: 11, color: "#999", marginTop: 1 }}>
                {fmtMoney(derivedSellTotal)}€ HT
              </div>
            </>
          ) : (
            <>
              <div style={lbl}>Marge</div>
              <div style={{ ...bigNum, color: margeColor }}>
                {margePerUnit != null ? `${fmtMoney(margePerUnit)}€` : "-"}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Food Cost + Marge bar ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0,
        borderTop: "1px solid #ece4d4",
      }}>
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

        <div style={{ padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={lbl}>Marge brute</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: margeColor, fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>
              {margePerUnit != null ? `${fmtMoney(margePerUnit)}€` : "-"}
            </span>
            <span style={{ fontSize: 10, color: "#bbb", marginLeft: "auto" }}>
              / {unitLabel}
            </span>
          </div>
          {totalCost != null && totalCost > 0 && (
            <div style={{ fontSize: 11, color: "#999", marginTop: 6 }}>
              Cout total : {fmtMoney(totalCost)}€
              {yieldGrams != null && yieldGrams > 0 && ` · Rendement ${(yieldGrams / 1000).toFixed(2)} kg`}
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

            {/* Mode toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ ...lbl, minWidth: 44 }}>Mode</span>
              <div style={{ display: "flex", gap: 4 }}>
                {(["portion", "kg"] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onPricingModeChange(m)}
                    style={{
                      padding: "5px 14px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                      border: "1.5px solid",
                      borderColor: pricingMode === m ? "#4a6741" : "#ddd6c8",
                      background: pricingMode === m ? "rgba(74,103,65,0.08)" : "#fff",
                      color: pricingMode === m ? "#4a6741" : "#6f6a61",
                      cursor: "pointer",
                    }}
                  >{m === "portion" ? "Portion" : "Au kilo"}</button>
                ))}
              </div>
            </div>

            {/* Portions count (only in portion mode) */}
            {isPortionMode && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ ...lbl, minWidth: 44 }}>Portions</span>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {[1, 2, 4, 6, 8, 10, 12].map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => onPortionsChange(p)}
                      style={{
                        padding: "5px 11px", borderRadius: 10, fontSize: 12, fontWeight: 700,
                        border: "1.5px solid",
                        borderColor: portions === p ? "#4a6741" : "#ddd6c8",
                        background: portions === p ? "rgba(74,103,65,0.08)" : "#fff",
                        color: portions === p ? "#4a6741" : "#6f6a61",
                        cursor: "pointer", minWidth: 34,
                      }}
                    >{p}</button>
                  ))}
                </div>
              </div>
            )}

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
                  value={ttcEditing ? ttcLocal : (prixTTCUnit != null ? prixTTCUnit.toFixed(2) : "")}
                  placeholder="9,00"
                  disabled={!baseCost || baseCost <= 0}
                  onFocus={(e) => {
                    setTtcEditing(true);
                    setTtcLocal(prixTTCUnit != null ? prixTTCUnit.toFixed(2) : "");
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
                    background: baseCost && baseCost > 0 ? "#faf6ee" : "#f0ebe2",
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
          </div>
        )}
      </div>
    </div>
  );
}
