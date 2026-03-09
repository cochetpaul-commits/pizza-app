"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { NavBar } from "@/components/NavBar";
import { TopNav } from "@/components/TopNav";

import { AllergenBadges } from "@/components/AllergenBadges";
import { parseAllergens, mergeAllergens } from "@/lib/allergens";
import { offerRowToCpu } from "@/lib/offerPricing";
import { formatCpuLabel } from "@/lib/formatPrice";
import { compressImage } from "@/lib/compressImage";
import { EstablishmentPicker } from "./EstablishmentPicker";
import { IngredientListDnD, type IngredientLine } from "./IngredientListDnD";
import { StepsList } from "./StepsList";
import type { Ingredient, Category } from "@/types/ingredients";
import type { CpuByUnit } from "@/lib/offerPricing";

const CUISINE_UNITS = ["g", "ml", "pc"];

const CATEGORIES = [
  { id: "preparation",    label: "Préparation" },
  { id: "plat_cuisine",   label: "Plat cuisiné" },
  { id: "entree",         label: "Entrée" },
  { id: "accompagnement", label: "Accompagnement" },
  { id: "sauce",          label: "Sauce" },
  { id: "dessert",        label: "Dessert" },
  { id: "autre",          label: "Autre" },
];

const VAT_OPTIONS = [
  { value: 0.055, label: "5,5 %" },
  { value: 0.1,   label: "10 %" },
  { value: 0.2,   label: "20 %" },
];

function tmpId() { return `tmp-${Math.random().toString(36).slice(2)}`; }
function n2(v: unknown) { const x = Number(v); return Number.isFinite(x) ? x : 0; }
function round2(v: number) { return Math.round(v * 100) / 100; }
function fmtMoney(v: number) { return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

const kpiCard: React.CSSProperties = {
  background: "rgba(0,0,0,0.03)",
  borderRadius: 10,
  padding: "10px 12px",
};
const kpiLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#6f6a61",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  marginBottom: 3,
};
const kpiValue: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 900,
  color: "#2d2d2d",
};

interface Props { recipeId?: string; initialProdMode?: boolean; }

function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n) + "…" : s; }

export default function CuisineFormV2({ recipeId, initialProdMode }: Props) {
  const router = useRouter();
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
  const [lines, setLines] = useState<IngredientLine[]>([]);

  // Steps
  const [steps, setSteps] = useState<string[]>([]);

  // Pricing — marginRate as string "75" = 75%
  const [vatRate, setVatRate] = useState(0.1);
  const [marginRate, setMarginRate] = useState("75");

  // Production mode
  const [prodMode, setProdMode] = useState(initialProdMode ?? false);
  const [pivotIngredientId, setPivotIngredientId] = useState<string | null>(null);
  const [prodQty, setProdQty] = useState<number | "">("");

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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
  const totalCostG = useMemo(() => {
    return lines.reduce((acc, l) => {
      if (!l.ingredient_id || l.qty === "" || !(Number(l.qty) > 0)) return acc;
      const cpu = priceByIngredient[l.ingredient_id];
      if (!cpu) return acc;
      const qty = Number(l.qty);
      const unit = l.unit.toLowerCase();
      if (unit === "g" && cpu.g) return acc + cpu.g * qty;
      if (unit === "ml" && cpu.ml) return acc + cpu.ml * qty;
      if ((unit === "pc" || unit === "pcs") && cpu.pcs) return acc + cpu.pcs * qty;
      return acc;
    }, 0);
  }, [lines, priceByIngredient]);

  // Poids total ingrédients (g + ml≈g, pc ignoré)
  const totalWeightG = useMemo(() => {
    return lines.reduce((acc, l) => {
      if (!l.ingredient_id || l.qty === "" || !(Number(l.qty) > 0)) return acc;
      const qty = Number(l.qty);
      const unit = l.unit.toLowerCase();
      if (unit === "g") return acc + qty;
      if (unit === "ml") return acc + qty;
      return acc;
    }, 0);
  }, [lines]);

  const yieldG = yieldGrams !== "" ? Number(yieldGrams) : null;
  const portions = portionsCount !== "" ? Number(portionsCount) : null;
  const costPerKg = yieldG && yieldG > 0 && totalCostG > 0 ? round2((totalCostG / yieldG) * 1000) : null;
  const costPerPortion = portions && portions > 0 && totalCostG > 0 ? round2(totalCostG / portions) : null;

  // Pricing calculations
  const marginPctNum = useMemo(() => {
    const n = Number(String(marginRate).replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [marginRate]);

  const pricing = useMemo(() => {
    const m = Math.min(Math.max(marginPctNum, 0), 99.9) / 100;
    const v = vatRate;
    const pvKgHT = costPerKg && costPerKg > 0 && m < 1 ? costPerKg / (1 - m) : null;
    const pvKgTTC = pvKgHT ? pvKgHT * (1 + v) : null;
    const pvPortionHT = costPerPortion && costPerPortion > 0 && m < 1 ? costPerPortion / (1 - m) : null;
    const pvPortionTTC = pvPortionHT ? pvPortionHT * (1 + v) : null;
    return { pvKgHT, pvKgTTC, pvPortionHT, pvPortionTTC };
  }, [costPerKg, costPerPortion, marginPctNum, vatRate]);

  // Load data
  useEffect(() => {
    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { setStatus("error"); setError({ message: "NOT_LOGGED" }); return; }

      const [{ data: ingsData, error: iErr }, { data: offers }] = await Promise.all([
        supabase.from("ingredients").select("*").eq("is_active", true).order("name"),
        supabase.from("v_latest_offers").select("*"),
      ]);
      if (iErr) { setStatus("error"); setError(iErr); return; }

      const ingList = (ingsData ?? []) as Ingredient[];
      setIngredients(ingList);

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
          supplierByIng[i.id] = "maison";
          continue;
        }
        const cpu = i.cost_per_unit;
        if (cpu != null && cpu > 0) {
          pm[i.id] = { g: cpu };
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
          const [{ data: krAll }, { data: prAll }] = await Promise.all([
            supabase.from("kitchen_recipes").select("name,output_ingredient_id,total_cost,yield_grams,cost_per_kg"),
            supabase.from("prep_recipes").select("name,output_ingredient_id,total_cost,yield_grams"),
          ]);
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
          if (r.procedure) {
            try { setSteps(JSON.parse(String(r.procedure)) as string[]); } catch { setSteps([]); }
          }
          setPivotIngredientId(String(r.pivot_ingredient_id ?? "") || null);
        }
        if (recLines) {
          setLines((recLines as Array<Record<string, unknown>>).map((l, i) => ({
            id: String(l.id ?? tmpId()),
            ingredient_id: String(l.ingredient_id ?? ""),
            qty: n2(l.qty) || "",
            unit: String(l.unit ?? "g"),
            sort_order: n2(l.sort_order) || i,
          })));
        }
      }

      setStatus("ok");
    }
    load();
  }, [recipeId]);

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
      const margin_rate = marginRateNum > 0 ? round2(marginRateNum) : null;
      const totalCost = round2(totalCostG);

      const payload: Record<string, unknown> = {
        name: name || "Nouvelle recette",
        category,
        yield_grams: yieldGrams !== "" ? Math.round(Number(yieldGrams)) : 0,
        portions_count: portionsCount !== "" ? Math.round(Number(portionsCount)) : 0,
        establishments,
        vat_rate: vatRate,
        margin_rate,
        total_cost: totalCost > 0 ? totalCost : null,
        cost_per_kg: costPerKg,
        cost_per_portion: costPerPortion,
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
          .insert({ ...payload, user_id: auth.user.id })
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
        } else if (costPerKg && costPerKg > 0) {
          await supabase.from("ingredients").insert({
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
          });
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
    return (unit === "g" || unit === "ml") ? acc + qty : acc;
  }, 0);

  if (status === "loading") {
    return (
      <>
        <NavBar backHref="/recettes?tab=cuisine" backLabel="Recettes" />
        <main className="container"><div className="muted" style={{ marginTop: 40, textAlign: "center" }}>Chargement…</div></main>
      </>
    );
  }
  if (status === "error") {
    return (
      <>
        <NavBar backHref="/recettes?tab=cuisine" backLabel="Recettes" />
        <main className="container"><pre className="errorBox">{JSON.stringify(error, null, 2)}</pre></main>
      </>
    );
  }

  return (
    <>
      <NavBar
        backHref="/recettes?tab=cuisine"
        backLabel="Recettes"
        menuItems={[
          {
            label: prodMode ? "Mode normal" : "Mode production",
            onClick: () => { setProdMode(m => !m); setProdQty(""); },
            style: prodMode
              ? { background: "#166534", color: "white", borderColor: "#166534" }
              : undefined,
          },
          ...(!prodMode && isEdit ? [{
            label: "Supprimer",
            onClick: handleDelete,
            style: { color: "#d93f3f" } as React.CSSProperties,
          }] : []),
        ]}
        primaryAction={!prodMode ? (
          <button onClick={handleSave} disabled={saving} className="btn btnPrimary">
            {saving ? "Sauvegarde…" : "Sauvegarder"}
          </button>
        ) : undefined}
      />

      <main className="container safe-bottom">
        {/* ── MODE PRODUCTION ── */}
        {prodMode ? (
          <>
            {/* Banner */}
            <div style={{
              background: "#166534", color: "white", borderRadius: 12,
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
                    <input
                      type="number" inputMode="numeric" min={0} step={1}
                      className="pivotInput"
                      value={prodQty}
                      onChange={e => setProdQty(e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder={String(prodPivotLine.qty)}
                      style={{
                        width: 120, height: 52, fontSize: 28, fontWeight: 800,
                        textAlign: "center", borderRadius: 10,
                        border: "2px solid #D97706", background: "white",
                        fontFamily: "inherit",
                      }}
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
                          <span style={{ fontSize: 22, fontWeight: 800, color: "#166534" }}>
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
                    color: "#166534", fontWeight: 700, fontSize: 15, marginBottom: 16,
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
            <TopNav title={title} subtitle={`Cuisine${isEdit ? " · édition" : " · nouveau"}`} />

            {saveError && <div className="errorBox" style={{ marginBottom: 12 }}>{saveError}</div>}

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
                          borderColor: category === c.id ? "#166534" : "rgba(217,199,182,0.9)",
                          background: category === c.id ? "rgba(22,101,52,0.08)" : "rgba(255,255,255,0.7)",
                          color: category === c.id ? "#166534" : "#6f6a61",
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
                      <input
                        className="input" type="number" min={0} step={1}
                        value={yieldGrams}
                        onChange={e => setYieldGrams(e.target.value === "" ? "" : Number(e.target.value))}
                        placeholder="ex: 1000"
                        style={{ width: 100 }}
                      />
                      {totalWeightG > 0 && (
                        <button
                          type="button"
                          onClick={() => setYieldGrams(Math.round(totalWeightG))}
                          title={`Utiliser le poids total des ingrédients (${Math.round(totalWeightG)} g)`}
                          style={{
                            padding: "0 10px", height: 36, borderRadius: 8, fontSize: 12, fontWeight: 700,
                            border: "1.5px solid #166534", background: "rgba(22,101,52,0.07)",
                            color: "#166534", cursor: "pointer", whiteSpace: "nowrap",
                          }}
                        >= Poids ingrédients</button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="label">Portions</label>
                    <input
                      className="input" type="number" min={0} step={1}
                      value={portionsCount}
                      onChange={e => setPortionsCount(e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder="ex: 4"
                      style={{ width: 90 }}
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
              <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "#166534" }}>
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
                  <span>Poids total : <strong style={{ color: "#166534" }}>{Math.round(totalWeightG).toLocaleString("fr-FR")} g</strong></span>
                  {totalCostG > 0 && <span>Coût total : <strong style={{ color: "#166534" }}>{round2(totalCostG).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</strong></span>}
                </div>
              )}
            </div>

            {/* Étapes */}
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "#166534" }}>
                Étapes
              </h3>
              <StepsList steps={steps} onChange={setSteps} />
            </div>

            {/* Prix & Marges */}
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "#166534" }}>
                Prix &amp; Marges
              </h3>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                <div style={kpiCard}>
                  <div style={kpiLabel}>Coût / kg</div>
                  <div style={kpiValue}>{costPerKg ? fmtMoney(costPerKg) + " €" : "—"}</div>
                </div>
                <div style={kpiCard}>
                  <div style={kpiLabel}>Coût / portion</div>
                  <div style={kpiValue}>{costPerPortion ? fmtMoney(costPerPortion) + " €" : "—"}</div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                <div>
                  <label className="label">TVA vente</label>
                  <div style={{ display: "flex", gap: 4 }}>
                    {VAT_OPTIONS.map(opt => (
                      <button
                        key={opt.value} type="button" onClick={() => setVatRate(opt.value)}
                        style={{
                          flex: 1, padding: "7px 0", borderRadius: 8, fontSize: 12, fontWeight: 700,
                          border: "1.5px solid",
                          borderColor: vatRate === opt.value ? "#8B1A1A" : "rgba(217,199,182,0.9)",
                          background: vatRate === opt.value ? "rgba(139,26,26,0.08)" : "rgba(255,255,255,0.7)",
                          color: vatRate === opt.value ? "#8B1A1A" : "#6f6a61",
                          cursor: "pointer",
                        }}
                      >{opt.label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label">Marge %</label>
                  <input
                    className="input" type="number" min={0} max={99} step={1}
                    value={marginRate}
                    onChange={e => setMarginRate(e.target.value)}
                    style={{ textAlign: "center", fontWeight: 700 }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={kpiCard}>
                  <div style={kpiLabel}>PV conseillé / portion TTC</div>
                  <div style={{ ...kpiValue, color: "#8B1A1A" }}>
                    {pricing.pvPortionTTC ? fmtMoney(pricing.pvPortionTTC) + " €" : "—"}
                  </div>
                </div>
                <div style={kpiCard}>
                  <div style={kpiLabel}>PV conseillé / kg TTC</div>
                  <div style={{ ...kpiValue, color: "#8B1A1A" }}>
                    {pricing.pvKgTTC ? fmtMoney(pricing.pvKgTTC) + " €" : "—"}
                  </div>
                </div>
              </div>
            </div>

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
              <button onClick={handleSave} disabled={saving} className="btn btnPrimary w-full">
                {saving ? "Sauvegarde…" : "Sauvegarder"}
              </button>
            </div>
          </>
        )}
      </main>
    </>
  );
}
