"use client";

import { useState, useCallback } from "react";
import { StepperInput } from "@/components/StepperInput";

/* ── Helpers ── */

function fmtMoney(v: number) {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const VAT_OPTIONS = [
  { value: 0.055, label: "5,5 %" },
  { value: 0.1,   label: "10 %" },
  { value: 0.2,   label: "20 %" },
];

const UNIT_OPTIONS = [
  { value: "cl", label: "cl" },
  { value: "L", label: "L" },
  { value: "ml", label: "ml" },
  { value: "kg", label: "kg" },
  { value: "g", label: "g" },
  { value: "unit", label: "unité" },
];

/* ── Styles ── */

const kpiCard: React.CSSProperties = {
  background: "rgba(0,0,0,0.03)", borderRadius: 10, padding: "10px 12px",
};
const kpiLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "#6f6a61",
  textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3,
};
const kpiValue: React.CSSProperties = {
  fontSize: 20, fontWeight: 900, color: "#2d2d2d",
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 10,
  border: "1.5px solid #ddd6c8", background: "#fff", fontSize: 14, outline: "none",
};
const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: "#666", marginBottom: 4, display: "block",
};
const selectStyle: React.CSSProperties = {
  ...inputStyle, height: 44, appearance: "none" as const,
  WebkitAppearance: "none" as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 12px center",
  paddingRight: 32,
};

/* ── Props ── */

interface Props {
  /** Cost computed from recipe ingredients (per portion) */
  costPerPortion?: number | null;
  /** Cost per kg (cuisine only) */
  costPerKg?: number | null;
  /** Label for portion (cocktail, portion, pizza...) */
  portionLabel?: string;
  /** Show dose simulator inputs (for liquids: cocktails, sauces) */
  showDoseSimulator?: boolean;
  /** TVA rate */
  vatRate: number;
  onVatChange: (v: number) => void;
  /** Margin % */
  marginRate: string;
  onMarginChange: (v: string) => void;
  /** Manual sell price TTC */
  sellPrice?: number | "";
  onSellPriceChange?: (v: number | "") => void;
  /** Accent color */
  accentColor?: string;
}

export function PricingModule({
  costPerPortion,
  costPerKg,
  portionLabel = "portion",
  showDoseSimulator = false,
  vatRate,
  onVatChange,
  marginRate,
  onMarginChange,
  sellPrice,
  onSellPriceChange,
  accentColor = "#D4775A",
}: Props) {
  /* ── Dose simulator state ── */
  const prefillValue = showDoseSimulator && costPerPortion && costPerPortion > 0 ? costPerPortion.toFixed(2) : "";
  const [prixAchat, setPrixAchat] = useState(prefillValue);
  const [didPrefill, setDidPrefill] = useState(prefillValue !== "");
  const [volume, setVolume] = useState("");
  const [unite, setUnite] = useState("cl");
  const [volDose, setVolDose] = useState("");

  // Pre-fill prix d'achat when costPerPortion becomes available (once)
  if (showDoseSimulator && costPerPortion && costPerPortion > 0 && !didPrefill && !prixAchat) {
    setPrixAchat(costPerPortion.toFixed(2));
    setDidPrefill(true);
  }

  const pa = parseFloat(prixAchat) || 0;
  const vol = parseFloat(volume) || 0;
  const dose = parseFloat(volDose) || 0;
  const nbPortions = vol > 0 && dose > 0 ? Math.floor(vol / dose) : 0;
  const coutDose = nbPortions > 0 ? pa / nbPortions : 0;

  /* ── Cost source: recipe cost OR dose cost ── */
  const effectiveCost = costPerPortion && costPerPortion > 0 ? costPerPortion : coutDose > 0 ? coutDose : 0;

  /* ── Margin & pricing ── */
  const marginPctNum = (() => {
    const n = Number(String(marginRate).replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  })();
  const m = Math.min(Math.max(marginPctNum, 0), 99.9) / 100;

  const pvPortionHT = effectiveCost > 0 && m < 1 ? effectiveCost / (1 - m) : null;
  const pvPortionTTC = pvPortionHT ? pvPortionHT * (1 + vatRate) : null;
  const pvKgHT = costPerKg && costPerKg > 0 && m < 1 ? costPerKg / (1 - m) : null;
  const pvKgTTC = pvKgHT ? pvKgHT * (1 + vatRate) : null;

  /* ── Effective sell price ── */
  const sp = typeof sellPrice === "number" && sellPrice > 0 ? sellPrice : null;
  const effectivePrice = sp ?? pvPortionTTC;
  const isConseille = sp == null && pvPortionTTC != null;
  const effectivePriceHT = effectivePrice ? effectivePrice / (1 + vatRate) : null;
  const effectiveCoeff = effectivePriceHT && effectiveCost > 0 ? effectivePriceHT / effectiveCost : null;
  const margeBrute = effectivePriceHT != null && effectiveCost > 0 ? effectivePriceHT - effectiveCost : null;
  const foodCostPct = effectivePriceHT != null && effectiveCost > 0 ? (effectiveCost / effectivePriceHT) * 100 : null;

  /* ── Preset food cost ── */
  const pvForFoodCost = useCallback((targetPct: number) => {
    if (effectiveCost <= 0) return null;
    const pvHT = effectiveCost / (targetPct / 100);
    return Math.round(pvHT * (1 + vatRate) * 100) / 100;
  }, [effectiveCost, vatRate]);

  const fcColor = (fc: number | null) =>
    fc == null ? "#999" : fc <= 25 ? "#16a34a" : fc <= 30 ? "#4a6741" : fc <= 35 ? "#D97706" : "#DC2626";

  return (
    <>
      {/* ── Dose simulator (liquids only) ── */}
      {showDoseSimulator && (
        <>
          <p style={{ fontSize: 13, color: "#777", margin: "0 0 14px" }}>
            Calculez le cout par dose depuis un conditionnement (bouteille, bidon...).
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px 1fr", gap: 10, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Prix d&apos;achat (EUR)</label>
              <input style={inputStyle} value={prixAchat} onChange={e => setPrixAchat(e.target.value)}
                placeholder="Ex: 18.50" type="number" step="0.01" min="0" />
            </div>
            <div>
              <label style={labelStyle}>Volume / Conditionnement</label>
              <input style={inputStyle} value={volume} onChange={e => setVolume(e.target.value)}
                placeholder="Ex: 75" type="number" step="0.1" min="0" />
            </div>
            <div>
              <label style={labelStyle}>Unite</label>
              <select style={selectStyle} value={unite} onChange={e => setUnite(e.target.value)}>
                {UNIT_OPTIONS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Volume dose</label>
              <input style={inputStyle} value={volDose} onChange={e => setVolDose(e.target.value)}
                placeholder="Ex: 12" type="number" step="0.1" min="0" />
            </div>
          </div>

          {coutDose > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div style={kpiCard}>
                <div style={kpiLabel}>Nb portions</div>
                <div style={kpiValue}>{nbPortions}</div>
              </div>
              <div style={kpiCard}>
                <div style={kpiLabel}>Cout / dose</div>
                <div style={{ ...kpiValue, color: accentColor }}>{fmtMoney(coutDose)} \u20AC</div>
              </div>
            </div>
          )}

          {costPerPortion && costPerPortion > 0 && (
            <div style={{ height: 1, background: "rgba(0,0,0,0.06)", margin: "0 0 14px" }} />
          )}
        </>
      )}

      {/* ── Cost display ── */}
      <div style={{ display: "grid", gridTemplateColumns: costPerKg ? "1fr 1fr" : "1fr", gap: 10, marginBottom: 14 }}>
        {costPerKg != null && costPerKg > 0 && (
          <div style={kpiCard}>
            <div style={kpiLabel}>Cout / kg</div>
            <div style={kpiValue}>{fmtMoney(costPerKg)} \u20AC</div>
          </div>
        )}
        <div style={kpiCard}>
          <div style={kpiLabel}>Cout / {portionLabel}</div>
          <div style={kpiValue}>{effectiveCost > 0 ? fmtMoney(effectiveCost) + " \u20AC" : "\u2014"}</div>
        </div>
      </div>

      {/* ── TVA dropdown + Marge % ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>TVA vente</label>
          <select
            style={selectStyle}
            value={vatRate}
            onChange={e => onVatChange(parseFloat(e.target.value))}
          >
            {VAT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Marge %</label>
          <StepperInput
            value={Number(marginRate) || ""}
            onChange={v => onMarginChange(String(v))}
            step={1} min={0} max={99}
          />
        </div>
      </div>

      {/* ── Coefficient + PV TTC ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <div style={kpiCard}>
          <div style={kpiLabel}>Coefficient</div>
          <div style={{ ...kpiValue, color: accentColor }}>
            {effectiveCoeff ? "x" + effectiveCoeff.toFixed(2) : "\u2014"}
          </div>
        </div>
        <div style={kpiCard}>
          <div style={kpiLabel}>Prix TTC / {portionLabel}</div>
          <div style={{ ...kpiValue, color: accentColor, fontStyle: isConseille ? "italic" : "normal" }}>
            {effectivePrice ? fmtMoney(effectivePrice) + " \u20AC" : "\u2014"}
            {isConseille && <span style={{ fontSize: 11, fontWeight: 500, marginLeft: 4, color: "#6f6a61" }}>(conseille)</span>}
          </div>
        </div>
      </div>

      {/* ── Quick presets ── */}
      {onSellPriceChange && effectiveCost > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {[25, 30, 35].map(pct => {
            const pv = pvForFoodCost(pct);
            return (
              <button key={pct} type="button"
                onClick={() => pv && onSellPriceChange!(pv)}
                style={{
                  flex: 1, padding: "8px 4px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                  border: `1.5px solid ${accentColor}30`, background: `${accentColor}08`,
                  color: accentColor, cursor: pv ? "pointer" : "default",
                  opacity: pv ? 1 : 0.4, textAlign: "center", lineHeight: 1.3,
                }}>
                Objectif {pct}% FC
                {pv && <div style={{ fontSize: 12, fontWeight: 800, marginTop: 2 }}>{fmtMoney(pv)} \u20AC</div>}
              </button>
            );
          })}
        </div>
      )}

      {/* ── PV kg conseille ── */}
      {pvKgTTC && (
        <div style={{ marginBottom: 14 }}>
          <div style={kpiCard}>
            <div style={kpiLabel}>PV conseille / kg TTC</div>
            <div style={{ ...kpiValue, color: accentColor }}>{fmtMoney(pvKgTTC)} \u20AC</div>
          </div>
        </div>
      )}

      {/* ── Manual sell price + results ── */}
      {onSellPriceChange && (
        <>
          <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 14, marginBottom: 14 }}>
            <label style={labelStyle}>Prix de vente TTC (\u20AC)</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <StepperInput
                value={sellPrice ?? ""}
                onChange={v => onSellPriceChange!(v)}
                step={0.5} min={0}
                placeholder="ex: 12.00"
              />
              {pvPortionTTC != null && (
                <span style={{ fontSize: 11, fontStyle: "italic", color: accentColor, whiteSpace: "nowrap" }}>
                  conseille : {fmtMoney(pvPortionTTC)} \u20AC
                </span>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={kpiCard}>
              <div style={kpiLabel}>Marge brute</div>
              <div style={{
                ...kpiValue, fontStyle: isConseille ? "italic" : "normal",
                color: margeBrute != null && !isConseille && margeBrute > 0 ? "#4a6741" : margeBrute != null && !isConseille && margeBrute < 0 ? "#8B1A1A" : "#2d2d2d",
              }}>
                {margeBrute != null ? fmtMoney(margeBrute) + " \u20AC" : "\u2014"}
              </div>
            </div>
            <div style={kpiCard}>
              <div style={kpiLabel}>Food cost</div>
              <div style={{
                ...kpiValue, fontStyle: isConseille ? "italic" : "normal",
                color: fcColor(foodCostPct != null && !isConseille ? foodCostPct : null),
              }}>
                {foodCostPct != null ? foodCostPct.toFixed(1) + " %" : "\u2014"}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
