"use client";

import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Ingredient, PizzaIngredientRow, UnitType } from "@/lib/types";
import { SmartSelect } from "@/components/SmartSelect";

function n2(v: unknown) {
  const x = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : 0;
}

function fmtMoney(v: number) {
  return n2(v).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

function fmtKg2(v: number) {
  return n2(v).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €/kg";
}

function tmpId() {
  return `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeUnit(u: unknown): UnitType {
  const s = String(u ?? "").trim().toLowerCase();
  if (s === "pc") return "pcs";
  const allowed: UnitType[] = ["g", "ml", "pcs", "pinch", "dash"];
  return allowed.includes(s as UnitType) ? (s as UnitType) : "g";
}

type Row = PizzaIngredientRow & {
  qty: number | "";
  _locked?: boolean;
  _label?: string | null;
};

type OfferMeta = {
  density_kg_per_l?: number | null; // kg/L
  piece_weight_g?: number | null;   // g
};

type CpuMap = { g?: number; ml?: number; pcs?: number };

type Props = {
  stage: "pre" | "post";
  ingredients: Ingredient[];
  rows: PizzaIngredientRow[];
  onChange: (rows: PizzaIngredientRow[]) => void;
  priceByIngredient?: Record<string, CpuMap>;
  offerMetaByIngredient?: Record<string, OfferMeta>;
  supplierByIngredient?: Record<string, string | null>;
  currentPath?: string;
};

export default function PizzaIngredientList(props: Props) {
  const { stage, ingredients, rows, onChange, priceByIngredient, offerMetaByIngredient, supplierByIngredient, currentPath } = props;
  const router = useRouter();

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

  const updateRow = (id: string, patch: Partial<PizzaIngredientRow>) => {
    const next = (rows ?? []).map((r) => (r.id === id ? ({ ...r, ...patch } as PizzaIngredientRow) : r));
    onChange(next);
  };

  const delRow = (id: string) => {
    onChange((rows ?? []).filter((r) => r.id !== id));
  };

  const addRow = () => {
    const nextSort = stageRows.length > 0 ? Math.max(...stageRows.map((r) => n2(r.sort_order))) + 1 : 0;

    const row: Row = {
      id: tmpId(),
      ingredient_id: "",
      qty: "",
      unit: "g",
      stage,
      sort_order: nextSort,
    };

    onChange([...(rows ?? []), row] as PizzaIngredientRow[]);
  };

  // CPU "effectif" selon l’unité demandée (conversion ml<->g via densité, pcs<->g via poids pièce)
  const effectiveCpu = (ingredientId: string, unit: UnitType): number => {
    const id = String(ingredientId ?? "");
    if (!id) return 0;

    const cpu = priceByIngredient?.[id] ?? {};
    const meta = offerMetaByIngredient?.[id] ?? {};
    const density = typeof meta.density_kg_per_l === "number" ? meta.density_kg_per_l : null; // kg/L
    const pieceG = typeof meta.piece_weight_g === "number" ? meta.piece_weight_g : null; // g

    if (unit === "g") {
      if (typeof cpu.g === "number" && cpu.g > 0) return cpu.g;
      if (typeof cpu.ml === "number" && cpu.ml > 0 && density && density > 0) {
        // €/g = (€/ml) / (kg/L)  (car 1 ml = 0.001 L)
        return cpu.ml / density;
      }
      if (typeof cpu.pcs === "number" && cpu.pcs > 0 && pieceG && pieceG > 0) {
        return cpu.pcs / pieceG;
      }
      return 0;
    }

    if (unit === "ml") {
      if (typeof cpu.ml === "number" && cpu.ml > 0) return cpu.ml;
      if (typeof cpu.g === "number" && cpu.g > 0 && density && density > 0) {
        // €/ml = €/g * (kg/L)
        return cpu.g * density;
      }
      return 0;
    }

    if (unit === "pcs") {
      if (typeof cpu.pcs === "number" && cpu.pcs > 0) return cpu.pcs;
      if (typeof cpu.g === "number" && cpu.g > 0 && pieceG && pieceG > 0) {
        return cpu.g * pieceG;
      }
      if (typeof cpu.ml === "number" && cpu.ml > 0 && density && density > 0 && pieceG && pieceG > 0) {
        // €/pcs = €/g * g/pièce, avec €/g = €/ml / density
        const eurPerG = cpu.ml / density;
        return eurPerG * pieceG;
      }
      return 0;
    }

    // pinch/dash -> fallback: on tente g
    return effectiveCpu(id, "g");
  };

  const costPerUnit = (r: Row) => {
    const ing = ingredients.find((x) => String(x.id) === String(r.ingredient_id)) ?? null;
    const id = String(r.ingredient_id ?? "");
    const unit = normalizeUnit(r.unit);

    const fromOffers = effectiveCpu(id, unit);
    if (fromOffers > 0) return fromOffers;

    const fb = (ing as unknown as { cost_per_unit?: unknown })?.cost_per_unit;
    return n2(fb);
  };

  const rowCost = (r: Row) => {
    const qty = typeof r.qty === "number" ? r.qty : n2(r.qty);
    return qty * costPerUnit(r);
  };

  const eurPerKgFromCpu = useCallback(
  (id: string) => {
    const cpu = priceByIngredient?.[id];
    if (!cpu) return null;

    if (typeof cpu.g === "number" && cpu.g > 0) return cpu.g * 1000;

    const meta = offerMetaByIngredient?.[id] ?? {};
    const density = typeof meta.density_kg_per_l === "number" ? meta.density_kg_per_l : null;
    const pieceG = typeof meta.piece_weight_g === "number" ? meta.piece_weight_g : null;

    if (typeof cpu.ml === "number" && cpu.ml > 0) {
      if (!density || density <= 0) return null;
      const eurPerL = cpu.ml * 1000;
      return eurPerL / density;
    }

    if (typeof cpu.pcs === "number" && cpu.pcs > 0) {
      if (!pieceG || pieceG <= 0) return null;
      return cpu.pcs / (pieceG / 1000);
    }

    return null;
  },
  [priceByIngredient, offerMetaByIngredient]
);

  const options = useMemo(() => {
    return (ingredients ?? []).map((i) => {
      const id = String(i.id);
      const eurPerKg = eurPerKgFromCpu(id);

      return {
        id,
        name: String(i.name ?? ""),
        category: (i as unknown as { category?: string | null })?.category ?? null,
        rightTop: supplierByIngredient?.[id] ?? null,
        rightBottom: eurPerKg ? fmtKg2(eurPerKg) : null,
        isPreparation: (i as unknown as { category?: string | null })?.category === "preparation" || (i as unknown as { category?: string | null })?.category === "recette",
      };
    });
  }, [ingredients, supplierByIngredient, eurPerKgFromCpu]);

  return (
    <div style={{ ...card }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 950 }}>Composition</div>
        <div style={{ color: "#6f6a61", fontSize: 12, fontWeight: 900 }}>{stageRows.length} ligne(s)</div>
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
        {stageRows.map((r) => {
          const locked = Boolean(r?._locked);
          const rowId = typeof r.id === "string" ? r.id : "";
          if (!rowId) return null;

          const gridCols = "2fr 110px 90px 110px auto";

          return (
            <div
              key={rowId}
              style={{
                display: "grid",
                gridTemplateColumns: gridCols,
                gap: 10,
                alignItems: "center",
                padding: "10px 10px",
                border: "1px solid #d9c7b6",
                borderRadius: 12,
                background: "#fff",
              }}
            >
              {locked ? (
                <div style={{ fontWeight: 950 }}>{String(r?._label ?? "—")}</div>
              ) : (
                <SmartSelect
                  key={`row-ing-${rowId}-${String(r.ingredient_id ?? "")}-${options.length}`}
                  options={options}
                  value={String(r.ingredient_id ?? "")}
                  onChange={(v) => updateRow(rowId, { ingredient_id: v })}
                  onAfterSelect={() => { const el = document.getElementById(`qty-${rowId}`); if (el) (el as HTMLInputElement).focus(); }}
                  placeholder="Tape pour chercher…"
                  inputStyle={{ ...input, height: 36, fontWeight: 950, fontSize: 16 }}
                />
              )}

              <input
                id={`qty-${rowId}`}
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
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    title="Modifier l'ingrédient"
                    style={{ ...btn, fontSize: 16, padding: "0 10px" }}
                    onClick={() => {
                      const back = currentPath ?? "/pizzas/new";
                      router.push(`/ingredients?edit=${r.ingredient_id}&back=${encodeURIComponent(back)}`);
                    }}
                  >
                    →
                  </button>
                  <button type="button" onClick={() => delRow(rowId)} style={btn}>
                    Supprimer
                  </button>
                </div>
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