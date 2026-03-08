"use client";

interface Props {
  costPerKg?: number | null;
  costPerPortion?: number | null;
  costPerBall?: number | null;
  portionsLabel?: string;
  vatRate: number;
  onVatChange: (v: number) => void;
  coefficient: number;
  onCoeffChange: (v: number) => void;
}

const VAT_OPTIONS = [
  { value: 0.055, label: "5,5 %" },
  { value: 0.1,   label: "10 %" },
  { value: 0.2,   label: "20 %" },
];

function fmtMoney(v: number) {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function suggestedPrice(costHT: number, coeff: number, vatRate: number) {
  const pvHT = costHT * coeff;
  return pvHT * (1 + vatRate);
}

export function PricingBlock({
  costPerKg, costPerPortion, costPerBall,
  portionsLabel = "portion",
  vatRate, onVatChange, coefficient, onCoeffChange,
}: Props) {
  const costRef = costPerPortion ?? costPerBall ?? null;
  const pvTTC = costRef != null && coefficient > 0 ? suggestedPrice(costRef, coefficient, vatRate) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Costs summary */}
      {(costPerKg != null || costPerPortion != null || costPerBall != null) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {costPerKg != null && costPerKg > 0 && (
            <div style={{ padding: "8px 14px", borderRadius: 10, background: "rgba(0,0,0,0.04)", border: "1px solid rgba(217,199,182,0.7)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#9a8f84", textTransform: "uppercase", letterSpacing: 1 }}>Coût/kg</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#2f3a33" }}>{fmtMoney(costPerKg)} €</div>
            </div>
          )}
          {costPerPortion != null && costPerPortion > 0 && (
            <div style={{ padding: "8px 14px", borderRadius: 10, background: "rgba(0,0,0,0.04)", border: "1px solid rgba(217,199,182,0.7)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#9a8f84", textTransform: "uppercase", letterSpacing: 1 }}>Coût/{portionsLabel}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#2f3a33" }}>{fmtMoney(costPerPortion)} €</div>
            </div>
          )}
          {costPerBall != null && costPerBall > 0 && (
            <div style={{ padding: "8px 14px", borderRadius: 10, background: "rgba(0,0,0,0.04)", border: "1px solid rgba(217,199,182,0.7)" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#9a8f84", textTransform: "uppercase", letterSpacing: 1 }}>Coût/pâton</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#2f3a33" }}>{fmtMoney(costPerBall)} €</div>
            </div>
          )}
        </div>
      )}

      {/* TVA */}
      <div>
        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6f6a61", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
          TVA
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          {VAT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onVatChange(opt.value)}
              style={{
                padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700,
                border: "1.5px solid",
                borderColor: vatRate === opt.value ? "#8B1A1A" : "rgba(217,199,182,0.95)",
                background: vatRate === opt.value ? "rgba(139,26,26,0.08)" : "rgba(255,255,255,0.7)",
                color: vatRate === opt.value ? "#8B1A1A" : "#6f6a61",
                cursor: "pointer",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Coefficient */}
      <div>
        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6f6a61", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Coefficient multiplicateur
        </label>
        <input
          type="number"
          value={coefficient}
          min={1}
          step={0.1}
          onChange={e => {
            const v = parseFloat(e.target.value);
            if (v >= 1) onCoeffChange(v);
          }}
          className="input"
          style={{ maxWidth: 120 }}
        />
      </div>

      {/* Prix conseillé */}
      {pvTTC != null && (
        <div style={{
          padding: "10px 16px", borderRadius: 10,
          background: "rgba(139,26,26,0.06)", border: "1px solid rgba(139,26,26,0.2)",
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#8B1A1A", textTransform: "uppercase", letterSpacing: 1 }}>Prix conseillé TTC</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#8B1A1A" }}>{fmtMoney(pvTTC)} €</div>
          <div style={{ fontSize: 11, color: "#6f6a61", marginTop: 2 }}>
            Coeff ×{coefficient.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} · TVA {(vatRate * 100).toFixed(1).replace(".", ",")} %
          </div>
        </div>
      )}
    </div>
  );
}
