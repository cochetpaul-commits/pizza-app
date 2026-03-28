"use client";

import { useMemo, useState } from "react";
import type { CpuByUnit } from "@/lib/offerPricing";
import type { Ingredient } from "@/types/ingredients";
import { fetchApi } from "@/lib/fetchApi";

// ── Types ────────────────────────────────────────────────────

interface IngLine {
  ingredient_id: string;
  qty: number | "";
  unit: string;
}

export interface GestionFoodCostProps {
  recipeId: string;
  recipeType: "cuisine" | "pizza" | "cocktail" | "empatement";
  lines: IngLine[];
  ingredients: Ingredient[];
  priceByIngredient: Record<string, CpuByUnit>;
  supplierByIngredient?: Record<string, string | null>;
  totalCost: number;
  sellPrice: number | null;
  onSellPriceChange: (price: number) => void;
  portionsCount?: number | null;
  yieldGrams?: number | null;
}

// ── Helpers ──────────────────────────────────────────────────

function resolveCost(cpu: CpuByUnit | undefined, qty: number, unit: string): number | null {
  if (!cpu || qty <= 0) return null;
  const u = unit.toLowerCase();
  if (u === "g" && cpu.g) return cpu.g * qty;
  if (u === "kg" && cpu.g) return cpu.g * qty * 1000;
  if (u === "cl" && cpu.ml) return cpu.ml * qty * 10;
  if (u === "ml" && cpu.ml) return cpu.ml * qty;
  if ((u === "pcs" || u === "pc") && cpu.pcs) return cpu.pcs * qty;
  if (u === "l" && cpu.ml) return cpu.ml * qty * 1000;
  return null;
}

function fmtEur(n: number) {
  return n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
}

function round2(n: number) { return Math.round(n * 100) / 100; }

// ── Component ────────────────────────────────────────────────

export function GestionFoodCost({
  recipeId, recipeType, lines, ingredients, priceByIngredient,
  supplierByIngredient, totalCost, sellPrice, onSellPriceChange,
  portionsCount, yieldGrams,
}: GestionFoodCostProps) {

  const [localSellPrice, setLocalSellPrice] = useState(sellPrice ?? 0);
  const [saving, setSaving] = useState(false);
  const [multiplier, setMultiplier] = useState(1);

  const ingMap = useMemo(() => {
    const m = new Map<string, Ingredient>();
    for (const i of ingredients) m.set(i.id, i);
    return m;
  }, [ingredients]);

  // Build line details
  const lineDetails = useMemo(() => {
    return lines
      .filter((l) => l.ingredient_id && l.qty !== "" && Number(l.qty) > 0)
      .map((l) => {
        const ing = ingMap.get(l.ingredient_id);
        const cpu = priceByIngredient[l.ingredient_id];
        const qty = Number(l.qty);
        const cost = resolveCost(cpu, qty, l.unit);
        const rendement = ing?.rendement ?? 1;
        const adjustedCost = cost != null && rendement < 1 ? cost / rendement : cost;
        const supplier = supplierByIngredient?.[l.ingredient_id] ?? null;
        const isSubRecipe = ing?.source === "recette_maison";

        return {
          id: l.ingredient_id,
          name: ing?.name ?? "?",
          supplier,
          qty,
          unit: l.unit,
          cpuLabel: cpu ? formatCpu(cpu, l.unit) : null,
          cost: adjustedCost != null ? round2(adjustedCost) : null,
          rendement,
          isSubRecipe,
        };
      });
  }, [lines, ingMap, priceByIngredient, supplierByIngredient]);

  const computedTotal = useMemo(() =>
    lineDetails.reduce((s, l) => s + (l.cost ?? 0), 0),
  [lineDetails]);

  const effectiveTotal = computedTotal > 0 ? computedTotal : totalCost;
  const costPerPortion = portionsCount && portionsCount > 0 ? effectiveTotal / portionsCount : effectiveTotal;

  // Food cost simulation
  const sp = localSellPrice > 0 ? localSellPrice : null;
  const foodCostPct = sp ? (costPerPortion / sp) * 100 : null;
  const margeBrute = sp ? sp - costPerPortion : null;
  const prixTTC = sp ? sp * 1.1 : null;
  const prixMiniFC32 = costPerPortion > 0 ? round2(costPerPortion / 0.32) : null;

  const fcColor = foodCostPct == null ? "#999"
    : foodCostPct <= 28 ? "#16a34a"
    : foodCostPct <= 32 ? "#D97706"
    : "#DC2626";

  async function saveSellPrice(price: number) {
    setSaving(true);
    await fetchApi(`/api/recettes/${recipeId}/sell-price`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sell_price: price, recipe_type: recipeType }),
    });
    onSellPriceChange(price);
    setSaving(false);
  }

  // Sort by cost descending for visual impact
  const sortedLines = useMemo(() =>
    [...lineDetails].sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0)),
  [lineDetails]);

  // Top cost ingredient percentage
  const topCostPct = sortedLines.length > 0 && effectiveTotal > 0 && sortedLines[0].cost
    ? (sortedLines[0].cost / effectiveTotal) * 100
    : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Header + multiplier ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
            Detail des couts
          </span>
          {yieldGrams && yieldGrams > 0 && (
            <span style={{ fontWeight: 400, color: "#999", marginLeft: 10, fontSize: 12 }}>
              Rendement : {(yieldGrams / 1000).toFixed(2)} kg
            </span>
          )}
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "#fff", padding: "4px 10px", borderRadius: 8,
          border: "1px solid #e8e2d8",
        }}>
          <span style={{ fontSize: 11, color: "#888" }}>Portions</span>
          <select
            value={multiplier}
            onChange={(e) => setMultiplier(Number(e.target.value))}
            style={{
              padding: "3px 6px", borderRadius: 6, border: "1px solid #ddd6c8",
              fontSize: 12, background: "#fff", fontWeight: 600,
            }}
          >
            {[1, 2, 5, 10, 20, 50].map((n) => (
              <option key={n} value={n}>{n}x</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Ingredient cost table ── */}
      <div style={{
        background: "#fff", borderRadius: 14, overflow: "hidden",
        boxShadow: "0 1px 6px rgba(0,0,0,0.04)",
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "linear-gradient(135deg, #f9f5ef 0%, #f2ede4 100%)" }}>
              <th style={thS}>Ingredient</th>
              <th style={thS}>Fournisseur</th>
              <th style={{ ...thS, textAlign: "right" }}>Qte</th>
              <th style={{ ...thS, textAlign: "right" }}>Perte</th>
              <th style={{ ...thS, textAlign: "right" }}>EUR/unite</th>
              <th style={{ ...thS, textAlign: "right" }}>Cout</th>
            </tr>
          </thead>
          <tbody>
            {sortedLines.map((l, idx) => {
              const pctOfTotal = effectiveTotal > 0 && l.cost ? (l.cost / effectiveTotal) * 100 : 0;
              return (
                <tr key={l.id} style={{
                  borderBottom: "1px solid #f0ebe2",
                  background: idx % 2 === 0 ? "#fff" : "#fdfbf8",
                }}>
                  <td style={tdS}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontWeight: 600, color: "#1a1a1a" }}>{l.name}</span>
                      {l.isSubRecipe && (
                        <span style={{
                          fontSize: 8, fontWeight: 800, padding: "1px 5px",
                          borderRadius: 4, background: "rgba(124,58,237,0.10)", color: "#7C3AED",
                        }}>S/R</span>
                      )}
                    </div>
                    {/* Mini cost bar */}
                    {pctOfTotal > 0 && (
                      <div style={{ marginTop: 3, height: 2, borderRadius: 1, background: "#f0ebe2", width: "80%" }}>
                        <div style={{
                          height: "100%", borderRadius: 1,
                          width: `${Math.min(pctOfTotal, 100)}%`,
                          background: pctOfTotal > 30 ? "#D4775A" : "#D4775A80",
                          transition: "width 0.3s",
                        }} />
                      </div>
                    )}
                  </td>
                  <td style={{ ...tdS, color: "#888", fontSize: 11 }}>{l.supplier ?? "-"}</td>
                  <td style={{ ...tdS, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#555" }}>
                    {round2(l.qty * multiplier)} {l.unit}
                  </td>
                  <td style={{ ...tdS, textAlign: "right" }}>
                    {l.rendement < 1 ? (
                      <span style={{
                        color: "#D97706", fontWeight: 600, fontSize: 10,
                        background: "rgba(217,119,6,0.08)", padding: "2px 5px", borderRadius: 4,
                      }}>
                        -{Math.round((1 - l.rendement) * 100)}%
                      </span>
                    ) : <span style={{ color: "#ccc" }}>-</span>}
                  </td>
                  <td style={{ ...tdS, textAlign: "right", color: "#888", fontVariantNumeric: "tabular-nums", fontSize: 11 }}>
                    {l.cpuLabel ?? "-"}
                  </td>
                  <td style={{ ...tdS, textAlign: "right", fontWeight: 700, color: "#D4775A", fontVariantNumeric: "tabular-nums" }}>
                    {l.cost != null ? fmtEur(l.cost * multiplier) : "-"}
                  </td>
                </tr>
              );
            })}

            {/* Total row */}
            <tr style={{ background: "linear-gradient(135deg, #f2ede4 0%, #ebe5da 100%)" }}>
              <td colSpan={5} style={{ ...tdS, fontWeight: 700, color: "#1a1a1a", fontSize: 13 }}>
                Total cout matiere
                {sortedLines.length > 0 && topCostPct > 20 && (
                  <span style={{ fontWeight: 400, fontSize: 10, color: "#999", marginLeft: 8 }}>
                    ({sortedLines[0].name} = {topCostPct.toFixed(0)}%)
                  </span>
                )}
              </td>
              <td style={{
                ...tdS, textAlign: "right", fontWeight: 700,
                color: "#D4775A", fontSize: 15,
                fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
              }}>
                {fmtEur(effectiveTotal * multiplier)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Simulation prix de vente ── */}
      <div style={{
        borderRadius: 14, overflow: "hidden",
        boxShadow: "0 1px 6px rgba(0,0,0,0.04)",
        background: "#fff",
      }}>
        {/* Header with gradient */}
        <div style={{
          padding: "14px 20px",
          background: "linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)",
          color: "#fff",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.3 }}>
            Simulation prix de vente
          </span>
          {saving && <span style={{ fontSize: 10, opacity: 0.6 }}>Enregistrement...</span>}
        </div>

        <div style={{ padding: "20px" }}>
          {/* Price slider */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "#888", fontWeight: 500 }}>Prix de vente HT</span>
              <span style={{
                fontSize: 24, fontWeight: 700, color: "#1a1a1a",
                fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
              }}>
                {localSellPrice > 0 ? fmtEur(localSellPrice) : "-"}
              </span>
            </div>
            <input
              type="range"
              min={2} max={50} step={0.25}
              value={localSellPrice}
              onChange={(e) => setLocalSellPrice(Number(e.target.value))}
              onMouseUp={() => saveSellPrice(localSellPrice)}
              onTouchEnd={() => saveSellPrice(localSellPrice)}
              style={{ width: "100%", accentColor: "#D4775A" }}
            />
          </div>

          {/* FC progress bar */}
          {foodCostPct != null && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: "#888", fontWeight: 500 }}>Food cost</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: fcColor, fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
                  {foodCostPct.toFixed(1)}%
                </span>
              </div>
              <div style={{ height: 10, background: "#f0ebe2", borderRadius: 5, overflow: "hidden", position: "relative" }}>
                {/* 32% marker */}
                <div style={{
                  position: "absolute", left: "32%", top: 0, bottom: 0, width: 2,
                  background: "rgba(0,0,0,0.15)", zIndex: 1,
                }} />
                <div style={{
                  height: "100%", borderRadius: 5, transition: "width 0.3s ease",
                  width: `${Math.min(foodCostPct, 100)}%`,
                  background: `linear-gradient(90deg, ${fcColor}cc, ${fcColor})`,
                }} />
              </div>
              <div style={{ fontSize: 9, color: "#bbb", marginTop: 3, textAlign: "right" }}>
                objectif 32%
              </div>
            </div>
          )}

          {/* KPI grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <SimKpiCard
              label="Cout revient"
              value={fmtEur(costPerPortion)}
              accent="#D4775A"
            />
            <SimKpiCard
              label="Marge brute"
              value={margeBrute != null ? fmtEur(margeBrute) : "-"}
              accent="#16a34a"
            />
            <SimKpiCard
              label="Prix TTC (10%)"
              value={prixTTC != null ? fmtEur(prixTTC) : "-"}
              accent="#1a1a1a"
            />
            <SimKpiCard
              label="Prix mini FC 32%"
              value={prixMiniFC32 != null ? fmtEur(prixMiniFC32) : "-"}
              accent="#D97706"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

function SimKpiCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{
      padding: "12px 14px", borderRadius: 10,
      background: "#faf8f5",
      borderLeft: `3px solid ${accent}`,
      display: "flex", flexDirection: "column", gap: 3,
    }}>
      <span style={{ fontSize: 10, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>
        {label}
      </span>
      <span style={{ fontSize: 17, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
        {value}
      </span>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────

const thS: React.CSSProperties = {
  padding: "10px 12px", fontSize: 10, fontWeight: 700, color: "#999",
  textTransform: "uppercase", letterSpacing: 0.5, textAlign: "left",
  borderBottom: "1.5px solid #ddd6c8", whiteSpace: "nowrap",
};

const tdS: React.CSSProperties = {
  padding: "10px 12px", verticalAlign: "middle",
};

function formatCpu(cpu: CpuByUnit, unit: string): string {
  const u = unit.toLowerCase();
  if ((u === "g" || u === "kg") && cpu.g) return `${(cpu.g * 1000).toFixed(2)}/kg`;
  if ((u === "cl" || u === "ml" || u === "l") && cpu.ml) return `${(cpu.ml * 1000).toFixed(2)}/L`;
  if ((u === "pcs" || u === "pc") && cpu.pcs) return `${cpu.pcs.toFixed(2)}/pc`;
  if (cpu.g) return `${(cpu.g * 1000).toFixed(2)}/kg`;
  if (cpu.ml) return `${(cpu.ml * 1000).toFixed(2)}/L`;
  if (cpu.pcs) return `${cpu.pcs.toFixed(2)}/pc`;
  return "-";
}
