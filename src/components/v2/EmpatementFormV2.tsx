"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { SmartSelect, type SmartSelectOption } from "@/components/SmartSelect";
import { StepsList } from "./StepsList";
import { RecipeHero, HeroBtn } from "./RecipeHero";
import { StepperInput } from "@/components/StepperInput";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import { calculerPate, type EmpatementType, type FlourMixItem } from "@/lib/pateEngine";
import { formatG, lignesPesee, nomPhase } from "@/lib/pateAffichage";
import { etapesParDefaut } from "@/lib/pateEtapes";
import { Fournee } from "@/components/pate/Fournee";
import { etapesFourneeParDefaut, formatDuree, lireEtapesFournee, type EtapeFournee } from "@/lib/pate/fournee";
import type { Ingredient } from "@/types/ingredients";
import { offerRowToCpu, enrichCpuWithConversions, type CpuByUnit } from "@/lib/offerPricing";
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
function fmtMoney(v: number) { return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

/** Derive €/g from offer CPU or ingredient fallback fields */
function cpuToEurPerG(cpu: CpuByUnit): number | null {
  if (cpu.g && cpu.g > 0) return cpu.g;
  if (cpu.ml && cpu.ml > 0) return cpu.ml; // rough approximation (density ~1)
  return null;
}

// Virtual ingredient IDs for empatement pivot
type EmpItemId = "flour" | "water" | "salt" | "honey" | "oil" | "yeast";
interface EmpItem { id: EmpItemId; name: string; qty: number; unit: string; }

interface Props { recipeId?: string; initialProdMode?: boolean; }

type FlourSaisie = { name: string; id: string | null; percent: number };
/** La dernière farine prend ce qui reste pour faire 100 % */
function pourcentagesFarines(fs: FlourSaisie[]): FlourSaisie[] {
  if (fs.length === 0) return fs;
  const autres = fs.slice(0, -1).reduce((t, f) => t + Math.max(0, Number(f.percent) || 0), 0);
  return fs.map((f, i) => (i === fs.length - 1 ? { ...f, percent: Math.max(0, Math.round((100 - autres) * 100) / 100) } : { ...f, percent: Math.max(0, Number(f.percent) || 0) }));
}

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

  // Farines (jusqu'à trois, la dernière prend le reste des pourcentages)
  const [flours, setFlours] = useState<FlourSaisie[]>([{ name: "Tipo 00", id: null, percent: 100 }]);
  // Module pâte, phase 1 (01/11/2026) : part et hydratation de la biga, farine de la biga, eau de départ,
  // marge de perte sur le pâton, capacité du pétrin
  const [bigaPct, setBigaPct] = useState(50);
  const [bigaHyd, setBigaHyd] = useState(45);
  const [bigaFlour, setBigaFlour] = useState("");
  const [waterStart, setWaterStart] = useState(80);
  const [lossMargin, setLossMargin] = useState(1.5);
  const [mixerMax, setMixerMax] = useState(215);
  // Fabrication par lot (phase 2, 02/11/2026) : TB manuelle, fenêtre des bacs, étapes de fournée avec minuteurs
  const [tbManuelle, setTbManuelle] = useState(56);
  const [fenetreMin, setFenetreMin] = useState<number | "">("");
  const [fenetreMax, setFenetreMax] = useState<number | "">("");
  const [etapesFournee, setEtapesFournee] = useState<EtapeFournee[] | null>(null);
  const [ongletProd, setOngletProd] = useState<"fournee" | "quantites">("fournee");

  // Steps
  const [steps, setSteps] = useState<string[]>([]);

  // Pricing
  const [vatRate, setVatRate] = useState(0.1);
  const [marginRate, setMarginRate] = useState("75");
  const [sellPrice, setSellPrice] = useState<number | "">("");

  // Main tab
  type MainTab = "recette";
  const [mainTab, setMainTab] = useState<MainTab>("recette");

  // Production mode
  const [prodMode, setProdMode] = useState(initialProdMode ?? false);
  const [pivotItemId, setPivotItemId] = useState<EmpItemId | null>(null);
  const [prodQty, setProdQty] = useState<number | "">("");

  // Save
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  // All ingredients for SmartSelect
  const [allIngredients, setAllIngredients] = useState<Ingredient[]>([]);
  // CPU (€/g, €/ml, €/pcs) per ingredient from offers
  const [cpuMap, setCpuMap] = useState<Record<string, CpuByUnit>>({});

  // Non-flour ingredient links
  const [saltId, setSaltId] = useState<string | null>(null);
  const [waterId, setWaterId] = useState<string | null>(null);
  const [oilId, setOilId] = useState<string | null>(null);
  const [honeyId, setHoneyId] = useState<string | null>(null);
  const [yeastId, setYeastId] = useState<string | null>(null);

  const flourOptions: SmartSelectOption[] = allIngredients
    .filter(i => ["epicerie_salee", "autre"].includes(i.category))
    .map(i => ({ id: i.id, name: i.name, category: i.category }));

  const allOptions: SmartSelectOption[] = allIngredients.map(i => {
    const epg = cpuToEurPerG(cpuMap[i.id] ?? {});
    return {
      id: i.id,
      name: i.name,
      category: i.category,
      rightBottom: epg != null ? `${fmtMoney(epg * 1000)} €/kg` : undefined,
    };
  });

  const flourMix: FlourMixItem[] = useMemo(() => pourcentagesFarines(flours).filter(f => f.percent > 0).map(f => ({ name: f.name, percent: f.percent, ingredient_id: f.id })), [flours]);

  // Calculate dough
  const result = useMemo(() => {
    try {
      return calculerPate({
        type,
        nbPatons,
        poidsPaton,
        recipe: {
          hydration_total: hydration, salt_percent: salt, honey_percent: honey, oil_percent: oil, yeast_percent: yeast, biga_yeast_percent: bigaYeast,
          biga_percent: bigaPct, biga_hydration: bigaHyd, biga_flour: bigaFlour || null, water_start_pct: waterStart, loss_margin_pct: lossMargin, mixer_max_balls: mixerMax,
        },
        flourMix,
      });
    } catch { return null; }
  }, [type, nbPatons, poidsPaton, hydration, salt, honey, oil, yeast, bigaYeast, flourMix, bigaPct, bigaHyd, bigaFlour, waterStart, lossMargin, mixerMax]);

  // Live cost calculation
  const liveCost = useMemo(() => {
    if (!result) return null;
    let cost = 0;
    let hasAnyCost = false;
    // Brief v2 (1.1) : un coût n'est définitif que si chaque ingrédient est lié à un article du catalogue qui a un prix
    const nonLies: string[] = [];
    const sansPrix: string[] = [];
    // Un lien vers un article supprimé du catalogue vaut « non lié »
    const existe = (id: string | null) => !!id && allIngredients.some(i => i.id === id);

    const flourTotal = result.totals.flour_total_g;
    for (const fm of flourMix) {
      const fId = fm.ingredient_id ?? null;
      const epg = fId ? cpuToEurPerG(cpuMap[fId] ?? {}) : null;
      if (epg) {
        cost += (flourTotal * fm.percent / 100) * epg;
        hasAnyCost = true;
      } else if (existe(fId)) sansPrix.push(fm.name); else nonLies.push(fm.name);
    }

    const nonFlour: [string, string | null, number][] = [
      ["Sel", saltId, result.totals.salt_g],
      ["Eau", waterId, result.totals.water_g],
      ["Huile", oilId, result.totals.oil_g],
      ["Miel", honeyId, result.totals.honey_g],
      ["Levure", yeastId, result.totals.yeast_g],
    ];
    for (const [nom, ingId, qty] of nonFlour) {
      if (qty <= 0) continue;
      const epg = ingId ? cpuToEurPerG(cpuMap[ingId] ?? {}) : null;
      if (epg) {
        cost += qty * epg;
        hasAnyCost = true;
      } else if (nom !== "Eau") { if (existe(ingId)) sansPrix.push(nom); else nonLies.push(nom); }
    }

    const yg = result.summary.total_dough_g;
    return { total: round2(cost), perKg: yg > 0 ? round2((cost / yg) * 1000) : null, complet: nonLies.length === 0 && sansPrix.length === 0, nonLies, sansPrix, hasAnyCost };
  }, [result, cpuMap, flourMix, saltId, waterId, oilId, honeyId, yeastId, allIngredients]);

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

  // Ingrédient sans article du catalogue (ou dont l'article n'a pas de prix) : le coût ne peut pas le compter
  const etatLien = (id: EmpItemId): "non lié" | "sans prix" | null => {
    const nom = id === "flour" ? null : id === "salt" ? "Sel" : id === "water" ? "Eau" : id === "oil" ? "Huile" : id === "honey" ? "Miel" : "Levure";
    if (id === "flour") {
      if (flours.some(f => !f.id) || liveCost?.nonLies.some(n => flours.some(f => f.name === n))) return "non lié";
      return liveCost?.sansPrix.some(n => flours.some(f => f.name === n)) ? "sans prix" : null;
    }
    if (!nom || nom === "Eau") return null;
    if (liveCost?.nonLies.includes(nom)) return "non lié";
    if (liveCost?.sansPrix.includes(nom)) return "sans prix";
    return null;
  };

  // Production computations
  const prodPivotItem = empItems.find(i => i.id === pivotItemId) ?? null;
  const prodFactor = prodPivotItem && prodQty !== "" && Number(prodQty) > 0
    ? Number(prodQty) / prodPivotItem.qty
    : null;
  const prodTotalW = empItems.reduce((acc, i) => {
    return acc + (prodFactor !== null ? Math.round(i.qty * prodFactor) : i.qty);
  }, 0);

  // Tab definitions
  const MAIN_TABS: { key: MainTab; label: string }[] = [
    { key: "recette", label: "Recette" },
  ];

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { setStatus("error"); setError({ message: "NOT_LOGGED" }); return; }

      const ingsQ = supabase
        .from("ingredients")
        .select("*")
        .eq("is_active", true);
      const offQ = supabase.from("v_latest_offers").select("*");
      const [{ data: ingsData }, { data: offersData }] = await Promise.all([
        ingsQ.order("name"),
        offQ,
      ]);
      if (cancelled) return;
      setAllIngredients((ingsData ?? []) as Ingredient[]);

      // Build CPU map from offers
      const cm: Record<string, CpuByUnit> = {};
      for (const o of (offersData ?? []) as Record<string, unknown>[]) {
        const iid = String(o.ingredient_id ?? "");
        if (!iid) continue;
        const raw = offerRowToCpu(o);
        cm[iid] = enrichCpuWithConversions(o, raw);
      }
      setCpuMap(cm);

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
          const links0 = (r.ingredient_links && typeof r.ingredient_links === "object" ? r.ingredient_links : {}) as Record<string, string>;
          if (r.flour_mix) {
            try {
              const mix = (typeof r.flour_mix === "string" ? JSON.parse(r.flour_mix) : r.flour_mix) as FlourMixItem[];
              if (Array.isArray(mix) && mix.length >= 1) {
                setFlours(mix.slice(0, 3).map((m, i) => ({ name: m?.name ?? "Farine", percent: n2(m?.percent), id: m?.ingredient_id ?? links0[`flour${i + 1}`] ?? null })));
              }
            } catch { /* ignore */ }
          }
          setBigaPct(n2(r.biga_percent) || 50);
          setBigaHyd(n2(r.biga_hydration) || 45);
          setBigaFlour(r.biga_flour ? String(r.biga_flour) : "");
          setWaterStart(r.water_start_pct == null ? 80 : n2(r.water_start_pct));
          setLossMargin(r.loss_margin_pct == null ? 1.5 : n2(r.loss_margin_pct));
          setMixerMax(r.mixer_max_balls == null ? 215 : n2(r.mixer_max_balls));
          setTbManuelle(r.tb_manuelle == null ? 56 : n2(r.tb_manuelle));
          setFenetreMin(r.fenetre_bacs_min_h == null ? "" : n2(r.fenetre_bacs_min_h));
          setFenetreMax(r.fenetre_bacs_max_h == null ? "" : n2(r.fenetre_bacs_max_h));
          setEtapesFournee(Array.isArray(r.etapes_fournee) && (r.etapes_fournee as unknown[]).length ? lireEtapesFournee(r.etapes_fournee, (t === "biga" || t === "direct" || t === "focaccia" ? t : "direct") as EmpatementType) : null);
          if (r.procedure) {
            try { setSteps(JSON.parse(String(r.procedure)) as string[]); }
            catch { setSteps(String(r.procedure) ? [String(r.procedure)] : []); }
          }
          // Restore ingredient links
          if (r.ingredient_links && typeof r.ingredient_links === "object") {
            const links = r.ingredient_links as Record<string, string>;
            if (links.salt) setSaltId(links.salt);
            if (links.water) setWaterId(links.water);
            if (links.oil) setOilId(links.oil);
            if (links.honey) setHoneyId(links.honey);
            if (links.yeast) setYeastId(links.yeast);
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

      // Build ingredient links map
      const ingredientLinks: Record<string, string> = {};
      flours.forEach((f, i) => { if (f.id) ingredientLinks[`flour${i + 1}`] = f.id; });
      if (saltId) ingredientLinks.salt = saltId;
      if (waterId) ingredientLinks.water = waterId;
      if (oilId) ingredientLinks.oil = oilId;
      if (honeyId) ingredientLinks.honey = honeyId;
      if (yeastId) ingredientLinks.yeast = yeastId;

      // Le coût n'est enregistré (et montré sur la Carte) que s'il est complet : tous les ingrédients liés
      const totalCost = liveCost && liveCost.complet ? liveCost.total : null;

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
        biga_percent: type === "biga" ? bigaPct : null,
        biga_hydration: type === "biga" ? bigaHyd : null,
        biga_flour: type === "biga" && bigaFlour ? bigaFlour : null,
        water_start_pct: waterStart,
        loss_margin_pct: lossMargin,
        mixer_max_balls: mixerMax,
        tb_manuelle: tbManuelle,
        fenetre_bacs_min_h: fenetreMin === "" ? (type === "direct" ? 72 : 24) : fenetreMin,
        fenetre_bacs_max_h: fenetreMax === "" ? (type === "direct" ? 100 : 48) : fenetreMax,
        etapes_fournee: etapesFournee,
        flour_mix: flourMix,
        yield_grams: yieldGrams,
        vat_rate: vatRate,
        margin_rate,
        sell_price: sellPrice !== "" ? Number(sellPrice) : null,
        procedure: JSON.stringify(steps.length > 0 ? steps : etapesParDefaut(type)),
        user_id: auth.user.id,
        pivot_ingredient_id: pivotItemId,
        ingredient_links: ingredientLinks,
        total_cost: totalCost,
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
          actions={<>
            <HeroBtn onClick={handleExportPdf} disabled={!isEdit || pdfLoading} title={!isEdit ? "Enregistrer la recette pour exporter le PDF" : undefined}>{pdfLoading ? "Export…" : "PDF"}</HeroBtn>
            {isEdit ? <PublishCatalogueButton recipeType="empatement" recipeId={recipeId!} /> : <HeroBtn disabled title="Enregistrer la recette pour publier au catalogue">Catalogue</HeroBtn>}
            {userCanWrite && <HeroBtn onClick={handleSave} disabled={saving} primary>{saving ? "Sauvegarde…" : "Enregistrer"}</HeroBtn>}
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
                  padding: "12px 16px", marginBottom: 12,
                }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>Mode Production</div>
                  <div style={{ fontSize: 13, opacity: 0.85 }}>
                    {ongletProd === "fournee" ? "La fournée pas à pas : températures, minuteurs, contrôles" : prodPivotItem
                      ? `Modifie ${prodPivotItem.name}, tout se recalcule`
                      : `${title} -- appuie sur une etoile en mode normal pour choisir un pivot`}
                  </div>
                </div>
                {/* Fabrication par lot (phase 2, 02/11/2026) : la fournée vit ici, le calcul par pivot reste à côté */}
                {type !== "focaccia" && (
                  <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                    {([["fournee", "Fournée"], ["quantites", "Quantités"]] as const).map(([k, l]) => (
                      <button key={k} type="button" onClick={() => setOngletProd(k)} style={{ border: `1px solid ${ongletProd === k ? ACCENT : "#ddd6c8"}`, background: ongletProd === k ? "rgba(212,119,90,0.12)" : "#fff", color: ongletProd === k ? ACCENT : "#1a1a1a", borderRadius: 20, padding: "7px 16px", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>
                    ))}
                  </div>
                )}
                {type !== "focaccia" && ongletProd === "fournee" && recipeId ? (
                  <Fournee recipeId={recipeId} recetteNom={title} type={type} nbPatonsDefaut={nbPatons} poidsPaton={poidsPaton}
                    calcul={(nb) => { try { return calculerPate({ type, nbPatons: nb, poidsPaton, recipe: { hydration_total: hydration, salt_percent: salt, honey_percent: honey, oil_percent: oil, yeast_percent: yeast, biga_yeast_percent: bigaYeast, biga_percent: bigaPct, biga_hydration: bigaHyd, biga_flour: bigaFlour || null, water_start_pct: waterStart, loss_margin_pct: lossMargin, mixer_max_balls: mixerMax }, flourMix }); } catch { return null; } }} />
                ) : !pivotItemId || !prodPivotItem ? (
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
                        <label className="label">Poids du pâton détaillé (g)</label>
                        <StepperInput
                          value={poidsPaton}
                          onChange={v => setPoidsPaton(v === "" ? 50 : v)}
                          step={1} min={50}
                        />
                        {result && result.summary.poidsCalcule_g !== result.summary.poidsPaton_g && (
                          <div style={{ fontSize: 11.5, color: "#6f6a61", marginTop: 4 }}>calculé à {result.summary.poidsCalcule_g} g avec la marge de perte</div>
                        )}
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
                      ...(type !== "biga" ? [{ label: "Levure (% farine totale)", value: yeast, set: setYeast, min: 0, max: 5, step: 0.01 }] : []),
                      ...(type === "biga" ? [
                        { label: "Part de biga (% farine)", value: bigaPct, set: setBigaPct, min: 1, max: 100, step: 5 },
                        { label: "Eau de biga (% farine biga)", value: bigaHyd, set: setBigaHyd, min: 0, max: 100, step: 1 },
                        { label: "Levure biga (% farine biga)", value: bigaYeast, set: setBigaYeast, min: 0, max: 5, step: 0.05 },
                      ] : []),
                      { label: "Eau de départ (% eau du pétrissage)", value: waterStart, set: setWaterStart, min: 0, max: 100, step: 5 },
                      { label: "Marge de perte (%)", value: lossMargin, set: setLossMargin, min: 0, max: 10, step: 0.5 },
                      { label: "Capacité du pétrin (pâtons)", value: mixerMax, set: setMixerMax, min: 0, max: 2000, step: 5 },
                    ].map(p => (
                      <div key={p.label}>
                        <label className="label">{p.label}</label>
                        <StepperInput
                          value={p.value}
                          onChange={v => p.set(v === "" ? p.min : v)}
                          step={p.step ?? 0.1} min={p.min} max={p.max}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Fabrication par lot (phase 2) : TB manuelle, fenêtre des bacs, étapes de fournée et minuteurs */}
                {type !== "focaccia" && (
                  <div style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", border: "1px solid #e0d8ce", marginBottom: 14 }}>
                    <h3 style={{ margin: "0 0 12px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#777" }}>
                      Fournée
                    </h3>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginBottom: 12 }}>
                      <div>
                        <label className="label">TB manuelle du pétrin</label>
                        <StepperInput value={tbManuelle} onChange={v => setTbManuelle(v === "" ? 56 : v)} step={0.5} min={30} max={90} />
                        <div style={{ fontSize: 11, color: "#6f6a61", marginTop: 4 }}>Utilisée tant que moins de 3 lots sont sortis dans la cible.</div>
                      </div>
                      <div>
                        <label className="label">Fenêtre des bacs, de (h)</label>
                        <StepperInput value={fenetreMin} onChange={setFenetreMin} step={1} min={0} max={200} placeholder={type === "direct" ? "72" : "24"} />
                      </div>
                      <div>
                        <label className="label">à (h)</label>
                        <StepperInput value={fenetreMax} onChange={setFenetreMax} step={1} min={0} max={240} placeholder={type === "direct" ? "100" : "48"} />
                      </div>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#6f6a61", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Étapes de la fournée et minuteurs</div>
                    <div style={{ display: "grid", gap: 6 }}>
                      {(etapesFournee ?? etapesFourneeParDefaut(type)).map((e, i, liste) => (
                        <div key={i} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 8, alignItems: "center" }}>
                          <select value={e.phase} disabled={type !== "biga"} onChange={ev => setEtapesFournee(liste.map((x, k) => (k === i ? { ...x, phase: ev.target.value === "biga" ? "biga" : "final" } : x)))} className="input" style={{ width: 96 }}>
                            <option value="biga">Biga</option><option value="final">Pétrissage</option>
                          </select>
                          <input className="input" value={e.texte} onChange={ev => setEtapesFournee(liste.map((x, k) => (k === i ? { ...x, texte: ev.target.value } : x)))} />
                          <input className="input" type="number" inputMode="numeric" min={0} step={10} value={e.duree_s ?? ""} placeholder="s" title="Minuteur en secondes" onChange={ev => setEtapesFournee(liste.map((x, k) => (k === i ? { ...x, duree_s: ev.target.value === "" ? null : Math.max(0, Math.round(Number(ev.target.value))) } : x)))} style={{ width: 76 }} />
                          <span style={{ fontSize: 11.5, color: "#6f6a61", minWidth: 40 }}>{e.duree_s ? formatDuree(e.duree_s) : "—"}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      <button type="button" className="btn" style={{ fontSize: 12 }} onClick={() => setEtapesFournee([...(etapesFournee ?? etapesFourneeParDefaut(type)), { texte: "", phase: "final", duree_s: null }])}>+ Ajouter une étape</button>
                      <button type="button" className="btn" style={{ fontSize: 12 }} onClick={() => setEtapesFournee(null)}>Remettre les étapes par défaut</button>
                      {etapesFournee && etapesFournee.length > 1 && <button type="button" className="btn" style={{ fontSize: 12, color: "#b4443a" }} onClick={() => setEtapesFournee(etapesFournee.slice(0, -1))}>Retirer la dernière</button>}
                    </div>
                    <div style={{ fontSize: 11, color: "#6f6a61", marginTop: 6 }}>Minuteur en secondes (180 = 3 min). Les étapes sans minuteur se valident d&apos;un geste. Par défaut : étapes du brief.</div>
                  </div>
                )}

                {/* Farines : jusqu'à trois, la dernière prend le reste ; pour une biga, la farine désignée la remplit en priorité */}
                <div style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", border: "1px solid #e0d8ce", marginBottom: 14 }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#777" }}>
                    Farines
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {pourcentagesFarines(flours).map((f, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                        <div style={{ flex: "1 1 120px" }}>
                          <label className="label">Farine {i + 1}{(!f.id || liveCost?.nonLies.includes(f.name) || liveCost?.sansPrix.includes(f.name)) && <span style={{ marginLeft: 8, padding: "1px 7px", borderRadius: 8, background: "rgba(183,121,31,0.12)", color: "#b7791f", fontSize: 10, fontWeight: 700 }}>{liveCost?.sansPrix.includes(f.name) ? "sans prix" : "non lié"}</span>}</label>
                          <input className="input" value={f.name} onChange={e => setFlours(fs => fs.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} placeholder="ex: Tipo 0" />
                        </div>
                        {flourOptions.length > 0 && (
                          <div style={{ flex: "1 1 140px" }}>
                            <label className="label">Lie a un ingredient</label>
                            <SmartSelect
                              options={flourOptions}
                              value={f.id ?? ""}
                              onChange={id => {
                                const ing = allIngredients.find(x => x.id === id);
                                setFlours(fs => fs.map((x, k) => (k === i ? { ...x, id: id || null, name: ing ? ing.name : x.name } : x)));
                              }}
                              placeholder="Ingredient..."
                            />
                          </div>
                        )}
                        <div style={{ width: 120 }}>
                          <label className="label">% farine</label>
                          {i === flours.length - 1
                            ? <input type="text" readOnly value={f.percent} className="input" style={{ opacity: 0.6 }} title="Le reste des pourcentages" />
                            : <StepperInput value={f.percent} onChange={v => setFlours(fs => fs.map((x, k) => (k === i ? { ...x, percent: v === "" ? 0 : v } : x)))} step={5} min={0} max={100} />}
                        </div>
                        {flours.length > 1 && (
                          <button type="button" onClick={() => setFlours(fs => fs.filter((_, k) => k !== i))} style={{ border: "1px solid #e0d8ce", background: "#fff", borderRadius: 20, padding: "6px 10px", cursor: "pointer", fontSize: 12, color: "#b4443a", fontFamily: "inherit" }}>Retirer</button>
                        )}
                      </div>
                    ))}
                    {flours.length < 3 && (
                      <button type="button" onClick={() => setFlours(fs => [...fs, { name: fs.length === 1 ? "Tipo 1" : "Farine", id: null, percent: 0 }])}
                        style={{ alignSelf: "flex-start", border: "1px solid #e0d8ce", background: "#fff", borderRadius: 20, padding: "6px 12px", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>
                        + Ajouter une farine
                      </button>
                    )}
                    {type === "biga" && (
                      <div style={{ maxWidth: 320 }}>
                        <label className="label">Farine de la biga (remplie en priorité)</label>
                        <select className="input" value={bigaFlour} onChange={e => setBigaFlour(e.target.value)}>
                          <option value="">Première farine du mélange</option>
                          {flours.map((f, i) => <option key={i} value={f.name}>{f.name}</option>)}
                        </select>
                        <div style={{ fontSize: 11.5, color: "#6f6a61", marginTop: 4 }}>La biga prend {bigaPct} % de la farine totale sur cette farine ; tout le reste part au pétrissage final.</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Liaison ingredients (pour calcul de cout) */}
                <div style={{ background: "#fff", borderRadius: 12, padding: "18px 20px", border: "1px solid #e0d8ce", marginBottom: 14 }}>
                  <h3 style={{ margin: "0 0 12px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#777" }}>
                    Ingredients lies (cout)
                  </h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {[
                      { label: "Sel", value: saltId, set: setSaltId, show: salt > 0 },
                      { label: "Eau", value: waterId, set: setWaterId, show: true },
                      { label: "Huile", value: oilId, set: setOilId, show: oil > 0 },
                      { label: "Miel", value: honeyId, set: setHoneyId, show: honey > 0 },
                      { label: "Levure", value: yeastId, set: setYeastId, show: yeast > 0 || bigaYeast > 0 },
                    ].filter(x => x.show).map(x => (
                      <div key={x.label}>
                        <label className="label">{x.label}</label>
                        <SmartSelect
                          options={allOptions}
                          value={x.value ?? ""}
                          onChange={id => x.set(id || null)}
                          placeholder="Ingredient..."
                          menuMax={8}
                        />
                      </div>
                    ))}
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
                            <div style={{ fontSize: 10, fontWeight: 700, color: "#9a8f84", textTransform: "uppercase" }}>{item.name}
                              {etatLien(item.id) && <span style={{ marginLeft: 8, padding: "1px 7px", borderRadius: 8, background: "rgba(183,121,31,0.12)", color: "#b7791f", fontSize: 10, letterSpacing: 0, textTransform: "none" }}>{etatLien(item.id)}</span>}
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: "#2f3a33" }}>{fmtG(item.qty)}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {liveCost && !liveCost.complet && (() => { const n = liveCost.nonLies.length + liveCost.sansPrix.length; return (
                      <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(183,121,31,0.1)", color: "#b7791f", fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>
                        Coût incomplet : {n} ingrédient{n > 1 ? "s" : ""} {liveCost.nonLies.length ? `non lié${liveCost.nonLies.length > 1 ? "s" : ""} (${liveCost.nonLies.join(", ")})` : ""}{liveCost.nonLies.length && liveCost.sansPrix.length ? " et " : ""}{liveCost.sansPrix.length ? `sans prix au catalogue (${liveCost.sansPrix.join(", ")})` : ""}. Lie chaque ingrédient à un article qui a un prix pour un coût juste.
                      </div>
                    ); })()}
                    {liveCost && liveCost.hasAnyCost && (
                      <div style={{
                        display: "flex", gap: 12, padding: "10px 12px", borderRadius: 8,
                        background: "rgba(180,83,9,0.06)", border: "1px solid rgba(180,83,9,0.2)",
                        marginBottom: 8,
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: "#9a8f84", textTransform: "uppercase" }}>{liveCost.complet ? "Cout total" : "Coût partiel, ingrédients liés seulement"}</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: ACCENT }}>{liveCost.total.toFixed(2)} €</div>
                        </div>
                        {liveCost.perKg != null && (
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "#9a8f84", textTransform: "uppercase" }}>Cout / kg</div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: ACCENT }}>{liveCost.perKg.toFixed(2)} €/kg</div>
                          </div>
                        )}
                      </div>
                    )}

                    {result.flour_breakdown.length > 1 && (
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

                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#6f6a61", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Pesées</div>
                      {result.phases.map(ph => (
                        <div key={ph.name} style={{ marginBottom: 8, padding: "8px 10px", borderRadius: 8, background: "rgba(180,83,9,0.04)", border: "1px solid rgba(180,83,9,0.15)" }}>
                          <div style={{ fontWeight: 800, fontSize: 12, color: ACCENT, marginBottom: 4 }}>{nomPhase(ph, result.phases.length)}</div>
                          <div style={{ fontSize: 12, color: "#6f6a61" }}>
                            {lignesPesee(ph).map(l => `${l.libelle}${l.note ? ` (${l.note})` : ""} : ${formatG(l.grammes, l.precis)}`).join(" · ")}
                          </div>
                        </div>
                      ))}
                      <div style={{ fontSize: 12, color: "#6f6a61" }}>Pâte totale pesée : {fmtG(result.summary.total_ingredients_g)} pour {result.summary.nbPatons} pâtons, calculés à {result.summary.poidsCalcule_g} g.</div>
                    </div>

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
                  <div style={{ marginBottom: 8 }}>
                    <button type="button" className="btn" onClick={() => setSteps(etapesParDefaut(type))} disabled={type === "focaccia"} style={{ fontSize: 12 }}>
                      Remettre les étapes par défaut ({type === "biga" ? "biga" : type === "direct" ? "directe" : "aucune pour la focaccia"})
                    </button>
                  </div>
                  <StepsList steps={steps} onChange={setSteps} />
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
