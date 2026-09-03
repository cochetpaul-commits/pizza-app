"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { NavBar } from "@/components/NavBar";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { fetchApi } from "@/lib/fetchApi";
import { CAT_LABELS, CAT_COLORS, type Category } from "@/types/ingredients";

// ── Types ────────────────────────────────────────────────────

type StockItem = {
  ingredient_id: string;
  name: string;
  category: string | null;
  unit: string | null;
  stock: number;
  receptions: number;
  ventes: number;
  stock_min: number | null;
  stock_objectif: number | null;
  alerte: boolean;
};

type Movement = {
  id: string;
  type: string;
  quantity: number;
  unit: string | null;
  reference_type: string | null;
  note: string | null;
  created_at: string;
};

const TYPE_LABELS: Record<string, string> = {
  reception: "Réception",
  vente: "Vente",
  inventaire: "Inventaire",
  ajustement: "Ajustement",
};

const TYPE_COLORS: Record<string, string> = {
  reception: "#16a34a",
  vente: "#D4775A",
  inventaire: "#2563EB",
  ajustement: "#8B6914",
};

function fmtQty(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1).replace(".", ",");
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ── Component ────────────────────────────────────────────────

export default function StockPage() {
  return (
    <RequireRole permission="achats.inventaire">
      <StockContent />
    </RequireRole>
  );
}

function StockContent() {
  const { current: etab } = useEtablissement();
  const [items, setItems] = useState<StockItem[]>([]);
  const [inventoryDate, setInventoryDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterAlerte, setFilterAlerte] = useState(false);
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loadingMov, setLoadingMov] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  // Tab: stock / commandes
  const [activeTab, setActiveTab] = useState<"stock" | "commandes">("stock");

  // Commandes théoriques
  type OrderLine = { ingredient_id: string; name: string; category: string | null; unit: string; current_stock: number; avg_daily: number; stock_objectif: number; days_until_delivery: number; stock_at_delivery: number; qty_to_order: number; pack_label: string | null; pack_price: number | null; estimated_cost: number | null; urgent: boolean };
  type SupplierOrder = { supplier_id: string; supplier_name: string; supplier_color: string | null; delivery_days: string[] | null; next_delivery_in: number; franco_minimum: number | null; lines: OrderLine[]; total_estimated: number };
  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersDate, setOrdersDate] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    if (!etab) return;
    setOrdersLoading(true);
    const res = await fetchApi("/api/stock/commandes-theoriques");
    if (res.ok) {
      const d = await res.json();
      setOrders(d.suppliers ?? []);
      setOrdersDate(d.generated_at ? new Date(d.generated_at).toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : null);
    }
    setOrdersLoading(false);
  }, [etab]);

  // Auto-doses
  type DoseSuggestion = { popina_product_id: string; popina_name: string; popina_category: string; ingredient_id: string; ingredient_name: string; suggested_dose: number; suggested_unit: string; rule: string };
  const [doseSuggestions, setDoseSuggestions] = useState<DoseSuggestion[] | null>(null);
  const [doseLoading, setDoseLoading] = useState(false);
  const [doseApplying, setDoseApplying] = useState(false);

  const load = useCallback(async () => {
    if (!etab) return;
    setLoading(true);
    const res = await fetchApi("/api/stock");
    if (res.ok) {
      const data = await res.json();
      setItems(data.items ?? []);
      setInventoryDate(data.inventory_date ?? null);
    }
    setLoading(false);
  }, [etab]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function loadDoseSuggestions() {
    setDoseLoading(true);
    const res = await fetchApi("/api/stock/auto-doses");
    if (res.ok) setDoseSuggestions(await res.json());
    setDoseLoading(false);
  }

  async function applyDoses() {
    if (!doseSuggestions || doseSuggestions.length === 0) return;
    setDoseApplying(true);
    const entries = doseSuggestions.map((s) => ({
      popina_product_id: s.popina_product_id,
      ingredient_id: s.ingredient_id,
      dose: s.suggested_dose,
      dose_unit: s.suggested_unit,
    }));
    await fetchApi("/api/stock/auto-doses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });
    setDoseApplying(false);
    setDoseSuggestions(null);
    setSyncMsg(`${entries.length} doses appliquees`);
    setTimeout(() => setSyncMsg(null), 5000);
  }

  async function syncVentes() {
    setSyncing(true);
    setSyncMsg(null);
    // Sync last 30 days
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const res = await fetchApi("/api/stock/sync-ventes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date_from: from, date_to: to }),
    });
    if (res.ok) {
      const data = await res.json();
      setSyncMsg(`${data.ingredients_impacted} ingredients impactes (${data.matched_products} produits matches, ${data.unmatched_products} non matches)`);
      void load();
    } else {
      setSyncMsg("Erreur de synchronisation");
    }
    setSyncing(false);
    setTimeout(() => setSyncMsg(null), 8000);
  }

  async function loadMovements(item: StockItem) {
    setSelectedItem(item);
    setLoadingMov(true);
    const res = await fetchApi(`/api/stock/movements?ingredient_id=${item.ingredient_id}&limit=30`);
    if (res.ok) setMovements(await res.json());
    setLoadingMov(false);
  }

  const toggleCat = useCallback((cat: string) => {
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }, []);

  // Filter
  const filtered = useMemo(() => {
    let arr = items;
    if (filterAlerte) arr = arr.filter((i) => i.alerte);
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter((i) => i.name.toLowerCase().includes(q));
    }
    return arr;
  }, [items, filterAlerte, search]);

  // Group by category
  const grouped = useMemo(() => {
    const map = new Map<string, StockItem[]>();
    for (const item of filtered) {
      const cat = item.category ?? "autre";
      const arr = map.get(cat) ?? [];
      arr.push(item);
      map.set(cat, arr);
    }
    // Sort categories by label
    return [...map.entries()].sort((a, b) => {
      const la = CAT_LABELS[a[0] as Category] ?? a[0];
      const lb = CAT_LABELS[b[0] as Category] ?? b[0];
      return la.localeCompare(lb, "fr");
    });
  }, [filtered]);

  const alerteCount = items.filter((i) => i.alerte).length;
  const totalItems = items.length;

  return (
    <>
      <NavBar backHref="/commandes" backLabel="Commandes" />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 100px", boxSizing: "border-box" }}>

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: "#D4775A", textTransform: "uppercase", margin: "0 0 6px" }}>
            GESTION DES STOCKS
          </p>
          <h1 style={{ fontSize: 24, color: "#1a1a1a", margin: 0, fontFamily: "'Oswald', sans-serif" }}>
            Stock theorique
          </h1>
          <p style={{ fontSize: 13, color: "#666", margin: "6px 0 0" }}>
            {totalItems} produits suivis
            {inventoryDate && <> — dernier inventaire : {fmtDate(inventoryDate)}</>}
            {!inventoryDate && <> — aucun inventaire cloture</>}
          </p>
        </div>

        {/* Tabs: Stock / Commandes */}
        <div style={{ display: "flex", gap: 4, padding: 4, background: "#f0ebe2", borderRadius: 12, marginBottom: 14, border: "1px solid #e8e0d0" }}>
          {([["stock", "Stock theorique"], ["commandes", "Commandes a passer"]] as const).map(([key, label]) => (
            <button key={key} type="button" onClick={() => { setActiveTab(key); if (key === "commandes" && orders.length === 0) loadOrders(); }} style={{
              flex: 1, padding: "8px 10px", borderRadius: 10, border: "none",
              background: activeTab === key ? "#fff" : "transparent",
              color: activeTab === key ? "#1a1a1a" : "#777",
              fontSize: 12, fontWeight: 700, cursor: "pointer",
              boxShadow: activeTab === key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            }}>
              {label}
            </button>
          ))}
        </div>

        {activeTab === "commandes" ? (
          /* ── Commandes théoriques ── */
          ordersLoading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#999" }}>Calcul en cours...</div>
          ) : (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <p style={{ fontSize: 12, color: "#999", margin: 0 }}>
                  {orders.length} fournisseur{orders.length > 1 ? "s" : ""} avec des produits a commander
                  {ordersDate && <> — calcule a {ordersDate}</>}
                </p>
                <button onClick={loadOrders} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700, border: "1px solid #ddd6c8", background: "#fff", color: "#1a1a1a", cursor: "pointer" }}>
                  Recalculer
                </button>
              </div>

              {orders.length === 0 && (
                <div style={{ textAlign: "center", padding: 40, color: "#999", fontSize: 13 }}>
                  Aucune commande necessaire — le stock couvre les prochaines livraisons.
                </div>
              )}

              {orders.map(order => {
                const urgentCount = order.lines.filter(l => l.urgent).length;
                return (
                  <div key={order.supplier_id} style={{ background: "#fff", borderRadius: 14, border: "1px solid #ddd6c8", marginBottom: 14, overflow: "hidden" }}>
                    {/* Supplier header */}
                    <div style={{
                      padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                      borderBottom: "1px solid #f0ebe3",
                      boxShadow: `inset 4px 0 0 ${order.supplier_color ?? "#D4775A"}`,
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#1a1a1a", fontFamily: "'Oswald', sans-serif", textTransform: "uppercase", letterSpacing: ".06em" }}>
                          {order.supplier_name}
                        </div>
                        <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                          {order.delivery_days?.join(", ") ?? "—"}
                          {" · "}Prochaine livraison dans {order.next_delivery_in}j
                          {urgentCount > 0 && <span style={{ color: "#DC2626", fontWeight: 700, marginLeft: 6 }}>{urgentCount} urgent{urgentCount > 1 ? "s" : ""}</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", fontFamily: "'Oswald', sans-serif" }}>
                          {order.total_estimated > 0 ? `${order.total_estimated.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}\u20AC` : "—"}
                        </div>
                        {order.franco_minimum != null && order.franco_minimum > 0 && (
                          <div style={{ fontSize: 10, color: order.total_estimated >= order.franco_minimum ? "#16A34A" : "#DC2626", fontWeight: 600 }}>
                            Franco {order.franco_minimum}\u20AC {order.total_estimated >= order.franco_minimum ? "\u2714" : `(-${(order.franco_minimum - order.total_estimated).toFixed(0)}\u20AC)`}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Lines */}
                    <div style={{ padding: "8px 18px 14px" }}>
                      {order.lines.map(l => (
                        <div key={l.ingredient_id} style={{
                          display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
                          borderBottom: "1px solid #f8f4ee", fontSize: 12,
                        }}>
                          {l.urgent && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#DC2626", flexShrink: 0 }} />}
                          <span style={{ flex: 1, fontWeight: 600, color: "#1a1a1a" }}>{l.name}</span>
                          <span style={{ width: 50, textAlign: "right", color: "#999", fontSize: 10 }}>stock: {l.current_stock}</span>
                          <span style={{ width: 50, textAlign: "right", color: "#999", fontSize: 10 }}>{l.avg_daily > 0 ? `${l.avg_daily}/j` : "—"}</span>
                          <span style={{ width: 60, textAlign: "right", fontWeight: 700, color: l.urgent ? "#DC2626" : "#1a1a1a", fontSize: 13, fontFamily: "'Oswald', sans-serif" }}>
                            {l.qty_to_order} {l.unit}
                          </span>
                          <span style={{ width: 60, textAlign: "right", fontSize: 10, color: "#777" }}>
                            {l.estimated_cost != null ? `${l.estimated_cost.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}\u20AC` : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (<>

        {/* Actions bar */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
          {/* Popina = Bello Mio uniquement, Piccola Mia n'utilise pas ce logiciel */}
          {!etab?.slug?.includes("piccola") && <>
            <button onClick={syncVentes} disabled={syncing}
              style={{ padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: "#2563EB", color: "#fff", border: "none", cursor: "pointer", opacity: syncing ? 0.6 : 1 }}>
              {syncing ? "Sync..." : "Sync ventes (30j)"}
            </button>
            <button onClick={loadDoseSuggestions} disabled={doseLoading}
              style={{ padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: "#7C3AED", color: "#fff", border: "none", cursor: "pointer", opacity: doseLoading ? 0.6 : 1 }}>
              {doseLoading ? "..." : "Auto-doses Popina"}
            </button>
          </>}
          {syncMsg && <span style={{ fontSize: 12, color: "#4a6741", fontWeight: 600 }}>{syncMsg}</span>}
        </div>

        {/* Alertes banner */}
        {alerteCount > 0 && (
          <div style={{
            padding: "10px 16px", borderRadius: 10, marginBottom: 14,
            background: "#FEF2F2", border: "1px solid #FECACA",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>⚠</span>
            <span style={{ fontSize: 13, color: "#B91C1C", fontWeight: 600 }}>
              {alerteCount} produit{alerteCount > 1 ? "s" : ""} sous le stock minimum
            </span>
          </div>
        )}

        {/* Search + filters */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <input
            type="text" placeholder="Rechercher un produit..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 180, padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 13, outline: "none" }}
          />
          {alerteCount > 0 && (
            <button
              onClick={() => setFilterAlerte(!filterAlerte)}
              style={{
                padding: "8px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: "pointer",
                background: filterAlerte ? "#FEF2F2" : "#fff",
                color: filterAlerte ? "#B91C1C" : "#999",
                border: filterAlerte ? "1.5px solid #FECACA" : "1px solid #ddd6c8",
              }}
            >
              Alertes ({alerteCount})
            </button>
          )}
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: "#999", padding: 40 }}>Chargement...</p>
        ) : filtered.length === 0 ? (
          <p style={{ textAlign: "center", color: "#999", padding: 40 }}>
            {items.length === 0 ? "Aucun mouvement de stock enregistre." : "Aucun resultat."}
          </p>
        ) : (
          /* Categories accordion */
          grouped.map(([cat, catItems]) => {
            const catColor = CAT_COLORS[cat as Category] ?? "#999";
            const catLabel = CAT_LABELS[cat as Category] ?? cat;
            const isOpen = openCats.has(cat);
            const catAlertes = catItems.filter((i) => i.alerte).length;

            return (
              <div key={cat} style={{ marginBottom: 10 }}>
                {/* Category header */}
                <div
                  onClick={() => toggleCat(cat)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 16px", cursor: "pointer",
                    background: "#fff", borderRadius: 12,
                    border: "1px solid #ede6d9",
                    boxShadow: `inset 4px 0 0 ${catColor}, 0 1px 3px rgba(0,0,0,0.04)`,
                  }}
                >
                  <span style={{
                    fontFamily: "'Oswald', sans-serif", fontSize: 13, fontWeight: 800,
                    letterSpacing: "0.1em", textTransform: "uppercase", color: catColor,
                  }}>
                    {catLabel}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 12,
                    background: `${catColor}15`, color: catColor,
                  }}>
                    {catItems.length}
                  </span>
                  {catAlertes > 0 && (
                    <span style={{
                      fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 12,
                      background: "#FEF2F2", color: "#B91C1C",
                    }}>
                      {catAlertes} alerte{catAlertes > 1 ? "s" : ""}
                    </span>
                  )}
                  <span style={{
                    marginLeft: "auto", fontSize: 10, color: "#b0a894",
                    transition: "transform 0.2s",
                    transform: isOpen ? "rotate(0)" : "rotate(-90deg)",
                  }}>
                    ▼
                  </span>
                </div>

                {/* Items */}
                {isOpen && (
                  <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 4 }}>
                    {catItems.map((item) => (
                      <div
                        key={item.ingredient_id}
                        onClick={() => loadMovements(item)}
                        style={{
                          display: "flex", alignItems: "center", gap: 12,
                          padding: "10px 16px", cursor: "pointer",
                          background: item.alerte ? "#FFFBF5" : "#fff",
                          borderRadius: 10,
                          border: item.alerte ? "1px solid #FECACA" : "1px solid #f0ebe0",
                          transition: "border-color 0.15s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = catColor + "60"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = item.alerte ? "#FECACA" : "#f0ebe0"; }}
                      >
                        {/* Name */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{item.name}</div>
                          {item.stock_min != null && (
                            <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>
                              Min : {fmtQty(item.stock_min)} {item.unit ?? ""}
                              {item.stock_objectif != null && <> — Obj : {fmtQty(item.stock_objectif)} {item.unit ?? ""}</>}
                            </div>
                          )}
                        </div>

                        {/* Receptions badge */}
                        {item.receptions > 0 && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 6,
                            background: "#E8F5E9", color: "#2D6A4F",
                          }}>
                            +{fmtQty(item.receptions)}
                          </span>
                        )}

                        {/* Ventes badge */}
                        {item.ventes > 0 && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 6,
                            background: "#FEF2F2", color: "#D4775A",
                          }}>
                            -{fmtQty(item.ventes)}
                          </span>
                        )}

                        {/* Stock value */}
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{
                            fontSize: 16, fontWeight: 700, fontFamily: "'Oswald', sans-serif",
                            color: item.alerte ? "#B91C1C" : "#1a1a1a",
                          }}>
                            {fmtQty(item.stock)}
                          </div>
                          <div style={{ fontSize: 10, color: "#999" }}>{item.unit ?? ""}</div>
                        </div>

                        {/* Alert icon */}
                        {item.alerte && (
                          <span style={{ fontSize: 14, flexShrink: 0 }}>⚠</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
        </>)}
      </main>

      {/* Auto-doses suggestions modal */}
      {doseSuggestions !== null && (
        <div onClick={() => setDoseSuggestions(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 1000 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "#f9f6f0", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 600, maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "18px 20px 12px", borderBottom: "1px solid #e5ddd0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: "#7C3AED", letterSpacing: 2, textTransform: "uppercase" }}>Auto-doses</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Oswald', sans-serif", color: "#1a1a1a" }}>
                  {doseSuggestions.length} suggestion{doseSuggestions.length > 1 ? "s" : ""}
                </div>
              </div>
              <button onClick={() => setDoseSuggestions(null)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#999" }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
              {doseSuggestions.length === 0 ? (
                <p style={{ textAlign: "center", color: "#999", padding: 30, fontSize: 13 }}>Toutes les doses sont deja configurees.</p>
              ) : doseSuggestions.map((s) => (
                <div key={s.popina_product_id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", marginBottom: 4,
                  borderRadius: 10, background: "#fff", border: "1px solid #f0ebe0",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{s.popina_name}</div>
                    <div style={{ fontSize: 10, color: "#999" }}>{s.ingredient_name}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Oswald', sans-serif", color: "#7C3AED" }}>
                      {s.suggested_dose} {s.suggested_unit}
                    </div>
                    <div style={{ fontSize: 9, color: "#999" }}>{s.rule}</div>
                  </div>
                </div>
              ))}
            </div>
            {doseSuggestions.length > 0 && (
              <div style={{ padding: "14px 20px", borderTop: "1px solid #e5ddd0", paddingBottom: "calc(14px + env(safe-area-inset-bottom, 0px))" }}>
                <button onClick={applyDoses} disabled={doseApplying}
                  style={{ width: "100%", padding: "12px", borderRadius: 10, fontSize: 13, fontWeight: 700, background: "#7C3AED", color: "#fff", border: "none", cursor: "pointer", opacity: doseApplying ? 0.6 : 1 }}>
                  {doseApplying ? "Application..." : `Appliquer ${doseSuggestions.length} doses`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Movement detail modal */}
      {selectedItem && (
        <div
          onClick={() => setSelectedItem(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#f9f6f0", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 500,
              maxHeight: "70vh", overflow: "hidden", display: "flex", flexDirection: "column",
            }}
          >
            {/* Header */}
            <div style={{ padding: "18px 20px 12px", borderBottom: "1px solid #e5ddd0" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'Oswald', sans-serif", color: "#1a1a1a" }}>
                    {selectedItem.name}
                  </div>
                  <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
                    Stock : <strong style={{ color: selectedItem.alerte ? "#B91C1C" : "#1a1a1a", fontFamily: "'Oswald', sans-serif", fontSize: 16 }}>
                      {fmtQty(selectedItem.stock)}
                    </strong> {selectedItem.unit ?? ""}
                    {selectedItem.stock_min != null && <> (min : {fmtQty(selectedItem.stock_min)})</>}
                  </div>
                </div>
                <button onClick={() => setSelectedItem(null)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#999" }}>✕</button>
              </div>
            </div>

            {/* Movements list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#999", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>
                Derniers mouvements
              </div>
              {loadingMov ? (
                <p style={{ textAlign: "center", color: "#999", padding: 20 }}>Chargement...</p>
              ) : movements.length === 0 ? (
                <p style={{ textAlign: "center", color: "#999", padding: 20, fontSize: 13 }}>Aucun mouvement</p>
              ) : movements.map((m) => {
                const isPositive = m.quantity > 0;
                const color = TYPE_COLORS[m.type] ?? "#999";
                return (
                  <div key={m.id} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 12px", marginBottom: 4, borderRadius: 10,
                    background: "#fff", border: "1px solid #f0ebe0",
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: `${color}15`, color,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 14, fontWeight: 700,
                    }}>
                      {isPositive ? "+" : "-"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>
                        {TYPE_LABELS[m.type] ?? m.type}
                      </div>
                      <div style={{ fontSize: 10, color: "#999" }}>
                        {fmtDateTime(m.created_at)}
                        {m.note && <> — {m.note}</>}
                      </div>
                    </div>
                    <div style={{
                      fontSize: 14, fontWeight: 700, fontFamily: "'Oswald', sans-serif",
                      color: isPositive ? "#16a34a" : "#D4775A",
                    }}>
                      {isPositive ? "+" : ""}{fmtQty(m.quantity)} {m.unit ?? ""}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div style={{
              padding: "12px 20px", borderTop: "1px solid #e5ddd0",
              paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
            }}>
              <button
                onClick={() => setSelectedItem(null)}
                style={{
                  width: "100%", padding: "12px", borderRadius: 10, fontSize: 13, fontWeight: 700,
                  background: "#fff", color: "#1a1a1a", border: "1.5px solid #ddd6c8", cursor: "pointer",
                }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
