"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";

const CARD: React.CSSProperties = { background: "#fff", borderRadius: 14, padding: 20, border: "1px solid #ddd6c8" };

function fmtEur(n: number) { return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

type Product = { name: string; quantity: number; totalSales: number; category?: string };
type Category = { name: string; ca: number; pct: number };

export default function ProduitsVendusPage() {
  const { current: etab } = useEtablissement();
  const etabColor = etab?.couleur ?? "#e27f57";

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [catFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"ca" | "qty" | "name">("ca");
  const [period, setPeriod] = useState("today");

  const loadData = async (p: string) => {
    setLoading(true);
    try {
      const dateParam = p === "today" ? "" : `?date=${getDateForPeriod(p)}`;
      const [todayRes, weekRes] = await Promise.all([
        fetch(`/api/popina/ca-jour${dateParam}`),
        fetch("/api/popina/top-produits"),
      ]);

      if (todayRes.ok) {
        const d = await todayRes.json();
        // All products with categories
        setCategories(d.categories ?? []);

        // Top products from today
        const todayProds = (d.topProducts ?? []).map((p: Product) => ({
          ...p, category: "—",
        }));

        // Merge with week data for more products
        if (weekRes.ok) {
          const w = await weekRes.json();
          const weekProds = (w.products ?? []) as Product[];

          // Merge: today products take priority, add week products not in today
          const prodMap = new Map<string, Product>();
          for (const p of todayProds) prodMap.set(p.name, p);
          for (const p of weekProds) {
            if (!prodMap.has(p.name)) prodMap.set(p.name, { ...p, category: "—" });
          }
          setProducts(Array.from(prodMap.values()));
        } else {
          setProducts(todayProds);
        }
      }
    } catch { /* API error */ }
    setLoading(false);
  };

  useEffect(() => {
    if (!etab) return;
    (async () => {
      await loadData(period);
    })();
  }, [etab, period]);

  const filtered = useMemo(() => {
    let list = products;
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(s));
    }
    if (catFilter !== "all") {
      list = list.filter(p => p.category === catFilter);
    }
    if (sortBy === "ca") list = [...list].sort((a, b) => b.totalSales - a.totalSales);
    else if (sortBy === "qty") list = [...list].sort((a, b) => b.quantity - a.quantity);
    else list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [products, search, catFilter, sortBy]);

  const totalCA = filtered.reduce((s, p) => s + p.totalSales, 0);
  const totalQty = filtered.reduce((s, p) => s + p.quantity, 0);

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px 60px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <Link href="/ventes" style={{ fontSize: 12, color: "#999", textDecoration: "none", display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
              Retour aux ventes
            </Link>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: etabColor }} />
              <h1 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 24, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>
                Produits vendus — {etab?.nom ?? ""}
              </h1>
            </div>
          </div>
        </div>

        {/* Filtres */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", borderRadius: 8, border: "1px solid #ddd6c8", overflow: "hidden" }}>
            {[
              { key: "today", label: "Aujourd'hui" },
              { key: "week", label: "Semaine" },
            ].map(p => (
              <button key={p.key} type="button" onClick={() => setPeriod(p.key)} style={{
                padding: "6px 14px", border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: 600,
                background: period === p.key ? "#1a1a1a" : "#fff",
                color: period === p.key ? "#fff" : "#1a1a1a",
              }}>
                {p.label}
              </button>
            ))}
          </div>

          <input type="text" placeholder="Rechercher un produit..." value={search} onChange={e => setSearch(e.target.value)} style={{
            flex: 1, padding: "6px 14px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 13, minWidth: 200,
          }} />

          <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} style={{
            padding: "6px 14px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 13,
          }}>
            <option value="ca">Trier par CA</option>
            <option value="qty">Trier par quantité</option>
            <option value="name">Trier par nom</option>
          </select>
        </div>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
          <div style={{ ...CARD, textAlign: "center" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", marginBottom: 4 }}>Produits</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#1a1a1a" }}>{filtered.length}</div>
          </div>
          <div style={{ ...CARD, textAlign: "center" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", marginBottom: 4 }}>Quantité totale</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#1a1a1a" }}>{totalQty}</div>
          </div>
          <div style={{ ...CARD, textAlign: "center" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", marginBottom: 4 }}>CA total</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#D4775A" }}>{fmtEur(totalCA)} €</div>
          </div>
        </div>

        {/* Catégories */}
        {categories.length > 0 && (
          <div style={{ ...CARD, marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>Répartition par catégorie</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {categories.map(c => (
                <div key={c.name} style={{
                  padding: "8px 14px", borderRadius: 8,
                  border: "1px solid #f0ebe3", background: "#faf7f2",
                  fontSize: 12,
                }}>
                  <span style={{ fontWeight: 600, color: "#1a1a1a" }}>{c.name}</span>
                  <span style={{ marginLeft: 8, color: "#D4775A", fontWeight: 700 }}>{fmtEur(c.ca)} €</span>
                  <span style={{ marginLeft: 6, color: "#999" }}>{c.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tableau produits */}
        <div style={CARD}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>
            {period === "today" ? "Produits du jour" : "Produits de la semaine"}
          </h2>

          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#999" }}>Chargement...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#999" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
              <p style={{ fontSize: 13 }}>Aucun produit vendu pour cette période</p>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #ddd6c8" }}>
                  <th style={{ textAlign: "left", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#D4775A", textTransform: "uppercase" }}>#</th>
                  <th style={{ textAlign: "left", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#D4775A", textTransform: "uppercase" }}>Produit</th>
                  <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#D4775A", textTransform: "uppercase" }}>Quantité</th>
                  <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#D4775A", textTransform: "uppercase" }}>CA TTC</th>
                  <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#D4775A", textTransform: "uppercase" }}>Prix moy.</th>
                  <th style={{ textAlign: "right", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#D4775A", textTransform: "uppercase" }}>% du CA</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => (
                  <tr key={p.name} style={{ borderBottom: "1px solid #f0ebe3" }}>
                    <td style={{ padding: "10px 0", fontWeight: 700, color: i < 3 ? "#D4775A" : "#999", fontSize: 11 }}>{i + 1}</td>
                    <td style={{ padding: "10px 0", fontWeight: 500 }}>{p.name}</td>
                    <td style={{ padding: "10px 0", textAlign: "right" }}>{p.quantity}</td>
                    <td style={{ padding: "10px 0", textAlign: "right", fontWeight: 600 }}>{fmtEur(p.totalSales)} €</td>
                    <td style={{ padding: "10px 0", textAlign: "right", color: "#999" }}>
                      {p.quantity > 0 ? `${fmtEur(p.totalSales / p.quantity)} €` : "—"}
                    </td>
                    <td style={{ padding: "10px 0", textAlign: "right", color: "#999" }}>
                      {totalCA > 0 ? `${Math.round((p.totalSales / totalCA) * 100)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Total */}
              <tfoot>
                <tr style={{ borderTop: "2px solid #ddd6c8", fontWeight: 700 }}>
                  <td style={{ padding: "10px 0" }} colSpan={2}>Total ({filtered.length} produits)</td>
                  <td style={{ padding: "10px 0", textAlign: "right" }}>{totalQty}</td>
                  <td style={{ padding: "10px 0", textAlign: "right", color: "#D4775A" }}>{fmtEur(totalCA)} €</td>
                  <td style={{ padding: "10px 0", textAlign: "right" }}></td>
                  <td style={{ padding: "10px 0", textAlign: "right" }}>100%</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </RequireRole>
  );
}

function getDateForPeriod(period: string): string {
  const now = new Date();
  if (period === "yesterday") {
    now.setDate(now.getDate() - 1);
  }
  return now.toISOString().slice(0, 10);
}
