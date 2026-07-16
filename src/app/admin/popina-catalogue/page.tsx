"use client";

import { useCallback, useEffect, useState } from "react";
import { RequireRole } from "@/components/RequireRole";
import { NavBar } from "@/components/NavBar";

type PopinaProduct = {
  id: string;
  popina_id: string;
  name: string;
  category: string;
  sub_category: string | null;
  price_ttc: number;
  tva_rate: number;
  linked_type: string | null;
  linked_name: string | null;
  pizza_recipe_id: string | null;
  kitchen_recipe_id: string | null;
  cocktail_id: string | null;
  ingredient_id: string | null;
};

type SearchResult = { id: string; name: string };

const CAT_COLORS: Record<string, { bg: string; fg: string }> = {
  PIZZE: { bg: "#FDEBD0", fg: "#A0522D" },
  CUCINA: { bg: "#D4EFDF", fg: "#1B7A3D" },
  ANTIPASTI: { bg: "#FAD7A0", fg: "#8B6914" },
  DOLCI: { bg: "#F5CBA7", fg: "#A0522D" },
  VINI: { bg: "#E8DAEF", fg: "#6C3483" },
  DIGESTIVI: { bg: "#D6EAF8", fg: "#21618C" },
  ALCOOL: { bg: "#FADBD8", fg: "#922B21" },
  BEVANDE: { bg: "#D1F2EB", fg: "#117A65" },
  "BEVANDE CALDE": { bg: "#F9E79F", fg: "#7D6608" },
  MESSAGES: { bg: "#EAECEE", fg: "#717D7E" },
};

const TYPE_OPTIONS = [
  { value: "pizza", label: "Pizza" },
  { value: "kitchen", label: "Recette cuisine" },
  { value: "cocktail", label: "Cocktail" },
  { value: "ingredient", label: "Ingrédient" },
];

const CATEGORIES = ["PIZZE", "CUCINA", "ANTIPASTI", "DOLCI", "VINI", "DIGESTIVI", "ALCOOL", "BEVANDE", "BEVANDE CALDE", "MESSAGES"];

function CataloguePage() {
  const [products, setProducts] = useState<PopinaProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState<string>("ALL");
  const [filterLinked, setFilterLinked] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  // Modal state
  const [editing, setEditing] = useState<PopinaProduct | null>(null);
  const [linkType, setLinkType] = useState<string>("kitchen");
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/popina-catalogue");
    const data = await res.json();
    setProducts(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  // Filter products
  const filtered = products.filter((p) => {
    if (filterCat !== "ALL" && p.category !== filterCat) return false;
    if (filterLinked === "LINKED" && !p.linked_type) return false;
    if (filterLinked === "UNLINKED" && p.linked_type) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: products.length,
    linked: products.filter((p) => p.linked_type).length,
    unlinked: products.filter((p) => !p.linked_type).length,
  };

  // Search for recipes/ingredients
  async function doSearch() {
    if (!searchQ.trim()) return;
    setSearching(true);
    const res = await fetch("/api/popina-catalogue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: linkType, q: searchQ.trim() }),
    });
    const data = await res.json();
    setSearchResults(Array.isArray(data) ? data : []);
    setSearching(false);
  }

  async function linkProduct(linkedId: string) {
    if (!editing) return;
    setSaving(true);
    await fetch("/api/popina-catalogue", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        popina_product_id: editing.id,
        linked_type: linkType,
        linked_id: linkedId,
      }),
    });
    setSaving(false);
    setEditing(null);
    setSearchResults([]);
    setSearchQ("");
    load();
  }

  async function unlinkProduct(product: PopinaProduct) {
    await fetch("/api/popina-catalogue", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ popina_product_id: product.id }),
    });
    load();
  }

  function openModal(product: PopinaProduct) {
    setEditing(product);
    setSearchQ(product.name);
    setSearchResults([]);
    // Pre-select type based on category
    if (product.category === "PIZZE") setLinkType("pizza");
    else if (["CUCINA", "ANTIPASTI", "DOLCI"].includes(product.category)) setLinkType("kitchen");
    else if (product.category === "ALCOOL") setLinkType("cocktail");
    else setLinkType("ingredient");
  }

  return (
    <>
      <NavBar backHref="/admin/popina" backLabel="Popina" />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 40px", boxSizing: "border-box" }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: "#D4775A", textTransform: "uppercase", margin: "0 0 6px" }}>
            ADMINISTRATION
          </p>
          <h1 style={{ fontSize: 24, color: "#1a1a1a", margin: 0, fontFamily: "'Oswald', sans-serif" }}>
            Catalogue Popina
          </h1>
          <p style={{ fontSize: 13, color: "#666", margin: "8px 0 0" }}>
            {stats.total} produits — {stats.linked} reliés — {stats.unlinked} non reliés
          </p>
        </div>

        {/* Stats cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Total", value: stats.total, color: "#1a1a1a" },
            { label: "Reliés", value: stats.linked, color: "#2D6A4F" },
            { label: "Non reliés", value: stats.unlinked, color: "#D4775A" },
          ].map((s) => (
            <div key={s.label} style={{
              padding: 16, borderRadius: 12, border: "1px solid #ddd6c8",
              background: "#fff", textAlign: "center",
            }}>
              <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'Oswald', sans-serif", color: s.color }}>
                {s.value}
              </div>
              <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{
          display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center",
        }}>
          <input
            type="text"
            placeholder="Rechercher un produit..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1, minWidth: 180, padding: "8px 12px", borderRadius: 8,
              border: "1px solid #ddd6c8", fontSize: 13, outline: "none",
            }}
          />
          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 13 }}
          >
            <option value="ALL">Toutes catégories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={filterLinked}
            onChange={(e) => setFilterLinked(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 13 }}
          >
            <option value="ALL">Tous</option>
            <option value="LINKED">Reliés</option>
            <option value="UNLINKED">Non reliés</option>
          </select>
        </div>

        {/* Category pills */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
          {CATEGORIES.map((cat) => {
            const count = products.filter((p) => p.category === cat).length;
            const linked = products.filter((p) => p.category === cat && p.linked_type).length;
            const col = CAT_COLORS[cat] ?? { bg: "#eee", fg: "#666" };
            const active = filterCat === cat;
            return (
              <button
                key={cat}
                onClick={() => setFilterCat(active ? "ALL" : cat)}
                style={{
                  padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                  border: active ? `2px solid ${col.fg}` : "1px solid transparent",
                  background: col.bg, color: col.fg, cursor: "pointer",
                }}
              >
                {cat} ({linked}/{count})
              </button>
            );
          })}
        </div>

        {/* Product list */}
        {loading ? (
          <p style={{ textAlign: "center", color: "#999" }}>Chargement...</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {filtered.map((p) => {
              const col = CAT_COLORS[p.category] ?? { bg: "#eee", fg: "#666" };
              return (
                <div
                  key={p.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px", borderRadius: 10,
                    border: "1px solid #e5ddd0", background: "#fff",
                    cursor: "pointer",
                  }}
                  onClick={() => !p.linked_type && openModal(p)}
                >
                  {/* Category badge */}
                  <span style={{
                    padding: "2px 8px", borderRadius: 6, fontSize: 9, fontWeight: 700,
                    background: col.bg, color: col.fg, whiteSpace: "nowrap",
                    minWidth: 60, textAlign: "center",
                  }}>
                    {p.category}
                  </span>

                  {/* Product name + price */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>
                      {p.name}
                    </div>
                    {p.sub_category && (
                      <div style={{ fontSize: 11, color: "#999" }}>{p.sub_category}</div>
                    )}
                  </div>

                  {/* Price */}
                  <div style={{
                    fontSize: 14, fontWeight: 700, fontFamily: "'Oswald', sans-serif",
                    color: "#1a1a1a", whiteSpace: "nowrap",
                  }}>
                    {p.price_ttc > 0 ? `${p.price_ttc.toFixed(0)} €` : "—"}
                  </div>

                  {/* Link status */}
                  {p.linked_type ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{
                        padding: "4px 10px", borderRadius: 8, fontSize: 11,
                        background: "#E8F5E9", color: "#2D6A4F", fontWeight: 600,
                        maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {p.linked_type === "pizza" ? "Pizza" : p.linked_type === "kitchen" ? "Recette" : p.linked_type === "cocktail" ? "Cocktail" : "Ingrédient"}
                        {" · "}
                        {p.linked_name}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); unlinkProduct(p); }}
                        style={{
                          background: "none", border: "none", cursor: "pointer",
                          fontSize: 16, color: "#999", padding: 2,
                        }}
                        title="Délier"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); openModal(p); }}
                      style={{
                        padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                        background: "#f9f6f0", color: "#D4775A", border: "1px solid #D4775A",
                        cursor: "pointer", whiteSpace: "nowrap",
                      }}
                    >
                      Relier
                    </button>
                  )}
                </div>
              );
            })}

            {filtered.length === 0 && (
              <p style={{ textAlign: "center", color: "#999", padding: 40 }}>
                Aucun produit trouvé
              </p>
            )}
          </div>
        )}
      </main>

      {/* Modal */}
      {editing && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000, padding: 16,
          }}
          onClick={() => setEditing(null)}
        >
          <div
            style={{
              background: "#fff", borderRadius: 16, padding: 24,
              width: "100%", maxWidth: 480, maxHeight: "80vh", overflow: "auto",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: 18, fontFamily: "'Oswald', sans-serif", margin: "0 0 4px", color: "#1a1a1a" }}>
              Relier un produit
            </h2>
            <p style={{ fontSize: 13, color: "#666", margin: "0 0 20px" }}>
              {editing.name} — {editing.price_ttc} € TTC
            </p>

            {/* Type selector */}
            <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setLinkType(opt.value); setSearchResults([]); }}
                  style={{
                    padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                    border: linkType === opt.value ? "2px solid #D4775A" : "1px solid #ddd6c8",
                    background: linkType === opt.value ? "#FFF5F0" : "#fff",
                    color: linkType === opt.value ? "#D4775A" : "#666",
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <input
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doSearch()}
                placeholder={`Chercher ${TYPE_OPTIONS.find((o) => o.value === linkType)?.label ?? ""}...`}
                style={{
                  flex: 1, padding: "10px 14px", borderRadius: 10,
                  border: "1px solid #ddd6c8", fontSize: 14, outline: "none",
                }}
                autoFocus
              />
              <button
                onClick={doSearch}
                disabled={searching}
                style={{
                  padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700,
                  background: "#D4775A", color: "#fff", border: "none", cursor: "pointer",
                  opacity: searching ? 0.6 : 1,
                }}
              >
                {searching ? "..." : "Chercher"}
              </button>
            </div>

            {/* Results */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {searchResults.map((r) => (
                <button
                  key={r.id}
                  onClick={() => linkProduct(r.id)}
                  disabled={saving}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px", borderRadius: 8,
                    border: "1px solid #e5ddd0", background: "#f9f6f0",
                    cursor: "pointer", textAlign: "left", fontSize: 13,
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  <span style={{ fontWeight: 600, color: "#1a1a1a" }}>{r.name}</span>
                  <span style={{ fontSize: 11, color: "#D4775A", fontWeight: 700 }}>Relier</span>
                </button>
              ))}
              {searchResults.length === 0 && searchQ && !searching && (
                <p style={{ fontSize: 12, color: "#999", textAlign: "center", padding: 20 }}>
                  Tapez un nom et cliquez Chercher
                </p>
              )}
            </div>

            {/* Close */}
            <button
              onClick={() => setEditing(null)}
              style={{
                marginTop: 20, width: "100%", padding: "10px 0",
                borderRadius: 10, fontSize: 13, fontWeight: 600,
                background: "#f5f0e8", color: "#666", border: "none", cursor: "pointer",
              }}
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function PopinaCataloguePage() {
  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <CataloguePage />
    </RequireRole>
  );
}
