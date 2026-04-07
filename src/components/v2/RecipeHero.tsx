"use client";

import React from "react";
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
}

export function RecipeKpis({
  costPerPortion, foodCostPct, sellPriceHT, sellPriceTTC, margeBrute,
  foodCostTarget = 30, portionLabel = "portion", accent = "#D4775A",
}: RecipeKpisProps) {
  // Food cost color: green ≤ target, orange ≤ target+5, red >
  const fcColor = foodCostPct == null
    ? "#999"
    : foodCostPct <= foodCostTarget ? "#16a34a"
    : foodCostPct <= foodCostTarget + 5 ? "#D97706"
    : "#DC2626";
  const fcRatio = foodCostPct == null ? 0 : Math.min(1, foodCostPct / (foodCostTarget * 1.67)); // top scale = target * 1.67

  const margeColor = margeBrute != null && margeBrute > 0 ? "#16a34a" : "#999";
  const margeRatio = margeBrute != null && sellPriceHT
    ? Math.min(1, Math.max(0, margeBrute / sellPriceHT))
    : 0;

  return (
    <div style={{
      background: "#faf6ee",
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      gap: 12,
    }}>
      {/* COUT DE REVIENT */}
      <BigKpiCard
        label="Cout de revient"
        value={costPerPortion != null ? `${fmtMoney(costPerPortion)}€` : "-"}
        sub={`par ${portionLabel}`}
        color={accent}
      />

      {/* FOOD COST */}
      <BigKpiCard
        label="Food cost"
        value={foodCostPct != null ? `${foodCostPct.toFixed(0)}%` : "-"}
        sub={`cible ${foodCostTarget}%`}
        color={fcColor}
        progress={{ ratio: fcRatio, color: fcColor }}
      />

      {/* PRIX DE VENTE */}
      <BigKpiCard
        label="Prix de vente"
        value={sellPriceHT != null ? `${fmtMoney(sellPriceHT)}€` : "-"}
        sub={sellPriceTTC != null ? `HT · ${fmtMoney(sellPriceTTC)}€ TTC` : "HT"}
        color="#1a1a1a"
      />

      {/* MARGE BRUTE */}
      <BigKpiCard
        label="Marge brute"
        value={margeBrute != null ? `${fmtMoney(margeBrute)}€` : "-"}
        sub={`par ${portionLabel}`}
        color={margeColor}
        progress={margeBrute != null && margeBrute > 0 ? { ratio: margeRatio, color: margeColor } : undefined}
      />
    </div>
  );
}

function BigKpiCard({
  label, value, sub, color, progress,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  progress?: { ratio: number; color: string };
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
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: "#9a8f84", marginTop: 2 }}>{sub}</div>
      )}
      {progress && (
        <div style={{
          marginTop: 10, height: 6, background: "#ece4d4",
          borderRadius: 999, overflow: "hidden",
        }}>
          <div style={{
            width: `${Math.min(100, progress.ratio * 100)}%`,
            height: "100%", background: progress.color,
            borderRadius: 999, transition: "width 0.3s",
          }} />
        </div>
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
