"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fetchApi } from "@/lib/fetchApi";
import type { Ingredient } from "@/types/ingredients";

// ── Types ────────────────────────────────────────────────────

interface IngLine {
  ingredient_id: string;
  qty: number | "";
  unit: string;
}

export interface GestionCommandesProps {
  recipeId: string;
  recipeType: string;
  lines: IngLine[];
  ingredients: Ingredient[];
  etablissementId?: string;
}

type SupplierInfo = { id: string; name: string };

type PricePoint = { mois: string; prix_moyen: number };

type PriceHistory = {
  ingredient_id: string;
  name: string;
  points: PricePoint[];
  evolution: number | null;
};

// ── Helpers ──────────────────────────────────────────────────

function fmtEur(n: number) {
  return n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
}

const SUPPLIER_COLORS: Record<string, string> = {
  metro: "#16a34a", mael: "#2563EB", carniato: "#D97706", cozigou: "#0D9488",
  vinoflo: "#7C3AED", masse: "#EA580C", sum: "#DC2626", armor: "#1E40AF",
  "bar spirits": "#9D174D", sdpf: "#78716C", lmdw: "#CA8A04",
};

function supplierColor(name: string): string {
  const key = name.toLowerCase().trim();
  for (const [k, v] of Object.entries(SUPPLIER_COLORS)) {
    if (key.includes(k)) return v;
  }
  return "#6B7280";
}

// ── Component ────────────────────────────────────────────────

export function GestionCommandes({ lines, ingredients, etablissementId }: GestionCommandesProps) {
  // ingToSupplier: ingredient_id → supplier_id (from active offers)
  const [ingToSupplier, setIngToSupplier] = useState<Record<string, string>>({});
  const [suppliers, setSuppliers] = useState<Record<string, SupplierInfo>>({});
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const ingMap = useMemo(() => {
    const m = new Map<string, Ingredient>();
    for (const i of ingredients) m.set(i.id, i);
    return m;
  }, [ingredients]);

  const recipeIngIds = useMemo(() =>
    lines.filter((l) => l.ingredient_id && l.qty !== "" && Number(l.qty) > 0)
      .map((l) => l.ingredient_id),
  [lines]);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!recipeIngIds.length) { if (!cancelled) setLoading(false); return; }
      if (!cancelled) setLoading(true);

      const { data: offers } = await supabase
        .from("supplier_offers")
        .select("ingredient_id, supplier_id")
        .eq("is_active", true)
        .in("ingredient_id", recipeIngIds);

      if (cancelled) return;

      const supplierIds = new Set<string>();
      const mapping: Record<string, string> = {};
      for (const o of offers ?? []) {
        if (o.supplier_id) {
          supplierIds.add(o.supplier_id);
          mapping[o.ingredient_id] = o.supplier_id;
        }
      }
      setIngToSupplier(mapping);

      if (supplierIds.size > 0) {
        const { data: sups } = await supabase.from("suppliers").select("id, name").in("id", Array.from(supplierIds));
        if (!cancelled) {
          const map: Record<string, SupplierInfo> = {};
          for (const s of (sups ?? []) as SupplierInfo[]) map[s.id] = s;
          setSuppliers(map);
        }
      }

      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const since = sixMonthsAgo.toISOString().slice(0, 10);

      let invQuery = supabase
        .from("supplier_invoice_lines")
        .select("ingredient_id, unit_price, supplier_invoices!inner(invoice_date)")
        .in("ingredient_id", recipeIngIds)
        .not("unit_price", "is", null)
        .gte("supplier_invoices.invoice_date", since);
      if (etablissementId) {
        invQuery = invQuery.eq("supplier_invoices.etablissement_id", etablissementId);
      }
      const { data: invLines } = await invQuery;

      if (cancelled) return;

      const byIngMonth: Record<string, Record<string, number[]>> = {};
      for (const row of (invLines ?? []) as unknown as Array<{ ingredient_id: string; unit_price: number; supplier_invoices: { invoice_date: string } }>) {
        const iid = row.ingredient_id;
        const date = row.supplier_invoices?.invoice_date;
        if (!iid || !date) continue;
        const mois = date.slice(0, 7);
        if (!byIngMonth[iid]) byIngMonth[iid] = {};
        if (!byIngMonth[iid][mois]) byIngMonth[iid][mois] = [];
        byIngMonth[iid][mois].push(row.unit_price);
      }

      const histories: PriceHistory[] = [];
      for (const iid of Object.keys(byIngMonth)) {
        const ing = ingMap.get(iid);
        const months = Object.keys(byIngMonth[iid]).sort();
        const points: PricePoint[] = months.map((m) => {
          const prices = byIngMonth[iid][m];
          return { mois: m, prix_moyen: prices.reduce((a, b) => a + b, 0) / prices.length };
        });
        const first = points[0]?.prix_moyen;
        const last = points[points.length - 1]?.prix_moyen;
        const evolution = first && last && first > 0 ? ((last - first) / first) * 100 : null;
        histories.push({ ingredient_id: iid, name: ing?.name ?? "?", points, evolution });
      }
      setPriceHistory(histories);
      setLoading(false);
    }

    loadData();
    return () => { cancelled = true; };
  }, [recipeIngIds, ingMap, etablissementId]);

  async function addToOrder(ingredientId: string, supplierId: string) {
    setAdding(ingredientId);
    const res = await fetchApi("/api/commandes/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplier_id: supplierId }),
    });
    const { session } = await res.json();
    if (!session) { setAdding(null); return; }

    const line = lines.find((l) => l.ingredient_id === ingredientId);
    const qty = line ? Math.ceil(Number(line.qty) || 1) : 1;
    const ing = ingMap.get(ingredientId);

    await fetchApi("/api/commandes/ligne", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: session.id,
        ingredient_id: ingredientId,
        quantite: qty,
        unite: ing?.default_unit ?? null,
      }),
    });

    setAdded((prev) => new Set(prev).add(ingredientId));
    setAdding(null);
  }

  if (loading) {
    return <div style={{ padding: 32, textAlign: "center", color: "#999", fontSize: 13 }}>Chargement...</div>;
  }

  if (!recipeIngIds.length) {
    return <div style={{ padding: 32, textAlign: "center", color: "#999", fontSize: 13 }}>Aucun ingredient dans cette recette.</div>;
  }

  const allMonths = Array.from(new Set(priceHistory.flatMap((h) => h.points.map((p) => p.mois)))).sort();
  const lastMonths = allMonths.slice(-6);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Ingredients & fournisseurs */}
      <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #ddd6c8", padding: "16px 18px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>
          Ingredients de la recette
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {lines
            .filter((l) => l.ingredient_id && l.qty !== "" && Number(l.qty) > 0)
            .map((l) => {
              const ing = ingMap.get(l.ingredient_id);
              const isAdded = added.has(l.ingredient_id);
              const isAdding = adding === l.ingredient_id;

              const supplierId = ingToSupplier[l.ingredient_id] ?? null;
              const supplierInfo = supplierId ? suppliers[supplierId] ?? null : null;

              return (
                <div
                  key={l.ingredient_id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 12px", background: "#f9f5ef", borderRadius: 8,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>
                      {ing?.name ?? "?"}
                    </div>
                    {supplierInfo && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                        color: supplierColor(supplierInfo.name),
                        background: `${supplierColor(supplierInfo.name)}14`,
                      }}>
                        {supplierInfo.name}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: "#666", flexShrink: 0 }}>
                    {Number(l.qty)} {l.unit}
                  </span>
                  {supplierInfo && (
                    <button
                      type="button"
                      disabled={isAdded || isAdding}
                      onClick={() => addToOrder(l.ingredient_id, supplierInfo.id)}
                      style={{
                        padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                        border: "none", cursor: isAdded ? "default" : "pointer",
                        background: isAdded ? "#e8ede6" : "#D4775A",
                        color: isAdded ? "#4a6741" : "#fff",
                        opacity: isAdding ? 0.5 : 1, flexShrink: 0,
                      }}
                    >
                      {isAdded ? "Ajoute" : isAdding ? "..." : "+ Commande"}
                    </button>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {/* Price variations */}
      {priceHistory.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #ddd6c8", padding: "16px 18px" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>
            Evolution des prix (6 mois)
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: "#f9f5ef" }}>
                  <th style={thS}>Ingredient</th>
                  {lastMonths.map((m) => (
                    <th key={m} style={{ ...thS, textAlign: "right" }}>
                      {new Date(m + "-01").toLocaleDateString("fr-FR", { month: "short" })}
                    </th>
                  ))}
                  <th style={{ ...thS, textAlign: "right" }}>Evol.</th>
                </tr>
              </thead>
              <tbody>
                {priceHistory.map((h) => (
                  <tr key={h.ingredient_id} style={{ borderBottom: "1px solid #f0ebe2" }}>
                    <td style={tdS}>
                      <span style={{ fontWeight: 600 }}>{h.name}</span>
                    </td>
                    {lastMonths.map((m) => {
                      const pt = h.points.find((p) => p.mois === m);
                      return (
                        <td key={m} style={{ ...tdS, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {pt ? fmtEur(pt.prix_moyen) : "-"}
                        </td>
                      );
                    })}
                    <td style={{ ...tdS, textAlign: "right" }}>
                      {h.evolution != null ? (
                        <span style={{
                          fontWeight: 700,
                          color: h.evolution > 3 ? "#DC2626" : h.evolution < -1 ? "#16a34a" : "#666",
                        }}>
                          {h.evolution > 0 ? "+" : ""}{h.evolution.toFixed(1)}%
                        </span>
                      ) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────

const thS: React.CSSProperties = {
  padding: "8px 10px", fontSize: 10, fontWeight: 700, color: "#999",
  textTransform: "uppercase", letterSpacing: 0.5, textAlign: "left",
  borderBottom: "1.5px solid #ddd6c8", whiteSpace: "nowrap",
};

const tdS: React.CSSProperties = {
  padding: "8px 10px", verticalAlign: "middle",
};
