"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { SmartSelect, type SmartSelectOption } from "@/components/SmartSelect";
import { StepsList } from "./StepsList";
import { PricingModule } from "./PricingModule";
import { RecipeHero, HeroBtn } from "./RecipeHero";
import { StepperInput } from "@/components/StepperInput";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import { calculerPate, type EmpatementType, type FlourMixItem } from "@/lib/pateEngine";
import { GestionFoodCost } from "./GestionFoodCost";
import { GestionCommandes } from "./GestionCommandes";
import { GestionPilotage } from "./GestionPilotage";
import type { Ingredient } from "@/types/ingredients";
import { fetchApi } from "@/lib/fetchApi";
import { PublishCatalogueButton } from "./PublishCatalogueButton";

const TYPE_OPTIONS: { id: EmpatementType; label: string }[] = [
  { id: "direct",   label: "Direct" },
  { id: "biga",     label: "Biga" },
  { id: "focaccia", label: "Focaccia" },
];

const ACCENT = "#B45309";

function n2(v: unknown) { const x = Number(v); return Number.isFinite(x) ? x : 0; }
function round2(v: number) { return Math.round(v * 100) / 100; }
function roundG(v: number) { return Math.round(v); }
function fmtG(v: number) { return roundG(v).toLocaleString("fr-FR") + " g"; }
function _fmtMoney(v: number) { return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// Virtual ingredient IDs for empatement pivot
type EmpItemId = "flour" | "water" | "salt" | "honey" | "oil" | "yeast";
interface EmpItem { id: EmpItemId; name: string; qty: number; unit: string; }

interface Props { recipeId?: string; initialProdMode?: boolean; }

export default function EmpatementFormV2({ recipeId, initialProdMode }: Props) {
  const router = useRouter();
  const { can } = useProfile();
  const userCanWrite = can("operations.edit_recettes");
  const { current: etab } = useEtablissement();
  const isEdit = !!recipeId;

  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState<unknown>(null);

  // Form state
  const [name, setName] = useState("");
  const [type, setType] = useState<EmpatementType>("biga");
  const [nbPatons, setNbPatons] = useState(12);
  const [poidsPaton, setPoidsPaton] = useState(264);

  // Recipe percents
  const [hydration, setHydration] = useState(65);
  const [salt, setSalt] = useState(2);
  const [honey, setHoney] = useState(0);
  const [oil, setOil] = useState(0);
  const [yeast, setYeast] = useState(0.3);
  const [bigaYeast, setBigaYeast] = useState(0.5);

  // Flour mix (max 2 farines)
  const [flour1Name, setFlour1Name] = useState("Tipo 00");
  const [flour1Id, setFlour1Id] = useState<string | null>(null);
  const [flour1Pct, setFlour1Pct] = useState(80);
  const [flour2Name, setFlour2Name] = useState("Tipo 1");
  const [flour2Id, setFlour2Id] = useState<string | null>(null);
  const [useTwoFlours, setUseTwoFlours] = useState(false);

  // Steps
  const [steps, setSteps] = useState<string[]>([]);

  // Pricing
  const [vatRate, setVatRate] = useState(0.1);
  const [marginRate, setMarginRate] = useState("75");
  const [sellPrice, setSellPrice] = useState<number | "">("");

  // Main tab
  type MainTab = "fc" | "recette" | "cmd" | "pop";
  const [mainTab, setMainTab] = useState<MainTab>(initialProdMode ? "recette" : "fc");

  // Production mode
  const [prodMode, setProdMode] = useState(initialProdMode ?? false);
  const [pivotItemId, setPivotItemId] = useState<EmpItemId | null>(null);
  const [prodQty, setProdQty] = useState<number | "">("");

  // Save
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Flour ingredients for SmartSelect
  const [flourIngredients, setFlourIngredients] = useState<Ingredient[]>([]);

  const flourOptions: SmartSelectOption[] = flourIngredients.map(i => ({
    id: i.id,
    name: i.name,
    category: i.category,
  }));

  const flourMix: FlourMixItem[] = useMemo(() => {
    if (!useTwoFlours) return [{ name: flour1Name, percent: 100 }];
    const p1 = Math.max(0, Math.min(100, flour1Pct));
    const p2 = 100 - p1;
    return [
      { name: flour1Name, percent: p1 },
      { name: flour2Name, percent: p2 },
    ].filter(f => f.percent > 0);
  }, [useTwoFlours, flour1Name, flour1Pct, flour2Name]);

  // Calculate dough
  const result = useMemo(() => {
    try {
      return calculerPate({
        type,
        nbPatons,
        poidsPaton,
        recipe: { hydration_total: hydration, salt_percent: salt, honey_percent: honey, oil_percent: oil, yeast_percent: yeast, biga_yeast_percent: bigaYeast },
        flourMix,
      });
    } catch { return null; }
  }, [type, nbPatons, poidsPaton, hydration, salt, honey, oil, yeast, bigaYeast, flourMix]);

  // Virtual ingredient lines for Mode Production
  const empItems: EmpItem[] = useMemo(() => {
    if (!result) return [];
    const items: EmpItem[] = [
      { id: "flour", name: "Farine totale", qty: result.totals.flour_total_g, unit: "g" },
      { id: "water", name: "Eau", qty: result.totals.water_g, unit: "g" },
      { id: "salt",  name: "Sel", qty: result.totals.salt_g, unit: "g" },
    ];
    if (result.totals.honey_g > 0) items.push({ id: "honey", name: "Miel", qty: result.totals.honey_g, unit: "g" });
    if (result.totals.oil_g > 0)   items.push({ id: "oil",   name: "Huile", qty: result.totals.oil_g, unit: "g" });
    if (result.totals.yeast_g > 0) items.push({ id: "yeast", name: "Levure", qty: result.totals.yeast_g, unit: "g" });
    return items.filter(i => i.qty > 0);
  }, [result]);

  // Production computations
  const prodPivotItem = empItems.find(i => i.id === pivotItemId) ?? null;
  const prodFactor = prodPivotItem && prodQty !== "" && Number(prodQty) > 0
    ? Number(prodQty) / prodPivotItem.qty
    : null;
  const prodTotalW = empItems.reduce((acc, i) => {
    return acc + (prodFactor !== null ? Math.round(i.qty * prodFactor) : i.qty);
  }, 0);

  const _costPerKg: number | null = null;
  const costPerBall: number | null = null;

  // ── KPI computations ──────────────────────────────────────────
  const sp = typeof sellPrice === "number" && sellPrice > 0 ? sellPrice : null;
  const effectiveCost = costPerBall ?? 0;
  const foodCostPct = sp && effectiveCost > 0 ? (effectiveCost / sp) * 100 : null;
  const margeBrute = sp && effectiveCost > 0 ? sp - effectiveCost : null;
  const prixTTC = sp ? sp * (1 + vatRate) : null;

  // Tab definitions
  const MAIN_TABS: { key: MainTab; label: string }[] = isEdit ? [
    { key: "fc", label: "Food cost & Marges" },
    { key: "recette", label: "Recette & Procede" },
    { key: "cmd", label: "Commandes fournisseurs" },
    { key: "pop", label: "Pilotage CA" },
  ] : [
    { key: "fc", label: "Food cost & Marges" },
    { key: "recette", label: "Recette & Procede" },
  ];

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { setStatus("error"); setError({ message: "NOT_LOGGED" }); return; }

      const ingsQ = supabase
        .from("ingredients")
        .select("*")
        .eq("is_active", true)
        .in("category", ["epicerie_salee", "autre"]);
      const { data: ingsData } = await ingsQ.order("name");
      if (cancelled) return;
      setFlourIngredients((ingsData ?? []) as Ingredient[]);

      if (recipeId) {
        const { data: rec, error: recErr } = await supabase.from("recipes").select("*").eq("id", recipeId).single();
        if (recErr) { setStatus("error"); setError(recErr); return; }
        if (cancelled) return;
        if (rec) {
          const r = rec as Record<string, unknown>;
          setName(String(r.name ?? ""));
          const t = String(r.type ?? "direct");
          if (t === "biga" || t === "direct" || t === "focaccia") setType(t as EmpatementType);
          setNbPatons(n2(r.balls_count) || 12);
          setPoidsPaton(n2(r.ball_weight) || 264);
          setHydration(n2(r.hydration_total) || 65);
          setSalt(n2(r.salt_percent) || 2);
          setHoney(n2(r.honey_percent) || 0);
          setOil(n2(r.oil_percent) || 0);
          setYeast(n2(r.yeast_percent) || 0.3);
          setBigaYeast(n2(r.biga_yeast_percent) || 0.5);
          if (r.vat_rate) setVatRate(Number(r.vat_rate));
          if (r.margin_rate) {
            const mr = Number(r.margin_rate);
            if (mr >= 1) setMarginRate(String(Math.round(mr)));
            else if (mr > 0) setMarginRate(String(Math.round(mr * 100)));
          }
          if (r.sell_price != null) setSellPrice(Number(r.sell_price));
          if (r.flour_mix) {
            try {
              const mix = (typeof r.flour_mix === "string" ? JSON.parse(r.flour_mix) : r.flour_mix) as FlourMixItem[];
              if (Array.isArray(mix) && mix.length >= 1) {
                setFlour1Name(mix[0]?.name ?? "Tipo 00");
                setFlour1Pct(mix[0]?.percent ?? 100);
                if (mix.length >= 2) {
                  setFlour2Name(mix[1]?.name ?? "Tipo 1");
                  setFlour1Pct(100 - (mix[1]?.percent ?? 20));
                  setUseTwoFlours(true);
                }
              }
            } catch { /* ignore */ }
          }
          if (r.procedure) {
            try { setSteps(JSON.parse(String(r.procedure)) as string[]); }
            catch { setSteps(String(r.procedure) ? [String(r.procedure)] : []); }
          }
          // pivot_ingredient_id is stored as TEXT for empatement virtual IDs
          const pid = String(r.pivot_ingredient_id ?? "");
          if (pid && ["flour","water","salt","honey","oil","yeast"].includes(pid)) {
            setPivotItemId(pid as EmpItemId);
          }
        }
      }

      if (!cancelled) setStatus("ok");
    }
    load();
    return () => { cancelled = true; };
  }, [recipeId, etab]);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("NOT_LOGGED");

      const marginRateNum = Number(marginRate);
      const margin_rate = marginRateNum > 0 ? round2(marginRateNum) : 0;
      const yieldGrams = result?.summary.total_dough_g ?? null;

      const payload: Record<string, unknown> = {
        name: name || `Empatement ${type}`,
        type,
        balls_count: nbPatons,
        ball_weight: poidsPaton,
        hydration_total: hydration,
        salt_percent: salt,
        honey_percent: honey,
        oil_percent: oil,
        yeast_percent: yeast,
        biga_yeast_percent: bigaYeast,
        flour_mix: flourMix,
        yield_grams: yieldGrams,
        vat_rate: vatRate,
        margin_rate,
        sell_price: sellPrice !== "" ? Number(sellPrice) : null,
        procedure: steps.length > 0 ? JSON.stringify(steps) : null,
        user_id: auth.user.id,
      };

      let rid = recipeId;
      if (rid) {
        const { error } = await supabase.from("recipes").update(payload).eq("id", rid);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("recipes").insert({ ...payload, ...(etab ? { etablissement_id: etab.id } : {}) }).select("id").single<{ id: string }>();
        if (error) throw error;
        rid = data.id;
      }

      // Save pivot (column added by migration — silent failure if not yet applied)
      await supabase.from("recipes").update({ pivot_ingredient_id: pivotItemId }).eq("id", rid!);

      if (!isEdit) router.push(`/recettes/empatement/${rid}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : (err as { message?: string })?.message ?? JSON.stringify(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!recipeId) return;
    if (!window.confirm("Supprimer cet empatement ?")) return;
    await supabase.from("recipes").delete().eq("id", recipeId);
    router.push("/recettes?tab=empatement");
  }

  async function handleExportPdf() {
    if (!recipeId) return;
    setPdfLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { alert("Non authentifie"); return; }
      const res = await fetchApi("/api/recipes/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ recipeId, nbPatons, poidsPaton }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({ message: "Erreur inconnue" })); alert(`Erreur PDF: ${e.message}`); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${(name || "empatement").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally { setPdfLoading(false); }
  }

  const title = name || "Nouvel empatement";

  if (status === "loading") {
    return (
      <main className="container"><div className="muted" style={{ marginTop: 40, textAlign: "center" }}>Chargement...</div></main>
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
          etabName={etab?.nom}
          typeLabel="Empatement"
          onBack={() => router.push("/recettes")}
          kpis={{ costPerPortion: effectiveCost > 0 ? effectiveCost : null, foodCostPct: foodCostPct ?? null, sellPriceHT: sp ?? null, sellPriceTTC: prixTTC ?? null, margeBrute: margeBrute ?? null }}
          actions={<>
            <HeroBtn onClick={handleExportPdf} disabled={!isEdit || pdfLoading} title={!isEdit ? "Enregistrer la recette pour exporter le PDF" : undefined}>{pdfLoading ? "Export…" : "PDF"}</HeroBtn>
            {isEdit ? <PublishCatalogueButton recipeType="empatement" recipeId={recipeId!} /> : <HeroBtn disabled title="Enregistrer la recette pour publier au catalogue">Catalogue</HeroBtn>}
            {userCanWrite && <HeroBtn onClick={handleSave} disabled={saving} primary>{saving ? "Sauvegarde…" : "Enregistrer"}</HeroBtn>}
          </>}
        />

                {/* ── Tab bar ── */}
        <div style={{ display: "inline-flex", gap: 4, padding: 4, background: "#e8e0d0", borderRadius: 12, marginBottom: 16, overflowX: "auto" }}>
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
        </div>

        {saveError && <div className="errorBox" style={{ marginBottom: 12 }}>{saveError}</div>}

        {/* ── TAB: FOOD COST & MARGES ── */}
        {mainTab === "fc" && (
          <GestionFoodCost
            recipeId={recipeId}
            recipeType="empatement"
            lines={[]}
            ingredients={[]}
            priceByIngredient={{}}
            totalCost={0}
            sellPrice={sp}
            onSellPriceChange={(p) => setSellPrice(p)}
            yieldGrams={result?.summary.total_dough_g ?? null}
          />
        )}

        {/* ── TAB: COMMANDES ── */}
        {mainTab === "cmd" && isEdit && recipeId && (
          <GestionCommandes
            recipeId={recipeId}
            recipeType="empatement"
            lines={[]}
            ingredients={[]}
            etablissementId={etab?.id}
          />
        )}

        {/* ── TAB: PILOTAGE ── */}
        {mainTab === "pop" && isEdit && (
          <GestionPilotage recipeName={name} recipeType="empatement" />
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
                    {prodPivotItem
                      ? `Modifie ${prodPivotItem.name}, tout se recalcule`
                      : `${title} -- appuie sur une etoile en mode normal pour choisir un pivot`}
                  </div>
                </div>

                {!pivotItemId || !prodPivotItem ? (
                  <div style={{
                    padding: "24px 16px", background: "rgba(0,0,0,0.03)", borderRadius: 12,
                    textAlign: "center", color: "#6f6a61", fontSize: 14, lineHeight: 1.7, marginBottom: 16,
                  }}>
                    Aucun ingredient pivot defini.<br />
                    Appuyez sur une etoile en mode normal pour en choisir un.
                  </div>
                ) : (
                  <>
                    <div style={{
                      background: "#FFFBEB", border: "2px solid #D97706",
                      borderRadius: 12, padding: 16, marginBottom: 12,
                    }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#D97706", marginBottom: 6 }}>Ingredient pivot</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "#2d2d2d", marginBottom: 12 }}>
                        {prodPivotItem.name}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <StepperInput
                          value={prodQty}
                          onChange={setProdQty}
                          step={1} min={0}
                          placeholder={String(roundG(prodPivotItem.qty))}
                        />
                        <span style={{ fontSize: 16, color: "#6f6a61", fontWeight: 600 }}>{prodPivotItem.unit}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#9a8f84" }}>
                        Recette de base : {roundG(prodPivotItem.qty)} {prodPivotItem.unit}
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                      {empItems.filter(i => i.id !== pivotItemId).map(item => {
                        const newQty = prodFactor !== null ? Math.round(item.qty * prodFactor) : null;
                        return (
                          <div key={item.id} style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            background: "white", border: "1px solid #EFEFEF", borderRadius: 10, padding: "10px 14px",
                          }}>
                            <span style={{ fontSize: 14, color: "#2d2d2d" }}>{item.name}</span>
                            <span style={{ fontSize: 22, fontWeight: 800, color: "#4a6741" }}>
                              {newQty !== null ? `${newQty.toLocaleString("fr-FR")} ${item.unit}` : fmtG(item.qty)}
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
                      Procedure / Etapes
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
                      <label className="label">Nom</label>
                      <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Nom de l'empatement..." />
                    </div>

                    <div>
                      <label className="label">Type</label>
                      <div style={{ display: "flex", gap: 8 }}>
                        {TYPE_OPTIONS.map(t => (
                          <button
                            key={t.id} type="button" onClick={() => setType(t.id)}
                            style={{
                              padding: "6px 16px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                              border: "1.5px solid",
                              borderColor: type === t.id ? ACCENT : "rgba(217,199,182,0.9)",
                              background: type === t.id ? "rgba(180,83,9,0.08)" : "rgba(255,255,255,0.7)",
                              color: type === t.id ? ACCENT : "#6f6a61",
                              cursor: "pointer",
                            }}
                          >{t.label}</button>
                        ))}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <label className="label">Nombre de patons</label>
                        <StepperInput
                          value={nbPatons}
                          onChange={v => setNbPatons(v === "" ? 1 : v)}
                          step={1} min={1}
                        />
                      </div>
                      <div>
                        <label className="label">Poids paton (g)</label>
                        <StepperInput
                          value={poidsPaton}
                          onChange={v => setPoidsPaton(v === "" ? 50 : v)}
                          step={1} min={50}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Parametres hydratation */}
                <div style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", border: "1px solid #e0d8ce", marginBottom: 14 }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#777" }}>
                    Parametres
                  </h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
                    {[
                      { label: "Hydratation (%)", value: hydration, set: setHydration, min: 40, max: 100 },
                      { label: "Sel (%)", value: salt, set: setSalt, min: 0, max: 5 },
                      { label: "Huile (%)", value: oil, set: setOil, min: 0, max: 20 },
                      { label: "Miel (%)", value: honey, set: setHoney, min: 0, max: 10 },
                      ...(type !== "biga" ? [{ label: "Levure (%)", value: yeast, set: setYeast, min: 0, max: 5 }] : []),
                      ...(type === "biga" ? [{ label: "Levure biga (%)", value: bigaYeast, set: setBigaYeast, min: 0, max: 5 }] : []),
                    ].map(p => (
                      <div key={p.label}>
                        <label className="label">{p.label}</label>
                        <StepperInput
                          value={p.value}
                          onChange={v => p.set(v === "" ? p.min : v)}
                          step={0.1} min={p.min} max={p.max}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Farines */}
                <div style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", border: "1px solid #e0d8ce", marginBottom: 14 }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#777" }}>
                    Farines
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                      <div style={{ flex: "1 1 120px" }}>
                        <label className="label">Farine 1 -- nom</label>
                        <input className="input" value={flour1Name} onChange={e => setFlour1Name(e.target.value)} placeholder="ex: Tipo 00" />
                      </div>
                      {flourIngredients.length > 0 && (
                        <div style={{ flex: "1 1 140px" }}>
                          <label className="label">Lie a un ingredient</label>
                          <SmartSelect
                            options={flourOptions}
                            value={flour1Id ?? ""}
                            onChange={id => {
                              setFlour1Id(id || null);
                              const ing = flourIngredients.find(i => i.id === id);
                              if (ing) setFlour1Name(ing.name);
                            }}
                            placeholder="Ingredient..."
                          />
                        </div>
                      )}
                      {useTwoFlours && (
                        <div style={{ width: 140 }}>
                          <label className="label">% farine 1</label>
                          <StepperInput
                            value={flour1Pct}
                            onChange={v => setFlour1Pct(v === "" ? 0 : v)}
                            step={5} min={0} max={100}
                          />
                        </div>
                      )}
                    </div>

                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                      <input type="checkbox" checked={useTwoFlours} onChange={e => setUseTwoFlours(e.target.checked)} />
                      Utiliser 2 farines
                    </label>

                    {useTwoFlours && (
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                        <div style={{ flex: "1 1 120px" }}>
                          <label className="label">Farine 2 -- nom</label>
                          <input className="input" value={flour2Name} onChange={e => setFlour2Name(e.target.value)} placeholder="ex: Tipo 1" />
                        </div>
                        {flourIngredients.length > 0 && (
                          <div style={{ flex: "1 1 140px" }}>
                            <label className="label">Lie a un ingredient</label>
                            <SmartSelect
                              options={flourOptions}
                              value={flour2Id ?? ""}
                              onChange={id => {
                                setFlour2Id(id || null);
                                const ing = flourIngredients.find(i => i.id === id);
                                if (ing) setFlour2Name(ing.name);
                              }}
                              placeholder="Ingredient..."
                            />
                          </div>
                        )}
                        <div style={{ width: 80 }}>
                          <label className="label">% farine 2</label>
                          <input type="text" readOnly value={100 - flour1Pct} className="input" style={{ opacity: 0.6 }} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Resultats calcules -- avec etoiles pivot */}
                {result && (
                  <div className="card" style={{ marginBottom: 16, borderLeft: `4px solid ${ACCENT}` }}>
                    <h3 style={{ margin: "0 0 12px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#777" }}>
                      Quantites calculees -- {nbPatons} paton(s) de {poidsPaton} g
                    </h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                      {empItems.map(item => (
                        <div key={item.id} style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "8px 10px", borderRadius: 8,
                          background: pivotItemId === item.id ? "rgba(217,119,6,0.08)" : "rgba(0,0,0,0.03)",
                          border: pivotItemId === item.id ? "1.5px solid #D97706" : "1px solid rgba(217,199,182,0.5)",
                        }}>
                          <button
                            type="button"
                            onClick={() => setPivotItemId(pivotItemId === item.id ? null : item.id)}
                            title="Definir comme pivot"
                            style={{
                              background: "none", border: "none", cursor: "pointer",
                              fontSize: 16, padding: "0 2px", flexShrink: 0,
                              color: pivotItemId === item.id ? "#D97706" : "#ccc",
                            }}
                          >
                            {pivotItemId === item.id ? "★" : "☆"}
                          </button>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "#9a8f84", textTransform: "uppercase" }}>{item.name}</div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: "#2f3a33" }}>{fmtG(item.qty)}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {useTwoFlours && result.flour_breakdown.length > 1 && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#6f6a61", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Detail farines</div>
                        {result.flour_breakdown.map(f => (
                          <div key={f.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                            <span style={{ color: "#2f3a33" }}>{f.name}</span>
                            <span style={{ fontWeight: 700, color: ACCENT }}>{fmtG(f.grams)} ({f.percent} %)</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {type === "biga" && result.phases.length > 1 && (
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#6f6a61", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Phases</div>
                        {result.phases.map(ph => (
                          <div key={ph.name} style={{ marginBottom: 8, padding: "8px 10px", borderRadius: 8, background: "rgba(180,83,9,0.04)", border: "1px solid rgba(180,83,9,0.15)" }}>
                            <div style={{ fontWeight: 800, fontSize: 12, color: ACCENT, marginBottom: 4 }}>{ph.name}</div>
                            <div style={{ fontSize: 12, color: "#6f6a61" }}>
                              Farine: {fmtG(ph.flour_g)} -- Eau: {fmtG(ph.water_g)} -- Levure: {fmtG(ph.yeast_g)}
                              {ph.salt_g > 0 ? ` -- Sel: ${fmtG(ph.salt_g)}` : ""}
                              {ph.oil_g > 0 ? ` -- Huile: ${fmtG(ph.oil_g)}` : ""}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {result.warnings.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        {result.warnings.map((w, i) => (
                          <div key={i} style={{ fontSize: 12, color: "#D97706", fontWeight: 600 }}>! {w}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Etapes */}
                <div style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", border: "1px solid #e0d8ce", marginBottom: 14 }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#777" }}>
                    Procedure / Etapes
                  </h3>
                  <StepsList steps={steps} onChange={setSteps} />
                </div>

                {/* Prix & Marges */}
                <div style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", border: "1px solid #e0d8ce", marginBottom: 14 }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#777" }}>
                    Prix, marges &amp; simulateur
                  </h3>
                  <PricingModule
                    costPerPortion={effectiveCost > 0 ? effectiveCost : null}
                    portionLabel="paton"
                    vatRate={vatRate}
                    onVatChange={setVatRate}
                    marginRate={marginRate}
                    onMarginChange={setMarginRate}
                    sellPrice={sellPrice}
                    onSellPriceChange={setSellPrice}
                    accentColor={ACCENT}
                  />
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
    </>
  );
}

// ── KPI Banner Item ──────────────────────────────────────────────
