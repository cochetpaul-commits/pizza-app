"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { AllergenBadges } from "@/components/AllergenBadges";
import { parseAllergens, mergeAllergens } from "@/lib/allergens";
import { offerRowToCpu, enrichCpuWithConversions } from "@/lib/offerPricing";
import { formatCpuLabel } from "@/lib/formatPrice";
import { compressImage } from "@/lib/compressImage";
import { EstablishmentPicker } from "./EstablishmentPicker";
import { fetchApi } from "@/lib/fetchApi";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import { IngredientListDnD, normalizeUnit, type IngredientLine } from "./IngredientListDnD";
import { StepsList } from "./StepsList";
import { PricingBlock } from "./PricingBlock";
import { GestionFoodCost } from "./GestionFoodCost";
import { PublishCatalogueButton } from "./PublishCatalogueButton";
import { GestionCommandes } from "./GestionCommandes";
import { GestionPilotage } from "./GestionPilotage";
import { StepperInput } from "@/components/StepperInput";
import type { Ingredient, Category } from "@/types/ingredients";
import type { CpuByUnit } from "@/lib/offerPricing";
import ProductionModal from "@/components/ProductionModal";

const CUISINE_UNITS = ["g", "cL", "pcs"];

const CATEGORIES = [
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

interface Props { recipeId?: string; initialProdMode?: boolean; }

function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n) + "…" : s; }

export default function CuisineFormV2({ recipeId, initialProdMode }: Props) {
  const router = useRouter();
  const { can } = useProfile();
  const userCanWrite = can("operations.edit_recettes");
  const { current: etab } = useEtablissement();
  const isEdit = !!recipeId;

  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState<unknown>(null);

  // Form state
  const [name, setName] = useState("");
  const [category, setCategory] = useState("plat_cuisine");
  const [yieldGrams, setYieldGrams] = useState<number | "">("");
  const [portionsCount, setPortionsCount] = useState<number | "">("");
  const [establishments, setEstablishments] = useState<string[]>(["bellomio", "piccola"]);
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  // Ingredients
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [priceByIngredient, setPriceByIngredient] = useState<Record<string, CpuByUnit>>({});
  const [priceLabelByIngredient, setPriceLabelByIngredient] = useState<Record<string, string>>({});
  const [supplierByIngredient, setSupplierByIngredient] = useState<Record<string, string | null>>({});
  const [lines, setLines] = useState<IngredientLine[]>([]);

  // Steps
  const [steps, setSteps] = useState<string[]>([]);

  // Pricing — marginRate as string "75" = 75%
  const [vatRate, setVatRate] = useState(0.1);
  const [marginRate, setMarginRate] = useState("75");
  const [sellPrice, setSellPrice] = useState<number | "">("");

  // Production mode
  const [prodMode, setProdMode] = useState(initialProdMode ?? false);
  const [showProdModal, setShowProdModal] = useState(initialProdMode ?? false);
  const [pivotIngredientId, setPivotIngredientId] = useState<string | null>(null);
  const [prodQty, setProdQty] = useState<number | "">("");

  // Main tab
  type MainTab = "fc" | "recette" | "cmd" | "pop";
  const [mainTab, setMainTab] = useState<MainTab>(initialProdMode ? "recette" : isEdit ? "fc" : "recette");

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Index ingredient (linked catalog entry)
  const [indexIngredientId, setIndexIngredientId] = useState<string | null>(null);
  const [indexMsg, setIndexMsg] = useState<string | null>(null);
  const [indexSaving, setIndexSaving] = useState(false);

  const fileRef = useRef<HTMLInputElement | null>(null);

  // Computed allergens
  const computedAllergens = useMemo(() => {
    const allLists = lines
      .map(l => ingredients.find(i => i.id === l.ingredient_id))
      .filter(Boolean)
      .map(i => parseAllergens((i as Ingredient).allergens))
      .filter((a): a is string[] => Array.isArray(a));
    return mergeAllergens(allLists);
  }, [lines, ingredients]);

  // Computed costs
  const totalCost = useMemo(() => {
    return lines.reduce((acc, l) => {
      if (!l.ingredient_id || l.qty === "" || !(Number(l.qty) > 0)) return acc;
      const cpu = priceByIngredient[l.ingredient_id];
      if (!cpu) return acc;
      const qty = Number(l.qty);
      const unit = l.unit.toLowerCase();
      if (unit === "g" && cpu.g) return acc + cpu.g * qty;
      if (unit === "cl" && cpu.ml) return acc + cpu.ml * qty * 10;
      if (unit === "ml" && cpu.ml) return acc + cpu.ml * qty;
      if ((unit === "pc" || unit === "pcs") && cpu.pcs) return acc + cpu.pcs * qty;
      return acc;
    }, 0);
  }, [lines, priceByIngredient]);

  // Poids total ingrédients (g uniquement — pas de conversion implicite cL→g)
  const totalWeightG = useMemo(() => {
    return lines.reduce((acc, l) => {
      if (!l.ingredient_id || l.qty === "" || !(Number(l.qty) > 0)) return acc;
      const qty = Number(l.qty);
      const unit = l.unit.toLowerCase();
      if (unit === "g") return acc + qty;
      return acc;
    }, 0);
  }, [lines]);

  const yieldG = yieldGrams !== "" ? Number(yieldGrams) : null;
  const portions = portionsCount !== "" ? Number(portionsCount) : null;
  const costPerKg = yieldG && yieldG > 0 && totalCost > 0 ? round2((totalCost / yieldG) * 1000) : null;
  const costPerPortion = portions && portions > 0 && totalCost > 0 ? round2(totalCost / portions) : null;

  // Load data
  useEffect(() => {
    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { setStatus("error"); setError({ message: "NOT_LOGGED" }); return; }

      const ingsQ = supabase.from("ingredients").select("*").eq("is_active", true);
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
      for (const o of offerList) {
        const iid = String(o.ingredient_id ?? "");
        if (!iid) continue;
        pm[iid] = offerRowToCpu(o);
        metaM[iid] = { density_kg_per_l: o.density_kg_per_l as number | null, piece_weight_g: o.piece_weight_g as number | null };
        const sid = String(o.supplier_id ?? "");
        supplierByIng[iid] = sid ? (supplierNameById[sid] ?? null) : null;
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
          const prQ = supabase.from("prep_recipes").select("name,output_ingredient_id,total_cost,yield_grams");
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
          for (const pr of (prAll ?? []) as Array<{ name: string | null; output_ingredient_id: string | null; total_cost: number | null; yield_grams: number | null }>) {
            if (!pr.total_cost || pr.total_cost <= 0 || !pr.yield_grams || pr.yield_grams <= 0) continue;
            const cpuG = pr.total_cost / pr.yield_grams;
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

      const labelMap: Record<string, string> = {};
      for (const i of ingList) {
        labelMap[i.id] = formatCpuLabel(pm[i.id] ?? {}, metaM[i.id] ?? {}, i.piece_volume_ml ?? null, supplierByIng[i.id] ?? null);
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
          setYieldGrams(r.yield_grams ? Number(r.yield_grams) : "");
          setPortionsCount(r.portions_count ? Number(r.portions_count) : "");
          setEstablishments((r.establishments as string[]) ?? ["bellomio", "piccola"]);
          setPhotoUrl(String(r.photo_url ?? ""));
          if (r.photo_url) setPhotoPreview(String(r.photo_url));
          if (r.vat_rate) setVatRate(Number(r.vat_rate));
          if (r.margin_rate) {
            const mr = Number(r.margin_rate);
            if (mr >= 1) setMarginRate(String(Math.round(mr)));
            else if (mr > 0) setMarginRate(String(Math.round(mr * 100)));
          }
          if (r.sell_price != null) setSellPrice(Number(r.sell_price));
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
        const { data: linkedIng } = await supabase
          .from("ingredients").select("id")
          .eq("source", "recette_maison").eq("recipe_id", recipeId)
          .maybeSingle<{ id: string }>();
        if (linkedIng) setIndexIngredientId(linkedIng.id);
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

      const marginRateNum = Number(marginRate);
      const margin_rate = marginRateNum > 0 ? round2(marginRateNum) : 0;
      const totalCostRounded = round2(totalCost);

      const payload: Record<string, unknown> = {
        name: name || "Nouvelle recette",
        category,
        yield_grams: yieldGrams !== "" ? Math.round(Number(yieldGrams)) : 0,
        portions_count: portionsCount !== "" ? Math.round(Number(portionsCount)) : 0,
        establishments,
        vat_rate: vatRate,
        margin_rate,
        total_cost: totalCostRounded > 0 ? totalCostRounded : null,
        cost_per_kg: costPerKg,
        cost_per_portion: costPerPortion,
        sell_price: sellPrice !== "" ? Number(sellPrice) : null,
        photo_url: photoUrl || null,
        procedure: steps.length > 0 ? JSON.stringify(steps) : null,
        is_draft: false,
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      let rid = recipeId;
      if (rid) {
        const { error } = await supabase.from("kitchen_recipes").update(payload).eq("id", rid);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("kitchen_recipes")
          .insert({ ...payload, user_id: auth.user.id, ...(etab ? { etablissement_id: etab.id } : {}) })
          .select("id").single<{ id: string }>();
        if (error) throw error;
        rid = data.id;
      }

      // Save pivot (column added by migration — silent failure if not yet applied)
      await supabase.from("kitchen_recipes").update({ pivot_ingredient_id: pivotIngredientId }).eq("id", rid!);

      // Upsert lines
      await supabase.from("kitchen_recipe_lines").delete().eq("recipe_id", rid!);
      const validLines = lines.filter(l => l.ingredient_id && l.qty !== "" && Number(l.qty) > 0);
      if (validLines.length > 0) {
        const { error: lErr } = await supabase.from("kitchen_recipe_lines").insert(
          validLines.map((l, i) => ({
            recipe_id: rid!,
            ingredient_id: l.ingredient_id,
            qty: Number(l.qty),
            unit: l.unit,
            sort_order: i,
          }))
        );
        if (lErr) throw lErr;
      }

      // Sync ingredient catalog — silent failure
      try {
        const CAT_MAP: Record<string, Category> = {
          preparation: "preparation", sauce: "sauce", autre: "autre",
        };
        const ingCat: Category = CAT_MAP[category] ?? "preparation";
        const { data: existingIng } = await supabase
          .from("ingredients").select("id")
          .eq("source", "recette_maison").eq("recipe_id", rid!)
          .maybeSingle<{ id: string }>();
        if (existingIng) {
          await supabase.from("ingredients").update({
            name: name || "Nouvelle recette",
            category: ingCat,
            purchase_price: costPerKg ?? null,
            purchase_unit: 1,
            purchase_unit_label: "kg",
            purchase_unit_name: "kg",
          }).eq("id", existingIng.id);
          setIndexIngredientId(existingIng.id);
        } else if (costPerKg && costPerKg > 0) {
          const { data: newIng } = await supabase.from("ingredients").insert({
            name: name || "Nouvelle recette",
            category: ingCat,
            purchase_price: costPerKg,
            purchase_unit: 1,
            purchase_unit_label: "kg",
            purchase_unit_name: "kg",
            source: "recette_maison",
            recipe_id: rid!,
            is_active: true,
            allergens: null,
            default_unit: "g",
            density_g_per_ml: null,
            piece_weight_g: null,
            piece_volume_ml: null,
            supplier_id: null,
            ...(etab ? { etablissement_id: etab.id } : {}),
          }).select("id").single<{ id: string }>();
          if (newIng) {
            setIndexIngredientId(newIng.id);
            await supabase.from("kitchen_recipes").update({ output_ingredient_id: newIng.id }).eq("id", rid!);
          }
        }
      } catch (e) {
        console.warn("Ingredient sync failed:", e);
      }

      if (!isEdit) router.push(`/recettes/cuisine/${rid}`);
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
      a.download = `${(name || "cuisine").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}.pdf`;
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

      if (indexIngredientId) {
        await supabase.from("ingredients").update({
          name: name || "Nouvelle recette",
          category: ingCat,
          purchase_price: costPerKg ?? null,
          purchase_unit: 1,
          purchase_unit_label: "kg",
          purchase_unit_name: "kg",
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
          piece_weight_g: null,
          piece_volume_ml: null,
          supplier_id: null,
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

  const title = name || (isEdit ? "Fiche cuisine" : "Nouvelle fiche cuisine");

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
  const sp = typeof sellPrice === "number" && sellPrice > 0 ? sellPrice : null;
  const effectiveCostPerPortion = costPerPortion ?? (totalCost > 0 ? totalCost : null);
  const foodCostPct = sp && effectiveCostPerPortion ? (effectiveCostPerPortion / sp) * 100 : null;
  const margeBrute = sp && effectiveCostPerPortion ? sp - effectiveCostPerPortion : null;
  const prixTTC = sp ? sp * (1 + vatRate) : null;

  const categoryLabel = CATEGORIES.find(c => c.id === category)?.label ?? category;

  // Tab definitions
  const MAIN_TABS: { key: MainTab; label: string }[] = isEdit ? [
    { key: "fc", label: "Food cost & Marges" },
    { key: "recette", label: "Recette & Procede" },
    { key: "cmd", label: "Commandes fournisseurs" },
    { key: "pop", label: "Pilotage CA — Popina" },
  ] : [
    { key: "recette", label: "Recette" },
  ];

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

        {/* ── Header ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isEdit && (
              <button type="button" onClick={() => router.push("/recettes")} style={{
                fontSize: 18, color: "#999", cursor: "pointer", border: "none", background: "transparent",
                padding: "4px 8px", lineHeight: 1,
              }}>&#8592;</button>
            )}
            {photoPreview && (
              <div style={{ width: 32, height: 32, borderRadius: 8, overflow: "hidden", flexShrink: 0 }}>
                <Image src={photoPreview} alt="" width={32} height={32} style={{ objectFit: "cover", width: 32, height: 32 }} />
              </div>
            )}
            <div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, fontFamily: "var(--font-oswald), 'Oswald', sans-serif", color: "#1a1a1a" }}>{title}</h1>
              {isEdit && (
                <div style={{ display: "flex", gap: 4, marginTop: 4, flexWrap: "wrap" }}>
                  {etab && <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 8px", borderRadius: 6, background: "#D4775A", color: "#fff" }}>{etab.nom ?? "Etablissement"}</span>}
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 8px", borderRadius: 6, background: "#f2ede4", color: "#666" }}>{categoryLabel}</span>
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {isEdit && pivotIngredientId && (
              <button type="button" className="btn" onClick={() => setShowProdModal(true)}
                style={{ fontSize: 12, background: "#4a6741", borderColor: "#4a6741", color: "#fff" }}>
                Production
              </button>
            )}
            {isEdit && (
              <>
                <button type="button" className="btn" onClick={handleExportPdf} disabled={pdfLoading}
                  style={{ fontSize: 12 }}>
                  {pdfLoading ? "Export\u2026" : "Apercu PDF"}
                </button>
                <PublishCatalogueButton recipeType="cuisine" recipeId={recipeId!} />
              </>
            )}
            {userCanWrite && (
              <button onClick={handleSave} disabled={saving} className="btn btnPrimary">
                {saving ? "Sauvegarde\u2026" : "Enregistrer"}
              </button>
            )}
          </div>
        </div>

        {/* ── KPI Banner ── */}
        {isEdit && (
          <div style={{
            display: "flex", gap: 0, marginBottom: 16, borderRadius: 10,
            border: "1px solid #ddd6c8", overflow: "hidden", background: "#fff",
          }}>
            <KpiBannerItem label="COUT REVIENT" value={effectiveCostPerPortion ? `${fmtMoney(effectiveCostPerPortion)}\u00A0\u20AC` : "-"} sub="par portion" color="#D4775A" />
            <KpiBannerItem
              label="FOOD COST"
              value={foodCostPct != null ? `${foodCostPct.toFixed(1)}%` : "-"}
              sub="objectif \u2264 32%"
              color={foodCostPct == null ? "#999" : foodCostPct <= 28 ? "#16a34a" : foodCostPct <= 32 ? "#D97706" : "#DC2626"}
            />
            <KpiBannerItem label="PRIX DE VENTE HT" value={sp ? `${fmtMoney(sp)}\u00A0\u20AC` : "-"} sub={prixTTC ? `${fmtMoney(prixTTC)}\u00A0\u20AC TTC` : ""} color="#1a1a1a" />
            <KpiBannerItem label="MARGE BRUTE" value={margeBrute != null ? `${fmtMoney(margeBrute)}\u00A0\u20AC` : "-"} sub="par portion" color="#16a34a" />
          </div>
        )}

        {/* ── Tab bar ── */}
        <div style={{ display: "flex", gap: 0, borderBottom: "1.5px solid #ddd6c8", marginBottom: 16, overflowX: "auto" }}>
          {MAIN_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setMainTab(t.key)}
              style={{
                padding: "10px 16px", fontSize: 13, fontWeight: mainTab === t.key ? 700 : 500,
                cursor: "pointer", border: "none", background: "transparent",
                color: mainTab === t.key ? "#D4775A" : "#999",
                borderBottom: mainTab === t.key ? "2.5px solid #D4775A" : "2.5px solid transparent",
                transition: "all 0.15s", whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {saveError && <div className="errorBox" style={{ marginBottom: 12 }}>{saveError}</div>}

        {/* ── TAB: FOOD COST & MARGES ── */}
        {mainTab === "fc" && isEdit && recipeId && (
          <GestionFoodCost
            recipeId={recipeId}
            recipeType="cuisine"
            lines={lines}
            ingredients={ingredients}
            priceByIngredient={priceByIngredient}
            supplierByIngredient={supplierByIngredient}
            totalCost={totalCost}
            sellPrice={sp}
            onSellPriceChange={(p) => setSellPrice(p)}
            portionsCount={typeof portionsCount === "number" ? portionsCount : null}
            yieldGrams={typeof yieldGrams === "number" ? yieldGrams : null}
          />
        )}

        {/* ── TAB: COMMANDES ── */}
        {mainTab === "cmd" && isEdit && recipeId && (
          <GestionCommandes
            recipeId={recipeId}
            recipeType="cuisine"
            lines={lines}
            ingredients={ingredients}
            etablissementId={etab?.id}
          />
        )}

        {/* ── TAB: PILOTAGE ── */}
        {mainTab === "pop" && isEdit && (
          <GestionPilotage recipeName={name} recipeType="cuisine" />
        )}

        {/* ── TAB: RECETTE & PROCEDE ── */}
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
                  <div className="card" style={{ marginBottom: 16 }}>
                    <h3 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "#6f6a61" }}>
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
                {/* Infos générales */}
                <div className="card" style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div>
                      <label className="label">Nom de la recette</label>
                      <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Nom…" />
                    </div>

                    <div>
                      <label className="label">Catégorie</label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {CATEGORIES.map(c => (
                          <button
                            key={c.id} type="button" onClick={() => setCategory(c.id)}
                            style={{
                              padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                              border: "1.5px solid",
                              borderColor: category === c.id ? "#4a6741" : "rgba(217,199,182,0.9)",
                              background: category === c.id ? "rgba(22,101,52,0.08)" : "rgba(255,255,255,0.7)",
                              color: category === c.id ? "#4a6741" : "#6f6a61",
                              cursor: "pointer",
                            }}
                          >{c.label}</button>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                      <div>
                        <label className="label">Rendement (g)</label>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <StepperInput
                            value={yieldGrams}
                            onChange={setYieldGrams}
                            step={50} min={0}
                            placeholder="ex: 1000"
                          />
                          {totalWeightG > 0 && (
                            <button
                              type="button"
                              onClick={() => setYieldGrams(Math.round(totalWeightG))}
                              title={`Utiliser le poids total des ingrédients (${Math.round(totalWeightG)} g)`}
                              style={{
                                padding: "0 10px", height: 36, borderRadius: 8, fontSize: 12, fontWeight: 700,
                                border: "1.5px solid #4a6741", background: "rgba(22,101,52,0.07)",
                                color: "#4a6741", cursor: "pointer", whiteSpace: "nowrap",
                              }}
                            >= Poids ingrédients</button>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="label">Portions</label>
                        <StepperInput
                          value={portionsCount}
                          onChange={setPortionsCount}
                          step={1} min={1}
                          placeholder="ex: 4"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="label">Établissements</label>
                      <EstablishmentPicker value={establishments} onChange={setEstablishments} />
                    </div>
                  </div>
                </div>

                {/* Ingrédients */}
                <div className="card" style={{ marginBottom: 16 }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "#4a6741" }}>
                    Ingrédients
                  </h3>
                  <IngredientListDnD
                    items={lines}
                    ingredients={ingredients}
                    priceByIngredient={priceByIngredient}
                    units={CUISINE_UNITS}
                    onChange={setLines}
                    priceLabelByIngredient={priceLabelByIngredient}
                    pivotId={pivotIngredientId}
                    onPivotChange={setPivotIngredientId}
                  />
                  {totalWeightG > 0 && (
                    <div style={{ marginTop: 10, fontSize: 13, color: "#6f6a61", display: "flex", gap: 16, flexWrap: "wrap" }}>
                      <span>Poids total : <strong style={{ color: "#4a6741" }}>{Math.round(totalWeightG).toLocaleString("fr-FR")} g</strong></span>
                      {totalCost > 0 && <span>Coût total : <strong style={{ color: "#4a6741" }}>{round2(totalCost).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</strong></span>}
                    </div>
                  )}
                </div>

                {/* Étapes */}
                <div className="card" style={{ marginBottom: 16 }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "#4a6741" }}>
                    Étapes
                  </h3>
                  <StepsList steps={steps} onChange={setSteps} />
                </div>

                {/* Prix & Marges */}
                <div className="card" style={{ marginBottom: 16 }}>
                  <h3 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "#4a6741" }}>
                    Prix &amp; Marges
                  </h3>
                  <PricingBlock
                    costPerKg={costPerKg}
                    costPerPortion={costPerPortion}
                    vatRate={vatRate}
                    onVatChange={setVatRate}
                    marginRate={marginRate}
                    onMarginChange={setMarginRate}
                    sellPrice={sellPrice}
                    onSellPriceChange={setSellPrice}
                    accentColor="#D4775A"
                  />
                </div>

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

                {/* Allergènes */}
                <div className="card" style={{ marginBottom: 16 }}>
                  <h3 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "#6f6a61" }}>
                    Allergènes
                  </h3>
                  <AllergenBadges allergens={computedAllergens} />
                </div>

                {/* Photo */}
                <div className="card" style={{ marginBottom: 16 }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "#6f6a61" }}>
                    Photo
                  </h3>
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

// ── KPI Banner Item ──────────────────────────────────────────────
function KpiBannerItem({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{
      flex: 1, padding: "12px 14px",
      borderRight: "1px solid #f0ebe2",
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>
          {sub}
        </div>
      )}
    </div>
  );
}
