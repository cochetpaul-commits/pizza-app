"use client";

import { useCallback, useEffect, useState } from "react";
import { RequireRole } from "@/components/RequireRole";
import { NavBar } from "@/components/NavBar";

/* ── Types ─────────────────────────────────────────────── */

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
};

type RecipeItem = {
  id: string;
  name: string;
  type: "pizza" | "kitchen" | "cocktail" | "ingredient";
  category?: string;
  popina_product_id: string | null;
  popina_product_name: string | null;
  popina_price: number | null;
};

type SearchResult = { id: string; name: string };

type DoseMap = {
  id: string;
  dose: number;
  dose_unit: string;
  popina_product_id: string;
  ingredient_id: string;
  popina_products: { id: string; name: string; category: string; price_ttc: number } | null;
  ingredients: { id: string; name: string; category: string | null } | null;
};

/* ── Constants ──────────────────────────────────────────── */

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

const TYPE_COLORS: Record<string, { bg: string; fg: string; label: string }> = {
  pizza: { bg: "#FDEBD0", fg: "#A0522D", label: "Pizza" },
  kitchen: { bg: "#D4EFDF", fg: "#1B7A3D", label: "Recette" },
  cocktail: { bg: "#FADBD8", fg: "#922B21", label: "Cocktail" },
  ingredient: { bg: "#D6EAF8", fg: "#21618C", label: "Ingrédient" },
};

const TYPE_OPTIONS = [
  { value: "pizza", label: "Pizza" },
  { value: "kitchen", label: "Recette cuisine" },
  { value: "cocktail", label: "Cocktail" },
  { value: "ingredient", label: "Ingrédient" },
];

const POPINA_CATEGORIES = ["PIZZE", "CUCINA", "ANTIPASTI", "DOLCI", "VINI", "DIGESTIVI", "ALCOOL", "BEVANDE", "BEVANDE CALDE", "MESSAGES"];

/* ── Components ──────────────────────────────────────────── */

function LinkedBadge({ product, doses, onUnlink }: { product: PopinaProduct; doses: DoseMap[]; onUnlink: (id: string) => void }) {
  const d = doses.find((dm) => dm.popina_product_id === product.id);
  const typeLabel = TYPE_COLORS[product.linked_type ?? ""]?.label ?? product.linked_type;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ padding: "4px 10px", borderRadius: 8, fontSize: 11, background: "#E8F5E9", color: "#2D6A4F", fontWeight: 600, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {typeLabel} · {product.linked_name}
        {d && <span style={{ color: "#888" }}> · {d.dose}{d.dose_unit}</span>}
      </div>
      <button onClick={(e) => { e.stopPropagation(); onUnlink(product.id); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#999", padding: 2 }} title="Délier">×</button>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────── */

function CataloguePage() {
  const [view, setView] = useState<"popina" | "recettes">("popina");
  const [products, setProducts] = useState<PopinaProduct[]>([]);
  const [recipes, setRecipes] = useState<RecipeItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Popina filters
  const [filterCat, setFilterCat] = useState("ALL");
  const [filterLinked, setFilterLinked] = useState("ALL");
  const [search, setSearch] = useState("");

  // Recettes filters
  const [filterType, setFilterType] = useState("ALL");
  const [filterRecipeLinked, setFilterRecipeLinked] = useState("ALL");
  const [searchRecipe, setSearchRecipe] = useState("");

  // Sync
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // Modal — linking from Popina view
  const [editing, setEditing] = useState<PopinaProduct | null>(null);
  const [linkType, setLinkType] = useState("kitchen");
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  // Modal — linking from Recettes view (reverse)
  const [editingRecipe, setEditingRecipe] = useState<RecipeItem | null>(null);
  const [searchPopina, setSearchPopina] = useState("");
  const [popinaResults, setPopinaResults] = useState<PopinaProduct[]>([]);

  // Doses
  const [doses, setDoses] = useState<DoseMap[]>([]);
  const [doseValue, setDoseValue] = useState<number | "">("");
  const [doseUnit, setDoseUnit] = useState<string>("cl");

  /* ── Data loading ──────────────────────────────────────── */

  const loadProducts = useCallback(async () => {
    const res = await fetch("/api/popina-catalogue");
    const data = await res.json();
    setProducts(Array.isArray(data) ? data : []);
  }, []);

  const loadRecipes = useCallback(async () => {
    const res = await fetch("/api/popina-catalogue/recipes");
    const data = await res.json();
    setRecipes(Array.isArray(data) ? data : []);
  }, []);

  const loadDoses = useCallback(async () => {
    const res = await fetch("/api/popina-catalogue/doses");
    const data = await res.json();
    setDoses(Array.isArray(data) ? data : []);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadProducts(), loadRecipes(), loadDoses()]);
    setLoading(false);
  }, [loadProducts, loadRecipes, loadDoses]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadAll(); }, [loadAll]);

  /** Reload en arrière-plan (pas de loading spinner) */
  const refreshSilent = useCallback(async () => {
    await Promise.all([loadProducts(), loadRecipes(), loadDoses()]);
  }, [loadProducts, loadRecipes, loadDoses]);

  async function syncCatalog() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/popina-catalogue/sync", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setSyncResult(`${data.upserted} produits synchronisés, ${data.deactivated} désactivés`);
        refreshSilent();
      } else {
        setSyncResult(`Erreur : ${data.error}`);
      }
    } catch (e) {
      setSyncResult(`Erreur réseau : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncing(false);
    }
  }

  /* ── Popina → Recipe linking ───────────────────────────── */

  async function doSearch() {
    if (!searchQ.trim()) return;
    setSearching(true);
    const res = await fetch("/api/popina-catalogue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: linkType, q: searchQ.trim() }),
    });
    setSearchResults(await res.json());
    setSearching(false);
  }

  async function linkProduct(linkedId: string) {
    if (!editing) return;
    const linkedName = searchResults.find((r) => r.id === linkedId)?.name ?? null;
    const editingId = editing.id;
    setSaving(true);

    // For ingredients with a dose → use dose_map
    if (linkType === "ingredient" && doseValue) {
      await fetch("/api/popina-catalogue/doses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          popina_product_id: editingId,
          ingredient_id: linkedId,
          dose: doseValue,
          dose_unit: doseUnit,
        }),
      });
      // Also set the simple link for display
      await fetch("/api/popina-catalogue", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ popina_product_id: editingId, linked_type: "ingredient", linked_id: linkedId }),
      });
    } else {
      await fetch("/api/popina-catalogue", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ popina_product_id: editingId, linked_type: linkType, linked_id: linkedId }),
      });
    }

    // Update local state
    setProducts((prev) => prev.map((p) =>
      p.id === editingId ? { ...p, linked_type: linkType, linked_name: linkedName } : p
    ));
    setRecipes((prev) => prev.map((r) =>
      r.id === linkedId && r.type === linkType
        ? { ...r, popina_product_id: editingId, popina_product_name: editing.name, popina_price: editing.price_ttc }
        : r
    ));
    if (linkType === "ingredient" && doseValue) {
      setDoses((prev) => [...prev, {
        id: "temp-" + Date.now(),
        dose: Number(doseValue), dose_unit: doseUnit,
        popina_product_id: editingId, ingredient_id: linkedId,
        popina_products: { id: editingId, name: editing.name, category: editing.category, price_ttc: editing.price_ttc },
        ingredients: { id: linkedId, name: linkedName ?? "", category: null },
      }]);
    }
    setSaving(false);
    setEditing(null);
    setSearchResults([]);
    setSearchQ("");
    setDoseValue("");
  }

  /* ── Recipe → Popina linking (reverse) ─────────────────── */

  function openReverseModal(recipe: RecipeItem) {
    setEditingRecipe(recipe);
    setSearchPopina(recipe.name);
    setPopinaResults([]);
  }

  function searchPopinaProducts() {
    const q = searchPopina.toLowerCase().trim();
    if (!q) { setPopinaResults([]); return; }
    const unlinked = products.filter((p) => !p.linked_type);
    const results = unlinked.filter((p) => p.name.toLowerCase().includes(q));
    setPopinaResults(results.slice(0, 20));
  }

  async function linkFromRecipe(popinaProduct: PopinaProduct) {
    if (!editingRecipe) return;
    const recipeId = editingRecipe.id;
    const recipeType = editingRecipe.type;
    setSaving(true);
    await fetch("/api/popina-catalogue", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        popina_product_id: popinaProduct.id,
        linked_type: recipeType,
        linked_id: recipeId,
      }),
    });
    // Update local state
    setProducts((prev) => prev.map((p) =>
      p.id === popinaProduct.id ? { ...p, linked_type: recipeType, linked_name: editingRecipe.name } : p
    ));
    setRecipes((prev) => prev.map((r) =>
      r.id === recipeId && r.type === recipeType
        ? { ...r, popina_product_id: popinaProduct.id, popina_product_name: popinaProduct.name, popina_price: popinaProduct.price_ttc }
        : r
    ));
    setSaving(false);
    setEditingRecipe(null);
    setSearchPopina("");
    setPopinaResults([]);
  }

  /* ── Unlink ────────────────────────────────────────────── */

  async function unlinkProduct(popinaProductId: string) {
    // Find the recipe/ingredient that was linked before clearing
    const product = products.find((p) => p.id === popinaProductId);
    await fetch("/api/popina-catalogue", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ popina_product_id: popinaProductId }),
    });
    // Update local state
    setProducts((prev) => prev.map((p) =>
      p.id === popinaProductId ? { ...p, linked_type: null, linked_name: null } : p
    ));
    if (product?.linked_type) {
      setRecipes((prev) => prev.map((r) =>
        r.popina_product_id === popinaProductId
          ? { ...r, popina_product_id: null, popina_product_name: null, popina_price: null }
          : r
      ));
    }
  }

  /* ── Open Popina modal ─────────────────────────────────── */

  function openPopinaModal(product: PopinaProduct) {
    setEditing(product);
    setSearchQ(product.name);
    setSearchResults([]);
    if (product.category === "PIZZE") setLinkType("pizza");
    else if (["CUCINA", "ANTIPASTI", "DOLCI"].includes(product.category)) setLinkType("kitchen");
    else if (product.category === "ALCOOL") setLinkType("cocktail");
    else setLinkType("ingredient");
  }

  /* ── Filtered lists ────────────────────────────────────── */

  const filteredProducts = products.filter((p) => {
    if (filterCat !== "ALL" && p.category !== filterCat) return false;
    if (filterLinked === "LINKED" && !p.linked_type) return false;
    if (filterLinked === "UNLINKED" && p.linked_type) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const filteredRecipes = recipes.filter((r) => {
    if (filterType !== "ALL" && r.type !== filterType) return false;
    if (filterRecipeLinked === "LINKED" && !r.popina_product_id) return false;
    if (filterRecipeLinked === "UNLINKED" && r.popina_product_id) return false;
    if (searchRecipe && !r.name.toLowerCase().includes(searchRecipe.toLowerCase())) return false;
    return true;
  });

  const stats = {
    totalPopina: products.length,
    linked: products.filter((p) => p.linked_type).length,
    totalRecipes: recipes.length,
    recipesLinked: recipes.filter((r) => r.popina_product_id).length,
  };

  /* ── Render ────────────────────────────────────────────── */

  return (
    <>
      <NavBar backHref="/achats" backLabel="Achats" />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 40px", boxSizing: "border-box" }}>

        {/* Header */}
        <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: "#D4775A", textTransform: "uppercase", margin: "0 0 6px" }}>
              ACHATS
            </p>
            <h1 style={{ fontSize: 24, color: "#1a1a1a", margin: 0, fontFamily: "'Oswald', sans-serif" }}>
              Catalogue Popina
            </h1>
          </div>
          <button
            onClick={syncCatalog}
            disabled={syncing}
            style={{
              padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: syncing ? "#ccc" : "#D4775A", color: "#fff",
              border: "none", cursor: syncing ? "default" : "pointer",
              whiteSpace: "nowrap", marginTop: 16,
            }}
          >
            {syncing ? "Sync en cours..." : "Sync Popina"}
          </button>
        </div>
        {syncResult && (
          <div style={{
            padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13,
            background: syncResult.startsWith("Erreur") ? "#FEF2F2" : "#E8F5E9",
            color: syncResult.startsWith("Erreur") ? "#B91C1C" : "#2D6A4F",
          }}>
            {syncResult}
          </div>
        )}

        {/* View toggle */}
        <div style={{ display: "flex", gap: 0, marginBottom: 20, borderRadius: 10, overflow: "hidden", border: "1px solid #ddd6c8" }}>
          {([["popina", "Produits Popina"], ["recettes", "Recettes & Ingrédients"]] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              style={{
                flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 700,
                border: "none", cursor: "pointer",
                background: view === key ? "#D4775A" : "#fff",
                color: view === key ? "#fff" : "#666",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
          {[
            { label: "Produits Popina", value: stats.totalPopina, color: "#1a1a1a" },
            { label: "Reliés", value: stats.linked, color: "#2D6A4F" },
            { label: "Recettes/Ingrédients", value: stats.totalRecipes, color: "#1a1a1a" },
            { label: "Avec produit", value: stats.recipesLinked, color: "#2D6A4F" },
          ].map((s) => (
            <div key={s.label} style={{
              padding: 12, borderRadius: 10, border: "1px solid #e5ddd0",
              background: "#fff", textAlign: "center",
            }}>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Oswald', sans-serif", color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: "#999", padding: 40 }}>Chargement...</p>
        ) : view === "popina" ? (
          /* ══════════ VUE POPINA ══════════ */
          <>
            {/* Filters */}
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              <input
                type="text" placeholder="Rechercher un produit Popina..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                style={{ flex: 1, minWidth: 180, padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 13, outline: "none" }}
              />
              <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 13 }}>
                <option value="ALL">Toutes catégories</option>
                {POPINA_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filterLinked} onChange={(e) => setFilterLinked(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 13 }}>
                <option value="ALL">Tous</option>
                <option value="LINKED">Reliés</option>
                <option value="UNLINKED">Non reliés</option>
              </select>
            </div>

            {/* Category pills */}
            <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
              {POPINA_CATEGORIES.map((cat) => {
                const count = products.filter((p) => p.category === cat).length;
                const linked = products.filter((p) => p.category === cat && p.linked_type).length;
                const col = CAT_COLORS[cat] ?? { bg: "#eee", fg: "#666" };
                return (
                  <button key={cat} onClick={() => setFilterCat(filterCat === cat ? "ALL" : cat)} style={{
                    padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer",
                    border: filterCat === cat ? `2px solid ${col.fg}` : "1px solid transparent",
                    background: col.bg, color: col.fg,
                  }}>
                    {cat} ({linked}/{count})
                  </button>
                );
              })}
            </div>

            {/* Product list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {filteredProducts.map((p) => {
                const col = CAT_COLORS[p.category] ?? { bg: "#eee", fg: "#666" };
                return (
                  <div key={p.id} onClick={() => !p.linked_type && openPopinaModal(p)} style={{
                    display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8,
                    padding: "10px 14px", borderRadius: 10, border: "1px solid #e5ddd0",
                    background: "#fff", cursor: p.linked_type ? "default" : "pointer",
                  }}>
                    <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 9, fontWeight: 700, background: col.bg, color: col.fg, minWidth: 60, textAlign: "center" }}>
                      {p.category}
                    </span>
                    <div style={{ flex: 1, minWidth: 100 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>{p.name}</div>
                      {p.sub_category && <div style={{ fontSize: 11, color: "#999" }}>{p.sub_category}</div>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Oswald', sans-serif", color: "#1a1a1a" }}>
                        {p.price_ttc > 0 ? `${p.price_ttc.toFixed(0)} €` : "—"}
                      </div>
                      {p.linked_type ? (
                        <LinkedBadge product={p} doses={doses} onUnlink={unlinkProduct} />
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); openPopinaModal(p); }} style={{
                          padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                          background: "#f9f6f0", color: "#D4775A", border: "1px solid #D4775A", cursor: "pointer",
                        }}>
                          Relier
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {filteredProducts.length === 0 && <p style={{ textAlign: "center", color: "#999", padding: 40 }}>Aucun produit</p>}
            </div>
          </>
        ) : (
          /* ══════════ VUE RECETTES & INGRÉDIENTS ══════════ */
          <>
            {/* Filters */}
            <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
              <input
                type="text" placeholder="Rechercher une recette ou ingrédient..."
                value={searchRecipe} onChange={(e) => setSearchRecipe(e.target.value)}
                style={{ flex: 1, minWidth: 180, padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 13, outline: "none" }}
              />
              <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 13 }}>
                <option value="ALL">Tous types</option>
                <option value="pizza">Pizzas</option>
                <option value="kitchen">Recettes cuisine</option>
                <option value="cocktail">Cocktails</option>
                <option value="ingredient">Ingrédients</option>
              </select>
              <select value={filterRecipeLinked} onChange={(e) => setFilterRecipeLinked(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 13 }}>
                <option value="ALL">Tous</option>
                <option value="LINKED">Avec produit Popina</option>
                <option value="UNLINKED">Sans produit Popina</option>
              </select>
            </div>

            {/* Type pills */}
            <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
              {(["pizza", "kitchen", "cocktail", "ingredient"] as const).map((type) => {
                const count = recipes.filter((r) => r.type === type).length;
                const linked = recipes.filter((r) => r.type === type && r.popina_product_id).length;
                const col = TYPE_COLORS[type];
                return (
                  <button key={type} onClick={() => setFilterType(filterType === type ? "ALL" : type)} style={{
                    padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer",
                    border: filterType === type ? `2px solid ${col.fg}` : "1px solid transparent",
                    background: col.bg, color: col.fg,
                  }}>
                    {col.label} ({linked}/{count})
                  </button>
                );
              })}
            </div>

            {/* Recipe list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {filteredRecipes.map((r) => {
                const col = TYPE_COLORS[r.type];
                return (
                  <div key={`${r.type}-${r.id}`} onClick={() => !r.popina_product_id && openReverseModal(r)} style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px", borderRadius: 10, border: "1px solid #e5ddd0",
                    background: "#fff", cursor: r.popina_product_id ? "default" : "pointer",
                  }}>
                    <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 9, fontWeight: 700, background: col.bg, color: col.fg, minWidth: 60, textAlign: "center" }}>
                      {col.label}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>{r.name}</div>
                      {r.category && <div style={{ fontSize: 11, color: "#999" }}>{r.category}</div>}
                    </div>
                    {r.popina_product_id ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ padding: "4px 10px", borderRadius: 8, fontSize: 11, background: "#E8F5E9", color: "#2D6A4F", fontWeight: 600, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.popina_product_name} · {r.popina_price != null && r.popina_price > 0 ? `${r.popina_price.toFixed(0)} €` : "—"}
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); unlinkProduct(r.popina_product_id!); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#999", padding: 2 }} title="Délier">×</button>
                      </div>
                    ) : (
                      <button onClick={(e) => { e.stopPropagation(); openReverseModal(r); }} style={{
                        padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                        background: "#f9f6f0", color: "#D4775A", border: "1px solid #D4775A", cursor: "pointer",
                      }}>
                        Relier
                      </button>
                    )}
                  </div>
                );
              })}
              {filteredRecipes.length === 0 && <p style={{ textAlign: "center", color: "#999", padding: 40 }}>Aucun résultat</p>}
            </div>
          </>
        )}
      </main>

      {/* ══════════ MODAL: Popina → Recette ══════════ */}
      {editing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }} onClick={() => setEditing(null)}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 480, maxHeight: "80vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, fontFamily: "'Oswald', sans-serif", margin: "0 0 4px", color: "#1a1a1a" }}>Relier un produit Popina</h2>
            <p style={{ fontSize: 13, color: "#666", margin: "0 0 20px" }}>{editing.name} — {editing.price_ttc} € TTC</p>

            <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
              {TYPE_OPTIONS.map((opt) => (
                <button key={opt.value} onClick={() => { setLinkType(opt.value); setSearchResults([]); }} style={{
                  padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
                  border: linkType === opt.value ? "2px solid #D4775A" : "1px solid #ddd6c8",
                  background: linkType === opt.value ? "#FFF5F0" : "#fff",
                  color: linkType === opt.value ? "#D4775A" : "#666",
                }}>
                  {opt.label}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <input type="text" value={searchQ} onChange={(e) => setSearchQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doSearch()}
                placeholder={`Chercher ${TYPE_OPTIONS.find((o) => o.value === linkType)?.label ?? ""}...`}
                style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd6c8", fontSize: 14, outline: "none" }} autoFocus />
              <button onClick={doSearch} disabled={searching} style={{
                padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700,
                background: "#D4775A", color: "#fff", border: "none", cursor: "pointer", opacity: searching ? 0.6 : 1,
              }}>
                {searching ? "..." : "Chercher"}
              </button>
            </div>

            {/* Dose field for ingredients */}
            {linkType === "ingredient" && searchResults.length > 0 && (
              <div style={{
                display: "flex", gap: 8, alignItems: "center", marginBottom: 12,
                padding: 12, borderRadius: 8, background: "#FFF8F0", border: "1px solid #f0e0c8",
              }}>
                <span style={{ fontSize: 12, color: "#666", whiteSpace: "nowrap" }}>Dose par vente :</span>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={doseValue}
                  onChange={(e) => setDoseValue(e.target.value ? Number(e.target.value) : "")}
                  placeholder="12.5"
                  style={{ width: 70, padding: "6px 8px", borderRadius: 6, border: "1px solid #ddd6c8", fontSize: 14, textAlign: "center" }}
                />
                <select value={doseUnit} onChange={(e) => setDoseUnit(e.target.value)}
                  style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #ddd6c8", fontSize: 13 }}>
                  <option value="cl">cl</option>
                  <option value="g">g</option>
                  <option value="pcs">pcs</option>
                </select>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {searchResults.map((r) => {
                const existingDoses = doses.filter((d) => d.ingredient_id === r.id);
                return (
                  <div key={r.id}>
                    <button onClick={() => linkProduct(r.id)} disabled={saving || (linkType === "ingredient" && !doseValue)} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                      padding: "10px 14px", borderRadius: 8, border: "1px solid #e5ddd0", background: "#f9f6f0",
                      cursor: (linkType === "ingredient" && !doseValue) ? "not-allowed" : "pointer",
                      textAlign: "left", fontSize: 13, opacity: saving ? 0.6 : (linkType === "ingredient" && !doseValue) ? 0.5 : 1,
                    }}>
                      <span style={{ fontWeight: 600, color: "#1a1a1a" }}>{r.name}</span>
                      <span style={{ fontSize: 11, color: "#D4775A", fontWeight: 700 }}>
                        {linkType === "ingredient" && doseValue ? `${doseValue} ${doseUnit}` : "Relier"}
                      </span>
                    </button>
                    {existingDoses.length > 0 && (
                      <div style={{ paddingLeft: 14, marginTop: 2, marginBottom: 4 }}>
                        {existingDoses.map((d) => (
                          <span key={d.id} style={{ fontSize: 10, color: "#999", marginRight: 8 }}>
                            Déjà relié : {d.popina_products?.name} → {d.dose} {d.dose_unit}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button onClick={() => setEditing(null)} style={{ marginTop: 20, width: "100%", padding: "10px 0", borderRadius: 10, fontSize: 13, fontWeight: 600, background: "#f5f0e8", color: "#666", border: "none", cursor: "pointer" }}>Fermer</button>
          </div>
        </div>
      )}

      {/* ══════════ MODAL: Recette → Popina (reverse) ══════════ */}
      {editingRecipe && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }} onClick={() => setEditingRecipe(null)}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 480, maxHeight: "80vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 18, fontFamily: "'Oswald', sans-serif", margin: "0 0 4px", color: "#1a1a1a" }}>Trouver le produit Popina</h2>
            <p style={{ fontSize: 13, color: "#666", margin: "0 0 4px" }}>
              <span style={{ padding: "2px 8px", borderRadius: 6, fontSize: 10, fontWeight: 700, background: TYPE_COLORS[editingRecipe.type].bg, color: TYPE_COLORS[editingRecipe.type].fg }}>
                {TYPE_COLORS[editingRecipe.type].label}
              </span>
              {" "}{editingRecipe.name}
            </p>
            <p style={{ fontSize: 12, color: "#999", margin: "0 0 20px" }}>Chercher parmi les produits Popina non reliés</p>

            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <input type="text" value={searchPopina} onChange={(e) => setSearchPopina(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchPopinaProducts()}
                placeholder="Chercher un produit Popina..."
                style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd6c8", fontSize: 14, outline: "none" }} autoFocus />
              <button onClick={searchPopinaProducts} style={{
                padding: "10px 18px", borderRadius: 10, fontSize: 13, fontWeight: 700,
                background: "#D4775A", color: "#fff", border: "none", cursor: "pointer",
              }}>
                Chercher
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {popinaResults.map((p) => {
                const col = CAT_COLORS[p.category] ?? { bg: "#eee", fg: "#666" };
                return (
                  <button key={p.id} onClick={() => linkFromRecipe(p)} disabled={saving} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                    padding: "10px 14px", borderRadius: 8, border: "1px solid #e5ddd0", background: "#f9f6f0",
                    cursor: "pointer", textAlign: "left", fontSize: 13, opacity: saving ? 0.6 : 1,
                  }}>
                    <span style={{ padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700, background: col.bg, color: col.fg }}>{p.category}</span>
                    <span style={{ flex: 1, fontWeight: 600, color: "#1a1a1a" }}>{p.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "'Oswald', sans-serif" }}>{p.price_ttc > 0 ? `${p.price_ttc.toFixed(0)} €` : ""}</span>
                    <span style={{ fontSize: 11, color: "#D4775A", fontWeight: 700 }}>Relier</span>
                  </button>
                );
              })}
              {popinaResults.length === 0 && searchPopina && (
                <p style={{ fontSize: 12, color: "#999", textAlign: "center", padding: 20 }}>Tapez un nom et cliquez Chercher</p>
              )}
            </div>

            <button onClick={() => setEditingRecipe(null)} style={{ marginTop: 20, width: "100%", padding: "10px 0", borderRadius: 10, fontSize: 13, fontWeight: 600, background: "#f5f0e8", color: "#666", border: "none", cursor: "pointer" }}>Fermer</button>
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
