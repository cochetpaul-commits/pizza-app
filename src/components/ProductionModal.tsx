"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";

/* ── Types ── */

type RecipeType = "pizza" | "cuisine" | "cocktail" | "empatement";

type ProdLine = {
  ingredient_id: string | null;
  name: string;
  qty: number;
  unit: string;
};

interface Props {
  recipeType: RecipeType;
  recipeId: string;
  recipeName: string;
  pivotIngredientId: string;
  onClose: () => void;
}

/* ── Table mapping ── */

const LINE_TABLES: Record<RecipeType, string> = {
  pizza: "pizza_ingredients",
  cuisine: "kitchen_recipe_lines",
  cocktail: "cocktail_ingredients",
  empatement: "recipe_ingredients",
};

const LINE_FK: Record<RecipeType, string> = {
  pizza: "pizza_id",
  cuisine: "recipe_id",
  cocktail: "cocktail_id",
  empatement: "recipe_id",
};

const MULTIPLIERS = [1, 2, 3, 5, 10];

/* ── Component ── */

export default function ProductionModal({ recipeType, recipeId, recipeName, pivotIngredientId, onClose }: Props) {
  const [lines, setLines] = useState<ProdLine[]>([]);
  const [pivotName, setPivotName] = useState("");
  const [loading, setLoading] = useState(true);
  const [prodQty, setProdQty] = useState<number | "">("");
  const [checked, setChecked] = useState<Set<string>>(new Set());

  // Load lines + ingredient names
  useEffect(() => {
    (async () => {
      setLoading(true);
      const table = LINE_TABLES[recipeType];
      const fk = LINE_FK[recipeType];

      const { data: rawLines } = await supabase
        .from(table)
        .select("ingredient_id, qty, unit")
        .eq(fk, recipeId)
        .order("sort_order");

      const validLines = (rawLines ?? []).filter(
        (l: Record<string, unknown>) => l.ingredient_id && l.qty && Number(l.qty) > 0
      );

      const ingIds = validLines.map((l: Record<string, unknown>) => String(l.ingredient_id));
      const { data: ings } = await supabase
        .from("ingredients")
        .select("id, name")
        .in("id", ingIds.length > 0 ? ingIds : ["__none__"]);

      const ingMap = new Map<string, string>();
      for (const ing of ings ?? []) {
        ingMap.set(ing.id, ing.name);
      }

      const mapped: ProdLine[] = validLines.map((l: Record<string, unknown>) => ({
        ingredient_id: String(l.ingredient_id ?? ""),
        name: ingMap.get(String(l.ingredient_id ?? "")) ?? "?",
        qty: Number(l.qty),
        unit: normalizeUnit(String(l.unit ?? "g")),
      }));

      setLines(mapped);
      setPivotName(ingMap.get(pivotIngredientId) ?? "Pivot");
      setLoading(false);
    })();
  }, [recipeType, recipeId, pivotIngredientId]);

  const pivotLine = lines.find(l => l.ingredient_id === pivotIngredientId);
  const baseQty = pivotLine?.qty ?? 0;

  const factor = useMemo(() => {
    if (!baseQty || prodQty === "" || Number(prodQty) <= 0) return null;
    return Number(prodQty) / baseQty;
  }, [baseQty, prodQty]);

  const scaledLines = useMemo(() => {
    return lines.map(l => ({
      ...l,
      scaledQty: factor !== null ? Math.round(l.qty * factor) : l.qty,
    }));
  }, [lines, factor]);

  const nonPivotLines = useMemo(() =>
    scaledLines.filter(l => l.ingredient_id !== pivotIngredientId),
    [scaledLines, pivotIngredientId]
  );

  const totalWeight = useMemo(() => {
    return scaledLines
      .filter(l => l.unit === "g")
      .reduce((acc, l) => acc + l.scaledQty, 0);
  }, [scaledLines]);

  const handleStep = (delta: number) => {
    const step = pivotLine?.unit === "g" ? 100 : 1;
    const current = typeof prodQty === "number" ? prodQty : baseQty;
    const next = Math.max(0, current + delta * step);
    setProdQty(next);
  };

  const handleMultiplier = (m: number) => {
    setProdQty(baseQty * m);
  };

  const toggleCheck = useCallback((id: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Print — uses @media print CSS to hide everything except modal content (iOS-safe)
  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const checkedCount = nonPivotLines.filter(l => checked.has(l.ingredient_id ?? "")).length;

  return (
    <div
      data-production-print
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 0,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", height: "100%", maxWidth: 600,
          background: "#f2ede4",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* ── Header ── */}
        <div style={{
          background: "#4a6741", color: "#fff",
          padding: "14px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: 1.5, opacity: 0.7, marginBottom: 2,
            }}>
              Production
            </div>
            <div style={{
              fontSize: 20, fontWeight: 700,
              fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
              textTransform: "uppercase", letterSpacing: 0.5,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {recipeName}
            </div>
          </div>
          <div data-print-hide style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            {!loading && pivotLine && (
              <button
                type="button"
                onClick={handlePrint}
                style={{
                  background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)",
                  color: "#fff", fontSize: 12, fontWeight: 600,
                  padding: "6px 14px", borderRadius: 8, cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Imprimer
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "rgba(255,255,255,0.15)", border: "none",
                color: "#fff", fontSize: 20, width: 36, height: 36,
                borderRadius: "50%", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              &#x2715;
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#999" }}>Chargement...</div>
          ) : !pivotLine ? (
            <div style={{ textAlign: "center", padding: 40, color: "#999", fontSize: 14 }}>
              Aucun ingredient pivot trouve dans la recette.
            </div>
          ) : (
            <>
              {/* Pivot card */}
              <div style={{
                background: "#FFFBEB", border: "2px solid #D97706",
                borderRadius: 16, padding: "20px 20px 16px",
                marginBottom: 16,
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: "#D97706",
                  textTransform: "uppercase", letterSpacing: 1, marginBottom: 8,
                }}>
                  Ingredient pivot
                </div>
                <div style={{
                  fontSize: 18, fontWeight: 800, color: "#1a1a1a",
                  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                  textTransform: "uppercase", marginBottom: 16,
                }}>
                  {pivotName}
                </div>

                {/* Print: show pivot qty as plain text */}
                <div className="print-pivot-qty" style={{ display: "none" }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color: "#1a1a1a" }}>
                    {prodQty === "" ? baseQty : Number(prodQty)} {pivotLine.unit}
                  </span>
                </div>

                {/* Stepper */}
                <div data-print-hide style={{ display: "flex", alignItems: "center", gap: 0 }}>
                  <button
                    type="button"
                    onClick={() => handleStep(-1)}
                    style={{
                      width: 52, height: 52, borderRadius: "12px 0 0 12px",
                      border: "2px solid #ddd6c8", borderRight: "none",
                      background: "#fff", fontSize: 24, fontWeight: 700,
                      color: "#1a1a1a", cursor: "pointer",
                    }}
                  >
                    &minus;
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={prodQty}
                    onChange={e => {
                      const v = e.target.value;
                      setProdQty(v === "" ? "" : Number(v));
                    }}
                    placeholder={String(baseQty)}
                    style={{
                      width: 100, height: 52, textAlign: "center",
                      border: "2px solid #ddd6c8", borderLeft: "none", borderRight: "none",
                      fontSize: 22, fontWeight: 700, color: "#1a1a1a",
                      fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                      outline: "none", background: "#fff",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleStep(1)}
                    style={{
                      width: 52, height: 52, borderRadius: "0 12px 12px 0",
                      border: "2px solid #ddd6c8", borderLeft: "none",
                      background: "#fff", fontSize: 24, fontWeight: 700,
                      color: "#1a1a1a", cursor: "pointer",
                    }}
                  >
                    +
                  </button>
                  <span style={{
                    marginLeft: 12, fontSize: 18, fontWeight: 600, color: "#6f6a61",
                  }}>
                    {pivotLine.unit}
                  </span>
                </div>

                {/* Multipliers */}
                <div data-print-hide style={{ display: "flex", gap: 6, marginTop: 12 }}>
                  {MULTIPLIERS.map(m => {
                    const isActive = prodQty === baseQty * m;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => handleMultiplier(m)}
                        style={{
                          padding: "5px 12px", borderRadius: 8,
                          border: isActive ? "2px solid #D97706" : "1.5px solid #ddd6c8",
                          background: isActive ? "#D97706" : "#fff",
                          color: isActive ? "#fff" : "#1a1a1a",
                          fontSize: 13, fontWeight: 700, cursor: "pointer",
                          transition: "all 0.15s",
                        }}
                      >
                        x{m}
                      </button>
                    );
                  })}
                </div>

                <div data-print-hide style={{ fontSize: 12, color: "#999", marginTop: 10 }}>
                  Recette de base : {baseQty} {pivotLine.unit}
                </div>
              </div>

              {/* Progress */}
              {nonPivotLines.length > 0 && (
                <div data-print-hide style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  marginBottom: 10, padding: "0 4px",
                }}>
                  <span style={{ fontSize: 12, color: "#999", fontWeight: 600 }}>
                    {checkedCount}/{nonPivotLines.length} pese{checkedCount > 1 ? "s" : ""}
                  </span>
                  {checkedCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setChecked(new Set())}
                      style={{
                        fontSize: 11, color: "#D4775A", fontWeight: 600,
                        background: "none", border: "none", cursor: "pointer",
                      }}
                    >
                      Reinitialiser
                    </button>
                  )}
                </div>
              )}

              {/* Ingredient list */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {nonPivotLines.map((l, i) => {
                  const id = l.ingredient_id ?? String(i);
                  const isChecked = checked.has(id);
                  return (
                    <div
                      key={id}
                      onClick={() => toggleCheck(id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={e => e.key === "Enter" && toggleCheck(id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "12px 14px",
                        background: isChecked ? "#e8f5e3" : i % 2 === 0 ? "#fff" : "#faf8f4",
                        borderRadius: 12,
                        border: isChecked ? "1.5px solid #4a6741" : "1px solid #e5ddd0",
                        cursor: "pointer",
                        transition: "all 0.15s",
                        opacity: isChecked ? 0.7 : 1,
                      }}
                    >
                      {/* Checkbox */}
                      <div style={{
                        width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                        border: isChecked ? "2px solid #4a6741" : "2px solid #ccc",
                        background: isChecked ? "#4a6741" : "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.15s",
                      }}>
                        {isChecked && (
                          <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                            <path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>

                      {/* Name */}
                      <span style={{
                        fontSize: 15, fontWeight: 500, color: "#1a1a1a",
                        flex: 1, minWidth: 0,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        textDecoration: isChecked ? "line-through" : "none",
                      }}>
                        {l.name}
                      </span>

                      {/* Qty */}
                      <span style={{
                        fontSize: 20, fontWeight: 700, color: "#1a1a1a",
                        fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                        flexShrink: 0,
                        whiteSpace: "nowrap",
                      }}>
                        {l.scaledQty}
                        <span style={{ fontSize: 14, fontWeight: 500, color: "#999", marginLeft: 4 }}>
                          {l.unit}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* ── Footer: total weight ── */}
        {!loading && totalWeight > 0 && (
          <div style={{
            flexShrink: 0,
            background: "#4a6741", color: "#fff",
            padding: "14px 20px",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontSize: 14, fontWeight: 600, opacity: 0.85 }}>
              Poids total estime
            </span>
            <span style={{
              fontSize: 22, fontWeight: 700,
              fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
            }}>
              {totalWeight} g
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Helpers ── */

function normalizeUnit(u: string): string {
  const low = u.toLowerCase().trim();
  if (low === "g" || low === "gr" || low === "gramme" || low === "grammes") return "g";
  if (low === "cl" || low === "centilitre") return "cL";
  if (low === "ml" || low === "millilitre") return "cL";
  if (low === "pcs" || low === "piece" || low === "pieces" || low === "pc" || low === "u") return "pcs";
  if (low === "kg") return "kg";
  if (low === "l" || low === "litre") return "L";
  return u;
}
