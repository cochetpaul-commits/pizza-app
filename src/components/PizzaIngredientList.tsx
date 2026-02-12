"use client";

import { useMemo } from "react";
import type { Ingredient, PizzaIngredientRow, UnitType } from "@/lib/types";

function n2(v: unknown) {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

function fmtMoney(v: number) {
  return n2(v).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function tmpId() {
  return `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeUnit(u: unknown): UnitType {
  const s = String(u ?? "").trim().toLowerCase();
  const allowed: UnitType[] = ["g", "ml", "pcs", "pinch", "dash"];
  return allowed.includes(s as UnitType) ? (s as UnitType) : "g";
}

type Row = PizzaIngredientRow & {
  qty: number | "";
  _locked?: boolean;
  _label?: string | null;
};

type Props = {
  stage: "pre" | "post";
  ingredients: Ingredient[];
  rows: PizzaIngredientRow[];
  onChange: (rows: PizzaIngredientRow[]) => void;
  priceByIngredient?: Record<string, { g?: number; ml?: number; pcs?: number }>;
};

export default function PizzaIngredientList(props: Props) {
  const { stage, ingredients, rows, onChange, priceByIngredient } = props;

  const stageRows = useMemo(() => {
    return ((rows ?? []) as Row[])
      .filter((r) => r.stage === stage)
      .slice()
      .sort((a, b) => n2(a.sort_order) - n2(b.sort_order));
  }, [rows, stage]);

  const card = {
    background: "#efe2d3",
    border: "1px solid #d9c7b6",
    borderRadius: 16,
    padding: 14,
  } as const;

  const input = {
    width: "100%",
    height: 36,
    borderRadius: 10,
    border: "1px solid #d9c7b6",
    padding: "0 10px",
    fontSize: 15,
    background: "#fff",
    color: "#2f3a33",
  } as const;

  const btn = {
    height: 36,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid #d9c7b6",
    background: "#fff",
    color: "#2f3a33",
    fontWeight: 900 as const,
    cursor: "pointer",
  };

  const btnPrimary = {
    ...btn,
    background: "#c97a5a",
    border: "1px solid #c97a5a",
    color: "#fff",
  };

  const addRow = () => {
    const firstId = ingredients?.[0]?.id ?? "";
    if (!firstId) return;

    const nextSort = stageRows.length > 0 ? Math.max(...stageRows.map((r) => n2(r.sort_order))) + 1 : 0;

    const row: Row = {
      id: tmpId(),
      ingredient_id: firstId,
      qty: "",
      unit: "g",
      stage,
      sort_order: nextSort,
    };

    onChange([...(rows ?? []), row] as PizzaIngredientRow[]);
  };

  const delRow = (id: string) => {
    onChange((rows ?? []).filter((r) => r.id !== id));
  };

  const updateRow = (id: string, patch: Partial<PizzaIngredientRow>) => {
    const next = (rows ?? []).map((r) => (r.id === id ? ({ ...r, ...patch } as PizzaIngredientRow) : r));
    onChange(next);
  };

  const ingredientName = (ingredientId: string) => {
    const ing = ingredients.find((x) => x.id === ingredientId) ?? null;
    const nm = (ing as unknown as { name?: unknown })?.name;
    return String(nm ?? "—");
  };

  const costPerUnit = (r: Row) => {
    const ing = ingredients.find((x) => String(x.id) === String(r.ingredient_id)) ?? null;
    const id = String(r.ingredient_id ?? "");
    const unit = normalizeUnit(r.unit);

    const fromOffers = priceByIngredient ? priceByIngredient[id] : undefined;
    const cpuFromOffers = unit === "ml" ? fromOffers?.ml : unit === "pcs" ? fromOffers?.pcs : fromOffers?.g;
    if (typeof cpuFromOffers === "number") return n2(cpuFromOffers);

    const fb = (ing as unknown as { cost_per_unit?: unknown })?.cost_per_unit;
    return n2(fb);
  };

  const rowCost = (r: Row) => {
    const qty = typeof r.qty === "number" ? r.qty : n2(r.qty);
    return qty * costPerUnit(r);
  };

  return (
    <div style={{ ...card }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 950 }}>Composition</div>
        <div style={{ color: "#6f6a61", fontSize: 12, fontWeight: 900 }}>{stageRows.length} ligne(s)</div>
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
        {stageRows.map((r) => {
          const locked = Boolean(r?._locked);
          const label = locked ? String(r?._label ?? ingredientName(r.ingredient_id)) : ingredientName(r.ingredient_id);
          const rowId = typeof r.id === "string" ? r.id : "";
          if (!rowId) return null;

          return (
            <div
              key={rowId}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 110px 90px 110px auto",
                gap: 10,
                alignItems: "center",
                padding: "10px 10px",
                border: "1px solid #d9c7b6",
                borderRadius: 12,
                background: "#fff",
              }}
            >
              {locked ? (
                <div style={{ fontWeight: 950 }}>{label}</div>
              ) : (
                <select
                  style={{ ...input, height: 36, padding: "0 10px", fontWeight: 950 }}
                  value={String(r.ingredient_id ?? "")}
                  onChange={(e) => updateRow(rowId, { ingredient_id: e.target.value })}
                >
                  {ingredients.map((i) => (
                    <option key={i.id} value={i.id}>
                      {String((i as { name?: unknown }).name ?? "—")}
                    </option>
                  ))}
                </select>
              )}

              <input
                style={{ ...input, height: 36, textAlign: "center", fontWeight: 950 }}
                inputMode="decimal"
                value={r.qty === "" ? "" : String(r.qty)}
                disabled={locked}
                onChange={(e) => {
                  const t = e.target.value.trim();
                  if (!t) return updateRow(rowId, { qty: "" as unknown as number });
                  const n = Number(t.replace(",", "."));
                  updateRow(rowId, { qty: Number.isFinite(n) ? n : ("" as unknown as number) });
                }}
              />

              <select
                style={{ ...input, height: 36, padding: "0 10px", fontWeight: 950 }}
                value={normalizeUnit(r.unit)}
                disabled={locked}
                onChange={(e) => updateRow(rowId, { unit: e.target.value as UnitType })}
              >
                <option value="g">g</option>
                <option value="ml">ml</option>
                <option value="pcs">pcs</option>
                <option value="pinch">pinch</option>
                <option value="dash">dash</option>
              </select>

              <div style={{ textAlign: "right", fontWeight: 950 }}>{fmtMoney(rowCost(r))}</div>

              {locked ? (
                <button type="button" disabled style={{ ...btn, opacity: 0.4, cursor: "not-allowed" }}>
                  —
                </button>
              ) : (
                <button type="button" onClick={() => delRow(rowId)} style={btn}>
                  Supprimer
                </button>
              )}
            </div>
          );
        })}

        {stageRows.length === 0 ? <div style={{ color: "#6f6a61", fontWeight: 900 }}>Aucune ligne</div> : null}
      </div>

      <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
        <button type="button" onClick={addRow} style={btnPrimary}>
          + Ajouter
        </button>
      </div>
    </div>
  );
}