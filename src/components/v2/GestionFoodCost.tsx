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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Multiplier */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>
          Detail des couts
          {yieldGrams && yieldGrams > 0 && (
            <span style={{ fontWeight: 400, color: "#999", marginLeft: 8 }}>
              Rendement : {(yieldGrams / 1000).toFixed(2)} kg
            </span>
          )}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "#999" }}>Portions</span>
          <select
            value={multiplier}
            onChange={(e) => setMultiplier(Number(e.target.value))}
            style={{
              padding: "4px 8px", borderRadius: 6, border: "1px solid #ddd6c8",
              fontSize: 12, background: "#fff",
            }}
          >
            {[1, 2, 5, 10, 20, 50].map((n) => (
              <option key={n} value={n}>{n}x</option>
            ))}
          </select>
        </div>
      </div>

      {/* Ingredient cost table */}
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #ddd6c8", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#f9f5ef" }}>
              <th style={thS}>Ingredient</th>
              <th style={thS}>Fournisseur</th>
              <th style={{ ...thS, textAlign: "right" }}>Qte</th>
              <th style={{ ...thS, textAlign: "right" }}>Perte</th>
              <th style={{ ...thS, textAlign: "right" }}>EUR/unite</th>
              <th style={{ ...thS, textAlign: "right" }}>Cout</th>
            </tr>
          </thead>
          <tbody>
            {lineDetails.map((l) => (
              <tr key={l.id} style={{ borderBottom: "1px solid #f0ebe2" }}>
                <td style={tdS}>
                  <span style={{ fontWeight: 600, color: "#1a1a1a" }}>{l.name}</span>
                  {l.isSubRecipe && (
                    <span style={{
                      marginLeft: 6, fontSize: 9, fontWeight: 800, padding: "1px 5px",
                      borderRadius: 4, background: "rgba(124,58,237,0.10)", color: "#7C3AED",
                    }}>S/R</span>
                  )}
                </td>
                <td style={{ ...tdS, color: "#666" }}>{l.supplier ?? "-"}</td>
                <td style={{ ...tdS, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {round2(l.qty * multiplier)} {l.unit}
                </td>
                <td style={{ ...tdS, textAlign: "right" }}>
                  {l.rendement < 1 ? (
                    <span style={{ color: "#D97706", fontWeight: 600 }}>
                      -{Math.round((1 - l.rendement) * 100)}%
                    </span>
                  ) : "-"}
                </td>
                <td style={{ ...tdS, textAlign: "right", color: "#666", fontVariantNumeric: "tabular-nums" }}>
                  {l.cpuLabel ?? "-"}
                </td>
                <td style={{ ...tdS, textAlign: "right", fontWeight: 700, color: "#D4775A", fontVariantNumeric: "tabular-nums" }}>
                  {l.cost != null ? fmtEur(l.cost * multiplier) : "-"}
                </td>
              </tr>
            ))}

            {/* Total row */}
            <tr style={{ background: "#f2ede4" }}>
              <td colSpan={5} style={{ ...tdS, fontWeight: 700, color: "#1a1a1a" }}>
                Total cout matiere
              </td>
              <td style={{ ...tdS, textAlign: "right", fontWeight: 700, color: "#D4775A", fontSize: 14 }}>
                {fmtEur(effectiveTotal * multiplier)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Simulation prix */}
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #ddd6c8", padding: "16px 18px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>
          Simulation prix de vente
        </div>

        {/* Slider */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "#999" }}>Prix de vente HT</span>
            <span style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", fontFamily: "Oswald, sans-serif" }}>
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
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: "#999" }}>Food cost</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: fcColor }}>
                {foodCostPct.toFixed(1)}%
              </span>
            </div>
            <div style={{ height: 8, background: "#f0ebe2", borderRadius: 4, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 4, transition: "width 0.2s",
                width: `${Math.min(foodCostPct, 100)}%`,
                background: fcColor,
              }} />
            </div>
          </div>
        )}

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <KpiCard label="Cout revient" value={fmtEur(costPerPortion)} />
          <KpiCard label="Marge brute" value={margeBrute != null ? fmtEur(margeBrute) : "-"} />
          <KpiCard label="Prix TTC (10%)" value={prixTTC != null ? fmtEur(prixTTC) : "-"} />
          <KpiCard label="Prix mini FC 32%" value={prixMiniFC32 != null ? fmtEur(prixMiniFC32) : "-"} />
        </div>

        {saving && <div style={{ fontSize: 11, color: "#999", marginTop: 8, textAlign: "right" }}>Enregistrement...</div>}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: "10px 12px", background: "#f9f5ef", borderRadius: 8,
      display: "flex", flexDirection: "column", gap: 2,
    }}>
      <span style={{ fontSize: 10, color: "#999", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>
        {label}
      </span>
      <span style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", fontFamily: "Oswald, sans-serif" }}>
        {value}
      </span>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────

const thS: React.CSSProperties = {
  padding: "8px 10px", fontSize: 10, fontWeight: 700, color: "#999",
  textTransform: "uppercase", letterSpacing: 0.5, textAlign: "left",
  borderBottom: "1.5px solid #ddd6c8", whiteSpace: "nowrap",
};

const tdS: React.CSSProperties = {
  padding: "8px 10px", verticalAlign: "middle",
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
