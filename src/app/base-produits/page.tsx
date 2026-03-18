"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { CAT_LABELS, CAT_COLORS, type Category, type Ingredient } from "@/types/ingredients";

type SupplierMap = Record<string, string>;

export default function BaseProduitsPage() {
  const router = useRouter();
  const { current } = useEtablissement();

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierMap>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");

  useEffect(() => {
    (async () => {
      setLoading(true);

      // Fetch ingredients
      let q = supabase
        .from("ingredients")
        .select("*")
        .order("name");

      if (current?.id) {
        q = q.or(`etablissement_id.eq.${current.id},etablissement_id.is.null`);
      }

      const { data: ingData } = await q;
      const items = (ingData ?? []) as Ingredient[];
      setIngredients(items);

      // Fetch suppliers
      const { data: supData } = await supabase
        .from("suppliers")
        .select("id, name");

      const map: SupplierMap = {};
      for (const s of supData ?? []) {
        map[s.id] = s.name;
      }
      setSuppliers(map);

      setLoading(false);
    })();
  }, [current?.id]);

  // Derive categories from data
  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const ing of ingredients) {
      if (ing.category) cats.add(ing.category);
    }
    return Array.from(cats).sort();
  }, [ingredients]);

  // Filter
  const filtered = useMemo(() => {
    let list = ingredients;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(i => i.name.toLowerCase().includes(q));
    }
    if (catFilter !== "all") {
      list = list.filter(i => i.category === catFilter);
    }
    return list;
  }, [ingredients, search, catFilter]);

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 40px" }}>
        <h1 style={titleStyle}>Base produits</h1>

        {/* Search */}
        <input
          type="text"
          placeholder="Rechercher un produit..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={searchStyle}
        />

        {/* Category pills */}
        <div style={pillsRow}>
          <button
            type="button"
            onClick={() => setCatFilter("all")}
            style={catFilter === "all" ? pillActive : pill}
          >
            Tous
          </button>
          {categories.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setCatFilter(cat)}
              style={catFilter === cat ? pillActive : pill}
            >
              {CAT_LABELS[cat as Category] ?? cat}
            </button>
          ))}
        </div>

        {/* Count */}
        <p style={countStyle}>
          {loading ? "Chargement..." : `${filtered.length} produit${filtered.length !== 1 ? "s" : ""}`}
        </p>

        {/* Table */}
        {!loading && (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Nom</th>
                  <th style={{ ...thStyle, minWidth: 120 }}>Categorie</th>
                  <th style={{ ...thStyle, minWidth: 100 }}>Fournisseur</th>
                  <th style={{ ...thStyle, textAlign: "right", minWidth: 90 }}>Prix unitaire</th>
                  <th style={{ ...thStyle, minWidth: 60 }}>Unite</th>
                  <th style={{ ...thStyle, textAlign: "center", minWidth: 60 }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(ing => {
                  const catColor = CAT_COLORS[ing.category as Category] ?? "#6B7280";
                  const isActive = ing.is_active !== false;
                  return (
                    <tr
                      key={ing.id}
                      onClick={() => router.push(`/ingredients/${ing.id}`)}
                      style={{ cursor: "pointer" }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLTableRowElement).style.background = "#f5f0e8";
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLTableRowElement).style.background = "transparent";
                      }}
                    >
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 600, color: "#1a1a1a", fontSize: 14 }}>
                          {ing.name}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 8,
                          fontSize: 11,
                          fontWeight: 600,
                          color: catColor,
                          background: catColor + "18",
                        }}>
                          {CAT_LABELS[ing.category as Category] ?? ing.category}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: "#666", fontSize: 13 }}>
                        {ing.supplier_id ? (suppliers[ing.supplier_id] ?? "-") : "-"}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 13 }}>
                        {ing.cost_per_unit != null
                          ? `${ing.cost_per_unit.toFixed(2)} \u20AC`
                          : "-"}
                      </td>
                      <td style={{ ...tdStyle, color: "#666", fontSize: 13 }}>
                        {ing.purchase_unit_label ?? ing.default_unit ?? "-"}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <span style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 8,
                          fontSize: 11,
                          fontWeight: 600,
                          color: isActive ? "#16A34A" : "#999",
                          background: isActive ? "#16A34A18" : "#99999918",
                        }}>
                          {isActive ? "Actif" : "Inactif"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "#999", padding: "32px 16px" }}>
                      Aucun produit trouve
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </RequireRole>
  );
}

// ── Styles ──────────────────────────────────────────────────

const titleStyle: React.CSSProperties = {
  fontFamily: "Oswald, sans-serif",
  fontWeight: 700,
  fontSize: 22,
  color: "#1a1a1a",
  margin: "0 0 20px",
};

const searchStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 10,
  border: "1px solid #ddd6c8",
  padding: "0 14px",
  fontSize: 14,
  background: "#fff",
  outline: "none",
  marginBottom: 14,
  boxSizing: "border-box",
};

const pillsRow: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  marginBottom: 16,
};

const pill: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 20,
  border: "1px solid #ddd6c8",
  background: "#fff",
  fontSize: 12,
  fontWeight: 600,
  color: "#1a1a1a",
  cursor: "pointer",
};

const pillActive: React.CSSProperties = {
  ...pill,
  border: "1px solid #e27f57",
  background: "#e27f5712",
  color: "#e27f57",
};

const countStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#999",
  marginBottom: 12,
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 11,
  fontWeight: 700,
  color: "#999",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  borderBottom: "1.5px solid #ddd6c8",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #f0ebe2",
  verticalAlign: "middle",
};
