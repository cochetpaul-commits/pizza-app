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
import { IngredientListDnD, normalizeUnit, type IngredientLine } from "./IngredientListDnD";
import { StepsList } from "./StepsList";
import { useProfile } from "@/lib/ProfileContext";
import { PricingBlock } from "./PricingBlock";
import type { Ingredient } from "@/types/ingredients";
import type { CpuByUnit } from "@/lib/offerPricing";

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
  const { canWrite: userCanWrite } = useProfile();
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
  const [sellPrice, setSellPrice] = useState<number | "">("");
  const [imageUrl, setImageUrl] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);

  // Ingredients
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [priceByIngredient, setPriceByIngredient] = useState<Record<string, CpuByUnit>>({});
  const [priceLabelByIngredient, setPriceLabelByIngredient] = useState<Record<string, string>>({});
  const [lines, setLines] = useState<IngredientLine[]>([]);

  // Steps (stored in `steps` column)
  const [steps, setSteps] = useState<string[]>([]);

  // Pricing
  const [vatRate, setVatRate] = useState(0.2);
  const [marginRate, setMarginRate] = useState("75");

  // Production mode
  const [prodMode, setProdMode] = useState(initialProdMode ?? false);
  const [pivotIngredientId, setPivotIngredientId] = useState<string | null>(null);
  const [prodQty, setProdQty] = useState<number | "">("");

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const fileRef = useRef<HTMLInputElement | null>(null);

  // Volume by ingredient (for cl→ml conversion)
  const pieceVolById = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const i of ingredients) m.set(i.id, i.piece_volume_ml ?? null);
    return m;
  }, [ingredients]);

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
      let cpuMl = cpu.ml;
      if (cpuMl == null && cpu.pcs != null) {
        const pvm = pieceVolById.get(l.ingredient_id) ?? null;
        if (pvm && pvm > 0) cpuMl = cpu.pcs / pvm;
      }
      if (unit === "cl" && cpuMl != null) return acc + qty * 10 * cpuMl;
      if (unit === "ml" && cpuMl != null) return acc + qty * cpuMl;
      if (unit === "g" && cpu.g != null) return acc + qty * cpu.g;
      if ((unit === "pc" || unit === "pcs") && cpu.pcs != null) return acc + qty * cpu.pcs;
      return acc;
    }, 0);
  }, [lines, priceByIngredient, pieceVolById]);

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

  // Load
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

      if (cocktailId) {
        const [{ data: coc }, { data: cLines }] = await Promise.all([
          supabase.from("cocktails").select("*").eq("id", cocktailId).single(),
          supabase.from("cocktail_ingredients").select("*").eq("cocktail_id", cocktailId).order("sort_order"),
        ]);
        if (coc) {
          const c = coc as Record<string, unknown>;
          setName(String(c.name ?? ""));
          setType(String(c.type ?? "long_drink"));
          setGlass(String(c.glass ?? ""));
          setGarnish(String(c.garnish ?? ""));
          setSellPrice(c.sell_price ? Number(c.sell_price) : "");
          setImageUrl(String(c.image_url ?? ""));
          if (c.image_url) setPhotoPreview(String(c.image_url));
          if (c.vat_rate) setVatRate(Number(c.vat_rate));
          if (c.margin_rate) {
            const mr = Number(c.margin_rate);
            if (mr >= 1) setMarginRate(String(Math.round(mr)));
            else if (mr > 0) setMarginRate(String(Math.round(mr * 100)));
          }
          if (c.steps) {
            try { setSteps(JSON.parse(String(c.steps)) as string[]); }
            catch { setSteps(String(c.steps) ? String(c.steps).split("\n").filter(Boolean) : []); }
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
  }, [cocktailId]);

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

      const marginRateNum = Number(marginRate);
      const margin_rate = marginRateNum > 0 ? round2(marginRateNum) : 0;
      const totalCost = round2(totalCostEur);

      const payload: Record<string, unknown> = {
        name: name || "Nouveau cocktail",
        type,
        glass: glass || null,
        garnish: garnish || null,
        sell_price: sellPrice !== "" ? Number(sellPrice) : null,
        image_url: imageUrl || null,
        vat_rate: vatRate,
        margin_rate,
        total_cost: totalCost > 0 ? totalCost : null,
        steps: steps.length > 0 ? JSON.stringify(steps) : null,
        is_draft: false,
      };

      let cid = cocktailId;
      if (cid) {
        const { error } = await supabase.from("cocktails").update(payload).eq("id", cid);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("cocktails")
          .insert({ ...payload, user_id: auth.user.id })
          .select("id").single<{ id: string }>();
        if (error) throw error;
        cid = data.id;
      }

      // Save pivot (column added by migration — silent failure if not yet applied)
      await supabase.from("cocktails").update({ pivot_ingredient_id: pivotIngredientId }).eq("id", cid!);

      await supabase.from("cocktail_ingredients").delete().eq("cocktail_id", cid!);
      const validLines = lines.filter(l => l.ingredient_id && l.qty !== "" && Number(l.qty) > 0);
      if (validLines.length > 0) {
        const { error: lErr } = await supabase.from("cocktail_ingredients").insert(
          validLines.map((l, i) => ({
            cocktail_id: cid!,
            ingredient_id: l.ingredient_id,
            qty: Number(l.qty),
            unit: l.unit,
            sort_order: i,
          }))
        );
        if (lErr) throw lErr;
      }

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
    await supabase.from("cocktail_ingredients").delete().eq("cocktail_id", cocktailId);
    await supabase.from("cocktails").delete().eq("id", cocktailId);
    router.push("/recettes?tab=cocktail");
  }

  async function handleExportPdf() {
    if (!cocktailId) return;
    setPdfLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { alert("Non authentifié"); return; }
      const res = await fetch("/api/cocktails/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ cocktailId }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({ message: "Erreur inconnue" })); alert(`Erreur PDF: ${e.message}`); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(name || "cocktail").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally { setPdfLoading(false); }
  }

  const title = name || (isEdit ? "Cocktail" : "Nouveau cocktail");

  if (status === "loading") {
    return (
      <>
        <NavBar backHref="/recettes?tab=cocktail" backLabel="Recettes" />
        <main className="container"><div className="muted" style={{ marginTop: 40, textAlign: "center" }}>Chargement…</div></main>
      </>
    );
  }
  if (status === "error") {
    return (
      <>
        <NavBar backHref="/recettes?tab=cocktail" backLabel="Recettes" />
        <main className="container"><pre className="errorBox">{JSON.stringify(error, null, 2)}</pre></main>
      </>
    );
  }

  return (
    <>
      <NavBar
        backHref="/recettes?tab=cocktail"
        backLabel="Recettes"
        menuItems={[
          {
            label: prodMode ? "Mode normal" : "Mode production",
            onClick: () => { setProdMode(m => !m); setProdQty(""); },
            style: prodMode
              ? { background: "#166534", color: "white", borderColor: "#166534" }
              : undefined,
          },
          ...(isEdit ? [{
            label: pdfLoading ? "Export…" : "Exporter PDF",
            onClick: handleExportPdf,
            disabled: pdfLoading,
          }] : []),
          ...(!prodMode && isEdit && userCanWrite ? [{
            label: "Supprimer",
            onClick: handleDelete,
            style: { color: "#d93f3f" } as React.CSSProperties,
          }] : []),
        ]}
        primaryAction={!prodMode && userCanWrite ? (
          <button onClick={handleSave} disabled={saving} className="btn btnPrimary">
            {saving ? "Sauvegarde…" : "Sauvegarder"}
          </button>
        ) : undefined}
      />

      <main className="container safe-bottom">
        {/* ── MODE PRODUCTION ── */}
        {prodMode ? (
          <>
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
                    <input
                      type="number" inputMode="numeric" min={0} step={0.1}
                      className="pivotInput"
                      value={prodQty}
                      onChange={e => setProdQty(e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder={String(prodPivotLine.qty)}
                      style={{
                        width: 120, height: 52, fontSize: 28, fontWeight: 800,
                        textAlign: "center", borderRadius: 10,
                        border: "2px solid #D97706", background: "white", fontFamily: "inherit",
                      }}
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
                        <span style={{ fontSize: 22, fontWeight: 800, color: "#166534" }}>
                          {newQty !== null ? `${newQty.toLocaleString("fr-FR")} ${l.unit}` : `${l.qty} ${l.unit}`}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {prodTotalW > 0 && (
                  <div style={{
                    background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 10,
                    padding: "12px 16px", color: "#166534", fontWeight: 700, fontSize: 15, marginBottom: 16,
                  }}>
                    Volume total estimé : {prodTotalW.toLocaleString("fr-FR")} ml
                  </div>
                )}
              </>
            )}

            {steps.length > 0 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <h3 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "#6f6a61" }}>
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
            <TopNav title={title} subtitle={`Cocktail${isEdit ? " · édition" : " · nouveau"}`} />
            {saveError && <div className="errorBox" style={{ marginBottom: 12 }}>{saveError}</div>}

            {/* Infos générales */}
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label className="label">Nom du cocktail</label>
                  <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Nom…" />
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

            {/* Ingrédients */}
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: ACCENT }}>
                Ingrédients
              </h3>
              <IngredientListDnD
                items={lines}
                ingredients={ingredients}
                priceByIngredient={priceByIngredient}
                units={COCKTAIL_UNITS}
                onChange={setLines}
                priceLabelByIngredient={priceLabelByIngredient}
                pivotId={pivotIngredientId}
                onPivotChange={setPivotIngredientId}
              />
              {totalCostEur > 0 && (
                <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: "#2f3a33" }}>
                  Coût total : {fmtMoney(round2(totalCostEur))} €
                </div>
              )}
            </div>

            {/* Étapes */}
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: ACCENT }}>
                Étapes / Recette
              </h3>
              <StepsList steps={steps} onChange={setSteps} />
            </div>

            {/* Allergènes */}
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: "#6f6a61" }}>
                Allergènes
              </h3>
              <AllergenBadges allergens={computedAllergens} />
            </div>

            {/* Prix & Marges */}
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: ACCENT }}>
                Prix &amp; Marges
              </h3>
              <PricingBlock
                costPerPortion={totalCostEur > 0 ? round2(totalCostEur) : null}
                portionLabel="cocktail"
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
      </main>
    </>
  );
}
