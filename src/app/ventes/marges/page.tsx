"use client";

import { useEffect, useState, useRef, useCallback, type CSSProperties } from "react";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import Link from "next/link";
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

type SortKey =
  | "name"
  | "categorie"
  | "qty"
  | "ca_ttc"
  | "ca_ht"
  | "prix_revient"
  | "cout_total"
  | "marge_brute"
  | "marge_pct"
  | "food_cost_pct";

const STRING_SORT_KEYS: SortKey[] = ["name", "categorie"];

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
  const [sortKey, setSortKey] = useState<SortKey>("ca_ttc");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterCat, setFilterCat] = useState<string>("all");
  const [filterMatch, setFilterMatch] = useState<"all" | "matched" | "unmatched">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

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

  useEffect(() => {
    loadData(); // eslint-disable-line react-hooks/set-state-in-effect -- data fetch on mount/deps change
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
      const av = (a as Record<string, unknown>)[sortKey];
      const bv = (b as Record<string, unknown>)[sortKey];

      if (STRING_SORT_KEYS.includes(sortKey)) {
        const as = typeof av === "string" ? av.toLowerCase() : "";
        const bs = typeof bv === "string" ? bv.toLowerCase() : "";
        const cmp = as.localeCompare(bs, "fr-FR");
        return sortDir === "desc" ? -cmp : cmp;
      }

      const an = typeof av === "number" ? av : av === null ? -Infinity : 0;
      const bn = typeof bv === "number" ? bv : bv === null ? -Infinity : 0;
      return sortDir === "desc" ? bn - an : an - bn;
    });

    return prods;
  };

  const handleSort = (col: SortKey) => {
    if (sortKey === col) {
      setSortDir(sortDir === "desc" ? "asc" : "desc");
    } else {
      setSortKey(col);
      setSortDir("desc");
    }
    setPage(1);
  };

  const sortArrow = (col: SortKey) =>
    sortKey === col ? (sortDir === "desc" ? " \u25BC" : " \u25B2") : "";

  // Insights
  const getInsights = () => {
    if (!data) return {
      topMarginEur: [] as ProductRow[],
      foodCostAlerts: [] as { product: ProductRow; lostMoney: number }[],
      unmatchedHighVol: [] as ProductRow[],
      catSummary: [] as CategoryRow[],
      pricingImpact: [] as { product: ProductRow; priceIncrease: number }[],
    };

    const matched = data.products.filter(
      (p) => p.matched && p.marge_brute !== null,
    );

    // Card 1: Top 5 by margin in euros
    const topMarginEur = [...matched]
      .sort((a, b) => (b.marge_brute ?? 0) - (a.marge_brute ?? 0))
      .slice(0, 5);

    // Card 2: Food cost alerts (>35%, qty>10)
    const foodCostAlerts = matched
      .filter((p) => (p.food_cost_pct ?? 0) > 35 && p.qty > 10)
      .sort((a, b) => (b.food_cost_pct ?? 0) - (a.food_cost_pct ?? 0))
      .map((p) => {
        // Money lost vs 30% target: actual cost - (ca_ht * 0.30)
        const targetCost = p.ca_ht * 0.30;
        const actualCost = p.cout_total ?? 0;
        const lostMoney = actualCost - targetCost;
        return { product: p, lostMoney };
      });

    // Card 3: Unmatched high volume
    const unmatchedHighVol = data.products
      .filter((p) => !p.matched)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);

    // Card 4: Category summary sorted by food cost
    const catSummary = [...data.categories]
      .filter((c) => c.cogs > 0)
      .sort((a, b) => b.food_cost_pct - a.food_cost_pct);

    // Card 5: Pricing impact for food cost > 35%
    const pricingImpact = matched
      .filter((p) => (p.food_cost_pct ?? 0) > 35 && p.qty > 0 && p.prix_revient !== null)
      .map((p) => {
        // Target: food_cost = 30% => prix_revient / new_price_ht = 0.30
        // new_price_ht = prix_revient / 0.30
        // current price_ht per unit = ca_ht / qty
        const currentPriceHt = p.ca_ht / p.qty;
        const newPriceHt = (p.prix_revient ?? 0) / 0.30;
        const priceIncrease = newPriceHt - currentPriceHt;
        return { product: p, priceIncrease };
      })
      .filter((x) => x.priceIncrease > 0)
      .sort((a, b) => b.priceIncrease - a.priceIncrease);

    return { topMarginEur, foodCostAlerts, unmatchedHighVol, catSummary, pricingImpact };
  };

  const K = data?.kpis;
  const filtered = getFilteredProducts();
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paginatedProducts = filtered.slice((safePage - 1) * perPage, safePage * perPage);
  const insights = getInsights();
  const allCategories = data
    ? [...new Set(data.products.map((p) => p.categorie))].sort()
    : [];

  const unmatchedCount = data ? data.products.filter((p) => !p.matched).length : 0;

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div
        className="ventes-marges-container"
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "16px 16px 60px",
          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        }}
      >
        {/* ── Unmatched products banner ── */}
        {!loading && data && unmatchedCount > 0 && (
          <div
            style={{
              background: "#fef3cd",
              border: "1px solid #ffc107",
              borderRadius: 10,
              padding: "12px 18px",
              marginBottom: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span style={{ fontSize: 13, color: "#856404", fontWeight: 500 }}>
              {unmatchedCount} produit{unmatchedCount > 1 ? "s" : ""} vendu{unmatchedCount > 1 ? "s" : ""} n&apos;ont pas de cout associe. Liez-les pour une analyse complete.
            </span>
            <Link
              href="/ventes/articles"
              style={{
                padding: "6px 16px",
                borderRadius: 8,
                background: "#d4a03c",
                color: "#fff",
                fontSize: 12,
                fontWeight: 600,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              Lier les produits
            </Link>
          </div>
        )}

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
              className="ventes-marges-kpis"
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
              className="ventes-marges-charts"
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
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
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
                  onChange={(e) => { setFilterCat(e.target.value); setPage(1); }}
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
                  onChange={(e) => {
                    setFilterMatch(
                      e.target.value as "all" | "matched" | "unmatched",
                    );
                    setPage(1);
                  }}
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
              <div className="ventes-table-scroll" style={{ overflowX: "auto" }}>
                <table
                  className="ventes-marges-table"
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
                        Cout unit.{sortArrow("prix_revient")}
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
                    {paginatedProducts.map((p, i) => {
                      const globalIdx = (safePage - 1) * perPage + i;
                      return (
                        <tr
                          key={`${p.name}-${globalIdx}`}
                          style={{
                            background:
                              globalIdx % 2 === 0 ? "transparent" : "rgba(0,0,0,.015)",
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
                      );
                    })}
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

              {/* ── Pagination ── */}
              <div
                className="ventes-pagination"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 10,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <span style={{ fontSize: 11, color: COLORS.muted }}>
                    {filtered.length} produit{filtered.length > 1 ? "s" : ""} affiche
                    {filtered.length > 1 ? "s" : ""}
                  </span>
                  <select
                    value={perPage}
                    onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: `1px solid ${COLORS.border}`,
                      fontSize: 11,
                      background: "#fff",
                      color: COLORS.dark,
                    }}
                  >
                    {[10, 20, 30, 50, 100].map((n) => (
                      <option key={n} value={n}>{n} / page</option>
                    ))}
                  </select>
                </div>
                {totalPages > 1 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      type="button"
                      disabled={safePage <= 1}
                      onClick={() => setPage(safePage - 1)}
                      style={{
                        padding: "5px 12px",
                        borderRadius: 8,
                        border: `1px solid ${COLORS.border}`,
                        background: safePage <= 1 ? "#f5f5f5" : "#fff",
                        color: safePage <= 1 ? COLORS.muted : COLORS.dark,
                        fontSize: 12,
                        cursor: safePage <= 1 ? "default" : "pointer",
                        fontWeight: 500,
                      }}
                    >
                      Precedent
                    </button>
                    <span style={{ fontSize: 12, color: COLORS.muted, minWidth: 90, textAlign: "center" }}>
                      Page {safePage} sur {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={safePage >= totalPages}
                      onClick={() => setPage(safePage + 1)}
                      style={{
                        padding: "5px 12px",
                        borderRadius: 8,
                        border: `1px solid ${COLORS.border}`,
                        background: safePage >= totalPages ? "#f5f5f5" : "#fff",
                        color: safePage >= totalPages ? COLORS.muted : COLORS.dark,
                        fontSize: 12,
                        cursor: safePage >= totalPages ? "default" : "pointer",
                        fontWeight: 500,
                      }}
                    >
                      Suivant
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ── Upsell Insights ── */}
            <div
              className="ventes-marges-insights"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 14,
                marginTop: 6,
              }}
            >
              {/* Card 1: Produits les plus rentables */}
              <div style={S.card}>
                <div
                  style={{
                    ...S.secTitle,
                    color: COLORS.green,
                  }}
                >
                  Produits les plus rentables
                </div>
                {insights.topMarginEur.length === 0 && (
                  <div style={{ fontSize: 12, color: COLORS.muted }}>
                    Aucune donnee
                  </div>
                )}
                {insights.topMarginEur.map((p, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "6px 0",
                      borderBottom:
                        i < insights.topMarginEur.length - 1
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
                        maxWidth: "50%",
                      }}
                      title={p.name}
                    >
                      {p.name}
                    </span>
                    <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <span style={{ fontWeight: 600, color: COLORS.green }}>
                        {fmtDec(p.marge_brute ?? 0)}
                      </span>
                      <span style={{ color: COLORS.muted, fontSize: 11 }}>
                        {fmtPct(p.marge_pct)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>

              {/* Card 2: Alertes food cost */}
              <div style={S.card}>
                <div
                  style={{
                    ...S.secTitle,
                    color: COLORS.red,
                  }}
                >
                  Alertes food cost
                </div>
                {insights.foodCostAlerts.length === 0 && (
                  <div style={{ fontSize: 12, color: COLORS.muted }}>
                    Aucun produit avec food cost &gt; 35% et volume significatif
                  </div>
                )}
                {insights.foodCostAlerts.map(({ product: p, lostMoney }, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "6px 0",
                      borderBottom:
                        i < insights.foodCostAlerts.length - 1
                          ? `1px solid ${COLORS.border}`
                          : "none",
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: "45%",
                          fontWeight: 500,
                        }}
                        title={p.name}
                      >
                        {p.name}
                      </span>
                      <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontWeight: 600, color: COLORS.red }}>
                          {fmtPct(p.food_cost_pct)}
                        </span>
                        <span style={{ color: COLORS.muted }}>
                          x{p.qty}
                        </span>
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.red, marginTop: 2 }}>
                      Perte vs objectif 30% : {fmtDec(lostMoney)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Card 3: Opportunites de marge */}
              <div style={S.card}>
                <div
                  style={{
                    ...S.secTitle,
                    color: COLORS.orange,
                  }}
                >
                  Opportunites de marge
                </div>
                {insights.unmatchedHighVol.length === 0 && (
                  <div style={{ fontSize: 12, color: COLORS.muted }}>
                    Tous les produits sont lies !
                  </div>
                )}
                {insights.unmatchedHighVol.map((p, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "6px 0",
                      borderBottom:
                        i < insights.unmatchedHighVol.length - 1
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
                        maxWidth: "40%",
                        fontWeight: 500,
                      }}
                      title={p.name}
                    >
                      {p.name}
                    </span>
                    <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ color: COLORS.muted }}>x{p.qty}</span>
                      <span style={{ fontWeight: 500 }}>{fmtDec(p.ca_ttc)}</span>
                      <Link
                        href="/ventes/articles"
                        style={{
                          fontSize: 10,
                          color: COLORS.accent,
                          textDecoration: "underline",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Lier
                      </Link>
                    </span>
                  </div>
                ))}
                {insights.unmatchedHighVol.length > 0 && (
                  <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 8, fontStyle: "italic" }}>
                    Liez ces produits pour connaitre leur marge
                  </div>
                )}
              </div>

              {/* Card 5: Impact pricing */}
              <div style={S.card}>
                <div
                  style={{
                    ...S.secTitle,
                    color: COLORS.accent,
                  }}
                >
                  Impact pricing
                </div>
                {insights.pricingImpact.length === 0 && (
                  <div style={{ fontSize: 12, color: COLORS.muted }}>
                    Aucun produit ne necessite d&apos;ajustement de prix
                  </div>
                )}
                {insights.pricingImpact.slice(0, 8).map(({ product: p, priceIncrease }, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "6px 0",
                      borderBottom:
                        i < Math.min(insights.pricingImpact.length, 8) - 1
                          ? `1px solid ${COLORS.border}`
                          : "none",
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: "50%",
                          fontWeight: 500,
                        }}
                        title={p.name}
                      >
                        {p.name}
                      </span>
                      <span style={{ fontWeight: 600, color: COLORS.red }}>
                        {fmtPct(p.food_cost_pct)}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.accent, marginTop: 2 }}>
                      +{fmtDec(priceIncrease)} HT/unite pour atteindre 30% food cost
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Menu Engineering ── */}
            {(() => {
              const matched = data.products.filter(
                (p) => p.matched && p.prix_revient !== null && p.prix_revient > 0 && p.qty > 0,
              );
              if (matched.length === 0) return null;

              const avgQty = matched.reduce((s, p) => s + p.qty, 0) / matched.length;
              const avgMarginUnit = matched.reduce((s, p) => s + ((p.ca_ht / p.qty) - (p.prix_revient ?? 0)), 0) / matched.length;

              type Quadrant = { key: string; label: string; color: string; icon: string; desc: string; products: (ProductRow & { marginUnit: number })[] };
              const quadrants: Quadrant[] = [
                { key: "stars", label: "Stars", color: "#2e7d32", icon: "\u25CF", desc: "Haute popularite + haute marge. A promouvoir.", products: [] },
                { key: "puzzles", label: "Puzzles", color: "#1565c0", icon: "\u25CF", desc: "Basse popularite + haute marge. Augmenter la visibilite.", products: [] },
                { key: "workhorses", label: "Workhorses", color: "#e65100", icon: "\u25CF", desc: "Haute popularite + basse marge. Augmenter le prix ou reduire le cout.", products: [] },
                { key: "dogs", label: "Dogs", color: "#c62828", icon: "\u25CF", desc: "Basse popularite + basse marge. Envisager de retirer.", products: [] },
              ];

              for (const p of matched) {
                const marginUnit = (p.ca_ht / p.qty) - (p.prix_revient ?? 0);
                const highPop = p.qty >= avgQty;
                const highMargin = marginUnit >= avgMarginUnit;
                const entry = { ...p, marginUnit };
                if (highPop && highMargin) quadrants[0].products.push(entry);
                else if (!highPop && highMargin) quadrants[1].products.push(entry);
                else if (highPop && !highMargin) quadrants[2].products.push(entry);
                else quadrants[3].products.push(entry);
              }

              // Sort each quadrant by margin desc
              for (const q of quadrants) {
                q.products.sort((a, b) => b.marginUnit - a.marginUnit);
              }

              return (
                <div style={{ ...S.card, marginTop: 14 }}>
                  <div style={S.secTitle}>Menu Engineering</div>
                  <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 14 }}>
                    Classification des produits selon leur popularite (quantite vendue) et leur rentabilite (marge unitaire).
                    Moyennes : {avgQty.toFixed(1)} unites vendues / {fmtDec(avgMarginUnit)} marge unitaire.
                  </div>
                  <div
                    className="ventes-marges-engineering"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                    }}
                  >
                    {quadrants.map((q) => (
                      <div
                        key={q.key}
                        style={{
                          border: `1px solid ${q.color}30`,
                          borderRadius: 10,
                          padding: "14px 16px",
                          background: `${q.color}08`,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                          <span style={{ fontSize: 16, color: q.color }}>{q.icon}</span>
                          <span style={{ fontWeight: 700, fontSize: 14, color: q.color }}>
                            {q.label}
                          </span>
                          <span style={{ fontSize: 11, color: COLORS.muted, marginLeft: "auto" }}>
                            {q.products.length} produit{q.products.length > 1 ? "s" : ""}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 8, fontStyle: "italic" }}>
                          {q.desc}
                        </div>
                        {q.products.length === 0 && (
                          <div style={{ fontSize: 11, color: COLORS.muted }}>Aucun produit</div>
                        )}
                        {q.products.slice(0, 5).map((p, i) => (
                          <div
                            key={i}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "4px 0",
                              borderBottom: i < Math.min(q.products.length, 5) - 1 ? `1px solid ${COLORS.border}` : "none",
                              fontSize: 12,
                            }}
                          >
                            <span
                              style={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                maxWidth: "50%",
                              }}
                              title={p.name}
                            >
                              {p.name}
                            </span>
                            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                              <span style={{ color: COLORS.muted, fontSize: 11 }}>x{p.qty}</span>
                              <span style={{ fontWeight: 600, color: q.color }}>{fmtDec(p.marginUnit)}</span>
                            </span>
                          </div>
                        ))}
                        {q.products.length > 5 && (
                          <div style={{ fontSize: 10, color: COLORS.muted, marginTop: 4 }}>
                            +{q.products.length - 5} autre{q.products.length - 5 > 1 ? "s" : ""}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Card 4: Resume par categorie — Full width */}
            <div style={{ ...S.card, marginTop: 14 }}>
              <div style={S.secTitle}>Resume par categorie</div>
              <div className="ventes-table-scroll" style={{ overflowX: "auto" }}>
                <table
                  className="ventes-marges-cat-table"
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr>
                      <th style={S.th}>Categorie</th>
                      <th style={{ ...S.th, textAlign: "right" }}>CA TTC</th>
                      <th style={{ ...S.th, textAlign: "right" }}>CA HT</th>
                      <th style={{ ...S.th, textAlign: "right" }}>Cout total</th>
                      <th style={{ ...S.th, textAlign: "right" }}>Marge brute</th>
                      <th style={{ ...S.th, textAlign: "right" }}>Food cost %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {insights.catSummary.map((c, i) => (
                      <tr
                        key={c.cat}
                        style={{
                          background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,.015)",
                        }}
                      >
                        <td style={{ ...S.td, fontWeight: 500 }}>{c.cat}</td>
                        <td style={S.tdNum}>{fmtDec(c.ca_ttc)}</td>
                        <td style={S.tdNum}>{fmtDec(c.ca_ht)}</td>
                        <td style={S.tdNum}>{fmtDec(c.cogs)}</td>
                        <td style={{ ...S.tdNum, fontWeight: 600, color: COLORS.green }}>
                          {fmtDec(c.marge)}
                        </td>
                        <td
                          style={{
                            ...S.tdNum,
                            fontWeight: 700,
                            color: foodCostColor(c.food_cost_pct),
                            background:
                              c.food_cost_pct > 35
                                ? "rgba(192,57,43,.08)"
                                : c.food_cost_pct > 30
                                  ? "rgba(212,160,60,.08)"
                                  : "rgba(58,125,68,.06)",
                            borderRadius: 4,
                          }}
                        >
                          {c.food_cost_pct.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                    {insights.catSummary.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          style={{
                            ...S.td,
                            textAlign: "center",
                            color: COLORS.muted,
                            padding: 20,
                          }}
                        >
                          Aucune donnee
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </RequireRole>
  );
}
