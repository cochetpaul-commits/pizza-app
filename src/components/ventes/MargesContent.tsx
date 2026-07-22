"use client";

/**
 * Embeddable wrapper for the Marges/Produits view.
 * Renders the full marges page content with an external date range.
 *
 * Uses an iframe-like approach: navigates to /ventes/marges with params,
 * but actually we just lazy-render the page component.
 */

import { useState, useEffect, useCallback, useRef, useMemo, type CSSProperties } from "react";
import { useEtablissement } from "@/lib/EtablissementContext";
import type { DateRange } from "@/components/ui/DateRangePicker";
import { supabase } from "@/lib/supabaseClient";

type ApiData = {
  kpis: { ca_ttc: number; ca_ht: number; cogs: number; marge_brute: number; food_cost_pct: number; nb_produits: number; nb_matched: number; total_qty: number };
  products: { name: string; categorie: string; qty: number; ca_ttc: number; ca_ht: number; prix_revient: number | null; cout_total: number | null; marge_brute: number | null; marge_pct: number | null; food_cost_pct: number | null; matched: boolean }[];
  categories: { cat: string; ca_ht: number; ca_ttc: number; cogs: number; marge: number; food_cost_pct: number }[];
};

const ACCENT = "#D4775A";
const fmtDec = (v: number) => v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "\u20AC";
const foodCostColor = (fc: number) => fc <= 25 ? "#16A34A" : fc <= 35 ? "#D97706" : "#DC2626";

export function MargesContent({ externalRange }: { externalRange: DateRange }) {
  const { current: etab } = useEtablissement();
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterCat, setFilterCat] = useState("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string>("ca_ttc");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const perPage = 15;

  // Sub-categories from popina
  const [popinaSubCats, setPopinaSubCats] = useState<Record<string, string>>({});
  const [allSubCats, setAllSubCats] = useState<Record<string, string[]>>({});
  const [filterSubCat, setFilterSubCat] = useState("all");

  useEffect(() => {
    (async () => {
      const { data: pp } = await supabase
        .from("popina_products")
        .select("name, category, sub_category")
        .eq("active", true)
        .not("sub_category", "is", null);
      const nameMap: Record<string, string> = {};
      const catSubs: Record<string, Set<string>> = {};
      for (const p of pp ?? []) {
        if (p.sub_category) {
          nameMap[(p.name ?? "").trim().toLowerCase()] = p.sub_category;
          if (!catSubs[p.category]) catSubs[p.category] = new Set();
          catSubs[p.category].add(p.sub_category);
        }
      }
      setPopinaSubCats(nameMap);
      const result: Record<string, string[]> = {};
      for (const [cat, subs] of Object.entries(catSubs)) result[cat] = [...subs].sort();
      setAllSubCats(result);
    })();
  }, []);

  const loadData = useCallback(async () => {
    if (!etab) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/ventes/marges?etablissement_id=${etab.id}&from=${externalRange.from}&to=${externalRange.to}`);
      setData(await r.json());
    } catch { setData(null); }
    setLoading(false);
  }, [etab, externalRange.from, externalRange.to]);

  // Load on mount and when range changes
  const [loadKey, setLoadKey] = useState("");
  const rangeKey = `${etab?.id}:${externalRange.from}:${externalRange.to}`;
  if (rangeKey !== loadKey && etab) {
    setLoadKey(rangeKey);
  }
  useEffect(() => { if (loadKey) loadData(); }, [loadKey]); // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect

  const allCategories = data
    ? [...new Set([...data.products.map(p => p.categorie), ...data.categories.map(c => c.cat)])].filter(Boolean).sort()
    : [];

  const filtered = useMemo(() => {
    if (!data) return [];
    let prods = [...data.products];
    if (filterCat !== "all") prods = prods.filter(p => p.categorie === filterCat);
    if (filterSubCat !== "all") prods = prods.filter(p => popinaSubCats[p.name.trim().toLowerCase()] === filterSubCat);
    if (search.trim()) prods = prods.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    prods.sort((a, b) => {
      const va = (a as Record<string, unknown>)[sortKey] as number ?? 0;
      const vb = (b as Record<string, unknown>)[sortKey] as number ?? 0;
      return sortDir === "desc" ? vb - va : va - vb;
    });
    return prods;
  }, [data, filterCat, filterSubCat, search, sortKey, sortDir, popinaSubCats]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);
  const K = data?.kpis;

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: "#999" }}>Chargement produits...</div>;
  if (!data || !K) return <div style={{ textAlign: "center", padding: 40, color: "#999" }}>Aucune donnee</div>;

  const thStyle: CSSProperties = { textAlign: "right", padding: "8px 6px", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", cursor: "pointer" };

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
        <div style={card}><div style={label}>CA HT</div><div style={kpi}>{fmtDec(K.ca_ht)}</div></div>
        <div style={card}><div style={label}>Marge brute</div><div style={kpi}>{fmtDec(K.marge_brute)}</div></div>
        <div style={card}><div style={label}>Food cost</div><div style={{ ...kpi, color: foodCostColor(K.food_cost_pct) }}>{K.food_cost_pct.toFixed(1)}%</div></div>
        <div style={card}><div style={label}>Articles</div><div style={kpi}>{K.total_qty}</div></div>
        <div style={card}><div style={label}>Matches</div><div style={kpi}>{K.nb_matched}/{K.nb_produits}</div></div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input type="text" placeholder="Rechercher..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{ flex: "1 1 180px", padding: "7px 12px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 13 }} />
        <select value={filterCat} onChange={e => { setFilterCat(e.target.value); setFilterSubCat("all"); setPage(1); }}
          style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 13 }}>
          <option value="all">Toutes categories</option>
          {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {filterCat !== "all" && (allSubCats[filterCat]?.length ?? 0) > 0 && (
          <select value={filterSubCat} onChange={e => { setFilterSubCat(e.target.value); setPage(1); }}
            style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 13 }}>
            <option value="all">Toutes sous-cat.</option>
            {(allSubCats[filterCat] ?? []).map(sc => <option key={sc} value={sc}>{sc}</option>)}
          </select>
        )}
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #ddd6c8" }}>
              <th style={{ ...thStyle, textAlign: "left" }}>Produit</th>
              <th style={thStyle}>Cat.</th>
              <th style={thStyle} onClick={() => { setSortKey("qty"); setSortDir(d => d === "desc" ? "asc" : "desc"); }}>Qty</th>
              <th style={thStyle} onClick={() => { setSortKey("ca_ttc"); setSortDir(d => d === "desc" ? "asc" : "desc"); }}>CA TTC</th>
              <th style={thStyle} onClick={() => { setSortKey("ca_ht"); setSortDir(d => d === "desc" ? "asc" : "desc"); }}>CA HT</th>
              <th style={thStyle}>Cout unit.</th>
              <th style={thStyle}>Marge</th>
              <th style={thStyle} onClick={() => { setSortKey("food_cost_pct"); setSortDir(d => d === "desc" ? "asc" : "desc"); }}>Food cost</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map((p, i) => (
              <tr key={p.name} style={{ borderBottom: "1px solid #f0ebe3", background: i % 2 === 0 ? "#fff" : "#faf7f2" }}>
                <td style={{ padding: "8px 6px", fontWeight: 600 }}>
                  {p.name}
                  {!p.matched && <span style={{ fontSize: 9, color: ACCENT, marginLeft: 4 }}>non matche</span>}
                </td>
                <td style={{ padding: "8px 6px", textAlign: "right", fontSize: 10, color: "#777" }}>{p.categorie}</td>
                <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 600 }}>{p.qty}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtDec(p.ca_ttc)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtDec(p.ca_ht)}</td>
                <td style={{ padding: "8px 6px", textAlign: "right" }}>{p.prix_revient != null ? fmtDec(p.prix_revient) : "—"}</td>
                <td style={{ padding: "8px 6px", textAlign: "right", color: p.marge_brute != null ? "#2D6A4F" : "#999", fontWeight: 600 }}>
                  {p.marge_brute != null ? fmtDec(p.marge_brute) : "—"}
                </td>
                <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 600, color: p.food_cost_pct != null ? foodCostColor(p.food_cost_pct) : "#999" }}>
                  {p.food_cost_pct != null ? `${p.food_cost_pct.toFixed(1)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, fontSize: 12, color: "#999" }}>
        <span>{filtered.length} produits</span>
        <div style={{ display: "flex", gap: 6 }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #ddd6c8", background: "#fff", cursor: page <= 1 ? "default" : "pointer", opacity: page <= 1 ? 0.4 : 1 }}>Prec.</button>
          <span style={{ padding: "4px 8px" }}>Page {page}/{totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #ddd6c8", background: "#fff", cursor: page >= totalPages ? "default" : "pointer", opacity: page >= totalPages ? 0.4 : 1 }}>Suiv.</button>
        </div>
      </div>
    </div>
  );
}

const card: CSSProperties = { background: "#fff", borderRadius: 12, padding: 16, border: "1px solid #ddd6c8" };
const label: CSSProperties = { fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 };
const kpi: CSSProperties = { fontSize: 24, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), Oswald, sans-serif" };
