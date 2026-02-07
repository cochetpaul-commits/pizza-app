"use client";
import { offerToCpu } from "@/lib/offerPricing";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { calculerPate } from "@/lib/pateEngine";
import { TopNav } from "@/components/TopNav";
import PercentStepper from "@/components/PercentStepper";
import NumberStepper from "@/components/NumberStepper";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}
type DoughType = "direct" | "biga" | "focaccia";
type FlourMixItem = { name: string; percent: number };

type IngredientRow = {
  id: string;
  name: string | null;
  cost_per_unit: number | null;
  is_active?: boolean | null;
};

type Recipe = {
  id: string;
  name: string;
  type: string;
  hydration_total: number;
  salt_percent: number;
  honey_percent: number | null;
  oil_percent: number | null;
  yeast_percent?: number | null;
  biga_yeast_percent?: number | null;
  flour_mix?: any;
  procedure?: string | null;
  balls_count?: number | null;
  ball_weight?: number | null;
  total_cost?: number | null;
  yield_grams?: number | null;
  created_at: string;
  user_id: string;
  [key: string]: any;
};

function toNumSafe(v: string, fallback: number) {
  if (v === "" || v === "-" || v === "." || v === "-.") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function normalize2To100(a: number, b: number) {
  const total = a + b;
  if (!Number.isFinite(total) || total <= 0) return { a: 100, b: 0, total: 100 };
  if (Math.abs(total - 100) < 1e-9) return { a, b, total: 100 };
  const aNorm = Math.round((a / total) * 100);
  const bNorm = 100 - aNorm;
  return { a: aNorm, b: bNorm, total: 100 };
}

function n2(v: unknown) {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

function fmtMoney2(v: number) {
  return n2(v).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function fmtKg3(v: number) {
  return n2(v).toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + " €/kg";
}

function keyName(s: string) {
  return (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function bestMatchByAliases(ings: IngredientRow[], aliases: string[]) {
  const a = aliases.map((x) => keyName(x)).filter(Boolean);

  for (const ing of ings) {
    const kn = keyName(String(ing.name ?? ""));
    if (!kn) continue;
    if (a.includes(kn)) return ing;
  }
  for (const ing of ings) {
    const kn = keyName(String(ing.name ?? ""));
    if (!kn) continue;
    if (a.some((w) => w && kn.includes(w))) return ing;
  }
  return null;
}

export default function RecipePage() {
  const params = useParams();
  const id = (params?.id as string) || "";
  const router = useRouter();

  const [state, setState] = useState<{
    status: "loading" | "NOT_LOGGED" | "OK" | "ERROR";
    recipe?: Recipe;
    error?: any;
  }>({ status: "loading" });

  const setError = (e: unknown) => setState((p) => ({ ...p, status: "ERROR", error: e }));

  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [priceByIngredient, setPriceByIngredient] = useState<Record<string, { g?: number; ml?: number; pcs?: number }>>({});

  const [nbPatons, setNbPatons] = useState<number>(150);
  const [poidsPaton, setPoidsPaton] = useState<number>(264);

  const [form, setForm] = useState<{
    name: string;
    type: DoughType;
    hydration_total: string;
    salt_percent: string;
    honey_percent: string;
    oil_percent: string;
    yeast_ui: string;
    flourA_name: string;
    flourA_percent: string;
    flourB_name: string;
    flourB_percent: string;
    procedure: string;
  } | null>(null);

  const [saveState, setSaveState] = useState<{ saving: boolean; error?: any; ok?: boolean }>({ saving: false });
  const [pdfState, setPdfState] = useState<{ exporting: boolean; error?: any; ok?: boolean }>({ exporting: false });

  const parsed = useMemo(() => {
    const hydration = clamp(toNumSafe(form?.hydration_total ?? "", 65), 0, 120);
    const salt = clamp(toNumSafe(form?.salt_percent ?? "", 2), 0, 10);
    const honey = clamp(toNumSafe(form?.honey_percent ?? "", 0), 0, 20);
    const oil = clamp(toNumSafe(form?.oil_percent ?? "", 0), 0, 20);
    const yeastUi = clamp(toNumSafe(form?.yeast_ui ?? "", 0), 0, 10);

    const aPctRaw = clamp(toNumSafe(form?.flourA_percent ?? "", 80), 0, 100);
    const bPctRaw = clamp(toNumSafe(form?.flourB_percent ?? "", 20), 0, 100);
    const norm = normalize2To100(aPctRaw, bPctRaw);

    const flourMix: FlourMixItem[] = [
      { name: (form?.flourA_name ?? "").trim() || "Farine A", percent: norm.a },
      { name: (form?.flourB_name ?? "").trim() || "Farine B", percent: norm.b },
    ];

    return {
      hydration,
      salt,
      honey,
      oil,
      yeastUi,
      flourMix,
      flourMixTotalRaw: aPctRaw + bPctRaw,
      flourMixNorm: norm,
    };
  }, [
    form?.hydration_total,
    form?.salt_percent,
    form?.honey_percent,
    form?.oil_percent,
    form?.yeast_ui,
    form?.flourA_name,
    form?.flourA_percent,
    form?.flourB_name,
    form?.flourB_percent,
  ]);

  const isBiga = (form?.type ?? "direct") === "biga";

  const result = useMemo(() => {
    if (!form) {
      return {
        totals: { flour_total_g: 0, water_g: 0, salt_g: 0, honey_g: 0, oil_g: 0, yeast_g: 0 },
        phases: [],
        warnings: [],
      } as any;
    }

    return calculerPate({
      type: (form.type ?? "direct") as any,
      nbPatons,
      poidsPaton,
      recipe: isBiga
        ? {
            hydration_total: parsed.hydration,
            salt_percent: parsed.salt,
            honey_percent: parsed.honey,
            oil_percent: parsed.oil,
            biga_yeast_percent: parsed.yeastUi,
            yeast_percent: 0,
          }
        : {
            hydration_total: parsed.hydration,
            salt_percent: parsed.salt,
            honey_percent: parsed.honey,
            oil_percent: parsed.oil,
            yeast_percent: parsed.yeastUi,
            biga_yeast_percent: 0,
          },
      flourMix: parsed.flourMix,
    });
  }, [form, form?.type, nbPatons, poidsPaton, isBiga, parsed.hydration, parsed.salt, parsed.honey, parsed.oil, parsed.yeastUi, parsed.flourMix]);

  const costing = useMemo(() => {
    const flourTotalG = n2(result?.totals?.flour_total_g);
    const waterG = n2(result?.totals?.water_g);
    const saltG = n2(result?.totals?.salt_g);
    const honeyG = n2(result?.totals?.honey_g);
    const oilG = n2(result?.totals?.oil_g);
    const yeastG = n2(result?.totals?.yeast_g);

    const flourAName = (form?.flourA_name ?? "").trim();
    const flourBName = (form?.flourB_name ?? "").trim();

    const aPct = clamp(toNumSafe(form?.flourA_percent ?? "", 80), 0, 100);
    const bPct = clamp(toNumSafe(form?.flourB_percent ?? "", 20), 0, 100);
    const norm = normalize2To100(aPct, bPct);

    const flourAG = flourTotalG > 0 ? (flourTotalG * norm.a) / 100 : 0;
    const flourBG = flourTotalG > 0 ? (flourTotalG * norm.b) / 100 : 0;

    const missing: string[] = [];
    const parts: Array<{ label: string; grams: number; cpu: number; cost: number }> = [];

    const pickCpuG = (ing: IngredientRow | null) => {
      const iid = String(ing?.id ?? "");
      const fromOffers = iid ? priceByIngredient[iid] : undefined;
      const cpu = n2(fromOffers?.g ?? ing?.cost_per_unit);
      return cpu;
    };

    const pushByExactName = (label: string, grams: number, name: string) => {
      if (grams <= 0) return;
      const ing = bestMatchByAliases(ingredients, [name, label]);
      const cpu = pickCpuG(ing);
      if (!ing || cpu <= 0) missing.push(label);
      parts.push({ label, grams, cpu, cost: grams * cpu });
    };

    const pushByAliases = (label: string, grams: number, aliases: string[]) => {
      if (grams <= 0) return;
      const ing = bestMatchByAliases(ingredients, aliases);
      const cpu = pickCpuG(ing);
      if (!ing || cpu <= 0) missing.push(label);
      parts.push({ label, grams, cpu, cost: grams * cpu });
    };

    pushByExactName("Farine A", flourAG, flourAName || "Farine A");
    pushByExactName("Farine B", flourBG, flourBName || "Farine B");

    pushByAliases("Eau", waterG, ["eau", "water"]);
    pushByAliases("Sel", saltG, ["sel", "sel fin", "salt"]);
    pushByAliases("Miel", honeyG, ["miel", "honey"]);
    pushByAliases("Huile", oilG, ["huile", "huile olive", "huile d'olive", "olive"]);
    pushByAliases("Levure", yeastG, ["levure", "levure seche", "levure fraiche", "yeast"]);

    const totalCost = round2(parts.reduce((acc, p) => acc + n2(p.cost), 0));
    const yieldGrams = Math.round(flourTotalG + waterG + saltG + honeyG + oilG + yeastG);

    const costPerKg = yieldGrams > 0 ? totalCost / (yieldGrams / 1000) : 0;
    const costPerBall = nbPatons > 0 ? totalCost / nbPatons : 0;

    return { parts, missing, totalCost, yieldGrams, costPerKg, costPerBall };
  }, [
    ingredients,
    priceByIngredient,
    result?.totals?.flour_total_g,
    result?.totals?.water_g,
    result?.totals?.salt_g,
    result?.totals?.honey_g,
    result?.totals?.oil_g,
    result?.totals?.yeast_g,
    form?.flourA_name,
    form?.flourB_name,
    form?.flourA_percent,
    form?.flourB_percent,
    nbPatons,
  ]);

  useEffect(() => {
    const run = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        setState({ status: "NOT_LOGGED" });
        return;
      }

      if (!id || !isUuid(id)) {
        setState({ status: "ERROR", error: { message: "ID invalide (UUID attendu)" } });
        return;
      }

      const { data: ing, error: ingErr } = await supabase.from("ingredients").select("id,name,cost_per_unit,is_active").order("name", { ascending: true });

      if (ingErr) {
        setState({ status: "ERROR", error: ingErr });
        return;
      }
      const ingList = (ing ?? []) as IngredientRow[];
      setIngredients(ingList);

      const { data: offers, error: offErr } = await supabase
        .from("v_latest_offers")
        .select("ingredient_id, unit, unit_price");

      if (offErr) {
        setState((p) => ({ ...p, status: "ERROR", error: offErr }));
        return;
      }

      const priceMap: Record<string, { g?: number; ml?: number; pcs?: number }> = {};
      (offers ?? []).forEach((o: any) => {
        const id = String(o.ingredient_id ?? "");
        if (!id) return;
        const cpu = offerToCpu(o.unit, o.unit_price);
        if (!priceMap[id]) priceMap[id] = {};
        priceMap[id] = { ...priceMap[id], ...cpu };
      });
      setPriceByIngredient(priceMap);

      const { data: recipe, error } = await supabase.from("recipes").select("*").eq("id", id).maybeSingle();

      if (error) {
        setState({ status: "ERROR", error });
        return;
      }

      if (!recipe) {
        setState({ status: "ERROR", error: { message: "Empâtement introuvable" } });
        return;
      }

      const rr = recipe as Recipe;

      const mix = Array.isArray(rr.flour_mix) ? rr.flour_mix : [];
      const a = mix[0] ?? { name: "Tipo 00", percent: 80 };
      const b = mix[1] ?? { name: "Tipo 1", percent: 20 };

      const type: DoughType = rr.type === "direct" || rr.type === "biga" || rr.type === "focaccia" ? (rr.type as DoughType) : "direct";

      const yeastUi = type === "biga" ? String((rr as any).biga_yeast_percent ?? 0) : String((rr as any).yeast_percent ?? 0);

      setNbPatons(Math.max(1, n2((rr as any).balls_count) || 150));
      setPoidsPaton(Math.max(1, n2((rr as any).ball_weight) || 264));

      setForm({
        name: String(rr.name ?? ""),
        type,
        hydration_total: String(rr.hydration_total ?? 65),
        salt_percent: String(rr.salt_percent ?? 2),
        honey_percent: String(rr.honey_percent ?? 0),
        oil_percent: String(rr.oil_percent ?? 0),
        yeast_ui: yeastUi,
        flourA_name: String(a.name ?? "Tipo 00"),
        flourA_percent: String(a.percent ?? 80),
        flourB_name: String(b.name ?? "Tipo 1"),
        flourB_percent: String(b.percent ?? 20),
        procedure: String(rr.procedure ?? ""),
      });

      setState({ status: "OK", recipe: rr });
    };

    run();
  }, [id]);

  const saveRecipe = async () => {
    if (!form?.name || !form.name.trim()) {
      setSaveState({ saving: false, error: { message: "Le nom de l’empâtement est obligatoire" } });
      return;
    }

    if (costing.missing.length > 0) {
      setSaveState({
        saving: false,
        error: {
          message: "Coût empâtement impossible (prix manquant dans l’index ingrédients).",
          missing: costing.missing,
          hint: "Mets un cost_per_unit (€/g) sur les ingrédients correspondants (farines, eau, sel, huile, levure…).",
        },
      });
      return;
    }

    setSaveState({ saving: true, error: null, ok: false });

    const hydration = clamp(toNumSafe(form.hydration_total, 65), 0, 120);
    const salt = clamp(toNumSafe(form.salt_percent, 2), 0, 10);
    const honey = clamp(toNumSafe(form.honey_percent, 0), 0, 20);
    const oil = clamp(toNumSafe(form.oil_percent, 0), 0, 20);
    const yeastUi = clamp(toNumSafe(form.yeast_ui, 0), 0, 10);

    const aPctRaw = clamp(toNumSafe(form.flourA_percent, 80), 0, 100);
    const bPctRaw = clamp(toNumSafe(form.flourB_percent, 20), 0, 100);
    const norm = normalize2To100(aPctRaw, bPctRaw);

    const flour_mix: FlourMixItem[] = [
      { name: form.flourA_name.trim() || "Farine A", percent: norm.a },
      { name: form.flourB_name.trim() || "Farine B", percent: norm.b },
    ];

    const payload: any = {
      name: (form.name ?? "").trim() || "Sans nom",
      type: form.type,
      hydration_total: hydration,
      salt_percent: salt,
      honey_percent: honey,
      oil_percent: oil,
      flour_mix,
      balls_count: nbPatons,
      ball_weight: poidsPaton,
      procedure: (form.procedure ?? "").toString(),
      total_cost: round2(costing.totalCost),
      yield_grams: Math.round(costing.yieldGrams),
      updated_at: new Date().toISOString(),
    };

    if (form.type === "biga") {
      payload.biga_yeast_percent = yeastUi;
      payload.yeast_percent = 0;
    } else {
      payload.yeast_percent = yeastUi;
      payload.biga_yeast_percent = 0;
    }

    const { error } = await supabase.from("recipes").update(payload).eq("id", id);
    if (error) {
      setSaveState({ saving: false, error });
      return;
    }

    setSaveState({ saving: false, ok: true });
    setTimeout(() => setSaveState((p) => ({ ...p, ok: false })), 1200);
  };

  const exportPdf = async () => {
    try {
      if (!id) return;
      setPdfState({ exporting: true, error: null, ok: false });

      const { data: sessionData, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw new Error(sessErr.message);

      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Session invalide (token manquant)");

      const res = await fetch("/api/recipes/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ recipeId: id, nbPatons, poidsPaton }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt ? `HTTP ${res.status} — ${txt}` : `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") || "";
      const match = cd.match(/filename="([^"]+)"/i);
      const filename = match?.[1] || `empatement-${id}.pdf`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 800);

      setPdfState({ exporting: false, ok: true });
      setTimeout(() => setPdfState((p) => ({ ...p, ok: false })), 900);
    } catch (e: any) {
      setPdfState({ exporting: false, error: { message: "Export PDF impossible", details: String(e?.message ?? e) } });
    }
  };

  if (state.status === "loading") {
    return (
      <main className="container">
        <TopNav title="Empâtement" subtitle="Chargement…" backHref="/recipes" backLabel="Liste empâtements" />
        <p className="muted">Chargement…</p>
      </main>
    );
  }

  if (state.status === "NOT_LOGGED") {
    return (
      <main className="container">
        <TopNav title="Empâtement" subtitle="Connexion requise" />
        <p className="muted">NOT_LOGGED</p>
      </main>
    );
  }

  if (state.status === "ERROR") {
    return (
      <main className="container">
        <TopNav title="Empâtement" subtitle="Erreur" backHref="/recipes" backLabel="Liste empâtements" />
        <pre className="code">{JSON.stringify(state.error, null, 2)}</pre>
      </main>
    );
  }

  const r = state.recipe!;
  if (!form) {
    return (
      <main className="container">
        <TopNav title={r?.name ?? "Empâtement"} subtitle="Chargement…" backHref="/recipes" backLabel="Liste empâtements" />
        <p className="muted">Chargement…</p>
      </main>
    );
  }

  return (
    <main className="container">
      <TopNav
        title={r.name}
        subtitle={`${form.type} • créée le ${new Date(r.created_at).toLocaleString()}`}
        backHref="/recipes"
        backLabel="Liste empâtements"
        right={
          <>
            <button className="btn btnPrimary" type="button" onClick={saveRecipe} disabled={saveState.saving || pdfState.exporting}>
              {saveState.saving ? "Sauvegarde…" : saveState.ok ? "OK" : "Sauvegarder"}
            </button>

            <button className="btn" type="button" onClick={exportPdf} disabled={saveState.saving || pdfState.exporting}>
              {pdfState.exporting ? "PDF…" : pdfState.ok ? "OK" : "Télécharger (PDF)"}
            </button>
          </>
        }
      />

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "end" }}>
        <NumberStepper label="N. pâtons" value={nbPatons} onChange={(n) => setNbPatons(Math.max(1, n))} step={1} min={1} max={5000} />
        <NumberStepper label="Grammage pâton" value={poidsPaton} onChange={(n) => setPoidsPaton(Math.max(1, n))} step={1} min={1} max={2000} suffix="g" />
      </div>

      <div style={{ marginTop: 16 }}>
        <div className="muted" style={{ marginBottom: 6 }}>
          Nom de l’empâtement
        </div>
        <input
          className="input"
          value={form.name ?? ""}
          onChange={(e) => setForm((p) => (p ? { ...p, name: e.target.value } : p))}
          placeholder="Ex : Biga hiver 65%"
          style={{ fontSize: 17, fontWeight: 600 }}
        />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="muted" style={{ marginBottom: 10 }}>
          Coût (Option A — calcul auto depuis l’index ingrédients)
        </div>

        {costing.missing.length > 0 ? (
          <div className="errorBox" style={{ marginTop: 10 }}>
            <div style={{ fontWeight: 800 }}>Prix manquant dans l’index</div>
            <div className="muted" style={{ marginTop: 6 }}>
              À corriger dans “Ingrédients” (cost_per_unit en €/g) :
            </div>
            <div style={{ marginTop: 6, fontWeight: 800 }}>{costing.missing.join(" · ")}</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginTop: 10 }}>
            <div className="card" style={{ padding: 12 }}>
              <div className="muted" style={{ fontSize: 12 }}>
                Rendement
              </div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{Math.round(costing.yieldGrams).toLocaleString("fr-FR")} g</div>
            </div>
            <div className="card" style={{ padding: 12 }}>
              <div className="muted" style={{ fontSize: 12 }}>
                Coût total
              </div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{fmtMoney2(costing.totalCost)}</div>
            </div>
            <div className="card" style={{ padding: 12 }}>
              <div className="muted" style={{ fontSize: 12 }}>
                Coût / kg
              </div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{fmtKg3(costing.costPerKg)}</div>
            </div>
            <div className="card" style={{ padding: 12 }}>
              <div className="muted" style={{ fontSize: 12 }}>
                Coût / pâton
              </div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{fmtMoney2(costing.costPerBall)}</div>
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="muted" style={{ marginBottom: 8 }}>
          Procédure (protocole)
        </div>

        <textarea
          className="input"
          value={form.procedure ?? ""}
          onChange={(e) => setForm((p) => (p ? { ...p, procedure: e.target.value } : p))}
          placeholder="Ex : Eau froide 4°C. Mettre farine + eau au pétrin vitesse 1 (3 min), puis sel, puis vitesse 2 (6 min)…"
          rows={6}
          style={{ resize: "vertical", lineHeight: 1.35 }}
        />
        <p className="muted" style={{ marginTop: 8 }}>
          Conseil : court, actionnable, 6–10 lignes max.
        </p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        {saveState.error ? <pre className="code" style={{ marginTop: 10 }}>{JSON.stringify(saveState.error, null, 2)}</pre> : null}
        {pdfState.error ? <pre className="code" style={{ marginTop: 10 }}>{JSON.stringify(pdfState.error, null, 2)}</pre> : null}

        <div style={{ marginTop: 12 }}>
          <div className="muted" style={{ marginBottom: 8 }}>
            Type
          </div>
          <select className="input" value={form.type ?? "direct"} onChange={(e) => setForm((p) => (p ? { ...p, type: e.target.value as DoughType } : p))}>
            <option value="direct">direct</option>
            <option value="biga">biga</option>
            <option value="focaccia">focaccia</option>
          </select>
        </div>

        <div style={{ marginTop: 12 }}>
          <PercentStepper label="Hydratation" value={form.hydration_total ?? ""} onChange={(v) => setForm((p) => (p ? { ...p, hydration_total: v } : p))} step={0.5} min={0} max={120} suffix="%" />
          <PercentStepper label="Sel" value={form.salt_percent ?? ""} onChange={(v) => setForm((p) => (p ? { ...p, salt_percent: v } : p))} step={0.1} min={0} max={10} suffix="%" />
          <PercentStepper label="Miel" value={form.honey_percent ?? ""} onChange={(v) => setForm((p) => (p ? { ...p, honey_percent: v } : p))} step={0.1} min={0} max={20} suffix="%" />
          <PercentStepper label="Huile" value={form.oil_percent ?? ""} onChange={(v) => setForm((p) => (p ? { ...p, oil_percent: v } : p))} step={0.1} min={0} max={20} suffix="%" />
          <PercentStepper label={isBiga ? "Levure (phase 2)" : "Levure"} value={form.yeast_ui ?? ""} onChange={(v) => setForm((p) => (p ? { ...p, yeast_ui: v } : p))} step={0.05} min={0} max={10} suffix="%" />
        </div>

        <div style={{ marginTop: 14 }}>
          <div className="muted" style={{ marginBottom: 8 }}>
            Mix farines (2)
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 260px 1.2fr 260px", gap: 12, alignItems: "center" }}>
            <input className="input" value={form.flourA_name ?? ""} onChange={(e) => setForm((p) => (p ? { ...p, flourA_name: e.target.value } : p))} placeholder="Nom farine A" />
            <NumberStepper value={clamp(toNumSafe(form.flourA_percent ?? "", 80), 0, 100)} onChange={(n) => setForm((p) => (p ? { ...p, flourA_percent: String(n) } : p))} step={1} min={0} max={100} suffix="%" />

            <input className="input" value={form.flourB_name ?? ""} onChange={(e) => setForm((p) => (p ? { ...p, flourB_name: e.target.value } : p))} placeholder="Nom farine B" />
            <NumberStepper value={clamp(toNumSafe(form.flourB_percent ?? "", 20), 0, 100)} onChange={(n) => setForm((p) => (p ? { ...p, flourB_percent: String(n) } : p))} step={1} min={0} max={100} suffix="%" />
          </div>

          <p className="muted" style={{ marginTop: 8 }}>
            Total saisi : {Math.round(parsed.flourMixTotalRaw * 100) / 100}% • Total utilisé : {parsed.flourMixNorm.total}%
          </p>
        </div>
      </div>

      {!isBiga && (
        <div style={{ marginTop: 20 }}>
          <h2 className="h2">Quantités</h2>
          {result.warnings?.length > 0 && <pre className="code">{JSON.stringify(result.warnings, null, 2)}</pre>}

          <div className="kv" style={{ marginTop: 10 }}>
            <div className="kvItem">
              <span className="kvKey">Farine</span>
              <span className="kvVal">{result.totals.flour_total_g} g</span>
            </div>
            <div className="kvItem">
              <span className="kvKey">Eau</span>
              <span className="kvVal">{result.totals.water_g} g</span>
            </div>
            <div className="kvItem">
              <span className="kvKey">Sel</span>
              <span className="kvVal">{result.totals.salt_g} g</span>
            </div>
            <div className="kvItem">
              <span className="kvKey">Miel</span>
              <span className="kvVal">{result.totals.honey_g} g</span>
            </div>
            <div className="kvItem">
              <span className="kvKey">Huile</span>
              <span className="kvVal">{result.totals.oil_g} g</span>
            </div>
            <div className="kvItem">
              <span className="kvKey">Levure</span>
              <span className="kvVal">{result.totals.yeast_g} g</span>
            </div>
          </div>
        </div>
      )}

      {isBiga && (
        <div style={{ marginTop: 20 }}>
          <h2 className="h2">Phases</h2>
          {result.warnings?.length > 0 && <pre className="code">{JSON.stringify(result.warnings, null, 2)}</pre>}

          {Array.isArray(result.phases) && result.phases.length > 0 ? (
            <div className="grid" style={{ marginTop: 10 }}>
              {result.phases.map((p: any, idx: number) => (
                <div key={idx} className="card">
                  <p className="cardTitle">{p.name}</p>

                  <div className="kv" style={{ marginTop: 10 }}>
                    <div className="kvItem">
                      <span className="kvKey">Farine</span>
                      <span className="kvVal">{p.flour_g} g</span>
                    </div>
                    <div className="kvItem">
                      <span className="kvKey">Eau</span>
                      <span className="kvVal">{p.water_g} g</span>
                    </div>

                    {p.yeast_g > 0 && (
                      <div className="kvItem">
                        <span className="kvKey">Levure</span>
                        <span className="kvVal">{p.yeast_g} g</span>
                      </div>
                    )}

                    {p.salt_g > 0 && (
                      <div className="kvItem">
                        <span className="kvKey">Sel</span>
                        <span className="kvVal">{p.salt_g} g</span>
                      </div>
                    )}

                    {p.honey_g > 0 && (
                      <div className="kvItem">
                        <span className="kvKey">Miel</span>
                        <span className="kvVal">{p.honey_g} g</span>
                      </div>
                    )}

                    {p.oil_g > 0 && (
                      <div className="kvItem">
                        <span className="kvKey">Huile</span>
                        <span className="kvVal">{p.oil_g} g</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card" style={{ marginTop: 10 }}>
              <p className="muted" style={{ margin: 0 }}>
                Phases non disponibles.
              </p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
