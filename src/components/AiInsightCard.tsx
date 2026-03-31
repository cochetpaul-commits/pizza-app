"use client";

import { useState, useCallback } from "react";
import { useEtablissement } from "@/lib/EtablissementContext";

type InsightResult = { title: string; points: string[] };

interface Props {
  /** Which insight type to fetch */
  type: "briefing" | "menu" | "margin" | "trends";
  /** Label displayed on the card */
  label: string;
  /** Icon emoji */
  icon: string;
  /** Accent color for the card */
  color: string;
  /** Date range — from */
  from?: string;
  /** Date range — to */
  to?: string;
}

function getDefaultWeekRange(): { from: string; to: string } {
  const now = new Date();
  const dow = now.getDay() || 7;
  const mon = new Date(now);
  mon.setDate(now.getDate() - dow + 1);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { from: mon.toISOString().slice(0, 10), to: sun.toISOString().slice(0, 10) };
}

export function AiInsightCard({ type, label, icon, color, from, to }: Props) {
  const { current: etab } = useEtablissement();
  const defaults = getDefaultWeekRange();
  const dateFrom = from ?? defaults.from;
  const dateTo = to ?? defaults.to;

  const [data, setData] = useState<InsightResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timestamp, setTimestamp] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const generate = useCallback(async () => {
    if (!etab) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/claude/insights?etablissement_id=${etab.id}&from=${dateFrom}&to=${dateTo}&type=${type}`,
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: "Erreur serveur" }));
        throw new Error(json.error || `Erreur ${res.status}`);
      }
      const result = await res.json();
      setData(result[type] ?? null);
      setTimestamp(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [etab, dateFrom, dateTo, type]);

  return (
    <div style={{
      background: "#fff", borderRadius: 12, border: "1px solid #e0d8ce",
      padding: "16px 18px", marginBottom: 14,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: data ? 12 : 0 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{
          fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 15, fontWeight: 700,
          color, flex: 1,
        }}>
          {label}
        </span>
        {data && (
          <button type="button" onClick={() => setCollapsed(c => !c)} style={{
            border: "none", background: "transparent", cursor: "pointer",
            fontSize: 14, color: "#999", padding: "2px 6px",
          }}>
            {collapsed ? "+" : "−"}
          </button>
        )}
        <button type="button" onClick={generate} disabled={loading} style={{
          padding: "5px 14px", borderRadius: 8, border: `1.5px solid ${color}40`,
          background: loading ? `${color}10` : "#fff", color,
          fontSize: 11, fontWeight: 700, cursor: loading ? "default" : "pointer",
          opacity: loading ? 0.6 : 1,
        }}>
          {loading ? "..." : data ? "Actualiser" : "Generer"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ fontSize: 12, color: "#DC2626", marginBottom: 8 }}>{error}</div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div>
          {[1, 2, 3].map(i => (
            <div key={i} style={{
              height: 12, borderRadius: 4, marginBottom: 8,
              background: "linear-gradient(90deg, #f0ebe3 25%, #e8e2d8 50%, #f0ebe3 75%)",
              backgroundSize: "200% 100%", animation: "pulse 1.5s infinite",
              width: i === 3 ? "60%" : "100%",
            }} />
          ))}
          <style>{`@keyframes pulse { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
        </div>
      )}

      {/* Content */}
      {data && !collapsed && (
        <div>
          {data.points.map((point, i) => (
            <div key={i} style={{
              fontSize: 13, lineHeight: 1.6, color: "#333",
              padding: "4px 0", borderBottom: i < data.points.length - 1 ? "1px solid #f5f0e8" : "none",
            }}>
              {point}
            </div>
          ))}
          {timestamp && (
            <div style={{ fontSize: 10, color: "#999", marginTop: 8, textAlign: "right" }}>
              Genere a {timestamp}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
