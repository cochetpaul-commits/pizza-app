"use client";

import { useEffect, useState } from "react";

import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { supabase } from "@/lib/supabaseClient";
import { CAT_LABELS, CAT_COLORS, type Category } from "@/types/ingredients";
import { getSupplierColor } from "@/lib/supplierColors";

type PeriodKey = "1" | "3" | "6" | "12";
type ViewTab = "fournisseur" | "categorie";

type SupplierStat = {
  name: string;
  totalHT: number;
  nbFactures: number;
  pct: number;
  color: string;
};

type CategoryStat = {
  category: Category | "autre";
  label: string;
  totalHT: number;
  pct: number;
  color: string;
};

type MonthSegment = {
  name: string;
  amount: number;
  color: string;
  pct: number; // % of this month's total width
};

type MonthBar = {
  label: string;
  total: number;
  pct: number;
  nbFactures: number;
  segments: MonthSegment[];
};

type KpiCard = {
  label: string;
  value: string;
  trend?: number | null; // % vs previous period
};

const fmt = (n: number) =>
  n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });

const fmtCompact = (n: number) =>
  n >= 1000
    ? n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : fmt(n);

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "1", label: "Ce mois" },
  { key: "3", label: "3 mois" },
  { key: "6", label: "6 mois" },
  { key: "12", label: "12 mois" },
];

function getStartDate(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months + 1);
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

export default function StatsAchatsPage() {
  const etab = useEtablissement();
  const [period, setPeriod] = useState<PeriodKey>("3");
  const [viewTab, setViewTab] = useState<ViewTab>("fournisseur");
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<KpiCard[]>([]);
  const [topSuppliers, setTopSuppliers] = useState<SupplierStat[]>([]);
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);
  const [monthBars, setMonthBars] = useState<MonthBar[]>([]);

  const etabId = etab.current?.id ?? null;

  useEffect(() => {
    (async () => {
      setLoading(true);

      const months = parseInt(period);
      const startDate = getStartDate(months);

      // Current period — filter by etablissement
      let q = supabase
        .from("supplier_invoices")
        .select("invoice_date, total_ht, supplier_id, suppliers(name)")
        .gte("invoice_date", startDate)
        .order("invoice_date", { ascending: true });
      if (etabId) q = q.eq("etablissement_id", etabId);

      const { data } = await q;

      const rows = (data ?? []) as unknown as {
        invoice_date: string | null;
        total_ht: number | null;
        supplier_id: string | null;
        suppliers: { name: string } | null;
      }[];

      // Previous period (for trend)
      const prevStart = getStartDate(months * 2);
      let prevQ = supabase
        .from("supplier_invoices")
        .select("total_ht")
        .gte("invoice_date", prevStart)
        .lt("invoice_date", startDate);
      if (etabId) prevQ = prevQ.eq("etablissement_id", etabId);

      const { data: prevData } = await prevQ;

      const prevTotal = (prevData ?? []).reduce((s, r: { total_ht: number | null }) => s + (r.total_ht ?? 0), 0);

      // Total HT
      const total = rows.reduce((s, r) => s + (r.total_ht ?? 0), 0);
      const nbFactures = rows.length;

      // Suppliers stats — group by name (normalized) to merge duplicate supplier entries
      const bySupplier: Record<string, { name: string; totalHT: number; nbFactures: number; supplierIds: string[] }> = {};
      const allSupplierIds = new Set<string>();
      for (const r of rows) {
        const sid = r.supplier_id ?? "?";
        allSupplierIds.add(sid);
        const name = r.suppliers?.name ?? "Inconnu";
        const key = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        if (!bySupplier[key]) bySupplier[key] = { name, totalHT: 0, nbFactures: 0, supplierIds: [] };
        if (!bySupplier[key].supplierIds.includes(sid)) bySupplier[key].supplierIds.push(sid);
        bySupplier[key].totalHT += r.total_ht ?? 0;
        bySupplier[key].nbFactures += 1;
      }

      const supplierList = Object.values(bySupplier)
        .sort((a, b) => b.totalHT - a.totalHT)
        .map((s) => ({
          ...s,
          pct: total > 0 ? (s.totalHT / total) * 100 : 0,
          color: getSupplierColor(s.name),
        }));
      setTopSuppliers(supplierList);

      // Category stats: map supplier → ingredient categories, then distribute invoice totals
      const supplierIdsArr = Array.from(allSupplierIds);
      const byCat: Record<string, number> = {};
      if (supplierIdsArr.length > 0) {
        // Get ingredients per supplier with their categories
        let ingQ = supabase
          .from("ingredients")
          .select("supplier_id, category")
          .in("supplier_id", supplierIdsArr)
          .not("category", "is", null);
        if (etabId) ingQ = ingQ.or(`etablissement_id.eq.${etabId},etablissement_id.is.null`);
        const { data: ingData } = await ingQ;

        // Count ingredients per supplier per category
        const supplierCatCounts: Record<string, Record<string, number>> = {};
        for (const ing of (ingData ?? []) as { supplier_id: string; category: string | null }[]) {
          const sid = ing.supplier_id;
          const cat = ing.category ?? "autre";
          if (!supplierCatCounts[sid]) supplierCatCounts[sid] = {};
          supplierCatCounts[sid][cat] = (supplierCatCounts[sid][cat] ?? 0) + 1;
        }

        // Distribute each supplier group's total_ht proportionally across categories
        for (const group of Object.values(bySupplier)) {
          // Merge category counts across all supplier IDs in this group
          const mergedCats: Record<string, number> = {};
          for (const sid of group.supplierIds) {
            const cats = supplierCatCounts[sid];
            if (!cats) continue;
            for (const [cat, count] of Object.entries(cats)) {
              mergedCats[cat] = (mergedCats[cat] ?? 0) + count;
            }
          }
          const totalIngs = Object.values(mergedCats).reduce((s, c) => s + c, 0);
          if (totalIngs === 0) continue;
          for (const [cat, count] of Object.entries(mergedCats)) {
            byCat[cat] = (byCat[cat] ?? 0) + (group.totalHT * count) / totalIngs;
          }
        }
      }

      const catTotal = Object.values(byCat).reduce((s, v) => s + v, 0);
      const catList = Object.entries(byCat)
        .sort(([, a], [, b]) => b - a)
        .map(([cat, totalCat]) => ({
          category: cat as Category | "autre",
          label: CAT_LABELS[cat as Category] ?? "Autre",
          totalHT: totalCat,
          pct: catTotal > 0 ? (totalCat / catTotal) * 100 : 0,
          color: CAT_COLORS[cat as Category] ?? "#6B7280",
        }));
      setCategoryStats(catList);

      // KPIs with trend
      const avgMonthly = months > 0 ? total / months : 0;
      // Cap trend at ±999% to avoid absurd numbers when previous period is near zero
      const rawTrend = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;
      const trend = rawTrend != null ? Math.max(-999, Math.min(999, rawTrend)) : null;

      setKpis([
        { label: "Total achats HT", value: fmt(total), trend },
        { label: "Moyenne mensuelle", value: fmt(avgMonthly) },
        { label: "Fournisseurs actifs", value: String(Object.keys(bySupplier).length) },
        { label: "Factures traitees", value: String(nbFactures) },
      ]);

      // Monthly bars with supplier breakdown
      const byMonth: Record<string, number> = {};
      const byMonthSupplier: Record<string, Record<string, number>> = {}; // month → supplierKey → amount
      const byMonthCount: Record<string, number> = {};
      for (const r of rows) {
        if (!r.invoice_date) continue;
        const key = r.invoice_date.slice(0, 7);
        byMonth[key] = (byMonth[key] ?? 0) + (r.total_ht ?? 0);
        byMonthCount[key] = (byMonthCount[key] ?? 0) + 1;
        const name = r.suppliers?.name ?? "Inconnu";
        const skey = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        if (!byMonthSupplier[key]) byMonthSupplier[key] = {};
        byMonthSupplier[key][skey] = (byMonthSupplier[key][skey] ?? 0) + (r.total_ht ?? 0);
      }

      // Build supplier name→color map from supplierList
      const supplierColorMap: Record<string, { name: string; color: string }> = {};
      for (const s of supplierList) {
        const skey = s.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        supplierColorMap[skey] = { name: s.name, color: s.color };
      }

      const allMonths: string[] = [];
      const d = new Date();
      for (let i = months - 1; i >= 0; i--) {
        const md = new Date(d.getFullYear(), d.getMonth() - i, 1);
        const key = md.toISOString().slice(0, 7);
        allMonths.push(key);
        if (!byMonth[key]) byMonth[key] = 0;
      }

      // Only show months that have data
      const monthsWithData = allMonths.filter((k) => byMonth[k] > 0);
      const maxMonth = Math.max(...monthsWithData.map((k) => byMonth[k]), 1);
      const monthNames = ["Jan", "Fev", "Mar", "Avr", "Mai", "Jun", "Jul", "Aou", "Sep", "Oct", "Nov", "Dec"];
      const bars: MonthBar[] = monthsWithData.map((k) => {
        const [y, m] = k.split("-");
        const monthTotal = byMonth[k];
        const supplierBreakdown = byMonthSupplier[k] ?? {};
        const segments: MonthSegment[] = Object.entries(supplierBreakdown)
          .sort(([, a], [, b]) => b - a)
          .map(([skey, amount]) => ({
            name: supplierColorMap[skey]?.name ?? skey,
            amount,
            color: supplierColorMap[skey]?.color ?? "#999",
            pct: monthTotal > 0 ? (amount / monthTotal) * 100 : 0,
          }));
        return {
          label: `${monthNames[parseInt(m) - 1]} ${y.slice(2)}`,
          total: monthTotal,
          pct: (monthTotal / maxMonth) * 100,
          nbFactures: byMonthCount[k] ?? 0,
          segments,
        };
      });
      setMonthBars(bars);

      setLoading(false);
    })();
  }, [period, etabId]);

  // Max for horizontal bars
  const maxSupplier = topSuppliers.length > 0 ? topSuppliers[0].totalHT : 1;
  const maxCategory = categoryStats.length > 0 ? categoryStats[0].totalHT : 1;

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 40px" }}>
        <h1 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, fontSize: 24, color: "#1a1a1a", margin: "0 0 20px" }}>
          Repartition des achats
        </h1>

        {/* Period selector */}
        <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              style={{
                fontFamily: "DM Sans, sans-serif",
                fontSize: 13,
                fontWeight: 600,
                padding: "7px 16px",
                borderRadius: 20,
                border: period === p.key ? "2px solid #D4775A" : "1px solid #ddd6c8",
                background: period === p.key ? "#D4775A" : "#fff",
                color: period === p.key ? "#fff" : "#1a1a1a",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p style={{ color: "#999", fontSize: 14, textAlign: "center", marginTop: 40 }}>Chargement...</p>
        ) : (
          <>
            {/* KPI cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 28 }}>
              {kpis.map((k) => (
                <div
                  key={k.label}
                  style={{
                    background: "#fff",
                    borderRadius: 12,
                    padding: "18px 20px",
                    border: "1px solid #e5ddd0",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                  }}
                >
                  <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "#999", marginBottom: 8 }}>
                    {k.label}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, fontSize: 22, color: "#1a1a1a" }}>
                      {k.value}
                    </span>
                    {k.trend != null && (
                      <span style={{
                        fontSize: 12, fontWeight: 600,
                        color: k.trend >= 0 ? "#DC2626" : "#16a34a",
                        display: "flex", alignItems: "center", gap: 2,
                      }}>
                        {k.trend >= 0 ? "↑" : "↓"} {Math.abs(k.trend).toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* View tabs */}
            <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "2px solid #e5ddd0" }}>
              {([
                { key: "fournisseur" as ViewTab, label: "Par fournisseur" },
                { key: "categorie" as ViewTab, label: "Par categorie" },
              ]).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setViewTab(tab.key)}
                  style={{
                    fontFamily: "DM Sans, sans-serif",
                    fontSize: 14, fontWeight: 600,
                    padding: "10px 20px",
                    border: "none", cursor: "pointer",
                    background: "transparent",
                    color: viewTab === tab.key ? "#D4775A" : "#999",
                    borderBottom: viewTab === tab.key ? "2px solid #D4775A" : "2px solid transparent",
                    marginBottom: -2,
                    transition: "color 0.15s",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* === Par fournisseur === */}
            {viewTab === "fournisseur" && (
              <>
                {topSuppliers.length === 0 ? (
                  <p style={{ color: "#999", fontSize: 14, marginBottom: 28 }}>Aucune donnee sur la periode.</p>
                ) : (
                  <div style={{ marginBottom: 28 }}>
                    {topSuppliers.map((s) => (
                      <div
                        key={s.name}
                        style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "10px 0",
                          borderBottom: "1px solid #f0ebe2",
                        }}
                      >
                        <span style={{
                          width: 12, height: 12, borderRadius: "50%",
                          background: s.color, flexShrink: 0,
                        }} />
                        <span style={{
                          fontFamily: "DM Sans, sans-serif",
                          fontSize: 14, fontWeight: 500, color: "#1a1a1a",
                          width: 160, flexShrink: 0,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {s.name}
                        </span>
                        <div style={{ flex: 1, height: 24, background: "#f0ebe2", borderRadius: 6, overflow: "hidden" }}>
                          <div style={{
                            width: `${Math.max((s.totalHT / maxSupplier) * 100, 2)}%`,
                            height: "100%",
                            background: s.color,
                            borderRadius: 6,
                            display: "flex", alignItems: "center", justifyContent: "flex-end",
                            paddingRight: 8,
                            transition: "width 0.3s ease",
                          }}>
                            {(s.totalHT / maxSupplier) * 100 > 25 && (
                              <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>
                                {fmtCompact(s.totalHT)}
                              </span>
                            )}
                          </div>
                        </div>
                        {(s.totalHT / maxSupplier) * 100 <= 25 && (
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", flexShrink: 0, whiteSpace: "nowrap" }}>
                            {fmtCompact(s.totalHT)}
                          </span>
                        )}
                        <span style={{ fontSize: 12, color: "#999", flexShrink: 0, width: 45, textAlign: "right" }}>
                          {s.pct.toFixed(1)}%
                        </span>
                      </div>
                    ))}

                    {/* Total row */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "14px 0 10px",
                      borderTop: "2px solid #ddd6c8",
                      marginTop: 4,
                    }}>
                      <span style={{ width: 12, flexShrink: 0 }} />
                      <span style={{
                        fontFamily: "var(--font-oswald), Oswald, sans-serif",
                        fontSize: 14, fontWeight: 700, color: "#D4775A",
                        width: 160, flexShrink: 0,
                      }}>
                        Achat cumule
                      </span>
                      <span style={{
                        fontFamily: "var(--font-oswald), Oswald, sans-serif",
                        fontSize: 18, fontWeight: 700, color: "#1a1a1a",
                        flex: 1,
                      }}>
                        {fmt(topSuppliers.reduce((s, x) => s + x.totalHT, 0))}
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* === Par catégorie === */}
            {viewTab === "categorie" && (
              <>
                {categoryStats.length === 0 ? (
                  <p style={{ color: "#999", fontSize: 14, marginBottom: 28 }}>Aucune donnee sur la periode.</p>
                ) : (
                  <div style={{ marginBottom: 28 }}>
                    {categoryStats.map((c) => (
                      <div
                        key={c.category}
                        style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "10px 0",
                          borderBottom: "1px solid #f0ebe2",
                        }}
                      >
                        <span style={{
                          width: 12, height: 12, borderRadius: "50%",
                          background: c.color, flexShrink: 0,
                        }} />
                        <span style={{
                          fontFamily: "DM Sans, sans-serif",
                          fontSize: 14, fontWeight: 500, color: "#1a1a1a",
                          width: 160, flexShrink: 0,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                          {c.label}
                        </span>
                        <div style={{ flex: 1, height: 24, background: "#f0ebe2", borderRadius: 6, overflow: "hidden" }}>
                          <div style={{
                            width: `${Math.max((c.totalHT / maxCategory) * 100, 2)}%`,
                            height: "100%",
                            background: c.color,
                            borderRadius: 6,
                            display: "flex", alignItems: "center", justifyContent: "flex-end",
                            paddingRight: 8,
                            transition: "width 0.3s ease",
                          }}>
                            {(c.totalHT / maxCategory) * 100 > 25 && (
                              <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>
                                {fmtCompact(c.totalHT)}
                              </span>
                            )}
                          </div>
                        </div>
                        {(c.totalHT / maxCategory) * 100 <= 25 && (
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", flexShrink: 0, whiteSpace: "nowrap" }}>
                            {fmtCompact(c.totalHT)}
                          </span>
                        )}
                        <span style={{ fontSize: 12, color: "#999", flexShrink: 0, width: 45, textAlign: "right" }}>
                          {c.pct.toFixed(1)}%
                        </span>
                      </div>
                    ))}

                    {/* Total row */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "14px 0 10px",
                      borderTop: "2px solid #ddd6c8",
                      marginTop: 4,
                    }}>
                      <span style={{ width: 12, flexShrink: 0 }} />
                      <span style={{
                        fontFamily: "var(--font-oswald), Oswald, sans-serif",
                        fontSize: 14, fontWeight: 700, color: "#D4775A",
                        width: 160, flexShrink: 0,
                      }}>
                        Total categories
                      </span>
                      <span style={{
                        fontFamily: "var(--font-oswald), Oswald, sans-serif",
                        fontSize: 18, fontWeight: 700, color: "#1a1a1a",
                        flex: 1,
                      }}>
                        {fmt(categoryStats.reduce((s, x) => s + x.totalHT, 0))}
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Monthly evolution */}
            <h2 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, fontSize: 16, color: "#1a1a1a", margin: "0 0 12px", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Evolution mensuelle
            </h2>

            {monthBars.length === 0 ? (
              <p style={{ color: "#999", fontSize: 14 }}>Aucune donnee.</p>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {monthBars.map((b) => (
                    <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "DM Sans, sans-serif", fontSize: 13 }}>
                      <span style={{ width: 56, flexShrink: 0, color: "#999", textAlign: "right", fontSize: 12 }}>{b.label}</span>
                      <div style={{ flex: 1, background: "#f0ebe2", borderRadius: 6, height: 28, overflow: "hidden", display: "flex" }}>
                        {b.segments.map((seg, i) => (
                          <div
                            key={seg.name}
                            title={`${seg.name}: ${fmtCompact(seg.amount)}`}
                            style={{
                              width: `${(seg.pct / 100) * Math.max(b.pct, 3)}%`,
                              height: "100%",
                              background: seg.color,
                              borderTopLeftRadius: i === 0 ? 6 : 0,
                              borderBottomLeftRadius: i === 0 ? 6 : 0,
                              borderTopRightRadius: i === b.segments.length - 1 ? 6 : 0,
                              borderBottomRightRadius: i === b.segments.length - 1 ? 6 : 0,
                              transition: "width 0.3s ease",
                            }}
                          />
                        ))}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", whiteSpace: "nowrap", flexShrink: 0 }}>
                        {fmtCompact(b.total)}
                      </span>
                      <span style={{ fontSize: 10, color: "#999", flexShrink: 0, whiteSpace: "nowrap" }}>
                        {b.nbFactures} fact.
                      </span>
                    </div>
                  ))}
                </div>

                {/* Legend */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", marginTop: 14 }}>
                  {topSuppliers.filter((s) => s.totalHT > 0).map((s) => (
                    <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                      <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: "#777" }}>{s.name}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </RequireRole>
  );
}
