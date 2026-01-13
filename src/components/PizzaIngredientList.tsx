"use client";

import React from "react";
import type {
  Ingredient,
  IngredientStage,
  PizzaIngredientRow,
  UnitType,
} from "@/lib/types";
import { ALL_UNITS, UNIT_LABELS } from "@/lib/units";

function nextSortOrder(rows: PizzaIngredientRow[]) {
  if (!rows.length) return 0;
  return Math.max(...rows.map((r) => r.sort_order ?? 0)) + 1;
}

type Props = {
  title: string;
  stage: IngredientStage;
  ingredients: Ingredient[];
  rows: PizzaIngredientRow[];
  onChange: (rows: PizzaIngredientRow[]) => void;
};

export default function PizzaIngredientList({
  title,
  stage,
  ingredients,
  rows,
  onChange,
}: Props) {
  const stageRows = rows
    .filter((r) => r.stage === stage)
    .sort((a, b) => a.sort_order - b.sort_order);

  function updateRow(idx: number, patch: Partial<PizzaIngredientRow>) {
    const globalIndex = rows.findIndex((r) => r === stageRows[idx]);
    if (globalIndex === -1) return;

    const updated = [...rows];
    updated[globalIndex] = { ...updated[globalIndex], ...patch };
    onChange(updated);
  }

  function addRow() {
    const newRow: PizzaIngredientRow = {
      ingredient_id: null,
      qty: "",
      unit: "g",
      stage,
      sort_order: nextSortOrder(stageRows),
    };
    onChange([...rows, newRow]);
  }

  function removeRow(idx: number) {
    const target = stageRows[idx];
    onChange(rows.filter((r) => r !== target));
  }

  // empêcher doublons dans la section
  const usedIds = new Set(
    stageRows.map((r) => r.ingredient_id).filter(Boolean) as string[]
  );

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <h3 style={{ margin: 0 }}>{title}</h3>
        <button type="button" onClick={addRow} style={{ padding: "8px 12px" }}>
          + Ajouter
        </button>
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {stageRows.map((row, idx) => {
          const ingredientOptions = ingredients
            .filter((i) => i.is_active)
            .filter((i) => row.ingredient_id === i.id || !usedIds.has(i.id));

          return (
            <div
              key={`${stage}-${idx}-${row.sort_order}`}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 110px 110px 110px",
                gap: 10,
                alignItems: "center",
              }}
            >
              <select
                value={row.ingredient_id ?? ""}
                onChange={(e) => {
                  const selected = ingredients.find((i) => i.id === e.target.value);
                  updateRow(idx, {
                    ingredient_id: e.target.value || null,
                    unit: (selected?.default_unit ?? "g") as UnitType,
                  });
                }}
                style={{ padding: 10, borderRadius: 10 }}
              >
                <option value="">— Choisir un ingrédient —</option>
                {ingredientOptions.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>

              <input
                inputMode="decimal"
                placeholder="Qté"
                value={row.qty}
                onChange={(e) => {
                  const v = e.target.value.replace(",", ".");
                  const n = v === "" ? "" : Number(v);
                  updateRow(idx, { qty: Number.isFinite(n as number) ? (n as number) : "" });
                }}
                style={{ padding: 10, borderRadius: 10 }}
              />

              <select
                value={row.unit}
                onChange={(e) => updateRow(idx, { unit: e.target.value as UnitType })}
                style={{ padding: 10, borderRadius: 10 }}
              >
                {ALL_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {UNIT_LABELS[u]}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => removeRow(idx)}
                style={{ padding: "8px 12px" }}
              >
                Supprimer
              </button>
            </div>
          );
        })}

        {!stageRows.length && (
          <div style={{ opacity: 0.7 }}>Aucune ligne. Clique “+ Ajouter”.</div>
        )}
      </div>
    </div>
  );
}
