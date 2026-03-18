"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/fetchApi";

// ── Types ────────────────────────────────────────────────────

export interface GestionPilotageProps {
  recipeName?: string;
  recipeType: string;
}

type DayData = {
  date: string;
  label: string;
  totalSales: number;
  guestsNumber: number;
};

type TopProduct = {
  name: string;
  quantity: number;
  totalSales: number;
};

// ── Helpers ──────────────────────────────────────────────────

function fmtEur(n: number) {
  return n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0 });
}

// ── Component ────────────────────────────────────────────────

export function GestionPilotage({ recipeName, recipeType }: GestionPilotageProps) {
  const [days, setDays] = useState<DayData[]>([]);
  const [totalWeek, setTotalWeek] = useState(0);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      try {
        const [weekRes, topRes] = await Promise.all([
          fetchApi("/api/popina/ca-semaine"),
          fetchApi("/api/popina/top-produits"),
        ]);
        if (cancelled) return;

        if (weekRes.ok) {
          const weekData = await weekRes.json();
          setDays(weekData.days ?? []);
          setTotalWeek(weekData.totalSales ?? 0);
        }
        if (topRes.ok) {
          const topData = await topRes.json();
          setTopProducts(topData.products ?? []);
        }
      } catch {
        if (!cancelled) setError("Impossible de charger les donnees Popina");
      }
      if (!cancelled) setLoading(false);
    }
    run();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <div style={{ padding: 32, textAlign: "center", color: "#999", fontSize: 13 }}>Chargement Popina...</div>;
  }

  if (error) {
    return <div style={{ padding: 32, textAlign: "center", color: "#DC2626", fontSize: 13 }}>{error}</div>;
  }

  // Find max for bar chart scaling
  const maxSales = Math.max(...days.map((d) => d.totalSales), 1);

  // Check if this recipe appears in top products
  const recipeMatch = recipeName
    ? topProducts.find((p) => p.name.toLowerCase().includes(recipeName.toLowerCase()))
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Recipe match highlight */}
      {recipeMatch && (
        <div style={{
          background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10,
          padding: "12px 16px", display: "flex", alignItems: "center", gap: 12,
        }}>
          <span style={{ fontSize: 20 }}>&#x1F4C8;</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#166534" }}>
              {recipeMatch.name}
            </div>
            <div style={{ fontSize: 12, color: "#15803d" }}>
              {recipeMatch.quantity} vendus cette semaine — {fmtEur(recipeMatch.totalSales)} CA
            </div>
          </div>
        </div>
      )}

      {/* Weekly CA bar chart */}
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #ddd6c8", padding: "16px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>
            CA Popina — 7 derniers jours
          </span>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#D4775A", fontFamily: "Oswald, sans-serif" }}>
            {fmtEur(totalWeek)}
          </span>
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 100 }}>
          {days.map((d) => {
            const pct = maxSales > 0 ? (d.totalSales / maxSales) * 100 : 0;
            const isToday = d.date === new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());
            return (
              <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 9, color: "#999", fontVariantNumeric: "tabular-nums" }}>
                  {d.totalSales > 0 ? fmtEur(d.totalSales) : ""}
                </span>
                <div style={{
                  width: "100%", maxWidth: 40, borderRadius: 4,
                  height: `${Math.max(pct, 4)}%`,
                  background: isToday ? "#D4775A" : "#ddd6c8",
                  transition: "height 0.3s",
                }} />
                <span style={{
                  fontSize: 10, fontWeight: isToday ? 700 : 500,
                  color: isToday ? "#D4775A" : "#999",
                }}>
                  {d.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Avg ticket */}
        {days.length > 0 && (() => {
          const totalGuests = days.reduce((s, d) => s + d.guestsNumber, 0);
          const avgTicket = totalGuests > 0 ? totalWeek / totalGuests : 0;
          return (
            <div style={{ marginTop: 12, display: "flex", gap: 16 }}>
              <KpiMini label="Couverts" value={String(totalGuests)} />
              <KpiMini label="Ticket moyen" value={avgTicket > 0 ? fmtEur(avgTicket) : "-"} />
              <KpiMini label="Moy./jour" value={fmtEur(totalWeek / 7)} />
            </div>
          );
        })()}
      </div>

      {/* Top 10 products */}
      {topProducts.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #ddd6c8", padding: "16px 18px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>
            Top ventes (7 jours)
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {topProducts.map((p, i) => {
              const isRecipe = recipeName && p.name.toLowerCase().includes(recipeName.toLowerCase());
              return (
                <div
                  key={p.name}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "6px 10px", borderRadius: 6,
                    background: isRecipe ? "#fef3c7" : i % 2 === 0 ? "#f9f5ef" : "transparent",
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#999", width: 18, textAlign: "right" }}>
                    {i + 1}.
                  </span>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: isRecipe ? 700 : 500, color: "#1a1a1a" }}>
                    {p.name}
                  </span>
                  <span style={{ fontSize: 11, color: "#666", fontVariantNumeric: "tabular-nums" }}>
                    {p.quantity}x
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#D4775A", fontVariantNumeric: "tabular-nums", minWidth: 60, textAlign: "right" }}>
                    {fmtEur(p.totalSales)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Note about Popina */}
      <div style={{ fontSize: 11, color: "#999", textAlign: "center", padding: "4px 0" }}>
        Donnees Popina (Bello Mio) — {recipeType === "cuisine" || recipeType === "empatement" ? "Piccola Mia via Kezia non disponible" : "mise a jour en temps reel"}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

function KpiMini({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, padding: "8px 10px", background: "#f9f5ef", borderRadius: 6, textAlign: "center" }}>
      <div style={{ fontSize: 9, color: "#999", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", fontFamily: "Oswald, sans-serif" }}>
        {value}
      </div>
    </div>
  );
}
