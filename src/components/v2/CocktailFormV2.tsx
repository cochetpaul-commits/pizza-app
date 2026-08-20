"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRecipeDraft } from "@/lib/useRecipeDraft";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";
import { AllergenBadges } from "@/components/AllergenBadges";
import { parseAllergens, mergeAllergens } from "@/lib/allergens";
import { offerRowToCpu, enrichCpuWithConversions } from "@/lib/offerPricing";
import { formatRecipeParamsLine } from "@/lib/formatPrice";
import { buildRecipeMeta, type RecipeIngredientMeta } from "@/lib/recipeMeta";
import type { LatestOffer } from "@/types/ingredients";
import { formatCpuLabel } from "@/lib/formatPrice";
import { compressImage } from "@/lib/compressImage";
import { fetchApi } from "@/lib/fetchApi";
import { IngredientListDnD, normalizeUnit, type IngredientLine } from "./IngredientListDnD";
import { StepsList } from "./StepsList";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import { EtabsSelector, estabsFromRow, estabsToPayload, ETABS_RECETTES } from "./EtabsSelector";
import { RecipeHero, HeroBtn, HeroDangerBtn } from "./RecipeHero";
import { GestionFoodCost } from "./GestionFoodCost";
import { StepperInput } from "@/components/StepperInput";
import type { Ingredient } from "@/types/ingredients";
import type { CpuByUnit } from "@/lib/offerPricing";
import { PublishCatalogueButton } from "./PublishCatalogueButton";
import ProductionModal from "@/components/ProductionModal";

const COCKTAIL_UNITS = ["g", "cL", "pcs"];
const ACCENT = "#0E7490";

const COCKTAIL_TYPES = [
  { id: "long_drink",   label: "Long drink" },
  { id: "short_drink",  label: "Short drink" },
  { id: "shot",         label: "Shot" },
  { id: "mocktail",     label: "Mocktail" },
  { id: "signature",    label: "Signature" },
];

const GLASS_OPTIONS = ["Tumbler", "Coupe", "Flûte", "Highball", "Martini", "Autre"];
const METHOD_OPTIONS = ["Shaker", "Build", "Stirred", "Blender"];

function tmpId() { return `tmp-${Math.random().toString(36).slice(2)}`; }
function n2(v: unknown) { const x = Number(v); return Number.isFinite(x) ? x : 0; }
function round2(v: number) { return Math.round(v * 100) / 100; }
function fmtMoney(v: number) { return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

interface Props { cocktailId?: string; initialProdMode?: boolean; }

function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n) + "…" : s; }

export default function CocktailFormV2({ cocktailId, initialProdMode }: Props) {
  const router = useRouter();
  const { can } = useProfile();
  const userCanWrite = can("operations.edit_recettes");
  const { current: etab } = useEtablissement();
  const isEdit = !!cocktailId;

  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState<unknown>(null);

  // Form state
  const [name, setName] = useState("");
  const [type, setType] = useState("long_drink");
  const [glass, setGlass] = useState("");
  const [garnish, setGarnish] = useState("");
  const [method, setMethod] = useState("");
  const [baseAlcool, setBaseAlcool] = useState("");
  const [sellCoeff, setSellCoeff] = useState<number | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  // Ingredients
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [priceByIngredient, setPriceByIngredient] = useState<Record<string, CpuByUnit>>({});
  const [priceLabelByIngredient, setPriceLabelByIngredient] = useState<Record<string, string>>({});
  const [metaByIngredient, setMetaByIngredient] = useState<Record<string, RecipeIngredientMeta>>({});
  const [supplierByIngredient, setSupplierByIngredient] = useState<Record<string, string | null>>({});
  const [lines, setLines] = useState<IngredientLine[]>([]);

  // Steps (stored in `steps` column)
  const [steps, setSteps] = useState<string[]>([]);

  // Pricing
  const [vatRate, setVatRate] = useState(0.2);
  const [fcTarget, setFcTarget] = useState(20);

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
  const [estabs, setEstabs] = useState<string[]>(ETABS_RECETTES.map(e => e.slug));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Brouillon en cache : l'edition d'un ingredient depuis la recette navigue
  // vers /ingredients puis revient — on restaure le travail en cours.
  const { clearDraft } = useRecipeDraft({
    key: `recette-draft:cocktail:${cocktailId ?? "new"}`,
    ready: status === "ok",
    snapshot: { name, type, glass, garnish, method, baseAlcool, sellCoeff, imageUrl, lines, steps, vatRate, fcTarget, pivotIngredientId, prodQty },
    restore: (d) => {
      setName(d.name); setType(d.type); setGlass(d.glass); setGarnish(d.garnish);
      setMethod(d.method); setBaseAlcool(d.baseAlcool); setSellCoeff(d.sellCoeff); setImageUrl(d.imageUrl);
      setLines(d.lines); setSteps(d.steps); setVatRate(d.vatRate); setFcTarget(d.fcTarget);
      setPivotIngredientId(d.pivotIngredientId); setProdQty(d.prodQty);
    },
  });

  const fileRef = useRef<HTMLInputElement | null>(null);

  // Computed allergens
  const computedAllergens = useMemo(() => {
    const lists = lines
      .map(l => ingredients.find(i => i.id === l.ingredient_id))
      .filter(Boolean)
      .map(i => parseAllergens((i as Ingredient).allergens))
      .filter((a): a is string[] => Array.isArray(a));
    return mergeAllergens(lists);
  }, [lines, ingredients]);

  // Total cost
  const totalCostEur = useMemo(() => {
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

      if ((unit === "g" || unit === "kg") && eff.g) return acc + eff.g * (unit === "kg" ? qty * 1000 : qty);
      if ((unit === "cl" || unit === "ml" || unit === "l") && eff.ml) {
        const factor = unit === "cl" ? 10 : unit === "l" ? 1000 : 1;
        return acc + eff.ml * qty * factor;
      }
      if ((unit === "pc" || unit === "pcs") && eff.pcs) return acc + eff.pcs * qty;
      return acc;
    }, 0);
  }, [lines, priceByIngredient, ingredients]);

  // Production mode computations
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
    return (unit === "cl" || unit === "ml") ? acc + (unit === "cl" ? qty * 10 : qty) : acc;
  }, 0);

  // ── KPI computations ──────────────────────────────────────────
  const costPerCocktail = totalCostEur > 0 ? round2(totalCostEur) : null;
  const derivedSellPrice = costPerCocktail && sellCoeff && sellCoeff > 0 ? round2(costPerCocktail * sellCoeff) : null;
  const foodCostPct = costPerCocktail && derivedSellPrice ? round2((costPerCocktail / derivedSellPrice) * 100) : null;
  const margePerCocktail = costPerCocktail && derivedSellPrice ? round2(derivedSellPrice - costPerCocktail) : null;
  const prixTTC = derivedSellPrice ? round2(derivedSellPrice * (1 + vatRate)) : null;

  const typeLabel = COCKTAIL_TYPES.find(t => t.id === type)?.label ?? type;

  // Tab definitions
  const MAIN_TABS: { key: MainTab; label: string }[] = [
    { key: "recette", label: "Recette" },
  ];

  // Load
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { setStatus("error"); setError({ message: "NOT_LOGGED" }); return; }

      const myEstab = etab?.slug?.includes("piccola") ? "piccola" : "bellomio";
      const ingsQ = supabase.from("ingredients").select("*").eq("is_active", true)
        .or(`establishments.cs.{"${myEstab}"},establishments.is.null`);
      const offQ = supabase.from("v_latest_offers").select("*");
      const [{ data: ingsData, error: iErr }, { data: offers }] = await Promise.all([
        ingsQ.order("name"),
        offQ,
      ]);
      if (cancelled) return;
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
      const metaMap: Record<string, RecipeIngredientMeta> = {};
      for (const i of ingList) {
        const off = offerByIng[i.id] ?? null;
        if (off) {
          labelMap[i.id] = formatRecipeParamsLine(i, off);
        } else {
          labelMap[i.id] = formatCpuLabel(pm[i.id] ?? {}, metaM[i.id] ?? {}, i.piece_volume_ml ?? null, null);
        }
        metaMap[i.id] = buildRecipeMeta(i, off, supplierByIng[i.id] ?? null);
        if (!metaMap[i.id].prix && labelMap[i.id] !== "Prix ND") metaMap[i.id].prix = labelMap[i.id];
      }
      setPriceLabelByIngredient(labelMap);
      setMetaByIngredient(metaMap);

      if (cocktailId) {
        const [{ data: coc }, { data: cLines }] = await Promise.all([
          supabase.from("kitchen_recipes").select("*").eq("id", cocktailId).single(),
          supabase.from("kitchen_recipe_lines").select("*").eq("recipe_id", cocktailId).order("sort_order"),
        ]);
        if (cancelled) return;
        if (coc) {
          const c = coc as Record<string, unknown>;
          const meta = (c.metadata ?? {}) as Record<string, unknown>;
          setName(String(c.name ?? ""));
          setEstabs(estabsFromRow((c).establishments));
          setType(String(meta.type ?? "long_drink"));
          setGlass(String(meta.glass ?? ""));
          setGarnish(String(meta.garnish ?? ""));
          setImageUrl(String(c.photo_url ?? ""));
          if (c.photo_url) setPhotoPreview(String(c.photo_url));
          if (c.vat_rate) setVatRate(Number(c.vat_rate));
          if (c.margin_rate) {
            const mr = Number(c.margin_rate);
            if (mr > 0) setSellCoeff(mr);
          }
          if (c.procedure) {
            try { setSteps(JSON.parse(String(c.procedure)) as string[]); }
            catch { setSteps(String(c.procedure) ? String(c.procedure).split("\n").filter(Boolean) : []); }
          }
          setPivotIngredientId(String(c.pivot_ingredient_id ?? "") || null);
        }
        if (cLines) {
          setLines((cLines as Array<Record<string, unknown>>).map((l, i) => {
            const rawUnit = String(l.unit ?? "cl");
            const nu = normalizeUnit(rawUnit);
            let rawQty: number | "" = n2(l.qty) || "";
            if (rawUnit.toLowerCase() === "ml" && typeof rawQty === "number" && rawQty > 0) rawQty = round2(rawQty / 10);
            return { id: String(l.id ?? tmpId()), ingredient_id: String(l.ingredient_id ?? ""), qty: rawQty, unit: nu, sort_order: n2(l.sort_order) || i };
          }));
        }
      }

      setStatus("ok");
    }
    load();
    return () => { cancelled = true; };
  }, [cocktailId, etab]);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    try {
      const compressed = await compressImage(file);
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData.user?.id ?? "anon";
      const ts = Date.now();
      const path = cocktailId ? `${uid}/cocktails/${cocktailId}.jpg` : `${uid}/cocktails/${ts}.jpg`;
      const { error: upErr } = await supabase.storage.from("recipe-images").upload(path, compressed, { upsert: true, contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("recipe-images").getPublicUrl(path);
      setImageUrl(urlData.publicUrl);
      setPhotoPreview(urlData.publicUrl);
    } catch (err) { console.error("Photo upload:", err); }
    finally { setPhotoUploading(false); }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("NOT_LOGGED");

      const margin_rate = sellCoeff && sellCoeff > 0 ? round2(sellCoeff) : 0;
      const totalCost = round2(totalCostEur);

      const payload: Record<string, unknown> = {
        name: name || "Nouveau cocktail",
        category: "cocktail",
        metadata: { type, glass: glass || null, garnish: garnish || null },
        sell_price: derivedSellPrice ?? null,
        photo_url: imageUrl || null,
        establishments: estabsToPayload(estabs),
        vat_rate: vatRate,
        margin_rate,
        total_cost: totalCost > 0 ? totalCost : null,
        procedure: steps.length > 0 ? JSON.stringify(steps) : null,
        is_draft: false,
        is_active: true,
      };

      let cid = cocktailId;
      if (cid) {
        const { error } = await supabase.from("kitchen_recipes").update(payload).eq("id", cid);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("kitchen_recipes")
          .insert({ ...payload, user_id: auth.user.id, ...(etab ? { etablissement_id: etab.id } : {}) })
          .select("id").single<{ id: string }>();
        if (error) throw error;
        cid = data.id;
      }

      // Save pivot
      await supabase.from("kitchen_recipes").update({ pivot_ingredient_id: pivotIngredientId }).eq("id", cid!);

      await supabase.from("kitchen_recipe_lines").delete().eq("recipe_id", cid!);
      const validLines = lines.filter(l => l.ingredient_id && l.qty !== "" && Number(l.qty) > 0);
      if (validLines.length > 0) {
        const { error: lErr } = await supabase.from("kitchen_recipe_lines").insert(
          validLines.map((l, i) => ({
            recipe_id: cid!,
            ingredient_id: l.ingredient_id,
            qty: Number(l.qty),
            unit: l.unit,
            sort_order: i,
          }))
        );
        if (lErr) throw lErr;
      }

      clearDraft();
      if (!isEdit) router.push(`/recettes/cocktail/${cid}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : (err as { message?: string })?.message ?? JSON.stringify(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!cocktailId) return;
    if (!window.confirm("Supprimer ce cocktail ?")) return;
    await supabase.from("kitchen_recipe_lines").delete().eq("recipe_id", cocktailId);
    await supabase.from("kitchen_recipes").delete().eq("id", cocktailId);
    clearDraft();
    router.push("/recettes?tab=cocktail");
  }

  async function handleExportPdf() {
    if (!cocktailId) return;
    setPdfLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { alert("Non authentifié"); return; }
      const res = await fetchApi("/api/cocktails/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ cocktailId }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({ message: "Erreur inconnue" })); alert(`Erreur PDF: ${e.message}`); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(name || "cocktail").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally { setPdfLoading(false); }
  }

  const title = name || "Nouveau cocktail";

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
          etabName={etab?.nom}
          typeLabel={typeLabel}
          onBack={() => router.push("/recettes")}
          actions={<>
            {isEdit && pivotIngredientId && <HeroBtn onClick={() => setShowProdModal(true)}>Production</HeroBtn>}
            <HeroBtn onClick={handleExportPdf} disabled={!isEdit || pdfLoading} title={!isEdit ? "Enregistrer la recette pour exporter le PDF" : undefined}>{pdfLoading ? "Export…" : "PDF"}</HeroBtn>
            {isEdit ? <PublishCatalogueButton recipeType="cocktail" recipeId={cocktailId!} /> : <HeroBtn disabled title="Enregistrer la recette pour publier au catalogue">Catalogue</HeroBtn>}
            {userCanWrite && <HeroBtn onClick={handleSave} disabled={saving} primary>{saving ? "Sauvegarde…" : "Enregistrer"}</HeroBtn>}
            {isEdit && userCanWrite && (
              <HeroDangerBtn onClick={async () => {
                if (!confirm("Supprimer cette recette ? Cette action est irreversible.")) return;
                await supabase.from("kitchen_recipe_lines").delete().eq("recipe_id", cocktailId);
                const { error } = await supabase.from("kitchen_recipes").delete().eq("id", cocktailId);
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
                background: mainTab === t.key ? (etab?.couleur ? etab.couleur + "25" : "#fff") : "transparent",
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

        {/* ── TAB: RECETTE ── */}
        {mainTab === "recette" && (
          <>
            {/* Food cost & Marges */}
            <CocktailPricing
              costPerCocktail={costPerCocktail}
              sellCoeff={sellCoeff}
              onSellCoeffChange={setSellCoeff}
              derivedSellPrice={derivedSellPrice}
              foodCostPct={foodCostPct}
              fcTarget={fcTarget}
              onFcTargetChange={setFcTarget}
              margePerCocktail={margePerCocktail}
              prixTTC={prixTTC}
              vatRate={vatRate}
              onVatChange={setVatRate}
            />
            <GestionFoodCost
              lines={lines}
              ingredients={ingredients}
              priceByIngredient={priceByIngredient}
              supplierByIngredient={supplierByIngredient}
              totalCost={round2(totalCostEur)}
              multiplier={1}
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
                    Aucun ingrédient pivot défini.<br />
                    Appuyez sur ☆ en mode normal pour en choisir un.
                  </div>
                ) : (
                  <>
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
                          step={0.1} min={0}
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
                        Volume total estimé : {prodTotalW.toLocaleString("fr-FR")} ml
                      </div>
                    )}
                  </>
                )}

                {steps.length > 0 && (
                  <div style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", border: "1px solid #e0d8ce", marginBottom: 14 }}>
                    <h3 style={{ margin: "0 0 12px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#777" }}>
                      Étapes / Recette
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
                      <label className="label">Nom du cocktail</label>
                      <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Nom…" />
                  <EtabsSelector value={estabs} onChange={setEstabs} />
                    </div>

                    <div>
                      <label className="label">Type</label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {COCKTAIL_TYPES.map(t => (
                          <button
                            key={t.id} type="button" onClick={() => setType(t.id)}
                            style={{
                              padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                              border: "1.5px solid",
                              borderColor: type === t.id ? ACCENT : "rgba(217,199,182,0.9)",
                              background: type === t.id ? "rgba(14,116,144,0.08)" : "rgba(255,255,255,0.7)",
                              color: type === t.id ? ACCENT : "#6f6a61",
                              cursor: "pointer",
                            }}
                          >{t.label}</button>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ flex: "1 1 140px" }}>
                        <label className="label">Verrerie</label>
                        <select className="input" value={glass} onChange={e => setGlass(e.target.value)}>
                          <option value="">— verre —</option>
                          {GLASS_OPTIONS.map(g => <option key={g} value={g.toLowerCase()}>{g}</option>)}
                        </select>
                      </div>
                      <div style={{ flex: "1 1 140px" }}>
                        <label className="label">Méthode</label>
                        <select className="input" value={method} onChange={e => setMethod(e.target.value)}>
                          <option value="">— méthode —</option>
                          {METHOD_OPTIONS.map(m => <option key={m} value={m.toLowerCase()}>{m}</option>)}
                        </select>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ flex: "1 1 140px" }}>
                        <label className="label">Base alcool</label>
                        <input className="input" value={baseAlcool} onChange={e => setBaseAlcool(e.target.value)} placeholder="ex: Vodka" />
                      </div>
                      <div style={{ flex: "1 1 140px" }}>
                        <label className="label">Garniture</label>
                        <input className="input" value={garnish} onChange={e => setGarnish(e.target.value)} placeholder="ex: Tranche de citron" />
                      </div>
                    </div>

                  </div>
                </div>

                {/* Ingredients */}
                <div style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", border: "1px solid #e0d8ce", marginBottom: 14 }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#777" }}>
                    Ingrédients
                  </h3>
                  <IngredientListDnD
                    items={lines}
                    ingredients={ingredients}
                    priceByIngredient={priceByIngredient}
                    units={COCKTAIL_UNITS}
                    onChange={setLines}
                    priceLabelByIngredient={priceLabelByIngredient}
                    metaByIngredient={metaByIngredient}
                    pivotId={pivotIngredientId}
                    onPivotChange={setPivotIngredientId}
                    returnUrl={typeof window !== "undefined" ? window.location.pathname + window.location.search : ""}
                  />
                  {totalCostEur > 0 && (
                    <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: "#2f3a33" }}>
                      Coût total : {fmtMoney(round2(totalCostEur))} €
                    </div>
                  )}
                </div>

                {/* Etapes */}
                <div style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", border: "1px solid #e0d8ce", marginBottom: 14 }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#777" }}>
                    Étapes / Recette
                  </h3>
                  <StepsList steps={steps} onChange={setSteps} />
                </div>

                {/* Allergenes */}
                <div style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", border: "1px solid #e0d8ce", marginBottom: 14 }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#777" }}>
                    Allergènes
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
                      <Image src={photoPreview} alt="Photo cocktail" width={200} height={150} style={{ borderRadius: 10, objectFit: "cover" }} />
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

      {showProdModal && pivotIngredientId && cocktailId && (
        <ProductionModal
          recipeType="cocktail"
          recipeId={cocktailId}
          recipeName={title}
          pivotIngredientId={pivotIngredientId}
          onClose={() => setShowProdModal(false)}
        />
      )}
    </>
  );
}

// ── Cocktail Pricing Panel — Hero KPI + Tiroir ──────────────────
function CocktailPricing({
  costPerCocktail, sellCoeff, onSellCoeffChange,
  derivedSellPrice, foodCostPct, fcTarget, onFcTargetChange,
  margePerCocktail, prixTTC,
  vatRate, onVatChange,
}: {
  costPerCocktail: number | null;
  sellCoeff: number | null;
  onSellCoeffChange: (c: number) => void;
  derivedSellPrice: number | null;
  foodCostPct: number | null;
  fcTarget: number;
  onFcTargetChange: (t: number) => void;
  margePerCocktail: number | null;
  prixTTC: number | null;
  vatRate: number;
  onVatChange: (r: number) => void;
}) {
  const [coeffLocal, setCoeffLocal] = useState(sellCoeff != null ? String(sellCoeff) : "");
  const [coeffEditing, setCoeffEditing] = useState(false);
  const [ttcLocal, setTtcLocal] = useState(prixTTC != null ? prixTTC.toFixed(2) : "");
  const [ttcEditing, setTtcEditing] = useState(false);
  const [paramsOpen, setParamsOpen] = useState(true);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!coeffEditing) setCoeffLocal(sellCoeff != null ? String(sellCoeff) : "");
  }, [sellCoeff, coeffEditing]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!ttcEditing) setTtcLocal(prixTTC != null ? prixTTC.toFixed(2) : "");
  }, [prixTTC, ttcEditing]);

  function applyTTC(ttcTyped: number) {
    if (!costPerCocktail || costPerCocktail <= 0) return;
    const coeff = ttcTyped / (costPerCocktail * (1 + vatRate));
    // 4 décimales : préserve la précision du TTC saisi.
    if (coeff > 0) onSellCoeffChange(Math.round(coeff * 10000) / 10000);
  }

  const fcColor = foodCostPct == null ? "#999"
    : foodCostPct <= fcTarget ? "#16a34a"
    : foodCostPct <= fcTarget + 5 ? "#D97706"
    : "#DC2626";
  const fcRatio = foodCostPct == null ? 0 : Math.min(1, foodCostPct / (fcTarget * 1.67));
  const margeColor = margePerCocktail != null && margePerCocktail > 0 ? "#16a34a" : "#999";
  const vatPct = Math.round(vatRate * 100);

  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.08em" };
  const bigNum: React.CSSProperties = { fontSize: 26, fontWeight: 800, fontFamily: "var(--font-oswald), Oswald, sans-serif", lineHeight: 1.1, marginTop: 2 };

  return (
    <div style={{
      background: "#fff", borderRadius: 16, border: "1px solid #e0d8ce",
      marginBottom: 16, overflow: "hidden",
    }}>

      {/* -- Hero KPIs -- 4 columns -- */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
        gap: 0, padding: "20px 16px 16px",
      }}>
        <div style={{ textAlign: "center", padding: "0 4px" }}>
          <div style={lbl}>Cout</div>
          <div style={{ ...bigNum, color: "#8B1A1A" }}>
            {costPerCocktail != null ? `${fmtMoney(costPerCocktail)}€` : "-"}
          </div>
        </div>

        <div style={{ textAlign: "center", padding: "0 4px", borderLeft: "1px solid #ece4d4" }}>
          <div style={lbl}>Coeff</div>
          <div style={{ ...bigNum, color: "#7C3AED" }}>
            {sellCoeff != null ? `×${sellCoeff.toFixed(2)}` : "-"}
          </div>
        </div>

        <div style={{ textAlign: "center", padding: "0 4px", borderLeft: "1px solid #ece4d4" }}>
          <div style={lbl}>Prix vente</div>
          <div style={{ ...bigNum, color: "#1a1a1a" }}>
            {prixTTC != null ? `${fmtMoney(prixTTC)}€` : "-"}
          </div>
          {derivedSellPrice != null && (
            <div style={{ fontSize: 11, color: "#999", marginTop: 1 }}>
              {fmtMoney(derivedSellPrice)}€ HT
            </div>
          )}
        </div>

        <div style={{ textAlign: "center", padding: "0 4px", borderLeft: "1px solid #ece4d4" }}>
          <div style={lbl}>Marge</div>
          <div style={{ ...bigNum, color: margeColor }}>
            {margePerCocktail != null ? `${fmtMoney(margePerCocktail)}€` : "-"}
          </div>
        </div>
      </div>

      {/* -- Food Cost + Marge bar -- */}
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
              {margePerCocktail != null ? `${fmtMoney(margePerCocktail)}€` : "-"}
            </span>
            <span style={{ fontSize: 10, color: "#bbb", marginLeft: "auto" }}>
              / cocktail
            </span>
          </div>
        </div>
      </div>

      {/* -- Tiroir : Parametres -- */}
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
                  value={ttcEditing ? ttcLocal : (prixTTC != null ? prixTTC.toFixed(2) : "")}
                  placeholder="10,00"
                  disabled={!costPerCocktail || costPerCocktail <= 0}
                  onFocus={(e) => {
                    setTtcEditing(true);
                    setTtcLocal(prixTTC != null ? prixTTC.toFixed(2) : "");
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
                    background: costPerCocktail && costPerCocktail > 0 ? "#faf6ee" : "#f0ebe2",
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
