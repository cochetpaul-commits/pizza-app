"use client";

import { useCallback, useEffect, useState } from "react";
import { NavBar } from "@/components/NavBar";

type Fiche = {
  id: string;
  type: "pizza" | "cuisine" | "cocktail";
  name: string;
  category: string;
  description_courte: string | null;
  wine_pairing: string | null;
  photo_url: string | null;
  price_ttc: number | null;
  allergens: string[];
  ingredients: { name: string; qty: number | null; unit: string | null }[];
  sub_recipes: { name: string; ingredients: string[] }[];
};

const CAT_LABELS: Record<string, string> = {
  pizza: "Pizze", entree: "Antipasti", plat_cuisine: "Piatti",
  dessert: "Dolci", accompagnement: "Contorni", cocktail: "Cocktails",
};

const CAT_COLORS: Record<string, { bg: string; fg: string }> = {
  pizza: { bg: "#FDEBD0", fg: "#A0522D" },
  entree: { bg: "#FAD7A0", fg: "#8B6914" },
  plat_cuisine: { bg: "#D4EFDF", fg: "#1B7A3D" },
  dessert: { bg: "#F5CBA7", fg: "#A0522D" },
  accompagnement: { bg: "#D1F2EB", fg: "#117A65" },
  cocktail: { bg: "#FADBD8", fg: "#922B21" },
};

const ALLERGEN_ICONS: Record<string, string> = {
  Gluten: "G", Crustacés: "Cr", Œufs: "Oe", Poisson: "Po",
  Arachides: "Ar", Soja: "So", Lait: "La", "Fruits à coque": "Fc",
  Céleri: "Ce", Moutarde: "Mo", Sésame: "Sé", Sulfites: "Su",
  Lupin: "Lu", Mollusques: "Ml",
};

function FichesPage() {
  const [fiches, setFiches] = useState<Fiche[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("ALL");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/catalogue/fiches");
    const data = await res.json();
    setFiches(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const categories = [...new Set(fiches.map((f) => f.category))];

  const filtered = fiches.filter((f) => {
    if (filterCat !== "ALL" && f.category !== filterCat) return false;
    if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Group by category
  const grouped = new Map<string, Fiche[]>();
  for (const f of filtered) {
    const arr = grouped.get(f.category) ?? [];
    arr.push(f);
    grouped.set(f.category, arr);
  }

  return (
    <>
      <NavBar backHref="/catalogue" backLabel="Catalogue" />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 40px", boxSizing: "border-box" }}>

        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: "#D4775A", textTransform: "uppercase", margin: "0 0 6px" }}>
            CATALOGUE ÉQUIPE
          </p>
          <h1 style={{ fontSize: 24, color: "#1a1a1a", margin: 0, fontFamily: "'Oswald', sans-serif" }}>
            Fiches Techniques
          </h1>
          <p style={{ fontSize: 13, color: "#666", margin: "8px 0 0" }}>
            {fiches.length} fiches — plats, pizzas, cocktails avec allergènes et accords
          </p>
        </div>

        {/* Search + filters */}
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <input
            type="text" placeholder="Rechercher..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 180, padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 13, outline: "none" }}
          />
        </div>

        {/* Category pills */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
          <button onClick={() => setFilterCat("ALL")} style={{
            padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer",
            border: filterCat === "ALL" ? "2px solid #D4775A" : "1px solid #ddd6c8",
            background: filterCat === "ALL" ? "#FFF5F0" : "#fff", color: filterCat === "ALL" ? "#D4775A" : "#666",
          }}>
            Tout ({fiches.length})
          </button>
          {categories.map((cat) => {
            const col = CAT_COLORS[cat] ?? { bg: "#eee", fg: "#666" };
            const count = fiches.filter((f) => f.category === cat).length;
            return (
              <button key={cat} onClick={() => setFilterCat(filterCat === cat ? "ALL" : cat)} style={{
                padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: "pointer",
                border: filterCat === cat ? `2px solid ${col.fg}` : "1px solid transparent",
                background: col.bg, color: col.fg,
              }}>
                {CAT_LABELS[cat] ?? cat} ({count})
              </button>
            );
          })}
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: "#999", padding: 40 }}>Chargement...</p>
        ) : (
          [...grouped.entries()].map(([cat, items]) => (
            <div key={cat} style={{ marginBottom: 28 }}>
              <h2 style={{
                fontSize: 16, fontFamily: "'Oswald', sans-serif", color: CAT_COLORS[cat]?.fg ?? "#1a1a1a",
                margin: "0 0 12px", paddingBottom: 6, borderBottom: `2px solid ${CAT_COLORS[cat]?.bg ?? "#eee"}`,
              }}>
                {CAT_LABELS[cat] ?? cat}
              </h2>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {items.map((f) => {
                  const isOpen = expanded === f.id;
                  return (
                    <div key={f.id} style={{
                      borderRadius: 12, border: "1px solid #e5ddd0", background: "#fff",
                      overflow: "hidden", cursor: "pointer",
                    }} onClick={() => setExpanded(isOpen ? null : f.id)}>

                      {/* Card header */}
                      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}>
                        {/* Photo */}
                        {f.photo_url ? (
                          <img src={f.photo_url} alt={f.name} style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover" }} />
                        ) : (
                          <div style={{ width: 56, height: 56, borderRadius: 10, background: CAT_COLORS[f.category]?.bg ?? "#f0ebe0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ fontSize: 22 }}>
                              {f.type === "pizza" ? "🍕" : f.type === "cocktail" ? "🍸" : "🍽"}
                            </span>
                          </div>
                        )}

                        {/* Name + description */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>{f.name}</div>
                          {f.description_courte && (
                            <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{f.description_courte}</div>
                          )}
                          {/* Allergen badges inline */}
                          {f.allergens.length > 0 && (
                            <div style={{ display: "flex", gap: 3, marginTop: 4, flexWrap: "wrap" }}>
                              {f.allergens.map((a) => (
                                <span key={a} title={a} style={{
                                  padding: "1px 5px", borderRadius: 4, fontSize: 9, fontWeight: 700,
                                  background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FECACA",
                                }}>
                                  {ALLERGEN_ICONS[a] ?? a}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Price */}
                        {f.price_ttc != null && f.price_ttc > 0 && (
                          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Oswald', sans-serif", color: "#1a1a1a" }}>
                            {f.price_ttc.toFixed(0)} €
                          </div>
                        )}

                        {/* Expand arrow */}
                        <span style={{ fontSize: 14, color: "#999", transition: "transform 0.2s", transform: isOpen ? "rotate(180deg)" : "rotate(0)" }}>
                          ▼
                        </span>
                      </div>

                      {/* Expanded details */}
                      {isOpen && (
                        <div style={{ padding: "0 14px 14px", borderTop: "1px solid #f0ebe0" }}>

                          {/* Ingredients */}
                          <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                              Composition
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {f.ingredients.map((ing, i) => (
                                <span key={i} style={{
                                  padding: "3px 8px", borderRadius: 6, fontSize: 11,
                                  background: "#f9f6f0", color: "#1a1a1a", border: "1px solid #e5ddd0",
                                }}>
                                  {ing.name}
                                  {ing.qty != null && <span style={{ color: "#999" }}> {ing.qty}{ing.unit}</span>}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Sub-recipes */}
                          {f.sub_recipes.length > 0 && (
                            <div style={{ marginTop: 12 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                                Préparations & Sauces
                              </div>
                              {f.sub_recipes.map((sr, i) => (
                                <div key={i} style={{ marginBottom: 6 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: "#D4775A" }}>{sr.name}</div>
                                  <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
                                    {sr.ingredients.join(", ")}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Allergens detail */}
                          {f.allergens.length > 0 && (
                            <div style={{ marginTop: 12 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                                Allergènes
                              </div>
                              <div style={{ fontSize: 12, color: "#B91C1C" }}>
                                {f.allergens.join(" · ")}
                              </div>
                            </div>
                          )}

                          {/* Wine pairing */}
                          {f.wine_pairing && (
                            <div style={{ marginTop: 12 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                                Accord Mets & Vins
                              </div>
                              <div style={{ fontSize: 12, color: "#6C3483", fontStyle: "italic" }}>
                                🍷 {f.wine_pairing}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}

        {filtered.length === 0 && !loading && (
          <p style={{ textAlign: "center", color: "#999", padding: 40 }}>Aucune fiche trouvée</p>
        )}
      </main>
    </>
  );
}

export default function CatalogueFichesPage() {
  return <FichesPage />;
}
