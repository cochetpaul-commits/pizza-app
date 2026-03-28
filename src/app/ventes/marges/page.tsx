"use client";

import { useEffect, useState, useRef, useCallback, type CSSProperties } from "react";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import Chart from "chart.js/auto";

/* ── Types ── */
type ProductRow = {
  name: string;
  categorie: string;
  qty: number;
  ca_ttc: number;
  ca_ht: number;
  prix_revient: number | null;
  cout_total: number | null;
  marge_brute: number | null;
  marge_pct: number | null;
  food_cost_pct: number | null;
  matched: boolean;
};

type CategoryRow = {
  cat: string;
  ca_ht: number;
  ca_ttc: number;
  cogs: number;
  marge: number;
  food_cost_pct: number;
};

type KPIs = {
  ca_ttc: number;
  ca_ht: number;
  cogs: number;
  marge_brute: number;
  food_cost_pct: number;
  nb_produits: number;
  nb_matched: number;
  total_qty: number;
};

type ApiData = {
  kpis: KPIs;
  products: ProductRow[];
  categories: CategoryRow[];
  recipeCount: number;
};

type ViewTab = "semaine" | "mois";

/* ── Helpers ── */
const fmt = (v: number) => Math.round(v).toLocaleString("fr-FR") + "\u20AC";
const fmtDec = (v: number) =>
  v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "\u20AC";
const fmtPct = (v: number | null) => (v !== null ? v.toFixed(1) + "%" : "-");

const COLORS = {
  green: "#3a7d44",
  orange: "#d4a03c",
  red: "#c0392b",
  accent: "#D4775A",
  bg: "#f2ede4",
  border: "#e0d8ce",
  card: "#fff",
  dark: "#1a1a1a",
  muted: "#999",
};

const CHART_COLORS = [
  "#D4775A", "#46655a", "#c4a882", "#8fa8a0", "#7c5c3a",
  "#e0b896", "#5e7a8a", "#a8b89c", "#d4a03c", "#3a7d44",
];

function foodCostColor(fc: number | null): string {
  if (fc === null) return COLORS.muted;
  if (fc < 30) return COLORS.green;
  if (fc <= 35) return COLORS.orange;
  return COLORS.red;
}

/* ── Chart management ── */
const charts: Record<string, Chart> = {};
function destroyChart(id: string) {
  if (charts[id]) {
    charts[id].destroy();
    delete charts[id];
  }
}

/* ── Styles ── */
const S = {
  card: {
    background: COLORS.card,
    borderRadius: 12,
    padding: "18px 20px",
    border: `1px solid ${COLORS.border}`,
    marginBottom: 14,
  } as CSSProperties,
  secTitle: {
    fontSize: 9,
    textTransform: "uppercase" as const,
    letterSpacing: ".12em",
    color: "#777",
    fontWeight: 500,
    marginBottom: 12,
  } as CSSProperties,
  kpiCard: {
    background: COLORS.card,
    borderRadius: 12,
    padding: "16px 18px",
    border: `1px solid ${COLORS.border}`,
    flex: "1 1 140px",
    minWidth: 130,
  } as CSSProperties,
  kpiLabel: {
    fontSize: 10,
    textTransform: "uppercase" as const,
    letterSpacing: ".08em",
    color: COLORS.muted,
    fontWeight: 500,
    marginBottom: 4,
  } as CSSProperties,
  kpiValue: {
    fontFamily: "var(--font-oswald), Oswald, sans-serif",
    fontSize: 26,
    fontWeight: 700,
    color: COLORS.dark,
    lineHeight: 1.2,
  } as CSSProperties,
  th: {
    padding: "10px 8px",
    fontSize: 10,
    textTransform: "uppercase" as const,
    letterSpacing: ".08em",
    color: COLORS.muted,
    fontWeight: 600,
    textAlign: "left" as const,
    borderBottom: `2px solid ${COLORS.border}`,
    whiteSpace: "nowrap" as const,
  } as CSSProperties,
  td: {
    padding: "8px 8px",
    fontSize: 13,
    borderBottom: `1px solid ${COLORS.border}`,
    color: COLORS.dark,
  } as CSSProperties,
  tdNum: {
    padding: "8px 8px",
    fontSize: 13,
    borderBottom: `1px solid ${COLORS.border}`,
    color: COLORS.dark,
    textAlign: "right" as const,
    fontVariantNumeric: "tabular-nums",
  } as CSSProperties,
};

/* ══════════════════════════════════════════════════════
   COMPONENT
   ══════════════════════════════════════════════════════ */

export default function MargesPage() {
  const { current: etab } = useEtablissement();
  const accent = etab?.couleur ?? COLORS.accent;

  const [viewTab, setViewTab] = useState<ViewTab>("semaine");
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(false);
  const [sortCol, setSortCol] = useState<string>("ca_ttc");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [filterMatch, setFilterMatch] = useState<"all" | "matched" | "unmatched">("all");
  const [search, setSearch] = useState("");

  // Date navigation
  const [selectedDate, setSelectedDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  // Chart refs
  const barRef = useRef<HTMLCanvasElement>(null);
  const pieRef = useRef<HTMLCanvasElement>(null);

  // Compute date range
  const getRange = useCallback(() => {
    const d = new Date(selectedDate + "T12:00:00");
    if (viewTab === "semaine") {
      const dow = d.getDay() || 7;
      const mon = new Date(d);
      mon.setDate(d.getDate() - dow + 1);
      const sun = new Date(mon);
      sun.setDate(mon.getDate() + 6);
      return {
        from: mon.toISOString().slice(0, 10),
        to: sun.toISOString().slice(0, 10),
      };
    }
    // mois
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return {
      from: first.toISOString().slice(0, 10),
      to: last.toISOString().slice(0, 10),
    };
  }, [selectedDate, viewTab]);

  // Load data
  const loadData = useCallback(async () => {
    if (!etab) return;
    setLoading(true);
    const { from, to } = getRange();
    try {
      const res = await fetch(
        `/api/ventes/marges?etablissement_id=${etab.id}&from=${from}&to=${to}`,
      );
      const json = await res.json();
      if (json.error) {
        setData(null);
      } else {
        setData(json as ApiData);
      }
    } catch {
      setData(null);
    }
    setLoading(false);
  }, [etab, getRange]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Navigate dates
  const navigate = (dir: -1 | 1) => {
    const d = new Date(selectedDate + "T12:00:00");
    if (viewTab === "semaine") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const { from, to } = getRange();
  const rangeLabel =
    viewTab === "semaine"
      ? `Semaine du ${new Date(from + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} au ${new Date(to + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`
      : new Date(selectedDate + "T12:00:00").toLocaleDateString("fr-FR", {
          month: "long",
          year: "numeric",
        });

  // Charts
  useEffect(() => {
    if (!data) return;

    // Bar chart: Top 10 by marge_brute
    if (barRef.current) {
      destroyChart("margeBar");
      const matched = data.products.filter(
        (p) => p.matched && p.marge_brute !== null,
      );
      const top10 = [...matched]
        .sort((a, b) => (b.marge_brute ?? 0) - (a.marge_brute ?? 0))
        .slice(0, 10);

      charts["margeBar"] = new Chart(barRef.current, {
        type: "bar",
        data: {
          labels: top10.map((p) =>
            p.name.length > 20 ? p.name.slice(0, 18) + "..." : p.name,
          ),
          datasets: [
            {
              label: "Marge brute",
              data: top10.map((p) => p.marge_brute ?? 0),
              backgroundColor: top10.map((p) =>
                foodCostColor(p.food_cost_pct),
              ),
              borderRadius: 6,
            },
          ],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `${fmtDec(ctx.raw as number)} marge`,
              },
            },
          },
          scales: {
            x: {
              ticks: { callback: (v) => fmt(v as number) },
              grid: { color: "rgba(0,0,0,0.04)" },
            },
            y: {
              ticks: { font: { size: 11 } },
              grid: { display: false },
            },
          },
        },
      });
    }

    // Pie chart: food cost by category
    if (pieRef.current) {
      destroyChart("margePie");
      const cats = data.categories.filter((c) => c.cogs > 0);

      charts["margePie"] = new Chart(pieRef.current, {
        type: "doughnut",
        data: {
          labels: cats.map((c) => c.cat),
          datasets: [
            {
              data: cats.map((c) => c.cogs),
              backgroundColor: CHART_COLORS.slice(0, cats.length),
              borderWidth: 2,
              borderColor: "#fff",
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "55%",
          plugins: {
            legend: {
              position: "right",
              labels: { font: { size: 11 }, padding: 12 },
            },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const cat = cats[ctx.dataIndex];
                  return `${cat.cat}: ${fmtDec(cat.cogs)} (${cat.food_cost_pct}%)`;
                },
              },
            },
          },
        },
      });
    }

    return () => {
      destroyChart("margeBar");
      destroyChart("margePie");
    };
  }, [data]);

  // Sort & filter products
  const getFilteredProducts = (): ProductRow[] => {
    if (!data) return [];
    let prods = [...data.products];

    // Filter by category
    if (filterCat !== "all") {
      prods = prods.filter((p) => p.categorie === filterCat);
    }

    // Filter by match status
    if (filterMatch === "matched") prods = prods.filter((p) => p.matched);
    if (filterMatch === "unmatched") prods = prods.filter((p) => !p.matched);

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      prods = prods.filter((p) => p.name.toLowerCase().includes(q));
    }

    // Sort
    prods.sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortCol];
      const bv = (b as Record<string, unknown>)[sortCol];
      const an = typeof av === "number" ? av : av === null ? -Infinity : 0;
      const bn = typeof bv === "number" ? bv : bv === null ? -Infinity : 0;
      return sortDir === "desc" ? bn - an : an - bn;
    });

    return prods;
  };

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  };

  const sortArrow = (col: string) =>
    sortCol === col ? (sortDir === "desc" ? " \u25BC" : " \u25B2") : "";

  // Upsell insights
  const getInsights = () => {
    if (!data) return { bestMargin: [], worstFoodCost: [], catRanking: [] };
    const matched = data.products.filter(
      (p) => p.matched && p.marge_pct !== null,
    );
    const bestMargin = [...matched]
      .sort((a, b) => (b.marge_pct ?? 0) - (a.marge_pct ?? 0))
      .slice(0, 5);
    const worstFoodCost = [...matched]
      .filter((p) => (p.food_cost_pct ?? 0) > 30)
      .sort((a, b) => (b.food_cost_pct ?? 0) - (a.food_cost_pct ?? 0))
      .slice(0, 5);
    const catRanking = [...data.categories]
      .filter((c) => c.cogs > 0)
      .sort((a, b) => b.marge - a.marge);
    return { bestMargin, worstFoodCost, catRanking };
  };

  const K = data?.kpis;
  const filtered = getFilteredProducts();
  const insights = getInsights();
  const allCategories = data
    ? [...new Set(data.products.map((p) => p.categorie))].sort()
    : [];

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "16px 16px 60px",
          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        }}
      >
        {/* ── Toolbar ── */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 0,
              background: "#fff",
              border: "1px solid rgba(0,0,0,.08)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            {(["semaine", "mois"] as ViewTab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setViewTab(t)}
                style={{
                  padding: "8px 18px",
                  border: "none",
                  borderRight: "1px solid rgba(0,0,0,.08)",
                  background: viewTab === t ? accent : "transparent",
                  color: viewTab === t ? "#fff" : "#777",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "var(--font-oswald), Oswald, sans-serif",
                  textTransform: "uppercase",
                  letterSpacing: ".05em",
                }}
              >
                {t === "semaine" ? "Hebdo" : "Mensuel"}
              </button>
            ))}
          </div>
        </div>

        {/* ── Date navigation ── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            marginBottom: 16,
            paddingBottom: 14,
            borderBottom: "1px solid rgba(70,101,90,.15)",
          }}
        >
          <button
            type="button"
            onClick={() => navigate(-1)}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: `1px solid ${COLORS.border}`,
              background: "#fff",
              cursor: "pointer",
              fontSize: 16,
              flexShrink: 0,
            }}
          >
            &larr;
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              padding: "6px 10px",
              fontSize: 13,
              background: "#fff",
            }}
          />
          <button
            type="button"
            onClick={() => navigate(1)}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: `1px solid ${COLORS.border}`,
              background: "#fff",
              cursor: "pointer",
              fontSize: 16,
              flexShrink: 0,
            }}
          >
            &rarr;
          </button>
        </div>
        <div
          style={{
            textAlign: "center",
            fontSize: 14,
            color: COLORS.muted,
            marginBottom: 18,
          }}
        >
          {rangeLabel}
        </div>

        {loading && (
          <div
            style={{
              textAlign: "center",
              padding: 40,
              color: COLORS.muted,
              fontSize: 14,
            }}
          >
            Chargement...
          </div>
        )}

        {!loading && !data && (
          <div
            style={{
              textAlign: "center",
              padding: 40,
              color: COLORS.muted,
              fontSize: 14,
            }}
          >
            Aucune donnee de vente sur cette periode.
          </div>
        )}

        {!loading && data && K && (
          <>
            {/* ── KPI Cards ── */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                marginBottom: 20,
              }}
            >
              <div style={S.kpiCard}>
                <div style={S.kpiLabel}>CA TTC</div>
                <div style={S.kpiValue}>{fmt(K.ca_ttc)}</div>
              </div>
              <div style={S.kpiCard}>
                <div style={S.kpiLabel}>Cout matiere</div>
                <div style={S.kpiValue}>{fmt(K.cogs)}</div>
              </div>
              <div style={S.kpiCard}>
                <div style={S.kpiLabel}>Marge brute</div>
                <div style={{ ...S.kpiValue, color: COLORS.green }}>
                  {fmt(K.marge_brute)}
                </div>
              </div>
              <div style={S.kpiCard}>
                <div style={S.kpiLabel}>Food cost %</div>
                <div
                  style={{
                    ...S.kpiValue,
                    color: foodCostColor(K.food_cost_pct),
                  }}
                >
                  {K.food_cost_pct.toFixed(1)}%
                </div>
              </div>
              <div style={S.kpiCard}>
                <div style={S.kpiLabel}>Produits vendus</div>
                <div style={S.kpiValue}>{K.nb_produits}</div>
              </div>
              <div style={S.kpiCard}>
                <div style={S.kpiLabel}>Produits matches</div>
                <div style={S.kpiValue}>
                  {K.nb_matched}
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 400,
                      color: COLORS.muted,
                    }}
                  >
                    {" "}
                    / {K.nb_produits}
                  </span>
                </div>
              </div>
            </div>

            {/* ── Charts ── */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 14,
                marginBottom: 20,
              }}
            >
              <div style={S.card}>
                <div style={S.secTitle}>Top 10 produits par marge</div>
                <div style={{ height: 340 }}>
                  <canvas ref={barRef} />
                </div>
              </div>
              <div style={S.card}>
                <div style={S.secTitle}>Cout matiere par categorie</div>
                <div style={{ height: 340 }}>
                  <canvas ref={pieRef} />
                </div>
              </div>
            </div>

            {/* ── Filters ── */}
            <div style={S.card}>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <input
                  type="text"
                  placeholder="Rechercher un produit..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    flex: "1 1 180px",
                    padding: "7px 12px",
                    borderRadius: 8,
                    border: `1px solid ${COLORS.border}`,
                    fontSize: 13,
                    background: "#fff",
                  }}
                />
                <select
                  value={filterCat}
                  onChange={(e) => setFilterCat(e.target.value)}
                  style={{
                    padding: "7px 12px",
                    borderRadius: 8,
                    border: `1px solid ${COLORS.border}`,
                    fontSize: 13,
                    background: "#fff",
                  }}
                >
                  <option value="all">Toutes categories</option>
                  {allCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <select
                  value={filterMatch}
                  onChange={(e) =>
                    setFilterMatch(
                      e.target.value as "all" | "matched" | "unmatched",
                    )
                  }
                  style={{
                    padding: "7px 12px",
                    borderRadius: 8,
                    border: `1px solid ${COLORS.border}`,
                    fontSize: 13,
                    background: "#fff",
                  }}
                >
                  <option value="all">Tous</option>
                  <option value="matched">Avec recette</option>
                  <option value="unmatched">Sans recette</option>
                </select>
              </div>

              {/* ── Products Table ── */}
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr>
                      <th
                        style={{ ...S.th, cursor: "pointer" }}
                        onClick={() => handleSort("name")}
                      >
                        Produit{sortArrow("name")}
                      </th>
                      <th
                        style={{ ...S.th, cursor: "pointer" }}
                        onClick={() => handleSort("categorie")}
                      >
                        Cat.{sortArrow("categorie")}
                      </th>
                      <th
                        style={{
                          ...S.th,
                          cursor: "pointer",
                          textAlign: "right",
                        }}
                        onClick={() => handleSort("qty")}
                      >
                        Qty{sortArrow("qty")}
                      </th>
                      <th
                        style={{
                          ...S.th,
                          cursor: "pointer",
                          textAlign: "right",
                        }}
                        onClick={() => handleSort("ca_ttc")}
                      >
                        CA TTC{sortArrow("ca_ttc")}
                      </th>
                      <th
                        style={{
                          ...S.th,
                          cursor: "pointer",
                          textAlign: "right",
                        }}
                        onClick={() => handleSort("ca_ht")}
                      >
                        CA HT{sortArrow("ca_ht")}
                      </th>
                      <th
                        style={{
                          ...S.th,
                          cursor: "pointer",
                          textAlign: "right",
                        }}
                        onClick={() => handleSort("prix_revient")}
                      >
                        P.Rev. unit.{sortArrow("prix_revient")}
                      </th>
                      <th
                        style={{
                          ...S.th,
                          cursor: "pointer",
                          textAlign: "right",
                        }}
                        onClick={() => handleSort("cout_total")}
                      >
                        Cout total{sortArrow("cout_total")}
                      </th>
                      <th
                        style={{
                          ...S.th,
                          cursor: "pointer",
                          textAlign: "right",
                        }}
                        onClick={() => handleSort("marge_brute")}
                      >
                        Marge{sortArrow("marge_brute")}
                      </th>
                      <th
                        style={{
                          ...S.th,
                          cursor: "pointer",
                          textAlign: "right",
                        }}
                        onClick={() => handleSort("marge_pct")}
                      >
                        Marge %{sortArrow("marge_pct")}
                      </th>
                      <th
                        style={{
                          ...S.th,
                          cursor: "pointer",
                          textAlign: "right",
                        }}
                        onClick={() => handleSort("food_cost_pct")}
                      >
                        Food cost{sortArrow("food_cost_pct")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p, i) => (
                      <tr
                        key={`${p.name}-${i}`}
                        style={{
                          background:
                            i % 2 === 0 ? "transparent" : "rgba(0,0,0,.015)",
                        }}
                      >
                        <td
                          style={{
                            ...S.td,
                            maxWidth: 200,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontWeight: 500,
                          }}
                          title={p.name}
                        >
                          {p.name}
                          {!p.matched && (
                            <span
                              style={{
                                fontSize: 9,
                                color: COLORS.orange,
                                marginLeft: 4,
                                fontWeight: 400,
                              }}
                            >
                              non matche
                            </span>
                          )}
                        </td>
                        <td
                          style={{
                            ...S.td,
                            fontSize: 11,
                            color: COLORS.muted,
                          }}
                        >
                          {p.categorie}
                        </td>
                        <td style={S.tdNum}>{p.qty}</td>
                        <td style={S.tdNum}>{fmtDec(p.ca_ttc)}</td>
                        <td style={S.tdNum}>{fmtDec(p.ca_ht)}</td>
                        <td style={S.tdNum}>
                          {p.prix_revient !== null
                            ? fmtDec(p.prix_revient)
                            : "-"}
                        </td>
                        <td style={S.tdNum}>
                          {p.cout_total !== null ? fmtDec(p.cout_total) : "-"}
                        </td>
                        <td
                          style={{
                            ...S.tdNum,
                            fontWeight: 600,
                            color:
                              p.marge_brute !== null && p.marge_brute >= 0
                                ? COLORS.green
                                : p.marge_brute !== null
                                  ? COLORS.red
                                  : COLORS.muted,
                          }}
                        >
                          {p.marge_brute !== null
                            ? fmtDec(p.marge_brute)
                            : "-"}
                        </td>
                        <td style={S.tdNum}>{fmtPct(p.marge_pct)}</td>
                        <td
                          style={{
                            ...S.tdNum,
                            fontWeight: 600,
                            color: foodCostColor(p.food_cost_pct),
                          }}
                        >
                          {fmtPct(p.food_cost_pct)}
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td
                          colSpan={10}
                          style={{
                            ...S.td,
                            textAlign: "center",
                            color: COLORS.muted,
                            padding: 30,
                          }}
                        >
                          Aucun produit
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: COLORS.muted,
                  marginTop: 8,
                }}
              >
                {filtered.length} produit{filtered.length > 1 ? "s" : ""} affiche
                {filtered.length > 1 ? "s" : ""}
              </div>
            </div>

            {/* ── Upsell Insights ── */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 14,
                marginTop: 6,
              }}
            >
              {/* Best margin products */}
              <div style={S.card}>
                <div
                  style={{
                    ...S.secTitle,
                    color: COLORS.green,
                  }}
                >
                  Meilleure marge % — a pousser
                </div>
                {insights.bestMargin.length === 0 && (
                  <div style={{ fontSize: 12, color: COLORS.muted }}>
                    Aucune donnee
                  </div>
                )}
                {insights.bestMargin.map((p, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "6px 0",
                      borderBottom:
                        i < insights.bestMargin.length - 1
                          ? `1px solid ${COLORS.border}`
                          : "none",
                      fontSize: 12,
                    }}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "65%",
                      }}
                      title={p.name}
                    >
                      {p.name}
                    </span>
                    <span
                      style={{
                        fontWeight: 600,
                        color: COLORS.green,
                      }}
                    >
                      {fmtPct(p.marge_pct)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Worst food cost */}
              <div style={S.card}>
                <div
                  style={{
                    ...S.secTitle,
                    color: COLORS.red,
                  }}
                >
                  Pire food cost % — revoir pricing
                </div>
                {insights.worstFoodCost.length === 0 && (
                  <div style={{ fontSize: 12, color: COLORS.muted }}>
                    Tout est sous 30% !
                  </div>
                )}
                {insights.worstFoodCost.map((p, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "6px 0",
                      borderBottom:
                        i < insights.worstFoodCost.length - 1
                          ? `1px solid ${COLORS.border}`
                          : "none",
                      fontSize: 12,
                    }}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "65%",
                      }}
                      title={p.name}
                    >
                      {p.name}
                    </span>
                    <span
                      style={{
                        fontWeight: 600,
                        color: foodCostColor(p.food_cost_pct),
                      }}
                    >
                      {fmtPct(p.food_cost_pct)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Category ranking */}
              <div style={S.card}>
                <div style={S.secTitle}>Classement categories</div>
                {insights.catRanking.length === 0 && (
                  <div style={{ fontSize: 12, color: COLORS.muted }}>
                    Aucune donnee
                  </div>
                )}
                {insights.catRanking.map((c, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "6px 0",
                      borderBottom:
                        i < insights.catRanking.length - 1
                          ? `1px solid ${COLORS.border}`
                          : "none",
                      fontSize: 12,
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{c.cat}</span>
                    <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span style={{ color: COLORS.muted, fontSize: 11 }}>
                        {fmt(c.marge)}
                      </span>
                      <span
                        style={{
                          fontWeight: 600,
                          color: foodCostColor(c.food_cost_pct),
                          minWidth: 45,
                          textAlign: "right",
                        }}
                      >
                        {c.food_cost_pct.toFixed(1)}%
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </RequireRole>
  );
}
