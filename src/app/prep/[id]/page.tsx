"use client";

import { offerRowToCpu } from "@/lib/offerPricing";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { SmartSelect } from "@/components/SmartSelect";
import { supabase } from "@/lib/supabaseClient";
import { TopNav } from "@/components/TopNav";

type Ingredient = {
  id: string;
  name: string;
  cost_per_unit: number | null;
  is_active?: boolean;
  category?: string | null;
};

type PrepRecipe = {
  id: string;
  name: string;
  pivot_ingredient_id: string;
  pivot_unit: "g" | "ml" | "pc";
  pivot_amount?: number | null;
  output_ingredient_id?: string | null;
  created_at?: string;
};

type Line = {
  id: string;
  prep_recipe_id: string;
  ingredient_id: string;
  amount_per_1_pivot: number;
  unit: "g" | "ml" | "pc";
  sort_order: number;

  ingredient_name?: string;
  ingredient_cost_per_unit?: number | null;
};

type ComputedRow = Line & {
  qty: number;
  cost: number;
  cpu: number | null;
};

type Computed = {
  rows: ComputedRow[];
  pivotCost: number;
  linesCost: number;
  totalCost: number;
  totalQty: number;
  costPerKg: number;
};

type AppError = {
  message: string;
  details?: unknown;
};

function n2(v: unknown) {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

function round2(v: number) {
  const x = n2(v);
  return Math.round(x * 100) / 100;
}

function fmtMoney(v: number) {
  const x = n2(v);
  return x.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function fmtKg(v: number) {
  const x = n2(v);
  return x.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €/kg";
}

function getErrMessage(e: unknown, fallback: string) {
  if (e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  if (e instanceof Error) return e.message;
  return fallback;
}

function getNumber(v: unknown, fallback = 0) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function getString(v: unknown, fallback = "") {
  return typeof v === "string" ? v : fallback;
}

function getObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

export default function PrepRecipeDetailPage() {
  const params = useParams();
  const id = String(params?.id ?? "");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingIndex, setSavingIndex] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const [recipe, setRecipe] = useState<PrepRecipe | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);

  const [priceByIngredient, setPriceByIngredient] = useState<Record<string, { g?: number; ml?: number; pcs?: number }>>({});
  const [offerInfoByIngredient, setOfferInfoByIngredient] = useState<
    Record<string, { supplier?: string | null; eurPerKg?: number | null }>
  >({});

  const [lines, setLines] = useState<Line[]>([]);

  const [pivotAmount, setPivotAmount] = useState<string>("");
  const [uiPivotId, setUiPivotId] = useState<string>("");
  const [newIngredientId, setNewIngredientId] = useState<string>("");
  const [newQtyForThisPivot, setNewQtyForThisPivot] = useState<string>("");
  const [newLineUnit, setNewLineUnit] = useState<"g" | "ml" | "pc">("g");

  const [adding, setAdding] = useState(false);

  const pivotAmountNum = useMemo(() => {
    const raw = String(pivotAmount).trim();
    if (!raw) return 0;
    const v = Number(raw.replace(",", "."));
    return Number.isFinite(v) && v > 0 ? v : 0;
  }, [pivotAmount]);

  const pivotIngredient = useMemo(() => {
    if (!recipe) return null;
    if (!recipe.pivot_ingredient_id) return null;
    return ingredients.find((x) => x.id === recipe.pivot_ingredient_id) ?? null;
  }, [recipe, ingredients]);

  const pickCpu = useCallback(
    (iid: string, unit: "g" | "ml" | "pc", fallbackCostPerUnit?: number | null) => {
      const m = iid ? priceByIngredient[iid] : undefined;
      const fromOffers = unit === "g" ? m?.g : unit === "ml" ? m?.ml : unit === "pc" ? m?.pcs : undefined;
      const cpu = n2(fromOffers ?? fallbackCostPerUnit);
      return cpu;
    },
    [priceByIngredient]
  );

  const computed: Computed = useMemo(() => {
    if (!recipe) return { rows: [], pivotCost: 0, linesCost: 0, totalCost: 0, totalQty: 0, costPerKg: 0 };

    const pivotCpu =
      pivotIngredient && pivotAmountNum > 0 ? pickCpu(pivotIngredient.id, recipe.pivot_unit, pivotIngredient.cost_per_unit) : 0;
    const pivotCost = pivotCpu > 0 && pivotAmountNum > 0 ? pivotCpu * pivotAmountNum : 0;

    const rows: ComputedRow[] = (lines ?? [])
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((l) => {
        const qty = pivotAmountNum > 0 ? n2(l.amount_per_1_pivot) * pivotAmountNum : 0;
        const cpuPicked = pickCpu(String(l.ingredient_id ?? ""), l.unit ?? "g", l.ingredient_cost_per_unit ?? null);
        const cpu = cpuPicked > 0 ? cpuPicked : null;
        const cost = cpu != null ? cpu * qty : 0;
        return { ...l, qty, cost, cpu };
      });

    const linesCost = rows.reduce((acc, r) => acc + n2(r.cost), 0);
    const totalCost = pivotCost + linesCost;

    const totalQty = (pivotAmountNum > 0 ? pivotAmountNum : 0) + rows.reduce((acc, r) => acc + n2(r.qty), 0);

    const costPerKg = recipe.pivot_unit === "g" && totalQty > 0 ? totalCost / (totalQty / 1000) : 0;

    return { rows, pivotCost, linesCost, totalCost, totalQty, costPerKg };
  }, [recipe, lines, pivotAmountNum, pivotIngredient, pickCpu]);

  const isDraft = useMemo(() => {
    if (!recipe) return true;
    const nameBlank = !String(recipe.name ?? "").trim();
    const noLines = (lines ?? []).length === 0;
    const noOutput = !recipe.output_ingredient_id;
    return nameBlank && noLines && noOutput;
  }, [recipe, lines]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("NOT_LOGGED");

      const { data: r, error: eR } = await supabase
        .from("prep_recipes")
        .select("id,name,pivot_ingredient_id,pivot_unit,pivot_amount,output_ingredient_id,created_at")
        .eq("id", id)
        .single();

      if (eR) throw eR;
      if (!r || typeof r !== "object" || !("id" in r)) throw new Error("Recette introuvable");

      const rr = r as PrepRecipe;
      setRecipe(rr);
      setUiPivotId(rr.pivot_ingredient_id ?? "");
      if (rr.pivot_amount != null && rr.pivot_amount > 0) {
        setPivotAmount(String(rr.pivot_amount));
      }

      const { data: ing, error: eI } = await supabase
        .from("ingredients")
        .select("id,name,cost_per_unit,is_active,category")
        .eq("is_active", true)
        .order("name");

      if (eI) throw eI;
      const ingList = (ing ?? []) as Ingredient[];
      setIngredients(ingList);

      const { data: offers, error: offErr } = await supabase
        .from("v_latest_offers")
        .select(
          "ingredient_id,supplier_id,unit,unit_price,pack_price,pack_total_qty,pack_unit,pack_count,pack_each_qty,pack_each_unit,density_kg_per_l,piece_weight_g"
        );

      if (offErr) {
        setError({ message: getErrMessage(offErr, "Erreur offers"), details: offErr });
        return;
      }

      const supplierMap: Record<string, string> = {
        B347: "METRO",
        "0074": "MAEL",
        B86F: "B86F",
        CD44: "CD44",
      };

      const priceMap: Record<string, { g?: number; ml?: number; pcs?: number }> = {};
      const infoMap: Record<string, { supplier?: string | null; eurPerKg?: number | null }> = {};

      (offers ?? []).forEach((o: unknown) => {
        const oo = getObj(o) ?? {};
        const iid = String(oo["ingredient_id"] ?? "");
        if (!iid) return;

        const supplierId = String(oo["supplier_id"] ?? "");
        const supplierCode = supplierId ? supplierId.slice(0, 4).toUpperCase() : "";
        const supplier = supplierCode ? supplierMap[supplierCode] ?? supplierCode : null;

        const cpu = offerRowToCpu(oo);
        if (!cpu.g && !cpu.ml && !cpu.pcs) return;

        if (!priceMap[iid]) priceMap[iid] = {};
        priceMap[iid] = { ...priceMap[iid], ...cpu };

        const eurPerKg = priceMap[iid].g ? (priceMap[iid].g as number) * 1000 : null;
        infoMap[iid] = {
          supplier,
          eurPerKg: eurPerKg != null && Number.isFinite(eurPerKg) ? eurPerKg : null,
        };
      });

      setPriceByIngredient(priceMap);
      setOfferInfoByIngredient(infoMap);

      const { data: ln, error: eL } = await supabase
        .from("prep_recipe_lines")
        .select("id,prep_recipe_id,ingredient_id,amount_per_1_pivot,unit,sort_order,ingredients(name,cost_per_unit)")
        .eq("prep_recipe_id", id)
        .order("sort_order", { ascending: true });

      if (eL) throw eL;

      const mapped: Line[] = (ln ?? []).map((raw) => {
        const row = getObj(raw) ?? {};
        const ingObj = getObj(row["ingredients"]) ?? {};
        return {
          id: getString(row["id"]),
          prep_recipe_id: getString(row["prep_recipe_id"]),
          ingredient_id: getString(row["ingredient_id"]),
          amount_per_1_pivot: getNumber(row["amount_per_1_pivot"]),
          unit: (getString(row["unit"], "g") as "g" | "ml" | "pc") ?? "g",
          sort_order: getNumber(row["sort_order"], 0),
          ingredient_name: getString(ingObj["name"]),
          ingredient_cost_per_unit: typeof ingObj["cost_per_unit"] === "number" ? (ingObj["cost_per_unit"] as number) : null,
        };
      });
      setLines(mapped);
    } catch (e: unknown) {
      setError({ message: getErrMessage(e, "Erreur"), details: e });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    void load();
  }, [id, load]);

  const canSaveRecipe = useMemo(() => {
    if (!recipe) return false;
    const nameOk = !!String(recipe.name ?? "").trim();
    const pivotOk = !!String(recipe.pivot_ingredient_id ?? "").trim();
    return nameOk && pivotOk;
  }, [recipe]);

  const saveRecipe = async () => {
    if (!recipe) return;
    if (saving) return;

    if (!canSaveRecipe) {
      setError({ message: "Renseigne au minimum : Nom + Pivot.", details: null });
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        name: String(recipe.name ?? "").trim(),
        pivot_ingredient_id: recipe.pivot_ingredient_id,
        pivot_unit: recipe.pivot_unit,
        pivot_amount: pivotAmountNum > 0 ? pivotAmountNum : null,
        updated_at: new Date().toISOString(),
      };

      const { error: e } = await supabase.from("prep_recipes").update(payload).eq("id", recipe.id);
      if (e) throw e;

      await load();
    } catch (e: unknown) {
      setError({ message: getErrMessage(e, "Erreur sauvegarde"), details: e });
    } finally {
      setSaving(false);
    }
  };

  const saveAsIngredient = async () => {
    if (!recipe) return;
    if (savingIndex) return;

    setSavingIndex(true);
    setError(null);

    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("NOT_LOGGED");

      if (!pivotIngredient) throw new Error("Pivot introuvable.");
      if (pivotAmountNum <= 0) throw new Error("Quantité pivot invalide.");

      const pivotCpu = pickCpu(pivotIngredient.id, recipe.pivot_unit, pivotIngredient.cost_per_unit);
      if (pivotCpu <= 0) throw new Error("Pivot : coût manquant. Ajoute un prix dans les offers.");

      const pivotCost = pivotCpu * pivotAmountNum;

      const rows = (lines ?? []).map((l) => {
        const qty = n2(l.amount_per_1_pivot) * pivotAmountNum;
        const cpuPicked = pickCpu(String(l.ingredient_id ?? ""), l.unit ?? "g", l.ingredient_cost_per_unit ?? null);
        const cpu = cpuPicked > 0 ? cpuPicked : null;
        const cost = cpu != null ? cpu * qty : 0;
        return { qty, cost, cpu };
      });

      const missing = rows.find((r) => r.cpu == null);
      if (missing) throw new Error("Impossible d'enregistrer : un ingrédient n'a pas de prix.");

      const totalCost = round2(pivotCost + rows.reduce((acc, r) => acc + n2(r.cost), 0));
      const totalQty = Math.round((pivotAmountNum > 0 ? pivotAmountNum : 0) + rows.reduce((acc, r) => acc + n2(r.qty), 0));

      if (!Number.isFinite(totalCost) || totalCost <= 0) throw new Error("Coût total invalide.");
      if (!Number.isFinite(totalQty) || totalQty <= 0) throw new Error("Quantité totale invalide.");

      const name = (String(recipe.name ?? "").trim() || "Recette pivot").slice(0, 120);

      const ingredientPayload: Record<string, unknown> = {
        name,
        category: "autre",
        is_active: true,
        default_unit: recipe.pivot_unit,
        purchase_price: totalCost,
        purchase_unit: totalQty,
        purchase_unit_label: recipe.pivot_unit,
        purchase_unit_name: recipe.pivot_unit,
        cost_per_unit: totalCost / totalQty,
        source_prep_recipe_id: recipe.id,
        source_prep_recipe_name: name,
        updated_at: new Date().toISOString(),
      };

      if (recipe.output_ingredient_id) {
        const { error: eUpd } = await supabase.from("ingredients").update(ingredientPayload).eq("id", recipe.output_ingredient_id);
        if (eUpd) throw eUpd;
        await load();
        return;
      }

      const { data: ins, error: eIns } = await supabase.from("ingredients").insert(ingredientPayload).select("id").single();
      if (eIns) throw eIns;

      const insObj = getObj(ins);
      const newId = insObj ? getString(insObj["id"]) : "";
      if (!newId) throw new Error("ID ingrédient manquant après création");

      const { error: eBind } = await supabase
        .from("prep_recipes")
        .update({ output_ingredient_id: newId, updated_at: new Date().toISOString() })
        .eq("id", recipe.id);

      if (eBind) throw eBind;

      await load();
    } catch (e: unknown) {
      setError({ message: getErrMessage(e, "Erreur enregistrement index"), details: e });
    } finally {
      setSavingIndex(false);
    }
  };

  const addLine = async () => {
    if (!recipe) return;
    if (!recipe.pivot_ingredient_id) return;
    if (!newIngredientId) return;
    if (newIngredientId === recipe.pivot_ingredient_id) return;

    const qty = Number(String(newQtyForThisPivot).replace(",", "."));
    if (!Number.isFinite(qty) || qty <= 0) return;
    if (pivotAmountNum <= 0) return;

    setAdding(true);
    setError(null);

    try {
      const ratio = qty / pivotAmountNum;
      const nextSort = (lines?.length ? Math.max(...lines.map((l) => l.sort_order ?? 0)) : 0) + 1;

      const { data, error: e } = await supabase
        .from("prep_recipe_lines")
        .insert({
          prep_recipe_id: recipe.id,
          ingredient_id: newIngredientId,
          amount_per_1_pivot: ratio,
          unit: newLineUnit,
          sort_order: nextSort,
        })
        .select("id,prep_recipe_id,ingredient_id,amount_per_1_pivot,unit,sort_order,ingredients(name,cost_per_unit)")
        .single();

      if (e) throw e;

      const row = getObj(data) ?? {};
      const ingObj = getObj(row["ingredients"]) ?? {};

      const added: Line = {
        id: getString(row["id"]),
        prep_recipe_id: getString(row["prep_recipe_id"]),
        ingredient_id: getString(row["ingredient_id"]),
        amount_per_1_pivot: getNumber(row["amount_per_1_pivot"]),
        unit: (getString(row["unit"], "g") as "g" | "ml" | "pc") ?? "g",
        sort_order: getNumber(row["sort_order"], nextSort),
        ingredient_name: getString(ingObj["name"]),
        ingredient_cost_per_unit: typeof ingObj["cost_per_unit"] === "number" ? (ingObj["cost_per_unit"] as number) : null,
      };

      setLines((p) => [...(p ?? []), added]);
      setNewQtyForThisPivot("");
      setNewIngredientId("");
      setNewLineUnit("g");
    } catch (e: unknown) {
      setError({ message: getErrMessage(e, "Erreur ajout ligne"), details: e });
    } finally {
      setAdding(false);
    }
  };

  const delLine = async (lineId: string) => {
    const ok = window.confirm("Supprimer cette ligne ?");
    if (!ok) return;

    setError(null);

    try {
      const { error: e } = await supabase.from("prep_recipe_lines").delete().eq("id", lineId);
      if (e) throw e;
      setLines((p) => (p ?? []).filter((x) => x.id !== lineId));
    } catch (e: unknown) {
      setError({ message: getErrMessage(e, "Erreur suppression"), details: e });
    }
  };

  const kpiCard: React.CSSProperties = {
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.10)",
    padding: 12,
    background: "rgba(255,255,255,0.55)",
    minHeight: 70,
  };

  if (loading) {
    return (
      <main className="container">
        <TopNav title="Préparation" backHref="/prep" backLabel="Retour" />
        <p className="muted">Chargement…</p>
      </main>
    );
  }

  if (error && !recipe) {
    return (
      <main className="container">
        <TopNav title="Préparation" backHref="/prep" backLabel="Retour" />
        <div style={{ marginTop: 12 }}>
          <p className="muted">Recette introuvable.</p>
          <pre className="code" style={{ marginTop: 10 }}>
            {JSON.stringify(error, null, 2)}
          </pre>
        </div>
      </main>
    );
  }

  if (!recipe) {
    return (
      <main className="container">
        <TopNav title="Préparation" backHref="/prep" backLabel="Retour" />
        <p className="muted">Recette introuvable.</p>
      </main>
    );
  }

  const pageTitle = String(recipe.name ?? "").trim() || "Recette pivot";

  const topActions = (
    <>
      <button className="btn" type="button" onClick={saveAsIngredient} disabled={savingIndex || isDraft}>
        {savingIndex ? "Index…" : recipe.output_ingredient_id ? "Mettre à jour l'index" : "Enregistrer dans l'index"}
      </button>
      <button className="btn btnPrimary" type="button" onClick={saveRecipe} disabled={saving || !canSaveRecipe}>
        {saving ? "Sauvegarde…" : "Sauvegarder"}
      </button>
    </>
  );

  return (
    <main className="container">
      <TopNav title={pageTitle} backHref="/prep" backLabel="Retour" actions={topActions} />

      {error ? (
        <pre className="code" style={{ marginTop: 12 }}>
          {JSON.stringify(error, null, 2)}
        </pre>
      ) : null}

      {/* Nom + Pivot */}
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ marginBottom: 12 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Nom de la recette</div>
          <input
            className="input"
            style={{ fontSize: 18, fontWeight: 700, textAlign: "center" }}
            value={recipe.name ?? ""}
            onChange={(e) => setRecipe((p) => (p ? { ...p, name: e.target.value } : p))}
            placeholder="ex: Pesto verde"
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, alignItems: "end" }}>
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Ingrédient pivot</div>
            <SmartSelect
              key={"pivot|" + uiPivotId + "|" + ingredients.length}
              options={ingredients.map((i) => {
                const meta = offerInfoByIngredient[i.id];
                return {
                  id: i.id,
                  name: i.name,
                  category: i.category,
                  rightTop: meta?.supplier ?? null,
                  rightBottom: meta?.eurPerKg ? fmtKg(meta.eurPerKg) : null,
                };
              })}
              value={uiPivotId}
              onChange={(v) => {
                setUiPivotId(v);
                setRecipe((p) => (p ? { ...p, pivot_ingredient_id: v } : p));
              }}
              placeholder="Tape pour chercher…"
            />
          </div>

          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Quantité pivot ({recipe.pivot_unit})</div>
            <input
              className="input"
              style={{ fontSize: 18, fontWeight: 800, textAlign: "center" }}
              value={pivotAmount}
              onChange={(e) => setPivotAmount(e.target.value)}
              inputMode="decimal"
              placeholder="ex: 300"
            />
          </div>
        </div>
      </div>

      {/* Ajouter une ligne */}
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 10 }}>Ajouter une ligne</div>

        {pivotAmountNum <= 0 && (
          <p className="muted" style={{ marginBottom: 10, fontSize: 12 }}>
            Saisis d'abord une quantité pivot pour pouvoir ajouter des lignes.
          </p>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 110px auto", gap: 12, alignItems: "end" }}>
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Ingrédient</div>
            <SmartSelect
              key={"line|" + newIngredientId + "|" + recipe.pivot_ingredient_id + "|" + ingredients.length}
              options={ingredients
                .filter((i) => i.id !== recipe.pivot_ingredient_id)
                .map((i) => {
                  const meta = offerInfoByIngredient[i.id];
                  return {
                    id: i.id,
                    name: i.name,
                    category: i.category,
                    rightTop: meta?.supplier ?? null,
                    rightBottom: meta?.eurPerKg ? fmtKg(meta.eurPerKg) : null,
                  };
                })}
              value={newIngredientId}
              onChange={(v) => setNewIngredientId(v)}
              placeholder="Tape pour chercher…"
            />
          </div>

          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Quantité ({newLineUnit})</div>
            <input
              className="input"
              style={{ fontSize: 18, fontWeight: 800, textAlign: "center" }}
              value={newQtyForThisPivot}
              onChange={(e) => setNewQtyForThisPivot(e.target.value)}
              inputMode="decimal"
              placeholder="ex: 200"
            />
          </div>

          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Unité</div>
            <select
              className="input"
              value={newLineUnit}
              onChange={(e) => setNewLineUnit(e.target.value as "g" | "ml" | "pc")}
            >
              <option value="g">g</option>
              <option value="ml">ml</option>
              <option value="pc">pc</option>
            </select>
          </div>

          <button
            className="btn btnPrimary"
            type="button"
            onClick={addLine}
            disabled={adding || !newIngredientId || pivotAmountNum <= 0}
          >
            {adding ? "Ajout…" : "Ajouter"}
          </button>
        </div>

        <p className="muted" style={{ marginTop: 10, marginBottom: 0, fontSize: 12 }}>
          Exemple : pivot = 300 g. Tu saisis Parmesan = 200 g → ratio stocké = 200/300.
        </p>
      </div>

      {/* Composition */}
      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>Composition</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              {computed.rows.length} ligne(s) — quantités calculées pour {pivotAmountNum || 0} {recipe.pivot_unit} de pivot
            </div>
          </div>

          <div style={{ fontSize: 14, fontWeight: 800 }}>
            Coût / kg : <span style={{ fontSize: 18 }}>{recipe.pivot_unit === "g" ? fmtKg(computed.costPerKg) : "—"}</span>
          </div>
        </div>

        <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1fr auto",
            gap: 10,
            padding: "10px 10px",
            borderRadius: 10,
            background: "rgba(0,0,0,0.03)",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}
        >
          <div>Ingrédient</div>
          <div style={{ textAlign: "right" }}>Quantité</div>
          <div style={{ textAlign: "right" }}>Coût ligne</div>
          <div />
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {computed.rows.map((r) => (
            <div
              key={r.id}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr auto",
                gap: 10,
                alignItems: "center",
                padding: "12px 10px",
                border: "1px solid rgba(0,0,0,0.10)",
                borderRadius: 12,
                background: "rgba(255,255,255,0.55)",
              }}
            >
              <div>
                <div style={{ fontSize: 16, fontWeight: 900 }}>{r.ingredient_name ?? "—"}</div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 18, fontWeight: 900 }}>{Math.round(r.qty)}</div>
                <div className="muted" style={{ fontSize: 12 }}>{r.unit}</div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 18, fontWeight: 950 }}>{fmtMoney(r.cost)}</div>
              </div>

              <button className="btn btnDanger" type="button" onClick={() => delLine(r.id)}>
                Supprimer
              </button>
            </div>
          ))}
        </div>

        {computed.rows.length === 0 ? (
          <p className="muted" style={{ marginTop: 12 }}>
            Aucune ligne. Ajoute un ingrédient ci-dessus.
          </p>
        ) : null}

        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          <div style={kpiCard}>
            <div className="muted" style={{ fontSize: 12 }}>Coût pivot</div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>{fmtMoney(computed.pivotCost)}</div>
          </div>
          <div style={kpiCard}>
            <div className="muted" style={{ fontSize: 12 }}>Coût lignes</div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>{fmtMoney(computed.linesCost)}</div>
          </div>
          <div style={kpiCard}>
            <div className="muted" style={{ fontSize: 12 }}>Total</div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>{fmtMoney(computed.totalCost)}</div>
          </div>
          <div style={kpiCard}>
            <div className="muted" style={{ fontSize: 12 }}>Coût / kg</div>
            <div style={{ fontSize: 20, fontWeight: 950 }}>{recipe.pivot_unit === "g" ? fmtKg(computed.costPerKg) : "—"}</div>
          </div>
        </div>
      </div>
    </main>
  );
}
