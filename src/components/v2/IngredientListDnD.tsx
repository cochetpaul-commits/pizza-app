"use client";

import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { SmartSelect, type SmartSelectOption } from "@/components/SmartSelect";
import type { Ingredient } from "@/types/ingredients";
import type { CpuByUnit } from "@/lib/offerPricing";

export interface IngredientLine {
  id: string;
  ingredient_id: string;
  qty: number | "";
  unit: string;
  sort_order: number;
}

interface Props {
  droppableId?: string;
  items: IngredientLine[];
  ingredients: Ingredient[];
  priceByIngredient: Record<string, CpuByUnit>;
  units: string[];
  onChange: (items: IngredientLine[]) => void;
  priceLabelByIngredient?: Record<string, string>;
  /** id of the pivot ingredient; shows ★/☆ on each row */
  pivotId?: string | null;
  onPivotChange?: (id: string | null) => void;
}

function tmpId() {
  return `tmp-${Math.random().toString(36).slice(2)}`;
}

function fmtMoney(v: number) {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function computeCost(line: IngredientLine, cpu: CpuByUnit | undefined): number | null {
  if (!cpu || line.qty === "" || !(Number(line.qty) > 0)) return null;
  const qty = Number(line.qty);
  const unit = line.unit.toLowerCase();
  if ((unit === "g" || unit === "kg") && cpu.g) {
    return cpu.g * (unit === "kg" ? qty * 1000 : qty);
  }
  if ((unit === "ml" || unit === "cl" || unit === "l") && cpu.ml) {
    const factor = unit === "cl" ? 10 : unit === "l" ? 1000 : 1;
    return cpu.ml * qty * factor;
  }
  if ((unit === "pc" || unit === "pcs") && cpu.pcs) {
    return cpu.pcs * qty;
  }
  // fallback: try g then ml
  if (cpu.g && (unit === "g" || unit === "kg")) return cpu.g * qty;
  return null;
}

export function IngredientListDnD({
  droppableId = "ingredients",
  items, ingredients, priceByIngredient, units, onChange, priceLabelByIngredient,
  pivotId, onPivotChange,
}: Props) {
  const ingredientOptions: SmartSelectOption[] = ingredients.map(i => {
    const isMaison = i.source === "recette_maison";
    let rightBottom = priceLabelByIngredient?.[i.id] ?? undefined;
    if (isMaison && i.purchase_price && i.purchase_price > 0) {
      rightBottom = `maison · ${i.purchase_price.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/kg`;
    }
    return { id: i.id, name: i.name, category: i.category, rightBottom, isPreparation: isMaison };
  });

  function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    const reordered = Array.from(items);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    onChange(reordered.map((item, i) => ({ ...item, sort_order: i })));
  }

  function updateLine(id: string, patch: Partial<IngredientLine>) {
    onChange(items.map(item => item.id === id ? { ...item, ...patch } : item));
  }

  function removeLine(id: string) {
    onChange(items.filter(item => item.id !== id).map((item, i) => ({ ...item, sort_order: i })));
  }

  function addLine() {
    onChange([...items, {
      id: tmpId(),
      ingredient_id: "",
      qty: "",
      unit: units[0] ?? "g",
      sort_order: items.length,
    }]);
  }

  return (
    <div>
      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId={droppableId}>
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((line, i) => {
                const cpu = priceByIngredient[line.ingredient_id];
                const cost = computeCost(line, cpu);

                return (
                  <Draggable key={line.id} draggableId={line.id} index={i}>
                    {(drag, snapshot) => (
                      <div
                        ref={drag.innerRef}
                        {...drag.draggableProps}
                        style={{
                          display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
                          background: snapshot.isDragging ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.55)",
                          borderRadius: 10, padding: "8px 10px",
                          border: "1px solid rgba(217,199,182,0.7)",
                          ...drag.draggableProps.style,
                        }}
                      >
                        {/* Handle */}
                        <span
                          {...drag.dragHandleProps}
                          style={{ fontSize: 16, color: "#b0a89a", cursor: "grab", userSelect: "none", flexShrink: 0 }}
                        >⠿</span>

                        {/* Pivot star */}
                        {onPivotChange && (
                          <button
                            type="button"
                            onClick={() => {
                              if (!line.ingredient_id) return;
                              onPivotChange(pivotId === line.ingredient_id ? null : line.ingredient_id);
                            }}
                            title="Définir comme ingrédient pivot"
                            style={{
                              background: "none", border: "none", flexShrink: 0,
                              fontSize: 16, padding: "0 1px", lineHeight: 1,
                              cursor: line.ingredient_id ? "pointer" : "default",
                              color: line.ingredient_id && pivotId === line.ingredient_id ? "#D97706" : "#ccc",
                            }}
                          >
                            {line.ingredient_id && pivotId === line.ingredient_id ? "★" : "☆"}
                          </button>
                        )}

                        {/* Ingredient select */}
                        <div style={{ flex: "1 1 160px", minWidth: 140 }}>
                          <SmartSelect
                            options={ingredientOptions}
                            value={line.ingredient_id}
                            onChange={id => updateLine(line.id, { ingredient_id: id })}
                            placeholder="Ingrédient…"
                            inputStyle={{ height: 34, fontSize: 13 }}
                          />
                        </div>

                        {/* Qty */}
                        <input
                          type="number"
                          value={line.qty}
                          min={0}
                          step="any"
                          onChange={e => {
                            const v = e.target.value === "" ? "" : parseFloat(e.target.value);
                            updateLine(line.id, { qty: v as number | "" });
                          }}
                          placeholder="Qté"
                          style={{
                            width: 72, height: 34, borderRadius: 8,
                            border: "1px solid rgba(217,199,182,0.8)", padding: "0 8px",
                            fontSize: 14, background: "rgba(255,255,255,0.8)",
                          }}
                        />

                        {/* Unit */}
                        <select
                          value={line.unit}
                          onChange={e => updateLine(line.id, { unit: e.target.value })}
                          style={{
                            height: 34, borderRadius: 8, padding: "0 6px",
                            border: "1px solid rgba(217,199,182,0.8)", fontSize: 13,
                            background: "rgba(255,255,255,0.8)",
                          }}
                        >
                          {units.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>

                        {/* Cost display */}
                        <span style={{ fontSize: 12, color: cost != null ? "#166534" : "#9a8f84", fontWeight: 700, minWidth: 60, flexShrink: 0 }}>
                          {cost != null ? `${fmtMoney(cost)} €` : "—"}
                        </span>

                        {/* Remove */}
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          style={{
                            flexShrink: 0, width: 28, height: 28, borderRadius: 7,
                            border: "1px solid rgba(217,199,182,0.8)",
                            background: "rgba(255,255,255,0.5)", color: "#9a8f84",
                            fontSize: 12, cursor: "pointer", display: "flex",
                            alignItems: "center", justifyContent: "center",
                          }}
                        >✕</button>
                      </div>
                    )}
                  </Draggable>
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>

      <button
        type="button"
        onClick={addLine}
        style={{
          marginTop: 10, padding: "6px 14px", borderRadius: 8,
          border: "1.5px dashed rgba(217,199,182,0.9)", background: "transparent",
          color: "#6f6a61", fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}
      >+ Ajouter un ingrédient</button>
    </div>
  );
}
