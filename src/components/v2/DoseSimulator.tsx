"use client";

import { useState, useCallback } from "react";

function fmtMoney(v: number) {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const UNIT_OPTIONS = [
  { value: "cl", label: "cl" },
  { value: "L", label: "L" },
  { value: "ml", label: "ml" },
  { value: "kg", label: "kg" },
  { value: "g", label: "g" },
  { value: "unit", label: "unité" },
];

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", borderRadius: 10,
  border: "1.5px solid #ddd6c8", background: "#fff",
  fontSize: 14, fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: "#666", marginBottom: 4, display: "block",
};

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

interface Props {
  accentColor?: string;
}

export function DoseSimulator({ accentColor = "#D4775A" }: Props) {
  const [prixAchat, setPrixAchat] = useState("");
  const [volume, setVolume] = useState("");
  const [unite, setUnite] = useState("cl");
  const [volDose, setVolDose] = useState("");
  const [tva, setTva] = useState("10");
  const [coeff, setCoeff] = useState("");
  const [pvTtc, setPvTtc] = useState("");
  const [lastEdited, setLastEdited] = useState<"coeff" | "pv" | null>(null);

  const pa = parseFloat(prixAchat) || 0;
  const vol = parseFloat(volume) || 0;
  const dose = parseFloat(volDose) || 0;
  const tvaRate = (parseFloat(tva) || 0) / 100;

  const nbPortions = vol > 0 && dose > 0 ? Math.floor(vol / dose) : 0;
  const coutDose = nbPortions > 0 ? pa / nbPortions : 0;

  // Bidirectional coeff ↔ PV TTC
  const updateCoeff = useCallback((val: string) => {
    setCoeff(val);
    setLastEdited("coeff");
    const c = parseFloat(val) || 0;
    if (c > 0 && coutDose > 0) {
      const pvHt = coutDose * c;
      const pvTtcCalc = pvHt * (1 + tvaRate);
      setPvTtc(pvTtcCalc.toFixed(2));
    }
  }, [coutDose, tvaRate]);

  const updatePvTtc = useCallback((val: string) => {
    setPvTtc(val);
    setLastEdited("pv");
    const pv = parseFloat(val) || 0;
    if (pv > 0 && coutDose > 0) {
      const pvHt = pv / (1 + tvaRate);
      setCoeff((pvHt / coutDose).toFixed(2));
    }
  }, [coutDose, tvaRate]);

  // Computed results
  const pvTtcNum = parseFloat(pvTtc) || 0;
  const pvHt = pvTtcNum > 0 ? pvTtcNum / (1 + tvaRate) : 0;
  const coeffNum = parseFloat(coeff) || 0;
  const margeBrute = pvHt > 0 && coutDose > 0 ? pvHt - coutDose : 0;
  const foodCostPct = pvHt > 0 && coutDose > 0 ? (coutDose / pvHt) * 100 : 0;

  const fcColor = foodCostPct <= 0 ? "#999" : foodCostPct <= 25 ? "#16a34a" : foodCostPct <= 30 ? "#4a6741" : foodCostPct <= 35 ? "#D97706" : "#DC2626";

  // Preset food cost targets
  const presetPv = (targetPct: number) => {
    if (coutDose <= 0) return;
    const pvHtTarget = coutDose / (targetPct / 100);
    const pvTtcTarget = pvHtTarget * (1 + tvaRate);
    setPvTtc(pvTtcTarget.toFixed(2));
    setCoeff((pvHtTarget / coutDose).toFixed(2));
    setLastEdited("pv");
  };

  return (
    <div>
      <p style={{ fontSize: 13, color: "#777", margin: "0 0 16px" }}>
        Calculez le nombre de portions, le cout par dose, et simulez vos prix de vente.
      </p>

      {/* Row 1: Prix d'achat, Volume, Unite, Dose */}
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
          <select style={{ ...inputStyle, height: 44 }} value={unite} onChange={e => setUnite(e.target.value)}>
            {UNIT_OPTIONS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Volume dose / portion</label>
          <input style={inputStyle} value={volDose} onChange={e => setVolDose(e.target.value)}
            placeholder="Ex: 12" type="number" step="0.1" min="0" />
        </div>
      </div>

      {/* Row 2: TVA, Coefficient, PV TTC */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
        <div>
          <label style={labelStyle}>TVA (%)</label>
          <input style={inputStyle} value={tva} onChange={e => setTva(e.target.value)}
            placeholder="10" type="number" step="0.5" min="0" />
        </div>
        <div>
          <label style={labelStyle}>Coefficient multiplicateur</label>
          <input style={{ ...inputStyle, borderColor: lastEdited === "coeff" ? accentColor : "#ddd6c8" }}
            value={coeff} onChange={e => updateCoeff(e.target.value)}
            placeholder="Ex: 3.5" type="number" step="0.1" min="0" />
        </div>
        <div>
          <label style={labelStyle}>Prix de vente TTC (EUR)</label>
          <input style={{ ...inputStyle, borderColor: lastEdited === "pv" ? accentColor : "#ddd6c8" }}
            value={pvTtc} onChange={e => updatePvTtc(e.target.value)}
            placeholder="Ex: 9.00" type="number" step="0.5" min="0" />
        </div>
      </div>

      {/* Quick presets */}
      {coutDose > 0 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {[25, 30, 35].map(pct => {
            const targetPvHt = coutDose / (pct / 100);
            const targetPvTtc = targetPvHt * (1 + tvaRate);
            return (
              <button key={pct} type="button" onClick={() => presetPv(pct)} style={{
                flex: 1, padding: "8px 4px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                border: `1.5px solid ${accentColor}30`, background: `${accentColor}08`,
                color: accentColor, cursor: "pointer", textAlign: "center", lineHeight: 1.3,
              }}>
                Objectif {pct}% FC
                <div style={{ fontSize: 12, fontWeight: 800, marginTop: 2 }}>{fmtMoney(targetPvTtc)} \u20AC</div>
              </button>
            );
          })}
        </div>
      )}

      {/* Results */}
      {coutDose > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
          <div style={kpiCard}>
            <div style={kpiLabel}>Nb portions</div>
            <div style={kpiValue}>{nbPortions}</div>
          </div>
          <div style={kpiCard}>
            <div style={kpiLabel}>Cout / dose</div>
            <div style={{ ...kpiValue, color: accentColor }}>{fmtMoney(coutDose)} \u20AC</div>
          </div>
          <div style={kpiCard}>
            <div style={kpiLabel}>Coefficient</div>
            <div style={{ ...kpiValue, color: accentColor }}>{coeffNum > 0 ? `x${coeffNum.toFixed(2)}` : "\u2014"}</div>
          </div>
          <div style={kpiCard}>
            <div style={kpiLabel}>Marge brute</div>
            <div style={{ ...kpiValue, color: margeBrute > 0 ? "#4a6741" : "#999" }}>
              {margeBrute > 0 ? `${fmtMoney(margeBrute)} \u20AC` : "\u2014"}
            </div>
          </div>
          <div style={kpiCard}>
            <div style={kpiLabel}>Food cost</div>
            <div style={{ ...kpiValue, color: fcColor }}>
              {foodCostPct > 0 ? `${foodCostPct.toFixed(1)}%` : "\u2014"}
            </div>
          </div>
          <div style={kpiCard}>
            <div style={kpiLabel}>PV HT</div>
            <div style={kpiValue}>{pvHt > 0 ? `${fmtMoney(pvHt)} \u20AC` : "\u2014"}</div>
          </div>
        </div>
      )}
    </div>
  );
}
