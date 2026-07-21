"use client";

import { useCallback, useEffect, useState } from "react";
import { NavBar } from "@/components/NavBar";
import { RequireRole } from "@/components/RequireRole";

const OSWALD = "'Oswald', sans-serif";

type CatStat = { name: string; ca: number; qty: number };
type TopProduct = { name: string; ca: number; qty: number; category: string };
type LiveData = {
  day: string;
  totalCA: number;
  couverts: number;
  nbProduits: number;
  categories: CatStat[];
  topProducts: TopProduct[];
};

const CAT_COLORS: Record<string, string> = {
  PIZZE: "#8B1A1A", CUCINA: "#4a6741", ANTIPASTI: "#D4A017", DOLCI: "#A0522D",
  VINI: "#7B2D5F", DIGESTIVI: "#7C3AED", ALCOOL: "#E65100", BEVANDE: "#00838F",
  "BEVANDE CALDE": "#5D4037", MESSAGES: "#999",
};

function fmtEur(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDay(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
}

export default function VentesLivePage() {
  return (
    <RequireRole allowedRoles={["group_admin", "manager"]}>
      <LiveContent />
    </RequireRole>
  );
}

function LiveContent() {
  const [data, setData] = useState<LiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [day, setDay] = useState(() => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date()));
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/popina-live?day=${day}`);
    if (res.ok) {
      setData(await res.json());
      setLastRefresh(new Date());
    }
    setLoading(false);
  }, [day]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => { void load(); }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [load]);

  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());
  const isToday = day === today;
  const ticketMoyen = data && data.couverts > 0 ? data.totalCA / data.couverts : 0;

  return (
    <>
      <NavBar backHref="/ventes" backLabel="Ventes" />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 100px", boxSizing: "border-box" }}>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: "#D4775A", textTransform: "uppercase", margin: "0 0 6px" }}>
            VENTES EN DIRECT
          </p>
          <h1 style={{ fontSize: 24, color: "#1a1a1a", margin: 0, fontFamily: OSWALD }}>
            {isToday ? "Aujourd'hui" : fmtDay(day)}
          </h1>
          {lastRefresh && (
            <p style={{ fontSize: 11, color: "#999", margin: "4px 0 0" }}>
              Mis a jour a {lastRefresh.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              {isToday && " — rafraichit toutes les 5 min"}
            </p>
          )}
        </div>

        {/* Day picker */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "center" }}>
          <button onClick={() => { const d = new Date(day + "T12:00:00"); d.setDate(d.getDate() - 1); setDay(d.toISOString().slice(0, 10)); }}
            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #ddd6c8", background: "#fff", cursor: "pointer", fontSize: 14 }}>
            ←
          </button>
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)}
            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 13, fontFamily: "inherit" }} />
          <button onClick={() => setDay(today)} disabled={isToday}
            style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #ddd6c8", background: isToday ? "#f0ebe0" : "#fff", cursor: isToday ? "default" : "pointer", fontSize: 12, fontWeight: 600, color: isToday ? "#999" : "#1a1a1a" }}>
            Aujourd&apos;hui
          </button>
          <button onClick={load} disabled={loading}
            style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "#D4775A", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 700, opacity: loading ? 0.6 : 1 }}>
            {loading ? "..." : "Rafraichir"}
          </button>
        </div>

        {loading && !data ? (
          <p style={{ textAlign: "center", color: "#999", padding: 40 }}>Chargement depuis Popina...</p>
        ) : !data || data.totalCA === 0 ? (
          <p style={{ textAlign: "center", color: "#999", padding: 40 }}>Aucune vente pour cette journee.</p>
        ) : (
          <>
            {/* KPI tiles */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 24 }}>
              <KpiTile label="CA Total" value={`${fmtEur(data.totalCA)} \u20AC`} color="#D4775A" />
              <KpiTile label="Couverts" value={String(data.couverts)} color="#4a6741" />
              <KpiTile label="Ticket moyen" value={`${fmtEur(ticketMoyen)} \u20AC`} color="#2563EB" />
              <KpiTile label="Produits" value={String(data.nbProduits)} color="#7C3AED" />
            </div>

            {/* Categories */}
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 14, fontFamily: OSWALD, color: "#1a1a1a", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Par categorie
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {data.categories.map((cat) => {
                  const color = CAT_COLORS[cat.name] ?? "#999";
                  const pct = data.totalCA > 0 ? (cat.ca / data.totalCA) * 100 : 0;
                  return (
                    <div key={cat.name} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 14px", borderRadius: 10, background: "#fff", border: "1px solid #f0ebe0",
                    }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color, flex: 1, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {cat.name}
                      </span>
                      <span style={{ fontSize: 11, color: "#999" }}>{cat.qty} ventes</span>
                      <span style={{ fontSize: 11, color: "#999", width: 40, textAlign: "right" }}>{pct.toFixed(0)}%</span>
                      <span style={{ fontSize: 14, fontWeight: 700, fontFamily: OSWALD, color: "#1a1a1a", minWidth: 60, textAlign: "right" }}>
                        {fmtEur(cat.ca)} \u20AC
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top products */}
            <div>
              <h2 style={{ fontSize: 14, fontFamily: OSWALD, color: "#1a1a1a", margin: "0 0 10px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Top produits
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {data.topProducts.map((p, i) => {
                  const color = CAT_COLORS[p.category] ?? "#999";
                  return (
                    <div key={p.name + i} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 14px", borderRadius: 8, background: i < 3 ? "#fff" : "#fefefe",
                      border: i < 3 ? "1px solid #e5ddd0" : "1px solid #f5f0e8",
                    }}>
                      <span style={{
                        width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                        background: i < 3 ? `${color}15` : "#f5f0e8",
                        color: i < 3 ? color : "#999",
                        fontSize: 11, fontWeight: 800,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {i + 1}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{p.name}</div>
                        <div style={{ fontSize: 10, color }}>
                          {p.category} — {p.qty} vendu{p.qty > 1 ? "s" : ""}
                        </div>
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 700, fontFamily: OSWALD, color: "#1a1a1a" }}>
                        {fmtEur(p.ca)} \u20AC
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}

function KpiTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      padding: "16px 14px", borderRadius: 12, background: "#fff",
      border: "1px solid #e5ddd0", textAlign: "center",
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, fontFamily: OSWALD, color }}>
        {value}
      </div>
    </div>
  );
}
