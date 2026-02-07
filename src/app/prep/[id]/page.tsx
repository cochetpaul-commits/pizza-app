"use client";
import { offerToCpu } from "@/lib/offerPricing";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { TopNav } from "@/components/TopNav";

type Ingredient = {
  id: string;
  name: string;
  cost_per_unit: number | null; // €/g (ou €/ml ou €/pc) — colonne DB (fallback)
  is_active?: boolean;
  category?: string | null;
};

type PrepRecipe = {
  id: string;
  name: string;
  pivot_ingredient_id: string;
  pivot_unit: "g" | "ml" | "pc";
  output_ingredient_id?: string | null;
};

type Line = {
  id: string;
  prep_recipe_id: string;
  ingredient_id: string;
  amount_per_1_pivot: number;
  unit: "g" | "ml" | "pc";
  sort_order: number;

  ingredient_name?: string;
  ingredient_cost_per_unit?: number | null; // fallback DB
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

function round0(v: number) {
  const x = n2(v);
  return Math.round(x);
}

function fmtMoney(v: number) {
  const x = n2(v);
  return x.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function fmtKg(v: number) {
  const x = n2(v);
  return x.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + " €/kg";
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
  const router = useRouter();
  const params = useParams();
  const id = String(params?.id ?? "");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingIndex, setSavingIndex] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const [recipe, setRecipe] = useState<PrepRecipe | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [priceByIngredient, setPriceByIngredient] = useState<Record<string, { g?: number; ml?: number; pcs?: number }>>({});
  const [lines, setLines] = useState<Line[]>([]);

  const [pivotAmount, setPivotAmount] = useState<string>("300");

  const [newIngredientId, setNewIngredientId] = useState<string>("");
  const [newQtyForThisPivot, setNewQtyForThisPivot] = useState<string>("");
  const [newUnit, setNewUnit] = useState<"g" | "ml" | "pc">("g");
  const [adding, setAdding] = useState(false);

  const pivotAmountNum = useMemo(() => {
    const v = Number(String(pivotAmount).replace(",", "."));
    return Number.isFinite(v) && v > 0 ? v : 0;
  }, [pivotAmount]);

  const pivotIngredient = useMemo(() => {
    if (!recipe) return null;
    return ingredients.find((x) => x.id === recipe.pivot_ingredient_id) ?? null;
  }, [recipe, ingredients]);

  const pickCpu = (iid: string, unit: "g" | "ml" | "pc", fallbackCostPerUnit?: number | null) => {
    const m = iid ? priceByIngredient[iid] : undefined;
    const fromOffers =
      unit === "g" ? m?.g : unit === "ml" ? m?.ml : unit === "pc" ? m?.pcs : undefined;

    const cpu = n2(fromOffers ?? fallbackCostPerUnit);
    return cpu > 0 ? cpu : 0;
  };

  const computed: Computed = useMemo(() => {
    if (!recipe) {
      return { rows: [], pivotCost: 0, linesCost: 0, totalCost: 0, totalQty: 0, costPerKg: 0 };
    }

    const pivotCpu = pivotIngredient ? pickCpu(pivotIngredient.id, recipe.pivot_unit, pivotIngredient.cost_per_unit) : 0;
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

    const totalQty = pivotAmountNum + rows.reduce((acc, r) => acc + n2(r.qty), 0);

    const costPerKg = recipe.pivot_unit === "g" && totalQty > 0 ? totalCost / (totalQty / 1000) : 0;

    return { rows, pivotCost, linesCost, totalCost, totalQty, costPerKg };
  }, [recipe, lines, pivotAmountNum, pivotIngredient, priceByIngredient]);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("NOT_LOGGED");

      const { data: r, error: eR } = await supabase
        .from("prep_recipes")
        .select("id,name,pivot_ingredient_id,pivot_unit,output_ingredient_id")
        .eq("id", id)
        .single();

      if (eR) throw eR;
      if (!r || typeof r !== "object" || !("id" in r)) throw new Error("Recette introuvable");

      const rr = r as PrepRecipe;
      setRecipe(rr);
      setNewUnit(rr.pivot_unit);

      const { data: ing, error: eI } = await supabase
        .from("ingredients")
        .select("id,name,cost_per_unit,is_active,category")
        .eq("is_active", true)
        .order("name");

      if (eI) throw eI;
      const ingList = (ing ?? []) as Ingredient[];
      setIngredients(ingList);

      const { data: offers, error: offErr } = await supabase.from("v_latest_offers").select("ingredient_id, unit, unit_price");
      if (offErr) {
        setError(offErr as any);
        return;
      }

      const priceMap: Record<string, { g?: number; ml?: number; pcs?: number }> = {};
      (offers ?? []).forEach((o: any) => {
        const iid = String(o.ingredient_id ?? "");
        if (!iid) return;
        const cpu = offerToCpu(o.unit, o.unit_price);
        if (!priceMap[iid]) priceMap[iid] = {};
        priceMap[iid] = { ...priceMap[iid], ...cpu };
      });
      setPriceByIngredient(priceMap);

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

      const firstOther = ingList.find((z) => z.id !== rr.pivot_ingredient_id) ?? ingList[0];
      setNewIngredientId(firstOther?.id ?? "");
    } catch (e: unknown) {
      setError({ message: getErrMessage(e, "Erreur"), details: e });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    void load();
  }, [id]);

  const saveRecipe = async () => {
    if (!recipe) return;
    if (saving) return;

    setSaving(true);
    setError(null);

    try {
      const payload = {
        name: recipe.name.trim() || "Sans nom",
        pivot_ingredient_id: recipe.pivot_ingredient_id,
        pivot_unit: recipe.pivot_unit,
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

      if (!pivotIngredient) {
        throw new Error("Pivot introuvable.");
      }
      if (pivotAmountNum <= 0) {
        throw new Error("Quantité pivot invalide.");
      }

      const pivotCpu = pickCpu(pivotIngredient.id, recipe.pivot_unit, pivotIngredient.cost_per_unit);
      if (pivotCpu <= 0) {
        throw new Error("Pivot: coût manquant. Ajoute un prix (offers ou cost_per_unit).");
      }

      const pivotCost = pivotCpu * pivotAmountNum;

      const rows = (lines ?? []).map((l) => {
        const qty = n2(l.amount_per_1_pivot) * pivotAmountNum;
        const cpuPicked = pickCpu(String(l.ingredient_id ?? ""), l.unit ?? "g", l.ingredient_cost_per_unit ?? null);
        const cpu = cpuPicked > 0 ? cpuPicked : null;
        const cost = cpu != null ? cpu * qty : 0;
        return { qty, cost, cpu, line: l };
      });

      const missing = rows.find((r) => r.cpu == null);
      if (missing) {
        throw new Error("Impossible d’enregistrer: un ingrédient n’a pas de prix (offers ou cost_per_unit manquant).");
      }

      const linesCost = rows.reduce((acc, r) => acc + n2(r.cost), 0);
      const totalCost = round2(pivotCost + linesCost);

      const totalQty = round0(pivotAmountNum + rows.reduce((acc, r) => acc + n2(r.qty), 0));

      if (!Number.isFinite(totalCost) || totalCost <= 0) {
        throw new Error("Impossible d’enregistrer: coût total invalide.");
      }
      if (!Number.isFinite(totalQty) || totalQty <= 0) {
        throw new Error("Impossible d’enregistrer: quantité totale invalide.");
      }

      const name = (recipe.name?.trim() || "Recette pivot").slice(0, 120);

      const defaultUnit = recipe.pivot_unit;
      const unitLabel = recipe.pivot_unit;

      const ingredientPayload: any = {
        name,
        category: "autre",
        is_active: true,
        default_unit: defaultUnit,

        purchase_price: totalCost,
        purchase_unit: totalQty,
        purchase_unit_label: unitLabel,
        purchase_unit_name: unitLabel,

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
          unit: newUnit,
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

  if (loading) {
    return (
      <main className="container">
        <TopNav title="Préparation" />
        <p className="muted">Chargement…</p>
      </main>
    );
  }

  if (error && !recipe) {
    return (
      <main className="container">
        <TopNav title="Préparation" />
        <div style={{ marginTop: 12 }}>
          <p className="muted">Recette introuvable.</p>
          <pre className="code" style={{ marginTop: 10 }}>
            {JSON.stringify(error, null, 2)}
          </pre>
          <button className="btn" type="button" onClick={() => router.replace("/prep")}>
            Retour
          </button>
        </div>
      </main>
    );
  }

  if (!recipe) {
    return (
      <main className="container">
        <TopNav title="Préparation" />
        <p className="muted">Recette introuvable.</p>
        <button className="btn" type="button" onClick={() => router.replace("/prep")}>
          Retour
        </button>
      </main>
    );
  }

  const labelStyle: React.CSSProperties = { fontSize: 12, opacity: 0.75, marginBottom: 6 };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    height: 44,
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.12)",
    padding: "0 12px",
    fontSize: 16,
    background: "rgba(255,255,255,0.65)",
  };

  const selectStyle: React.CSSProperties = { ...inputStyle, paddingRight: 34 };

  const bigTitleStyle: React.CSSProperties = {
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: 0.2,
    textAlign: "center",
    margin: 0,
  };

  const cardStyle: React.CSSProperties = { padding: 16 };

  const kpiCard: React.CSSProperties = {
    borderRadius: 12,
    border: "1px solid rgba(0,0,0,0.10)",
    padding: 12,
    background: "rgba(255,255,255,0.55)",
    minHeight: 70,
  };

  return (
    <main className="container">
      <TopNav title="Préparation" />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
        <button className="btn" type="button" onClick={() => router.replace("/prep")}>
          Retour
        </button>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn" type="button" onClick={saveAsIngredient} disabled={savingIndex}>
            {savingIndex ? "Index…" : recipe.output_ingredient_id ? "Mettre à jour l’index" : "Enregistrer dans l’index"}
          </button>

          <button className="btn btnPrimary" type="button" onClick={saveRecipe} disabled={saving}>
            {saving ? "Sauvegarde…" : "Sauvegarder"}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <h1 className="h1" style={bigTitleStyle}>
          {recipe.name?.trim() ? recipe.name : "Recette pivot"}
        </h1>
        <p className="muted" style={{ textAlign: "center", marginTop: 6 }}>
          Tu saisis des quantités réelles pour {pivotAmountNum || 0} {recipe.pivot_unit} de pivot.
        </p>
      </div>

      {error ? (
        <pre className="code" style={{ marginTop: 12 }}>
          {JSON.stringify(error, null, 2)}
        </pre>
      ) : null}

      <div className="card" style={{ ...cardStyle, marginTop: 12 }}>
        <div style={{ marginBottom: 12 }}>
          <div style={labelStyle}>Nom de la recette</div>
          <input
            style={{ ...inputStyle, fontSize: 18, fontWeight: 700, textAlign: "center" }}
            value={recipe.name}
            onChange={(e) => setRecipe((p) => (p ? { ...p, name: e.target.value } : p))}
            placeholder="Nom de la recette"
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, alignItems: "end" }}>
          <div>
            <div style={labelStyle}>Ingrédient pivot</div>
            <select
              style={selectStyle}
              value={recipe.pivot_ingredient_id}
              onChange={(e) => {
                const v = e.target.value;
                setRecipe((p) => (p ? { ...p, pivot_ingredient_id: v } : p));
              }}
            >
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div style={labelStyle}>Quantité pivot ({recipe.pivot_unit})</div>
            <input
              style={{ ...inputStyle, fontSize: 18, fontWeight: 800, textAlign: "center" }}
              value={pivotAmount}
              onChange={(e) => setPivotAmount(e.target.value)}
              inputMode="decimal"
              placeholder="300"
            />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 14 }}>
          <div style={kpiCard}>
            <div className="muted" style={{ fontSize: 12 }}>
              Coût pivot
            </div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{fmtMoney(computed.pivotCost)}</div>
          </div>

          <div style={kpiCard}>
            <div className="muted" style={{ fontSize: 12 }}>
              Coût lignes
            </div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{fmtMoney(computed.linesCost)}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {computed.rows.length} ligne(s)
            </div>
          </div>

          <div style={kpiCard}>
            <div className="muted" style={{ fontSize: 12 }}>
              Total
            </div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{fmtMoney(computed.totalCost)}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              Total: {Math.round(computed.totalQty)} {recipe.pivot_unit}
            </div>
          </div>

          <div style={kpiCard}>
            <div className="muted" style={{ fontSize: 12 }}>
              Coût / kg
            </div>
            <div style={{ fontSize: 22, fontWeight: 950 }}>{recipe.pivot_unit === "g" ? fmtKg(computed.costPerKg) : "—"}</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ ...cardStyle, marginTop: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 10 }}>Ajouter une ligne</div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 12, alignItems: "end" }}>
          <div>
            <div style={labelStyle}>Ingrédient</div>
            <select style={selectStyle} value={newIngredientId} onChange={(e) => setNewIngredientId(e.target.value)}>
              {ingredients
                .filter((i) => i.id !== recipe.pivot_ingredient_id)
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <div style={labelStyle}>Quantité pour ce pivot ({recipe.pivot_unit})</div>
            <input
              style={{ ...inputStyle, fontSize: 18, fontWeight: 800, textAlign: "center" }}
              value={newQtyForThisPivot}
              onChange={(e) => setNewQtyForThisPivot(e.target.value)}
              inputMode="decimal"
              placeholder="ex: 200"
            />
          </div>

          <button className="btn btnPrimary" type="button" onClick={addLine} disabled={adding}>
            {adding ? "Ajout…" : "Ajouter"}
          </button>
        </div>

        <p className="muted" style={{ marginTop: 10, marginBottom: 0, fontSize: 12 }}>
          Exemple: pivot = 300g. Tu saisis Parmesan = 200 → ratio stocké = 200/300.
        </p>
      </div>

      <div className="card" style={{ ...cardStyle, marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>Composition</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              {computed.rows.length} ligne(s) — quantités calculées pour {pivotAmountNum || 0} {recipe.pivot_unit} de pivot
            </div>
          </div>

          <div style={{ fontSize: 14, fontWeight: 800 }}>
            Coût / kg: <span style={{ fontSize: 18 }}>{recipe.pivot_unit === "g" ? fmtKg(computed.costPerKg) : "—"}</span>
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
                <div style={{ fontSize: 18, fontWeight: 900 }}>{Math.round(r.qty)} </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {recipe.pivot_unit}
                </div>
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
            Aucune ligne. Ajoute un ingrédient.
          </p>
        ) : null}

        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          <div style={kpiCard}>
            <div className="muted" style={{ fontSize: 12 }}>
              Coût pivot
            </div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>{fmtMoney(computed.pivotCost)}</div>
          </div>
          <div style={kpiCard}>
            <div className="muted" style={{ fontSize: 12 }}>
              Coût lignes
            </div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>{fmtMoney(computed.linesCost)}</div>
          </div>
          <div style={kpiCard}>
            <div className="muted" style={{ fontSize: 12 }}>
              Total
            </div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>{fmtMoney(computed.totalCost)}</div>
          </div>
          <div style={kpiCard}>
            <div className="muted" style={{ fontSize: 12 }}>
              Coût / kg
            </div>
            <div style={{ fontSize: 20, fontWeight: 950 }}>{recipe.pivot_unit === "g" ? fmtKg(computed.costPerKg) : "—"}</div>
          </div>
        </div>
      </div>
    </main>
  );
}
