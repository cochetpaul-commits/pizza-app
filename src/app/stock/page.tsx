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
    <RequireRole allowedRoles={["group_admin"]}>
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

  useEffect(() => { void load(); }, [load]);

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
      </main>

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
