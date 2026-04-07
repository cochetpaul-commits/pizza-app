"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";

function fmtMoney(v: number) {
  return v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface RecipeHeroProps {
  title: string;
  accent: string;
  isEdit: boolean;
  photoPreview?: string | null;
  etabName?: string;
  typeLabel?: string;
  onBack: () => void;
  actions: React.ReactNode;
}

export function RecipeHero({
  title, accent, isEdit, photoPreview, etabName, typeLabel,
  onBack, actions,
}: RecipeHeroProps) {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${accent} 0%, ${accent}DD 100%)`,
      borderRadius: 16, padding: "24px 20px 20px", marginBottom: 16, color: "#fff",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        {isEdit && (
          <button type="button" onClick={onBack} style={{
            fontSize: 18, color: "rgba(255,255,255,0.7)", cursor: "pointer", border: "none", background: "transparent",
            padding: "4px 8px", lineHeight: 1,
          }}>&#8592;</button>
        )}
        {photoPreview && (
          <div style={{ width: 40, height: 40, borderRadius: 10, overflow: "hidden", flexShrink: 0, border: "2px solid rgba(255,255,255,0.3)" }}>
            <Image src={photoPreview} alt="" width={40} height={40} style={{ objectFit: "cover", width: 40, height: 40 }} />
          </div>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.5, opacity: 0.7 }}>
            Fiche technique
          </div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, fontFamily: "var(--font-oswald), 'Oswald', sans-serif", textTransform: "uppercase", letterSpacing: 1, color: "#fff" }}>{title}</h1>
        </div>
      </div>
      {(etabName || typeLabel) && (
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          {etabName && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 10px", borderRadius: 6, background: "rgba(255,255,255,0.2)", color: "#fff" }}>{etabName}</span>}
          {typeLabel && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 10px", borderRadius: 6, background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.9)" }}>{typeLabel}</span>}
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
        {actions}
      </div>
    </div>
  );
}

// ── KPI BLOCK (style upsell) ──────────────────────────────────────
export interface RecipeKpisProps {
  costPerPortion: number | null;
  foodCostPct: number | null;
  sellPriceHT: number | null;
  sellPriceTTC: number | null;
  margeBrute: number | null;
  /** Target food cost % (default 30) */
  foodCostTarget?: number;
  /** Portion label (portion, pizza, cocktail...) */
  portionLabel?: string;
  /** Accent color (used as default for cost color) */
  accent?: string;
  /** Editable mode — provide callbacks to allow direct editing of the cards */
  onSellPriceChange?: (price: number) => void;
  vatRate?: number;
  onVatChange?: (rate: number) => void;
  onFoodCostTargetChange?: (target: number) => void;
  /** Portions multiplier (×1, ×2, …) — controls the Cost card */
  multiplier?: number;
  onMultiplierChange?: (m: number) => void;
}

export function RecipeKpis({
  costPerPortion, foodCostPct, sellPriceHT, sellPriceTTC, margeBrute,
  foodCostTarget = 30, portionLabel = "portion", accent = "#D4775A",
  onSellPriceChange, vatRate, onVatChange, onFoodCostTargetChange,
  multiplier = 1, onMultiplierChange,
}: RecipeKpisProps) {
  // Food cost color: green ≤ target, orange ≤ target+5, red >
  const fcColor = foodCostPct == null
    ? "#999"
    : foodCostPct <= foodCostTarget ? "#16a34a"
    : foodCostPct <= foodCostTarget + 5 ? "#D97706"
    : "#DC2626";
  const fcRatio = foodCostPct == null ? 0 : Math.min(1, foodCostPct / (foodCostTarget * 1.67));

  const margeColor = margeBrute != null && margeBrute > 0 ? "#16a34a" : "#999";
  const margeRatio = margeBrute != null && sellPriceHT
    ? Math.min(1, Math.max(0, margeBrute / sellPriceHT))
    : 0;

  const vatPct = vatRate != null ? Math.round(vatRate * 100) : null;

  // Coefficient = prix HT / coût de revient
  const coefficient = sellPriceHT && costPerPortion && costPerPortion > 0
    ? sellPriceHT / costPerPortion
    : null;

  // Display values include the multiplier (so the cards reflect the chosen portions count)
  const dispCost = costPerPortion != null ? costPerPortion * multiplier : null;
  const dispSell = sellPriceHT != null ? sellPriceHT * multiplier : null;
  const dispTTC = sellPriceTTC != null ? sellPriceTTC * multiplier : null;
  const dispMarge = margeBrute != null ? margeBrute * multiplier : null;

  return (
    <div style={{
      background: "#faf6ee",
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
    }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 12,
      }}>
        {/* COUT DE REVIENT — avec toggle portions */}
        <BigKpiCard
          label="Cout de revient"
          color={accent}
          valueNode={
            <span>{dispCost != null ? `${fmtMoney(dispCost)}€` : "-"}</span>
          }
          subNode={<span>{multiplier === 1 ? `par ${portionLabel}` : `pour ${multiplier} ${portionLabel}s`}</span>}
          bottomNode={onMultiplierChange ? (
            <PortionsToggle value={multiplier} onChange={onMultiplierChange} accent={accent} />
          ) : undefined}
        />

        {/* FOOD COST — cible éditable inline */}
        <BigKpiCard
          label="Food cost"
          color={fcColor}
          valueNode={
            <span>{foodCostPct != null ? `${foodCostPct.toFixed(0)}%` : "-"}</span>
          }
          subNode={
            onFoodCostTargetChange ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                cible
                <input
                  type="number"
                  min={5} max={80} step={1}
                  value={foodCostTarget}
                  onChange={(e) => onFoodCostTargetChange(Number(e.target.value))}
                  style={{
                    width: 38, padding: "1px 4px", borderRadius: 5,
                    border: "1px solid #d9d2c4", background: "#fff",
                    fontSize: 12, fontWeight: 700, textAlign: "right",
                    color: "#1a1a1a",
                  }}
                />
                %
              </span>
            ) : <span>{`cible ${foodCostTarget}%`}</span>
          }
          bottomNode={
            <div style={{
              height: 6, background: "#ece4d4",
              borderRadius: 999, overflow: "hidden",
            }}>
              <div style={{
                width: `${Math.min(100, fcRatio * 100)}%`,
                height: "100%", background: fcColor,
                borderRadius: 999, transition: "width 0.3s",
              }} />
            </div>
          }
        />

        {/* PRIX DE VENTE — input éditable + TVA inline */}
        <BigKpiCard
          label="Prix de vente"
          color="#1a1a1a"
          valueNode={
            onSellPriceChange ? (
              <EditablePrice value={dispSell} onChange={(v) => onSellPriceChange(v / multiplier)} />
            ) : (
              <span>{dispSell != null ? `${fmtMoney(dispSell)}€` : "-"}</span>
            )
          }
          subNode={
            onVatChange && vatPct != null ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                TVA
                <select
                  value={vatPct}
                  onChange={(e) => onVatChange(Number(e.target.value) / 100)}
                  style={{
                    padding: "1px 4px", borderRadius: 5, border: "1px solid #d9d2c4",
                    background: "#fff", fontSize: 12, fontWeight: 700, color: "#1a1a1a",
                    cursor: "pointer",
                  }}
                >
                  {[0, 5.5, 10, 20].map((v) => (
                    <option key={v} value={v}>{v}%</option>
                  ))}
                </select>
                {dispTTC != null && <span>· {fmtMoney(dispTTC)}€ TTC</span>}
              </span>
            ) : (
              <span>{dispTTC != null ? `HT · ${fmtMoney(dispTTC)}€ TTC` : "HT"}</span>
            )
          }
        />

        {/* MARGE BRUTE */}
        <BigKpiCard
          label="Marge brute"
          color={margeColor}
          valueNode={<span>{dispMarge != null ? `${fmtMoney(dispMarge)}€` : "-"}</span>}
          subNode={<span>{multiplier === 1 ? `par ${portionLabel}` : `pour ${multiplier} ${portionLabel}s`}</span>}
          bottomNode={dispMarge != null && dispMarge > 0 ? (
            <div style={{
              height: 6, background: "#ece4d4",
              borderRadius: 999, overflow: "hidden",
            }}>
              <div style={{
                width: `${Math.min(100, margeRatio * 100)}%`,
                height: "100%", background: margeColor,
                borderRadius: 999, transition: "width 0.3s",
              }} />
            </div>
          ) : undefined}
        />

        {/* COEFFICIENT — info pure */}
        <BigKpiCard
          label="Coefficient"
          color="#7C3AED"
          valueNode={<span>{coefficient != null ? `×${coefficient.toFixed(2)}` : "-"}</span>}
          subNode={<span>prix / coût</span>}
        />
      </div>
    </div>
  );
}

// ── Editable price input (looks like a big number) ───────────────
function EditablePrice({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  const [local, setLocal] = useState<string>(value != null ? value.toFixed(2) : "");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!editing) setLocal(value != null ? value.toFixed(2) : "");
  }, [value, editing]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={editing ? local : (value != null ? `${fmtMoney(value)}€` : "-")}
      onFocus={(e) => {
        setEditing(true);
        setLocal(value != null ? value.toFixed(2) : "");
        setTimeout(() => e.target.select(), 0);
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(",", ".").replace(/[^\d.]/g, "");
        setLocal(raw);
        const n = Number(raw);
        if (!isNaN(n) && n > 0) onChange(n);
      }}
      onBlur={() => {
        setEditing(false);
        const n = Number(local);
        if (!isNaN(n) && n > 0) onChange(n);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
      }}
      style={{
        width: "100%", border: "none", outline: "none", background: "transparent",
        fontSize: 36, fontWeight: 800, color: "#1a1a1a",
        fontFamily: "var(--font-oswald), Oswald, sans-serif",
        lineHeight: 1.05, marginTop: 4, padding: 0,
        fontVariantNumeric: "tabular-nums",
        cursor: "text",
      }}
    />
  );
}

// ── Portions multiplier toggle ───────────────────────────────────
function PortionsToggle({ value, onChange, accent }: { value: number; onChange: (v: number) => void; accent: string }) {
  const options = [1, 2, 5, 10, 20];
  return (
    <div style={{
      display: "flex", gap: 2, padding: 2, background: "#f5f0e8",
      borderRadius: 6, alignSelf: "flex-start",
    }}>
      {options.map((n) => (
        <button
          key={n} type="button" onClick={() => onChange(n)}
          style={{
            padding: "3px 9px", borderRadius: 5, fontSize: 10, fontWeight: 700,
            border: "none", cursor: "pointer",
            background: value === n ? accent : "transparent",
            color: value === n ? "#fff" : "#888",
            transition: "all 0.15s",
            fontVariantNumeric: "tabular-nums",
          }}
        >×{n}</button>
      ))}
    </div>
  );
}

function BigKpiCard({
  label, color, valueNode, subNode, bottomNode,
}: {
  label: string;
  color: string;
  valueNode: React.ReactNode;
  subNode?: React.ReactNode;
  bottomNode?: React.ReactNode;
}) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: 14,
      padding: "18px 20px",
      border: "1px solid #ece4d4",
      display: "flex",
      flexDirection: "column",
      gap: 4,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: "#999",
        textTransform: "uppercase", letterSpacing: "0.08em",
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 36, fontWeight: 800, color,
        fontFamily: "var(--font-oswald), Oswald, sans-serif",
        lineHeight: 1.05, marginTop: 4,
      }}>
        {valueNode}
      </div>
      {subNode && (
        <div style={{ fontSize: 12, color: "#9a8f84", marginTop: 2 }}>{subNode}</div>
      )}
      {bottomNode && (
        <div style={{ marginTop: 10 }}>{bottomNode}</div>
      )}
    </div>
  );
}

/** Action button styled for the hero card */
export function HeroBtn({ onClick, disabled, children, primary, title }: { onClick?: () => void; disabled?: boolean; children: React.ReactNode; primary?: boolean; title?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title} style={{
      fontSize: 11, fontWeight: 700, padding: "6px 14px", borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer",
      border: primary ? "none" : "1px solid rgba(255,255,255,0.3)",
      background: primary ? "#fff" : "rgba(255,255,255,0.15)",
      color: primary ? "#1a1a1a" : "#fff",
      opacity: disabled ? 0.5 : 1,
    }}>{children}</button>
  );
}

/** Danger button for hero card */
export function HeroDangerBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{
      fontSize: 11, fontWeight: 600, padding: "6px 12px", borderRadius: 8, cursor: "pointer",
      border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.1)",
      color: "rgba(255,255,255,0.8)",
    }}>{children}</button>
  );
}
