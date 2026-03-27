"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { SmartSelect, type SmartSelectOption } from "@/components/SmartSelect";
import { AllergenBadges } from "@/components/AllergenBadges";
import { parseAllergens, mergeAllergens } from "@/lib/allergens";
import { offerRowToCpu, enrichCpuWithConversions } from "@/lib/offerPricing";
import { formatCpuLabel } from "@/lib/formatPrice";
import { compressImage } from "@/lib/compressImage";

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

  // Dough recipes
  const [doughRecipes, setDoughRecipes] = useState<DoughRecipeRow[]>([]);

  // Ingredients
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [priceByIngredient, setPriceByIngredient] = useState<Record<string, CpuByUnit>>({});
  const [priceLabelByIngredient, setPriceLabelByIngredient] = useState<Record<string, string>>({});
  const [supplierByIngredient, setSupplierByIngredient] = useState<Record<string, string | null>>({});

  // Pre/post ingredient lines
  const [preLines, setPreLines] = useState<IngredientLine[]>([]);
  const [postLines, setPostLines] = useState<IngredientLine[]>([]);

  // Steps (stored in notes for pizza_recipes)
  const [steps, setSteps] = useState<string[]>([]);

  // Pricing
  const [vatRate, setVatRate] = useState(0.1);
  const [marginRate, setMarginRate] = useState("75");

  // Main tab
  type MainTab = "fc" | "recette" | "cmd" | "pop";
  const [mainTab, setMainTab] = useState<MainTab>(initialProdMode ? "recette" : isEdit ? "fc" : "recette");

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
      if (unit === "g" && cpu.g) return acc + cpu.g * qty;
      if (unit === "cl" && cpu.ml) return acc + cpu.ml * qty * 10;
      if (unit === "ml" && cpu.ml) return acc + cpu.ml * qty;
      if ((unit === "pcs" || unit === "pc") && cpu.pcs) return acc + cpu.pcs * qty;
      return acc;
    }, 0);
  }, [allLines, priceByIngredient]);

  const totalCost = round2((doughCostPerBall ?? 0) + ingredientCostTotal);

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
  const sp = typeof sellPrice === "number" && sellPrice > 0 ? sellPrice : null;
  const effectiveCostPerPortion = totalCost > 0 ? totalCost : null;
  const foodCostPct = sp && effectiveCostPerPortion ? (effectiveCostPerPortion / sp) * 100 : null;
  const margeBrute = sp && effectiveCostPerPortion ? sp - effectiveCostPerPortion : null;
  const prixTTC = sp ? sp * (1 + vatRate) : null;

  // Tab definitions
  const MAIN_TABS: { key: MainTab; label: string }[] = isEdit ? [
    { key: "fc", label: "Food cost & Marges" },
    { key: "recette", label: "Recette & Procede" },
    { key: "cmd", label: "Commandes fournisseurs" },
    { key: "pop", label: "Pilotage CA — Popina" },
  ] : [
    { key: "recette", label: "Recette" },
  ];

  const title = name || (isEdit ? "Fiche pizza" : "Nouvelle pizza");

  // Load
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { setStatus("error"); setError({ message: "NOT_LOGGED" }); return; }

      const ingsQ = supabase.from("ingredients").select("*").eq("is_active", true);
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
      for (const o of offerList) {
        const iid = String(o.ingredient_id ?? "");
        if (!iid) continue;
        pm[iid] = offerRowToCpu(o);
        metaM[iid] = { density_kg_per_l: o.density_kg_per_l as number | null, piece_weight_g: o.piece_weight_g as number | null };
        const sid = String(o.supplier_id ?? "");
        supplierByIng[iid] = sid ? (supplierNameById[sid] ?? null) : null;
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
          const prQ = supabase.from("prep_recipes").select("name,output_ingredient_id,total_cost,yield_grams");
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

      if (cancelled) return;
      setPriceByIngredient(pm);
      setSupplierByIngredient(supplierByIng);

      const labelMap: Record<string, string> = {};
      for (const i of ingList) {
        labelMap[i.id] = formatCpuLabel(pm[i.id] ?? {}, metaM[i.id] ?? {}, i.piece_volume_ml ?? null, supplierByIng[i.id] ?? null);
      }
      setPriceLabelByIngredient(labelMap);

      if (pizzaId) {
        const [{ data: piz }, { data: pLines }] = await Promise.all([
          supabase.from("pizza_recipes").select("*").eq("id", pizzaId).single(),
          supabase.from("pizza_ingredients").select("*").eq("pizza_id", pizzaId).order("sort_order"),
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
            if (mr >= 1) setMarginRate(String(Math.round(mr)));
            else if (mr > 0) setMarginRate(String(Math.round(mr * 100)));
          }
          if (p.sell_price != null) setSellPrice(Number(p.sell_price));
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

      const marginRateNum = Number(marginRate);
      const margin_rate = marginRateNum > 0 ? round2(marginRateNum) : 0;
      const stepsJson = steps.length > 0 ? JSON.stringify(steps) : null;
      const notesValue = stepsJson ?? (notes || null);

      const payload: Record<string, unknown> = {
        name: name || "Nouvelle pizza",
        dough_recipe_id: doughRecipeId || null,
        notes: notesValue,
        photo_url: photoUrl || null,
        establishments: etab.current ? [etab.current.slug] : ["bellomio"],
        total_cost: totalCost > 0 ? totalCost : null,
        vat_rate: vatRate,
        margin_rate,
        sell_price: sellPrice !== "" ? Number(sellPrice) : null,
        is_draft: false,
      };

      let pid = pizzaId;
      if (pid) {
        const { error } = await supabase.from("pizza_recipes").update(payload).eq("id", pid);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("pizza_recipes")
          .insert({ ...payload, user_id: auth.user.id, ...(etab.current ? { etablissement_id: etab.current.id } : {}) })
          .select("id").single<{ id: string }>();
        if (error) throw error;
        pid = data.id;
      }

      // Save pivot (column added by migration — silent failure if not yet applied)
      await supabase.from("pizza_recipes").update({ pivot_ingredient_id: pivotIngredientId }).eq("id", pid!);

      // Upsert ingredient lines
      await supabase.from("pizza_ingredients").delete().eq("pizza_id", pid!);
      const allValidLines = [
        ...preLines.filter(l => l.ingredient_id && l.qty !== "" && Number(l.qty) > 0).map((l, i) => ({ ...l, stage: "pre", sort_order: i })),
        ...postLines.filter(l => l.ingredient_id && l.qty !== "" && Number(l.qty) > 0).map((l, i) => ({ ...l, stage: "post", sort_order: i })),
      ];
      if (allValidLines.length > 0) {
        const { error: lErr } = await supabase.from("pizza_ingredients").insert(
          allValidLines.map(l => ({
            pizza_id: pid!,
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
    await supabase.from("pizza_ingredients").delete().eq("pizza_id", pizzaId);
    await supabase.from("pizza_recipes").delete().eq("id", pizzaId);
    router.push("/recettes?tab=pizza");
  }

  async function handleExportPdf() {
    if (!pizzaId) return;
    setPdfLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { alert("Non authentifie"); return; }
      const res = await fetchApi("/api/pizzas/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ pizzaId }),
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
                  {etab.current && <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 8px", borderRadius: 6, background: "#D4775A", color: "#fff" }}>{etab.current.nom ?? "Etablissement"}</span>}
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 8px", borderRadius: 6, background: "#f2ede4", color: "#666" }}>Pizza</span>
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
                  {pdfLoading ? "Export…" : "Apercu PDF"}
                </button>
                <PublishCatalogueButton recipeType="pizza" recipeId={pizzaId!} />
              </>
            )}
            {userCanWrite && (
              <button onClick={handleSave} disabled={saving} className="btn btnPrimary">
                {saving ? "Sauvegarde…" : "Enregistrer"}
              </button>
            )}
            {isEdit && userCanWrite && (
              <button
                type="button"
                onClick={async () => {
                  if (!confirm("Supprimer cette recette ? Cette action est irreversible.")) return;
                  const { error } = await supabase.from("pizza_recipes").delete().eq("id", pizzaId);
                  if (error) { alert(error.message); return; }
                  router.push("/recettes");
                }}
                style={{
                  fontSize: 11, fontWeight: 600, padding: "6px 12px", borderRadius: 8,
                  border: "1px solid rgba(220,38,38,0.3)", background: "rgba(220,38,38,0.06)",
                  color: "#DC2626", cursor: "pointer",
                }}
              >
                Supprimer
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
            <KpiBannerItem label="COUT REVIENT" value={effectiveCostPerPortion ? `${fmtMoney(effectiveCostPerPortion)} €` : "-"} sub="par pizza" color="#D4775A" />
            <KpiBannerItem
              label="FOOD COST"
              value={foodCostPct != null ? `${foodCostPct.toFixed(1)}%` : "-"}
              sub="objectif ≤ 32%"
              color={foodCostPct == null ? "#999" : foodCostPct <= 28 ? "#16a34a" : foodCostPct <= 32 ? "#D97706" : "#DC2626"}
            />
            <KpiBannerItem label="PRIX DE VENTE HT" value={sp ? `${fmtMoney(sp)} €` : "-"} sub={prixTTC ? `${fmtMoney(prixTTC)} € TTC` : ""} color="#1a1a1a" />
            <KpiBannerItem label="MARGE BRUTE" value={margeBrute != null ? `${fmtMoney(margeBrute)} €` : "-"} sub="par pizza" color="#16a34a" />
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
        {mainTab === "fc" && isEdit && pizzaId && (
          <GestionFoodCost
            recipeId={pizzaId}
            recipeType="pizza"
            lines={allLines}
            ingredients={ingredients}
            priceByIngredient={priceByIngredient}
            supplierByIngredient={supplierByIngredient}
            totalCost={totalCost}
            sellPrice={sp}
            onSellPriceChange={(p) => setSellPrice(p)}
            portionsCount={null}
            yieldGrams={ballWeightG !== "" ? Number(ballWeightG) : null}
          />
        )}

        {/* ── TAB: COMMANDES ── */}
        {mainTab === "cmd" && isEdit && pizzaId && (
          <GestionCommandes
            recipeId={pizzaId}
            recipeType="pizza"
            lines={allLines}
            ingredients={ingredients}
            etablissementId={etab.current?.id}
          />
        )}

        {/* ── TAB: PILOTAGE ── */}
        {mainTab === "pop" && isEdit && (
          <GestionPilotage recipeName={name} recipeType="pizza" />
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
                  <div className="card" style={{ marginBottom: 16 }}>
                    <h3 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "#6f6a61" }}>
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
                <div className="card" style={{ marginBottom: 16 }}>
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

                {/* Ingredients Avant four */}
                <div className="card" style={{ marginBottom: 16 }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: ACCENT }}>
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
                  />
                </div>

                {/* Ingredients Apres four */}
                <div className="card" style={{ marginBottom: 16 }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "#6B3A2A" }}>
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
                  />
                </div>

                {/* Etapes */}
                <div className="card" style={{ marginBottom: 16 }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: ACCENT }}>
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
                <div className="card" style={{ marginBottom: 16 }}>
                  <h3 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "#6f6a61" }}>
                    Allergenes
                  </h3>
                  <AllergenBadges allergens={computedAllergens} />
                </div>

                {/* Prix & Marges */}
                <div className="card" style={{ marginBottom: 16 }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: ACCENT }}>
                    Prix &amp; Marges
                  </h3>
                  <PricingBlock
                    costPerPortion={totalCost > 0 ? totalCost : null}
                    portionLabel="pizza"
                    vatRate={vatRate}
                    onVatChange={setVatRate}
                    marginRate={marginRate}
                    onMarginChange={setMarginRate}
                    sellPrice={sellPrice}
                    onSellPriceChange={setSellPrice}
                    accentColor={ACCENT}
                  />
                </div>

                {/* Photo */}
                <div className="card" style={{ marginBottom: 16 }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "#6f6a61" }}>
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

function KpiBannerItem({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{ flex: 1, padding: "12px 14px", borderRight: "1px solid #f0ebe2" }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
