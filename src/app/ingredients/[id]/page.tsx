"use client";

import { Suspense, useState, useEffect, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { NavBar } from "@/components/NavBar";
import { supabase } from "@/lib/supabaseClient";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

type Ingredient = {
  id: string; name: string; category: string;
  allergens: string | null; status: string | null; status_note: string | null;
  supplier_id: string | null; establishments: string[] | null;
  unit?: string | null;
};

type Offer = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  unit: string;
  unit_price: number;
  supplier_label: string | null;
  is_active: boolean;
  created_at: string;
  establishment: string | null;
  price_kind: string | null;
};

// Colors for suppliers in the chart
const LINE_COLORS = ["#8B1A1A", "#1E40AF", "#5C7A4E", "#7C3AED", "#92400E", "#EA580C"];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" });
}

function fmtPrice(v: number, unit: string) {
  return `${v.toFixed(2)} €/${unit}`;
}

function IngredientDetailInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const fromVariations = searchParams.get("from") === "variations-prix";

  const variationsBtn = fromVariations
    ? <Link href="/variations-prix" className="btn">← Variations prix</Link>
    : undefined;

  const [ingredient, setIngredient] = useState<Ingredient | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Non connecté");

        const [{ data: ing, error: e1 }, { data: offerData, error: e2 }] = await Promise.all([
          supabase.from("ingredients").select("*").eq("id", id).eq("user_id", user.id).single(),
          supabase.from("supplier_offers")
            .select("id, supplier_id, unit, unit_price, supplier_label, is_active, created_at, establishment, price_kind")
            .eq("ingredient_id", id)
            .eq("user_id", user.id)
            .not("unit_price", "is", null)
            .order("created_at", { ascending: true }),
        ]);

        if (e1) throw new Error(e1.message);
        if (e2) throw new Error(e2.message);
        setIngredient(ing as Ingredient);

        // Fetch supplier names
        const supplierIds = [...new Set((offerData ?? []).map((o: { supplier_id: string }) => o.supplier_id))];
        const supMap: Record<string, string> = {};
        if (supplierIds.length > 0) {
          const { data: suppliers } = await supabase.from("suppliers").select("id, name").in("id", supplierIds);
          for (const s of suppliers ?? []) supMap[s.id] = s.name;
        }

        const enriched: Offer[] = (offerData ?? []).map((o: Omit<Offer, "supplier_name">) => ({
          ...o,
          supplier_name: supMap[o.supplier_id] ?? "—",
        }));
        setOffers(enriched);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [id]);

  // Suppliers with at least one offer
  const supplierList = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of offers) map.set(o.supplier_id, o.supplier_name);
    return [...map.entries()];
  }, [offers]);

  // Chart data: unified timeline per date, one key per supplier_id
  const chartData = useMemo(() => {
    // Group offers by date (YYYY-MM-DD) per supplier — take the last price per day
    const byDateBySupplier = new Map<string, Map<string, number>>();
    for (const o of offers) {
      const day = o.created_at.slice(0, 10);
      if (!byDateBySupplier.has(day)) byDateBySupplier.set(day, new Map());
      byDateBySupplier.get(day)!.set(o.supplier_id, o.unit_price);
    }
    const sortedDates = [...byDateBySupplier.keys()].sort();
    // Forward-fill: carry the last known price for each supplier
    const lastPrice = new Map<string, number>();
    return sortedDates.map(day => {
      const dayMap = byDateBySupplier.get(day)!;
      // Update last known prices
      for (const [supId, price] of dayMap) lastPrice.set(supId, price);
      const point: Record<string, string | number> = { date: fmtDate(day) };
      for (const [supId] of supplierList) {
        const p = dayMap.get(supId);
        if (p !== undefined) point[supId] = p;
        // Only show actual data points (no fill — gaps show as line breaks)
      }
      return point;
    });
  }, [offers, supplierList]);

  // Best current price per unit
  const bestOffers = useMemo(() => {
    const activeByUnit = new Map<string, Offer[]>();
    for (const o of offers.filter(o => o.is_active)) {
      const list = activeByUnit.get(o.unit) ?? [];
      list.push(o);
      activeByUnit.set(o.unit, list);
    }
    const result: Array<{ unit: string; best: Offer; others: Offer[] }> = [];
    for (const [unit, list] of activeByUnit) {
      const sorted = [...list].sort((a, b) => a.unit_price - b.unit_price);
      result.push({ unit, best: sorted[0], others: sorted.slice(1) });
    }
    return result;
  }, [offers]);

  // Recent history (last 20 entries, newest first)
  const recentHistory = useMemo(() => [...offers].reverse().slice(0, 20), [offers]);

  if (loading) return (
    <>
      <NavBar backHref="/ingredients" right={variationsBtn} />
      <main className="container"><div className="card" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Chargement…</div></main>
    </>
  );

  if (error || !ingredient) return (
    <>
      <NavBar backHref="/ingredients" right={variationsBtn} />
      <main className="container">
        <div className="errorBox">{error ?? "Ingrédient introuvable"}</div>
      </main>
    </>
  );

  return (
    <>
      <NavBar backHref="/ingredients" backLabel="Ingrédients" right={variationsBtn} />
      <main className="container safe-bottom">

        {/* ── Header ── */}
        <div style={{ marginBottom: 20 }}>
          <h1 className="h1" style={{ marginBottom: 4 }}>{ingredient.name}</h1>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 13, opacity: 0.65 }}>{ingredient.category}</span>
            {ingredient.status && ingredient.status !== "ok" && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 8,
                background: ingredient.status === "to_check" ? "rgba(234,88,12,0.12)" : "rgba(22,163,74,0.10)",
                color: ingredient.status === "to_check" ? "#EA580C" : "#16A34A",
                border: `1px solid ${ingredient.status === "to_check" ? "rgba(234,88,12,0.3)" : "rgba(22,163,74,0.3)"}`,
              }}>
                {ingredient.status === "to_check" ? "À vérifier" : ingredient.status}
              </span>
            )}
            {ingredient.allergens && (
              <span style={{ fontSize: 11, opacity: 0.55 }}>Allergènes: {ingredient.allergens}</span>
            )}
          </div>
        </div>

        {/* ── Meilleur prix ── */}
        {bestOffers.length > 0 && (
          <div className="card" style={{ marginBottom: 12, padding: "14px 16px" }}>
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 10 }}>Prix actuel</div>
            {bestOffers.map(({ unit, best, others }) => (
              <div key={unit} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 13, opacity: 0.7 }}>{best.supplier_name}</span>
                  <span style={{ fontSize: 20, fontWeight: 900, color: "#16A34A" }}>
                    {fmtPrice(best.unit_price, unit)}
                  </span>
                </div>
                {others.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    {others.map((o, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, padding: "3px 0" }}>
                        <span style={{ fontSize: 12, opacity: 0.6 }}>{o.supplier_name}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)" }}>
                          {fmtPrice(o.unit_price, unit)}
                          <span style={{ fontSize: 11, fontWeight: 500, marginLeft: 4, color: "#DC2626" }}>
                            +{(((o.unit_price - best.unit_price) / best.unit_price) * 100).toFixed(1)} %
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Chart ── */}
        {chartData.length >= 2 && supplierList.length > 0 && (
          <div className="card" style={{ marginBottom: 12, padding: "14px 16px" }}>
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 14 }}>Évolution des prix</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.07)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: "1px solid rgba(217,199,182,0.95)", background: "#FAF7F2", fontSize: 12 }}
                  formatter={(value: unknown, name: unknown) => {
                    const supName = supplierList.find(([id]) => id === name)?.[1] ?? String(name);
                    return [`${Number(value).toFixed(2)} €`, supName];
                  }}
                />
                {supplierList.length > 1 && <Legend formatter={(value) => supplierList.find(([id]) => id === value)?.[1] ?? value} wrapperStyle={{ fontSize: 11 }} />}
                {supplierList.map(([supId], idx) => (
                  <Line
                    key={supId}
                    type="monotone"
                    dataKey={supId}
                    stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Historique table ── */}
        {recentHistory.length > 0 && (
          <div className="card" style={{ padding: "14px 16px", marginBottom: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 12 }}>
              Historique des offres
              <span style={{ fontWeight: 400, fontSize: 12, opacity: 0.55, marginLeft: 6 }}>({offers.length} entrées)</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(217,199,182,0.7)" }}>
                    <th style={{ textAlign: "left", padding: "4px 8px 8px 0", fontWeight: 700, opacity: 0.6 }}>Date</th>
                    <th style={{ textAlign: "left", padding: "4px 8px 8px", fontWeight: 700, opacity: 0.6 }}>Fournisseur</th>
                    <th style={{ textAlign: "right", padding: "4px 0 8px 8px", fontWeight: 700, opacity: 0.6 }}>Prix</th>
                    <th style={{ textAlign: "right", padding: "4px 0 8px 8px", fontWeight: 700, opacity: 0.6 }}>Unité</th>
                    <th style={{ textAlign: "center", padding: "4px 0 8px 8px", fontWeight: 700, opacity: 0.6 }}>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {recentHistory.map((o, i) => (
                    <tr key={o.id ?? i} style={{ borderBottom: "1px solid rgba(217,199,182,0.35)" }}>
                      <td style={{ padding: "6px 8px 6px 0", opacity: 0.75 }}>{fmtDate(o.created_at)}</td>
                      <td style={{ padding: "6px 8px", fontWeight: o.is_active ? 700 : 400 }}>
                        {o.supplier_name}
                        {o.supplier_label ? <span style={{ opacity: 0.55, fontSize: 11, marginLeft: 4 }}>{o.supplier_label}</span> : null}
                      </td>
                      <td style={{ padding: "6px 0 6px 8px", textAlign: "right", fontWeight: 800 }}>
                        {o.unit_price.toFixed(2)} €
                      </td>
                      <td style={{ padding: "6px 0 6px 8px", textAlign: "right", opacity: 0.65 }}>{o.unit}</td>
                      <td style={{ padding: "6px 0 6px 8px", textAlign: "center" }}>
                        {o.is_active ? (
                          <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(22,163,74,0.10)", color: "#16A34A", border: "1px solid rgba(22,163,74,0.25)", borderRadius: 6, padding: "1px 6px" }}>Actif</span>
                        ) : (
                          <span style={{ fontSize: 10, opacity: 0.4 }}>Archivé</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {offers.length === 0 && (
          <div className="card" style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>
            Aucune offre enregistrée pour cet ingrédient.
          </div>
        )}

      </main>
    </>
  );
}

export default function IngredientDetailPage() {
  return (
    <Suspense fallback={
      <>
        <NavBar backHref="/ingredients" />
        <main className="container">
          <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Chargement…</div>
        </main>
      </>
    }>
      <IngredientDetailInner />
    </Suspense>
  );
}
