"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { TopNav } from "@/components/TopNav";

type Ingredient = {
  id: string;
  name: string;
  cost_per_unit: number | null; // attendu: €/g (ou €/ml si un jour)
};

type PrepRecipe = {
  id: string;
  name: string;
  pivot_ingredient_id: string;
  pivot_unit: "g" | "ml" | "pc";
};

type Line = {
  id: string;
  prep_recipe_id: string;
  ingredient_id: string;
  amount_per_1_pivot: number; // ratio stocké (ex: 200/300)
  unit: "g" | "ml" | "pc";
  sort_order: number;

  ingredient_name?: string;
  ingredient_cost_per_unit?: number | null;
};

function n2(v: number) {
  return Number.isFinite(v) ? v : 0;
}

function fmtMoney(v: number) {
  const x = n2(v);
  return x.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function fmtKg(v: number) {
  const x = n2(v);
  return x.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + " €/kg";
}

export default function PrepRecipeDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params?.id ?? "");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<any>(null);

  const [recipe, setRecipe] = useState<PrepRecipe | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [lines, setLines] = useState<Line[]>([]);

  // UX: pivot amount visible + modifiable, non stocké
  const [pivotAmount, setPivotAmount] = useState<string>("300");

  // Mode cuisine (masque les infos “techniques”)
  const [kitchenMode, setKitchenMode] = useState<boolean>(false);

  // Form add line
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

  const computed = useMemo(() => {
    if (!recipe)
      return { rows: [] as any[], pivotCost: 0, linesCost: 0, totalCost: 0, totalWeight: 0, costPerKg: 0 };

    const pivotCost =
      pivotIngredient?.cost_per_unit != null && pivotAmountNum > 0 ? pivotIngredient.cost_per_unit * pivotAmountNum : 0;

    const rows = (lines ?? [])
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((l) => {
        const qty = pivotAmountNum > 0 ? l.amount_per_1_pivot * pivotAmountNum : 0;
        const cpu = l.ingredient_cost_per_unit ?? null;
        const cost = cpu != null ? cpu * qty : 0;

        return {
          ...l,
          qty,
          cost,
          cpu,
        };
      });

    const linesCost = rows.reduce((acc, r) => acc + n2(r.cost), 0);
    const totalCost = pivotCost + linesCost;

    const linesWeight = rows.reduce((acc, r) => acc + n2(r.qty), 0);
    const totalWeight = pivotAmountNum + linesWeight;

    const costPerKg = totalWeight > 0 ? totalCost / (totalWeight / 1000) : 0;

    return { rows, pivotCost, linesCost, totalCost, totalWeight, costPerKg };
  }, [recipe, lines, pivotAmountNum, pivotIngredient]);

  const load = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("NOT_LOGGED");

      // 1) recipe
      const { data: r, error: eR } = await supabase
        .from("prep_recipes")
        .select("id,name,pivot_ingredient_id,pivot_unit")
        .eq("id", id)
        .single();

      if (eR) throw eR;
      if (!r?.id) throw new Error("Recette introuvable");

      const rr = r as PrepRecipe;
      setRecipe(rr);
      setNewUnit(rr.pivot_unit);

      // 2) ingredients
      const { data: ing, error: eI } = await supabase
        .from("ingredients")
        .select("id,name,cost_per_unit")
        .eq("is_active", true)
        .order("name");

      if (eI) throw eI;
      const ingList = (ing ?? []) as Ingredient[];
      setIngredients(ingList);

      // 3) lines (+ join ingredient name/cost)
      const { data: ln, error: eL } = await supabase
        .from("prep_recipe_lines")
        .select("id,prep_recipe_id,ingredient_id,amount_per_1_pivot,unit,sort_order,ingredients(name,cost_per_unit)")
        .eq("prep_recipe_id", id)
        .order("sort_order", { ascending: true });

      if (eL) throw eL;

      const mapped: Line[] = (ln ?? []).map((x: any) => ({
        id: x.id,
        prep_recipe_id: x.prep_recipe_id,
        ingredient_id: x.ingredient_id,
        amount_per_1_pivot: Number(x.amount_per_1_pivot),
        unit: (x.unit ?? "g") as any,
        sort_order: Number(x.sort_order ?? 0),
        ingredient_name: x.ingredients?.name ?? "",
        ingredient_cost_per_unit: x.ingredients?.cost_per_unit ?? null,
      }));

      setLines(mapped);

      // defaults for add line
      const firstOther = ingList.find((z) => z.id !== rr.pivot_ingredient_id) ?? ingList[0];
      setNewIngredientId(firstOther?.id ?? "");
    } catch (e: any) {
      setError({ message: e?.message ?? "Erreur", details: e });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const saveRecipe = async () => {
    if (!recipe) return;
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
    } catch (e: any) {
      setError({ message: e?.message ?? "Erreur sauvegarde", details: e });
    } finally {
      setSaving(false);
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
      // ratio stocké = quantité / pivot
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

      const x: any = data;
      const added: Line = {
        id: x.id,
        prep_recipe_id: x.prep_recipe_id,
        ingredient_id: x.ingredient_id,
        amount_per_1_pivot: Number(x.amount_per_1_pivot),
        unit: (x.unit ?? "g") as any,
        sort_order: Number(x.sort_order ?? nextSort),
        ingredient_name: x.ingredients?.name ?? "",
        ingredient_cost_per_unit: x.ingredients?.cost_per_unit ?? null,
      };

      setLines((p) => [...(p ?? []), added]);
      setNewQtyForThisPivot("");
    } catch (e: any) {
      setError({ message: e?.message ?? "Erreur ajout ligne", details: e });
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
    } catch (e: any) {
      setError({ message: e?.message ?? "Erreur suppression", details: e });
    }
  };

  if (loading) {
    return (
      <main className="container">
        <TopNav />
        <p className="muted">Chargement…</p>
      </main>
    );
  }

  if (error && !recipe) {
    return (
      <main className="container">
        <TopNav />
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
        <TopNav />
        <p className="muted">Recette introuvable.</p>
        <button className="btn" type="button" onClick={() => router.replace("/prep")}>
          Retour
        </button>
      </main>
    );
  }

  // ---- UI styles (sans toucher le global CSS) ----
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

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    paddingRight: 34,
  };

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

  const qtyBigStyle: React.CSSProperties = {
    fontSize: 20,
    fontWeight: 950,
    letterSpacing: 0.2,
    whiteSpace: "nowrap",
  };

  return (
    <main className="container">
      <TopNav />

      {/* Header actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
        <button className="btn" type="button" onClick={() => router.replace("/prep")}>
          Retour
        </button>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="btn" type="button" onClick={() => setKitchenMode((v) => !v)}>
            {kitchenMode ? "Mode normal" : "Mode cuisine"}
          </button>

          <button className="btn btnPrimary" type="button" onClick={saveRecipe} disabled={saving}>
            {saving ? "Sauvegarde…" : "Sauvegarder"}
          </button>
        </div>
      </div>

      {/* Title centered */}
      <div style={{ marginTop: 10 }}>
        <h1 className="h1" style={bigTitleStyle}>
          {recipe.name?.trim() ? recipe.name : "Recette pivot"}
        </h1>
        <p className="muted" style={{ textAlign: "center", marginTop: 6 }}>
          Tu saisis des quantités réelles pour {pivotAmountNum || 0} {recipe.pivot_unit} de pivot. Le ratio est géré en
          arrière-plan.
        </p>
      </div>

      {error ? (
        <pre className="code" style={{ marginTop: 12 }}>
          {JSON.stringify(error, null, 2)}
        </pre>
      ) : null}

      {/* Card: Name + Pivot row */}
      <div className="card" style={{ ...cardStyle, marginTop: 12 }}>
        {/* Nom (plein largeur) */}
        <div style={{ marginBottom: 12 }}>
          <div style={labelStyle}>Nom de la recette</div>
          <input
            style={{ ...inputStyle, fontSize: 18, fontWeight: 700, textAlign: "center" }}
            value={recipe.name}
            onChange={(e) => setRecipe((p) => (p ? { ...p, name: e.target.value } : p))}
            placeholder="Nom de la recette"
          />
        </div>

        {/* Pivot (2 colonnes) */}
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

        {/* KPIs */}
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
              Poids total: {Math.round(computed.totalWeight)} {recipe.pivot_unit}
            </div>
          </div>

          <div style={kpiCard}>
            <div className="muted" style={{ fontSize: 12 }}>
              Coût / kg
            </div>
            <div style={{ fontSize: 22, fontWeight: 950 }}>{fmtKg(computed.costPerKg)}</div>
          </div>
        </div>
      </div>

      {/* Add line */}
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
          Exemple: pivot = 300g. Tu saisis Parmesan = 200 → le ratio stocké automatiquement = 200/300.
        </p>
      </div>

      {/* Composition */}
      <div className="card" style={{ ...cardStyle, marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>Composition</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              {computed.rows.length} ligne(s) — quantités calculées pour {pivotAmountNum || 0} {recipe.pivot_unit} de pivot
            </div>
          </div>

          <div style={{ fontSize: 14, fontWeight: 800 }}>
            Coût / kg: <span style={{ fontSize: 18 }}>{fmtKg(computed.costPerKg)}</span>
          </div>
        </div>

        {/* Header */}
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

        {/* Rows */}
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          {computed.rows.map((r: any) => (
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

                {/* Infos techniques masquées en mode cuisine */}
                {!kitchenMode ? (
                  <div className="muted" style={{ fontSize: 12 }}>
                    coût: {r.cpu != null ? `${Number(r.cpu).toFixed(6)} €/g` : "—"} · ratio:{" "}
                    {Number(r.amount_per_1_pivot).toFixed(6)} / 1 pivot
                  </div>
                ) : null}
              </div>

              <div style={{ textAlign: "right" }}>
                {kitchenMode ? (
                  <div style={qtyBigStyle}>
                    {Math.round(r.qty)} {recipe.pivot_unit}
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>{Math.round(r.qty)}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {recipe.pivot_unit}
                    </div>
                  </>
                )}
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 18, fontWeight: 950 }}>{fmtMoney(r.cost)}</div>

                {/* “calc: …” supprimé en mode cuisine */}
                {!kitchenMode ? (
                  <div className="muted" style={{ fontSize: 12 }}>
                    calc: {Math.round(r.qty)} {recipe.pivot_unit}
                  </div>
                ) : null}
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

        {/* Footer KPI strip */}
        <div
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 10,
          }}
        >
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
            <div style={{ fontSize: 20, fontWeight: 950 }}>{fmtKg(computed.costPerKg)}</div>
          </div>
        </div>
      </div>
    </main>
  );
}