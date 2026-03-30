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
  kpis?: {
    costPerPortion: number | null;
    foodCostPct: number | null;
    sellPriceHT: number | null;
    sellPriceTTC: number | null;
    margeBrute: number | null;
    costPerKg?: number | null;
  };
}

export function RecipeHero({
  title, accent, isEdit, photoPreview, etabName, typeLabel,
  onBack, actions, kpis,
}: RecipeHeroProps) {
  return (
    <>
      {/* Hero Card */}
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
        {isEdit && (etabName || typeLabel) && (
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            {etabName && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 10px", borderRadius: 6, background: "rgba(255,255,255,0.2)", color: "#fff" }}>{etabName}</span>}
            {typeLabel && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 10px", borderRadius: 6, background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.9)" }}>{typeLabel}</span>}
          </div>
        )}
        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
          {actions}
        </div>
      </div>

      {/* KPI Cards */}
      {isEdit && kpis && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          <KpiCard label="Cout de revient" value={kpis.costPerPortion ? `${fmtMoney(kpis.costPerPortion)} \u20AC` : "-"} color={accent} />
          <KpiCard
            label="Food cost"
            value={kpis.foodCostPct != null ? `${kpis.foodCostPct.toFixed(1)}%` : "-"}
            color={kpis.foodCostPct == null ? "#999" : kpis.foodCostPct <= 28 ? "#16a34a" : kpis.foodCostPct <= 32 ? "#D97706" : "#DC2626"}
          />
          <KpiCard
            label="Prix de vente HT"
            value={kpis.sellPriceHT ? `${fmtMoney(kpis.sellPriceHT)} \u20AC` : "-"}
            color="#1a1a1a"
            sub={kpis.sellPriceTTC ? `${fmtMoney(kpis.sellPriceTTC)} \u20AC TTC` : undefined}
          />
          <KpiCard
            label="Marge brute"
            value={kpis.margeBrute != null ? `${fmtMoney(kpis.margeBrute)} \u20AC` : "-"}
            color={kpis.margeBrute != null && kpis.margeBrute > 0 ? "#16a34a" : "#999"}
          />
          {kpis.costPerKg != null && kpis.costPerKg > 0 && (
            <KpiCard label="Cout / kg" value={`${fmtMoney(kpis.costPerKg)} \u20AC`} color={accent} />
          )}
        </div>
      )}
    </>
  );
}

function KpiCard({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", border: "1px solid #e0d8ce" }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "var(--font-oswald), Oswald, sans-serif", lineHeight: 1.15 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/** Action button styled for the hero card */
export function HeroBtn({ onClick, disabled, children, primary }: { onClick: () => void; disabled?: boolean; children: React.ReactNode; primary?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      fontSize: 11, fontWeight: 700, padding: "6px 14px", borderRadius: 8, cursor: "pointer",
      border: primary ? "none" : "1px solid rgba(255,255,255,0.3)",
      background: primary ? "#fff" : "rgba(255,255,255,0.15)",
      color: primary ? "#1a1a1a" : "#fff",
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
