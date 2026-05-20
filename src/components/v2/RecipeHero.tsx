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
  /** Number of parts to divide the recipe into */
  nbParts?: number;
  onNbPartsChange?: (n: number) => void;
  /** Cost per kg (for preparations/cuisine) — shown as a dedicated card */
  costPerKg?: number | null;
  /** Yield in grams (for context display) */
  yieldGrams?: number | null;
  /** Mode: "preparation" shows cost/kg + sell price/kg + food cost + marge/kg */
  mode?: "default" | "preparation";
  /** Sell price per kg HT (for preparation mode) */
  sellPriceKgHT?: number | null;
  onSellPriceKgChange?: (price: number) => void;
  /** Selling coefficient for preparations (prix vente = cout/kg × coeff) */
  sellCoeff?: number | null;
  onSellCoeffChange?: (coeff: number) => void;
}

export function RecipeKpis({
  costPerPortion, foodCostPct, sellPriceHT, sellPriceTTC, margeBrute,
  foodCostTarget = 30, portionLabel = "portion", accent = "#D4775A",
  onSellPriceChange, vatRate, onVatChange, onFoodCostTargetChange,
  multiplier = 1, onMultiplierChange, nbParts = 1, onNbPartsChange, costPerKg, yieldGrams, mode = "default",
  sellPriceKgHT,
  sellCoeff, onSellCoeffChange,
}: RecipeKpisProps) {
  const isPrep = mode === "preparation";

  // Preparation-mode: derive sell price from coefficient × cost/kg
  const effectiveCoeff = sellCoeff && sellCoeff > 0 ? sellCoeff : null;
  const derivedSellKg = isPrep && costPerKg && costPerKg > 0 && effectiveCoeff
    ? costPerKg * effectiveCoeff : sellPriceKgHT ?? null;
  const prepFcPct = isPrep && costPerKg && derivedSellKg && derivedSellKg > 0
    ? (costPerKg / derivedSellKg) * 100 : null;
  const prepMargeKg = isPrep && costPerKg != null && derivedSellKg && derivedSellKg > 0
    ? derivedSellKg - costPerKg : null;
  const prepTTCKg = isPrep && derivedSellKg && vatRate != null
    ? derivedSellKg * (1 + vatRate) : null;
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

  // Display values include the multiplier and division by nbParts
  const divider = nbParts > 1 ? nbParts : 1;
  const dispCost = costPerPortion != null ? (costPerPortion * multiplier) / divider : null;
  const dispSell = sellPriceHT != null ? (sellPriceHT * multiplier) / divider : null;
  const dispTTC = sellPriceTTC != null ? (sellPriceTTC * multiplier) / divider : null;
  const dispMarge = margeBrute != null ? (margeBrute * multiplier) / divider : null;

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
          subNode={<span>{nbParts > 1 ? `par part (÷${nbParts})` : multiplier === 1 ? `par ${portionLabel}` : `pour ${multiplier} ${portionLabel}s`}</span>}
          bottomNode={onMultiplierChange ? (
            <PortionsToggle value={multiplier} onChange={onMultiplierChange} accent={accent} nbParts={nbParts} onNbPartsChange={onNbPartsChange} />
          ) : undefined}
        />

        {/* PRIX AU KILO — affiché uniquement si rendement connu */}
        {costPerKg != null && (
          <BigKpiCard
            label="Prix au kilo"
            color="#5b8fa8"
            valueNode={<span>{`${fmtMoney(costPerKg)}€`}</span>}
            subNode={<span>{yieldGrams ? `rendement ${(yieldGrams / 1000).toFixed(2)} kg` : "par kg"}</span>}
          />
        )}

        {/* ── Preparation mode: coeff × coût/kg → prix vente/kg, food cost, marge ── */}
        {isPrep && (
          <>
            {/* COEFFICIENT — éditable avec pills */}
            <BigKpiCard
              label="Coefficient"
              color="#7C3AED"
              valueNode={
                onSellCoeffChange ? (
                  <EditableCoeff value={effectiveCoeff} onChange={onSellCoeffChange} />
                ) : (
                  <span>{effectiveCoeff != null ? `×${effectiveCoeff.toFixed(2)}` : "-"}</span>
                )
              }
              subNode={<span>coût/kg × coeff = prix vente</span>}
              bottomNode={onSellCoeffChange ? (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                  {[2, 2.5, 3, 3.5, 4, 5].map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onSellCoeffChange(c)}
                      style={{
                        padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700,
                        border: "1px solid",
                        borderColor: effectiveCoeff === c ? "#7C3AED" : "#d9d2c4",
                        background: effectiveCoeff === c ? "rgba(124,58,237,0.1)" : "#fff",
                        color: effectiveCoeff === c ? "#7C3AED" : "#6f6a61",
                        cursor: "pointer",
                      }}
                    >×{c}</button>
                  ))}
                </div>
              ) : undefined}
            />

            {/* PRIX DE VENTE / KG — dérivé */}
            <BigKpiCard
              label="Prix de vente HT"
              color="#1a1a1a"
              valueNode={<span>{derivedSellKg != null ? `${fmtMoney(derivedSellKg)}€` : "-"}</span>}
              subNode={
                onVatChange && vatPct != null ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    par kg · TVA
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
                    {prepTTCKg != null && <span>· {fmtMoney(prepTTCKg)}€ TTC/kg</span>}
                  </span>
                ) : <span>par kg{prepTTCKg != null ? ` · ${fmtMoney(prepTTCKg)}€ TTC` : ""}</span>
              }
            />

            {/* FOOD COST */}
            {(() => {
              const pfc = prepFcPct;
              const pfcColor = pfc == null ? "#999"
                : pfc <= foodCostTarget ? "#16a34a"
                : pfc <= foodCostTarget + 5 ? "#D97706"
                : "#DC2626";
              const pfcRatio = pfc == null ? 0 : Math.min(1, pfc / (foodCostTarget * 1.67));
              return (
                <BigKpiCard
                  label="Food cost"
                  color={pfcColor}
                  valueNode={<span>{pfc != null ? `${pfc.toFixed(0)}%` : "-"}</span>}
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
                    <div style={{ height: 6, background: "#ece4d4", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{ width: `${Math.min(100, pfcRatio * 100)}%`, height: "100%", background: pfcColor, borderRadius: 999, transition: "width 0.3s" }} />
                    </div>
                  }
                />
              );
            })()}

            {/* MARGE BRUTE / KG */}
            <BigKpiCard
              label="Marge brute"
              color={prepMargeKg != null && prepMargeKg > 0 ? "#16a34a" : "#999"}
              valueNode={<span>{prepMargeKg != null ? `${fmtMoney(prepMargeKg)}€` : "-"}</span>}
              subNode={<span>par kg</span>}
            />
          </>
        )}

        {/* ── Default mode: food cost, prix de vente, marge, coeff ── */}
        {!isPrep && (
          <>
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

            {/* PRIX DE VENTE — TTC gros, HT petit, plaque + part */}
            <BigKpiCard
              label="Prix de vente"
              color="#1a1a1a"
              valueNode={
                <div>
                  {/* TTC en gros */}
                  <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "var(--font-oswald), Oswald, sans-serif", color: "#1a1a1a", lineHeight: 1.1 }}>
                    {dispTTC != null ? `${fmtMoney(dispTTC)}€ TTC` : "-"}
                  </div>
                  {/* HT en petit */}
                  <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
                    {dispSell != null ? `${fmtMoney(dispSell)}€ HT` : ""}
                  </div>
                  {/* Prix plaque (total) quand on divise */}
                  {nbParts > 1 && sellPriceTTC != null && (
                    <div style={{ fontSize: 11, color: "#888", marginTop: 6, paddingTop: 6, borderTop: "1px solid #ece4d4" }}>
                      Plaque : <strong>{fmtMoney(sellPriceTTC * multiplier)}€ TTC</strong> / {fmtMoney((sellPriceHT ?? 0) * multiplier)}€ HT
                    </div>
                  )}
                </div>
              }
              subNode={
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {onVatChange && vatPct != null ? (
                    <>
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
                    </>
                  ) : null}
                  {onSellPriceChange && (
                    <span style={{ marginLeft: 4 }}>
                      HT : <EditablePrice value={sellPriceHT != null ? sellPriceHT * multiplier : null} onChange={(v) => onSellPriceChange(v / multiplier)} />
                    </span>
                  )}
                </span>
              }
            />

            {/* MARGE BRUTE */}
            <BigKpiCard
              label="Marge brute"
              color={margeColor}
              valueNode={<span>{dispMarge != null ? `${fmtMoney(dispMarge)}€` : "-"}</span>}
              subNode={<span>{nbParts > 1 ? `par part (÷${nbParts})` : multiplier === 1 ? `par ${portionLabel}` : `pour ${multiplier} ${portionLabel}s`}</span>}
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
          </>
        )}
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

// ── Editable coefficient (×2.50) ─────────────────────────────────
function EditableCoeff({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  const [local, setLocal] = useState<string>(value != null ? value.toFixed(2) : "");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!editing) setLocal(value != null ? value.toFixed(2) : "");
  }, [value, editing]);

  return (
    <span style={{ display: "inline-flex", alignItems: "baseline" }}>
      <span style={{ fontSize: 36, fontWeight: 800, color: "#7C3AED", fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>×</span>
      <input
        type="text"
        inputMode="decimal"
        value={editing ? local : (value != null ? value.toFixed(2) : "-")}
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
          width: 80, border: "none", outline: "none", background: "transparent",
          fontSize: 36, fontWeight: 800, color: "#7C3AED",
          fontFamily: "var(--font-oswald), Oswald, sans-serif",
          lineHeight: 1.05, marginTop: 4, padding: 0,
          fontVariantNumeric: "tabular-nums",
          cursor: "text",
        }}
      />
    </span>
  );
}

// ── Portions multiplier toggle ───────────────────────────────────
function PortionsToggle({ value, onChange, accent, nbParts, onNbPartsChange }: {
  value: number; onChange: (v: number) => void; accent: string;
  nbParts?: number; onNbPartsChange?: (v: number) => void;
}) {
  const options = [1, 2, 5, 10, 20];
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{
        display: "flex", gap: 2, padding: 2, background: "#f5f0e8",
        borderRadius: 6,
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
      {onNbPartsChange && (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 10, color: "#888", fontWeight: 600 }}>÷</span>
          <input
            type="number" min={1} max={99}
            value={nbParts ?? 1}
            onChange={(e) => onNbPartsChange(Math.max(1, parseInt(e.target.value) || 1))}
            style={{ width: 36, padding: "3px 4px", borderRadius: 5, border: "1.5px solid #e5ddd0", fontSize: 10, fontWeight: 700, textAlign: "center", background: (nbParts ?? 1) > 1 ? accent + "20" : "#fff", color: "#1a1a1a" }}
          />
          <span style={{ fontSize: 10, color: "#888" }}>parts</span>
        </div>
      )}
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
