"use client";

import { useState } from "react";
import { SmartSelect, type SmartSelectOption } from "@/components/SmartSelect";
import type { Ingredient } from "@/types/ingredients";
import type { IngredientLine } from "./IngredientListDnD";

interface Props {
  items: IngredientLine[];
  ingredients: Ingredient[];
  enabled: boolean;
  onToggle: (v: boolean) => void;
}

function fmtQty(v: number) {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

export function PivotPanel({ items, ingredients, enabled, onToggle }: Props) {
  const [pivotId, setPivotId] = useState("");
  const [pivotQty, setPivotQty] = useState<number | "">("");

  const ingredientOptions: SmartSelectOption[] = ingredients.map(i => ({
    id: i.id, name: i.name, category: i.category,
  }));

  const pivotLine = items.find(l => l.ingredient_id === pivotId);
  const factor = pivotLine && pivotLine.qty !== "" && Number(pivotLine.qty) > 0 && typeof pivotQty === "number" && pivotQty > 0
    ? pivotQty / Number(pivotLine.qty)
    : null;

  const ingById = new Map(ingredients.map(i => [i.id, i]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Toggle */}
      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => onToggle(e.target.checked)}
          style={{ width: 18, height: 18, cursor: "pointer" }}
        />
        <span style={{ fontWeight: 700, fontSize: 14 }}>Mode Pivot</span>
        <span style={{ fontSize: 12, color: "#9a8f84" }}>— calcul proportionnel à la volée</span>
      </label>

      {enabled && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 160px", minWidth: 140 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#6f6a61", display: "block", marginBottom: 4 }}>
                Ingrédient de référence
              </label>
              <SmartSelect
                options={ingredientOptions}
                value={pivotId}
                onChange={setPivotId}
                placeholder="Choisir un ingrédient…"
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#6f6a61", display: "block", marginBottom: 4 }}>
                Quantité
              </label>
              <input
                type="number"
                value={pivotQty}
                min={0}
                step="any"
                onChange={e => setPivotQty(e.target.value === "" ? "" : parseFloat(e.target.value))}
                placeholder="ex: 100"
                style={{
                  width: 100, height: 36, borderRadius: 8,
                  border: "1px solid rgba(217,199,182,0.8)", padding: "0 10px",
                  fontSize: 14, background: "rgba(255,255,255,0.8)",
                }}
              />
            </div>
          </div>

          {factor != null && items.length > 0 && (
            <div style={{ background: "rgba(0,0,0,0.03)", borderRadius: 10, padding: 12, border: "1px solid rgba(217,199,182,0.6)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#6f6a61", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Pour {typeof pivotQty === "number" ? fmtQty(pivotQty) : "?"} {pivotLine?.unit} de {ingById.get(pivotId)?.name}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {items
                  .filter(l => l.ingredient_id && l.qty !== "" && Number(l.qty) > 0)
                  .map(l => {
                    const ing = ingById.get(l.ingredient_id);
                    const scaledQty = Number(l.qty) * factor;
                    return (
                      <div key={l.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                        <span style={{ color: "#2f3a33", fontWeight: 600 }}>{ing?.name ?? l.ingredient_id}</span>
                        <span style={{ fontWeight: 800, color: "#D4775A" }}>
                          {fmtQty(scaledQty)} {l.unit}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
