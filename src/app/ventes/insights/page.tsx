"use client";

import { useState, useCallback, type CSSProperties } from "react";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";

/* ── Types ── */
type InsightResult = { title: string; points: string[] };
type InsightKey = "briefing" | "menu" | "margin" | "trends";
type InsightsData = Partial<Record<InsightKey, InsightResult>>;

/* ── Card config ── */
const CARDS: { key: InsightKey; label: string; icon: string; color: string }[] = [
  { key: "briefing", label: "Briefing equipe", icon: "\uD83D\uDCCB", color: "#D4775A" },
  { key: "menu", label: "Suggestions menu", icon: "\uD83C\uDF74", color: "#46655a" },
  { key: "margin", label: "Conseils marge", icon: "\uD83D\uDCC8", color: "#c4a882" },
  { key: "trends", label: "Analyse tendances", icon: "\uD83D\uDCC9", color: "#5e7a8a" },
];

/* ── Styles ── */
const S = {
  page: { maxWidth: 960, margin: "0 auto", padding: "24px 16px" } as CSSProperties,
  header: { display: "flex", flexWrap: "wrap" as const, alignItems: "center", gap: 12, marginBottom: 24 } as CSSProperties,
  title: { fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 28, fontWeight: 700, color: "#1a1a1a", margin: 0 } as CSSProperties,
  dateRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const } as CSSProperties,
  input: { padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14, fontFamily: "inherit" } as CSSProperties,
  btn: { padding: "8px 20px", borderRadius: 20, border: "none", background: "#D4775A", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" } as CSSProperties,
  btnSmall: { padding: "4px 12px", borderRadius: 16, border: "1px solid #ddd6c8", background: "#fff", color: "#666", fontSize: 12, cursor: "pointer", fontFamily: "inherit" } as CSSProperties,
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 16 } as CSSProperties,
  card: { background: "#fff", borderRadius: 12, border: "1px solid #e0d8ce", padding: "20px 22px", display: "flex", flexDirection: "column" as const } as CSSProperties,
  cardHeader: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 } as CSSProperties,
  cardIcon: { fontSize: 22, lineHeight: 1 } as CSSProperties,
  cardTitle: { fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 18, fontWeight: 700, margin: 0 } as CSSProperties,
  cardBody: { flex: 1, fontSize: 14, lineHeight: 1.7, color: "#333" } as CSSProperties,
  cardFooter: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 10, borderTop: "1px solid #f0ebe3" } as CSSProperties,
  timestamp: { fontSize: 11, color: "#999" } as CSSProperties,
  skeleton: { background: "linear-gradient(90deg, #f0ebe3 25%, #e8e2d8 50%, #f0ebe3 75%)", backgroundSize: "200% 100%", animation: "pulse 1.5s infinite", borderRadius: 6, height: 14, marginBottom: 10 } as CSSProperties,
  disclaimer: { textAlign: "center" as const, fontSize: 12, color: "#999", marginTop: 24, fontStyle: "italic" } as CSSProperties,
  error: { background: "#fef2f2", color: "#991b1b", padding: "12px 16px", borderRadius: 8, fontSize: 14, marginBottom: 16 } as CSSProperties,
};

/* ── Helpers ── */
function getDefaultRange(): { from: string; to: string } {
  const now = new Date();
  const dow = now.getDay() || 7;
  const mon = new Date(now);
  mon.setDate(now.getDate() - dow + 1);
  // Default to current week
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return {
    from: mon.toISOString().slice(0, 10),
    to: sun.toISOString().slice(0, 10),
  };
}

/* ── Component ── */
export default function InsightsPage() {
  const { current: etab } = useEtablissement();
  const defaults = getDefaultRange();

  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [insights, setInsights] = useState<InsightsData>({});
  const [loading, setLoading] = useState<Partial<Record<InsightKey, boolean>>>({});
  const [timestamps, setTimestamps] = useState<Partial<Record<InsightKey, string>>>({});
  const [error, setError] = useState<string | null>(null);

  const fetchInsight = useCallback(async (type?: InsightKey) => {
    if (!etab) return;
    setError(null);
    const types = type ? [type] : (["briefing", "menu", "margin", "trends"] as InsightKey[]);
    const newLoading: Partial<Record<InsightKey, boolean>> = {};
    for (const t of types) newLoading[t] = true;
    setLoading(prev => ({ ...prev, ...newLoading }));

    try {
      const typeParam = type ? `&type=${type}` : "";
      const res = await fetch(
        `/api/claude/insights?etablissement_id=${etab.id}&from=${from}&to=${to}${typeParam}`,
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: "Erreur serveur" }));
        throw new Error(json.error || `Erreur ${res.status}`);
      }
      const data = await res.json();
      const now = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      setInsights(prev => ({ ...prev, ...data }));
      const newTs: Partial<Record<InsightKey, string>> = {};
      for (const t of types) newTs[t] = now;
      setTimestamps(prev => ({ ...prev, ...newTs }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      const doneLoading: Partial<Record<InsightKey, boolean>> = {};
      for (const t of types) doneLoading[t] = false;
      setLoading(prev => ({ ...prev, ...doneLoading }));
    }
  }, [etab, from, to]);

  const handleGenerate = useCallback(() => {
    fetchInsight();
  }, [fetchInsight]);

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={S.page}>
        {/* Pulse animation */}
        <style>{`@keyframes pulse { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>

        {/* Header */}
        <div style={S.header}>
          <h1 style={S.title}>Pilotage</h1>
        </div>

        <div style={{ ...S.dateRow, marginBottom: 20 }}>
          <label style={{ fontSize: 14, color: "#666" }}>Du</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={S.input} />
          <label style={{ fontSize: 14, color: "#666" }}>au</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={S.input} />
          <button
            onClick={handleGenerate}
            disabled={Object.values(loading).some(Boolean)}
            style={{
              ...S.btn,
              opacity: Object.values(loading).some(Boolean) ? 0.6 : 1,
            }}
          >
            {Object.values(loading).some(Boolean) ? "Generation..." : "Generer"}
          </button>
        </div>

        {error && <div style={S.error}>{error}</div>}

        {/* Cards grid */}
        <div style={S.grid}>
          {CARDS.map(card => {
            const isLoading = loading[card.key];
            const data = insights[card.key];
            const ts = timestamps[card.key];

            return (
              <div key={card.key} style={S.card}>
                <div style={S.cardHeader}>
                  <span style={S.cardIcon}>{card.icon}</span>
                  <h2 style={{ ...S.cardTitle, color: card.color }}>{card.label}</h2>
                </div>

                <div style={S.cardBody}>
                  {isLoading ? (
                    <>
                      {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} style={{ ...S.skeleton, width: `${85 - i * 8}%` }} />
                      ))}
                    </>
                  ) : data && data.points.length > 0 ? (
                    <ol style={{ margin: 0, paddingLeft: 20 }}>
                      {data.points.map((point, i) => (
                        <li key={i} style={{ marginBottom: 6 }}>{point}</li>
                      ))}
                    </ol>
                  ) : (
                    <p style={{ color: "#999", fontStyle: "italic" }}>
                      Cliquez sur &quot;Generer&quot; pour obtenir les insights.
                    </p>
                  )}
                </div>

                <div style={S.cardFooter}>
                  <span style={S.timestamp}>{ts ? `Genere a ${ts}` : ""}</span>
                  <button
                    onClick={() => fetchInsight(card.key)}
                    disabled={!!isLoading}
                    style={{
                      ...S.btnSmall,
                      opacity: isLoading ? 0.5 : 1,
                    }}
                  >
                    Regenerer
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Disclaimer */}
        <p style={S.disclaimer}>
          Genere par IA — verifier avant d&apos;appliquer
        </p>
      </div>
    </RequireRole>
  );
}
