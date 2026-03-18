"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { CAT_LABELS, type Category, type Ingredient } from "@/types/ingredients";

// ── Zone definitions ──────────────────────────────────────

type Zone = { id: string; nom: string };

const DEFAULT_ZONES: Zone[] = [
  { id: "frigo", nom: "Frigo" },
  { id: "cave", nom: "Cave" },
  { id: "sec", nom: "Sec" },
  { id: "congel", nom: "Congelateur" },
];

// Map ingredient category → zone
function categoryToZone(cat: string | null): string {
  if (!cat) return "sec";
  switch (cat) {
    case "cremerie_fromage":
    case "charcuterie_viande":
    case "maree":
    case "legumes_herbes":
    case "fruit":
    case "sauce":
    case "antipasti":
      return "frigo";
    case "alcool_spiritueux":
    case "boisson":
      return "cave";
    case "epicerie_salee":
    case "epicerie_sucree":
    case "emballage":
    case "preparation":
    case "autre":
      return "sec";
    default:
      return "sec";
  }
}

export default function InventairePage() {
  const { current } = useEtablissement();

  const [zones, setZones] = useState<Zone[]>(DEFAULT_ZONES);
  const [activeZone, setActiveZone] = useState("frigo");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [quantities, setQuantities] = useState<Record<string, number | "">>({});

  // Try loading zones from DB, fallback to defaults
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("zones_inventaire")
        .select("id, nom")
        .order("nom");
      if (!error && data && data.length > 0) {
        setZones(data as Zone[]);
      }
    })();
  }, []);

  // Load ingredients
  useEffect(() => {
    (async () => {
      setLoading(true);
      let q = supabase
        .from("ingredients")
        .select("*")
        .eq("is_active", true)
        .order("name");

      if (current?.id) {
        q = q.or(`etablissement_id.eq.${current.id},etablissement_id.is.null`);
      }

      const { data } = await q;
      setIngredients((data ?? []) as Ingredient[]);
      setLoading(false);
    })();
  }, [current?.id]);

  // Filter ingredients by active zone
  const zoneIngredients = useMemo(() => {
    return ingredients.filter(ing => categoryToZone(ing.category) === activeZone);
  }, [ingredients, activeZone]);

  // Handle quantity changes
  const handleQtyChange = useCallback((id: string, val: string) => {
    if (val === "") {
      setQuantities(prev => ({ ...prev, [id]: "" }));
    } else {
      const n = parseFloat(val);
      if (!isNaN(n)) {
        setQuantities(prev => ({ ...prev, [id]: n }));
      }
    }
  }, []);

  // Summary
  const summary = useMemo(() => {
    let totalArticles = 0;
    let totalValue = 0;
    for (const ing of zoneIngredients) {
      totalArticles++;
      const qty = quantities[ing.id];
      if (typeof qty === "number" && qty > 0 && ing.cost_per_unit != null) {
        totalValue += qty * ing.cost_per_unit;
      }
    }
    return { totalArticles, totalValue };
  }, [zoneIngredients, quantities]);

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h1 style={titleStyle}>Inventaire</h1>
          <button type="button" style={newBtnStyle}>
            Nouvel inventaire
          </button>
        </div>

        {/* Summary card */}
        <div style={summaryCard}>
          <div style={summaryItem}>
            <span style={summaryLabel}>Articles dans la zone</span>
            <span style={summaryValue}>{summary.totalArticles}</span>
          </div>
          <div style={{ width: 1, background: "#ddd6c8", alignSelf: "stretch" }} />
          <div style={summaryItem}>
            <span style={summaryLabel}>Valeur estimee</span>
            <span style={summaryValue}>
              {summary.totalValue > 0 ? `${summary.totalValue.toFixed(2)} \u20AC` : "-"}
            </span>
          </div>
        </div>

        {/* Zone tabs */}
        <div style={pillsRow}>
          {zones.map(z => (
            <button
              key={z.id}
              type="button"
              onClick={() => setActiveZone(z.id)}
              style={activeZone === z.id ? pillActive : pill}
            >
              {z.nom}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <p style={{ color: "#999", fontSize: 13, textAlign: "center", marginTop: 40 }}>
            Chargement...
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>Article</th>
                  <th style={{ ...thStyle, minWidth: 100 }}>Categorie</th>
                  <th style={{ ...thStyle, textAlign: "right", minWidth: 80 }}>Qte theorique</th>
                  <th style={{ ...thStyle, textAlign: "right", minWidth: 100 }}>Qte reelle</th>
                  <th style={{ ...thStyle, textAlign: "right", minWidth: 70 }}>Ecart</th>
                  <th style={{ ...thStyle, textAlign: "right", minWidth: 80 }}>Valeur</th>
                </tr>
              </thead>
              <tbody>
                {zoneIngredients.map(ing => {
                  const realQty = quantities[ing.id];
                  const realNum = typeof realQty === "number" ? realQty : null;
                  const ecart = realNum != null ? realNum : null; // No theoretical qty yet, so ecart = realQty - 0
                  const valeur = realNum != null && ing.cost_per_unit != null
                    ? realNum * ing.cost_per_unit
                    : null;

                  return (
                    <tr key={ing.id}>
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 600, color: "#1a1a1a", fontSize: 14 }}>
                          {ing.name}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 12, color: "#666" }}>
                          {CAT_LABELS[ing.category as Category] ?? ing.category}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", color: "#999", fontSize: 13 }}>
                        -
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={realQty ?? ""}
                          onChange={e => handleQtyChange(ing.id, e.target.value)}
                          placeholder="0"
                          style={qtyInput}
                        />
                      </td>
                      <td style={{
                        ...tdStyle,
                        textAlign: "right",
                        fontSize: 13,
                        fontWeight: 600,
                        color: ecart != null && ecart < 0 ? "#DC2626" : "#1a1a1a",
                      }}>
                        {ecart != null ? (ecart >= 0 ? `+${ecart}` : ecart) : "-"}
                      </td>
                      <td style={{
                        ...tdStyle,
                        textAlign: "right",
                        fontSize: 13,
                        fontVariantNumeric: "tabular-nums",
                      }}>
                        {valeur != null ? `${valeur.toFixed(2)} \u20AC` : "-"}
                      </td>
                    </tr>
                  );
                })}
                {zoneIngredients.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "#999", padding: "32px 16px" }}>
                      Aucun article dans cette zone
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
  margin: 0,
};

const newBtnStyle: React.CSSProperties = {
  padding: "8px 18px",
  borderRadius: 20,
  border: "none",
  background: "#e27f57",
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const summaryCard: React.CSSProperties = {
  display: "flex",
  gap: 24,
  padding: "16px 20px",
  background: "#fff",
  borderRadius: 10,
  border: "1px solid #ddd6c8",
  marginBottom: 18,
};

const summaryItem: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  flex: 1,
};

const summaryLabel: React.CSSProperties = {
  fontSize: 11,
  color: "#999",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.3,
};

const summaryValue: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  color: "#1a1a1a",
  fontFamily: "Oswald, sans-serif",
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

const qtyInput: React.CSSProperties = {
  width: 70,
  height: 32,
  borderRadius: 8,
  border: "1px solid #ddd6c8",
  padding: "0 8px",
  fontSize: 13,
  textAlign: "right",
  background: "#fff",
  outline: "none",
};
