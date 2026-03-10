"use client";

import { StepperInput } from "@/components/StepperInput";

const VAT_OPTIONS = [
  { value: 0.055, label: "5,5 %" },
  { value: 0.1,   label: "10 %" },
  { value: 0.2,   label: "20 %" },
];

function fmtMoney(v: number) {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function hexToRgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const kpiCard: React.CSSProperties = {
  background: "rgba(0,0,0,0.03)",
  borderRadius: 10,
  padding: "10px 12px",
};
const kpiLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#6f6a61",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  marginBottom: 3,
};
const kpiValue: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 900,
  color: "#2d2d2d",
};

interface Props {
  costPerKg?: number | null;
  costPerPortion?: number | null;
  portionLabel?: string;
  vatRate: number;
  onVatChange: (v: number) => void;
  marginRate: string;
  onMarginChange: (v: string) => void;
  sellPrice?: number | "";
  onSellPriceChange?: (v: number | "") => void;
  accentColor?: string;
}

export function PricingBlock({
  costPerKg,
  costPerPortion,
  portionLabel = "portion",
  vatRate,
  onVatChange,
  marginRate,
  onMarginChange,
  sellPrice,
  onSellPriceChange,
  accentColor = "#8B1A1A",
}: Props) {
  const marginPctNum = (() => {
    const n = Number(String(marginRate).replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  })();

  const m = Math.min(Math.max(marginPctNum, 0), 99.9) / 100;

  const pvKgHT = costPerKg && costPerKg > 0 && m < 1 ? costPerKg / (1 - m) : null;
  const pvKgTTC = pvKgHT ? pvKgHT * (1 + vatRate) : null;
  const pvPortionHT = costPerPortion && costPerPortion > 0 && m < 1 ? costPerPortion / (1 - m) : null;
  const pvPortionTTC = pvPortionHT ? pvPortionHT * (1 + vatRate) : null;

  // Effective sell price: manual > PV conseillé
  const sp = typeof sellPrice === "number" && sellPrice > 0 ? sellPrice : null;
  const effectivePrice = sp ?? pvPortionTTC;
  const isConseille = sp == null && pvPortionTTC != null;
  const margeBrute = effectivePrice != null && costPerPortion && costPerPortion > 0 ? effectivePrice - costPerPortion : null;
  const foodCostPct = effectivePrice != null && costPerPortion && costPerPortion > 0 ? (costPerPortion / effectivePrice) * 100 : null;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <div style={kpiCard}>
          <div style={kpiLabel}>Coût / kg</div>
          <div style={kpiValue}>{costPerKg ? fmtMoney(costPerKg) + " €" : "—"}</div>
        </div>
        <div style={kpiCard}>
          <div style={kpiLabel}>Coût / {portionLabel}</div>
          <div style={kpiValue}>{costPerPortion ? fmtMoney(costPerPortion) + " €" : "—"}</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <div>
          <label className="label">TVA vente</label>
          <div style={{ display: "flex", gap: 4 }}>
            {VAT_OPTIONS.map(opt => (
              <button
                key={opt.value} type="button" onClick={() => onVatChange(opt.value)}
                style={{
                  flex: 1, padding: "7px 0", borderRadius: 8, fontSize: 12, fontWeight: 700,
                  border: "1.5px solid",
                  borderColor: vatRate === opt.value ? accentColor : "rgba(217,199,182,0.9)",
                  background: vatRate === opt.value ? hexToRgba(accentColor, 0.08) : "rgba(255,255,255,0.7)",
                  color: vatRate === opt.value ? accentColor : "#6f6a61",
                  cursor: "pointer",
                }}
              >{opt.label}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Marge %</label>
          <StepperInput
            value={Number(marginRate) || ""}
            onChange={v => onMarginChange(String(v))}
            step={1} min={0} max={99}
          />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <div style={kpiCard}>
          <div style={kpiLabel}>Prix TTC / {portionLabel}</div>
          <div style={{ ...kpiValue, color: accentColor, fontStyle: isConseille ? "italic" : "normal" }}>
            {effectivePrice ? fmtMoney(effectivePrice) + " €" : "—"}
            {isConseille && <span style={{ fontSize: 11, fontWeight: 500, marginLeft: 4, color: "#6f6a61" }}>(conseillé)</span>}
          </div>
        </div>
        <div style={kpiCard}>
          <div style={kpiLabel}>PV conseillé / kg TTC</div>
          <div style={{ ...kpiValue, color: accentColor }}>
            {pvKgTTC ? fmtMoney(pvKgTTC) + " €" : "—"}
          </div>
        </div>
      </div>

      {onSellPriceChange && (
        <>
          <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 14, marginBottom: 14 }}>
            <label className="label">Prix de vente TTC (€)</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <StepperInput
                value={sellPrice ?? ""}
                onChange={v => onSellPriceChange!(v)}
                step={0.5} min={0}
                placeholder="ex: 12.00"
              />
              {pvPortionTTC != null && (
                <span style={{ fontSize: 11, fontStyle: "italic", color: "#8B1A1A", whiteSpace: "nowrap" }}>
                  conseillé : {fmtMoney(pvPortionTTC)} €
                </span>
              )}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={kpiCard}>
              <div style={kpiLabel}>Marge brute</div>
              <div style={{
                ...kpiValue,
                fontStyle: isConseille ? "italic" : "normal",
                color: margeBrute != null && !isConseille && margeBrute > 0 ? "#166534" : margeBrute != null && !isConseille && margeBrute < 0 ? "#DC2626" : "#2d2d2d",
              }}>
                {margeBrute != null ? fmtMoney(margeBrute) + " €" : "—"}
                {margeBrute != null && isConseille && <span style={{ fontSize: 11, fontWeight: 500, marginLeft: 4, color: "#6f6a61" }}>(conseillé)</span>}
              </div>
            </div>
            <div style={kpiCard}>
              <div style={kpiLabel}>Food cost</div>
              <div style={{
                ...kpiValue,
                fontStyle: isConseille ? "italic" : "normal",
                color: foodCostPct != null && !isConseille ? (foodCostPct <= 30 ? "#166534" : foodCostPct > 35 ? "#DC2626" : "#92400e") : "#2d2d2d",
              }}>
                {foodCostPct != null ? fmtMoney(foodCostPct) + " %" : "—"}
                {foodCostPct != null && isConseille && <span style={{ fontSize: 11, fontWeight: 500, marginLeft: 4, color: "#6f6a61" }}>(conseillé)</span>}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
